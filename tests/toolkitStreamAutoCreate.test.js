import { assert } from './test-utils/deps-node.js';

import HDSLib from '../ts/index.ts';
import { createUserAndPermissions } from './test-utils/pryvService.js';

describe('[TKSX] toolKit Stream Auto Create', function () {
  this.timeout(10000);
  before(async () => {
    await HDSLib.initHDSModel();
  });

  it('[TKSA] create required streams based on itemsDefs', async () => {
    const permissionsManager = [{ streamId: '*', level: 'manage' }];
    const user = await createUserAndPermissions(null, permissionsManager, [], 'tk-test LISL');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
    const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);

    const itemKeys = [
      'profile-name'
    ];

    const createdStreams = await streamsAutoCreate.ensureExistsForItems(itemKeys);
    assert.equal(createdStreams.length, 2);
    assert.equal(createdStreams[0].id, 'profile');
    assert.equal(createdStreams[1].id, 'profile-name');

    const createdStream2 = await streamsAutoCreate.ensureExistsForItems(itemKeys);
    assert.equal(createdStream2.length, 0, 'Should not recreate existing streams');
  });

  it('[TKSB] attachToConnection reuses existing instance', async () => {
    const permissionsManager = [{ streamId: '*', level: 'manage' }];
    const user = await createUserAndPermissions(null, permissionsManager, [], 'tk-test TKSB');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);

    const streamsAutoCreate1 = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);
    const streamsAutoCreate2 = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);
    assert.strictEqual(streamsAutoCreate1, streamsAutoCreate2, 'Should reuse existing instance');
  });

  it('[TKSC] addStreamStructure adds streams to known list', async () => {
    const permissionsManager = [{ streamId: '*', level: 'manage' }];
    const user = await createUserAndPermissions(null, permissionsManager, [], 'tk-test TKSC');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
    const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);

    // Add stream structure
    const streamStructure = [
      { id: 'existing-parent', name: 'Existing Parent', children: [{ id: 'existing-child', name: 'Existing Child' }] }
    ];
    streamsAutoCreate.addStreamStructure(streamStructure);

    const knownIds = streamsAutoCreate.knowStreamIds();
    assert.ok(knownIds.includes('existing-parent'));
    assert.ok(knownIds.includes('existing-child'));
  });

  it('[TKSD] addStreamStructure handles null input', async () => {
    const permissionsManager = [{ streamId: '*', level: 'manage' }];
    const user = await createUserAndPermissions(null, permissionsManager, [], 'tk-test TKSD');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
    const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);

    // Should not throw
    streamsAutoCreate.addStreamStructure(null);
    streamsAutoCreate.addStreamStructure(undefined);
  });

  it('[TKSE] ensureExistsForItems handles Set input', async () => {
    const permissionsManager = [{ streamId: '*', level: 'manage' }];
    const user = await createUserAndPermissions(null, permissionsManager, [], 'tk-test TKSE');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
    const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);

    const itemKeys = new Set(['profile-surname']);

    const createdStreams = await streamsAutoCreate.ensureExistsForItems(itemKeys);
    assert.ok(createdStreams.length > 0);
  });

  for (const level of ['manage', 'contribute']) {
    it(`[TKSG-${level}] an access scoped to a model stream that exists: nothing created, no forbidden (B-2026-11-17-1)`, async () => {
      const initialStreams = [{ id: 'body', name: 'Body' }, { id: 'body-weight', name: 'Body Weight', parentId: 'body' }];
      const user = await createUserAndPermissions(null, [{ streamId: 'body-weight', level }], initialStreams, 'tk-test TKSG');
      const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
      const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);
      const created = await streamsAutoCreate.ensureExistsForItems(['body-weight']);
      assert.deepEqual(created, []);
      assert.ok(streamsAutoCreate.knowStreamIds().includes('body-weight'), 'the visible stream is now known');
    });
  }

  it('[TKSH] a full-access connection creates the tree once, then knows it without another create', async () => {
    const user = await createUserAndPermissions(null, [{ streamId: '*', level: 'manage' }], [], 'tk-test TKSH');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
    const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);
    const created = await streamsAutoCreate.ensureExistsForItems(['body-weight']);
    assert.deepEqual(created.map((s) => s.id), ['body', 'body-weight']);
    const calls = [];
    const api = connection.api.bind(connection);
    connection.api = (c) => { calls.push(...c.map((x) => x.method)); return api(c); };
    assert.deepEqual(await streamsAutoCreate.ensureExistsForItems(['body-weight']), []);
    assert.deepEqual(calls, [], 'the created streams are known: no API call');
  });

  it('[TKSF] ensureExistsForItems with item-already-exists error continues normally', async () => {
    const permissionsManager = [{ streamId: '*', level: 'manage' }];
    const user = await createUserAndPermissions(null, permissionsManager, [], 'tk-test TKSF');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
    const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);

    const itemKeys = ['profile-date-of-birth'];

    // Create streams first
    await streamsAutoCreate.ensureExistsForItems(itemKeys);

    // Create a fresh instance that doesn't know about existing streams
    delete connection.streamsAutoCreate;
    const freshAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);

    // Should handle item-already-exists gracefully
    const result = await freshAutoCreate.ensureExistsForItems(itemKeys);
    // Since streams exist but freshAutoCreate doesn't know, API returns item-already-exists which is handled
    assert.ok(Array.isArray(result));
  });
});
