/* eslint-env mocha */
const { assert } = require('./test-utils/deps-node');
/**
 * Tests related to HDSLib.index.js & utils
 */
const HDSLib = require('../js');
const { waitUntilFalse } = require('../js/utils');
const { resetModel } = require('../js/HDSModel/HDSModelInitAndSingleton');

describe('[HDLX] HDSLib.index', () => {
  before(async () => {
    await HDSLib.initHDSModel();
    resetModel();
  });

  it('[HDME] HDSLib.getHDSModel() throws error if not initialized', () => {
    try {
      // eslint-disable-next-line no-unused-expressions
      HDSLib.getHDSModel().modelData;
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
    }

    try {
      // eslint-disable-next-line no-unused-expressions
      HDSLib.getHDSModel().streams;
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
    }
  });

  it('[HDMF] HDSLib.initHDSModel()', async () => {
    const model0 = await HDSLib.initHDSModel();
    const model1 = await HDSLib.initHDSModel();
    assert.equal(model0, model1, 'HDSLib.initHDSModel() should used cached model');
    const model2 = HDSLib.getHDSModel();
    assert.equal(model0, model2, 'HDSLib.getHDSModel() should used cached model');
    // -- refresh model
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
