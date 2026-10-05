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
 *   7. Data-set templates (plan 108, `format` present): `version` + `formatVersion` + `app` required,
 *      `app.url` is https, `purpose: 'app-private'` refs are read-only,
 *      `itemCustomizations[*].repeatable` follows the data-model grammar, `.required` is boolean
 *
 * Use:
 *   const tpl = loadTemplate(jsonObject);   // synchronous; throws on any failure
 *   const tpl = await loadTemplateFromUrl(url);  // fetches then validates
 */

import { HDSLibError } from '../errors.ts';
import { validate } from './schemas/appTemplate.validator.js';
import type { SchemaValidationError } from './schemas/validatorTypes.ts';
import { APP_PRIVATE_PURPOSE } from './templateTypes.ts';
import type { AppTemplate, CustomFieldDeclaration, ExistingStreamRef } from './templateTypes.ts';

/** Same grammar as data-model `items.repeatable`: once | any | unlimited | ISO-8601 duration. */
const REPEATABLE_RE = /^(once|any|unlimited|P(\d+[YMWD])+(T(\d+[HMS])+)?|PT(\d+[HMS])+)$/;

/** Options for {@link loadTemplateFromUrl}. */
export interface LoadTemplateFromUrlOptions {
  /** Abort the fetch after this many ms. Default 8000. */
  timeoutMs?: number;
  /** Refuse bodies larger than this many bytes. Default 262144 (256 KB). */
  maxBytes?: number;
  /** Fetch implementation (tests). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

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

/**
 * Fetch a template from a URL and run loadTemplate.
 *
 * The document is third-party input (plan 108 — an app's published `hds-dataset.json`), so:
 * https only, no credentials, no cache, bounded time and size. Errors are HDSLibError with
 * `innerObject.reason` one of `url`, `network`, `timeout`, `http`, `too-large`, `json`.
 */
export async function loadTemplateFromUrl (url: string, opts: LoadTemplateFromUrlOptions = {}): Promise<AppTemplate> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 262144;
  const doFetch = opts.fetch ?? fetch;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HDSLibError(`Invalid template URL "${url}"`, { reason: 'url', url } as any);
  }
  if (parsed.protocol !== 'https:') {
    throw new HDSLibError(`Template URL must use https: "${url}"`, { reason: 'url', url } as any);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = (e: unknown): never => {
    if (e instanceof HDSLibError) throw e;
    if (controller.signal.aborted) {
      throw new HDSLibError(`Timed out after ${timeoutMs} ms fetching template from ${url}`, { reason: 'timeout', url } as any);
    }
    throw new HDSLibError(`Failed to fetch template from ${url}: ${(e as Error)?.message}`, { reason: 'network', url } as any);
  };
  let text = '';
  try {
    const r = await doFetch(parsed.href, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: 'application/json' }
    });
    // Browsers block an https→http hop as mixed content; Node follows it. Check where we landed.
    if (typeof r.url === 'string' && r.url !== '' && !/^https:/i.test(r.url)) {
      throw new HDSLibError(`Template URL ${url} redirected to a non-https URL`, { reason: 'url', url } as any);
    }
    if (!r.ok) throw new HDSLibError(`Failed to fetch template from ${url}: HTTP ${r.status}`, { reason: 'http', status: r.status, url } as any);
    const declared = Number(r.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new HDSLibError(`Template at ${url} is too large (${declared} bytes, max ${maxBytes})`, { reason: 'too-large', url } as any);
    }
    text = await readBounded(r, maxBytes, url, controller);
  } catch (e) {
    fail(e);
  } finally {
    clearTimeout(timer);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new HDSLibError(`Template at ${url} is not valid JSON: ${(e as Error).message}`, { reason: 'json', url } as any);
  }
  return loadTemplate(json);
}

/** Read a response body as text, aborting as soon as it exceeds `maxBytes`. */
async function readBounded (r: Response, maxBytes: number, url: string, controller: AbortController): Promise<string> {
  const tooLarge = () => new HDSLibError(`Template at ${url} is too large (max ${maxBytes} bytes)`, { reason: 'too-large', url } as any);
  const reader = r.body?.getReader?.();
  if (reader == null) {
    const text = await r.text();
    if (new TextEncoder().encode(text).length > maxBytes) throw tooLarge();
    return text;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      controller.abort();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(all);
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
      // An app's own streams (data-set templates, plan 108) naturally carry the app id as
      // prefix; the collision that matters — the same stream declared in customFields — is
      // still checked below.
      if (ref.streamId.startsWith(sandboxPrefix) && ref.purpose !== APP_PRIVATE_PURPOSE) {
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

  // Rule 7: data-set template publication fields (plan 108)
  if (tpl.format != null) {
    if (tpl.formatVersion == null) errors.push('data-set template: "formatVersion" is required when "format" is set');
    if (tpl.version == null) errors.push('data-set template: "version" is required when "format" is set');
    if (tpl.app == null) errors.push('data-set template: "app" is required when "format" is set');
  }
  if (tpl.app != null && !/^https:\/\//i.test(tpl.app.url)) {
    errors.push(`app.url "${tpl.app.url}" must be an https URL`);
  }
  for (const ref of tpl.existingStreamRefs ?? []) {
    if (ref.purpose === APP_PRIVATE_PURPOSE && !(ref.permissions.length === 1 && ref.permissions[0] === 'read')) {
      errors.push(`existingStreamRefs[].streamId "${ref.streamId}" has purpose "${APP_PRIVATE_PURPOSE}" and must request ["read"] only`);
    }
  }
  for (const s of tpl.sections) {
    for (const [itemKey, cust] of Object.entries(s.itemCustomizations ?? {})) {
      if (cust == null || typeof cust !== 'object') {
        errors.push(`section "${s.key}".itemCustomizations["${itemKey}"] must be an object`);
        continue;
      }
      const c = cust as Record<string, unknown>;
      if (c.repeatable != null && (typeof c.repeatable !== 'string' || !REPEATABLE_RE.test(c.repeatable))) {
        errors.push(`section "${s.key}".itemCustomizations["${itemKey}"].repeatable "${String(c.repeatable)}" must be once | any | unlimited | an ISO-8601 duration`);
      }
      if (c.required != null && typeof c.required !== 'boolean') {
        errors.push(`section "${s.key}".itemCustomizations["${itemKey}"].required must be a boolean`);
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
