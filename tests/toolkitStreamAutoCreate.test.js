const { assert } = require('./test-utils/deps-node');

const HDSLib = require('../js');
const { createUserAndPermissions } = require('./test-utils/pryvService');

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
