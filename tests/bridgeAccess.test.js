import { assert } from './test-utils/deps-node.js';

// We can't easily unit-test the API-calling functions without a real connection,
// but we can test the exported types compile and the permissionsMatch logic indirectly.
// The main integration test is in the bridge-mira tests.

// Import to verify the module loads correctly
import { getOrCreateBridgeAccess, recreateBridgeAccess, ensureBridgeAccess } from '../ts/appTemplates/bridgeAccess.ts';

describe('[BACC] Bridge Access helpers', function () {
  it('[BA01] should export all three helper functions', () => {
    assert.equal(typeof getOrCreateBridgeAccess, 'function');
    assert.equal(typeof recreateBridgeAccess, 'function');
    assert.equal(typeof ensureBridgeAccess, 'function');
  });

  it('[BA02] should be importable from appTemplates', async () => {
    const appTemplates = await import('../ts/appTemplates/appTemplates.ts');
    assert.equal(typeof appTemplates.getOrCreateBridgeAccess, 'function');
    assert.equal(typeof appTemplates.recreateBridgeAccess, 'function');
    assert.equal(typeof appTemplates.ensureBridgeAccess, 'function');
  });
});
