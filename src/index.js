const { localizeText } = require('./localizeText');
const settings = require('./settings');
const pryv = require('./patchedPryv');
const HDSModel = require('./HDSModel/HDSModel');
const appTemplates = require('./appTemplates/appTemplates');
const logger = require('./logger');
const HDService = require('./HDSService');
const { HDSLibError } = require('./errors');

let model = null;

module.exports = {
  pryv,
  settings,
  HDService,
  HDSModel,
  get model () {
    if (model == null) throw new HDSLibError('Call await HDSLib.initHDSModel() once');
    return model;
  },
  initHDSModel,
  appTemplates,
  localizeText,
  l: localizeText, // shortcut to HDSLib.localizeText
  logger
};

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
