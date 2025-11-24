let model = null;
const HDSModel = require('./HDSModel');
const HDSService = require('../HDSService');

module.exports = {
  getModel,
  initHDSModel,
  resetModel
};

function getModel () {
  if (model == null) {
    model = new HDSModel();
  }
  return model;
}
/**
 * Mostly used during test to unlod model
 */
function resetModel () {
  model = null;
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
    const service = new HDSService();
    const serviceInfo = await service.info();
    await model.load(serviceInfo.assets['hds-model']);
  }
  return model;
}
