'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.HDSModel = void 0;
const errors_1 = require('../errors');
const utils_1 = require('../utils');
const HDSModel_Streams_1 = require('./HDSModel-Streams');
const HDSModel_Authorizations_1 = require('./HDSModel-Authorizations');
const HDSModel_ItemsDefs_1 = require('./HDSModel-ItemsDefs');
class HDSModel {
  /**
     * JSON definition file URL.
     * Should come from service/info assets.hds-model
     */
  #modelUrl;
  /** RAW content of model definitions */
  #modelData;
  /**
     * Map of properties loaded "on demand"
     */
  laziliyLoadedMap = {};
  /**
     * @param modelUrl - JSON definition file URL. Should come from service/info assets.hds-model
     */
  constructor (modelUrl) {
    this.#modelUrl = modelUrl;
    this.laziliyLoadedMap = {};
    this.#modelData = null;
  }

  get isLoaded () {
    return !!this.#modelData;
  }

  /**
     * Load model definitions
     */
  async load (modelUrl = null) {
    if (modelUrl) {
      this.#modelUrl = modelUrl;
    }
    const response = await fetch(this.#modelUrl);
    const resultText = await response.text();
    const result = JSON.parse(resultText);
    this.#modelData = result;
    // add key to items before freezing;
    for (const [key, item] of Object.entries(this.#modelData.items)) {
      item.key = key;
    }
    // make sure it cannot be modified
    (0, utils_1.deepFreeze)(this.#modelData);
  }

  /** RAW model data */
  get modelData () {
    if (!this.isLoaded) { throwNotLoadedError(); }
    return this.#modelData;
  }

  get itemsDefs () {
    if (!this.isLoaded) { throwNotLoadedError(); }
    if (!this.laziliyLoadedMap.itemsDefs) {
      this.laziliyLoadedMap.itemsDefs = new HDSModel_ItemsDefs_1.HDSModelItemsDefs(this);
    }
    return this.laziliyLoadedMap.itemsDefs;
  }

  get streams () {
    if (!this.isLoaded) { throwNotLoadedError(); }
    if (!this.laziliyLoadedMap.streams) {
      this.laziliyLoadedMap.streams = new HDSModel_Streams_1.HDSModelStreams(this);
    }
    return this.laziliyLoadedMap.streams;
  }

  get authorizations () {
    if (!this.isLoaded) { throwNotLoadedError(); }
    if (!this.laziliyLoadedMap.authorizations) {
      this.laziliyLoadedMap.authorizations = new HDSModel_Authorizations_1.HDSModelAuthorizations(this);
    }
    return this.laziliyLoadedMap.authorizations;
  }
}
exports.HDSModel = HDSModel;
function throwNotLoadedError () {
  throw new errors_1.HDSLibError('Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
}
// # sourceMappingURL=HDSModel.js.map
