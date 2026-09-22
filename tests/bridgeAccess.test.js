import { assert } from './test-utils/deps-node.js';

// We can't easily unit-test the API-calling functions without a real connection,
// but we can test the exported types compile and the permissionsMatch logic indirectly.
// The main integration test is in the bridge-mira tests.

// Import to verify the module loads correctly
import { getOrCreateBridgeAccess, ensureBridgeAccess } from '../ts/appTemplates/bridgeAccess.ts';

describe('[BACC] Bridge Access helpers', function () {
  it('[BA01] should export both helper functions', () => {
    assert.equal(typeof getOrCreateBridgeAccess, 'function');
    assert.equal(typeof ensureBridgeAccess, 'function');
  });

  it('[BA02] should be importable from appTemplates', async () => {
    const appTemplates = await import('../ts/appTemplates/appTemplates.ts');
    assert.equal(typeof appTemplates.getOrCreateBridgeAccess, 'function');
    assert.equal(typeof appTemplates.ensureBridgeAccess, 'function');
    // recreateBridgeAccess was dropped in Plan 58 Phase 4b — accesses.update replaces delete+create.
    assert.equal(typeof appTemplates.recreateBridgeAccess, 'undefined');
  });
});

// ---------------------------------------------------------------------------
// [BAH] Model stream hierarchy created before the access is minted.
//
// Pryv's accesses.create auto-creates a permission's stream from `defaultName`,
// but FLAT at root — so without this step a permission on `body-temperature-basal`
// produced a root-level stream instead of body > body-temperature > …, and the
// bridge could not repair it (its scoped access is `forbidden` on model parents).
//
// [BAH02] is the regression that matters: the streams MUST be emitted root-first.
// `streams.create` calls inside one batch do not see each other, so a child sent
// before its parent fails with `unknown-referenced-resource`. The first cut of this
// fix iterated the parent chain backwards and did exactly that — `body` was created
// while `body-temperature` and `body-temperature-basal` both failed.
// ---------------------------------------------------------------------------
describe('[BAH] Bridge access — model stream hierarchy', function () {
  let HDSLib;

  before(async function () {
    HDSLib = await import('../ts/index.ts');
    await HDSLib.initHDSModel();
  });

  /** Connection stub recording every API call; no network. */
  function fakeConnection () {
    const streamsCreated = [];
    return {
      streamsCreated,
      async apiOne (method, params) {
        if (method === 'accesses.get') return [];
        if (method === 'accesses.create') {
          return { id: 'acc-1', apiEndpoint: 'https://tok@user.example.com/', ...params };
        }
        throw new Error('unexpected apiOne: ' + method);
      },
      async api (calls) {
        return calls.map((c) => {
          streamsCreated.push(c.params);
          return { stream: { id: c.params.id } };
        });
      }
    };
  }

  it('[BAH01] creates the model parents for a permission streamId', async () => {
    const conn = fakeConnection();
    await getOrCreateBridgeAccess(conn, {
      name: 'bridge-tempdrop',
      permissions: [
        { streamId: 'bridge-tempdrop', defaultName: 'Tempdrop', level: 'manage' },
        { streamId: 'body-temperature-basal', defaultName: 'Basal body temperature', level: 'manage' }
      ]
    });
    const ids = conn.streamsCreated.map((s) => s.id);
    assert.ok(ids.includes('body'), 'model parent `body` must be created');
    assert.ok(ids.includes('body-temperature'), 'model parent `body-temperature` must be created');
    assert.ok(ids.includes('body-temperature-basal'));
    // A bridge's own home stream is not a model stream — left to defaultName.
    assert.ok(!ids.includes('bridge-tempdrop'), 'non-model streams are left to defaultName');
  });

  it('[BAH02] emits them ROOT-FIRST, so no child references a missing parent', async () => {
    const conn = fakeConnection();
    await getOrCreateBridgeAccess(conn, {
      name: 'bridge-tempdrop',
      permissions: [{ streamId: 'body-temperature-basal', level: 'manage' }]
    });
    const ids = conn.streamsCreated.map((s) => s.id);
    assert.deepEqual(ids, ['body', 'body-temperature', 'body-temperature-basal']);
    // Every non-null parentId must already have been emitted earlier in the batch.
    const emitted = new Set();
    for (const s of conn.streamsCreated) {
      if (s.parentId != null) {
        assert.ok(emitted.has(s.parentId), `${s.id} references parent ${s.parentId} before it is created`);
      }
      emitted.add(s.id);
    }
  });

  it('[BAH03] skips the whole step when no permission names a model stream', async () => {
    const conn = fakeConnection();
    await getOrCreateBridgeAccess(conn, {
      name: 'bridge-x',
      permissions: [{ streamId: 'not-a-model-stream', defaultName: 'X', level: 'manage' }]
    });
    assert.equal(conn.streamsCreated.length, 0);
  });
});
