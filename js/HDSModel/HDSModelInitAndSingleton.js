'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getModel = getModel;
exports.resetModel = resetModel;
exports.initHDSModel = initHDSModel;
const HDSModel_1 = require('./HDSModel');
const HDSService_1 = require('../HDSService');
let model = null;
function getModel () {
  if (model == null) {
    model = new HDSModel_1.HDSModel('');
  }
  return model;
}
/**
 * Mostly used during test to unload model
 */
function resetModel () {
  model = null;
}
/**
 * Initialized model singleton
 */
async function initHDSModel () {
  if (!model) {
    getModel();
  }
  if (!model.isLoaded) {
    const service = new HDSService_1.HDSService();
    const serviceInfo = await service.info();
    await model.load(serviceInfo.assets['hds-model']);
  }
  return model;
}
// # sourceMappingURL=HDSModelInitAndSingleton.js.map
