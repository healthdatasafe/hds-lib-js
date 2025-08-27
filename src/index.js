const { localizeText } = require('./localizeText');
const settings = require('./settings');
const pryv = require('./patchedPryv');
const HDSModel = require('./HDSModel/HDSModel');
const appTemplates = require('./appTemplates/appTemplates');
const logger = require('./logger');
const HDService = require('./HDSService');
const HDSModelInitAndSingleton = require('./HDSModel/HDSModelInitAndSingleton');
const toolkit = require('./toolkit');

module.exports = {
  pryv,
  settings,
  HDService,
  HDSModel,
  get model () {
    console.warn('HDSLib.model is deprecated use getHDSModel() instead');
    return HDSModelInitAndSingleton.getModel();
  },
  getHDSModel: HDSModelInitAndSingleton.getModel,
  initHDSModel: HDSModelInitAndSingleton.initHDSModel,
  appTemplates,
  localizeText,
  l: localizeText, // shortcut to HDSLib.localizeText
  toolkit,
  logger
};
