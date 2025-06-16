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
   * streamsById
   * Map to find streams by Id
   */
  #modelStreamsById;

  /**
   * JSON definition file
   * Should come from service/info assets.hds-model
   * @type {string}
   */
  constructor (modelUrl) {
    this.#modelUrl = modelUrl;
    this.#itemsDefs = {};
    this.#modelDataByStreamIdEventTypes = {};
    this.#modelStreamsById = {};
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
    loadModelStreamsById(this.#modelData.streams, this.#modelStreamsById);
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

  /**
   * Get a list of streams to be created for usage of these keys (whithout children)
   * @param {Array<string>} itemKeys
   */
  streamsGetNecessaryListForItemKeys (itemKeys) {
    const result = [];
    const streams = new Map(); // tempMap to keep streams already in
    for (const itemKey of itemKeys) {
      const itemDef = this.itemDefForKey(itemKey);
      const streamParentIds = this.streamGetParentsIds(itemDef.data.streamId, true, [itemDef.data.streamId]);
      for (const streamId of streamParentIds) {
        if (streams.has(streamId)) continue;
        const stream = this.streamDataGetById(streamId);
        streams.set(streamId, true); // just to flag
        result.push({
          id: streamId,
          name: stream.name, // to be translated
          parentId: stream.parentId
        });
      }
    }
    return result;
  }

  /**
   * Get stream Data by Id;
   * @param {string} streamId
   */
  streamDataGetById (streamId, throwErrorIfNotFound = true) {
    const streamData = this.#modelStreamsById[streamId];
    if (throwErrorIfNotFound && !streamData) throw new Error(`Stream with id: "${streamId}" not found`);
    return streamData;
  }

  /**
   * Get all parents id;
   * @param {string} streamId
   * @param {boolean} [throwErrorIfNotFound] default `true`
   * @param {Array} [initialArray] - a pre-filled array
   */
  streamGetParentsIds (streamId, throwErrorIfNotFound = true, initialArray = []) {
    const streamData = this.streamDataGetById(streamId, throwErrorIfNotFound);
    if (!streamData) return initialArray;
    if (streamData.parentId !== null) {
      initialArray.unshift(streamData.parentId);
      this.streamGetParentsIds(streamData.parentId, true, initialArray);
    }
    return initialArray;
  }

  // --------- authorizations builder ------ //

  /**
   * @typedef {Object} AuthorizationRequestItem
   * @property {string} streamId
   * @property {string} level
   * @property {string} defaultName
   */

  /**
   * Get minimal Authorization set for itemKeys
   * /!\ Does not handle requests with streamId = "*"
   * @param {Array<itemKeys>} itemKeys
   * @param {Object} [options]
   * @param {string} [options.defaultLevel] (default = write) one of 'read', 'write', 'contribute', 'writeOnly'
   * @param {Array<AuthorizationRequestItem>} [options.preRequest]
   * @return {Array<AuthorizationRequestItem>}
   */
  authorizationForItemKeys (itemKeys, options = {}) {
    const opts = {
      defaultLevel: 'read',
      preRequest: []
    };
    Object.assign(opts, options);
    const streamsRequested = {};
    for (const pre of opts.preRequest) {
      if (!pre.streamId) throw new Error(`Missing streamId in options.preRequest item: ${JSON.stringify(pre)}`);
      // complete pre with defaultName if missing
      if (!pre.defaultName) {
        // try to get it from streams Data
        const stream = this.streamDataGetById(pre.streamId, false);
        if (stream) {
          pre.defaultName = stream.name;
        } else {
          throw new Error(`No "defaultName" in options.preRequest item: ${JSON.stringify(pre)} and cannot find matching streams in default list`);
        }
        // add default level
        if (!pre.level) {
          pre.level = opts.defaultLevel;
        }
      }
      streamsRequested[pre.streamId] = pre;
    }
    // add streamId not already in
    for (const itemKey of itemKeys) {
      const itemDef = this.itemDefForKey(itemKey);
      const streamId = itemDef.data.streamId;
      if (!streamsRequested[streamId]) { // new streamId
        const stream = this.streamDataGetById(streamId);
        streamsRequested[streamId] = { streamId, defaultName: stream.name, level: opts.defaultLevel };
      } else { // existing just adapt level
        streamsRequested[streamId].level = mixAuthorizationLevels(streamsRequested[streamId].level, opts.defaultLevel);
      }
    }
    // remove all permissions with a parent having identical or higher level
    for (const auth of Object.values(streamsRequested)) {
      const parents = this.streamGetParentsIds(auth.streamId, false);
      for (const parent of parents) {
        const found = streamsRequested[parent];
        if (found && authorizationOverride(found.level, auth.level)) {
          // delete entry
          delete streamsRequested[auth.streamId];
          // break loop
          continue;
        }
      }
    }
    return Object.values(streamsRequested);
  }
}

module.exports = HDSModel;

/**
 * Authorization level1 (parent) does override level2
 * Return "true" if identical or level1 == "manage"
 */
function authorizationOverride (level1, level2) {
  if (level1 === level2) return true;
  if (level1 === 'manage') return true;
  return false;
}

/**
 * Given two authorization level, give the resulting one
 * @param {string} level1
 * @param {string} level1
 * @returns {string} level
 */
function mixAuthorizationLevels (level1, level2) {
  if (level1 === level2) return level1;
  // sort level in orders [ 'contribute', 'manage', 'read', 'writeOnly' ]
  const levels = [level1, level2].sort();
  if (levels.includes('manage')) return 'manage'; // any & manage
  if (levels[0] === 'contribute') return 'contribute'; // read ore writeOnly & contribute
  if (levels[1] === 'writeOnly') return 'contribute'; // mix read & writeOnly
  // error if there .. 'read' & 'read' should have already be found
  throw new Error(`Invalid level found level1: ${level1}, level2 ${level2}`);
}

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
      if (map[keyStreamIdEventType]) throw new Error(`Duplicate streamId + eventType "${keyStreamIdEventType}" for item ${JSON.stringify(item)}`);
      map[keyStreamIdEventType] = item;
    }
  }
}

/**
 * @param {Array<stream>} streams
 * @param {Object<string, stream>} map - key value map
 */
function loadModelStreamsById (streams, map) {
  if (!streams) return;
  for (const stream of streams) {
    if (map[stream.id]) throw new Error(`Duplicate streamId "${stream.id}" for strean ${JSON.stringify(stream)}`);
    map[stream.id] = stream;
    loadModelStreamsById(stream.children, map);
  }
}
