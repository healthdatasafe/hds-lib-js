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
    assert.deepEqual(itemDef.types, ['mass/kg', 'mass/lb']);
  });

  it('[MODS] Get definition from event data', async () => {
    const fakeEvent = {
      streamIds: ['body-weight', 'dummy'],
      type: 'mass/kg'
    };
    const itemDef = model.itemDefForEvent(fakeEvent);
    assert.equal(itemDef.data.streamId, 'body-weight');
    assert.deepEqual(itemDef.types, ['mass/kg', 'mass/lb']);
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
});
