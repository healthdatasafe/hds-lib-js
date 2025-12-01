"use strict";
/**
 * basic localization functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreferredLocales = getPreferredLocales;
exports.getSupportedLocales = getSupportedLocales;
exports.resetPreferredLocales = resetPreferredLocales;
exports.localizeText = localizeText;
exports.setPreferredLocales = setPreferredLocales;
exports.validateLocalizableText = validateLocalizableText;
const errors_1 = require("./errors");
const supportedLocales = ['en', 'fr', 'es'];
Object.freeze(supportedLocales);
let preferredLocales = [...supportedLocales];
/**
 * get the current preferred locales
 */
function getPreferredLocales() {
    return [...preferredLocales];
}
/**
 * get the current supported locales
 */
function getSupportedLocales() {
    return [...supportedLocales];
}
/**
 * reset prefferedLocalesTo Original state
 */
function resetPreferredLocales() {
    setPreferredLocales([...supportedLocales]);
}
/**
 * return the translation of this item considering the setting of preffered language
 */
function localizeText(textItem) {
    if (textItem == null)
        return null;
    if (!textItem.en)
        throw new errors_1.HDSLibError('textItems must have an english translation', { textItem });
    for (const l of preferredLocales) {
        if (textItem[l])
            return textItem[l];
    }
    return textItem.en;
}
/**
 * Change prefferedLocal order
 */
function setPreferredLocales(arrayOfLocals) {
    if (!Array.isArray(arrayOfLocals)) {
        throw new errors_1.HDSLibError('setPreferredLocales takes an array of language codes');
    }
    const unsupportedLocales = arrayOfLocals.filter(l => (supportedLocales.indexOf(l) < 0));
    if (unsupportedLocales.length > 0) {
        throw new errors_1.HDSLibError(`locales "${unsupportedLocales.join(', ')}" are not supported`, arrayOfLocals);
    }
    preferredLocales = [...new Set([...arrayOfLocals, ...preferredLocales])];
}
/**
 * throw errors if an item is not of type localizableText
 */
function validateLocalizableText(key, toTest) {
    if (toTest.en == null || typeof toTest.en !== 'string')
        throw new errors_1.HDSLibError(`Missing or invalid localizable text for ${key}`, { [key]: toTest });
    for (const optionalLang of supportedLocales) {
        if (optionalLang === 'en')
            continue;
        if (toTest[optionalLang] != null && typeof toTest[optionalLang] !== 'string')
            throw new errors_1.HDSLibError(`Missing or invalid localizable text for ${key} languagecode: ${optionalLang}`, { [key]: toTest, languageCode: optionalLang });
    }
    return toTest;
}
//# sourceMappingURL=localizeText.js.map