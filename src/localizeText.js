/**
 * basic localization functions
 */

const { HDSLibError } = require('./errors');

module.exports = {
  localizeText,
  setPreferredLocales,
  getPreferredLocales,
  getSupportedLocales,
  resetPreferredLocales
};

const supportedLocales = ['en', 'fr', 'es'];
Object.freeze(supportedLocales);
let preferredLocales = [...supportedLocales];

/**
 * get the current preferred locales
* @returns {Array<string>}
 */
function getPreferredLocales () {
  return [...preferredLocales];
}
/**
 * get the current supported locales
* @returns {Array<string>}
 */
function getSupportedLocales () {
  return [...preferredLocales];
}

/**
 * reset prefferedLocalesTo Original state
 */
function resetPreferredLocales () {
  setPreferredLocales(supportedLocales);
}

/**
 * return the translation of this item considering the setting of preffered language
 * @param {Object} textItem
 * @param {string} textItem.en
 * @param {string} [textItem.fr] - French translation
 * @param {string} [textItem.es] - Spanish translation
 */
function localizeText (textItem) {
  if (textItem == null) return null;
  if (!textItem.en) throw new HDSLibError('textItems must have an english translation', { textItem });
  for (const l of preferredLocales) {
    if (textItem[l]) return textItem[l];
  }
  return textItem.en;
}

/**
 * Change prefferedLocal order
 * @param {Array<string>} arrayOfLocals of local codes
 */
function setPreferredLocales (arrayOfLocals) {
  if (!Array.isArray(arrayOfLocals)) {
    throw new HDSLibError('setPreferredLocales takes an array of language codes');
  }
  const unsupportedLocales = arrayOfLocals.filter(l => (supportedLocales.indexOf(l) < 0));
  if (unsupportedLocales.length > 0) {
    throw new HDSLibError(`locales "${unsupportedLocales.join(', ')}" are not supported`, arrayOfLocals);
  }

  preferredLocales = [...new Set([...arrayOfLocals, ...preferredLocales])];
}
