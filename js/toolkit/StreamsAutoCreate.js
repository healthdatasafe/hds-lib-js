"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamsAutoCreate = void 0;
const errors_1 = require("../errors");
const HDSModelInitAndSingleton_1 = require("../HDSModel/HDSModelInitAndSingleton");
const StreamsTools_1 = require("./StreamsTools");
class StreamsAutoCreate {
    connection;
    knownStreams = {};
    /**
     * Safe way to create StreamsAutoCreate as it check if ones is already attached to connection
     */
    static attachToConnection(connection, knownStreamStructure) {
        const streamsAutoCreate = connection.streamsAutoCreate || new StreamsAutoCreate(connection);
        streamsAutoCreate.addStreamStructure(knownStreamStructure);
        return streamsAutoCreate;
    }
    /**
     * @private
     * Don't use.. use StreamsAutoCreate.attachToConnection
     */
    constructor(connection) {
        // make connection a weak reference to avoid cycles
        this.connection = new WeakRef(connection);
        this.knownStreams = {};
        connection.streamsAutoCreate = this;
    }
    /**
     * @param keysOrDefs - Array or Set of itemDefs or itemKeys
     */
    async ensureExistsForItems(keysOrDefs) {
        // get existing streamIds;
        const modelStreams = (0, HDSModelInitAndSingleton_1.getModel)().streams;
        const streamsToCreate = modelStreams.getNecessaryListForItems(Array.from(keysOrDefs), { knowExistingStreamsIds: this.knowStreamIds() });
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
                if (result.error.id === 'item-already-exists')
                    continue; // all OK
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
            throw new errors_1.HDSLibError('Error creating streams', errors);
        }
        return streamsCreated;
    }
    knowStreamIds() {
        return Object.keys(this.knownStreams);
    }
    addStreamStructure(streamStructure) {
        if (streamStructure == null)
            return;
        for (const stream of (0, StreamsTools_1.allStreamsAndChildren)(streamStructure)) {
            this.#addStream(stream);
        }
    }
    #addStream(stream) {
        if (!this.knownStreams[stream.id]) {
            this.knownStreams[stream.id] = {};
        }
    }
}
exports.StreamsAutoCreate = StreamsAutoCreate;
//# sourceMappingURL=StreamsAutoCreate.js.map