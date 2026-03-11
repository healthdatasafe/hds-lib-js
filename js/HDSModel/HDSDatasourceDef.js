"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSDatasourceDef = void 0;
const localizeText_1 = require("../localizeText");
class HDSDatasourceDef {
    #data;
    #key;
    #getAssets;
    constructor(key, definitionData, getAssets) {
        this.#key = key;
        this.#data = definitionData;
        this.#getAssets = getAssets;
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
     * Resolved endpoint URL.
     * If the raw endpoint starts with `http`, it is used as-is.
     * Otherwise it is treated as `<assetKey>://<path>` and resolved
     * against the service-info assets map.
     * e.g. `datasets://medication` → `assets.datasets` + `medication`
     */
    get endpoint() {
        const raw = this.#data.endpoint;
        if (raw.startsWith('http'))
            return raw;
        const sep = raw.indexOf('://');
        if (sep === -1)
            return raw;
        const assetKey = raw.substring(0, sep);
        const path = raw.substring(sep + 3);
        const assets = this.#getAssets();
        const baseUrl = assets[assetKey];
        if (!baseUrl) {
            throw new Error(`Cannot resolve datasource endpoint "${raw}": no asset "${assetKey}" in service-info`);
        }
        // Ensure proper URL joining (handle trailing slash on baseUrl)
        return baseUrl.endsWith('/') ? baseUrl + path : baseUrl + '/' + path;
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
