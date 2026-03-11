"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSModelDatasources = void 0;
const HDSDatasourceDef_1 = require("./HDSDatasourceDef");
/**
 * Datasources - Extension of HDSModel
 */
class HDSModelDatasources {
    #model;
    #datasourceDefs;
    constructor(model) {
        this.#model = model;
        this.#datasourceDefs = {};
    }
    /**
     * get all datasource definitions
     */
    getAll() {
        const res = [];
        for (const key of Object.keys(this.#model.modelData.datasources || {})) {
            res.push(this.forKey(key));
        }
        return res;
    }
    /**
     * get datasource definition for a key
     */
    forKey(key, throwErrorIfNotFound = true) {
        if (this.#datasourceDefs[key])
            return this.#datasourceDefs[key];
        const datasources = this.#model.modelData.datasources || {};
        const defData = datasources[key];
        if (!defData) {
            if (throwErrorIfNotFound)
                throw new Error('Cannot find datasource definition with key: ' + key);
            return null;
        }
        this.#datasourceDefs[key] = new HDSDatasourceDef_1.HDSDatasourceDef(key, defData, () => this.#model.assets);
        return this.#datasourceDefs[key];
    }
}
exports.HDSModelDatasources = HDSModelDatasources;
