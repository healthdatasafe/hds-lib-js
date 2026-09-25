/**
 * AppTemplate JSON loader (Plan 45 §5).
 *
 * Validates the template against a precompiled JSON-schema validator, then runs
 * cross-field rules the schema can't express:
 *   1. Sandbox prefix — every customFields[i].streamId starts with `${id}-`
 *   2. No mode-2/mode-3 collision — existingStreamRefs[i].streamId does NOT match `${id}-*`
 *   3. customFields[i].def.templateId === id
 *   4. customFields[i].def.key consistent with streamId suffix
 *   5. section?: customFields[i].def.section references existing section.key
 *   6. customFieldKeys[]: each section.customFieldKeys[i] resolves to a customFields[].def.key
 *
 * Use:
 *   const tpl = loadTemplate(jsonObject);   // synchronous; throws on any failure
 *   const tpl = await loadTemplateFromUrl(url);  // fetches then validates
 */

import { HDSLibError } from '../errors.ts';
import { validate } from './schemas/appTemplate.validator.js';
import type { SchemaValidationError } from './schemas/validatorTypes.ts';
import type { AppTemplate, CustomFieldDeclaration, ExistingStreamRef } from './templateTypes.ts';

// The validator is PRECOMPILED at build time (scripts/build-validators.mjs), not built
// here from the schema. Ajv 8 compiles schemas with `new Function`, which a
// Content-Security-Policy without `unsafe-eval` refuses — and because the old
// `ajv.compile()` ran at module top level, that refusal threw during module-graph init and
// left the consuming app rendering a blank page instead of degrading. B-2026-09-23-1.
//
// So: nothing in `ts/` may import `ajv` (it is a devDependency now), and no schema
// compilation happens at runtime. Edit the schema, then `npm run build:validators`;
// tests/validatorDrift.test.js fails if you forget.

/** Validate the JSON shape and run cross-field rules. Returns the validated AppTemplate or throws HDSLibError. */
export function loadTemplate (json: unknown): AppTemplate {
  if (json == null || typeof json !== 'object') {
    throw new HDSLibError('AppTemplate must be a non-null object', json as any);
  }
  const ok = validate(json);
  if (!ok) {
    throw new HDSLibError(
      'AppTemplate JSON schema validation failed: ' + formatAjvErrors(validate.errors),
      validate.errors as any
    );
  }
  const tpl = json as AppTemplate;
  validateCrossFieldRules(tpl);
  return tpl;
}

/** Fetch JSON from a URL and run loadTemplate. */
export async function loadTemplateFromUrl (url: string): Promise<AppTemplate> {
  const r = await fetch(url);
  if (!r.ok) throw new HDSLibError(`Failed to fetch AppTemplate from ${url}: ${r.status}`);
  const json: unknown = await r.json();
  return loadTemplate(json);
}

function validateCrossFieldRules (tpl: AppTemplate): void {
  const errors: string[] = [];
  const sandboxPrefix = `${tpl.id}-`;
  const sectionKeys = new Set(tpl.sections.map((s) => s.key));
  const customFieldKeysByDef = new Set<string>();

  // Rule 1+3+4: sandbox prefix + def self-identification + key consistency.
  if (tpl.customFields) {
    for (const cf of tpl.customFields) {
      if (!cf.streamId.startsWith(sandboxPrefix)) {
        errors.push(
          `customFields[].streamId "${cf.streamId}" violates sandbox prefix rule (must start with "${sandboxPrefix}")`
        );
      }
      if (cf.def.templateId !== tpl.id) {
        errors.push(
          `customFields[].def.templateId "${cf.def.templateId}" must equal template.id "${tpl.id}" (streamId="${cf.streamId}")`
        );
      }
      if (!cf.streamId.endsWith('-' + cf.def.key) && cf.streamId !== sandboxPrefix + cf.def.key) {
        errors.push(
          `customFields[].streamId "${cf.streamId}" must end with "-${cf.def.key}" to match def.key`
        );
      }
      if (cf.def.section != null && !sectionKeys.has(cf.def.section)) {
        errors.push(
          `customFields[].def.section "${cf.def.section}" does not match any section.key (streamId="${cf.streamId}")`
        );
      }
      customFieldKeysByDef.add(cf.def.key);
    }
  }

  // Rule 2: existingStreamRefs[i].streamId must NOT match the template's sandbox.
  if (tpl.existingStreamRefs) {
    const customStreamIds = new Set((tpl.customFields || []).map((c) => c.streamId));
    for (const ref of tpl.existingStreamRefs) {
      if (ref.streamId.startsWith(sandboxPrefix)) {
        errors.push(
          `existingStreamRefs[].streamId "${ref.streamId}" collides with this template's sandbox prefix "${sandboxPrefix}" — refs are for streams someone else provisioned`
        );
      }
      if (customStreamIds.has(ref.streamId)) {
        errors.push(
          `existingStreamRefs[].streamId "${ref.streamId}" is also declared in customFields[] — choose mode-2 OR mode-3, not both`
        );
      }
    }
  }

  // Rule 6: each section.customFieldKeys[] entry resolves to a known customField.def.key
  for (const s of tpl.sections) {
    if (!s.customFieldKeys) continue;
    for (const key of s.customFieldKeys) {
      if (!customFieldKeysByDef.has(key)) {
        errors.push(
          `section "${s.key}".customFieldKeys references unknown key "${key}" (no matching customFields[].def.key)`
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new HDSLibError(
      'AppTemplate cross-field validation failed:\n  - ' + errors.join('\n  - '),
      { errors, template: tpl } as any
    );
  }
}

function formatAjvErrors (errors: SchemaValidationError[] | null | undefined): string {
  if (!errors || errors.length === 0) return '(no errors)';
  return errors.map((e) => `${e.instancePath || '/'}: ${e.message}`).join('; ');
}

/** Type guards for downstream consumers. */
export function isCustomFieldDeclaration (v: unknown): v is CustomFieldDeclaration {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as any).streamId === 'string' &&
    typeof (v as any).eventType === 'string' &&
    (v as any).def != null &&
    typeof (v as any).def === 'object'
  );
}

export function isExistingStreamRef (v: unknown): v is ExistingStreamRef {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as any).streamId === 'string' &&
    Array.isArray((v as any).permissions)
  );
}
