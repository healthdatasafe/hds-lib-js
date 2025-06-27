/* eslint-env mocha */
const assert = require('node:assert/strict');
const { createUserAndPermissions, pryv, createUser, createUserPermissions } = require('./test-utils/pryvService');
const AppManagingAccount = require('../src/appTemplates/AppManagingAccount');
const AppClientAccount = require('../src/appTemplates/AppClientAccount');

describe('[APTX] appTemplates', function () {
  this.timeout(10000);
  let managingUser, appManaging, user;
  const baseStreamIdManager = 'test-app-template-manager';
  const baseStreamIdClient = 'test-app-template-client';
  const appName = 'Test HDSLib.appTemplates';
  const appClientName = 'Test Client HDSLib.appTemplates';

  before(async () => {
    // -- managing
    const initialStreams = [{ id: 'applications', name: 'Applications' }, { id: baseStreamIdManager, name: appName, parentId: 'applications' }];
    const permissionsManager = [{ streamId: baseStreamIdManager, level: 'manage' }];
    managingUser = await createUserAndPermissions(null, permissionsManager, initialStreams, appName);
    const connection = new pryv.Connection(managingUser.appApiEndpoint);
    appManaging = await AppManagingAccount.newFromConnection(baseStreamIdManager, connection);
    // -- user
    user = await createUser();
  });

  it('[APTA] Full flow create collector and sharing', async () => {
    assert.equal(appManaging.appName, appName);
    assert.equal(appManaging.baseStreamId, baseStreamIdManager);

    const collectorEmpty = await appManaging.getCollectors();
    assert.ok(Array.isArray(collectorEmpty), 'Collectors should be an array');
    assert.equal(collectorEmpty.length, 0, 'Collectors should be an empty array');

    const collectorName = 'Test';
    // create a Collector
    const newCollector = await appManaging.createCollectorUnitialized(collectorName);
    assert.ok(newCollector.streamId.startsWith(baseStreamIdManager), 'Collectors id should start with baseStreamId');
    assert.ok(newCollector.name, collectorName);
    // check that streams has been addes to streamData
    assert.ok(appManaging.streamData.children[0].name, collectorName);

    // Create a Collector with the same name should fail
    try {
      await appManaging.createCollectorUnitialized(collectorName);
      throw new Error('Creating a Collector with the same name should fail');
    } catch (e) {
      assert.ok(e.message.endsWith('>> Result: {"id":"item-already-exists","message":"A stream with name \\"Test\\" already exists","data":{"name":"Test"}}"'));
      assert.equal(e.innerObject?.id, 'item-already-exists');
    }

    // check if collector is in the list
    const collectors = await appManaging.getCollectors();
    const found = collectors.find(c => c.name === collectorName);
    if (!found) throw new Error('Should find collector with name: ' + collectorName);
    assert.equal(found, newCollector);

    // check StreamStructure
    const resultCheckStructure = await newCollector.checkStreamStructure();
    assert.equal(resultCheckStructure.created.length, 6, 'Should create 5 streams');
    for (const created of resultCheckStructure.created) {
      assert.equal(created.parentId, newCollector.streamId, 'Should have collector stream as parentid');
    }

    // 2nd call of StreamStructure should be empty
    const resultCheckStructure2 = await newCollector.checkStreamStructure();
    assert.equal(resultCheckStructure2.created.length, 0, 'Should create 0 streams');

    // Should throw error as status is not yet set
    try {
      // eslint-disable-next-line no-unused-expressions
      newCollector.statusCode;
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'Init Collector first');
    }

    // Get status
    const currentStatus = await newCollector.getStatus();
    assert.equal(currentStatus.content.status, 'draft');
    assert.equal(newCollector.statusCode, 'draft');

    // Get status 2nd should retrun the same
    const currentStatus2 = await newCollector.getStatus();
    assert.equal(currentStatus2, currentStatus);

    // Sharing token creation
    const sharingApiEndpoint = await newCollector.sharingApiEndpoint();
    assert.ok(sharingApiEndpoint.startsWith('https://'));

    // Should return the same
    const sharingApiEndpoint2 = await newCollector.sharingApiEndpoint();
    assert.equal(sharingApiEndpoint2, sharingApiEndpoint);

    // ---------- creation of a manager on existing structure ---------- //

    // creating a new Manager with same connection should load the structure
    const connection2 = new pryv.Connection(appManaging.connection.apiEndpoint);
    const appManaging2 = await AppManagingAccount.newFromConnection(baseStreamIdManager, connection2);
    // check if collector is in the list
    const collectors2 = await appManaging2.getCollectors();
    const collector2 = collectors2.find(c => c.name === collectorName);
    if (!collector2) throw new Error('Should find collector with name: ' + collectorName);
    // call of StreamStructure should be empty as already created
    const resultCheckStructure3 = await collector2.checkStreamStructure();
    assert.equal(resultCheckStructure3.created.length, 0, 'Should create 0 streams');
    // should return the same access access point
    const sharingApiEndpoint3 = await collector2.sharingApiEndpoint();
    assert.equal(sharingApiEndpoint3, sharingApiEndpoint);
  });

  it('[APTI] Collector invite', async () => {
    const newCollector = await appManaging.createCollector('Invite test 1');
    assert(newCollector.statusCode, 'draft');

    // create invite
    const options = { customData: { hello: 'bob' } };
    const invite = await newCollector.createInvite('Invite One', options);
    assert.equal(invite.apiEndpoint, await newCollector.sharingApiEndpoint());
    assert.ok(invite.eventId.length > 5);

    // check invite can be found in "pendings"
    const inviteEvent = await appManaging.connection.apiOne('events.getOne', { id: invite.eventId }, 'event');
    assert.equal(inviteEvent.type, 'invite/collector-v1');
    assert.ok(inviteEvent.streamIds[0].endsWith('-pending'));
    assert.deepEqual(inviteEvent.content, { name: 'Invite One', customData: options.customData });

    // Invitee receives the invite
  });

  describe('[APCX] app Templates Client', function () {
    it('[APCE] Should throw error if not initialized with a personal or master token', async () => {
      const permissionsManager = [{ streamId: 'dummy', level: 'manage' }];
      const clientUserNonMaster = await createUserPermissions(user, permissionsManager, [], appName);
      // non master app
      try {
        await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUserNonMaster.appApiEndpoint, appClientName);
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, `Application with "app" type of access requires  (streamId = '${baseStreamIdClient}', level = "manage") or master access`);
      }
      // personal
      const appClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, user.apiEndpoint, appClientName);
      assert.equal(appClient.streamData.id, baseStreamIdClient);
      assert.equal(appClient.streamData.name, appClientName);
    });
  });
});
