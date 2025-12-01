"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSItemDef = void 0;
const localizeText_1 = require("../localizeText");
class HDSItemDef {
    #data;
    #key;
    constructor(key, definitionData) {
        this.#key = key;
        this.#data = definitionData;
    }
    get eventTypes() {
        if (this.#data.eventType)
            return [this.#data.eventType];
        return this.#data.variations.eventType.options.map((o) => o.value);
    }
    get key() {
        return this.#key;
    }
    get data() {
        return this.#data;
    }
    /** label Localized */
    get label() {
        return (0, localizeText_1.localizeText)(this.#data.label);
    }
    /** description Localized */
    get description() {
        return (0, localizeText_1.localizeText)(this.#data.description);
    }
    /**
     * a template event with eventType and streamIds
     * // TODO handle variations
     */
    eventTemplate() {
        return {
            streamId: this.#data.streamId,
            type: this.eventTypes[0]
        };
    }
}
exports.HDSItemDef = HDSItemDef;
//# sourceMappingURL=HDSItemDef.js.map