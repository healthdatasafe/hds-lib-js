import { pryv } from '../patchedPryv';
import { HDSItemDef } from '../HDSModel/HDSItemDef';
export declare class StreamsAutoCreate {
    #private;
    connection: WeakRef<pryv.Connection>;
    knownStreams: {
        [key: string]: any;
    };
    /**
     * Safe way to create StreamsAutoCreate as it check if ones is already attached to connection
     */
    static attachToConnection(connection: pryv.Connection, knownStreamStructure?: any): StreamsAutoCreate;
    /**
     * @private
     * Don't use.. use StreamsAutoCreate.attachToConnection
     */
    constructor(connection: pryv.Connection);
    /**
     * @param keysOrDefs - Array or Set of itemDefs or itemKeys
     */
    ensureExistsForItems(keysOrDefs: Array<string | HDSItemDef> | Set<string | HDSItemDef>): Promise<any[]>;
    knowStreamIds(): string[];
    addStreamStructure(streamStructure: any): void;
}
//# sourceMappingURL=StreamsAutoCreate.d.ts.map