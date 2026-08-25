/**
 * basic localization functions
 */

import { HDSLibError } from './errors.ts';

export type localizableText = {
  en: string;
  fr?: string;
  es?: string;
};

const supportedLocales = ['en', 'fr', 'es'] as const;
Object.freeze(supportedLocales);
let preferredLocales: string[] = [...supportedLocales];

export type PreferredLocalesListener = (locales: string[]) => void;
const localesListeners = new Set<PreferredLocalesListener>();

/**
 * Subscribe to preferred-locale changes. Returns an unsubscribe function.
 *
 * Why this exists: `localizeText()` reads module-level state at call time, so a
 * consumer that already rendered a string has no way to learn the locale moved
 * underneath it. Without a notification the caller only re-localizes on a full
 * reload — which was `BUGS.md` B-2026-07-10-1 (hds-webapp's live language switch
 * left data-model / method-spec strings in the old language until reload).
 *
 * Listeners fire only when the effective locale ORDER actually changes, so a
 * redundant `setPreferredLocales` with the same result does not churn consumers.
 */
export function onPreferredLocalesChange (listener: PreferredLocalesListener): () => void {
  localesListeners.add(listener);
  return () => { localesListeners.delete(listener); };
}

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
 *
 * Empty strings `""` are valid translations (the author chose "no text"); the
 * function returns them as-is and falls through to less-preferred locales only
 * when a translation is genuinely `null`/`undefined`. Only a missing `en` key
 * throws.
 */
export function localizeText (textItem: localizableText | null): string | null {
  if (textItem == null) return null;
  if (textItem.en == null) throw new HDSLibError('textItems must have an english translation', { textItem });
  for (const l of preferredLocales) {
    const v = textItem[l as keyof localizableText];
    if (v != null) return v;
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

  const next = [...new Set([...arrayOfLocals, ...preferredLocales])];
  // Compare BEFORE assigning so listeners fire only on a real change.
  const changed = next.length !== preferredLocales.length || next.some((l, i) => l !== preferredLocales[i]);
  preferredLocales = next;
  if (!changed) return;

  const snapshot = [...preferredLocales];
  for (const listener of [...localesListeners]) {
    // One bad listener must not break a locale change for every other consumer.
    try {
      listener(snapshot);
    } catch (e) {
      console.error('onPreferredLocalesChange listener threw', e);
    }
  }
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
