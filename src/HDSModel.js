class HDSModel {
  /**
   * JSON definition file
   * Should come from service/info assets.hds-model
   * @type {string}
   */
  #modelUrl;

  /**
   * Content on model definitions
   * @type {object}
   */
  #modelData;

  /**
   * JSON definition file
   * Should come from service/info assets.hds-model
   * @type {string}
   */
  constructor (modelUrl) {
    this.#modelUrl = modelUrl;
  }

  /**
   * Load model definitions
   */
  async load () {
    const response = await fetch(this.#modelUrl);
    const resultText = await response.text();
    const result = JSON.parse(resultText);
    this.#modelData = deepFreeze(result);
  }

  /**
   * get item for a key
   * @param {string} key
   */
  itemForKey (key) {
    return this.#modelData.items[key];
  }
}

module.exports = HDSModel;

/**
 * Recursively make immutable an object
 * @param {*} object
 * @returns {*}
 */
function deepFreeze (object) {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = object[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}
