/* eslint-env mocha */

const modelURL = 'https://model.datasafe.dev/pack.json';

const { HDSModel } = require('../');

describe('[MODX] Model', () => {
  it('[MODL] Load model', async () => {
    const model = new HDSModel(modelURL);
    await model.load();
  });
});
