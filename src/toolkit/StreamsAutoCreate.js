const { HDSLibError } = require('../errors');
const { getModel } = require('../HDSModel/HDSModelInitAndSingleton');

class StreamsAutoCreate {
  connection;

  /**
   * Safe way to create StreamsAutoCreate as it check if ones is already attached to connection
   * @param {Connection} connection
   * @param {*} knownStreamStructure
   * @returns {StreamsAutoCreate}
   */
  static attachToConnection (connection, knownStreamStructure) {
    const streamsAutoCreate = connection.streamsAutoCreate || new StreamsAutoCreate(connection);
    streamsAutoCreate.addStreamStructure(knownStreamStructure);
    return streamsAutoCreate;
  }

  /**
   * @private
   * Don't use.. use StreamsAutoCreate.attachToConnection
   * @param {Connection} connection
   */
  constructor (connection) {
    // make connection a weak reference to avoif cycles
    this.connection = new WeakRef(connection);
    this.knownStreams = {};
    connection.streamsAutoCreate = this;
  }

  /**
   * @param {Array<String|HDSItemDef>|Set<String|HDSItemDef>} keysOrDefs - Array or Set of itemDefs or itemKeys
   */
  async ensureExistsForItems (keysOrDefs) {
    // get existing streamIds;
    const modelStreams = getModel().streams;
    const streamsToCreate = modelStreams.getNecessaryListForItems(keysOrDefs, this.knowStreamIds());
    const apiCalls = streamsToCreate.map((s) => ({
      method: 'streams.create',
      params: s
    }));
    const connection = this.connection?.deref();
    if (!connection) {
      throw new Error('Lost reference to connection');
    }

    const results = await connection.api(apiCalls);
    const streamsCreated = [];
    const errors = [];
    for (const result of results) {
      if (result.stream?.id) {
        streamsCreated.push(result.stream);
        continue;
      }
      if (result.error) {
        if (result.error.id === 'item-already-exists') continue; // all OK
        errors.push(result.error);
        continue;
      }
      // shouldn't be there
      errors.push({
        id: 'unexpected-error',
        message: 'Unexpected content in api response',
        data: result
      });
    }
    if (errors.length > 0) {
      throw new HDSLibError('Error creating streams', errors);
    }
    return streamsCreated;
  }

  knowStreamIds () {
    return Object.keys(this.knownStreams);
  }

  addStreamStructure (streamStructure) {
    if (streamStructure == null) return;
    for (const stream of allStreamsAndChildren(streamStructure)) {
      this.#addStream(stream);
    }
  }

  #addStream (stream) {
    if (!this.knownStreams[stream.id]) {
      this.knownStreams[stream.id] = {};
    }
  }
}

module.exports = StreamsAutoCreate;

/**
 * Iterate all streams and children
 * @param {*} streamStructure
 */
function * allStreamsAndChildren (streamStructure) {
  for (const stream of streamStructure) {
    yield stream;
    if (stream.children && stream.children.length > 0) {
      for (const child of allStreamsAndChildren(stream.children)) {
        yield child;
      }
    }
  }
}
