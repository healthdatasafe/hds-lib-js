/* eslint-env mocha */
const assert = require('node:assert/strict');
const { createUserAndPermissions } = require('./test-utils/pryvService');
const AppManagingAccount = require('../src/appTemplates/AppManagingAccount');
const pryv = require('pryv');

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

  it('[APTA] Initial and create One collector', async () => {
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
      assert.equal(e.message, 'Failed creating collector >> A stream with name "Test" already exists');
      assert.equal(e.innerObject?.id, 'item-already-exists');
    }

    // check if collector is in the list
    const collectors = await appManaging.getCollectors();
    const found = collectors.find(c => c.name === collectorName);
    if (!found) throw new Error('Should find collector with name: ' + collectorName);
    assert.equal(found, newCollector);

    // check StreamStructure
    const resultCheckStructure = await newCollector.checkStreamStructure();
    assert.equal(resultCheckStructure.created.length, 4, 'Should create 4 streams');
    for (const created of resultCheckStructure.created) {
      assert.equal(created.parentId, newCollector.streamId, 'Should have collector stream as parentid');
    }

    // 2nd call of StreamStructure should be empty
    const resultCheckStructure2 = await newCollector.checkStreamStructure();
    assert.equal(resultCheckStructure2.created.length, 0, 'Should create 0 streams');

    // creating a new Manager with same connection should load the structure
    const connection2 = new pryv.Connection(appManaging.connection.apiEndpoint);
    const appManaging2 = await AppManagingAccount.newFromConnection(connection2, baseStreamId);
    // check if collector is in the list
    const collectors2 = await appManaging2.getCollectors();
    const found2 = collectors2.find(c => c.name === collectorName);
    if (!found2) throw new Error('Should find collector with name: ' + collectorName);
    // call of StreamStructure should be empty as already created
    const resultCheckStructure3 = await newCollector.checkStreamStructure();
    assert.equal(resultCheckStructure3.created.length, 0, 'Should create 0 streams');
  });
});
