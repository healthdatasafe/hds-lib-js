import HDSItemDef from "./HDSItemDef";
export = HDSModelStreams;
/**
 * Streams - Extension of HDSModel
 */
declare class HDSModelStreams {
    constructor(model: any);
    /**
     * Get a list of streams to be created for usage of these keys (whithout children)
     * @param {Array<string>|Array<HDSItemDef>} itemKeysOrDefs
     * @param {Object} params
     * @param {String} [params.nameProperty = 'name'] - can be set to 'name' (default), 'defaultName' or 'none' => if you want nothing
     * @param {Array<string>} [params.knowExistingStreamsIds]
     */
    getNecessaryListForItems(itemKeysOrDefs: Array<string> | Array<HDSItemDef>, params?: {
        nameProperty?: string;
        knowExistingStreamsIds?: Array<string>;
    }): {
        id: any;
        parentId: any;
    }[];
    /**
     * Get stream Data by Id;
     * @param {string} streamId
     */
    getDataById(streamId: string, throwErrorIfNotFound?: boolean): any;
    /**
     * Get all parents id;
     * @param {string} streamId
     * @param {boolean} [throwErrorIfNotFound] default `true`
     * @param {Array} [initialArray] - a pre-filled array
     */
    getParentsIds(streamId: string, throwErrorIfNotFound?: boolean, initialArray?: any[]): any[];
    #private;
}
