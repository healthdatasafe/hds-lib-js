let model = null;
const HDSModel = require('./HDSModel');
const HDService = require('../HDSService');
const { HDSLibError } = require('../errors');

module.exports = {
  getModel,
  initHDSModel
};

function getModel () {
  if (model == null) throw new HDSLibError('Call await HDSLib.initHDSModel() once');
  return model;
}

/**
 * Initialized model singleton
 * @returns {HDSModel}
 */
async function initHDSModel (forceNew = false) {
  if (!model || forceNew) {
    const service = new HDService();
    const serviceInfo = await service.info();
    model = new HDSModel(serviceInfo.assets['hds-model']);
    await model.load();
  }
  return model;
}
