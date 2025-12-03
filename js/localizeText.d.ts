/**
 * basic localization functions
 */
export type localizableText = {
    en: string;
    fr?: string;
    es?: string;
};
/**
 * get the current preferred locales
 */
export declare function getPreferredLocales(): string[];
/**
 * get the current supported locales
 */
export declare function getSupportedLocales(): readonly string[];
/**
 * reset prefferedLocalesTo Original state
 */
export declare function resetPreferredLocales(): void;
/**
 * return the translation of this item considering the setting of preffered language
 */
export declare function localizeText(textItem: localizableText | null): string | null;
/**
 * Change prefferedLocal order
 */
export declare function setPreferredLocales(arrayOfLocals: string[]): void;
/**
 * throw errors if an item is not of type localizableText
 */
export declare function validateLocalizableText(key: string, toTest: any): localizableText;
// # sourceMappingURL=localizeText.d.ts.map
