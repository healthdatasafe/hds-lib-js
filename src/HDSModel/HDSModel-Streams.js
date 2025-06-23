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
   * @param {Array<string>} itemKeys
   */
  getNecessaryListForItemKeys (itemKeys) {
    const result = [];
    const streams = new Map(); // tempMap to keep streams already in
    for (const itemKey of itemKeys) {
      const itemDef = this.#model.itemsDefs.forKey(itemKey);
      const streamParentIds = this.getParentsIds(itemDef.data.streamId, true, [itemDef.data.streamId]);
      for (const streamId of streamParentIds) {
        if (streams.has(streamId)) continue;
        const stream = this.getDataById(streamId);
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
