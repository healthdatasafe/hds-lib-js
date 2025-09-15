export type localizableText = {
    en: string;
    fr?: string;
    es?: string;
}

/**
 * return the translation of this item considering the setting of preffered language
 * @param {Object} textItem
 * @param {string} textItem.en
 * @param {string} [textItem.fr] - French translation
 * @param {string} [textItem.es] - Spanish translation
 */
export function localizeText(textItem: localizableText): string;
/**
 * Change prefferedLocal order
 * @param {Array<string>} arrayOfLocals of local codes
 */
export function setPreferredLocales(arrayOfLocals: Array<string>): void;
/**
 * get the current preferred locales
* @returns {Array<string>}
 */
export function getPreferredLocales(): Array<string>;
/**
 * get the current supported locales
* @returns {Array<string>}
 */
export function getSupportedLocales(): Array<string>;
/**
 * reset prefferedLocalesTo Original state
 */
export function resetPreferredLocales(): void;
/**
 * throw errors if an item is not of type localizableText
 */
export function validateLocalizableText (key: string, toTest: any): localizableText;