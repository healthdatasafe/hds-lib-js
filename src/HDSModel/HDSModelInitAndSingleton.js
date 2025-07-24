let model = null;
const HDSModel = require('./HDSModel');
const HDService = require('../HDSService');

module.exports = {
  getModel,
  initHDSModel
};

function getModel () {
  if (model == null) {
    model = new HDSModel();
  }
  return model;
}

/**
 * Initialized model singleton
 * @returns {HDSModel}
 */
async function initHDSModel () {
  if (!model) {
    getModel();
  }
  if (!model.isLoaded) {
    const service = new HDService();
    const serviceInfo = await service.info();
    await model.load(serviceInfo.assets['hds-model']);
  }
  return model;
}
