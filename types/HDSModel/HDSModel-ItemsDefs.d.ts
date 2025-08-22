export = HDSModelItemsDefs;
/**
 * ItemsDefs - Extension of HDSModel
 */
declare class HDSModelItemsDefs {
    constructor(model: any);
    /**
     * get item for a key
     * @param {string} key
     * @param {boolean} [throwErrorIfNotFound] default `true`
     */
    forKey(key: string, throwErrorIfNotFound?: boolean): any;
    /**
     * get a definition for an event
     * @param {Event} event
     * @param {boolean} [throwErrorIfNotFound] default `true`
     */
    forEvent(event: Event, throwErrorIfNotFound?: boolean): any;
    #private;
}
