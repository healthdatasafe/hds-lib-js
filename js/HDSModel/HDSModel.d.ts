import { HDSModelStreams } from './HDSModel-Streams';
import { HDSModelAuthorizations } from './HDSModel-Authorizations';
import { HDSModelItemsDefs } from './HDSModel-ItemsDefs';
import { HDSModelEventTypes } from './HDSModel-EventTypes';
import { HDSModelDatasources } from './HDSModel-Datasources';
import { HDSModelConversions } from './HDSModel-Conversions';
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
    /** Service-info assets used for resolving datasource endpoints */
    get assets(): {
        [key: string]: string;
    };
    set assets(value: {
        [key: string]: string;
    });
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
    get datasources(): HDSModelDatasources;
    get conversions(): HDSModelConversions;
}
//# sourceMappingURL=HDSModel.d.ts.map