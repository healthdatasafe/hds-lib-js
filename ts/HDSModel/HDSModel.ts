import { HDSLibError } from '../errors.ts';
import { deepFreeze } from '../utils.ts';
import { HDSModelStreams } from './HDSModel-Streams.ts';
import { HDSModelAuthorizations } from './HDSModel-Authorizations.ts';
import { HDSModelItemsDefs } from './HDSModel-ItemsDefs.ts';
import { HDSModelEventTypes } from './HDSModel-EventTypes.ts';
import { HDSModelDatasources } from './HDSModel-Datasources.ts';
import { HDSModelConversions } from './HDSModel-Conversions.ts';
import { HDSModelConverters } from './HDSModel-Converters.ts';
import { HDSModelPreferred } from './HDSModel-Preferred.ts';
import { HDSModelAppStreams } from './HDSModel-AppStreams.ts';
import { HDSModelVocabularies } from './HDSModel-Vocabularies.ts';
import { applyOverload, validateOverload, type HDSModelOverload } from './HDSModel-Overload.ts';

/**
 * The pack's JSON, retrying a transient failure (B-2026-11-02-25): the network, a 5xx, or a page that is not JSON (a
 * host's HTML error page). A 4xx is the URL's answer and throws at once.
 */
async function fetchModelJson (url: string): Promise<any> {
  const delays = HDSModel.loadRetryDelaysMs;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]));
    let response: Response;
    try {
      response = await fetch(url);
    } catch (e) {
      lastError = e;
      continue;
    }
    // judged by the status when there is one (a stubbed fetch may give only `text()`)
    if (response.status >= 400 && response.status < 500) {
      throw new HDSLibError(`Cannot load the data model from ${url}: HTTP ${response.status}`);
    }
    if (response.status >= 500) {
      lastError = new HDSLibError(`Cannot load the data model from ${url}: HTTP ${response.status}`);
      continue;
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      lastError = e;
    }
  }
  throw new HDSLibError(`Cannot load the data model from ${url}`, lastError ?? {});
}

export class HDSModel {
  /**
   * JSON definition file URL.
   * Should come from service/info assets.hds-model
   */
  #modelUrl: string;

  /** RAW content of model definitions */
  #modelData: any;

  /** Service-info assets map (e.g. { datasets: 'https://...', ... }) */
  #assets: { [key: string]: string };

  /**
   * Map of properties loaded "on demand"
   */
  public laziliyLoadedMap: { [key: string]: any } = {};

  /**
   * @param modelUrl - JSON definition file URL. Should come from service/info assets.hds-model
   */
  constructor (modelUrl: string) {
    this.#modelUrl = modelUrl;
    this.laziliyLoadedMap = {};
    this.#modelData = null;
    this.#assets = {};
  }

  /** Service-info assets used for resolving datasource endpoints */
  get assets (): { [key: string]: string } {
    return this.#assets;
  }

  set assets (value: { [key: string]: string }) {
    this.#assets = value || {};
  }

  get isLoaded (): boolean {
    return !!this.#modelData;
  }

  /** The URL the model was loaded from */
  get modelUrl (): string {
    return this.#modelUrl;
  }

  /**
   * Load model definitions.
   *
   * @param modelUrl - JSON definition URL (defaults to the one set at construct time)
   * @param overload - Optional {@link HDSModelOverload} merged into the loaded
   *   model BEFORE freezing. Lets apps add itemDefs / streams / eventTypes /
   *   settings or refine translations & default `repeatable` values without
   *   forking the data-model. See `HDSModel-Overload.ts` for the policy.
   */
  async load (modelUrl: string | null = null, overload: HDSModelOverload | null = null): Promise<void> {
    if (modelUrl) {
      this.#modelUrl = modelUrl;
    }
    const result = await fetchModelJson(this.#modelUrl);
    this.loadFromObject(result, overload);
  }

  /**
   * Waits between attempts of `load()` (ms): a transient failure (the network, a 5xx, an HTML error page where the
   * pack's JSON should be) is retried once per entry; a 4xx is not. Tests set it to `[0, 0]`.
   */
  static loadRetryDelaysMs: number[] = [1000, 3000];

  /**
   * Load model from an in-memory object (skips fetch). Useful when the
   * pack.json content is already in memory — tests, embedded apps, or
   * environments where fetch can't reach the model URL (e.g. Node with a
   * file:// URL, which Node's fetch does not yet implement).
   */
  loadFromObject (data: any, overload: HDSModelOverload | null = null): void {
    if (overload) {
      validateOverload(data, overload);
      applyOverload(data, overload);
    }
    this.#modelData = data;
    // add key to items before freezing;
    for (const [key, item] of Object.entries(this.#modelData.items)) {
      (item as any).key = key;
    }
    // make sure it cannot be modified
    deepFreeze(this.#modelData);
  }

  /** RAW model data */
  get modelData (): any {
    if (!this.isLoaded) throwNotLoadedError();
    return this.#modelData;
  }

  get itemsDefs (): HDSModelItemsDefs {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.itemsDefs) {
      this.laziliyLoadedMap.itemsDefs = new HDSModelItemsDefs(this);
    }
    return this.laziliyLoadedMap.itemsDefs;
  }

  get streams (): HDSModelStreams {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.streams) {
      this.laziliyLoadedMap.streams = new HDSModelStreams(this);
    }
    return this.laziliyLoadedMap.streams;
  }

  get authorizations (): HDSModelAuthorizations {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.authorizations) {
      this.laziliyLoadedMap.authorizations = new HDSModelAuthorizations(this);
    }
    return this.laziliyLoadedMap.authorizations;
  }

  get eventTypes (): HDSModelEventTypes {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.eventTypes) {
      this.laziliyLoadedMap.eventTypes = new HDSModelEventTypes(this);
    }
    return this.laziliyLoadedMap.eventTypes;
  }

  get datasources (): HDSModelDatasources {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.datasources) {
      this.laziliyLoadedMap.datasources = new HDSModelDatasources(this);
    }
    return this.laziliyLoadedMap.datasources;
  }

  get conversions (): HDSModelConversions {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.conversions) {
      this.laziliyLoadedMap.conversions = new HDSModelConversions(this);
    }
    return this.laziliyLoadedMap.conversions;
  }

  get converters (): HDSModelConverters {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.converters) {
      this.laziliyLoadedMap.converters = new HDSModelConverters(this);
    }
    return this.laziliyLoadedMap.converters;
  }

  get preferred (): HDSModelPreferred {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.preferred) {
      this.laziliyLoadedMap.preferred = new HDSModelPreferred(this);
    }
    return this.laziliyLoadedMap.preferred;
  }

  get appStreams (): HDSModelAppStreams {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.appStreams) {
      this.laziliyLoadedMap.appStreams = new HDSModelAppStreams(this);
    }
    return this.laziliyLoadedMap.appStreams;
  }

  get vocabularies (): HDSModelVocabularies {
    if (!this.isLoaded) throwNotLoadedError();
    if (!this.laziliyLoadedMap.vocabularies) {
      this.laziliyLoadedMap.vocabularies = new HDSModelVocabularies(this);
    }
    return this.laziliyLoadedMap.vocabularies;
  }
}

function throwNotLoadedError (): never {
  throw new HDSLibError('Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
}
