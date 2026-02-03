"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModel = getModel;
exports.resetModel = resetModel;
exports.initHDSModel = initHDSModel;
const HDSModel_1 = require("./HDSModel");
const HDSService_1 = require("../HDSService");
let hdsModelInstance = null;
function getModel() {
    if (hdsModelInstance == null) {
        hdsModelInstance = new HDSModel_1.HDSModel('');
    }
    return hdsModelInstance;
}
/**
 * Mostly used during test to unload model
 */
function resetModel() {
    hdsModelInstance = null;
}
/**
 * Initialized model singleton
 */
async function initHDSModel() {
    if (!hdsModelInstance) {
        getModel();
    }
    if (!hdsModelInstance.isLoaded) {
        const service = new HDSService_1.HDSService();
        const serviceInfo = await service.info();
        await hdsModelInstance.load(serviceInfo.assets['hds-model']);
    }
    return hdsModelInstance;
}
//# sourceMappingURL=HDSModelInitAndSingleton.js.map