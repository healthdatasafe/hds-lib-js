/* eslint-env mocha */
const assert = require('node:assert/strict');
const { createUserAndPermissions, pryv } = require('./test-utils/pryvService');
const AppManagingAccount = require('../src/appTemplates/AppManagingAccount');

describe('[APTX] appTemplates', function () {
  this.timeout(10000);
  let user, appManaging;
  const baseStreamId = 'test-app-template';
  const appName = 'Test HDSLib.appTemplates';

  before(async () => {
    const permissions = [{ streamId: baseStreamId, level: 'manage' }];
    user = await createUserAndPermissions(null, permissions, appName);
    const connection = new pryv.Connection(user.appApiEndpoint);
    appManaging = await AppManagingAccount.newFromConnection(connection, baseStreamId);
  });

  it('[APTA] Full flow create collector and sharing', async () => {
    assert.equal(appManaging.appName, appName);
    assert.equal(appManaging.baseStreamId, baseStreamId);

    const collectorEmpty = await appManaging.getCollectors();
    assert.ok(Array.isArray(collectorEmpty), 'Collectors should be an array');
    assert.equal(collectorEmpty.length, 0, 'Collectors should be an empty array');

    const collectorName = 'Test';
    // create a Collector
    const newCollector = await appManaging.createCollector(collectorName);
    assert.ok(newCollector.streamId.startsWith(baseStreamId), 'Collectors id should start with baseStreamId');
    assert.ok(newCollector.name, collectorName);

    // Create a Collector with the same name should fail
    try {
      await appManaging.createCollector(collectorName);
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
    const appManaging2 = await AppManagingAccount.newFromConnection(connection2, baseStreamId);
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
});
