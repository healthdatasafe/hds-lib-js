/**
 * A per-locale text as the CMC plugin accepts it: its validator takes keys of 2 or 3 lowercase letters only
 * (open-pryv.io `components/cmc/src/validators.ts`), and refuses the whole event otherwise. A regional locale travels
 * under its language (`pt-BR` as `pt`) unless the text has that language itself; readers find it there (`pt` is read for
 * `pt-BR`, see `localizeText`).
 */
export function cmcText (texts: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  const regional: Array<[string, string]> = [];
  for (const [locale, text] of Object.entries(texts)) {
    if (typeof text !== 'string') continue;
    if (/^[a-z]{2,3}$/.test(locale)) out[locale] = text;
    else regional.push([locale.split(/[-_]/)[0].toLowerCase(), text]);
  }
  for (const [language, text] of regional) {
    if (/^[a-z]{2,3}$/.test(language)) out[language] ??= text;
  }
  return out;
}
