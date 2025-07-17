/* eslint-env mocha */
const { assert } = require('./test-utils/deps-node');
/**
 * Tests related to HDSLib.index.js & utils
 */
const HDSLib = require('../src');
const { waitUntilFalse } = require('../src/utils');

describe('[HDLX] HDSLib.index.js', () => {
  it('[HDME] HDSLib.model throws error if not initialized', () => {
    try {
      // eslint-disable-next-line no-unused-expressions
      HDSLib.model;
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Call await HDSLib.initHDSModel() once');
    }
  });

  it('[HDME] HDSLib.initHDSModel()', async () => {
    const model0 = await HDSLib.initHDSModel();
    const model1 = await HDSLib.initHDSModel();
    assert.equal(model0, model1, 'HDSLib.initHDSModel() should used cached model');
    const model2 = HDSLib.model;
    assert.equal(model0, model2, 'HDSLib.model should used cached model');
    // -- refresh model
  });

  it('[HDME] HDSLib.initHDSModel(forceRefresh = true) should refresh model', async () => {
    const model0 = await HDSLib.initHDSModel();
    const model1 = await HDSLib.initHDSModel(true);
    assert.ok(model0 !== model1, 'HDSLib.initHDSModel(true) should refresh cached model');
    const model2 = HDSLib.model;
    assert.equal(model1, model2, 'HDSLib.model should used cached model');
  });

  describe('[HDUX] Utils', () => {
    it('[HDUW] utils.waitUntilFalse', async function () {
      this.timeout('1000');
      let toBeSetToFalse = true;
      setTimeout(() => { toBeSetToFalse = false; }, 500);

      let count = 0;
      await waitUntilFalse(() => {
        count++;
        return toBeSetToFalse;
      }, 700);
      assert.ok(count > 2, 'should do at least 2 loops');
    });

    it('[HDUW] utils.waitUntilFalse throw timout on error', async function () {
      this.timeout('1000');
      let toBeSetToFalse = true;
      setTimeout(() => { toBeSetToFalse = false; }, 600);

      let count = 0;
      try {
        await waitUntilFalse(() => {
          count++;
          return toBeSetToFalse;
        }, 400);
        throw new Error('Should throw errors');
      } catch (e) {
        assert.equal(e.message, 'Timeout after 400ms');
      }
      assert.ok(count > 2, 'should do at least 2 loops');
    });
  });
});
