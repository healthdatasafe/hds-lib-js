#!/usr/bin/env node
/**
 * Generate the precompiled AppTemplate validator (B-2026-09-23-1).
 *
 * WHY THIS EXISTS — Content-Security-Policy.
 *
 * Ajv 8 turns a JSON schema into a validator by building JavaScript source and handing it
 * to `new Function`. `script-src 'self'` refuses that, so any app serving hds-lib under a
 * CSP without `'unsafe-eval'` died on import: the old `loader.ts` called `ajv.compile()` at
 * module top level, which means the throw happened while the module graph was still
 * initialising and the page rendered blank rather than degrading to "validation skipped".
 * Reported from an international paediatric patient registry that wanted `'unsafe-eval'`
 * gone precisely because it handles identifiable health data about children.
 *
 * The schema is fixed at build time, which is exactly the precondition Ajv's standalone
 * mode needs, so the compile step moves to the build and the runtime just calls a function.
 *
 * Run: `npm run build:validators` (also runs as part of `npm run build:ts`).
 * The OUTPUT IS COMMITTED, because `prepare` on a git install runs only `tsc` — a consumer
 * installing `hds-lib` from GitHub never runs this script. `tests/validatorDrift.test.js`
 * regenerates and compares, so a schema edit without a regenerate fails CI rather than
 * silently shipping a validator that does not match the schema.
 */

import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = join(ROOT, 'ts/appTemplates/schemas/appTemplate.schema.json');
const OUT_JS = join(ROOT, 'ts/appTemplates/schemas/appTemplate.validator.js');
const OUT_DTS = join(ROOT, 'ts/appTemplates/schemas/appTemplate.validator.d.ts');

/**
 * Anything here would reintroduce the very bug this file exists to fix, so the build
 * asserts their absence rather than trusting Ajv's output to stay eval-free.
 *
 * `import ` is on the list for a different reason than the other three: the generated code
 * is emitted into `ts/` and compiled by `tsc`, so an unresolved bare import (Ajv emits
 * `ajv/dist/runtime/*` helpers for schemas that need them — `ucs2length`, `equal`, and so
 * on) would become a runtime dependency on ajv again and undo moving it to devDependencies.
 * The current schema needs none; if a future schema does, decide deliberately.
 */
const FORBIDDEN = ['new Function', 'eval(', 'require(', 'import '];

/** Registered as a RegExp on purpose: Ajv inlines it, so the output needs no formats object. */
const URI_FORMAT = /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/;

export function generate () {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true, esm: true } });
  ajv.addFormat('uri', URI_FORMAT);
  const validate = ajv.compile(schema);
  const body = standaloneCode(ajv, validate);

  for (const pattern of FORBIDDEN) {
    if (body.includes(pattern)) {
      throw new Error(
        `Generated validator contains ${JSON.stringify(pattern)}, which defeats the CSP fix ` +
        'this file exists for (B-2026-09-23-1). Refusing to write it.'
      );
    }
  }

  return [
    '// GENERATED FILE — DO NOT EDIT.',
    '// Source: ts/appTemplates/schemas/appTemplate.schema.json',
    '// Regenerate: npm run build:validators',
    '//',
    '// Precompiled by Ajv standalone so the runtime never invokes the Function constructor,',
    '// which a Content-Security-Policy without `unsafe-eval` refuses.',
    '// See scripts/build-validators.mjs. (The forbidden spellings are deliberately not written',
    '// out here: tests/validatorDrift.test.js greps this whole file, comments included.)',
    '',
    body,
    ''
  ].join('\n');
}

const DTS = `// GENERATED FILE — DO NOT EDIT. Regenerate: npm run build:validators
import type { AppTemplate } from '../templateTypes.ts';
import type { SchemaValidationError } from './validatorTypes.ts';

/** Precompiled Ajv validator. Returns false and populates \`.errors\` on failure. */
export interface PrecompiledValidator {
  (data: unknown): data is AppTemplate;
  errors?: SchemaValidationError[] | null;
}

export const validate: PrecompiledValidator;
export default validate;
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUT_JS, generate());
  writeFileSync(OUT_DTS, DTS);
  console.log('wrote ts/appTemplates/schemas/appTemplate.validator.{js,d.ts}');
}
