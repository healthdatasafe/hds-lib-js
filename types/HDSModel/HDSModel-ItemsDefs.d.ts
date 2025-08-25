import pryv = require('pryv');
import HDSItemDef from './HDSItemDef';
import HDSModel from './HDSModel';
export = HDSModelItemsDefs;
/**
 * ItemsDefs - Extension of HDSModel
 */
declare class HDSModelItemsDefs {
    constructor(model: HDSModel);
    /**
     * get item for a key
     * @param {string} key
     * @param {boolean} [throwErrorIfNotFound] default `true`
     */
    forKey(key: string, throwErrorIfNotFound?: boolean): HDSItemDef;
    /**
     * get a definition for an event
     * @param {Event} event
     * @param {boolean} [throwErrorIfNotFound] default `true`
     */
    forEvent(event: pryv.Event, throwErrorIfNotFound?: boolean): HDSItemDef;
    #private;
}
