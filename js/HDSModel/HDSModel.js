"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSModel = void 0;
const errors_1 = require("../errors");
const utils_1 = require("../utils");
const HDSModel_Streams_1 = require("./HDSModel-Streams");
const HDSModel_Authorizations_1 = require("./HDSModel-Authorizations");
const HDSModel_ItemsDefs_1 = require("./HDSModel-ItemsDefs");
const HDSModel_EventTypes_1 = require("./HDSModel-EventTypes");
const HDSModel_Datasources_1 = require("./HDSModel-Datasources");
const HDSModel_Conversions_1 = require("./HDSModel-Conversions");
class HDSModel {
    /**
     * JSON definition file URL.
     * Should come from service/info assets.hds-model
     */
    #modelUrl;
    /** RAW content of model definitions */
    #modelData;
    /** Service-info assets map (e.g. { datasets: 'https://...', ... }) */
    #assets;
    /**
     * Map of properties loaded "on demand"
     */
    laziliyLoadedMap = {};
    /**
     * @param modelUrl - JSON definition file URL. Should come from service/info assets.hds-model
     */
    constructor(modelUrl) {
        this.#modelUrl = modelUrl;
        this.laziliyLoadedMap = {};
        this.#modelData = null;
        this.#assets = {};
    }
    /** Service-info assets used for resolving datasource endpoints */
    get assets() {
        return this.#assets;
    }
    set assets(value) {
        this.#assets = value || {};
    }
    get isLoaded() {
        return !!this.#modelData;
    }
    /**
     * Load model definitions
     */
    async load(modelUrl = null) {
        if (modelUrl) {
            this.#modelUrl = modelUrl;
        }
        const response = await fetch(this.#modelUrl);
        const resultText = await response.text();
        const result = JSON.parse(resultText);
        this.#modelData = result;
        // add key to items before freezing;
        for (const [key, item] of Object.entries(this.#modelData.items)) {
            item.key = key;
        }
        // make sure it cannot be modified
        (0, utils_1.deepFreeze)(this.#modelData);
    }
    /** RAW model data */
    get modelData() {
        if (!this.isLoaded)
            throwNotLoadedError();
        return this.#modelData;
    }
    get itemsDefs() {
        if (!this.isLoaded)
            throwNotLoadedError();
        if (!this.laziliyLoadedMap.itemsDefs) {
            this.laziliyLoadedMap.itemsDefs = new HDSModel_ItemsDefs_1.HDSModelItemsDefs(this);
        }
        return this.laziliyLoadedMap.itemsDefs;
    }
    get streams() {
        if (!this.isLoaded)
            throwNotLoadedError();
        if (!this.laziliyLoadedMap.streams) {
            this.laziliyLoadedMap.streams = new HDSModel_Streams_1.HDSModelStreams(this);
        }
        return this.laziliyLoadedMap.streams;
    }
    get authorizations() {
        if (!this.isLoaded)
            throwNotLoadedError();
        if (!this.laziliyLoadedMap.authorizations) {
            this.laziliyLoadedMap.authorizations = new HDSModel_Authorizations_1.HDSModelAuthorizations(this);
        }
        return this.laziliyLoadedMap.authorizations;
    }
    get eventTypes() {
        if (!this.isLoaded)
            throwNotLoadedError();
        if (!this.laziliyLoadedMap.eventTypes) {
            this.laziliyLoadedMap.eventTypes = new HDSModel_EventTypes_1.HDSModelEventTypes(this);
        }
        return this.laziliyLoadedMap.eventTypes;
    }
    get datasources() {
        if (!this.isLoaded)
            throwNotLoadedError();
        if (!this.laziliyLoadedMap.datasources) {
            this.laziliyLoadedMap.datasources = new HDSModel_Datasources_1.HDSModelDatasources(this);
        }
        return this.laziliyLoadedMap.datasources;
    }
    get conversions() {
        if (!this.isLoaded)
            throwNotLoadedError();
        if (!this.laziliyLoadedMap.conversions) {
            this.laziliyLoadedMap.conversions = new HDSModel_Conversions_1.HDSModelConversions(this);
        }
        return this.laziliyLoadedMap.conversions;
    }
}
exports.HDSModel = HDSModel;
function throwNotLoadedError() {
    throw new errors_1.HDSLibError('Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
}
//# sourceMappingURL=HDSModel.js.map