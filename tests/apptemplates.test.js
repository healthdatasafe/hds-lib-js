/* eslint-env mocha */
const { assert } = require('./test-utils/deps-node');
const { pryv, createUserPermissions } = require('./test-utils/pryvService');
const AppManagingAccount = require('../lib/appTemplates/AppManagingAccount');
const AppClientAccount = require('../lib/appTemplates/AppClientAccount');
const Collector = require('../lib/appTemplates/Collector');
const CollectorClient = require('../lib/appTemplates/CollectorClient');
const { HDSLibError } = require('../lib/errors');
const { initHDSModel } = require('../lib/index.js');
const { helperNewAppAndUsers, helperNewInvite, helperNewAppManaging } = require('./test-utils/helpersAppTemplate.js');

describe('[APTX] appTemplates', function () {
  this.timeout(10000);
  // eslint-disable-next-line no-unused-vars
  let managingUser, appManaging, clientUser, clientUserResultPermissions, appClient;
  const baseStreamIdManager = 'test-app-template-manager';
  const baseStreamIdClient = 'test-app-template-client';
  const appName = 'Test HDSLib.appTemplates';
  const appClientName = 'Test Client HDSLib.appTemplates';

  before(async () => {
    ({ managingUser, appManaging, clientUser, clientUserResultPermissions, appClient } = await helperNewAppAndUsers(baseStreamIdManager, appName, baseStreamIdClient, appClientName));
    await initHDSModel();
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

  describe('[APIX] Collector invite flows & internals', () => {
    it('[APTI] Collector invite accept full flow testing internal', async () => {
      const newCollector = await appManaging.createCollector('Invite test 1');
      assert(newCollector.statusCode, 'draft');

      // set request content
      const requestContent = {
        version: 1,
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
        permissionsExtra: [],
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
        },
        sections: [{
          itemKeys: [
            'profile-name',
            'profile-surname'
          ],
          key: 'profile',
          name: {
            en: 'Profile'
          },
          type: 'permanent'
        },
        {
          itemKeys: ['fertility-ttc-tta', 'body-weight'],
          key: 'history',
          name: {
            en: 'History'
          },
          type: 'recurring'
        }
        ]
      };
      newCollector.request.setContent(requestContent);

      // save
      await newCollector.save();
      assert.deepEqual(newCollector.request.content, requestContent);
      assert.ok(newCollector.request.content !== requestContent, 'Should be the same content but different objects');
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

      // also on current invites
      const invites1 = await newCollector.getInvites();
      assert.equal(invites1.length, 1);
      assert.equal(invites1[0].status, 'pending');

      // Invitee receives the invite
      const permissionsClient = [{ streamId: '*', level: 'manage' }];
      const myClientUserPermissionsResult = await createUserPermissions(clientUser, permissionsClient, [], appClientName + 'APTI');

      const myAppClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, myClientUserPermissionsResult.appApiEndpoint, appClientName);
      const collectorClient = await myAppClient.handleIncomingRequest(inviteSharingData.apiEndpoint, inviteSharingData.eventId);
      assert.equal(collectorClient.eventData.streamIds[0], myAppClient.baseStreamId);
      assert.equal(collectorClient.eventData.content.apiEndpoint, inviteSharingData.apiEndpoint);
      assert.equal(collectorClient.eventData.content.requesterEventId, inviteSharingData.eventId);

      // TODO check collectorClient.eventData.accessInfo

      // check collectorClients
      const collectorClientsCached = await myAppClient.getCollectorClients();
      assert.equal(collectorClientsCached.length, 1);
      const collectorClients = await myAppClient.getCollectorClients(true);
      assert.equal(collectorClients.length, 1);

      // collectorClients can be retrieved by key
      const found = await myAppClient.getCollectorClientByKey(collectorClient.key);
      assert.equal(found, collectorClients[0]);

      // check requestData
      assert.deepEqual(collectorClient.requestData, requestContent);

      // accept
      const acceptResult = await collectorClient.accept();
      assert.equal(acceptResult.requesterEvent.content.eventId, inviteSharingData.eventId);
      assert.ok(!!acceptResult.requesterEvent.content.apiEndpoint);
      assert.equal(collectorClient.status, 'Active');

      // try to re-accept throws an error
      try {
        await collectorClient.accept();
        throw new Error('should throw error');
      } catch (e) {
        assert.equal(e.message, 'Cannot accept an Active CollectorClient');
      }

      // force refresh and check online
      const collectorClients2 = await myAppClient.getCollectorClients(true);
      assert.equal(collectorClients2.length, 1);
      assert.deepEqual(collectorClients2[0].accessData, acceptResult.accessData);

      // Continue on Collector side
      const invitesFromInbox = await newCollector.checkInbox();
      assert.equal(invitesFromInbox[0].eventData.type, 'invite/collector-v1');
      assert.equal(invitesFromInbox[0].status, 'active');

      // check current invites
      const invites2 = await newCollector.getInvites(true);
      assert.equal(invites2.length, 1);
      assert.equal(invites2[0], invitesFromInbox[0]);
      assert.equal(invites2[0].status, 'active');
    });

    it('[APIA] Collector invite accept', async () => {
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APIA');
      assert.ok(invite.status, 'pending');
      await collectorClient.accept();
      await collector.checkInbox();
      assert.ok(invite.status, 'active');
    });

    it('[APII] Collector invite internals', async () => {
      const beforeCreation = new Date();
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APII');
      const afterCreation = new Date();
      assert.ok(invite.dateCreation > beforeCreation && invite.dateCreation < afterCreation);

      // apiEndpoint should throw Error
      try {
        // eslint-disable-next-line no-unused-expressions
        invite.apiEndpoint;
        throw new HDSLibError('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'invite.apiEndpoint is accessible only when active');
      }

      await collectorClient.accept();
      await collector.checkInbox();

      // eslint-disable-next-line no-unused-expressions
      invite.apiEndpoint; // should not throw error

      // connection is cached and valid
      const connection = invite.connection;
      const inviteInfo = await connection.accessInfo();
      assert.ok(!!inviteInfo.clientData.hdsCollectorClient);
    });

    it('[APTR] Collector invite refuse', async () => {
      const { collector, collectorClient, inviteSharingData } = await helperNewInvite(appManaging, appClient, 'APTR');
      const refuseResult = await collectorClient.refuse();
      assert.equal(refuseResult.requesterEvent.content.eventId, inviteSharingData.eventId);
      assert.equal(collectorClient.status, 'Refused');

      // check collector
      const invitesFromInbox = await collector.checkInbox();
      assert.equal(invitesFromInbox[0].eventData.type, 'invite/collector-v1');
      assert.equal(invitesFromInbox[0].status, 'error');
      assert.equal(invitesFromInbox[0].errorType, 'refused');
    });

    it('[APCR] Collector Client invite revoke', async () => {
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APCR');
      await collectorClient.accept();

      // check collector
      const invitesFromInbox1 = await collector.checkInbox();
      assert.equal(invitesFromInbox1[0], invite);
      assert.equal(invite.status, 'active');

      // client revoke
      await collectorClient.revoke();
      assert.equal(collectorClient.status, 'Deactivated');
      assert.ok(collectorClient.accessData.deleted);

      // check collector
      const invitesFromInbox2 = await collector.checkInbox();
      assert.equal(invitesFromInbox2[0], invite);
      assert.equal(invite.status, 'error');
      assert.equal(invite.errorType, 'revoked');
    });

    it('[APCM] Collector (manager) invite revoke after accept', async () => {
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APCM');
      await collectorClient.accept();

      // check collector
      const invitesFromInbox1 = await collector.checkInbox();
      assert.equal(invitesFromInbox1[0], invite);
      assert.equal(invite.status, 'active');

      // revoke invitation
      await invite.revoke();
      assert.equal(invite.status, 'error');
      assert.equal(invite.errorType, 'revoked');

      // check if authorization is revoked
      try {
        await invite.connection.accessInfo();
        throw new Error('Should be forbidden');
      } catch (e) {
        assert(e.message === 'Forbidden');
      }
    });

    it('[APCV] Collector convert v0 to v1 correctly', async () => {
      const newCollector = await appManaging.createCollector('Invite test APCV');

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
            dummy: 'dummy',
            forms: {
              profile: {
                itemKeys: [
                  'profile-name',
                  'profile-surname'
                ],
                name: 'Profile',
                type: 'permanent'
              }
            }
          }
        }
      };

      // set expected content
      const expectedContent = {
        version: 1,
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
        permissionsExtra: [],
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
        },
        sections: [{
          itemKeys: [
            'profile-name',
            'profile-surname'
          ],
          key: 'profile',
          name: {
            en: 'Profile'
          },
          type: 'permanent'
        }
        ]
      };
      newCollector.request.setContent(requestContent);
      assert.deepEqual(newCollector.request.content, expectedContent);
    });
  });

  describe('[APEX] Errors ', () => {
    it('[APEH] Collector.client handleIncoming Request Errors', async () => {
      const new0 = await helperNewAppAndUsers('dummy', 'dummyApp', 'dummyC', 'dummyCApp');
      const inv0 = await helperNewInvite(new0.appManaging, new0.appClient, 'APEH');

      // Already known but different incomingEnventId
      try {
        await new0.appClient.handleIncomingRequest(inv0.inviteSharingData.apiEndpoint, 'bogusId');
        throw new Error('should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Found existing collectorClient with a different eventId');
      }

      // -- The following case happens when a user revokes its app permission
      // and re-grant other permissions to the same app

      // revoke appManaging
      await new0.appManaging.connection.revoke();
      // create a new appManaging with the same name for the same user
      const manager1 = await helperNewAppManaging('dummy', 'dummyApp', new0.managingUser);
      // get invites from precedent collector
      const collector1 = (await manager1.appManaging.getCollectors())[0];
      await collector1.init();
      const inv1 = (await collector1.getInvites())[0];
      const inviteSharingData1 = await inv1.getSharingData();
      // Already known but different incomingEnventId
      try {
        await new0.appClient.handleIncomingRequest(inviteSharingData1.apiEndpoint, inviteSharingData1.eventId);
        throw new Error('should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Found existing collectorClient with a different apiEndpoint');
      }

      // reset to new incoming (might be implement later)
      const requesterConnection = new pryv.Connection(inviteSharingData1.apiEndpoint);
      const accessInfo = await requesterConnection.accessInfo();
      const collectorClient = await new0.appClient.getCollectorClientByKey(CollectorClient.keyFromInfo(accessInfo));
      await collectorClient.reset(inviteSharingData1.apiEndpoint, inviteSharingData1.eventId);
      assert.equal(collectorClient.status, CollectorClient.STATUSES.incoming);
    });
  });

  describe('[APCX] app Templates Client', function () {
    it('[APCE] Should throw error if not initialized with a personal or master token', async () => {
      const permissionsDummy = [{ streamId: 'dummy', level: 'manage' }];
      const clientUserNonMaster = await createUserPermissions(clientUser, permissionsDummy, [], appName);
      // non master app
      try {
        await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUserNonMaster.appApiEndpoint, appClientName);
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, `Application with "app" type of access requires  (streamId = "${baseStreamIdClient}", level = "manage") or master access`);
      }
      // personal
      const appClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUser.apiEndpoint, appClientName);
      assert.equal(appClient.streamData.id, baseStreamIdClient);
      assert.equal(appClient.streamData.name, appClientName);
    });
  });
});
