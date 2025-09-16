const { HDSLibError } = require('../errors');
const { deepFreeze } = require('../utils');

const LAZILY_LOADED = {
  streams: require('./HDSModel-Streams'),
  authorizations: require('./HDSModel-Authorizations'),
  itemsDefs: require('./HDSModel-ItemsDefs')
};

/**
 * @class {HDSModel}
 * @property {object} modelData - Raw ModelData
 * @property {HDSModelItemsDefs} itemsDefs
 * @property {HDSModelStreams} streams
 * @property {HDSModelAuthorizations} authorizations
 */
class HDSModel {
  /**
   * JSON definition file URL.
   * Should come from service/info assets.hds-model
   * @type {string}
   */
  #modelUrl;

  /** @type {object} RAW content of model definitions */
  #modelData;

  /**
   * @private
   * Map of properties loaded "on demand"
   */
  laziliyLoadedMap;

  /**
   * @param {string} modelUrl - JSON definition file URL. Should come from service/info assets.hds-model
   */
  constructor (modelUrl) {
    this.#modelUrl = modelUrl;
    this.laziliyLoadedMap = { };
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
    deepFreeze(this.#modelData);
  }

  /** RAW model data */
  get modelData () {
    if (!this.isLoaded) throwNotLoadedError();
    return this.#modelData;
  }
}

// add properties to be lazily loaded
for (const [prop, Obj] of Object.entries(LAZILY_LOADED)) {
  Object.defineProperty(HDSModel.prototype, prop, {
    get: function () {
      if (!this.isLoaded) throwNotLoadedError();
      if (!this.laziliyLoadedMap[prop]) this.laziliyLoadedMap[prop] = new Obj(this);
      return this.laziliyLoadedMap[prop];
    }
  });
}

module.exports = HDSModel;

function throwNotLoadedError () {
  throw new HDSLibError('Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
}
