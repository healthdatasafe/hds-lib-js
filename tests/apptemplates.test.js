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
    assert.ok(newCollector.id.startsWith(baseStreamId), 'Collectors id should start with baseStreamId');
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
  });
});
