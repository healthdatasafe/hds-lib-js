/**
 * basic localization functions
 */

import { HDSLibError } from './errors.ts';

export type localizableText = {
  en: string;
  fr?: string;
  es?: string;
  it?: string;
  pt?: string;
  'pt-BR'?: string;
};

/**
 * What `localizeText` accepts: any per-locale text map. Wider than `localizableText` on purpose:
 * data-model texts, CMC titles (`Record<string, string>`) and app dictionaries all fit without a
 * cast. The `en` entry is still required, checked at runtime (`localizeText` throws without it).
 */
export type Localizable = localizableText | Readonly<Record<string, string | undefined>>;

const supportedLocales = ['en', 'fr', 'es', 'it', 'pt', 'pt-BR'] as const;
Object.freeze(supportedLocales);

/** Read next when a text is missing in the key's locale: the two Portuguese stand in for each other before another language does. */
const closeLocales: Readonly<Record<string, readonly string[]>> = { pt: ['pt-BR'], 'pt-BR': ['pt'] };

/**
 * The supported locale a language tag stands for, or null: the tag itself whatever its case (`pt-br` is `pt-BR`),
 * else its language (`fr-CH` is `fr`, `pt-PT` is `pt`).
 */
export function matchLocale (tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const wanted = tag.trim().replace(/_/g, '-').toLowerCase();
  const exact = supportedLocales.find((l) => l.toLowerCase() === wanted);
  return exact ?? supportedLocales.find((l) => l === wanted.split('-')[0]) ?? null;
}
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
 * when a translation is genuinely `null`/`undefined`.
 *
 * A text without `en` (data written by another app, e.g. a `questionnaire/request-v1` label: the data model does not
 * require `en` there) gives its preferred-locale translation, else its first one in any language. Only a text with no
 * translation at all throws.
 */
export function localizeText (textItem: Localizable): string;
export function localizeText (textItem: Localizable | null | undefined): string | null;
export function localizeText (textItem: Localizable | null | undefined): string | null {
  if (textItem == null) return null;
  const texts = textItem as Readonly<Record<string, string | undefined>>;
  for (const l of preferredLocales) {
    const v = texts[l];
    if (v != null) return v;
  }
  // every supported locale, `en` included, is in preferredLocales: what is left is another language
  const other = Object.values(texts).find((v) => typeof v === 'string');
  if (other == null) throw new HDSLibError('textItems must have at least one translation', { textItem });
  return other;
}

/**
 * Change the preferred locales order. Each entry is matched with `matchLocale()`; an entry hds-lib does not support is
 * ignored, so a language stored by a newer app never hides the supported ones listed with it. With no supported entry
 * the order does not change.
 */
export function setPreferredLocales (arrayOfLocals: string[]): void {
  if (!Array.isArray(arrayOfLocals)) {
    throw new HDSLibError('setPreferredLocales takes an array of language codes');
  }
  const matched = arrayOfLocals.map(matchLocale).filter((l): l is string => l != null);
  // a close locale comes right after its own, unless the caller listed it
  const wanted = matched.flatMap((l) => [l, ...(closeLocales[l] ?? []).filter((c) => !matched.includes(c))]);

  const next = [...new Set([...wanted, ...preferredLocales])];
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
