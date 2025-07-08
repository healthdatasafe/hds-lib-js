/* eslint-env mocha */
const assert = require('node:assert/strict');
const { createUserAndPermissions, pryv, createUser, createUserPermissions } = require('./test-utils/pryvService');
const AppManagingAccount = require('../src/appTemplates/AppManagingAccount');
const AppClientAccount = require('../src/appTemplates/AppClientAccount');
const Collector = require('../src/appTemplates/Collector');

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
    // -- receiving user
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
    assert.equal(resultCheckStructure.created.length, 7, 'Should create 7 streams');
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

    await newCollector.init();

    // Get status
    assert.equal(newCollector.statusCode, 'draft');

    // trying to get a sharing token in draft should throw an error
    try {
      // eslint-disable-next-line no-unused-expressions
      await newCollector.sharingApiEndpoint();
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'Collector must be in "active" state error to get sharing link, current: draft');
    }

    // trying to create an invite in draft should throw an error
    try {
      // eslint-disable-next-line no-unused-expressions
      await newCollector.createInvite({});
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'Collector must be in "active" state error to create invite, current: draft');
    }

    // Publish
    await newCollector.publish();

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
    // init collector found;
    await collector2.init();
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

    // set request content
    const requestContent = {
      version: 0,
      requester: {
        name: 'Test requester name'
      },
      title: {
        en: 'Title of the request'
      },
      description: {
        en: 'Short Description'
      },
      consent: {
        en: 'This is a consent message'
      },
      permissions: [
        { streamId: 'profile-name', defaultName: 'Name', level: 'read' },
        {
          streamId: 'profile-date-of-birth',
          defaultName: 'Date of Birth',
          level: 'read'
        }
      ],
      app: { // may have "url" in the future
        id: 'test-app',
        url: 'https://xxx.yyy',
        data: { // settings for the app
          dummy: 'dummy'
        }
      }
    };
    newCollector.statusData.requestContent = requestContent;

    // save
    await newCollector.save();
    assert.deepEqual(newCollector.statusData.requestContent, requestContent);
    assert.ok(newCollector.statusData.requestContent !== requestContent, 'Should be the same content but different objects');
    // publish
    await newCollector.publish();
    assert.equal(newCollector.statusCode, Collector.STATUSES.active);

    // create invite
    const options = { customData: { hello: 'bob' } };
    const invite = await newCollector.createInvite('Invite One', options);
    assert.equal(invite.status, 'pending');
    const inviteSharingData = await invite.getSharingData();
    assert.equal(inviteSharingData.apiEndpoint, await newCollector.sharingApiEndpoint());
    assert.ok(invite.key.length > 5);
    assert.ok(inviteSharingData.eventId.length > 5);

    // check invite can be found in "pendings"
    const inviteEvent = await appManaging.connection.apiOne('events.getOne', { id: inviteSharingData.eventId }, 'event');
    assert.equal(inviteEvent.type, 'invite/collector-v1');
    assert.ok(inviteEvent.streamIds[0].endsWith('-pending'));
    assert.deepEqual(inviteEvent.content, { name: 'Invite One', customData: options.customData });

    // Invitee receives the invite
    const permissionsClient = [{ streamId: '*', level: 'manage' }];
    const clientUser = await createUserPermissions(user, permissionsClient, [], appClientName);
    const appClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUser.appApiEndpoint, appClientName);
    const collectorClient = await appClient.handleIncomingRequest(inviteSharingData.apiEndpoint, inviteSharingData.eventId);
    assert.equal(collectorClient.eventData.streamIds[0], appClient.baseStreamId);
    assert.equal(collectorClient.eventData.content.apiEndpoint, inviteSharingData.apiEndpoint);
    assert.equal(collectorClient.eventData.content.requesterEventId, inviteSharingData.eventId);

    // TODO check collectorClient.eventData.accessInfo

    // check collectorClients
    const collectorClientsCached = await appClient.getCollectorClients();
    assert.equal(collectorClientsCached.length, 1);
    const collectorClients = await appClient.getCollectorClients(true);
    assert.equal(collectorClients.length, 1);

    // check requestData
    assert.deepEqual(collectorClient.requestData, requestContent);

    // accept
    const acceptResult = await collectorClient.accept();
    assert.equal(acceptResult.requesterEvent.content.eventId, inviteSharingData.eventId);
    assert.ok(!!acceptResult.requesterEvent.content.apiEndpoint);
    assert.equal(collectorClient.status, 'Active');

    // force refresh and check online
    const collectorClients2 = await appClient.getCollectorClients(true);
    assert.equal(collectorClients2.length, 1);
    assert.deepEqual(collectorClients2[0].accessData, acceptResult.accessData);

    // Continue on Collector side
    const invitesFromInbox = await newCollector.checkInbox();
    assert.equal(invitesFromInbox[0].eventData.type, 'invite/collector-v1');
    assert.equal(invitesFromInbox[0].status, 'active');

    // check current invites
    const invites = await newCollector.getInvites(true);
    assert.equal(invites[0], invitesFromInbox[0]);
  });

  describe('[APCX] app Templates Client', function () {
    it('[APCE] Should throw error if not initialized with a personal or master token', async () => {
      const permissionsDummy = [{ streamId: 'dummy', level: 'manage' }];
      const clientUserNonMaster = await createUserPermissions(user, permissionsDummy, [], appName);
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
