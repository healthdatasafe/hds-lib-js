const HDSModelItemsDefs = require('./HDSModel-ItemsDefs');
const HDSModelStreams = require('./HDSModel-Streams');
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
   * @type {HDSModelItemsDefs}
   */
  #modelItemsDefs;

  /**
   * @type {HDSModelStreams}
   */
  #modelStreams;

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
    this.#modelData = result;
    // add key to items before freezing;
    for (const [key, item] of Object.entries(this.#modelData.items)) {
      item.key = key;
    }

    deepFreeze(this.#modelData); // make sure it cannot be modified
  }

  /**
   * RAW model data
   */
  get modelData () {
    if (!this.#modelData) throw new Error('Model not loaded call `await model.load()` first.');
    return this.#modelData;
  }

  /**
   * @type HDSModelItemsDefs
   */
  get itemsDefs () {
    if (!this.#modelItemsDefs) this.#modelItemsDefs = new HDSModelItemsDefs(this);
    return this.#modelItemsDefs;
  }

  /**
   * @type HDSModelStreams
   */
  get streams () {
    if (!this.#modelStreams) this.#modelStreams = new HDSModelStreams(this);
    return this.#modelStreams;
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
   * @param {boolean} [options.includeDefaultName] (default = true) defaultNames are needed for permission requests but not for access creation
   * @param {Array<AuthorizationRequestItem>} [options.preRequest]
   * @return {Array<AuthorizationRequestItem>}
   */
  authorizationForItemKeys (itemKeys, options = {}) {
    const opts = {
      defaultLevel: 'read',
      preRequest: [],
      includeDefaultName: true
    };
    Object.assign(opts, options);
    const streamsRequested = {};
    for (const pre of opts.preRequest) {
      if (!pre.streamId) throw new Error(`Missing streamId in options.preRequest item: ${JSON.stringify(pre)}`);
      // complete pre with defaultName if missing
      if (opts.includeDefaultName && !pre.defaultName) {
        // try to get it from streams Data
        const stream = this.streams.getDataById(pre.streamId, false);
        if (stream) {
          pre.defaultName = stream.name;
        } else {
          throw new Error(`No "defaultName" in options.preRequest item: ${JSON.stringify(pre)} and cannot find matching streams in default list`);
        }
      }
      // check there is no defaultName if not required
      if (!opts.includeDefaultName) {
        if (pre.defaultName) throw new Error(`Do not include defaultName when not included explicitely on ${JSON.stringify(pre)}`);
      }
      // add default level
      if (!pre.level) {
        pre.level = opts.defaultLevel;
      }
      streamsRequested[pre.streamId] = pre;
    }
    // add streamId not already in
    for (const itemKey of itemKeys) {
      const itemDef = this.itemsDefs.forKey(itemKey);
      const streamId = itemDef.data.streamId;
      if (!streamsRequested[streamId]) { // new streamId
        const auth = { streamId, level: opts.defaultLevel };
        if (opts.includeDefaultName) {
          const stream = this.streams.getDataById(streamId);
          auth.defaultName = stream.name;
        }
        streamsRequested[streamId] = auth;
      } else { // existing just adapt level
        streamsRequested[streamId].level = mixAuthorizationLevels(streamsRequested[streamId].level, opts.defaultLevel);
      }
    }
    // remove all permissions with a parent having identical or higher level
    for (const auth of Object.values(streamsRequested)) {
      const parents = this.streams.getParentsIds(auth.streamId, false);
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
  if (level1 === 'contribute' && level2 !== 'manage') return true;
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
  /* c8 ignore next */ // error if there .. 'read' & 'read' should have already be found
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
