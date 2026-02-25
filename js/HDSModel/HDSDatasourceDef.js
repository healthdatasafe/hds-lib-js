"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSDatasourceDef = void 0;
const localizeText_1 = require("../localizeText");
class HDSDatasourceDef {
    #data;
    #key;
    constructor(key, definitionData) {
        this.#key = key;
        this.#data = definitionData;
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
    get endpoint() {
        return this.#data.endpoint;
    }
    get queryParam() {
        return this.#data.queryParam;
    }
    get minQueryLength() {
        return this.#data.minQueryLength;
    }
    get resultKey() {
        return this.#data.resultKey;
    }
    get displayFields() {
        return this.#data.displayFields;
    }
    get valueFields() {
        return this.#data.valueFields;
    }
}
exports.HDSDatasourceDef = HDSDatasourceDef;
//# sourceMappingURL=HDSDatasourceDef.js.map