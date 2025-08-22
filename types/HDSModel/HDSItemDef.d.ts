export = HDSItemDef;
declare class HDSItemDef {
    constructor(key: string, definitionData: any);
    get eventTypes(): any[];
    get key(): string;
    get data(): any;
    /** @type {string} label Localized */
    get label(): string;
    /** @type {string} description Localized */
    get description(): string;
    /**
     * a template event with eventType and streamIds
     * // TODO handle variations
     * @returns {Object}
     */
    eventTemplate(): any;
    #private;
}
