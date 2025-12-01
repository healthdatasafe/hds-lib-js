/* eslint-env mocha */
const { assert } = require('./test-utils/deps-node');

const HDSLib = require('../lib');
const { createUserAndPermissions } = require('./test-utils/pryvService');

describe('[TKSX] toolKit Stream Auto Create', function () {
  this.timeout(5000);
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
});
