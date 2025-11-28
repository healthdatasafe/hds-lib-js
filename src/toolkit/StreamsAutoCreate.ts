import { HDSLibError } from '../errors';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton';
import pryv from '../patchedPryv';
import HDSItemDef from '../HDSModel/HDSItemDef';

export default class StreamsAutoCreate {
  connection: WeakRef<pryv.Connection>;
  knownStreams: { [key: string]: any } = {};

  /**
   * Safe way to create StreamsAutoCreate as it check if ones is already attached to connection
   */
  static attachToConnection (connection: pryv.Connection, knownStreamStructure?: any): StreamsAutoCreate {
    const streamsAutoCreate = (connection as any).streamsAutoCreate || new StreamsAutoCreate(connection);
    streamsAutoCreate.addStreamStructure(knownStreamStructure);
    return streamsAutoCreate;
  }

  /**
   * @private
   * Don't use.. use StreamsAutoCreate.attachToConnection
   */
  constructor (connection: pryv.Connection) {
    // make connection a weak reference to avoid cycles
    this.connection = new WeakRef(connection);
    this.knownStreams = {};
    (connection as any).streamsAutoCreate = this;
  }

  /**
   * @param keysOrDefs - Array or Set of itemDefs or itemKeys
   */
  async ensureExistsForItems (keysOrDefs: Array<string | HDSItemDef> | Set<string | HDSItemDef>): Promise<any[]> {
    // get existing streamIds;
    const modelStreams = getModel().streams;
    const streamsToCreate = modelStreams.getNecessaryListForItems(Array.from(keysOrDefs) as any, { knowExistingStreamsIds: this.knowStreamIds() });
    const apiCalls: pryv.APICall[] = streamsToCreate.map((s) => ({
      method: 'streams.create',
      params: s
    }));
    const connection = this.connection?.deref();
    if (!connection) {
      throw new Error('Lost reference to connection');
    }

    const results = await connection.api(apiCalls);
    const streamsCreated: any[] = [];
    const errors: any[] = [];
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

  knowStreamIds (): string[] {
    return Object.keys(this.knownStreams);
  }

  addStreamStructure (streamStructure: any): void {
    if (streamStructure == null) return;
    for (const stream of allStreamsAndChildren(streamStructure)) {
      this.#addStream(stream);
    }
  }

  #addStream (stream: any): void {
    if (!this.knownStreams[stream.id]) {
      this.knownStreams[stream.id] = {};
    }
  }
}

/**
 * Iterate all streams and children
 */
function * allStreamsAndChildren (streamStructure: any): Generator<any, void, unknown> {
  for (const stream of streamStructure) {
    yield stream;
    if (stream.children && stream.children.length > 0) {
      for (const child of allStreamsAndChildren(stream.children)) {
        yield child;
      }
    }
  }
}
