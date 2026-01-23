import { HDSModelStreams } from './HDSModel-Streams';
import { HDSModelAuthorizations } from './HDSModel-Authorizations';
import { HDSModelItemsDefs } from './HDSModel-ItemsDefs';
import { HDSModelEventTypes } from './HDSModel-EventTypes';
export declare class HDSModel {
    #private;
    /**
     * Map of properties loaded "on demand"
     */
    laziliyLoadedMap: {
        [key: string]: any;
    };
    /**
     * @param modelUrl - JSON definition file URL. Should come from service/info assets.hds-model
     */
    constructor(modelUrl: string);
    get isLoaded(): boolean;
    /**
     * Load model definitions
     */
    load(modelUrl?: string | null): Promise<void>;
    /** RAW model data */
    get modelData(): any;
    get itemsDefs(): HDSModelItemsDefs;
    get streams(): HDSModelStreams;
    get authorizations(): HDSModelAuthorizations;
    get eventTypes(): HDSModelEventTypes;
}
//# sourceMappingURL=HDSModel.d.ts.map