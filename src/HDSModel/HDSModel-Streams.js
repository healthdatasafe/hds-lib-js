const { itemKeysOrDefsToDefs } = require('./internalModelUtils');

/**
 * Streams - Extension of HDSModel
 */
class HDSModelStreams {
  /**
   * @type {HDSModel}
   */
  #model;

  /**
   * streamsById
   * Map to find streams by Id
   */
  #modelStreamsById;

  constructor (model) {
    this.#model = model;
    this.#modelStreamsById = {};
    loadModelStreamsById(this.#model.modelData.streams, this.#modelStreamsById);
  }

  /**
   * Get a list of streams to be created for usage of these keys (whithout children)
   * @param {Array<string>|Array<HDSItemDef>} itemKeysOrDefs
   * @param {Object} params
   * @param {String} [params.nameProperty = 'name'] - can be set to 'name' (default), 'defaultName' or 'none' => if you want nothing
   * @param {Array<string>} [params.knowExistingStreamsIds]
   */
  getNecessaryListForItems (itemKeysOrDefs, params = {}) {
    const itemDefs = itemKeysOrDefsToDefs(this.#model, itemKeysOrDefs);
    const knowExistingStreamsIds = params.knowExistingStreamsIds || [];
    const nameProperty = params.nameProperty || 'name';

    const result = [];
    const streams = new Map(); // tempMap to keep streams already in
    for (const knowStreamId of knowExistingStreamsIds) {
      const strs = this.getParentsIds(knowStreamId, false, [knowStreamId]).reverse();
      for (const strId of strs) {
        streams.set(strId, true);
      }
    }
    for (const itemDef of itemDefs) {
      const streamParentIds = this.getParentsIds(itemDef.data.streamId, true, [itemDef.data.streamId]);
      const resultToBeReversed = [];
      for (let i = streamParentIds.length - 1; i > -1; i--) { // loop reverse to break as soon as we find an existing stream
        const streamId = streamParentIds[i];
        if (streams.has(streamId)) break;
        const stream = this.getDataById(streamId);
        streams.set(streamId, true); // just to flag
        const itemStream = { id: streamId, parentId: stream.parentId };
        if (nameProperty !== 'none') {
          itemStream[nameProperty] = stream.name; // to be translated
        }
        resultToBeReversed.push(itemStream);
      }
      // result need to be reversed in order to get parents created before
      result.push(...resultToBeReversed.reverse());
    }
    return result;
  }

  /**
   * Get stream Data by Id;
   * @param {string} streamId
   */
  getDataById (streamId, throwErrorIfNotFound = true) {
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
  getParentsIds (streamId, throwErrorIfNotFound = true, initialArray = []) {
    const streamData = this.getDataById(streamId, throwErrorIfNotFound);
    if (!streamData) return initialArray;
    if (streamData.parentId !== null) {
      initialArray.unshift(streamData.parentId);
      this.getParentsIds(streamData.parentId, true, initialArray);
    }
    return initialArray;
  }
}

module.exports = HDSModelStreams;

/**
 * @param {Array<stream>} streams
 * @param {Object<string, stream>} map - key value map
 */
function loadModelStreamsById (streams, map) {
  if (!streams) return;
  for (const stream of streams) {
    if (map[stream.id]) {
      // should be tested with a faulty model
      throw new Error(`Duplicate streamId "${stream.id}" for strean ${JSON.stringify(stream)}`);
    }
    map[stream.id] = stream;
    loadModelStreamsById(stream.children, map);
  }
}
