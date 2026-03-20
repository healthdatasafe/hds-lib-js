import { HDSModel } from './HDSModel.ts';
import { EuclidianDistanceEngine } from '../converters/EuclidianDistanceEngine.ts';
import type { ConverterPack, ObservationVector, ConversionResult, SourceBlock } from '../converters/types.ts';

/**
 * Converters — Extension of HDSModel
 *
 * Lazy-loads converter packs from the model's base URL:
 *   {modelBaseUrl}/converters/{itemKey}/pack-latest.json
 *
 * The main pack.json only contains the converter index (item keys + versions).
 * Full converter data (dimensions + methods) is fetched on first use and cached.
 *
 * All conversion methods are async (first call fetches, subsequent calls are instant).
 */
export class HDSModelConverters {
  #model: HDSModel;
  #engines: Record<string, EuclidianDistanceEngine> = {};
  #pendingLoads: Record<string, Promise<EuclidianDistanceEngine>> = {};
  #itemKeyByEventType: Record<string, string> = {};

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
   * Fetches pack-latest.json on first call, returns cached engine on subsequent calls.
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
   * Convert a source method observation into a Pryv event structure.
   *
   * @param itemKey - converter item key (e.g. 'cervical-fluid', 'mood')
   * @param sourceMethod - source method id (e.g. 'mira', 'appleHealth')
   * @param dataFromSource - raw observation from the source method
   * @param modelVersion - version of the model definition used (default: engine's version)
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
      modelVersion: modelVersion ?? engine.converterVersion,
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
    const baseUrl = modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    const packUrl = `${baseUrl}converters/${itemKey}/pack-latest.json`;

    const response = await fetch(packUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch converter pack: ${packUrl} (${response.status})`);
    }
    const pack: ConverterPack = await response.json();

    if (pack.engine !== 'euclidian-distance') {
      throw new Error(`Unknown converter engine: "${pack.engine}" in pack for "${itemKey}"`);
    }

    const engine = new EuclidianDistanceEngine(pack);
    this.#engines[itemKey] = engine;
    this.#itemKeyByEventType[engine.eventType] = itemKey;
    return engine;
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
