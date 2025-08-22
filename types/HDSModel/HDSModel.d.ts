export = HDSModel;
/**
 * @class {HDSModel}
 * @property {object} modelData - Raw ModelData
 * @property {HDSModelItemsDefs} itemsDefs
 * @property {HDSModelStreams} streams
 * @property {HDSModelAuthorizations} authorizations
 */
declare class HDSModel {
    /**
     * @param {string} modelUrl - JSON definition file URL. Should come from service/info assets.hds-model
     */
    constructor(modelUrl: string);
    /**
     * @private
     * Map of properties loaded "on demand"
     */
    private laziliyLoadedMap;
    get isLoaded(): boolean;
    /**
     * Load model definitions
     */
    load(modelUrl?: any): Promise<void>;
    /** RAW model data */
    get modelData(): any;
    #private;
}
