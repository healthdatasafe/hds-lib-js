import { HDSModel } from './HDSModel.ts';
import * as logger from '../logger.ts';
import { EuclidianDistanceEngine } from '../converters/EuclidianDistanceEngine.ts';
import { addPackTexts } from '../converters/packTexts.ts';
import { getPreferredLocales, onPreferredLocalesChange } from '../localizeText.ts';
import type { ConverterPack, ObservationVector, ConversionResult, SourceBlock } from '../converters/types.ts';

/**
 * The newest converter version this hds-lib reads, per item key. A version above it may carry what this engine
 * does not know (cervical-fluid v1: options with `produce: false`; v2: annotation `notFor`, read by hds-forms-js; v3:
 * which Creighton codes are produced), so it is never fetched. An item key not listed reads v0.
 */
export const SUPPORTED_CONVERTER_VERSIONS: Record<string, string> = { 'cervical-fluid': 'v3', mood: 'v0' };

const versionNumber = (v: string): number => /^v\d+$/.test(v) ? Number(v.slice(1)) : NaN;

/**
 * The pack version to fetch: the highest of the model's published `versions` not above what this hds-lib supports.
 * `null` (read `pack-latest.json`) when the model lists no versions (data-model before the versioned packs) or none
 * this hds-lib supports.
 */
export function packVersionFor (itemKey: string, versions: unknown): string | null {
  if (!Array.isArray(versions)) return null;
  const max = versionNumber(SUPPORTED_CONVERTER_VERSIONS[itemKey] ?? 'v0');
  const usable = versions.filter((v): v is string => typeof v === 'string' && versionNumber(v) <= max);
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (versionNumber(b) > versionNumber(a) ? b : a));
}

/** Fetch a converter pack. A 404 gives `null` when `missingOk`; any other failure throws. */
async function fetchPack (url: string, missingOk: boolean): Promise<ConverterPack | null> {
  const response = await fetch(url);
  if (missingOk && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch converter pack: ${url} (${response.status})`);
  }
  return await response.json();
}

/**
 * The locales whose converter texts may be shown: those preferred to `en`. A pack carries `en` and `fr` itself, so
 * nothing after `en` is ever read, and `fr` needs no file.
 */
function textLocales (): string[] {
  const preferred = getPreferredLocales();
  return preferred.slice(0, preferred.indexOf('en')).filter((l) => l !== 'fr');
}

/**
 * Converters — Extension of HDSModel
 *
 * Lazy-loads converter packs from the model's base URL:
 *   {modelBaseUrl}/converters/{itemKey}/pack-{version}.json
 * where `version` is the highest of the converter index's `versions` this hds-lib supports
 * (`SUPPORTED_CONVERTER_VERSIONS`). A model without `versions` or without that file (404) is read from
 * `pack-latest.json`, which data-model keeps frozen at the v0 pack for hds-lib before 2.60.0.
 *
 * The main pack.json only contains the converter index (item keys + versions).
 * Full converter data (dimensions + methods) is fetched on first use and cached.
 *
 * All conversion methods are async (first call fetches, subsequent calls are instant).
 *
 * The texts of the other languages are in `{modelBaseUrl}/converters/{itemKey}/l10n-{locale}.json` (data-model
 * `documentation/L10N.md`): fetched with the pack for the preferred languages, and again when they change (`loadTexts`).
 * A missing or unreadable file leaves the texts of the pack.
 */
export class HDSModelConverters {
  #model: HDSModel;
  #engines: Record<string, EuclidianDistanceEngine> = {};
  #pendingLoads: Record<string, Promise<EuclidianDistanceEngine>> = {};
  #itemKeyByEventType: Record<string, string> = {};
  /** The fetched packs: their url, and per locale the load of its texts (once, failed or not). */
  #packs: Record<string, { pack: ConverterPack, url: string, texts: Record<string, Promise<void>> }> = {};
  #followsLocales = false;

  constructor (model: HDSModel) {
    this.#model = model;
  }

  /** List available converter item keys (from the index, may not be loaded yet) */
  get availableItemKeys (): string[] {
    const converters = this.#model.modelData.converters;
    return converters ? Object.keys(converters) : [];
  }

  /** List loaded converter item keys */
  get loadedItemKeys (): string[] {
    return Object.keys(this.#engines);
  }

  /**
   * Load a converter pack manually.
   * Bridges and apps can call this to register packs without fetching from URL.
   */
  loadPack (pack: ConverterPack): void {
    if (pack.engine !== 'euclidian-distance') {
      throw new Error(`Unknown converter engine: "${pack.engine}". Only "euclidian-distance" is supported.`);
    }
    this.#engines[pack.itemKey] = new EuclidianDistanceEngine(pack);
    this.#itemKeyByEventType[pack.eventType] = pack.itemKey;
  }

  /** Get a loaded engine (returns undefined if not yet loaded) */
  getEngine (itemKey: string): EuclidianDistanceEngine | undefined {
    return this.#engines[itemKey];
  }

  /**
   * Ensure a converter engine is loaded for the given item key.
   * Fetches the pack of the highest supported converter version on first call, returns cached engine on subsequent calls.
   */
  async ensureEngine (itemKey: string): Promise<EuclidianDistanceEngine> {
    if (this.#engines[itemKey]) return this.#engines[itemKey];
    if (this.#pendingLoads[itemKey]) return this.#pendingLoads[itemKey];

    this.#pendingLoads[itemKey] = this.#fetchAndLoadPack(itemKey);
    try {
      const engine = await this.#pendingLoads[itemKey];
      return engine;
    } finally {
      delete this.#pendingLoads[itemKey];
    }
  }

  /**
   * Load the texts of the preferred languages for the engines already loaded. Called on each change of the preferred
   * languages; an app that switches language awaits it to render the converter texts in the new one. Never throws.
   */
  async loadTexts (): Promise<void> {
    await Promise.all(Object.keys(this.#packs).map((itemKey) => this.#loadTextsOf(itemKey)));
  }

  /**
   * Convert a source method observation into a Pryv event structure.
   *
   * @param itemKey - converter item key (e.g. 'cervical-fluid', 'mood')
   * @param sourceMethod - source method id (e.g. 'mira', 'appleHealth')
   * @param dataFromSource - raw observation from the source method
   * @param modelVersion - version of the model definition used (default: the method's `modelVersion` in the pack,
   *   else the engine's version)
   * @returns Pryv event-like object with type, streamIds, content
   */
  async convertMethodToEvent (itemKey: string, sourceMethod: string, dataFromSource: any, modelVersion?: string): Promise<any> {
    const engine = await this.ensureEngine(itemKey);
    const itemDef = this.#getItemDef(itemKey);

    const vector = engine.toVector(sourceMethod, dataFromSource);

    const source: SourceBlock = {
      key: sourceMethod,
      sourceData: dataFromSource,
      engineVersion: engine.converterVersion,
      modelVersion: modelVersion ?? engine.getMethodDef(sourceMethod)?.modelVersion ?? engine.converterVersion,
    };

    return {
      type: engine.eventType,
      streamIds: [itemDef.streamId],
      content: {
        vectors: vector,
        source,
      },
    };
  }

  /**
   * Convert a stored event to a target method observation.
   *
   * @param event - Pryv event with content.vectors (the N-D vector)
   * @param targetMethod - target method id
   * @returns { data, matchDistance }
   */
  async convertEventToMethod (event: any, targetMethod: string): Promise<ConversionResult> {
    const itemKey = await this.#findItemKeyForEvent(event);
    const engine = await this.ensureEngine(itemKey);

    const vector: ObservationVector = event.content?.vectors;
    if (!vector || typeof vector !== 'object') {
      throw new Error(`Event content.vectors is not a valid vector: ${JSON.stringify(event.content)}`);
    }

    return engine.fromVector(targetMethod, vector);
  }

  /**
   * Convert directly between two methods.
   *
   * @param itemKey - converter item key
   * @param sourceMethod - source method id
   * @param targetMethod - target method id
   * @param data - observation in the source method
   * @returns { data, matchDistance }
   */
  async convertMethodToMethod (itemKey: string, sourceMethod: string, targetMethod: string, data: any): Promise<ConversionResult> {
    const engine = await this.ensureEngine(itemKey);
    return engine.convertMethodToMethod(sourceMethod, targetMethod, data);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  async #fetchAndLoadPack (itemKey: string): Promise<EuclidianDistanceEngine> {
    // Check the converter index exists
    const converters = this.#model.modelData.converters;
    if (!converters?.[itemKey]) {
      throw new Error(`Unknown converter item key: "${itemKey}". Available: [${this.availableItemKeys.join(', ')}]`);
    }

    // Derive URL from model base URL
    const modelUrl = this.#model.modelUrl;
    const converterUrl = `${modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1)}converters/${itemKey}/`;
    const version = packVersionFor(itemKey, converters[itemKey].versions);
    let url = `${converterUrl}pack-${version}.json`;
    let pack = version ? await fetchPack(url, true) : null;
    if (version && !pack) logger.warn(`Converter pack ${itemKey} ${version} not found; reading pack-latest.json`);
    if (!pack) {
      url = `${converterUrl}pack-latest.json`;
      pack = (await fetchPack(url, false))!;
    }

    if (pack.engine !== 'euclidian-distance') {
      throw new Error(`Unknown converter engine: "${pack.engine}" in pack for "${itemKey}"`);
    }

    this.#packs[itemKey] = { pack, url, texts: {} };
    if (!this.#followsLocales) {
      this.#followsLocales = true;
      // weak: the listener must not keep a replaced model in memory
      const self = new WeakRef(this);
      const stop = onPreferredLocalesChange(() => {
        const converters = self.deref();
        if (converters) converters.loadTexts(); else stop();
      });
    }
    await this.#loadTextsOf(itemKey);

    const engine = new EuclidianDistanceEngine(pack);
    this.#engines[itemKey] = engine;
    this.#itemKeyByEventType[engine.eventType] = itemKey;
    return engine;
  }

  async #loadTextsOf (itemKey: string): Promise<void> {
    const { pack, url, texts } = this.#packs[itemKey];
    await Promise.all(textLocales().map((locale) => (texts[locale] ??= this.#fetchTexts(pack, url, locale))));
  }

  /** A language without its file (404), or whose file cannot be read, keeps the pack's own texts. */
  async #fetchTexts (pack: ConverterPack, packUrl: string, locale: string): Promise<void> {
    const at = packUrl.lastIndexOf('/') + 1;
    const url = `${packUrl.substring(0, at)}l10n-${locale}.json`;
    try {
      const response = await fetch(url);
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`status ${response.status}`);
      const texts = (await response.json())?.packs?.[packUrl.substring(at)];
      if (texts != null && typeof texts === 'object') addPackTexts(pack, locale, texts);
    } catch (e: any) {
      logger.warn(`Converter texts not loaded: ${url} (${e?.message ?? e})`);
    }
  }

  #getItemDef (itemKey: string): any {
    const items = this.#model.modelData.items;
    for (const [_key, item] of Object.entries(items) as [string, any][]) {
      const ce = item['converter-engine'];
      if (ce && ce.models === itemKey) {
        return item;
      }
    }
    throw new Error(`No itemDef found with converter-engine.models="${itemKey}"`);
  }

  async #findItemKeyForEvent (event: any): Promise<string> {
    const eventType = event.type;

    // Check already-loaded engines
    const cached = this.#itemKeyByEventType[eventType];
    if (cached) return cached;

    // Check itemDefs for a matching eventType with converter-engine
    const items = this.#model.modelData.items;
    for (const [_key, item] of Object.entries(items) as [string, any][]) {
      if (item.eventType === eventType && item['converter-engine']) {
        const itemKey = item['converter-engine'].models;
        await this.ensureEngine(itemKey);
        return itemKey;
      }
    }

    throw new Error(`No converter found for event type: "${eventType}"`);
  }
}
