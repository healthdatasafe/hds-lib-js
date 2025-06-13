const HDSItemDef = require('./HDSItemDef');

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
   * ItemDefs Cache
   * KeyValue of itemsDefs
   */
  #itemsDefs;

  /**
   * get itemsDefs by streamId and eventType
   */
  #modelDataByStreamIdEventTypes;

  /**
   * JSON definition file
   * Should come from service/info assets.hds-model
   * @type {string}
   */
  constructor (modelUrl) {
    this.#modelUrl = modelUrl;
    this.#itemsDefs = {};
    this.#modelDataByStreamIdEventTypes = {};
  }

  /**
   * Load model definitions
   */
  async load () {
    const response = await fetch(this.#modelUrl);
    const resultText = await response.text();
    const result = JSON.parse(resultText);
    this.#modelData = result;
    loadModelDataByStreamIdEventTypes(this.#modelData.items, this.#modelDataByStreamIdEventTypes);
    deepFreeze(this.#modelData); // make sure it cannot be modified
  }

  /**
   * get item for a key
   * @param {string} key
   * @param {boolean} [throwErrorIfNotFound] default `true`
   */
  itemDefForKey (key, throwErrorIfNotFound = true) {
    if (this.#itemsDefs[key]) return this.#itemsDefs[key];
    const defData = this.#modelData.items[key];
    if (!defData) {
      if (throwErrorIfNotFound) throw new Error('Cannot find item definition with key: ' + key);
      return null;
    }
    this.#itemsDefs[key] = new HDSItemDef(key, defData);
    return this.#itemsDefs[key];
  }

  /**
   * get a definition for an event
   * @param {Event} event
   * @param {boolean} [throwErrorIfNotFound] default `true`
   */
  itemDefForEvent (event, throwErrorIfNotFound = true) {
    const candidates = [];
    for (const streamId of event.streamIds) {
      const keyStreamIdEventType = streamId + ':' + event.type;
      const candidate = this.#modelDataByStreamIdEventTypes[keyStreamIdEventType];
      if (candidate) candidates.push(candidate);
    }
    if (candidates.length === 0) {
      if (throwErrorIfNotFound) throw new Error('Cannot find definition for event: ' + JSON.stringify(event));
      return null;
    }
    if (candidates.length > 1) {
      throw new Error(`Found multiple matching definitions "${candidates.map(c => (c.key)).join(', ')}" for event: ${JSON.stringify(event)}`);
    }
    return this.itemDefForKey(candidates[0].key, throwErrorIfNotFound);
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

/**
 * @private
 * Add key to model items and
 * load modeldata item into modelDataByStreamIdEventTypes for fast search
 */
function loadModelDataByStreamIdEventTypes (model, map) {
  for (const [key, item] of Object.entries(model)) {
    // add key to item
    item.key = key;
    const eventTypes = [];
    if (item.eventType) {
      eventTypes.push(item.eventType);
    } else {
      eventTypes.push(...Object.keys(item.variations.eventType));
    }
    for (const eventType of eventTypes) {
      const keyStreamIdEventType = item.streamId + ':' + eventType;
      if (map[keyStreamIdEventType]) throw new Error(`Duplicate sreamId + eventType "${keyStreamIdEventType}" for item ${JSON.stringify(item)}`);
      map[keyStreamIdEventType] = item;
    }
  }
}
