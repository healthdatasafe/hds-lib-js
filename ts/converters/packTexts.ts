import type { ConverterPack } from './types.ts';

/**
 * A converter's translations, published beside its frozen packs (data-model `documentation/L10N.md`):
 * `converters/{itemKey}/l10n-{locale}.json`.
 */
export interface ConverterTexts {
  locale: string;
  /** Pack file name -> path of the text in that pack -> text. */
  packs: Record<string, Record<string, string>>;
}

const escapeKey = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');

/** An array entry is `[value=<JSON>]` or `[id=<JSON>]` when it has one, else `[index]` (data-model `src/l10n.js`). */
function segmentOf (entry: any, index: number): string {
  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    for (const key of ['value', 'id']) {
      if (key in entry && (entry[key] === null || typeof entry[key] !== 'object')) return `[${key}=${JSON.stringify(entry[key])}]`;
    }
  }
  return `[${index}]`;
}

/**
 * Adds the texts of a locale to a pack, in place: the engine and what it already handed out read the same text maps.
 * A text the pack already has in that locale is kept. Returns the number of texts added.
 */
export function addPackTexts (pack: ConverterPack, locale: string, texts: Record<string, unknown>): number {
  let added = 0;
  (function visit (node: any, at: string): void {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((entry, i) => { visit(entry, at + segmentOf(entry, i)); });
      return;
    }
    if (typeof node.en === 'string' && node[locale] === undefined) {
      const text = Object.hasOwn(texts, at) ? texts[at] : undefined;
      if (typeof text === 'string' && text !== '') {
        node[locale] = text;
        added++;
      }
    }
    for (const [key, value] of Object.entries(node)) visit(value, at === '' ? escapeKey(key) : `${at}/${escapeKey(key)}`);
  })(pack, '');
  return added;
}
