/**
 * basic localization functions
 */

const { HDSLibError } = require('./errors');

module.exports = {
  localizeText,
  setPreferredLocale
};

let preferredLocales = ['en', 'fr', 'es'];

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
 */
function setPreferredLocale (arrayOfLocals) {
  preferredLocales = [...new Set([...arrayOfLocals, ...preferredLocales])];
}
