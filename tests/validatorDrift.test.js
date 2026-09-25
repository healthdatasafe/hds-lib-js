import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert } from './test-utils/deps-node.js';
import { generate } from '../scripts/build-validators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The precompiled AppTemplate validator is a COMMITTED generated file (B-2026-09-23-1):
 * `prepare` on a git install runs only `tsc`, so a consumer installing hds-lib from GitHub
 * never regenerates it. That makes drift possible in a way it would not be for a normal
 * build artifact — edit the schema, forget `npm run build:validators`, and the library
 * keeps validating against the OLD schema with nothing to indicate it.
 *
 * These tests close that hole and assert the CSP property the whole change exists for.
 */
describe('[VDRF] precompiled AppTemplate validator', function () {
  const root = path.join(__dirname, '..');
  const generatedPath = path.join(root, 'ts/appTemplates/schemas/appTemplate.validator.js');

  it('[VDR1] is checked in', () => {
    assert.ok(fs.existsSync(generatedPath),
      'ts/appTemplates/schemas/appTemplate.validator.js is missing — run `npm run build:validators`');
  });

  it('[VDR2] matches the current schema (regenerate if this fails)', () => {
    const onDisk = fs.readFileSync(generatedPath, 'utf8');
    assert.equal(onDisk, generate(),
      'The committed validator does not match what the schema generates.\n' +
      'The schema was edited without regenerating: run `npm run build:validators` and commit the result.');
  });

  it('[VDR3] THE BUG: contains no construct a CSP without `unsafe-eval` would refuse', () => {
    const src = fs.readFileSync(generatedPath, 'utf8');
    for (const forbidden of ['new Function', 'eval(']) {
      assert.ok(!src.includes(forbidden),
        `Generated validator contains ${JSON.stringify(forbidden)} — this is exactly the ` +
        'B-2026-09-23-1 regression: a CSP with `script-src self` refuses it and the ' +
        'consuming app renders blank.');
    }
  });

  it('[VDR4] pulls in no runtime module, so `ajv` stays a devDependency', () => {
    const src = fs.readFileSync(generatedPath, 'utf8');
    for (const forbidden of ['require(', 'import ']) {
      assert.ok(!src.includes(forbidden),
        `Generated validator references ${JSON.stringify(forbidden)}. Ajv emits ` +
        '`ajv/dist/runtime/*` helpers for some schemas; that would make ajv a runtime ' +
        'dependency again. Decide deliberately before allowing it.');
    }
  });

  it('[VDR5] `ajv` is not a runtime dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(!pkg.dependencies.ajv,
      'ajv moved to devDependencies with the precompiled validator; a runtime dep means ' +
      'browser consumers bundle a schema compiler they never call.');
    assert.ok(pkg.devDependencies.ajv, 'ajv is still needed to BUILD the validator');
  });

  it('[VDR7] THE REPORTED BUG: the loader imports and validates with eval disabled', function () {
    this.timeout(20000);
    // Node's --disallow-code-generation-from-strings makes `new Function` throw exactly as a
    // CSP without `unsafe-eval` does, so this reproduces the reporter's environment in-process
    // rather than approximating it. Before the fix this died at IMPORT with
    // "EvalError: Code generation from strings disallowed for this context" — and because the
    // old ajv.compile() sat at module top level, that is why the app rendered blank instead of
    // merely skipping validation.
    const probe = `
      const { loadTemplate } = await import('${path.join(root, 'ts/appTemplates/loader.ts')}');
      const tpl = loadTemplate({ id: 'demo', title: 'T', description: 'D', chat: false,
        sections: [{ key: 's1', type: 'permanent', name: 'S' }] });
      if (tpl.id !== 'demo') { throw new Error('valid template was not accepted'); }
      let rejected = false;
      try { loadTemplate({ id: 'demo' }); } catch (e) { rejected = /schema validation failed/i.test(e.message); }
      if (!rejected) { throw new Error('invalid template was not rejected'); }
      console.log('OK');
    `;
    const res = spawnSync(process.execPath, [
      '--experimental-strip-types', '--disallow-code-generation-from-strings',
      '--input-type=module', '--eval', probe
    ], { encoding: 'utf8' });

    assert.equal(res.status, 0,
      'The loader failed with code generation disabled, i.e. under a CSP without `unsafe-eval` ' +
      '— this is B-2026-09-23-1 regressing.\n' + (res.stderr || '').slice(0, 1500));
    assert.ok(res.stdout.includes('OK'), 'probe did not reach completion: ' + res.stdout);
  });

  it('[VDR6] no source file imports ajv', () => {
    const tsDir = path.join(root, 'ts');
    const offenders = [];
    (function walk (dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|js)$/.test(entry.name)) continue;
        const src = fs.readFileSync(full, 'utf8');
        if (/from\s+['"]ajv/.test(src) || /require\(\s*['"]ajv/.test(src)) {
          offenders.push(path.relative(root, full));
        }
      }
    })(tsDir);
    assert.deepEqual(offenders, [],
      'These files import ajv. Even a type-only import lands in the emitted .d.ts, so every ' +
      'consumer type-checking against hds-lib would need a package the runtime no longer uses. ' +
      'Use ts/appTemplates/schemas/validatorTypes.ts instead.');
  });
});
