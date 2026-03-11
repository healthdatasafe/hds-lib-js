import { HDSDatasourceDef } from './HDSDatasourceDef';
import { HDSModel } from './HDSModel';
/**
 * Datasources - Extension of HDSModel
 */
export declare class HDSModelDatasources {
    #private;
    constructor(model: HDSModel);
    /**
     * get all datasource definitions
     */
    getAll(): HDSDatasourceDef[];
    /**
     * get datasource definition for a key
     */
    forKey(key: string, throwErrorIfNotFound?: boolean): HDSDatasourceDef | null;
}
