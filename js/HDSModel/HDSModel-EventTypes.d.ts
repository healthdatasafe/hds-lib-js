import { HDSModel } from './HDSModel';
/**
 * Streams - Extension of HDSModel
 */
export declare class HDSModelEventTypes {
    #private;
    constructor(model: HDSModel);
    getEventTypeDefinition(eventType: string): any;
    getEventTypeExtra(eventType: string): any;
    getEventTypeSymbol(eventType: string): string | null;
}
//# sourceMappingURL=HDSModel-EventTypes.d.ts.map