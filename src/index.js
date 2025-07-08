const { localizeText, setPreferredLocale } = require('./localizeText');

module.exports = {
  HDSModel: require('./HDSModel/HDSModel'),
  appTemplates: require('./appTemplates/appTemplates'),
  pryv: require('./patchedPryv'),
  localizeText,
  setPreferredLocale,
  l: localizeText
};
