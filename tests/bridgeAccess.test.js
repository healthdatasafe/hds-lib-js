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

// ---------------------------------------------------------------------------
// [BAU] ensureBridgeAccess(updateIfDifferent) creates the streams an update grants.
//
// `accesses.update`, unlike `accesses.create`, does not create a permission's
// stream from `defaultName`, and the server accepts a permission on a stream that
// does not exist. So an access updated to a new grant (Cyclefeminin
// `cyclefeminin-custom*` -> `app-cyclefeminin*`) pointed at nothing, and the
// bridge, which cannot create a root stream, failed to provision its tree.
// ---------------------------------------------------------------------------
describe('[BAU] Bridge access update — missing permission streams', function () {
  let HDSLib;

  before(async function () {
    HDSLib = await import('../ts/index.ts');
    await HDSLib.initHDSModel();
  });

  /**
   * Connection stub: one existing access, a stream tree, no network.
   * `failIds` maps a stream id to the error its `streams.create` answers.
   */
  function fakeConnection ({ accessPermissions, streams, failIds = {} }) {
    const calls = [];
    const streamsCreated = [];
    const updates = [];
    return {
      calls,
      streamsCreated,
      updates,
      async apiOne (method) {
        calls.push(method);
        if (method === 'accesses.get') {
          return [{ id: 'acc-1', name: 'bridge-x', apiEndpoint: 'https://tok@user.example.com/', permissions: accessPermissions }];
        }
        if (method === 'streams.get') return streams;
        throw new Error('unexpected apiOne: ' + method);
      },
      async api (apiCalls) {
        calls.push('api');
        return apiCalls.map((c) => {
          if (c.method !== 'streams.create') throw new Error('unexpected api: ' + c.method);
          streamsCreated.push(c.params);
          const error = failIds[c.params.id];
          if (error != null) return { error };
          return { stream: { id: c.params.id } };
        });
      },
      async updateAccess (id, update) {
        calls.push('updateAccess');
        updates.push({ id, update });
        return { id: id + ':1', apiEndpoint: 'https://tok@user.example.com/' };
      }
    };
  }

  const oldGrant = [{ streamId: 'cyclefeminin-custom', level: 'manage' }];
  const newGrant = [
    { streamId: 'app-x', defaultName: 'X (imported)', level: 'manage' },
    { streamId: 'app-x-notes', defaultName: 'notes', level: 'manage' }
  ];

  it('[BAU01] creates a missing grant stream from defaultName, then updates the access', async () => {
    const conn = fakeConnection({ accessPermissions: oldGrant, streams: [{ id: 'cyclefeminin-custom', children: [] }] });
    const res = await ensureBridgeAccess(conn, { name: 'bridge-x', permissions: newGrant, updateIfDifferent: true });
    assert.deepEqual(conn.streamsCreated, [
      { id: 'app-x', name: 'X (imported)' },
      { id: 'app-x-notes', name: 'notes' }
    ]);
    assert.ok(conn.calls.indexOf('api') < conn.calls.indexOf('updateAccess'), 'streams are created before the update');
    assert.equal(conn.updates.length, 1);
    assert.deepEqual(conn.updates[0].update.permissions, [
      { streamId: 'app-x', level: 'manage' },
      { streamId: 'app-x-notes', level: 'manage' }
    ]);
    assert.equal(res.updated, true);
  });

  it('[BAU02] also creates them when the permissions already match (left by an earlier update)', async () => {
    const conn = fakeConnection({ accessPermissions: newGrant.map(({ streamId, level }) => ({ streamId, level })), streams: [] });
    const res = await ensureBridgeAccess(conn, { name: 'bridge-x', permissions: newGrant, updateIfDifferent: true });
    assert.deepEqual(conn.streamsCreated.map((s) => s.id), ['app-x', 'app-x-notes']);
    assert.equal(conn.updates.length, 0);
    assert.equal(res.updated, false);
  });

  it('[BAU03] no stream is created when all exist', async () => {
    const conn = fakeConnection({
      accessPermissions: oldGrant,
      streams: [{ id: 'app-x', children: [{ id: 'app-x-notes', children: [] }] }]
    });
    await ensureBridgeAccess(conn, { name: 'bridge-x', permissions: newGrant, updateIfDifferent: true });
    assert.equal(conn.streamsCreated.length, 0);
    assert.ok(!conn.calls.includes('api'));
    assert.equal(conn.updates.length, 1);
  });

  it('[BAU04] without updateIfDifferent, streams are not even read', async () => {
    const conn = fakeConnection({ accessPermissions: oldGrant, streams: [] });
    await ensureBridgeAccess(conn, { name: 'bridge-x', permissions: newGrant });
    assert.deepEqual(conn.calls, ['accesses.get']);
  });

  it('[BAU05] data-model streams: existing ones untouched, a missing one gets its model chain, never a flat defaultName copy', async () => {
    const conn = fakeConnection({
      accessPermissions: oldGrant,
      streams: [
        { id: 'body', children: [{ id: 'body-weight', children: [] }] }
      ]
    });
    await ensureBridgeAccess(conn, {
      name: 'bridge-x',
      permissions: [
        { streamId: 'body-weight', defaultName: 'body-weight', level: 'manage' },
        { streamId: 'body-temperature-basal', defaultName: 'body-temperature-basal', level: 'manage' }
      ],
      updateIfDifferent: true
    });
    const model = HDSLib.getHDSModel().streams;
    assert.ok(model.getDataById('body-weight', false) != null, 'body-weight is a model stream');
    const ids = conn.streamsCreated.map((s) => s.id);
    assert.deepEqual(ids, ['body-temperature', 'body-temperature-basal'], 'only the missing part of the model chain, root-first');
    for (const s of conn.streamsCreated) {
      assert.equal(s.parentId, model.getDataById(s.id).parentId, `${s.id} keeps its model parent`);
      assert.notEqual(s.name, s.id, `${s.id} gets the model name, not the defaultName`);
    }
  });

  it('[BAU06] skips `*`, store-prefixed ids, feature permissions and non-model streams without defaultName', async () => {
    const conn = fakeConnection({ accessPermissions: oldGrant, streams: [] });
    await ensureBridgeAccess(conn, {
      name: 'bridge-x',
      permissions: [
        { streamId: '*', level: 'read' },
        { streamId: ':_cmc:inbox', level: 'contribute' },
        { streamId: 'no-default-name', level: 'manage' },
        { feature: 'selfRevoke', setting: 'forbidden' }
      ],
      updateIfDifferent: true
    });
    assert.equal(conn.streamsCreated.length, 0);
    assert.equal(conn.updates.length, 1);
  });

  it('[BAU07] an already-existing stream (e.g. trashed) is fine', async () => {
    const conn = fakeConnection({
      accessPermissions: oldGrant,
      streams: [],
      failIds: { 'app-x': { id: 'item-already-exists', message: 'exists' } }
    });
    await ensureBridgeAccess(conn, { name: 'bridge-x', permissions: newGrant, updateIfDifferent: true });
    assert.equal(conn.updates.length, 1);
  });

  it('[BAU08] a stream that cannot be created is reported by id and error, and the access is not updated', async () => {
    const conn = fakeConnection({
      accessPermissions: oldGrant,
      streams: [],
      failIds: { 'app-x-notes': { id: 'forbidden', message: 'no root streams' } }
    });
    await assert.rejects(
      ensureBridgeAccess(conn, { name: 'bridge-x', permissions: newGrant, updateIfDifferent: true }),
      (err) => {
        assert.ok(err instanceof HDSLib.HDSLibError, 'HDSLibError');
        assert.match(err.message, /bridge-x/);
        assert.match(err.message, /app-x-notes \(forbidden: no root streams\)/);
        assert.doesNotMatch(err.message, /app-x \(/);
        assert.deepEqual(err.innerObject.failures.map((f) => f.streamId), ['app-x-notes']);
        return true;
      }
    );
    assert.equal(conn.updates.length, 0);
  });
});
