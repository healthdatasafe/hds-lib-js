import { readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from './test-utils/deps-node.js';

const NODE_ONLY = new Set(['validatorDrift.test.js', 'browserSuiteCoverage.test.js']);

describe('[BSC] browser test suite coverage', function () {
  it('[BSC1] browser-tests.js imports every test file but the node-only ones', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const listed = new Set([...readFileSync(dir + '/browser-tests.js', 'utf8').matchAll(/import '\.\/([^']+)'/g)].map(m => m[1]));
    const files = readdirSync(dir).filter(f => f.endsWith('.test.js'));
    const missing = files.filter(f => !NODE_ONLY.has(f) && !listed.has(f));
    const stale = [...listed].filter(f => !files.includes(f));
    assert.deepEqual({ missing, stale }, { missing: [], stale: [] });
  });
});
