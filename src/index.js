const { localizeText, setPreferredLocales } = require('./localizeText');

module.exports = {
  settings: require('./settings'),
  HDSModel: require('./HDSModel/HDSModel'),
  appTemplates: require('./appTemplates/appTemplates'),
  pryv: require('./patchedPryv'),
  localizeText,
  setPreferredLocales,
  l: localizeText,
  logger: require('./logger')
};
