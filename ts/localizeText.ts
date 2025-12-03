/**
 * basic localization functions
 */

import { HDSLibError } from './errors';

export type localizableText = {
  en: string;
  fr?: string;
  es?: string;
};

const supportedLocales = ['en', 'fr', 'es'] as const;
Object.freeze(supportedLocales);
let preferredLocales: string[] = [...supportedLocales];

/**
 * get the current preferred locales
 */
export function getPreferredLocales (): string[] {
  return [...preferredLocales];
}

/**
 * get the current supported locales
 */
export function getSupportedLocales (): readonly string[] {
  return [...supportedLocales];
}

/**
 * reset prefferedLocalesTo Original state
 */
export function resetPreferredLocales (): void {
  setPreferredLocales([...supportedLocales]);
}

/**
 * return the translation of this item considering the setting of preffered language
 */
export function localizeText (textItem: localizableText | null): string | null {
  if (textItem == null) return null;
  if (!textItem.en) throw new HDSLibError('textItems must have an english translation', { textItem });
  for (const l of preferredLocales) {
    if (textItem[l as keyof localizableText]) return textItem[l as keyof localizableText];
  }
  return textItem.en;
}

/**
 * Change prefferedLocal order
 */
export function setPreferredLocales (arrayOfLocals: string[]): void {
  if (!Array.isArray(arrayOfLocals)) {
    throw new HDSLibError('setPreferredLocales takes an array of language codes');
  }
  const unsupportedLocales = arrayOfLocals.filter(l => (supportedLocales.indexOf(l as any) < 0));
  if (unsupportedLocales.length > 0) {
    throw new HDSLibError(`locales "${unsupportedLocales.join(', ')}" are not supported`, arrayOfLocals);
  }

  preferredLocales = [...new Set([...arrayOfLocals, ...preferredLocales])];
}

/**
 * throw errors if an item is not of type localizableText
 */
export function validateLocalizableText (key: string, toTest: any): localizableText {
  if (toTest.en == null || typeof toTest.en !== 'string') throw new HDSLibError(`Missing or invalid localizable text for ${key}`, { [key]: toTest });
  for (const optionalLang of supportedLocales) {
    if (optionalLang === 'en') continue;
    if (toTest[optionalLang] != null && typeof toTest[optionalLang] !== 'string') throw new HDSLibError(`Missing or invalid localizable text for ${key} languagecode: ${optionalLang}`, { [key]: toTest, languageCode: optionalLang });
  }
  return toTest;
}
