import pryv = require('pryv');
import HDSItemDef from '../HDSModel/HDSItemDef';

export = StreamsAutoCreate;
declare class StreamsAutoCreate {
  /**
     * Safe way to create StreamsAutoCreate as it check if ones is already attached to connection
     * @param {Connection} connection
     * @param {*} knownStreamStructure
     * @returns {StreamsAutoCreate}
     */
  static attachToConnection(connection: pryv.Connection, knownStreamStructure: any): StreamsAutoCreate;
  /**
     * @private
     * Don't use.. use StreamsAutoCreate.attachToConnection
     * @param {Connection} connection
     */
  private constructor();
  knownStreams: {};
  /**
     * @param {Array<String|HDSItemDef>|Set<String|HDSItemDef>} keysOrDefs - Array or Set of itemDefs or itemKeys
     */
  ensureExistsForItems(keysOrDefs: Array<string | HDSItemDef> | Set<string | HDSItemDef>): Promise<pryv.Stream[]>;
  knowStreamIds(): string[];
  addStreamStructure(streamStructure: any): void;
  #private;
}
