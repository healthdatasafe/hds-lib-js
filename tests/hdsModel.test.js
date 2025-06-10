/* eslint-env mocha */
const assert = require('node:assert/strict');

const modelURL = 'https://model.datasafe.dev/pack.json';

const { HDSModel } = require('../');

describe('[MODX] Model', () => {
  it('[MODL] Load model', async () => {
    const model = new HDSModel(modelURL);
    await model.load();
    const item = model.itemForKey('body-weight');
    assert.equal(item.streamId, 'body-weight');
  });
});
