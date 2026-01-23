"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSModelEventTypes = void 0;
/**
 * Streams - Extension of HDSModel
 */
class HDSModelEventTypes {
    /**
     * Model instance
     */
    #model;
    constructor(model) {
        this.#model = model;
    }
    getEventTypeDefinition(eventType) {
        return this.#model.modelData.eventTypes.types[eventType];
    }
    getEventTypeExtra(eventType) {
        return this.#model.modelData.eventTypes.extras[eventType];
    }
    getEventTypeSymbol(eventType) {
        return this.#model.modelData.eventTypes.extras[eventType]?.symbol || null;
    }
}
exports.HDSModelEventTypes = HDSModelEventTypes;
//# sourceMappingURL=HDSModel-EventTypes.js.map