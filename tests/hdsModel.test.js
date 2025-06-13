/* eslint-env mocha */
const assert = require('node:assert/strict');

const modelURL = 'https://model.datasafe.dev/pack.json';

const { HDSModel } = require('../');

describe('[MODX] Model', () => {
  let model;
  before(async () => {
    model = new HDSModel(modelURL);
    await model.load();
  });

  it('[MODL] Load model', async () => {
    const modelLoad = new HDSModel(modelURL);
    await modelLoad.load();
    const itemDef = modelLoad.itemDefForKey('body-weight');
    assert.equal(itemDef.data.streamId, 'body-weight');
    assert.deepEqual(itemDef.eventTypes, ['mass/kg', 'mass/lb']);
  });

  // ---------- items ------------ //

  it('[MODS] Get definition from event data', async () => {
    const fakeEvent = {
      streamIds: ['body-weight', 'dummy'],
      type: 'mass/kg'
    };
    const itemDef = model.itemDefForEvent(fakeEvent);
    assert.equal(itemDef.data.streamId, 'body-weight');
    assert.deepEqual(itemDef.eventTypes, ['mass/kg', 'mass/lb']);
  });

  it('[MOEN] Throw error if itemDefForEvent not found', async () => {
    const fakeEvent = {
      streamIds: ['dummy'],
      type: 'mass/kg'
    };
    try {
      model.itemDefForEvent(fakeEvent);
      throw new Error('Should throw Error');
    } catch (e) {
      assert.equal(e.message, 'Cannot find definition for event: {"streamIds":["dummy"],"type":"mass/kg"}');
    }
  });

  it('[MOED] Throw error if itemDefForEvent finds duplicates', async () => {
    const fakeEvent = {
      streamIds: ['body-vulva-wetness-feeling', 'body-vulva-mucus-stretch'],
      type: 'ratio/generic'
    };
    try {
      model.itemDefForEvent(fakeEvent);
      throw new Error('Should throw Error');
    } catch (e) {
      assert.equal(e.message, 'Found multiple matching definitions "body-vulva-wetness-feeling, body-vulva-mucus-stretch" for event: {"streamIds":["body-vulva-wetness-feeling","body-vulva-mucus-stretch"],"type":"ratio/generic"}');
    }
  });

  // ---------- streams ------------ //
  it('[MOSB] Streams Data by Id', async () => {
    const streamData = model.streamDataGetById('fertility-cycles-start');
    assert.equal(streamData.parentId, 'fertility-cycles');
  });

  it('[MOSP] Streams Data parents', async () => {
    const streamParentIds = model.streamGetParentsIds('fertility-cycles-start');
    assert.deepEqual(streamParentIds, ['fertility', 'fertility-cycles']);
  });

  it('[MOSC] Necessary streams to handle itemKeys', async () => {
    const itemKeys = [
      'body-vulva-mucus-inspect',
      'profile-name',
      'profile-date-of-birth',
      'body-vulva-mucus-stretch',
      'profile-surname'
    ];
    const streamsToBeCreated = model.streamsGetNecessaryListForItemKeys(itemKeys);
    // keeè a list of streams check that necessary streams exists
    const streamIdsToCheck = {};
    for (const itemKey of itemKeys) {
      const streamId = model.itemDefForKey(itemKey).data.streamId;
      streamIdsToCheck[streamId] = true;
    }
    const parentExist = {}; // list of parent id in order
    for (const stream of streamsToBeCreated) {
      assert.ok(!!stream.id, 'stream should have an id');
      assert.ok(!!stream.name, `stream "${stream.id}" should have a name`);
      delete streamIdsToCheck[stream.id];
      if (stream.parentId) assert.ok(!!parentExist[stream.parentId], `stream "${stream.id}" should have parent "${stream.parentId}" already in list`);
      parentExist[stream.id] = true;
    }
    assert.deepEqual(Object.keys(streamIdsToCheck), []);
  });
});
