import { HDSLibError } from '../errors';
import { deepFreeze } from '../utils';
import { HDSModelStreams } from './HDSModel-Streams';
import { HDSModelAuthorizations } from './HDSModel-Authorizations';
import { HDSModelItemsDefs } from './HDSModel-ItemsDefs';

export class HDSModel {
  /**
   * JSON definition file URL.
   * Should come from service/info assets.hds-model
   */
  #modelUrl: string;

  /** RAW content of model definitions */
  #modelData: any;

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
  }

  get isLoaded (): boolean {
    return !!this.#modelData;
  }

  /**
   * Load model definitions
   */
  async load (modelUrl: string | null = null): Promise<void> {
    if (modelUrl) {
      this.#modelUrl = modelUrl;
    }
    const response = await fetch(this.#modelUrl);
    const resultText = await response.text();
    const result = JSON.parse(resultText);
    this.#modelData = result;
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
}

function throwNotLoadedError (): never {
  throw new HDSLibError('Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
}
