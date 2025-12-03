'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.HDSModelItemsDefs = void 0;
const HDSItemDef_1 = require('./HDSItemDef');
/**
 * ItemsDefs - Extension of HDSModel
 */
class HDSModelItemsDefs {
  /**
     * Model instance
     */
  #model;
  /**
     * ItemDefs Cache
     * KeyValue of itemsDefs
     */
  #itemsDefs;
  /**
     * get itemsData by streamId and eventType
     */
  #modelDataByStreamIdEventTypes;
  constructor (model) {
    this.#model = model;
    this.#itemsDefs = {};
    this.#modelDataByStreamIdEventTypes = {};
    loadModelDataByStreamIdEventTypes(this.#model.modelData.items, this.#modelDataByStreamIdEventTypes);
  }

  /**
     * get all itemDefs
     */
  getAll () {
    const res = [];
    for (const key of Object.keys(this.#model.modelData.items)) {
      res.push(this.forKey(key));
    }
    return res;
  }

  /**
     * get item for a key
     */
  forKey (key, throwErrorIfNotFound = true) {
    if (this.#itemsDefs[key]) { return this.#itemsDefs[key]; }
    const defData = this.#model.modelData.items[key];
    if (!defData) {
      if (throwErrorIfNotFound) { throw new Error('Cannot find item definition with key: ' + key); }
      return null;
    }
    this.#itemsDefs[key] = new HDSItemDef_1.HDSItemDef(key, defData);
    return this.#itemsDefs[key];
  }

  /**
     * get a definition for an event
     */
  forEvent (event, throwErrorIfNotFound = true) {
    const candidates = [];
    for (const streamId of event.streamIds) {
      const keyStreamIdEventType = streamId + ':' + event.type;
      const candidate = this.#modelDataByStreamIdEventTypes[keyStreamIdEventType];
      if (candidate) { candidates.push(candidate); }
    }
    if (candidates.length === 0) {
      if (throwErrorIfNotFound) { throw new Error('Cannot find definition for event: ' + JSON.stringify(event)); }
      return null;
    }
    if (candidates.length > 1) {
      throw new Error(`Found multiple matching definitions "${candidates.map(c => (c.key)).join(', ')}" for event: ${JSON.stringify(event)}`);
    }
    return this.forKey(candidates[0].key, throwErrorIfNotFound);
  }
}
exports.HDSModelItemsDefs = HDSModelItemsDefs;
/**
 * Add key to model items and
 * load modeldata item into modelDataByStreamIdEventTypes for fast search
 */
function loadModelDataByStreamIdEventTypes (model, map) {
  for (const item of Object.values(model)) {
    const eventTypes = [];
    if (item.eventType) {
      eventTypes.push(item.eventType);
    } else {
      const types = item.variations.eventType.options.map((o) => o.value);
      eventTypes.push(...types);
    }
    for (const eventType of eventTypes) {
      const keyStreamIdEventType = item.streamId + ':' + eventType;
      if (map[keyStreamIdEventType]) {
        // should be tested with a faulty model
        throw new Error(`Duplicate streamId + eventType "${keyStreamIdEventType}" for item ${JSON.stringify(item)}`);
      }
      map[keyStreamIdEventType] = item;
    }
  }
}
// # sourceMappingURL=HDSModel-ItemsDefs.js.map
