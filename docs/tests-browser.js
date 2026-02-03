/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./js/HDSModel/HDSItemDef.js"
/*!***********************************!*\
  !*** ./js/HDSModel/HDSItemDef.js ***!
  \***********************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HDSItemDef = void 0;
const localizeText_1 = __webpack_require__(/*! ../localizeText */ "./js/localizeText.js");
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
            streamIds: [this.#data.streamId],
            type: this.eventTypes[0]
        };
    }
}
exports.HDSItemDef = HDSItemDef;
//# sourceMappingURL=HDSItemDef.js.map

/***/ },

/***/ "./js/HDSModel/HDSModel-Authorizations.js"
/*!************************************************!*\
  !*** ./js/HDSModel/HDSModel-Authorizations.js ***!
  \************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HDSModelAuthorizations = void 0;
/**
 * Authorizations - Extension of HDSModel
 */
class HDSModelAuthorizations {
    /**
     * Model instance
     */
    #model;
    constructor(model) {
        this.#model = model;
    }
    /**
     * Get minimal Authorization set for itemKeys
     * /!\ Does not handle requests with streamId = "*"
     */
    forItemKeys(itemKeys, options = {}) {
        const opts = {
            defaultLevel: 'read',
            preRequest: [],
            includeDefaultName: true
        };
        Object.assign(opts, options);
        const streamsRequested = {};
        for (const pre of opts.preRequest) {
            if (!pre.streamId)
                throw new Error(`Missing streamId in options.preRequest item: ${JSON.stringify(pre)}`);
            // complete pre with defaultName if missing
            if (opts.includeDefaultName && !pre.defaultName) {
                // try to get it from streams Data
                const stream = this.#model.streams.getDataById(pre.streamId, false);
                if (stream) {
                    pre.defaultName = stream.name;
                }
                else {
                    throw new Error(`No "defaultName" in options.preRequest item: ${JSON.stringify(pre)} and cannot find matching streams in default list`);
                }
            }
            // check there is no defaultName if not required
            if (!opts.includeDefaultName) {
                if (pre.defaultName)
                    throw new Error(`Do not include defaultName when not included explicitely on ${JSON.stringify(pre)}`);
            }
            // add default level
            if (!pre.level) {
                pre.level = opts.defaultLevel;
            }
            streamsRequested[pre.streamId] = pre;
        }
        // add streamId not already in
        for (const itemKey of itemKeys) {
            const itemDef = this.#model.itemsDefs.forKey(itemKey);
            const streamId = itemDef.data.streamId;
            if (!streamsRequested[streamId]) { // new streamId
                const auth = { streamId, level: opts.defaultLevel };
                if (opts.includeDefaultName) {
                    const stream = this.#model.streams.getDataById(streamId);
                    auth.defaultName = stream.name;
                }
                streamsRequested[streamId] = auth;
            }
            else { // existing just adapt level
                streamsRequested[streamId].level = mixAuthorizationLevels(streamsRequested[streamId].level, opts.defaultLevel);
            }
        }
        // remove all permissions with a parent having identical or higher level
        for (const auth of Object.values(streamsRequested)) {
            const parents = this.#model.streams.getParentsIds(auth.streamId, false);
            for (const parent of parents) {
                const found = streamsRequested[parent];
                if (found && authorizationOverride(found.level, auth.level)) {
                    // delete entry
                    delete streamsRequested[auth.streamId];
                    // break loop
                    continue;
                }
            }
        }
        return Object.values(streamsRequested);
    }
}
exports.HDSModelAuthorizations = HDSModelAuthorizations;
/**
 * Authorization level1 (parent) does override level2
 * Return "true" if identical or level1 == "manage"
 */
function authorizationOverride(level1, level2) {
    if (level1 === level2)
        return true;
    if (level1 === 'manage')
        return true;
    if (level1 === 'contribute' && level2 !== 'manage')
        return true;
    return false;
}
/**
 * Given two authorization level, give the resulting one
 */
function mixAuthorizationLevels(level1, level2) {
    if (level1 === level2)
        return level1;
    // sort level in orders [ 'contribute', 'manage', 'read', 'writeOnly' ]
    const levels = [level1, level2].sort();
    if (levels.includes('manage'))
        return 'manage'; // any & manage
    if (levels[0] === 'contribute')
        return 'contribute'; // read ore writeOnly & contribute
    if (levels[1] === 'writeOnly')
        return 'contribute'; // mix read & writeOnly
    /* c8 ignore next */ // error if there .. 'read' & 'read' should have already be found
    throw new Error(`Invalid level found level1: ${level1}, level2 ${level2}`);
}
//# sourceMappingURL=HDSModel-Authorizations.js.map

/***/ },

/***/ "./js/HDSModel/HDSModel-EventTypes.js"
/*!********************************************!*\
  !*** ./js/HDSModel/HDSModel-EventTypes.js ***!
  \********************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
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

/***/ },

/***/ "./js/HDSModel/HDSModel-ItemsDefs.js"
/*!*******************************************!*\
  !*** ./js/HDSModel/HDSModel-ItemsDefs.js ***!
  \*******************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HDSModelItemsDefs = void 0;
const HDSItemDef_1 = __webpack_require__(/*! ./HDSItemDef */ "./js/HDSModel/HDSItemDef.js");
/**
 * ItemsDefs - Extension of HDSModel
 */
class HDSModelItemsDefs {
    /**
     * Model instance
     */
    #model;
    /**
     * ItemDefs Cache
     * KeyValue of itemsDefs
     */
    #itemsDefs;
    /**
     * get itemsData by streamId and eventType
     */
    #modelDataByStreamIdEventTypes;
    constructor(model) {
        this.#model = model;
        this.#itemsDefs = {};
        this.#modelDataByStreamIdEventTypes = {};
        loadModelDataByStreamIdEventTypes(this.#model.modelData.items, this.#modelDataByStreamIdEventTypes);
    }
    /**
     * get all itemDefs
     */
    getAll() {
        const res = [];
        for (const key of Object.keys(this.#model.modelData.items)) {
            res.push(this.forKey(key));
        }
        return res;
    }
    /**
     * get item for a key
     */
    forKey(key, throwErrorIfNotFound = true) {
        if (this.#itemsDefs[key])
            return this.#itemsDefs[key];
        const defData = this.#model.modelData.items[key];
        if (!defData) {
            if (throwErrorIfNotFound)
                throw new Error('Cannot find item definition with key: ' + key);
            return null;
        }
        this.#itemsDefs[key] = new HDSItemDef_1.HDSItemDef(key, defData);
        return this.#itemsDefs[key];
    }
    /**
     * get a definition for an event
     */
    forEvent(event, throwErrorIfNotFound = true) {
        const candidates = [];
        for (const streamId of event.streamIds) {
            const keyStreamIdEventType = streamId + ':' + event.type;
            const candidate = this.#modelDataByStreamIdEventTypes[keyStreamIdEventType];
            if (candidate)
                candidates.push(candidate);
        }
        if (candidates.length === 0) {
            if (throwErrorIfNotFound)
                throw new Error('Cannot find definition for event: ' + JSON.stringify(event));
            return null;
        }
        if (candidates.length > 1) {
            throw new Error(`Found multiple matching definitions "${candidates.map(c => (c.key)).join(', ')}" for event: ${JSON.stringify(event)}`);
        }
        return this.forKey(candidates[0].key, throwErrorIfNotFound);
    }
}
exports.HDSModelItemsDefs = HDSModelItemsDefs;
/**
 * Add key to model items and
 * load modeldata item into modelDataByStreamIdEventTypes for fast search
 */
function loadModelDataByStreamIdEventTypes(model, map) {
    for (const item of Object.values(model)) {
        const eventTypes = [];
        if (item.eventType) {
            eventTypes.push(item.eventType);
        }
        else {
            const types = item.variations.eventType.options.map((o) => o.value);
            eventTypes.push(...types);
        }
        for (const eventType of eventTypes) {
            const keyStreamIdEventType = item.streamId + ':' + eventType;
            if (map[keyStreamIdEventType]) {
                // should be tested with a faulty model
                throw new Error(`Duplicate streamId + eventType "${keyStreamIdEventType}" for item ${JSON.stringify(item)}`);
            }
            map[keyStreamIdEventType] = item;
        }
    }
}
//# sourceMappingURL=HDSModel-ItemsDefs.js.map

/***/ },

/***/ "./js/HDSModel/HDSModel-Streams.js"
/*!*****************************************!*\
  !*** ./js/HDSModel/HDSModel-Streams.js ***!
  \*****************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HDSModelStreams = void 0;
const internalModelUtils_1 = __webpack_require__(/*! ./internalModelUtils */ "./js/HDSModel/internalModelUtils.js");
/**
 * Streams - Extension of HDSModel
 */
class HDSModelStreams {
    /**
     * Model instance
     */
    #model;
    /**
     * streamsById
     * Map to find streams by Id
     */
    #modelStreamsById;
    constructor(model) {
        this.#model = model;
        this.#modelStreamsById = {};
        loadModelStreamsById(this.#model.modelData.streams, this.#modelStreamsById);
    }
    /**
     * Get a list of streams to be created for usage of these keys (whithout children)
     */
    getNecessaryListForItems(itemKeysOrDefs, params = {}) {
        const itemDefs = (0, internalModelUtils_1.itemKeysOrDefsToDefs)(this.#model, itemKeysOrDefs);
        const knowExistingStreamsIds = params.knowExistingStreamsIds || [];
        const nameProperty = params.nameProperty || 'name';
        const result = [];
        const streams = new Map(); // tempMap to keep streams already in
        for (const knowStreamId of knowExistingStreamsIds) {
            const strs = this.getParentsIds(knowStreamId, false, [knowStreamId]).reverse();
            for (const strId of strs) {
                streams.set(strId, true);
            }
        }
        for (const itemDef of itemDefs) {
            const streamParentIds = this.getParentsIds(itemDef.data.streamId, true, [itemDef.data.streamId]);
            const resultToBeReversed = [];
            for (let i = streamParentIds.length - 1; i > -1; i--) { // loop reverse to break as soon as we find an existing stream
                const streamId = streamParentIds[i];
                if (streams.has(streamId))
                    break;
                const stream = this.getDataById(streamId);
                streams.set(streamId, true); // just to flag
                const itemStream = { id: streamId, parentId: stream.parentId };
                if (nameProperty !== 'none') {
                    itemStream[nameProperty] = stream.name; // to be translated
                }
                resultToBeReversed.push(itemStream);
            }
            // result need to be reversed in order to get parents created before
            result.push(...resultToBeReversed.reverse());
        }
        return result;
    }
    /**
     * Get stream Data by Id;
     */
    getDataById(streamId, throwErrorIfNotFound = true) {
        const streamData = this.#modelStreamsById[streamId];
        if (throwErrorIfNotFound && !streamData)
            throw new Error(`Stream with id: "${streamId}" not found`);
        return streamData;
    }
    /**
     * Get all parents id;
     */
    getParentsIds(streamId, throwErrorIfNotFound = true, initialArray = []) {
        const streamData = this.getDataById(streamId, throwErrorIfNotFound);
        if (!streamData)
            return initialArray;
        if (streamData.parentId !== null) {
            initialArray.unshift(streamData.parentId);
            this.getParentsIds(streamData.parentId, true, initialArray);
        }
        return initialArray;
    }
}
exports.HDSModelStreams = HDSModelStreams;
/**
 * @param streams
 * @param map - key value map
 */
function loadModelStreamsById(streams, map) {
    if (!streams)
        return;
    for (const stream of streams) {
        if (map[stream.id]) {
            // should be tested with a faulty model
            throw new Error(`Duplicate streamId "${stream.id}" for strean ${JSON.stringify(stream)}`);
        }
        map[stream.id] = stream;
        loadModelStreamsById(stream.children, map);
    }
}
//# sourceMappingURL=HDSModel-Streams.js.map

/***/ },

/***/ "./js/HDSModel/HDSModel.js"
/*!*********************************!*\
  !*** ./js/HDSModel/HDSModel.js ***!
  \*********************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HDSModel = void 0;
const errors_1 = __webpack_require__(/*! ../errors */ "./js/errors.js");
const utils_1 = __webpack_require__(/*! ../utils */ "./js/utils.js");
const HDSModel_Streams_1 = __webpack_require__(/*! ./HDSModel-Streams */ "./js/HDSModel/HDSModel-Streams.js");
const HDSModel_Authorizations_1 = __webpack_require__(/*! ./HDSModel-Authorizations */ "./js/HDSModel/HDSModel-Authorizations.js");
const HDSModel_ItemsDefs_1 = __webpack_require__(/*! ./HDSModel-ItemsDefs */ "./js/HDSModel/HDSModel-ItemsDefs.js");
const HDSModel_EventTypes_1 = __webpack_require__(/*! ./HDSModel-EventTypes */ "./js/HDSModel/HDSModel-EventTypes.js");
class HDSModel {
    /**
     * JSON definition file URL.
     * Should come from service/info assets.hds-model
     */
    #modelUrl;
    /** RAW content of model definitions */
    #modelData;
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
}
exports.HDSModel = HDSModel;
function throwNotLoadedError() {
    throw new errors_1.HDSLibError('Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
}
//# sourceMappingURL=HDSModel.js.map

/***/ },

/***/ "./js/HDSModel/HDSModelInitAndSingleton.js"
/*!*************************************************!*\
  !*** ./js/HDSModel/HDSModelInitAndSingleton.js ***!
  \*************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getModel = getModel;
exports.resetModel = resetModel;
exports.initHDSModel = initHDSModel;
const HDSModel_1 = __webpack_require__(/*! ./HDSModel */ "./js/HDSModel/HDSModel.js");
const HDSService_1 = __webpack_require__(/*! ../HDSService */ "./js/HDSService.js");
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

/***/ },

/***/ "./js/HDSModel/internalModelUtils.js"
/*!*******************************************!*\
  !*** ./js/HDSModel/internalModelUtils.js ***!
  \*******************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.itemKeysOrDefsToDefs = itemKeysOrDefsToDefs;
exports.itemKeyOrDefToDef = itemKeyOrDefToDef;
const HDSItemDef_1 = __webpack_require__(/*! ./HDSItemDef */ "./js/HDSModel/HDSItemDef.js");
/**
 * Some call support either arrays of itemKeys or itemDefs
 * test if they are strings or itemDefs and returns an array of itemDefs
 */
function itemKeysOrDefsToDefs(model, keysOrDefs) {
    const res = [];
    for (const keyOrDef of keysOrDefs) {
        res.push(itemKeyOrDefToDef(model, keyOrDef));
    }
    return res;
}
/**
 * Some call support either itemKey or itemDef
 * test if string or itemDef and returns an itemDef
 */
function itemKeyOrDefToDef(model, keyOrDef) {
    if (keyOrDef instanceof HDSItemDef_1.HDSItemDef)
        return keyOrDef;
    return model.itemsDefs.forKey(keyOrDef);
}
//# sourceMappingURL=internalModelUtils.js.map

/***/ },

/***/ "./js/HDSService.js"
/*!**************************!*\
  !*** ./js/HDSService.js ***!
  \**************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HDSService = void 0;
const settings = __importStar(__webpack_require__(/*! ./settings */ "./js/settings.js"));
const patchedPryv_1 = __webpack_require__(/*! ./patchedPryv */ "./js/patchedPryv.js");
// makes Pryv service aware of default serviceUrl
class HDSService extends patchedPryv_1.pryv.Service {
    constructor(serviceInfoUrl, serviceCustomizations) {
        serviceInfoUrl = serviceInfoUrl || settings.getServiceInfoURL();
        super(serviceInfoUrl, serviceCustomizations);
    }
}
exports.HDSService = HDSService;
//# sourceMappingURL=HDSService.js.map

/***/ },

/***/ "./js/appTemplates/AppClientAccount.js"
/*!*********************************************!*\
  !*** ./js/appTemplates/AppClientAccount.js ***!
  \*********************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppClientAccount = void 0;
const errors_1 = __webpack_require__(/*! ../errors */ "./js/errors.js");
const patchedPryv_1 = __webpack_require__(/*! ../patchedPryv */ "./js/patchedPryv.js");
const Application_1 = __webpack_require__(/*! ./Application */ "./js/appTemplates/Application.js");
const CollectorClient_1 = __webpack_require__(/*! ./CollectorClient */ "./js/appTemplates/CollectorClient.js");
const logger = __importStar(__webpack_require__(/*! ../logger */ "./js/logger.js"));
/**
 * - applications
 *   - [baseStreamId] "Root" stream from this app
 */
const MAX_COLLECTORS = 1000;
class AppClientAccount extends Application_1.Application {
    constructor(baseStreamId, connection, appName, features) {
        super(baseStreamId, connection, appName, features);
        this.cache.collectorClientsMap = {};
    }
    get appSettings() {
        return {
            canBePersonnal: true,
            mustBeMaster: true
        };
    }
    /**
     * When the app receives a new request for data sharing
     */
    async handleIncomingRequest(apiEndpoint, incomingEventId) {
        // make sure that collectorClientsMap is initialized
        await this.getCollectorClients();
        const requesterConnection = new patchedPryv_1.pryv.Connection(apiEndpoint);
        const accessInfo = await requesterConnection.accessInfo();
        // check if request is known
        const collectorClientKey = CollectorClient_1.CollectorClient.keyFromInfo(accessInfo);
        logger.debug('AppClient:handleIncomingRequest', { collectorClientKey, accessInfo, incomingEventId });
        if (this.cache.collectorClientsMap[collectorClientKey]) {
            const collectorClient = this.cache.collectorClientsMap[collectorClientKey];
            logger.debug('AppClient:handleIncomingRequest found existing', { collectorClient });
            if (collectorClient.requesterApiEndpoint !== apiEndpoint) {
                // console.log('⚠️⚠️⚠️⚠️ RESET! Found existing collectorClient with a different apiEndpoint', { actual: collectorClient.requesterApiEndpoint, incoming: apiEndpoint });
                throw new errors_1.HDSLibError('Found existing collectorClient with a different apiEndpoint', { actual: collectorClient.requesterApiEndpoint, incoming: apiEndpoint });
                // we might consider reseting() in the future;
                // return await collectorClient.reset(apiEndpoint, incomingEventId, accessInfo);
            }
            if (incomingEventId && collectorClient.requesterEventId !== incomingEventId) {
                throw new errors_1.HDSLibError('Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
                // console.log('⚠️⚠️⚠️⚠️ RESET! Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
                // we might consider reseting() in the future;
                // return await collectorClient.reset(apiEndpoint, incomingEventId, accessInfo);
                // return null;
            }
            return collectorClient;
        }
        // check if comming form hdsCollector
        if (!accessInfo?.clientData?.hdsCollector || accessInfo.clientData?.hdsCollector?.version !== 0) {
            throw new errors_1.HDSLibError('Invalid collector request, cannot find clientData.hdsCollector or wrong version', { clientData: accessInfo?.clientData });
        }
        // else create it
        const collectorClient = await CollectorClient_1.CollectorClient.create(this, apiEndpoint, incomingEventId, accessInfo);
        this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
        return collectorClient;
    }
    async getCollectorClientByKey(collectorKey) {
        // ensure collectors are initialized
        await this.getCollectorClients();
        return this.cache.collectorClientsMap[collectorKey];
    }
    async getCollectorClients(forceRefresh = false) {
        if (!forceRefresh && this.cache.collectorClientsMapInitialized)
            return Object.values(this.cache.collectorClientsMap);
        const apiCalls = [{
                method: 'accesses.get',
                params: { includeDeletions: true }
            }, {
                method: 'events.get',
                params: { types: ['request/collector-client-v1'], streams: [this.baseStreamId], limit: MAX_COLLECTORS }
            }];
        const [accessesRes, eventRes] = await this.connection.api(apiCalls);
        const accessHDSCollectorMap = {};
        for (const access of accessesRes.accesses) {
            if (access.clientData?.hdsCollectorClient) {
                accessHDSCollectorMap[access.name] = access;
            }
        }
        for (const event of eventRes.events) {
            const collectorClient = new CollectorClient_1.CollectorClient(this, event);
            if (accessHDSCollectorMap[collectorClient.key] != null)
                collectorClient.accessData = accessHDSCollectorMap[collectorClient.key];
            // temp process - might be removed
            await collectorClient.checkConsistency();
            this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
        }
        this.cache.collectorClientsMapInitialized = true;
        return Object.values(this.cache.collectorClientsMap);
    }
    /**
     * - Check connection validity
     * - Make sure stream structure exists
     */
    async init() {
        return super.init();
    }
}
exports.AppClientAccount = AppClientAccount;
//# sourceMappingURL=AppClientAccount.js.map

/***/ },

/***/ "./js/appTemplates/AppManagingAccount.js"
/*!***********************************************!*\
  !*** ./js/appTemplates/AppManagingAccount.js ***!
  \***********************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppManagingAccount = void 0;
const short_unique_id_1 = __importDefault(__webpack_require__(/*! short-unique-id */ "./node_modules/short-unique-id/dist/short-unique-id.js"));
const Application_1 = __webpack_require__(/*! ./Application */ "./js/appTemplates/Application.js");
const Collector_1 = __webpack_require__(/*! ./Collector */ "./js/appTemplates/Collector.js");
const collectorIdGenerator = new short_unique_id_1.default({ dictionary: 'alphanum_lower', length: 7 });
/**
 * App which manages Collectors
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 *
 * The App can create multiple "collectors e.g. Questionnaires"
 *
 * Stream structure
 * - applications
 *   - [baseStreamId]  "Root" stream for this app
 *     - [baseStreamId]-[collectorsId] Each "questionnaire" or "request for a set of data" has it's own stream
 *       - [baseStreamId]-[collectorsId]-internal Private stuff not to be shared
 *       - [baseStreamId]-[collectorsId]-public Contains events with the current settings of this app (this stream will be shared in "read" with the request)
 *       - [baseStreamId]-[collectorsId]-pending Contains events with "pending" requests
 *       - [baseStreamId]-[collectorsId]-inbox Contains events with "inbox" requests Will be shared in createOnly
 *       - [baseStreamId]-[collectorsId]-active Contains events with "active" users
 *       - [baseStreamId]-[scollectorsId]-errors Contains events with "revoked" or "erroneous" users
 */
class AppManagingAccount extends Application_1.Application {
    // used by Application.init();
    get appSettings() {
        return {
            canBePersonnal: true,
            mustBeMaster: true,
            appNameFromAccessInfo: true // application name will be taken from Access-Info Name
        };
    }
    async init() {
        await super.init();
        // -- check if stream structure exists
        await this.getCollectors();
        return this;
    }
    async getCollectors(forceRefresh) {
        await this.#updateCollectorsIfNeeded(forceRefresh);
        return Object.values(this.cache.collectorsMap);
    }
    async getCollectorById(id) {
        await this.#updateCollectorsIfNeeded();
        return this.cache.collectorsMap[id];
    }
    async #updateCollectorsIfNeeded(forceRefresh = false) {
        if (!forceRefresh && this.cache.collectorsMap)
            return;
        if (forceRefresh)
            await this.loadStreamData();
        // TODO do not replace the map, but update collectors if streamData has changed and add new collectors
        const streams = this.streamData.children || [];
        const collectorsMap = {};
        for (const stream of streams) {
            const collector = new Collector_1.Collector(this, stream);
            collectorsMap[collector.id] = collector;
        }
        this.cache.collectorsMap = collectorsMap;
    }
    /**
     * Create an initialized Collector
     */
    async createCollector(name) {
        const collector = await this.createCollectorUnitialized(name);
        await collector.init();
        return collector;
    }
    /**
     * Create an un-initialized Collector (mostly used by tests)
     */
    async createCollectorUnitialized(name) {
        const streamId = this.baseStreamId + '-' + collectorIdGenerator.rnd();
        const params = {
            id: streamId,
            name,
            parentId: this.baseStreamId
        };
        const stream = await this.connection.apiOne('streams.create', params, 'stream');
        // add new stream to streamCache
        this.streamData.children.push(stream);
        const collector = new Collector_1.Collector(this, stream);
        this.cache.collectorsMap[collector.streamId] = collector;
        return collector;
    }
}
exports.AppManagingAccount = AppManagingAccount;
//# sourceMappingURL=AppManagingAccount.js.map

/***/ },

/***/ "./js/appTemplates/Application.js"
/*!****************************************!*\
  !*** ./js/appTemplates/Application.js ***!
  \****************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Application = void 0;
const patchedPryv_1 = __webpack_require__(/*! ../patchedPryv */ "./js/patchedPryv.js");
const toolkit_1 = __webpack_require__(/*! ../toolkit */ "./js/toolkit/index.js");
const APPS_ROOT_STREAM = 'applications';
/**
 * Common code for AppClientAccount and AppManagingAccount
 */
class Application {
    /** Pryv.Connection */
    connection;
    /** string */
    baseStreamId;
    /** string */
    appName;
    cache = {};
    /** ApplicationFeatures */
    features;
    /**
     * Get application stream structure
     * Initialized at init()
     * Can be refreshed with loadStreamData
     */
    get streamData() {
        if (!this.cache.streamData)
            throw new Error('Call .init() first');
        return this.cache.streamData;
    }
    get appSettings() {
        throw new Error('appSettings must be implemented');
        // possible return values:
        /**
         * return {
         *  canBePersonnal: true,
         *  mustBeMaster: true
         *  appNameFromAccessInfo: true // application name will be taken from Access-Info Name
         * };
         */
    }
    /**
     * Create with an apiEnpoint
     */
    static async newFromApiEndpoint(baseStreamId, apiEndpoint, appName, features) {
        const connection = new patchedPryv_1.pryv.Connection(apiEndpoint);
        // in a static method, "this" is the class (here the extending class)
        return await this.newFromConnection(baseStreamId, connection, appName, features);
    }
    /**
    * Create with an apiEnpoint
    */
    static async newFromConnection(baseStreamId, connection, appName, features) {
        // in a static method "this" is the class (here the extending class)
        const app = new this(baseStreamId, connection, appName, features);
        await app.init();
        return app;
    }
    /**
     * @private
     * use .newFrom...() to create new AppManagingAccount
     */
    constructor(baseStreamId, connection, appName, features) {
        if (!baseStreamId || baseStreamId.length < 2)
            throw new Error('Missing or too short baseStreamId');
        this.baseStreamId = baseStreamId;
        if (appName == null && !this.appSettings.appNameFromAccessInfo) {
            throw new Error('appName must be given unless appSettings.appNameFromAccessInfo = true');
        }
        this.appName = appName || '';
        this.connection = connection;
        this.features = Object.assign({ streamsAutoCreate: true }, features);
        if (this.features.streamsAutoCreate) {
            toolkit_1.StreamsAutoCreate.attachToConnection(this.connection, undefined);
        }
        this.cache = {};
    }
    async init() {
        await createAppStreams(this);
        return this;
    }
    /**
     * Save anything you want for your app
     */
    async setCustomSettings(content) {
        const currentCustomSettings = await this.getCustomSettings();
        if (currentCustomSettings != null) { // update
            const id = this.cache.customSettingsEvent.id;
            const updatedEvent = await this.connection.apiOne('events.update', { id, update: { content } }, 'event');
            this.cache.customSettingsEvent = updatedEvent;
        }
        else {
            await this.#createCustomSettings(content);
        }
        return this.cache.customSettingsEvent?.content;
    }
    /**
     * @private
     * Used by getCustomSettings & setCustomSettings
     */
    async #createCustomSettings(content) {
        const createdEvent = await this.connection.apiOne('events.create', { streamIds: [this.baseStreamId], type: 'settings/any', content }, 'event');
        this.cache.customSettingsEvent = createdEvent;
    }
    /**
     * Get all current settings previously set with setCustomSettings()
     */
    async getCustomSettings(forceRefresh = false) {
        if (forceRefresh || !this.cache.customSettingsEvent) {
            const customSettingsEvent = (await this.connection.apiOne('events.get', { streams: [this.baseStreamId], types: ['settings/any'], limit: 1 }, 'events'))[0];
            this.cache.customSettingsEvent = customSettingsEvent;
        }
        if (!this.cache.customSettingsEvent) {
            await this.#createCustomSettings({});
        }
        return this.cache.customSettingsEvent?.content;
    }
    /**
     * Update value of a custom setting by its key
     * @param {*} value if value is `null` key will be deleted
     */
    async setCustomSetting(key, value) {
        const currentCustomSettings = await this.getCustomSettings();
        if (value === null) {
            delete currentCustomSettings[key];
        }
        else {
            currentCustomSettings[key] = value;
        }
        return this.setCustomSettings(currentCustomSettings);
    }
    /**
     * Force loading of streamData
     */
    async loadStreamData() {
        const streams = (await this.connection.apiOne('streams.get', {}, 'streams'));
        const streamData = findStreamByid(streams, this.baseStreamId);
        if (streamData) {
            this.cache.streamData = streamData;
        }
        return streamData;
    }
}
exports.Application = Application;
// findStream in a tree
function findStreamByid(streams, streamId) {
    for (const stream of streams) {
        if (stream.id === streamId)
            return stream;
        if (stream.children?.length > 0) {
            const streamFromChildren = findStreamByid(stream.children, streamId);
            if (streamFromChildren != null)
                return streamFromChildren;
        }
    }
    return null;
}
// create app Streams
async function createAppStreams(app) {
    // check that connection has a personal or master token or has "manage" rights on baseStream
    const infos = await app.connection.accessInfo();
    if (app.appSettings.appNameFromAccessInfo) {
        app.appName = infos.name;
    }
    let isPersonalOrMaster = infos.type === 'personal';
    if (!app.appSettings.canBePersonnal && infos.type === 'personal') {
        throw new Error('Application should not use a personal token');
    }
    if (!isPersonalOrMaster) {
        const allowPersonalStr = app.appSettings.canBePersonnal ? '"personal" or ' : '';
        if (infos.type !== 'app')
            throw new Error(`Application requires a ${allowPersonalStr} "app" type of access`);
        const masterFound = infos.permissions.find((p) => (p.streamId === '*' && p.level === 'manage'));
        isPersonalOrMaster = true;
        if (app.appSettings.mustBemaster && !masterFound) {
            throw new Error('Application with "app" type of access requires "master" token (streamId = "*", level = "manage")');
        }
        if (!masterFound) { // check that app has "manage" level on baseStreamId
            const baseStreamFound = infos.permissions.find((p) => (p.streamId === app.baseStreamId && p.level === 'manage'));
            if (!baseStreamFound)
                throw new Error(`Application with "app" type of access requires  (streamId = "${app.baseStreamId}", level = "manage") or master access`);
        }
    }
    // get streamStructure
    let found = false;
    try {
        const streamData = await app.loadStreamData();
        if (streamData)
            found = true;
    }
    catch (e) {
        if (e.innerObject?.id !== 'unknown-referenced-resource' || e.innerObject?.data?.id !== app.baseStreamId) {
            throw e;
        }
    }
    // not found create streams
    if (!found) {
        if (!isPersonalOrMaster) {
            throw new Error('Token has not sufficient right to create App streams. Create them upfront');
        }
        const apiCalls = [
            { method: 'streams.create', params: { id: APPS_ROOT_STREAM, name: 'Applications' } },
            { method: 'streams.create', params: { id: app.baseStreamId, name: app.appName, parentId: APPS_ROOT_STREAM } }
        ];
        const streamCreateResult = await app.connection.api(apiCalls);
        if (streamCreateResult[1].error)
            throw new Error('Failed creating app streams ' + JSON.stringify(streamCreateResult[1].error));
        const stream = streamCreateResult[1].stream;
        app.cache.streamData = stream;
    }
}
//# sourceMappingURL=Application.js.map

/***/ },

/***/ "./js/appTemplates/Collector.js"
/*!**************************************!*\
  !*** ./js/appTemplates/Collector.js ***!
  \**************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Collector = void 0;
const CollectorRequest_1 = __webpack_require__(/*! ./CollectorRequest */ "./js/appTemplates/CollectorRequest.js");
const errors_1 = __webpack_require__(/*! ../errors */ "./js/errors.js");
const utils_1 = __webpack_require__(/*! ../utils */ "./js/utils.js");
const CollectorInvite_1 = __webpack_require__(/*! ./CollectorInvite */ "./js/appTemplates/CollectorInvite.js");
const logger = __importStar(__webpack_require__(/*! ../logger */ "./js/logger.js"));
const COLLECTOR_STREAMID_SUFFIXES = {
    archive: 'archive',
    internal: 'internal',
    public: 'public',
    pending: 'pending',
    inbox: 'inbox',
    active: 'active',
    error: 'error'
};
Object.freeze(COLLECTOR_STREAMID_SUFFIXES);
/**
 * Collector is used by AppManagingAccount
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 */
class Collector {
    static STREAMID_SUFFIXES = COLLECTOR_STREAMID_SUFFIXES;
    static STATUSES = Object.freeze({
        draft: 'draft',
        active: 'active',
        deactivated: 'deactivated'
    });
    appManaging;
    streamId;
    name;
    #streamData;
    #cache;
    request;
    /**
     * @param appManaging
     * @param streamData
     */
    constructor(appManaging, streamData) {
        this.streamId = streamData.id;
        this.name = streamData.name;
        this.appManaging = appManaging;
        this.#streamData = streamData;
        this.request = new CollectorRequest_1.CollectorRequest({
            id: this.id
        });
        this.#cache = {
            initialized: false,
            invites: {},
            invitesInitialized: false,
            invitesInitializing: false,
            statusEvent: null
        };
    }
    /**
     * @property {string} id - shortcut for streamId
     */
    get id() {
        return this.streamId;
    }
    /**
     * @property {string} one of 'draft', 'active', 'deactivated'
     */
    get statusCode() {
        if (this.#cache.statusEvent == null)
            throw new Error('Init Collector first');
        return this.#cache.statusEvent.content.status;
    }
    /**
     * Fetch online data
     */
    async init(forceRefresh = false) {
        if (!forceRefresh && this.#cache.initialized)
            return;
        await this.checkStreamStructure();
        await this.#loadStatus(forceRefresh);
        this.#cache.initialized = true;
    }
    /**
     * @type {StatusEvent} - extends PryvEvent with a specific content
     * @property {Object} content - content
     * @property {String} content.status - one of 'draft', 'active', 'deactivated'
     * @property {CollectorRequestData} content.request - app specific data
     */
    /**
     * Load Collector status,
     * @param forceRefresh - if true, forces fetching the status from the server
     */
    async #loadStatus(forceRefresh = false) {
        if (!forceRefresh && this.#cache.statusEvent)
            return this.#cache.statusEvent;
        const params = { types: ['status/collector-v1'], limit: 1, streams: [this.streamIdFor(_a.STREAMID_SUFFIXES.internal)] };
        const statusEvents = await this.appManaging.connection.apiOne('events.get', params, 'events');
        if (statusEvents.length === 0) { // non existent set "draft" status
            return this.#setStatus(_a.STATUSES.draft);
        }
        this.#cache.statusEvent = statusEvents[0];
        this.request.loadFromStatusEvent(statusEvents[0]);
    }
    /**
     * Change the status
     * @param status one of 'draft', 'active', 'deactivated'
     * @returns {StatusEvent}
     */
    async #setStatus(status) {
        if (!_a.STATUSES[status])
            throw new errors_1.HDSLibError('Unknown status key', { status });
        const event = {
            type: 'status/collector-v1',
            streamIds: [this.streamIdFor(_a.STREAMID_SUFFIXES.internal)],
            content: {
                status,
                request: this.request.content
            }
        };
        const statusEvent = await this.appManaging.connection.apiOne('events.create', event, 'event');
        this.#cache.statusEvent = statusEvent;
        this.request.loadFromStatusEvent(statusEvent);
        return this.#cache.statusEvent;
    }
    async save() {
        if (this.statusCode !== _a.STATUSES.draft)
            throw new Error(`Cannot save when status = "${this.statusCode}".`);
        return await this.#setStatus(_a.STATUSES.draft);
    }
    async publish() {
        const publicEventData = {
            type: 'request/collector-v1',
            streamIds: [this.streamIdFor(_a.STREAMID_SUFFIXES.public)],
            content: this.request.content
        };
        await this.appManaging.connection.apiOne('events.create', publicEventData, 'event');
        return await this.#setStatus(_a.STATUSES.active);
    }
    #addOrUpdateInvite(eventData) {
        const key = CollectorInvite_1.CollectorInvite.getKeyForEvent(eventData);
        if (this.#cache.invites[key]) {
            this.#cache.invites[key].setEventData(eventData);
        }
        else {
            this.#cache.invites[key] = new CollectorInvite_1.CollectorInvite(this, eventData);
        }
        return this.#cache.invites[key];
    }
    /**
     * Retrieve an invite by its key
     */
    async getInviteByKey(key) {
        await this.init(); // do not forceRefresh on Init();
        await this.#initInvites(false);
        return this.#cache.invites[key];
    }
    /**
     * Retreive all invites
     * @param {boolean} [forceRefresh]
     * @returns {Array<CollectorInvite>}
     */
    async getInvites(forceRefresh = false) {
        await this.init(); // do not forceRefresh on Init();
        await this.#initInvites(forceRefresh);
        return Object.values(this.#cache.invites);
    }
    async #initInvites(forceRefresh) {
        await (0, utils_1.waitUntilFalse)(() => (this.#cache.invitesInitializing));
        if (!forceRefresh && this.#cache.invitesInitialized)
            return;
        this.#cache.invitesInitializing = true;
        const queryParams = { types: ['invite/collector-v1'], streams: [this.streamId], fromTime: 0, toTime: 8640000000000000, limit: 10000 };
        try {
            await this.appManaging.connection.getEventsStreamed(queryParams, (eventData) => {
                this.#addOrUpdateInvite(eventData);
            });
        }
        catch (e) {
            this.#cache.invitesInitialized = true;
            this.#cache.invitesInitializing = false;
            throw e;
        }
        this.#cache.invitesInitialized = true;
        this.#cache.invitesInitializing = false;
    }
    async checkInbox() {
        const newCollectorInvites = [];
        const params = { types: ['response/collector-v1'], limit: 1000, streams: [this.streamIdFor(_a.STREAMID_SUFFIXES.inbox)] };
        const responseEvents = await this.appManaging.connection.apiOne('events.get', params, 'events');
        for (const responseEvent of responseEvents) {
            // fetch corresponding invite
            const inviteEvent = await this.appManaging.connection.apiOne('events.getOne', { id: responseEvent.content.eventId }, 'event');
            if (inviteEvent == null)
                throw new errors_1.HDSLibError(`Cannot find invite event matching id: ${responseEvent.content.eventId}`, responseEvent);
            const updateInvite = {
                content: structuredClone(inviteEvent.content)
            };
            updateInvite.content.sourceEventId = responseEvent.id;
            // check type of response
            switch (responseEvent.content.type) {
                case 'accept':
                    updateInvite.streamIds = [this.streamIdFor(_a.STREAMID_SUFFIXES.active)];
                    updateInvite.content.apiEndpoint = responseEvent.content.apiEndpoint;
                    if (responseEvent.content.chat)
                        updateInvite.content.chat = responseEvent.content.chat;
                    break;
                case 'refuse':
                    updateInvite.streamIds = [this.streamIdFor(_a.STREAMID_SUFFIXES.error)];
                    updateInvite.content.errorType = 'refused';
                    break;
                case 'revoke':
                    updateInvite.streamIds = [this.streamIdFor(_a.STREAMID_SUFFIXES.error)];
                    updateInvite.content.errorType = 'revoked';
                    break;
                default:
                    throw new errors_1.HDSLibError(`Unkown or undefined ${responseEvent.content.type}`, responseEvent);
            }
            // update inviteEvent and archive inbox message
            const apiCalls = [
                {
                    method: 'events.update',
                    params: {
                        id: inviteEvent.id,
                        update: updateInvite
                    }
                },
                {
                    method: 'events.update',
                    params: {
                        id: responseEvent.id,
                        update: {
                            streamIds: [this.streamIdFor(_a.STREAMID_SUFFIXES.archive)]
                        }
                    }
                }
            ];
            const results = await this.appManaging.connection.api(apiCalls);
            const errors = results.filter((r) => (!r.event));
            if (errors.length > 0)
                throw new errors_1.HDSLibError('Error activating incoming request', errors);
            const eventUpdated = results[0].event;
            const inviteUpdated = this.#addOrUpdateInvite(eventUpdated);
            newCollectorInvites.push(inviteUpdated);
        }
        return newCollectorInvites;
    }
    /**
     * Create a "pending" invite to be sent to an app using AppSharingAccount
     * @param {string} name a default display name for this request
     * @param {Object} [options]
     * @param {Object} [options.customData] any data to be used by the client app
     */
    async createInvite(name, options = {}) {
        if (this.statusCode !== _a.STATUSES.active)
            throw new Error(`Collector must be in "active" state error to create invite, current: ${this.statusCode}`);
        const eventParams = {
            type: 'invite/collector-v1',
            streamIds: [this.streamIdFor(_a.STREAMID_SUFFIXES.pending)],
            content: {
                name,
                customData: options.customData || {}
            }
        };
        const newInvite = await this.appManaging.connection.apiOne('events.create', eventParams, 'event');
        const invite = this.#addOrUpdateInvite(newInvite);
        return invite;
    }
    /**
     * Get sharing api endpoint
     */
    async sharingApiEndpoint() {
        if (this.statusCode !== _a.STATUSES.active)
            throw new Error(`Collector must be in "active" state error to get sharing link, current: ${this.statusCode}`);
        if (this.#cache.sharingApiEndpoint)
            return this.#cache.sharingApiEndpoint;
        // check if sharing present
        const sharedAccessId = 'a-' + this.streamId;
        const accesses = await this.appManaging.connection.apiOne('accesses.get', {}, 'accesses');
        const sharedAccess = accesses.find((access) => access.name === sharedAccessId);
        // found return it
        if (sharedAccess) {
            this.#cache.sharingApiEndpoint = sharedAccess.apiEndpoint;
            return sharedAccess.apiEndpoint;
        }
        // not found create it
        const permissions = [
            { streamId: this.streamIdFor(_a.STREAMID_SUFFIXES.inbox), level: 'create-only' },
            { streamId: this.streamIdFor(_a.STREAMID_SUFFIXES.public), level: 'read' },
            // for "publicly shared access" always forbid the selfRevoke feature
            { feature: 'selfRevoke', setting: 'forbidden' },
            // for "publicly shared access" always forbid the selfAudit feature
            { feature: 'selfAudit', setting: 'forbidden' }
        ];
        const clientData = {
            hdsCollector: {
                version: 0,
                public: {
                    streamId: this.streamIdFor(_a.STREAMID_SUFFIXES.public)
                },
                inbox: {
                    streamId: this.streamIdFor(_a.STREAMID_SUFFIXES.inbox)
                }
            }
        };
        const params = { name: sharedAccessId, type: 'shared', permissions, clientData };
        const access = await this.appManaging.connection.apiOne('accesses.create', params, 'access');
        const newSharingApiEndpoint = access?.apiEndpoint;
        if (!newSharingApiEndpoint)
            throw new errors_1.HDSLibError('Cannot find apiEndpoint in sharing creation request', { result: access, requestParams: params });
        this.#cache.sharingApiEndpoint = newSharingApiEndpoint;
        return newSharingApiEndpoint;
    }
    /**
     * @private
     * @param {CollectorInvite} invite
     * @param {boolean} alreadyChecked // to avoid loops
     * @returns {CollectorInvite}
     */
    async revokeInvite(invite, alreadyChecked = false) {
        // Invalidate Invite APIEndpoint(s)
        if (invite.status === 'active' && !alreadyChecked) { // invalidate eventual authorization granted
            const accessInfo = await invite.checkAndGetAccessInfo(true);
            const deletionResult = await invite.connection.apiOne('accesses.delete', { id: accessInfo.id });
            if (deletionResult?.accessDeletion?.id == null) {
                logger.warn(`Failed revoking invite access for ${accessInfo.name}`);
            }
        }
        // invalidate this access
        const updateInvite = {
            id: invite.eventData.id,
            update: {
                content: structuredClone(invite.eventData.content),
                streamIds: [this.streamIdFor(_a.STREAMID_SUFFIXES.error)]
            }
        };
        updateInvite.update.content.errorType = 'revoked';
        const eventData = await this.appManaging.connection.apiOne('events.update', updateInvite, 'event');
        invite.eventData = eventData;
        return invite;
    }
    /**
     * check if required streams are present, if not create them
     */
    async checkStreamStructure() {
        // if streamData has correct child structure, we assume all is OK
        const childrenData = this.#streamData.children;
        const toCreate = Object.values(_a.STREAMID_SUFFIXES)
            .filter((suffix) => {
            if (!childrenData)
                return true;
            if (childrenData.find(child => child.id === this.streamIdFor(suffix)))
                return false;
            return true;
        });
        if (toCreate.length === 0)
            return { created: [] };
        // create required streams
        const apiCalls = toCreate.map(suffix => ({
            method: 'streams.create',
            params: {
                id: this.streamIdFor(suffix),
                parentId: this.streamId,
                name: this.name + ' ' + suffix
            }
        }));
        const result = { created: [], errors: [] };
        const resultsApi = await this.appManaging.connection.api(apiCalls);
        for (const resultCreate of resultsApi) {
            if (resultCreate.error) {
                result.errors.push(resultCreate.error);
                continue;
            }
            if (resultCreate.stream) {
                result.created.push(resultCreate.stream);
                if (!this.#streamData.children)
                    this.#streamData.children = [];
                this.#streamData.children.push(resultCreate.stream);
                continue;
            }
            result.errors.push({ id: 'unkown-error', message: 'Cannot find stream in result', data: resultCreate });
        }
        return result;
    }
    /**
     * @param {string} suffix
     */
    streamIdFor(suffix) {
        return this.streamId + '-' + suffix;
    }
    /**
     * Invite Status for streamId
     * reverse of streamIdFor
     */
    inviteStatusForStreamId(streamId) {
        // init cache if needed
        if (!this.#cache.inviteStatusForStreamId) {
            this.#cache.inviteStatusForStreamId = {};
            for (const status of [COLLECTOR_STREAMID_SUFFIXES.pending, COLLECTOR_STREAMID_SUFFIXES.active, COLLECTOR_STREAMID_SUFFIXES.error]) {
                this.#cache.inviteStatusForStreamId[this.streamIdFor(status)] = status;
            }
        }
        // look for status
        const status = this.#cache.inviteStatusForStreamId[streamId];
        if (status == null)
            throw new errors_1.HDSLibError(`Cannot find status for streamId: ${streamId}`);
        return status;
    }
}
exports.Collector = Collector;
_a = Collector;
/**
 * @typedef {CollectorRequest}
 * @property {number} version
 * @property {Localizable} description
 * @property {Localizable} consent
 * @property {Array<Permission>} permissions - Like Pryv permission request
 * @property {Object} app
 * @property {String} app.id
 * @property {String} app.url
 * @property {Object} app.data - to be finalized
 */
//# sourceMappingURL=Collector.js.map

/***/ },

/***/ "./js/appTemplates/CollectorClient.js"
/*!********************************************!*\
  !*** ./js/appTemplates/CollectorClient.js ***!
  \********************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CollectorClient = void 0;
const CollectorRequest_1 = __webpack_require__(/*! ./CollectorRequest */ "./js/appTemplates/CollectorRequest.js");
const patchedPryv_1 = __webpack_require__(/*! ../patchedPryv */ "./js/patchedPryv.js");
const errors_1 = __webpack_require__(/*! ../errors */ "./js/errors.js");
const logger = __importStar(__webpack_require__(/*! ../logger */ "./js/logger.js"));
/**
 * Client App in relation to an AppManagingAccount/Collector
 */
class CollectorClient {
    static STATUSES = Object.freeze({
        incoming: 'Incoming',
        active: 'Active',
        deactivated: 'Deactivated',
        refused: 'Refused'
    });
    app;
    eventData;
    accessData;
    request;
    #requesterConnection;
    /** @property {String} - identified within user's account - can be used to retrieve a Collector Client from an app */
    get key() {
        return _a.keyFromInfo(this.eventData.content.accessInfo);
    }
    /** @property {String} - id matching an event within requester's account - used as a reference to communicate with requester */
    get requesterEventId() {
        return this.eventData.content.requesterEventId;
    }
    /** @property {String}  */
    get requesterApiEndpoint() {
        return this.eventData.content.apiEndpoint;
    }
    get requesterUsername() {
        return this.eventData.content.accessInfo.user.username;
    }
    get requesterConnection() {
        if (!this.#requesterConnection) {
            this.#requesterConnection = new patchedPryv_1.pryv.Connection(this.requesterApiEndpoint);
        }
        return this.#requesterConnection;
    }
    /** @property {Object} - full content of the request */
    get requestData() {
        return this.eventData.content.requesterEventData.content;
    }
    get hasChatFeature() {
        return this.requestData.features?.chat != null;
    }
    get chatSettings() {
        if (!this.hasChatFeature)
            return null;
        return {
            chatStreamIncoming: `chat-${this.requesterUsername}-in`,
            chatStreamMain: `chat-${this.requesterUsername}`
        };
    }
    /** @property {string} - one of 'Incoming', 'Active', 'Deactivated', 'Refused' */
    get status() {
        const eventStatus = this.eventData.content.status;
        if (eventStatus === _a.STATUSES.deactivated || eventStatus === _a.STATUSES.refused) {
            if (!this.accessData?.deleted) {
                logger.error('>> CollectorClient.status TODO check consistency when access is still valid and deactivated or refused', this.accessData);
            }
            return eventStatus;
        }
        if (this.accessData && !this.accessData.deleted && this.eventData.content.status !== _a.STATUSES.active) {
            logger.error('>> CollectorClient.status: accessData ', this.accessData);
            throw new errors_1.HDSLibError('Should be active, try checkConsistency()');
        }
        if (!eventStatus) {
            logger.error('>> CollectorClient.status is null', { eventData: this.eventData, accessData: this.accessData });
        }
        return eventStatus;
    }
    constructor(app, eventData, accessData = null) {
        this.app = app;
        this.eventData = eventData;
        this.accessData = accessData;
        this.request = new CollectorRequest_1.CollectorRequest({});
        this.request.loadFromInviteEvent(eventData.content.requesterEventData);
    }
    /**
     * @private
     * used by appClientAccount.handleIncomingRequest
     */
    static async create(app, apiEndpoint, requesterEventId, accessInfo) {
        // check content of accessInfo
        const publicStreamId = accessInfo.clientData.hdsCollector.public.streamId;
        // get request event cont
        const requesterConnection = new patchedPryv_1.pryv.Connection(apiEndpoint);
        const requesterEvents = await requesterConnection.apiOne('events.get', { types: ['request/collector-v1'], streams: [publicStreamId], limit: 1 }, 'events');
        if (!requesterEvents[0])
            throw new errors_1.HDSLibError('Cannot find requester event in public stream', requesterEvents);
        const eventData = {
            type: 'request/collector-client-v1',
            streamIds: [app.baseStreamId],
            content: {
                apiEndpoint,
                requesterEventId,
                requesterEventData: requesterEvents[0],
                accessInfo,
                status: _a.STATUSES.incoming
            }
        };
        const event = await app.connection.apiOne('events.create', eventData, 'event');
        return new _a(app, event);
    }
    /**
     * @private
     * reset with new request Event of ApiEndpoint
     * Identical as create but keep current event
     */
    async reset(apiEndpoint, requesterEventId) {
        if (this.accessData && this.accessData?.deleted != null) {
            logger.error('TODO try to revoke current access');
        }
        // get accessInfo
        const requesterConnection = new patchedPryv_1.pryv.Connection(apiEndpoint);
        const accessInfo = await requesterConnection.accessInfo();
        // check content of accessInfo
        const publicStreamId = accessInfo.clientData.hdsCollector.public.streamId;
        // get request event cont
        const requesterEvents = await requesterConnection.apiOne('events.get', { types: ['request/collector-v1'], streams: [publicStreamId], limit: 1 }, 'events');
        if (!requesterEvents[0])
            throw new errors_1.HDSLibError('Cannot find requester event in public stream', requesterEvents);
        const eventData = await this.app.connection.apiOne('events.update', {
            id: this.eventData.id,
            update: {
                content: {
                    apiEndpoint,
                    requesterEventId,
                    requesterEventData: requesterEvents[0],
                    accessInfo,
                    status: _a.STATUSES.incoming
                }
            }
        }, 'event');
        this.eventData = eventData;
        this.request.loadFromInviteEvent(requesterEvents[0]);
        return this;
    }
    /**
     * Update business event with new status
     * @param {string} newStatus
     * @param {Object} [extraData] - if given this will be added to content ⚠️ - This can overide content!
     */
    async #updateStatus(newStatus, extraData = null) {
        const newContent = structuredClone(this.eventData.content);
        newContent.status = newStatus;
        if (extraData !== null)
            Object.assign(newContent, extraData);
        const eventData = await this.app.connection.apiOne('events.update', {
            id: this.eventData.id,
            update: {
                content: newContent
            }
        }, 'event');
        this.eventData = eventData;
    }
    /**
     * Accept current request
     * @param {boolean} forceAndSkipAccessCreation - internal temporary option,
     */
    async accept(forceAndSkipAccessCreation = false) {
        const responseContent = {};
        if (this.accessData && this.accessData.deleted == null && this.status !== 'Active') {
            forceAndSkipAccessCreation = true;
            logger.error('CollectorClient.accept TODO fix accept when access valid');
        }
        if (forceAndSkipAccessCreation) {
            if (!this.accessData?.apiEndpoint || this.accessData?.delete)
                throw new errors_1.HDSLibError('Cannot force accept with empty or deleted accessData', this.accessData);
        }
        else {
            if (this.status === 'Active')
                throw new errors_1.HDSLibError('Cannot accept an Active CollectorClient');
            // create access for requester
            const cleanedPermissions = this.requestData.permissions.map((p) => {
                if (p.streamId)
                    return { streamId: p.streamId, level: p.level };
                return p;
            });
            // ------------- chat ------------------------ //
            if (this.hasChatFeature) {
                // user supported mode - might me moved to a lib
                // 2. create streams
                const { chatStreamIncoming, chatStreamMain } = this.chatSettings;
                const chatStreamsCreateApiCalls = [
                    { method: 'streams.create', params: { name: 'Chats', id: 'chats' } },
                    { method: 'streams.create', params: { name: `Chat ${this.requesterUsername}`, parentId: 'chats', id: chatStreamMain } },
                    { method: 'streams.create', params: { name: `Chat ${this.requesterUsername} In`, parentId: chatStreamMain, id: chatStreamIncoming } }
                ];
                const streamCreateResults = await this.app.connection.api(chatStreamsCreateApiCalls);
                streamCreateResults.forEach((r) => {
                    if (r.stream?.id || r.error?.id === 'item-already-exists')
                        return;
                    throw new errors_1.HDSLibError('Failed creating chat stream', streamCreateResults);
                });
                // 3. add streams to permissions
                cleanedPermissions.push(...[
                    { streamId: chatStreamMain, level: 'read' },
                    { streamId: chatStreamIncoming, level: 'manage' }
                ]);
                responseContent.chat = {
                    type: 'user',
                    streamRead: chatStreamMain,
                    streamWrite: chatStreamIncoming
                };
                // ---------- end chat ---------- //
            }
            const accessCreateData = {
                name: this.key,
                type: 'shared',
                permissions: cleanedPermissions,
                clientData: {
                    hdsCollectorClient: {
                        version: 0,
                        eventData: this.eventData
                    }
                }
            };
            const accessData = await this.app.connection.apiOne('accesses.create', accessCreateData, 'access');
            this.accessData = accessData;
            if (!this.accessData?.apiEndpoint)
                throw new errors_1.HDSLibError('Failed creating request access', accessData);
        }
        responseContent.apiEndpoint = this.accessData.apiEndpoint;
        const requesterEvent = await this.#updateRequester('accept', responseContent);
        if (requesterEvent != null) {
            await this.#updateStatus(_a.STATUSES.active);
            return { accessData: this.accessData, requesterEvent };
        }
        return null;
    }
    async revoke() {
        if (!this.accessData) {
            throw new errors_1.HDSLibError('Cannot revoke if no accessData');
        }
        if (this.accessData.deleted && this.status === _a.STATUSES.deactivated) {
            throw new errors_1.HDSLibError('Already revoked');
        }
        // revoke access
        await this.app.connection.apiOne('accesses.delete', { id: this.accessData.id }, 'accessDeletion');
        // lazyly flag currentAccess as deleted
        this.accessData.deleted = Date.now() / 1000;
        const responseContent = {};
        const requesterEvent = await this.#updateRequester('revoke', responseContent);
        if (requesterEvent != null) {
            await this.#updateStatus(_a.STATUSES.deactivated);
            return { requesterEvent };
        }
        return null;
    }
    async refuse() {
        const responseContent = {};
        const requesterEvent = await this.#updateRequester('refuse', responseContent);
        if (requesterEvent != null) {
            await this.#updateStatus(_a.STATUSES.refused);
            return { requesterEvent };
        }
        return null;
    }
    /**
     * @param {string} type - one of 'accpet', 'revoke', 'refuse'
     * @param {object} responseContent - content is related to type
     * @returns {Object} - response
     */
    async #updateRequester(type, responseContent) {
        // sent access credentials to requester
        // check content of accessInfo
        const publicStreamId = this.eventData.content.accessInfo.clientData.hdsCollector.inbox.streamId;
        const requesterEventId = this.requesterEventId;
        // add eventId to content
        const content = Object.assign({ type, eventId: requesterEventId }, responseContent);
        // acceptEvent to be sent to requester
        const responseEvent = {
            type: 'response/collector-v1',
            streamIds: [publicStreamId],
            content
        };
        try {
            const requesterEvent = await this.requesterConnection.apiOne('events.create', responseEvent, 'event');
            return requesterEvent;
        }
        catch (e) {
            const deactivatedDetail = {
                type: 'error',
                message: e.message
            };
            if (e.innerObject)
                deactivatedDetail.data = e.innerObject;
            logger.error('Failed activating', deactivatedDetail);
            const deactivatedResult = await this.#updateStatus(_a.STATUSES.deactivated, { deactivatedDetail });
            console.log('***** ', { deactivatedResult });
            return null;
        }
    }
    /**
     * Probable temporary internal to fix possible inconsenticies during lib early stages
     */
    async checkConsistency() {
        // accessData but not active
        if (this.accessData && this.eventData.content.status == null) {
            logger.info('Found discrepency with accessData and status not active, fixing it');
            if (!this.accessData.deleted) {
                await this.accept(true);
            }
            else {
                await this.revoke();
            }
        }
        else {
            // logger.debug('CollectorClient:checkConsistency', this.accessData);
        }
    }
    /**
     * return the key to discriminate collectorClients
     * @param {PryvAccessInfo} accessInfo
     */
    static keyFromInfo(info) {
        return info.user.username + ':' + info.name;
    }
    // -------------------- sections and forms ------------- //
    getSections() {
        return this.request?.sections;
    }
    // -------------------- chat methods ----------------- //
    chatEventInfos(event) {
        if (event.streamIds.includes(this.chatSettings.chatStreamIncoming))
            return { source: 'requester' };
        if (event.streamIds.includes(this.chatSettings.chatStreamMain))
            return { source: 'me' };
        return { source: 'unkown' };
    }
    async chatPost(hdsConnection, content) {
        if (!this.hasChatFeature)
            throw new errors_1.HDSLibError('Cannot chat with this ColleectorClient');
        const newEvent = {
            type: 'message/hds-chat-v1',
            streamIds: [this.chatSettings.chatStreamMain],
            content
        };
        return await hdsConnection.apiOne('events.create', newEvent, 'event');
    }
}
exports.CollectorClient = CollectorClient;
_a = CollectorClient;
//# sourceMappingURL=CollectorClient.js.map

/***/ },

/***/ "./js/appTemplates/CollectorInvite.js"
/*!********************************************!*\
  !*** ./js/appTemplates/CollectorInvite.js ***!
  \********************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CollectorInvite = void 0;
const patchedPryv_1 = __webpack_require__(/*! ../patchedPryv */ "./js/patchedPryv.js");
const errors_1 = __webpack_require__(/*! ../errors */ "./js/errors.js");
/**
 * Collector Invite
 * There is one Collector Invite per Collector => Enduser connection
 */
class CollectorInvite {
    /**
     * get the key that will be assigned to this event;
     */
    static getKeyForEvent(eventData) {
        return eventData.id;
    }
    collector;
    eventData;
    #connection = null;
    #accessInfo = null;
    get key() {
        return CollectorInvite.getKeyForEvent(this.eventData);
    }
    get status() {
        return this.collector.inviteStatusForStreamId(this.eventData.streamIds[0]);
    }
    get apiEndpoint() {
        if (this.status !== 'active') {
            throw new errors_1.HDSLibError('invite.apiEndpoint is accessible only when active');
        }
        return this.eventData.content.apiEndpoint;
    }
    get errorType() {
        return this.eventData.content?.errorType;
    }
    get dateCreation() {
        return new Date(this.eventData.created * 1000);
    }
    get connection() {
        if (this.#connection == null) {
            this.#connection = new patchedPryv_1.pryv.Connection(this.apiEndpoint);
        }
        return this.#connection;
    }
    get hasChat() {
        return this.eventData.content.chat != null;
    }
    get chatSettings() {
        return this.eventData.content.chat;
    }
    // -------------------- chat methods ----------------- //
    chatEventInfos(event) {
        if (event.streamIds.includes(this.chatSettings.streamWrite))
            return { source: 'me' };
        if (event.streamIds.includes(this.chatSettings.streamRead))
            return { source: 'user' };
        return { source: 'unkown' };
    }
    async chatPost(content) {
        if (!this.hasChat)
            throw new Error('Cannot chat with this contact');
        const newEvent = {
            type: 'message/hds-chat-v1',
            streamIds: [this.chatSettings.streamWrite],
            content
        };
        return await this.connection.apiOne('events.create', newEvent, 'event');
    }
    /**
     * Check if connection is valid. (only if active)
     * If result is "forbidden" update and set as revoked
     * @returns accessInfo if valid.
     */
    async checkAndGetAccessInfo(forceRefresh = false) {
        if (!forceRefresh && this.#accessInfo)
            return this.#accessInfo;
        try {
            this.#accessInfo = await this.connection.accessInfo();
            return this.#accessInfo;
        }
        catch (e) {
            this.#accessInfo = null;
            if (e.response?.body?.error?.id === 'invalid-access-token') {
                await this.collector.revokeInvite(this, true);
                return null;
            }
            throw e;
        }
    }
    /**
     * revoke the invite
     */
    async revoke() {
        return this.collector.revokeInvite(this);
    }
    get displayName() {
        return this.eventData.content.name;
    }
    constructor(collector, eventData) {
        if (eventData.type !== 'invite/collector-v1')
            throw new errors_1.HDSLibError('Wrong type of event', eventData);
        this.collector = collector;
        this.eventData = eventData;
    }
    /**
     * private
     */
    setEventData(eventData) {
        if (eventData.id !== this.eventData.id)
            throw new errors_1.HDSLibError('CollectInvite event id does not match new Event');
        this.eventData = eventData;
    }
    async getSharingData() {
        if (this.status !== 'pending')
            throw new errors_1.HDSLibError('Only pendings can be shared');
        return {
            apiEndpoint: await this.collector.sharingApiEndpoint(),
            eventId: this.eventData.id
        };
    }
}
exports.CollectorInvite = CollectorInvite;
//# sourceMappingURL=CollectorInvite.js.map

/***/ },

/***/ "./js/appTemplates/CollectorRequest.js"
/*!*********************************************!*\
  !*** ./js/appTemplates/CollectorRequest.js ***!
  \*********************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CollectorRequest = void 0;
const errors_1 = __webpack_require__(/*! ../errors */ "./js/errors.js");
const HDSModelInitAndSingleton_1 = __webpack_require__(/*! ../HDSModel/HDSModelInitAndSingleton */ "./js/HDSModel/HDSModelInitAndSingleton.js");
const localizeText_1 = __webpack_require__(/*! ../localizeText */ "./js/localizeText.js");
const CURRENT_VERSION = 1;
/**
 * Each Collector has one Request
 * Which contains
 * - the name of the requester
 * - a title
 * - a description
 * - a consent message
 * - a set of permission requests
 * - a version
 */
class CollectorRequest {
    #version;
    #title;
    #description;
    #consent;
    #requester;
    #app;
    #permissionsExtra;
    #permissions;
    #sections;
    #features;
    #extraContent;
    constructor(content) {
        this.#version = CURRENT_VERSION;
        this.#requester = { name: null };
        this.#app = { id: null, url: null, data: {} };
        this.#permissions = [];
        this.#permissionsExtra = [];
        this.#sections = [];
        this.#features = {};
        this.setContent(content);
    }
    /**
     * Loadfrom invite event
     * used by CollectorClient only
     * @param invite
     */
    loadFromInviteEvent(inviteEvent) {
        this.setContent(inviteEvent.content);
    }
    /**
     * Loadfrom status event from Collector
     * used by Collector only
     * @param statusEvent
     */
    loadFromStatusEvent(statusEvent) {
        // content.data is deprecated it was used in a previous version, should be removed
        let potentialContent = statusEvent.content.request || statusEvent.content.data;
        // for some reason to be investigated sometime the data is in requestContent
        if (potentialContent.requestContent)
            potentialContent = potentialContent.requestContent;
        this.setContent(potentialContent);
    }
    /**
     * Temp content
     * @param content
     */
    setContent(content) {
        const futureContent = structuredClone(content);
        // validate content
        if (futureContent.version != null) {
            const numV = Number.parseInt(futureContent.version);
            if (numV === 0) {
                vo0ToV1(futureContent); // convert to v1 if needed
            }
            else {
                if (numV !== this.#version)
                    throw new errors_1.HDSLibError(`Invalid CollectorRequest content version: ${futureContent.version}`);
            }
            delete futureContent.version;
        }
        // -- title, consent, description
        for (const key of ['title', 'consent', 'description']) {
            if (futureContent[key] != null) {
                this[key] = futureContent[key];
            }
            delete futureContent[key];
        }
        // -- requester
        if (futureContent.requester) {
            if (futureContent.requester.name != null) {
                this.requesterName = futureContent.requester.name;
            }
            delete futureContent.requester;
        }
        // -- app
        if (futureContent.app) {
            if (futureContent.app.id != null) {
                this.appId = futureContent.app.id;
            }
            if (futureContent.app.url != null) {
                this.appUrl = futureContent.app.url;
            }
            if (futureContent.app.data != null) {
                this.appCustomData = futureContent.app.data;
            }
            delete futureContent.app;
        }
        // -- sections
        if (futureContent.sections != null) {
            this.#sections = []; // reset sections
            for (const sectionData of futureContent.sections) {
                const section = this.createSection(sectionData.key, sectionData.type);
                section.setName(sectionData.name);
                section.addItemKeys(sectionData.itemKeys);
            }
            delete futureContent.sections;
        }
        // -- permissions
        if (futureContent.permissions) {
            this.#permissions = []; // reset permissions
            futureContent.permissions.forEach((p) => {
                this.addPermission(p.streamId, p.defaultName, p.level);
            });
            delete futureContent.permissions;
        }
        // -- permissionsExtra
        if (futureContent.permissionsExtra) {
            this.#permissionsExtra = []; // reset permissions Extra
            futureContent.permissionsExtra.forEach((p) => {
                this.addPermissionExtra(p);
            });
            delete futureContent.permissionsExtra;
        }
        // -- features
        if (futureContent.features) {
            if (futureContent.features.chat) {
                this.addChatFeature(futureContent.features.chat);
                delete futureContent.features.chat;
            }
            if (Object.keys(futureContent.features).length > 0) {
                throw new errors_1.HDSLibError('Found unkown features', futureContent.features);
            }
            delete futureContent.features;
        }
        this.#extraContent = futureContent;
    }
    // ------------- getter and setters ------------ //
    get version() { return this.#version; }
    set title(title) { this.#title = (0, localizeText_1.validateLocalizableText)('title', title); }
    get title() { return this.#title; }
    set consent(consent) { this.#consent = (0, localizeText_1.validateLocalizableText)('consent', consent); }
    get consent() { return this.#consent; }
    set description(description) { this.#description = (0, localizeText_1.validateLocalizableText)('description', description); }
    get description() { return this.#description; }
    set requesterName(name) { this.#requester.name = validateString('requester:name', name); }
    get requesterName() { return this.#requester.name; }
    set appId(id) { this.#app.id = validateString('app:id', id); }
    get appId() { return this.#app.id; }
    set appUrl(url) { this.#app.url = validateString('app:url', url); }
    get appUrl() { return this.#app.url; }
    set appCustomData(data) { this.#app.data = data; }
    get appCustomData() { return this.#app.data; }
    get permissions() { return this.#permissions; }
    get permissionsExtra() { return this.#permissionsExtra; }
    get features() { return this.#features; }
    // --- section --- //
    get sections() {
        return this.#sections;
    }
    get sectionsData() {
        const result = [];
        for (const section of this.#sections) {
            const data = section.getData();
            result.push(data);
        }
        return result;
    }
    createSection(key, type) {
        if (this.getSectionByKey(key) != null)
            throw new errors_1.HDSLibError(`Section with key: ${key} already exists`);
        const section = new CollectorRequestSection(key, type);
        this.#sections.push(section);
        return section;
    }
    getSectionByKey(key) {
        return this.#sections.find((s) => (s.key === key));
    }
    // ---------- permissions ---------- //
    addPermissions(permissions) {
        for (const permission of permissions) {
            this.addPermission(permission.streamId, permission.defaultName, permission.level);
        }
    }
    addPermission(streamId, defaultName, level) {
        this.#permissions.push({ streamId, defaultName, level });
    }
    /**
     * Add a static permission, not linked to itemKeys for other usages
     * @param permission
     */
    addPermissionExtra(permission) {
        // todo standard checks
        this.#permissionsExtra.push(permission);
    }
    /**
     * Reset permissions
     */
    resetPermissions() {
        this.#permissions.splice(0, this.#permissions.length);
    }
    /**
     * Rebuild permissions based on sections itemKeys and staticPermissions
     */
    buildPermissions() {
        // 1- get all items form the questionnary sections
        const itemKeys = [];
        for (const section of this.sections) {
            itemKeys.push(...section.itemKeys);
        }
        // 2 - get the permissions with eventual preRequest
        const preRequest = this.permissionsExtra || [];
        const permissions = (0, HDSModelInitAndSingleton_1.getModel)().authorizations.forItemKeys(itemKeys, { preRequest });
        // 3 - if no error araised - reset permissions
        this.resetPermissions();
        this.addPermissions(permissions);
    }
    // ---------- features ------------- //
    get hasChatFeature() {
        return this.#features.chat != null;
    }
    addChatFeature(settings = { type: 'user' }) {
        if (!['user', 'usernames'].includes(settings.type))
            throw new errors_1.HDSLibError('Invalid chat type', settings);
        this.#features.chat = settings;
    }
    // ---------- sections ------------- //
    /**
     * Return Content to comply with initial implementation as an object
     */
    get content() {
        const content = {
            version: this.version,
            title: this.title,
            consent: this.consent,
            description: this.description,
            requester: {
                name: this.requesterName
            },
            features: this.features,
            permissionsExtra: this.permissionsExtra,
            permissions: this.permissions,
            app: {
                id: this.appId,
                url: this.appUrl,
                data: this.appCustomData
            },
            sections: this.sectionsData
        };
        Object.assign(content, this.#extraContent);
        return content;
    }
}
exports.CollectorRequest = CollectorRequest;
function validateString(key, totest) {
    if (totest == null || typeof totest !== 'string')
        throw new errors_1.HDSLibError(`Invalid ${key} value: ${totest}`, { [key]: totest });
    return totest;
}
class CollectorRequestSection {
    #type;
    #name;
    #key;
    #itemKeys;
    constructor(key, type) {
        this.#key = key;
        this.#type = type;
        this.#itemKeys = [];
        this.#name = {
            en: ''
        };
    }
    addItemKeys(keys) {
        keys.forEach((k) => this.addItemKey(k));
    }
    addItemKey(key) {
        (0, HDSModelInitAndSingleton_1.getModel)().itemsDefs.forKey(key); // will throw error if not found
        if (this.#itemKeys.includes(key))
            return; // avoid double entries
        this.#itemKeys.push(key);
    }
    setName(localizedName) {
        for (const [languageCode, name] of Object.entries(localizedName)) {
            this.setNameLocal(languageCode, name);
        }
    }
    setNameLocal(languageCode, name) {
        this.#name[languageCode] = name;
    }
    get type() { return this.#type; }
    get key() { return this.#key; }
    get itemKeys() { return this.#itemKeys; }
    get name() { return this.#name; }
    getData() {
        return {
            key: this.key,
            type: this.#type,
            name: this.#name,
            itemKeys: this.#itemKeys
        };
    }
}
/**
 * Transform data to match v1
 * @param v0Data
 */
function vo0ToV1(v0Data) {
    if (v0Data.app?.data?.forms) {
        if (v0Data.sections)
            throw new errors_1.HDSLibError('Cannot mix data.forms & sections', v0Data);
        v0Data.sections = [];
        for (const [key, value] of Object.entries(v0Data.app.data.forms)) {
            value.key = key;
            value.name = {
                en: value.name
            };
            v0Data.sections.push(value);
        }
        delete v0Data.app.data.forms;
    }
    v0Data.version = 1;
}
//# sourceMappingURL=CollectorRequest.js.map

/***/ },

/***/ "./js/appTemplates/appTemplates.js"
/*!*****************************************!*\
  !*** ./js/appTemplates/appTemplates.js ***!
  \*****************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CollectorRequest = exports.CollectorInvite = exports.CollectorClient = exports.Collector = exports.Application = exports.AppClientAccount = exports.AppManagingAccount = void 0;
const AppManagingAccount_1 = __webpack_require__(/*! ./AppManagingAccount */ "./js/appTemplates/AppManagingAccount.js");
Object.defineProperty(exports, "AppManagingAccount", ({ enumerable: true, get: function () { return AppManagingAccount_1.AppManagingAccount; } }));
const AppClientAccount_1 = __webpack_require__(/*! ./AppClientAccount */ "./js/appTemplates/AppClientAccount.js");
Object.defineProperty(exports, "AppClientAccount", ({ enumerable: true, get: function () { return AppClientAccount_1.AppClientAccount; } }));
const Application_1 = __webpack_require__(/*! ./Application */ "./js/appTemplates/Application.js");
Object.defineProperty(exports, "Application", ({ enumerable: true, get: function () { return Application_1.Application; } }));
const Collector_1 = __webpack_require__(/*! ./Collector */ "./js/appTemplates/Collector.js");
Object.defineProperty(exports, "Collector", ({ enumerable: true, get: function () { return Collector_1.Collector; } }));
const CollectorClient_1 = __webpack_require__(/*! ./CollectorClient */ "./js/appTemplates/CollectorClient.js");
Object.defineProperty(exports, "CollectorClient", ({ enumerable: true, get: function () { return CollectorClient_1.CollectorClient; } }));
const CollectorInvite_1 = __webpack_require__(/*! ./CollectorInvite */ "./js/appTemplates/CollectorInvite.js");
Object.defineProperty(exports, "CollectorInvite", ({ enumerable: true, get: function () { return CollectorInvite_1.CollectorInvite; } }));
const CollectorRequest_1 = __webpack_require__(/*! ./CollectorRequest */ "./js/appTemplates/CollectorRequest.js");
Object.defineProperty(exports, "CollectorRequest", ({ enumerable: true, get: function () { return CollectorRequest_1.CollectorRequest; } }));
//# sourceMappingURL=appTemplates.js.map

/***/ },

/***/ "./js/errors.js"
/*!**********************!*\
  !*** ./js/errors.js ***!
  \**********************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HDSLibError = void 0;
class HDSLibError extends Error {
    innerObject;
    constructor(message, innerObject = {}) {
        const msg = (innerObject.message != null) ? message + ' >> ' + innerObject.message : message;
        super(msg);
        this.innerObject = innerObject;
    }
    toString() {
        const res = super.toString();
        return res + '\nInner Object:\n' + JSON.stringify(this.innerObject, null, 2);
    }
}
exports.HDSLibError = HDSLibError;
//# sourceMappingURL=errors.js.map

/***/ },

/***/ "./js/index.js"
/*!*********************!*\
  !*** ./js/index.js ***!
  \*********************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.logger = exports.toolkit = exports.l = exports.localizeText = exports.appTemplates = exports.HDSModel = exports.HDSService = exports.settings = exports.pryv = exports.initHDSModel = exports.getHDSModel = exports.model = void 0;
const localizeText_1 = __webpack_require__(/*! ./localizeText */ "./js/localizeText.js");
Object.defineProperty(exports, "localizeText", ({ enumerable: true, get: function () { return localizeText_1.localizeText; } }));
Object.defineProperty(exports, "l", ({ enumerable: true, get: function () { return localizeText_1.localizeText; } }));
const settings = __importStar(__webpack_require__(/*! ./settings */ "./js/settings.js"));
exports.settings = settings;
const patchedPryv_1 = __webpack_require__(/*! ./patchedPryv */ "./js/patchedPryv.js");
Object.defineProperty(exports, "pryv", ({ enumerable: true, get: function () { return patchedPryv_1.pryv; } }));
const HDSModel_1 = __webpack_require__(/*! ./HDSModel/HDSModel */ "./js/HDSModel/HDSModel.js");
Object.defineProperty(exports, "HDSModel", ({ enumerable: true, get: function () { return HDSModel_1.HDSModel; } }));
const appTemplates = __importStar(__webpack_require__(/*! ./appTemplates/appTemplates */ "./js/appTemplates/appTemplates.js"));
exports.appTemplates = appTemplates;
const logger = __importStar(__webpack_require__(/*! ./logger */ "./js/logger.js"));
exports.logger = logger;
const HDSService_1 = __webpack_require__(/*! ./HDSService */ "./js/HDSService.js");
Object.defineProperty(exports, "HDSService", ({ enumerable: true, get: function () { return HDSService_1.HDSService; } }));
const HDSModelInitAndSingleton = __importStar(__webpack_require__(/*! ./HDSModel/HDSModelInitAndSingleton */ "./js/HDSModel/HDSModelInitAndSingleton.js"));
const toolkit = __importStar(__webpack_require__(/*! ./toolkit */ "./js/toolkit/index.js"));
exports.toolkit = toolkit;
exports.model = (() => {
    console.warn('HDSLib.model is deprecated use getHDSModel() instead');
    return HDSModelInitAndSingleton.getModel();
})();
exports.getHDSModel = HDSModelInitAndSingleton.getModel;
exports.initHDSModel = HDSModelInitAndSingleton.initHDSModel;
// also exporting default for typescript to capture HDSLib.. there is surely a nicer way to do
const HDSLib = {
    getHDSModel: exports.getHDSModel,
    initHDSModel: exports.initHDSModel,
    pryv: patchedPryv_1.pryv,
    settings,
    HDSService: HDSService_1.HDSService,
    HDSModel: HDSModel_1.HDSModel,
    appTemplates,
    localizeText: localizeText_1.localizeText,
    l: localizeText_1.localizeText,
    toolkit,
    logger
};
exports["default"] = HDSLib;
//# sourceMappingURL=index.js.map

/***/ },

/***/ "./js/localizeText.js"
/*!****************************!*\
  !*** ./js/localizeText.js ***!
  \****************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

/**
 * basic localization functions
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getPreferredLocales = getPreferredLocales;
exports.getSupportedLocales = getSupportedLocales;
exports.resetPreferredLocales = resetPreferredLocales;
exports.localizeText = localizeText;
exports.setPreferredLocales = setPreferredLocales;
exports.validateLocalizableText = validateLocalizableText;
const errors_1 = __webpack_require__(/*! ./errors */ "./js/errors.js");
const supportedLocales = ['en', 'fr', 'es'];
Object.freeze(supportedLocales);
let preferredLocales = [...supportedLocales];
/**
 * get the current preferred locales
 */
function getPreferredLocales() {
    return [...preferredLocales];
}
/**
 * get the current supported locales
 */
function getSupportedLocales() {
    return [...supportedLocales];
}
/**
 * reset prefferedLocalesTo Original state
 */
function resetPreferredLocales() {
    setPreferredLocales([...supportedLocales]);
}
/**
 * return the translation of this item considering the setting of preffered language
 */
function localizeText(textItem) {
    if (textItem == null)
        return null;
    if (!textItem.en)
        throw new errors_1.HDSLibError('textItems must have an english translation', { textItem });
    for (const l of preferredLocales) {
        if (textItem[l])
            return textItem[l];
    }
    return textItem.en;
}
/**
 * Change prefferedLocal order
 */
function setPreferredLocales(arrayOfLocals) {
    if (!Array.isArray(arrayOfLocals)) {
        throw new errors_1.HDSLibError('setPreferredLocales takes an array of language codes');
    }
    const unsupportedLocales = arrayOfLocals.filter(l => (supportedLocales.indexOf(l) < 0));
    if (unsupportedLocales.length > 0) {
        throw new errors_1.HDSLibError(`locales "${unsupportedLocales.join(', ')}" are not supported`, arrayOfLocals);
    }
    preferredLocales = [...new Set([...arrayOfLocals, ...preferredLocales])];
}
/**
 * throw errors if an item is not of type localizableText
 */
function validateLocalizableText(key, toTest) {
    if (toTest.en == null || typeof toTest.en !== 'string')
        throw new errors_1.HDSLibError(`Missing or invalid localizable text for ${key}`, { [key]: toTest });
    for (const optionalLang of supportedLocales) {
        if (optionalLang === 'en')
            continue;
        if (toTest[optionalLang] != null && typeof toTest[optionalLang] !== 'string')
            throw new errors_1.HDSLibError(`Missing or invalid localizable text for ${key} languagecode: ${optionalLang}`, { [key]: toTest, languageCode: optionalLang });
    }
    return toTest;
}
//# sourceMappingURL=localizeText.js.map

/***/ },

/***/ "./js/logger.js"
/*!**********************!*\
  !*** ./js/logger.js ***!
  \**********************/
(__unused_webpack_module, exports) {

"use strict";

/**
 * Basic logger
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setLogger = setLogger;
exports.info = info;
exports.error = error;
exports.debug = debug;
exports.warn = warn;
let logger = {
    info: log('info'),
    error: log('error'),
    debug: log('debug')
};
function setLogger(newLogger) {
    logger = newLogger;
}
function info(...args) { logger.info(...args); }
function error(...args) { logger.error(...args); }
function debug(..._args) {
    // logger.debug(..._args);
}
function warn(...args) {
    logger.info(...args); // Use info for warn for now
}
function log(type) {
    return function (...args) {
        console.log(`Logger: [${type}]`, ...args);
    };
}
//# sourceMappingURL=logger.js.map

/***/ },

/***/ "./js/patchedPryv.js"
/*!***************************!*\
  !*** ./js/patchedPryv.js ***!
  \***************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.pryv = void 0;
/**
 * While developing this lib some functionalities should be
 * added to pryv js-lib in a second step
 */
const pryv = __importStar(__webpack_require__(/*! pryv */ "./node_modules/pryv/src/index.js"));
exports.pryv = pryv;
const monitor_1 = __importDefault(__webpack_require__(/*! @pryv/monitor */ "./node_modules/@pryv/monitor/src/index.js"));
const socket_io_1 = __importDefault(__webpack_require__(/*! @pryv/socket.io */ "./node_modules/@pryv/socket.io/src/index.js"));
(0, monitor_1.default)(pryv);
(0, socket_io_1.default)(pryv);
//# sourceMappingURL=patchedPryv.js.map

/***/ },

/***/ "./js/settings.js"
/*!************************!*\
  !*** ./js/settings.js ***!
  \************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setPreferredLocales = void 0;
exports.setServiceInfoURL = setServiceInfoURL;
exports.getServiceInfoURL = getServiceInfoURL;
const localizeText_1 = __webpack_require__(/*! ./localizeText */ "./js/localizeText.js");
Object.defineProperty(exports, "setPreferredLocales", ({ enumerable: true, get: function () { return localizeText_1.setPreferredLocales; } }));
// todo change when in production
let serviceInfoUrl = 'https://demo.datasafe.dev/reg/service/info';
/**
 * Set default service info URL
 */
function setServiceInfoURL(url) {
    serviceInfoUrl = url;
}
/**
 * Get default service info URL
 */
function getServiceInfoURL() {
    return serviceInfoUrl;
}
//# sourceMappingURL=settings.js.map

/***/ },

/***/ "./js/toolkit/StreamsAutoCreate.js"
/*!*****************************************!*\
  !*** ./js/toolkit/StreamsAutoCreate.js ***!
  \*****************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StreamsAutoCreate = void 0;
const errors_1 = __webpack_require__(/*! ../errors */ "./js/errors.js");
const HDSModelInitAndSingleton_1 = __webpack_require__(/*! ../HDSModel/HDSModelInitAndSingleton */ "./js/HDSModel/HDSModelInitAndSingleton.js");
const StreamsTools_1 = __webpack_require__(/*! ./StreamsTools */ "./js/toolkit/StreamsTools.js");
class StreamsAutoCreate {
    connection;
    knownStreams = {};
    /**
     * Safe way to create StreamsAutoCreate as it check if ones is already attached to connection
     */
    static attachToConnection(connection, knownStreamStructure) {
        const streamsAutoCreate = connection.streamsAutoCreate || new StreamsAutoCreate(connection);
        streamsAutoCreate.addStreamStructure(knownStreamStructure);
        return streamsAutoCreate;
    }
    /**
     * @private
     * Don't use.. use StreamsAutoCreate.attachToConnection
     */
    constructor(connection) {
        // make connection a weak reference to avoid cycles
        this.connection = new WeakRef(connection);
        this.knownStreams = {};
        connection.streamsAutoCreate = this;
    }
    /**
     * @param keysOrDefs - Array or Set of itemDefs or itemKeys
     */
    async ensureExistsForItems(keysOrDefs) {
        // get existing streamIds;
        const modelStreams = (0, HDSModelInitAndSingleton_1.getModel)().streams;
        const streamsToCreate = modelStreams.getNecessaryListForItems(Array.from(keysOrDefs), { knowExistingStreamsIds: this.knowStreamIds() });
        const apiCalls = streamsToCreate.map((s) => ({
            method: 'streams.create',
            params: s
        }));
        const connection = this.connection?.deref();
        if (!connection) {
            throw new Error('Lost reference to connection');
        }
        const results = await connection.api(apiCalls);
        const streamsCreated = [];
        const errors = [];
        for (const result of results) {
            if (result.stream?.id) {
                streamsCreated.push(result.stream);
                continue;
            }
            if (result.error) {
                if (result.error.id === 'item-already-exists')
                    continue; // all OK
                errors.push(result.error);
                continue;
            }
            // shouldn't be there
            errors.push({
                id: 'unexpected-error',
                message: 'Unexpected content in api response',
                data: result
            });
        }
        if (errors.length > 0) {
            throw new errors_1.HDSLibError('Error creating streams', errors);
        }
        return streamsCreated;
    }
    knowStreamIds() {
        return Object.keys(this.knownStreams);
    }
    addStreamStructure(streamStructure) {
        if (streamStructure == null)
            return;
        for (const stream of (0, StreamsTools_1.allStreamsAndChildren)(streamStructure)) {
            this.#addStream(stream);
        }
    }
    #addStream(stream) {
        if (!this.knownStreams[stream.id]) {
            this.knownStreams[stream.id] = {};
        }
    }
}
exports.StreamsAutoCreate = StreamsAutoCreate;
//# sourceMappingURL=StreamsAutoCreate.js.map

/***/ },

/***/ "./js/toolkit/StreamsTools.js"
/*!************************************!*\
  !*** ./js/toolkit/StreamsTools.js ***!
  \************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.allStreamsAndChildren = allStreamsAndChildren;
exports.getStreamIdAndChildrenIds = getStreamIdAndChildrenIds;
/**
 * Iterate all streams and children
 */
function* allStreamsAndChildren(streamStructure) {
    for (const stream of streamStructure) {
        yield stream;
        if (stream.children && stream.children.length > 0) {
            for (const child of allStreamsAndChildren(stream.children)) {
                yield child;
            }
        }
    }
}
function getStreamIdAndChildrenIds(stream) {
    const streamIds = [];
    for (const s of allStreamsAndChildren([stream])) {
        streamIds.push(s.id);
    }
    return streamIds;
}
//# sourceMappingURL=StreamsTools.js.map

/***/ },

/***/ "./js/toolkit/index.js"
/*!*****************************!*\
  !*** ./js/toolkit/index.js ***!
  \*****************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StreamTools = exports.StreamsAutoCreate = void 0;
const StreamsAutoCreate_1 = __webpack_require__(/*! ./StreamsAutoCreate */ "./js/toolkit/StreamsAutoCreate.js");
Object.defineProperty(exports, "StreamsAutoCreate", ({ enumerable: true, get: function () { return StreamsAutoCreate_1.StreamsAutoCreate; } }));
const StreamTools = __importStar(__webpack_require__(/*! ./StreamsTools */ "./js/toolkit/StreamsTools.js"));
exports.StreamTools = StreamTools;
//# sourceMappingURL=index.js.map

/***/ },

/***/ "./js/utils.js"
/*!*********************!*\
  !*** ./js/utils.js ***!
  \*********************/
(__unused_webpack_module, exports) {

"use strict";

/**
 * Set of Misc utilities
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.waitUntilFalse = waitUntilFalse;
exports.deepFreeze = deepFreeze;
/**
 * Timed semaphore
 */
async function waitUntilFalse(callBackToReturnFalse, maxWaitMs = 5000) {
    const started = Date.now();
    while (callBackToReturnFalse()) {
        await new Promise((resolve) => { setTimeout(resolve, 100); });
        if (Date.now() - started > maxWaitMs)
            throw new Error(`Timeout after ${maxWaitMs}ms`);
    }
}
/**
 * Recursively make immutable an object
 */
function deepFreeze(object) {
    // Retrieve the property names defined on object
    const propNames = Reflect.ownKeys(object);
    // Freeze properties before freezing self
    for (const name of propNames) {
        const value = object[name];
        if ((value && typeof value === 'object') || typeof value === 'function') {
            deepFreeze(value);
        }
    }
    return Object.freeze(object);
}
//# sourceMappingURL=utils.js.map

/***/ },

/***/ "./node_modules/@pryv/monitor/src/Monitor.js"
/*!***************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/Monitor.js ***!
  \***************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const EventEmitter = __webpack_require__(/*! events */ "./node_modules/events/events.js");
const UpdateMethod = __webpack_require__(/*! ./UpdateMethod/ */ "./node_modules/@pryv/monitor/src/UpdateMethod/index.js");
const _updateEvents = __webpack_require__(/*! ./lib/updateEvents */ "./node_modules/@pryv/monitor/src/lib/updateEvents.js");
const _updateStreams = __webpack_require__(/*! ./lib/updateStreams */ "./node_modules/@pryv/monitor/src/lib/updateStreams.js");
const Changes = __webpack_require__(/*! ./lib/Changes */ "./node_modules/@pryv/monitor/src/lib/Changes.js");

/**
 * Monitor changes on a Pryv.io account.
 * Emits events when data changes are detected.
 * @memberof pryv
 * @extends EventEmitter
 */
class Monitor extends EventEmitter {
  /**
   * Create a new Monitor
   * @param {(string|Connection)} apiEndpointOrConnection - API endpoint URL or Connection instance
   * @param {MonitorScope} [eventsGetScope={}] - The scope to monitor (events.get parameters)
   */
  constructor (apiEndpointOrConnection, eventsGetScope = {}) {
    super();
    // @ts-ignore - pryv is set at runtime by extendPryvMonitor
    if (!Monitor.pryv) {
      throw new Error('package \'@pryv/monitor\' must loaded after package \'pryv\'');
    }

    this.eventsGetScope = { // default eventsGetScope values
      fromTime: -Number.MAX_VALUE,
      toTime: Number.MAX_VALUE,
      modifiedSince: -Number.MAX_VALUE
    };
    Object.assign(this.eventsGetScope, eventsGetScope);

    // @ts-ignore - pryv is set at runtime
    if (apiEndpointOrConnection instanceof Monitor.pryv.Connection) {
      this.connection = apiEndpointOrConnection;
    } else {
      // @ts-ignore - pryv is set at runtime
      this.connection = new Monitor.pryv.Connection(apiEndpointOrConnection);
    }
    this.states = {
      started: false,
      starting: false, // in phase of initializing
      updatingEvents: false, // semaphore to prevent updating events in parallel
      updatingStreams: false // semaphore to prevent updating streams in parallel
    };
  }

  /**
   * Start the monitor and perform initial sync
   * @returns {Promise<Monitor>} Promise resolving to this Monitor instance
   */
  async start () {
    if (this.states.started || this.states.starting) return this;
    this.states.starting = true;
    await _updateStreams(this);
    await _updateEvents(this);
    // once initialized we for the eventsGetScope to request also deletions
    this.eventsGetScope.includeDeletions = true;
    this.eventsGetScope.state = 'all';

    this.states.starting = false;
    this.states.started = true;
    this.ready();
    return this;
  }

  /**
   * Request an events update according to the current scope
   * @returns {Promise<Monitor>} Promise resolving to this Monitor instance
   */
  async updateEvents () {
    if (!this.states.started) {
      throw new Error('Start Monitor before calling update Events');
    }
    if (this.states.updatingEvents) { // semaphore
      this.states.updateEventRequired = true;
      return this;
    }

    this.states.updatingEvents = true;
    try {
      this.states.updateEventRequired = false;
      await _updateEvents(this);
    } catch (e) {
      this.emit(Changes.ERROR, e);
    }
    this.states.updatingEvents = false;

    if (this.states.updateEventRequired) { // if another event update is required
      setTimeout(function () {
        this.updateEvents();
      }.bind(this), 1);
    } else {
      this.ready();
    }
    return this;
  }

  /**
   * Request a streams update
   * @returns {Promise<Monitor>} Promise resolving to this Monitor instance
   */
  async updateStreams () {
    if (!this.states.started) {
      throw new Error('Start Monitor before calling update Streams');
    }
    if (this.states.updatingStreams) { // semaphore
      this.states.updateStreamsRequired = true;
      return this;
    }

    this.states.updatingStreams = true;
    try {
      this.states.updateStreamsRequired = false;
      await _updateStreams(this);
    } catch (e) {
      this.emit(Changes.ERROR, e);
    }
    this.states.updatingStreams = false;

    if (this.states.updateStreamsRequired) { // if another streams update is required
      setTimeout(function () {
        this.updateStreams();
      }.bind(this), 1);
    } else {
      this.ready();
    }
    return this;
  }

  /**
   * @private
   * Called after init phase and each updateEvents
   * Advertise the update method or any listener that the Monitor is ready
   * for a next event update
   */
  ready () {
    if (!this.states.started) return; // it might be stoped
    this.emit(Changes.READY);
  }

  /**
   * Stop monitoring (no event will be fired anymore)
   * @returns {Monitor} this
   */
  stop () {
    if (!this.states.started) return this;
    if (this.states.starting) throw new Error('Process is starting, wait for the end of initialization to stop it');
    this.emit(Changes.STOP);
    this.states.started = false;
    return this;
  }

  /**
   * Used by updateMethods to be sure they can call updateXXX methods
   * @property {Boolean} started - true is monitor is started
   */
  get started () {
    return this.states.started;
  }

  /**
   * @private
   * Called by UpdateMethod to share cross references
   * Set a custom update method
   * @param {Object} updateMethod - the auto-update method
   * @returns {Monitor} this
   */
  addUpdateMethod (updateMethod) {
    updateMethod.setMonitor(this);
    return this;
  }
}

Monitor.UpdateMethod = UpdateMethod;
module.exports = Monitor;


/***/ },

/***/ "./node_modules/@pryv/monitor/src/UpdateMethod/EventsTimer.js"
/*!********************************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/UpdateMethod/EventsTimer.js ***!
  \********************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const UpdateMethod = __webpack_require__(/*! ./UpdateMethod */ "./node_modules/@pryv/monitor/src/UpdateMethod/UpdateMethod.js");

/**
 * Update method that polls for event changes at a fixed interval.
 * @memberof pryv.Monitor
 * @extends UpdateMethod
 */
class EventsTimer extends UpdateMethod {
  /**
   * @param {number} updateRateMS - The refresh rate in milliseconds (must be > 1)
   */
  constructor (updateRateMS) {
    super();
    this.timer = null;
    if (!updateRateMS || isNaN(updateRateMS) || updateRateMS < 1) {
      throw new Error('Monitor timer refresh rate is not valid. It should be a number > 1');
    }
    this.updateRateMS = updateRateMS;
  }

  async ready () {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.monitor.started) this.monitor.updateEvents();
    }, this.updateRateMS);
  }
}

module.exports = EventsTimer;


/***/ },

/***/ "./node_modules/@pryv/monitor/src/UpdateMethod/Socket.js"
/*!***************************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/UpdateMethod/Socket.js ***!
  \***************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */

const UpdateMethod = __webpack_require__(/*! ./UpdateMethod */ "./node_modules/@pryv/monitor/src/UpdateMethod/UpdateMethod.js");
const Changes = __webpack_require__(/*! ../lib/Changes */ "./node_modules/@pryv/monitor/src/lib/Changes.js");

/**
 * Update method that uses @pryv/socket.io events for real-time updates.
 * Requires @pryv/socket.io to be loaded.
 * @memberof pryv.Monitor
 * @extends UpdateMethod
 */
class Socket extends UpdateMethod {
  async ready () {
    if (this.socket) return;
    // @ts-ignore - socket is added by @pryv/socket.io extension
    if (!this.monitor.connection.socket) {
      throw new Error('You should load package @pryv/socket.io to use monitor with websockets');
    }
    // @ts-ignore - socket is added by @pryv/socket.io extension
    this.socket = await this.monitor.connection.socket.open();
    this.socket.on('eventsChanged', () => { this.monitor.updateEvents(); });
    this.socket.on('streamsChanged', () => { this.monitor.updateStreams(); });
    this.socket.on('error', (error) => { this.monitor.emit(Changes.ERROR, error); });
  }

  async stop () {
    if (!this.socket) return;
    try { this.socket.close(); } catch (e) { }
    this.socket = null;
  }
}
module.exports = Socket;


/***/ },

/***/ "./node_modules/@pryv/monitor/src/UpdateMethod/UpdateMethod.js"
/*!*********************************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/UpdateMethod/UpdateMethod.js ***!
  \*********************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const Changes = __webpack_require__(/*! ../lib/Changes */ "./node_modules/@pryv/monitor/src/lib/Changes.js");
/**
 * Base class for update methods used by Monitor.
 * Subclass this to create custom update strategies.
 * @memberof pryv.Monitor
 */
class UpdateMethod {
  /**
   * Assign a Monitor to this updater.
   * Usually called by the monitor itself on monitor.addUpdateMethod()
   * @param {Monitor} monitor - The monitor to attach to
   */
  setMonitor (monitor) {
    if (this.monitor) {
      throw new Error('An update Method can be assigned to one monitor only');
    }
    this.monitor = monitor;
    // @ts-ignore - Changes.READY and Changes.STOP are valid event names
    monitor.on(Changes.READY, this.ready.bind(this));
    // @ts-ignore
    monitor.on(Changes.STOP, this.stop.bind(this));
    if (monitor.started) {
      this.ready();
    }
  }

  /**
   * Called when all update tasks are done and monitor is ready for next update.
   * Override in subclasses to implement custom behavior.
   * @returns {Promise<void>}
   */
  async ready () { }

  /**
   * Called when monitor is stopped. Override to clean up resources.
   * @returns {Promise<void>}
   */
  async stop () { }
}

module.exports = UpdateMethod;


/***/ },

/***/ "./node_modules/@pryv/monitor/src/UpdateMethod/index.js"
/*!**************************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/UpdateMethod/index.js ***!
  \**************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */

module.exports = {
  Null: __webpack_require__(/*! ./UpdateMethod */ "./node_modules/@pryv/monitor/src/UpdateMethod/UpdateMethod.js"),
  Socket: __webpack_require__(/*! ./Socket */ "./node_modules/@pryv/monitor/src/UpdateMethod/Socket.js"),
  EventsTimer: __webpack_require__(/*! ./EventsTimer */ "./node_modules/@pryv/monitor/src/UpdateMethod/EventsTimer.js")
};


/***/ },

/***/ "./node_modules/@pryv/monitor/src/index.js"
/*!*************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/index.js ***!
  \*************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const Monitor = __webpack_require__(/*! ./Monitor */ "./node_modules/@pryv/monitor/src/Monitor.js");
const Changes = __webpack_require__(/*! ./lib/Changes */ "./node_modules/@pryv/monitor/src/lib/Changes.js");

Monitor.Changes = Changes;

/**
 * Load Monitor capabilities onto `pryv`
 * @param {pryv} pryv `pryv` library @see https://github.com/pryv/lib-js
 */
module.exports = function (pryv) {
  console.log('Pryv version', pryv.version);
  // check version here
  if (pryv.Monitor) {
    throw new Error('Monitor already loaded');
  }
  // sharing cross references
  pryv.Monitor = Monitor;
  // TODO: remove deprecated `Pryv` alias with next major version
  Monitor.pryv = Monitor.Pryv = pryv;
  return Monitor;
};

/**
 * @typedef pryv.Monitor.Changes
 * @property {string} EVENT "event" fired on new or changed event
 * @property {string} EVENT_DELETE "eventDelete"
 * @property {string} STREAMS "streams"
 * @property {string} ERROR "error"
 * @property {string} READY "ready"
 * @property {string} STOP "stop"
 */

/**
 * A scope corresponding to EventGetParameters @see https://l.backloop.dev:4443/reference#get-events
 * Property `limit` cannot be specified;
 * @typedef {Object} pryv.Monitor.Scope
 * @property {timestamp} [fromTime=TIMERANGE_MIN] (in seconds)
 * @property {timestamp} [toTime=TIMERANGE_MAX] (in seconds)
 * @property {string[]} [streams] - array of streamIds
 * @property {string[]} [tags] - array of tags
 * @property {string[]} [types] - array of EventTypes
 * @property {boolean} [running]
 * @property {boolean} [sortAscending] - If true, events will be sorted from oldest to newest. ! with monitors, this will only determine the way monitor will receive events on each update. The order they will be notified to listener cannot be guranted.
 * @property {('default'|'trashed'|'all')} [state]
 * @property {boolean} [includeDeletions]
 * @property {timestamp} modifiedSince - (in seconds) only events modified after this date
 */


/***/ },

/***/ "./node_modules/@pryv/monitor/src/lib/Changes.js"
/*!*******************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/lib/Changes.js ***!
  \*******************************************************/
(module) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
/**
 * Enum trigger messages
 * @readonly
 * @enum {string}
 */
const Changes = {
  EVENT: 'event',
  EVENT_DELETE: 'eventDelete',
  STREAMS: 'streams',
  ERROR: 'error',
  READY: 'ready',
  STOP: 'stop'
};

module.exports = Changes;


/***/ },

/***/ "./node_modules/@pryv/monitor/src/lib/updateEvents.js"
/*!************************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/lib/updateEvents.js ***!
  \************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const Changes = __webpack_require__(/*! ./Changes */ "./node_modules/@pryv/monitor/src/lib/Changes.js");

module.exports = async function _updateEvents (monitor) {
  function forEachEvent (event) {
    // update eventsGetScope with "latest modified" information found
    if (event.modified > monitor.eventsGetScope.modifiedSince) {
      monitor.eventsGetScope.modifiedSince = event.modified;
    }
    if (event.deleted) {
      // event.delete is actually the date it was deleted.
      // use it as "modified" information
      if (event.deleted > monitor.eventsGetScope.modifiedSince) {
        monitor.eventsGetScope.modifiedSince = event.deleted;
      }
      monitor.emit(Changes.EVENT_DELETE, event);
    } else {
      monitor.emit(Changes.EVENT, event);
    }
  }
  try {
    await monitor.connection.getEventsStreamed(monitor.eventsGetScope, forEachEvent);
  } catch (e) {
    monitor.emit(Changes.ERROR, e);
  }
};


/***/ },

/***/ "./node_modules/@pryv/monitor/src/lib/updateStreams.js"
/*!*************************************************************!*\
  !*** ./node_modules/@pryv/monitor/src/lib/updateStreams.js ***!
  \*************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const Changes = __webpack_require__(/*! ./Changes */ "./node_modules/@pryv/monitor/src/lib/Changes.js");

module.exports = async function _updateStreams (monitor) {
  try {
    const result = await monitor.connection.get('streams');
    if (!result.streams) { throw new Error('Invalid response ' + JSON.stringify(result)); }
    monitor.emit(Changes.STREAMS, result.streams);
  } catch (e) {
    monitor.emit(Changes.ERROR, e);
  }
};


/***/ },

/***/ "./node_modules/@pryv/socket.io/src/SocketIO.js"
/*!******************************************************!*\
  !*** ./node_modules/@pryv/socket.io/src/SocketIO.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const io = __webpack_require__(/*! socket.io-client */ "./node_modules/socket.io-client/build/cjs/index.js");
const { EventEmitter } = __webpack_require__(/*! events */ "./node_modules/events/events.js");

const EVENTS = ['eventsChanged', 'streamsChanged', 'accessesChanged', 'disconnect', 'error'];

/**
 * Socket.IO transport for a Connection.
 * Use connection.socket to access the instance associated with a Connection.
 * @memberof pryv
 * @extends EventEmitter
 */
class SocketIO extends EventEmitter {
  /**
   * @param {Connection} connection - The connection to bind to
   */
  constructor (connection) {
    super();
    /** @type {Connection} */
    this.connection = connection;
    /** @type {boolean} */
    this.connecting = false;
    this._io = null;
  }

  /**
   * Open the Socket.IO stream
   * @throws {Error} On connection failures
   * @returns {Promise<SocketIO>} Promise resolving to this SocketIO instance
   */
  async open () {
    return new Promise((resolve, reject) => {
      if (this._io) return resolve(this);
      if (this.connecting) return reject(new Error('open() process in course'));
      this.connecting = true;

      this.connection.username()
        .then(username => {
          const socketEndpoint = this.connection.endpoint + username + '?auth=' + this.connection.token;
          // @ts-ignore - io is callable in socket.io-client
          this._io = io(socketEndpoint, { forceNew: true });

          // handle failure
          for (const errcode of ['connect_error', 'connection_failed', 'error', 'connection_timeout']) {
            const myCode = errcode;
            this._io.on(errcode, (e) => {
              if (!this.connecting) return; // do not care about errors if connected

              this._io = null;
              this.connecting = false;
              if (e === null) { e = myCode; }
              if (!(e instanceof Error)) { e = new Error(e); }

              try { this._io.close(); } catch (ex) { }
              return reject(e);
            });
          }

          // handle success
          this._io.on('connect', () => {
            this.connecting = false;
            registerListeners(this);
            resolve(this);
          });
        })
        .catch(e => {
          this._io = null;
          this.connecting = false;
          return reject(e);
        });
    });
  }

  /**
   * Close the socket
   */
  close () {
    checkOpen(this);
    this._io.close();
  }

  /**
   * Add listener for Socket.IO events
   * @param {('eventsChanged'|'streamsChanged'|'accessesChanged'|'disconnect'|'error')} eventName - The event to listen for
   * @param {Function} listener - The callback function
   * @returns {SocketIO} this
   */
  // @ts-ignore - overriding EventEmitter.on with restricted signature
  on (eventName, listener) {
    checkOpen(this);
    if (EVENTS.indexOf(eventName) < 0) {
      throw new Error('Unkown event [' + eventName + ']. Allowed events are: ' + EVENTS);
    }
    // @ts-ignore
    return super.on(eventName, listener);
  }

  /**
   * Identical to Connection.api() but using Socket.IO transport
   * @param {Array<MethodCall>} arrayOfAPICalls - Array of Method Calls
   * @param {Function} [progress] - Return percentage of progress (0 - 100)
   * @returns {Promise<Array>} Promise to Array of results matching each method call in order
   */
  async api (arrayOfAPICalls, progress) {
    checkOpen(this);
    function httpHandler (batchCall) {
      return new Promise((resolve, reject) => {
        this._io.emit('callBatch', batchCall, function (err, res) {
          if (err) return reject(err);
          resolve(res);
        });
      });
    }
    return await this.connection._chunkedBatchCall(arrayOfAPICalls, progress, httpHandler.bind(this));
  }
}

// private method to fence the usage of socket before being open
function checkOpen (socket) {
  if (!socket._io) throw new Error('Initialize socket.io with connection.socket.open() before');
}

// private method to register to all events for an open socket
// and relay it.
function registerListeners (socket) {
  for (const event of EVENTS) {
    socket._io.on(event, (...args) => {
      socket.emit(event, ...args);
    });
  }
}

module.exports = function (Connection) {
  Object.defineProperty(Connection.prototype, 'socket', {
    get: function () {
      if (this._socket) return this._socket;
      this._socket = new SocketIO(this);
      return this._socket;
    }
  });
};


/***/ },

/***/ "./node_modules/@pryv/socket.io/src/index.js"
/*!***************************************************!*\
  !*** ./node_modules/@pryv/socket.io/src/index.js ***!
  \***************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const SocketIO = __webpack_require__(/*! ./SocketIO */ "./node_modules/@pryv/socket.io/src/SocketIO.js");

/**
 * Load Socket.IO capabilities onto `pryv`
 * @param {pryv} pryv `pryv` library @see https://github.com/pryv/lib-js
 */
module.exports = function (pryv) {
  console.log('"pryv" lib version', pryv.version);
  // check version here
  if (pryv.Connection.SocketIO) {
    throw new Error('Socket.IO add-on already loaded');
  }
  // sharing cross references
  pryv.Connection.SocketIO = SocketIO;
  SocketIO(pryv.Connection);
};


/***/ },

/***/ "./node_modules/assert/build/assert.js"
/*!*********************************************!*\
  !*** ./node_modules/assert/build/assert.js ***!
  \*********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";
/* provided dependency */ var process = __webpack_require__(/*! process/browser */ "./node_modules/process/browser.js");
// Currently in sync with Node.js lib/assert.js
// https://github.com/nodejs/node/commit/2a51ae424a513ec9a6aa3466baa0cc1d55dd4f3b

// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.



function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
var _require = __webpack_require__(/*! ./internal/errors */ "./node_modules/assert/build/internal/errors.js"),
  _require$codes = _require.codes,
  ERR_AMBIGUOUS_ARGUMENT = _require$codes.ERR_AMBIGUOUS_ARGUMENT,
  ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
  ERR_INVALID_ARG_VALUE = _require$codes.ERR_INVALID_ARG_VALUE,
  ERR_INVALID_RETURN_VALUE = _require$codes.ERR_INVALID_RETURN_VALUE,
  ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS;
var AssertionError = __webpack_require__(/*! ./internal/assert/assertion_error */ "./node_modules/assert/build/internal/assert/assertion_error.js");
var _require2 = __webpack_require__(/*! util/ */ "./node_modules/util/util.js"),
  inspect = _require2.inspect;
var _require$types = (__webpack_require__(/*! util/ */ "./node_modules/util/util.js").types),
  isPromise = _require$types.isPromise,
  isRegExp = _require$types.isRegExp;
var objectAssign = __webpack_require__(/*! object.assign/polyfill */ "./node_modules/object.assign/polyfill.js")();
var objectIs = __webpack_require__(/*! object-is/polyfill */ "./node_modules/object-is/polyfill.js")();
var RegExpPrototypeTest = __webpack_require__(/*! call-bind/callBound */ "./node_modules/call-bind/callBound.js")('RegExp.prototype.test');
var errorCache = new Map();
var isDeepEqual;
var isDeepStrictEqual;
var parseExpressionAt;
var findNodeAround;
var decoder;
function lazyLoadComparison() {
  var comparison = __webpack_require__(/*! ./internal/util/comparisons */ "./node_modules/assert/build/internal/util/comparisons.js");
  isDeepEqual = comparison.isDeepEqual;
  isDeepStrictEqual = comparison.isDeepStrictEqual;
}

// Escape control characters but not \n and \t to keep the line breaks and
// indentation intact.
// eslint-disable-next-line no-control-regex
var escapeSequencesRegExp = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
var meta = ["\\u0000", "\\u0001", "\\u0002", "\\u0003", "\\u0004", "\\u0005", "\\u0006", "\\u0007", '\\b', '', '', "\\u000b", '\\f', '', "\\u000e", "\\u000f", "\\u0010", "\\u0011", "\\u0012", "\\u0013", "\\u0014", "\\u0015", "\\u0016", "\\u0017", "\\u0018", "\\u0019", "\\u001a", "\\u001b", "\\u001c", "\\u001d", "\\u001e", "\\u001f"];
var escapeFn = function escapeFn(str) {
  return meta[str.charCodeAt(0)];
};
var warned = false;

// The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;
var NO_EXCEPTION_SENTINEL = {};

// All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided. All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function innerFail(obj) {
  if (obj.message instanceof Error) throw obj.message;
  throw new AssertionError(obj);
}
function fail(actual, expected, message, operator, stackStartFn) {
  var argsLen = arguments.length;
  var internalMessage;
  if (argsLen === 0) {
    internalMessage = 'Failed';
  } else if (argsLen === 1) {
    message = actual;
    actual = undefined;
  } else {
    if (warned === false) {
      warned = true;
      var warn = process.emitWarning ? process.emitWarning : console.warn.bind(console);
      warn('assert.fail() with more than one argument is deprecated. ' + 'Please use assert.strictEqual() instead or only pass a message.', 'DeprecationWarning', 'DEP0094');
    }
    if (argsLen === 2) operator = '!=';
  }
  if (message instanceof Error) throw message;
  var errArgs = {
    actual: actual,
    expected: expected,
    operator: operator === undefined ? 'fail' : operator,
    stackStartFn: stackStartFn || fail
  };
  if (message !== undefined) {
    errArgs.message = message;
  }
  var err = new AssertionError(errArgs);
  if (internalMessage) {
    err.message = internalMessage;
    err.generatedMessage = true;
  }
  throw err;
}
assert.fail = fail;

// The AssertionError is defined in internal/error.
assert.AssertionError = AssertionError;
function innerOk(fn, argLen, value, message) {
  if (!value) {
    var generatedMessage = false;
    if (argLen === 0) {
      generatedMessage = true;
      message = 'No value argument passed to `assert.ok()`';
    } else if (message instanceof Error) {
      throw message;
    }
    var err = new AssertionError({
      actual: value,
      expected: true,
      message: message,
      operator: '==',
      stackStartFn: fn
    });
    err.generatedMessage = generatedMessage;
    throw err;
  }
}

// Pure assertion tests whether a value is truthy, as determined
// by !!value.
function ok() {
  for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }
  innerOk.apply(void 0, [ok, args.length].concat(args));
}
assert.ok = ok;

// The equality assertion tests shallow, coercive equality with ==.
/* eslint-disable no-restricted-properties */
assert.equal = function equal(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  // eslint-disable-next-line eqeqeq
  if (actual != expected) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: '==',
      stackStartFn: equal
    });
  }
};

// The non-equality assertion tests for whether two objects are not
// equal with !=.
assert.notEqual = function notEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  // eslint-disable-next-line eqeqeq
  if (actual == expected) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: '!=',
      stackStartFn: notEqual
    });
  }
};

// The equivalence assertion tests a deep equality relation.
assert.deepEqual = function deepEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  if (isDeepEqual === undefined) lazyLoadComparison();
  if (!isDeepEqual(actual, expected)) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: 'deepEqual',
      stackStartFn: deepEqual
    });
  }
};

// The non-equivalence assertion tests for any deep inequality.
assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  if (isDeepEqual === undefined) lazyLoadComparison();
  if (isDeepEqual(actual, expected)) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: 'notDeepEqual',
      stackStartFn: notDeepEqual
    });
  }
};
/* eslint-enable */

assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  if (isDeepEqual === undefined) lazyLoadComparison();
  if (!isDeepStrictEqual(actual, expected)) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: 'deepStrictEqual',
      stackStartFn: deepStrictEqual
    });
  }
};
assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepStrictEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  if (isDeepEqual === undefined) lazyLoadComparison();
  if (isDeepStrictEqual(actual, expected)) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: 'notDeepStrictEqual',
      stackStartFn: notDeepStrictEqual
    });
  }
}
assert.strictEqual = function strictEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  if (!objectIs(actual, expected)) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: 'strictEqual',
      stackStartFn: strictEqual
    });
  }
};
assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new ERR_MISSING_ARGS('actual', 'expected');
  }
  if (objectIs(actual, expected)) {
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: 'notStrictEqual',
      stackStartFn: notStrictEqual
    });
  }
};
var Comparison = /*#__PURE__*/_createClass(function Comparison(obj, keys, actual) {
  var _this = this;
  _classCallCheck(this, Comparison);
  keys.forEach(function (key) {
    if (key in obj) {
      if (actual !== undefined && typeof actual[key] === 'string' && isRegExp(obj[key]) && RegExpPrototypeTest(obj[key], actual[key])) {
        _this[key] = actual[key];
      } else {
        _this[key] = obj[key];
      }
    }
  });
});
function compareExceptionKey(actual, expected, key, message, keys, fn) {
  if (!(key in actual) || !isDeepStrictEqual(actual[key], expected[key])) {
    if (!message) {
      // Create placeholder objects to create a nice output.
      var a = new Comparison(actual, keys);
      var b = new Comparison(expected, keys, actual);
      var err = new AssertionError({
        actual: a,
        expected: b,
        operator: 'deepStrictEqual',
        stackStartFn: fn
      });
      err.actual = actual;
      err.expected = expected;
      err.operator = fn.name;
      throw err;
    }
    innerFail({
      actual: actual,
      expected: expected,
      message: message,
      operator: fn.name,
      stackStartFn: fn
    });
  }
}
function expectedException(actual, expected, msg, fn) {
  if (typeof expected !== 'function') {
    if (isRegExp(expected)) return RegExpPrototypeTest(expected, actual);
    // assert.doesNotThrow does not accept objects.
    if (arguments.length === 2) {
      throw new ERR_INVALID_ARG_TYPE('expected', ['Function', 'RegExp'], expected);
    }

    // Handle primitives properly.
    if (_typeof(actual) !== 'object' || actual === null) {
      var err = new AssertionError({
        actual: actual,
        expected: expected,
        message: msg,
        operator: 'deepStrictEqual',
        stackStartFn: fn
      });
      err.operator = fn.name;
      throw err;
    }
    var keys = Object.keys(expected);
    // Special handle errors to make sure the name and the message are compared
    // as well.
    if (expected instanceof Error) {
      keys.push('name', 'message');
    } else if (keys.length === 0) {
      throw new ERR_INVALID_ARG_VALUE('error', expected, 'may not be an empty object');
    }
    if (isDeepEqual === undefined) lazyLoadComparison();
    keys.forEach(function (key) {
      if (typeof actual[key] === 'string' && isRegExp(expected[key]) && RegExpPrototypeTest(expected[key], actual[key])) {
        return;
      }
      compareExceptionKey(actual, expected, key, msg, keys, fn);
    });
    return true;
  }
  // Guard instanceof against arrow functions as they don't have a prototype.
  if (expected.prototype !== undefined && actual instanceof expected) {
    return true;
  }
  if (Error.isPrototypeOf(expected)) {
    return false;
  }
  return expected.call({}, actual) === true;
}
function getActual(fn) {
  if (typeof fn !== 'function') {
    throw new ERR_INVALID_ARG_TYPE('fn', 'Function', fn);
  }
  try {
    fn();
  } catch (e) {
    return e;
  }
  return NO_EXCEPTION_SENTINEL;
}
function checkIsPromise(obj) {
  // Accept native ES6 promises and promises that are implemented in a similar
  // way. Do not accept thenables that use a function as `obj` and that have no
  // `catch` handler.

  // TODO: thenables are checked up until they have the correct methods,
  // but according to documentation, the `then` method should receive
  // the `fulfill` and `reject` arguments as well or it may be never resolved.

  return isPromise(obj) || obj !== null && _typeof(obj) === 'object' && typeof obj.then === 'function' && typeof obj.catch === 'function';
}
function waitForActual(promiseFn) {
  return Promise.resolve().then(function () {
    var resultPromise;
    if (typeof promiseFn === 'function') {
      // Return a rejected promise if `promiseFn` throws synchronously.
      resultPromise = promiseFn();
      // Fail in case no promise is returned.
      if (!checkIsPromise(resultPromise)) {
        throw new ERR_INVALID_RETURN_VALUE('instance of Promise', 'promiseFn', resultPromise);
      }
    } else if (checkIsPromise(promiseFn)) {
      resultPromise = promiseFn;
    } else {
      throw new ERR_INVALID_ARG_TYPE('promiseFn', ['Function', 'Promise'], promiseFn);
    }
    return Promise.resolve().then(function () {
      return resultPromise;
    }).then(function () {
      return NO_EXCEPTION_SENTINEL;
    }).catch(function (e) {
      return e;
    });
  });
}
function expectsError(stackStartFn, actual, error, message) {
  if (typeof error === 'string') {
    if (arguments.length === 4) {
      throw new ERR_INVALID_ARG_TYPE('error', ['Object', 'Error', 'Function', 'RegExp'], error);
    }
    if (_typeof(actual) === 'object' && actual !== null) {
      if (actual.message === error) {
        throw new ERR_AMBIGUOUS_ARGUMENT('error/message', "The error message \"".concat(actual.message, "\" is identical to the message."));
      }
    } else if (actual === error) {
      throw new ERR_AMBIGUOUS_ARGUMENT('error/message', "The error \"".concat(actual, "\" is identical to the message."));
    }
    message = error;
    error = undefined;
  } else if (error != null && _typeof(error) !== 'object' && typeof error !== 'function') {
    throw new ERR_INVALID_ARG_TYPE('error', ['Object', 'Error', 'Function', 'RegExp'], error);
  }
  if (actual === NO_EXCEPTION_SENTINEL) {
    var details = '';
    if (error && error.name) {
      details += " (".concat(error.name, ")");
    }
    details += message ? ": ".concat(message) : '.';
    var fnType = stackStartFn.name === 'rejects' ? 'rejection' : 'exception';
    innerFail({
      actual: undefined,
      expected: error,
      operator: stackStartFn.name,
      message: "Missing expected ".concat(fnType).concat(details),
      stackStartFn: stackStartFn
    });
  }
  if (error && !expectedException(actual, error, message, stackStartFn)) {
    throw actual;
  }
}
function expectsNoError(stackStartFn, actual, error, message) {
  if (actual === NO_EXCEPTION_SENTINEL) return;
  if (typeof error === 'string') {
    message = error;
    error = undefined;
  }
  if (!error || expectedException(actual, error)) {
    var details = message ? ": ".concat(message) : '.';
    var fnType = stackStartFn.name === 'doesNotReject' ? 'rejection' : 'exception';
    innerFail({
      actual: actual,
      expected: error,
      operator: stackStartFn.name,
      message: "Got unwanted ".concat(fnType).concat(details, "\n") + "Actual message: \"".concat(actual && actual.message, "\""),
      stackStartFn: stackStartFn
    });
  }
  throw actual;
}
assert.throws = function throws(promiseFn) {
  for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
    args[_key2 - 1] = arguments[_key2];
  }
  expectsError.apply(void 0, [throws, getActual(promiseFn)].concat(args));
};
assert.rejects = function rejects(promiseFn) {
  for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
    args[_key3 - 1] = arguments[_key3];
  }
  return waitForActual(promiseFn).then(function (result) {
    return expectsError.apply(void 0, [rejects, result].concat(args));
  });
};
assert.doesNotThrow = function doesNotThrow(fn) {
  for (var _len4 = arguments.length, args = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
    args[_key4 - 1] = arguments[_key4];
  }
  expectsNoError.apply(void 0, [doesNotThrow, getActual(fn)].concat(args));
};
assert.doesNotReject = function doesNotReject(fn) {
  for (var _len5 = arguments.length, args = new Array(_len5 > 1 ? _len5 - 1 : 0), _key5 = 1; _key5 < _len5; _key5++) {
    args[_key5 - 1] = arguments[_key5];
  }
  return waitForActual(fn).then(function (result) {
    return expectsNoError.apply(void 0, [doesNotReject, result].concat(args));
  });
};
assert.ifError = function ifError(err) {
  if (err !== null && err !== undefined) {
    var message = 'ifError got unwanted exception: ';
    if (_typeof(err) === 'object' && typeof err.message === 'string') {
      if (err.message.length === 0 && err.constructor) {
        message += err.constructor.name;
      } else {
        message += err.message;
      }
    } else {
      message += inspect(err);
    }
    var newErr = new AssertionError({
      actual: err,
      expected: null,
      operator: 'ifError',
      message: message,
      stackStartFn: ifError
    });

    // Make sure we actually have a stack trace!
    var origStack = err.stack;
    if (typeof origStack === 'string') {
      // This will remove any duplicated frames from the error frames taken
      // from within `ifError` and add the original error frames to the newly
      // created ones.
      var tmp2 = origStack.split('\n');
      tmp2.shift();
      // Filter all frames existing in err.stack.
      var tmp1 = newErr.stack.split('\n');
      for (var i = 0; i < tmp2.length; i++) {
        // Find the first occurrence of the frame.
        var pos = tmp1.indexOf(tmp2[i]);
        if (pos !== -1) {
          // Only keep new frames.
          tmp1 = tmp1.slice(0, pos);
          break;
        }
      }
      newErr.stack = "".concat(tmp1.join('\n'), "\n").concat(tmp2.join('\n'));
    }
    throw newErr;
  }
};

// Currently in sync with Node.js lib/assert.js
// https://github.com/nodejs/node/commit/2a871df3dfb8ea663ef5e1f8f62701ec51384ecb
function internalMatch(string, regexp, message, fn, fnName) {
  if (!isRegExp(regexp)) {
    throw new ERR_INVALID_ARG_TYPE('regexp', 'RegExp', regexp);
  }
  var match = fnName === 'match';
  if (typeof string !== 'string' || RegExpPrototypeTest(regexp, string) !== match) {
    if (message instanceof Error) {
      throw message;
    }
    var generatedMessage = !message;

    // 'The input was expected to not match the regular expression ' +
    message = message || (typeof string !== 'string' ? 'The "string" argument must be of type string. Received type ' + "".concat(_typeof(string), " (").concat(inspect(string), ")") : (match ? 'The input did not match the regular expression ' : 'The input was expected to not match the regular expression ') + "".concat(inspect(regexp), ". Input:\n\n").concat(inspect(string), "\n"));
    var err = new AssertionError({
      actual: string,
      expected: regexp,
      message: message,
      operator: fnName,
      stackStartFn: fn
    });
    err.generatedMessage = generatedMessage;
    throw err;
  }
}
assert.match = function match(string, regexp, message) {
  internalMatch(string, regexp, message, match, 'match');
};
assert.doesNotMatch = function doesNotMatch(string, regexp, message) {
  internalMatch(string, regexp, message, doesNotMatch, 'doesNotMatch');
};

// Expose a strict only variant of assert
function strict() {
  for (var _len6 = arguments.length, args = new Array(_len6), _key6 = 0; _key6 < _len6; _key6++) {
    args[_key6] = arguments[_key6];
  }
  innerOk.apply(void 0, [strict, args.length].concat(args));
}
assert.strict = objectAssign(strict, assert, {
  equal: assert.strictEqual,
  deepEqual: assert.deepStrictEqual,
  notEqual: assert.notStrictEqual,
  notDeepEqual: assert.notDeepStrictEqual
});
assert.strict.strict = assert.strict;

/***/ },

/***/ "./node_modules/assert/build/internal/assert/assertion_error.js"
/*!**********************************************************************!*\
  !*** ./node_modules/assert/build/internal/assert/assertion_error.js ***!
  \**********************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";
/* provided dependency */ var process = __webpack_require__(/*! process/browser */ "./node_modules/process/browser.js");
// Currently in sync with Node.js lib/internal/assert/assertion_error.js
// https://github.com/nodejs/node/commit/0817840f775032169ddd70c85ac059f18ffcc81c



function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _wrapNativeSuper(Class) { var _cache = typeof Map === "function" ? new Map() : undefined; _wrapNativeSuper = function _wrapNativeSuper(Class) { if (Class === null || !_isNativeFunction(Class)) return Class; if (typeof Class !== "function") { throw new TypeError("Super expression must either be null or a function"); } if (typeof _cache !== "undefined") { if (_cache.has(Class)) return _cache.get(Class); _cache.set(Class, Wrapper); } function Wrapper() { return _construct(Class, arguments, _getPrototypeOf(this).constructor); } Wrapper.prototype = Object.create(Class.prototype, { constructor: { value: Wrapper, enumerable: false, writable: true, configurable: true } }); return _setPrototypeOf(Wrapper, Class); }; return _wrapNativeSuper(Class); }
function _construct(Parent, args, Class) { if (_isNativeReflectConstruct()) { _construct = Reflect.construct.bind(); } else { _construct = function _construct(Parent, args, Class) { var a = [null]; a.push.apply(a, args); var Constructor = Function.bind.apply(Parent, a); var instance = new Constructor(); if (Class) _setPrototypeOf(instance, Class.prototype); return instance; }; } return _construct.apply(null, arguments); }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _isNativeFunction(fn) { return Function.toString.call(fn).indexOf("[native code]") !== -1; }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
var _require = __webpack_require__(/*! util/ */ "./node_modules/util/util.js"),
  inspect = _require.inspect;
var _require2 = __webpack_require__(/*! ../errors */ "./node_modules/assert/build/internal/errors.js"),
  ERR_INVALID_ARG_TYPE = _require2.codes.ERR_INVALID_ARG_TYPE;

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
function endsWith(str, search, this_len) {
  if (this_len === undefined || this_len > str.length) {
    this_len = str.length;
  }
  return str.substring(this_len - search.length, this_len) === search;
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat
function repeat(str, count) {
  count = Math.floor(count);
  if (str.length == 0 || count == 0) return '';
  var maxCount = str.length * count;
  count = Math.floor(Math.log(count) / Math.log(2));
  while (count) {
    str += str;
    count--;
  }
  str += str.substring(0, maxCount - str.length);
  return str;
}
var blue = '';
var green = '';
var red = '';
var white = '';
var kReadableOperator = {
  deepStrictEqual: 'Expected values to be strictly deep-equal:',
  strictEqual: 'Expected values to be strictly equal:',
  strictEqualObject: 'Expected "actual" to be reference-equal to "expected":',
  deepEqual: 'Expected values to be loosely deep-equal:',
  equal: 'Expected values to be loosely equal:',
  notDeepStrictEqual: 'Expected "actual" not to be strictly deep-equal to:',
  notStrictEqual: 'Expected "actual" to be strictly unequal to:',
  notStrictEqualObject: 'Expected "actual" not to be reference-equal to "expected":',
  notDeepEqual: 'Expected "actual" not to be loosely deep-equal to:',
  notEqual: 'Expected "actual" to be loosely unequal to:',
  notIdentical: 'Values identical but not reference-equal:'
};

// Comparing short primitives should just show === / !== instead of using the
// diff.
var kMaxShortLength = 10;
function copyError(source) {
  var keys = Object.keys(source);
  var target = Object.create(Object.getPrototypeOf(source));
  keys.forEach(function (key) {
    target[key] = source[key];
  });
  Object.defineProperty(target, 'message', {
    value: source.message
  });
  return target;
}
function inspectValue(val) {
  // The util.inspect default values could be changed. This makes sure the
  // error messages contain the necessary information nevertheless.
  return inspect(val, {
    compact: false,
    customInspect: false,
    depth: 1000,
    maxArrayLength: Infinity,
    // Assert compares only enumerable properties (with a few exceptions).
    showHidden: false,
    // Having a long line as error is better than wrapping the line for
    // comparison for now.
    // TODO(BridgeAR): `breakLength` should be limited as soon as soon as we
    // have meta information about the inspected properties (i.e., know where
    // in what line the property starts and ends).
    breakLength: Infinity,
    // Assert does not detect proxies currently.
    showProxy: false,
    sorted: true,
    // Inspect getters as we also check them when comparing entries.
    getters: true
  });
}
function createErrDiff(actual, expected, operator) {
  var other = '';
  var res = '';
  var lastPos = 0;
  var end = '';
  var skipped = false;
  var actualInspected = inspectValue(actual);
  var actualLines = actualInspected.split('\n');
  var expectedLines = inspectValue(expected).split('\n');
  var i = 0;
  var indicator = '';

  // In case both values are objects explicitly mark them as not reference equal
  // for the `strictEqual` operator.
  if (operator === 'strictEqual' && _typeof(actual) === 'object' && _typeof(expected) === 'object' && actual !== null && expected !== null) {
    operator = 'strictEqualObject';
  }

  // If "actual" and "expected" fit on a single line and they are not strictly
  // equal, check further special handling.
  if (actualLines.length === 1 && expectedLines.length === 1 && actualLines[0] !== expectedLines[0]) {
    var inputLength = actualLines[0].length + expectedLines[0].length;
    // If the character length of "actual" and "expected" together is less than
    // kMaxShortLength and if neither is an object and at least one of them is
    // not `zero`, use the strict equal comparison to visualize the output.
    if (inputLength <= kMaxShortLength) {
      if ((_typeof(actual) !== 'object' || actual === null) && (_typeof(expected) !== 'object' || expected === null) && (actual !== 0 || expected !== 0)) {
        // -0 === +0
        return "".concat(kReadableOperator[operator], "\n\n") + "".concat(actualLines[0], " !== ").concat(expectedLines[0], "\n");
      }
    } else if (operator !== 'strictEqualObject') {
      // If the stderr is a tty and the input length is lower than the current
      // columns per line, add a mismatch indicator below the output. If it is
      // not a tty, use a default value of 80 characters.
      var maxLength = process.stderr && process.stderr.isTTY ? process.stderr.columns : 80;
      if (inputLength < maxLength) {
        while (actualLines[0][i] === expectedLines[0][i]) {
          i++;
        }
        // Ignore the first characters.
        if (i > 2) {
          // Add position indicator for the first mismatch in case it is a
          // single line and the input length is less than the column length.
          indicator = "\n  ".concat(repeat(' ', i), "^");
          i = 0;
        }
      }
    }
  }

  // Remove all ending lines that match (this optimizes the output for
  // readability by reducing the number of total changed lines).
  var a = actualLines[actualLines.length - 1];
  var b = expectedLines[expectedLines.length - 1];
  while (a === b) {
    if (i++ < 2) {
      end = "\n  ".concat(a).concat(end);
    } else {
      other = a;
    }
    actualLines.pop();
    expectedLines.pop();
    if (actualLines.length === 0 || expectedLines.length === 0) break;
    a = actualLines[actualLines.length - 1];
    b = expectedLines[expectedLines.length - 1];
  }
  var maxLines = Math.max(actualLines.length, expectedLines.length);
  // Strict equal with identical objects that are not identical by reference.
  // E.g., assert.deepStrictEqual({ a: Symbol() }, { a: Symbol() })
  if (maxLines === 0) {
    // We have to get the result again. The lines were all removed before.
    var _actualLines = actualInspected.split('\n');

    // Only remove lines in case it makes sense to collapse those.
    // TODO: Accept env to always show the full error.
    if (_actualLines.length > 30) {
      _actualLines[26] = "".concat(blue, "...").concat(white);
      while (_actualLines.length > 27) {
        _actualLines.pop();
      }
    }
    return "".concat(kReadableOperator.notIdentical, "\n\n").concat(_actualLines.join('\n'), "\n");
  }
  if (i > 3) {
    end = "\n".concat(blue, "...").concat(white).concat(end);
    skipped = true;
  }
  if (other !== '') {
    end = "\n  ".concat(other).concat(end);
    other = '';
  }
  var printedLines = 0;
  var msg = kReadableOperator[operator] + "\n".concat(green, "+ actual").concat(white, " ").concat(red, "- expected").concat(white);
  var skippedMsg = " ".concat(blue, "...").concat(white, " Lines skipped");
  for (i = 0; i < maxLines; i++) {
    // Only extra expected lines exist
    var cur = i - lastPos;
    if (actualLines.length < i + 1) {
      // If the last diverging line is more than one line above and the
      // current line is at least line three, add some of the former lines and
      // also add dots to indicate skipped entries.
      if (cur > 1 && i > 2) {
        if (cur > 4) {
          res += "\n".concat(blue, "...").concat(white);
          skipped = true;
        } else if (cur > 3) {
          res += "\n  ".concat(expectedLines[i - 2]);
          printedLines++;
        }
        res += "\n  ".concat(expectedLines[i - 1]);
        printedLines++;
      }
      // Mark the current line as the last diverging one.
      lastPos = i;
      // Add the expected line to the cache.
      other += "\n".concat(red, "-").concat(white, " ").concat(expectedLines[i]);
      printedLines++;
      // Only extra actual lines exist
    } else if (expectedLines.length < i + 1) {
      // If the last diverging line is more than one line above and the
      // current line is at least line three, add some of the former lines and
      // also add dots to indicate skipped entries.
      if (cur > 1 && i > 2) {
        if (cur > 4) {
          res += "\n".concat(blue, "...").concat(white);
          skipped = true;
        } else if (cur > 3) {
          res += "\n  ".concat(actualLines[i - 2]);
          printedLines++;
        }
        res += "\n  ".concat(actualLines[i - 1]);
        printedLines++;
      }
      // Mark the current line as the last diverging one.
      lastPos = i;
      // Add the actual line to the result.
      res += "\n".concat(green, "+").concat(white, " ").concat(actualLines[i]);
      printedLines++;
      // Lines diverge
    } else {
      var expectedLine = expectedLines[i];
      var actualLine = actualLines[i];
      // If the lines diverge, specifically check for lines that only diverge by
      // a trailing comma. In that case it is actually identical and we should
      // mark it as such.
      var divergingLines = actualLine !== expectedLine && (!endsWith(actualLine, ',') || actualLine.slice(0, -1) !== expectedLine);
      // If the expected line has a trailing comma but is otherwise identical,
      // add a comma at the end of the actual line. Otherwise the output could
      // look weird as in:
      //
      //   [
      //     1         // No comma at the end!
      // +   2
      //   ]
      //
      if (divergingLines && endsWith(expectedLine, ',') && expectedLine.slice(0, -1) === actualLine) {
        divergingLines = false;
        actualLine += ',';
      }
      if (divergingLines) {
        // If the last diverging line is more than one line above and the
        // current line is at least line three, add some of the former lines and
        // also add dots to indicate skipped entries.
        if (cur > 1 && i > 2) {
          if (cur > 4) {
            res += "\n".concat(blue, "...").concat(white);
            skipped = true;
          } else if (cur > 3) {
            res += "\n  ".concat(actualLines[i - 2]);
            printedLines++;
          }
          res += "\n  ".concat(actualLines[i - 1]);
          printedLines++;
        }
        // Mark the current line as the last diverging one.
        lastPos = i;
        // Add the actual line to the result and cache the expected diverging
        // line so consecutive diverging lines show up as +++--- and not +-+-+-.
        res += "\n".concat(green, "+").concat(white, " ").concat(actualLine);
        other += "\n".concat(red, "-").concat(white, " ").concat(expectedLine);
        printedLines += 2;
        // Lines are identical
      } else {
        // Add all cached information to the result before adding other things
        // and reset the cache.
        res += other;
        other = '';
        // If the last diverging line is exactly one line above or if it is the
        // very first line, add the line to the result.
        if (cur === 1 || i === 0) {
          res += "\n  ".concat(actualLine);
          printedLines++;
        }
      }
    }
    // Inspected object to big (Show ~20 rows max)
    if (printedLines > 20 && i < maxLines - 2) {
      return "".concat(msg).concat(skippedMsg, "\n").concat(res, "\n").concat(blue, "...").concat(white).concat(other, "\n") + "".concat(blue, "...").concat(white);
    }
  }
  return "".concat(msg).concat(skipped ? skippedMsg : '', "\n").concat(res).concat(other).concat(end).concat(indicator);
}
var AssertionError = /*#__PURE__*/function (_Error, _inspect$custom) {
  _inherits(AssertionError, _Error);
  var _super = _createSuper(AssertionError);
  function AssertionError(options) {
    var _this;
    _classCallCheck(this, AssertionError);
    if (_typeof(options) !== 'object' || options === null) {
      throw new ERR_INVALID_ARG_TYPE('options', 'Object', options);
    }
    var message = options.message,
      operator = options.operator,
      stackStartFn = options.stackStartFn;
    var actual = options.actual,
      expected = options.expected;
    var limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    if (message != null) {
      _this = _super.call(this, String(message));
    } else {
      if (process.stderr && process.stderr.isTTY) {
        // Reset on each call to make sure we handle dynamically set environment
        // variables correct.
        if (process.stderr && process.stderr.getColorDepth && process.stderr.getColorDepth() !== 1) {
          blue = "\x1B[34m";
          green = "\x1B[32m";
          white = "\x1B[39m";
          red = "\x1B[31m";
        } else {
          blue = '';
          green = '';
          white = '';
          red = '';
        }
      }
      // Prevent the error stack from being visible by duplicating the error
      // in a very close way to the original in case both sides are actually
      // instances of Error.
      if (_typeof(actual) === 'object' && actual !== null && _typeof(expected) === 'object' && expected !== null && 'stack' in actual && actual instanceof Error && 'stack' in expected && expected instanceof Error) {
        actual = copyError(actual);
        expected = copyError(expected);
      }
      if (operator === 'deepStrictEqual' || operator === 'strictEqual') {
        _this = _super.call(this, createErrDiff(actual, expected, operator));
      } else if (operator === 'notDeepStrictEqual' || operator === 'notStrictEqual') {
        // In case the objects are equal but the operator requires unequal, show
        // the first object and say A equals B
        var base = kReadableOperator[operator];
        var res = inspectValue(actual).split('\n');

        // In case "actual" is an object, it should not be reference equal.
        if (operator === 'notStrictEqual' && _typeof(actual) === 'object' && actual !== null) {
          base = kReadableOperator.notStrictEqualObject;
        }

        // Only remove lines in case it makes sense to collapse those.
        // TODO: Accept env to always show the full error.
        if (res.length > 30) {
          res[26] = "".concat(blue, "...").concat(white);
          while (res.length > 27) {
            res.pop();
          }
        }

        // Only print a single input.
        if (res.length === 1) {
          _this = _super.call(this, "".concat(base, " ").concat(res[0]));
        } else {
          _this = _super.call(this, "".concat(base, "\n\n").concat(res.join('\n'), "\n"));
        }
      } else {
        var _res = inspectValue(actual);
        var other = '';
        var knownOperators = kReadableOperator[operator];
        if (operator === 'notDeepEqual' || operator === 'notEqual') {
          _res = "".concat(kReadableOperator[operator], "\n\n").concat(_res);
          if (_res.length > 1024) {
            _res = "".concat(_res.slice(0, 1021), "...");
          }
        } else {
          other = "".concat(inspectValue(expected));
          if (_res.length > 512) {
            _res = "".concat(_res.slice(0, 509), "...");
          }
          if (other.length > 512) {
            other = "".concat(other.slice(0, 509), "...");
          }
          if (operator === 'deepEqual' || operator === 'equal') {
            _res = "".concat(knownOperators, "\n\n").concat(_res, "\n\nshould equal\n\n");
          } else {
            other = " ".concat(operator, " ").concat(other);
          }
        }
        _this = _super.call(this, "".concat(_res).concat(other));
      }
    }
    Error.stackTraceLimit = limit;
    _this.generatedMessage = !message;
    Object.defineProperty(_assertThisInitialized(_this), 'name', {
      value: 'AssertionError [ERR_ASSERTION]',
      enumerable: false,
      writable: true,
      configurable: true
    });
    _this.code = 'ERR_ASSERTION';
    _this.actual = actual;
    _this.expected = expected;
    _this.operator = operator;
    if (Error.captureStackTrace) {
      // eslint-disable-next-line no-restricted-syntax
      Error.captureStackTrace(_assertThisInitialized(_this), stackStartFn);
    }
    // Create error message including the error code in the name.
    _this.stack;
    // Reset the name.
    _this.name = 'AssertionError';
    return _possibleConstructorReturn(_this);
  }
  _createClass(AssertionError, [{
    key: "toString",
    value: function toString() {
      return "".concat(this.name, " [").concat(this.code, "]: ").concat(this.message);
    }
  }, {
    key: _inspect$custom,
    value: function value(recurseTimes, ctx) {
      // This limits the `actual` and `expected` property default inspection to
      // the minimum depth. Otherwise those values would be too verbose compared
      // to the actual error message which contains a combined view of these two
      // input values.
      return inspect(this, _objectSpread(_objectSpread({}, ctx), {}, {
        customInspect: false,
        depth: 0
      }));
    }
  }]);
  return AssertionError;
}( /*#__PURE__*/_wrapNativeSuper(Error), inspect.custom);
module.exports = AssertionError;

/***/ },

/***/ "./node_modules/assert/build/internal/errors.js"
/*!******************************************************!*\
  !*** ./node_modules/assert/build/internal/errors.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";
// Currently in sync with Node.js lib/internal/errors.js
// https://github.com/nodejs/node/commit/3b044962c48fe313905877a96b5d0894a5404f6f

/* eslint node-core/documented-errors: "error" */
/* eslint node-core/alphabetize-errors: "error" */
/* eslint node-core/prefer-util-format-errors: "error" */



// The whole point behind this internal module is to allow Node.js to no
// longer be forced to treat every error message change as a semver-major
// change. The NodeError classes here all expose a `code` property whose
// value statically and permanently identifies the error. While the error
// message may change, the code should not.
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var codes = {};

// Lazy loaded
var assert;
var util;
function createErrorType(code, message, Base) {
  if (!Base) {
    Base = Error;
  }
  function getMessage(arg1, arg2, arg3) {
    if (typeof message === 'string') {
      return message;
    } else {
      return message(arg1, arg2, arg3);
    }
  }
  var NodeError = /*#__PURE__*/function (_Base) {
    _inherits(NodeError, _Base);
    var _super = _createSuper(NodeError);
    function NodeError(arg1, arg2, arg3) {
      var _this;
      _classCallCheck(this, NodeError);
      _this = _super.call(this, getMessage(arg1, arg2, arg3));
      _this.code = code;
      return _this;
    }
    return _createClass(NodeError);
  }(Base);
  codes[code] = NodeError;
}

// https://github.com/nodejs/node/blob/v10.8.0/lib/internal/errors.js
function oneOf(expected, thing) {
  if (Array.isArray(expected)) {
    var len = expected.length;
    expected = expected.map(function (i) {
      return String(i);
    });
    if (len > 2) {
      return "one of ".concat(thing, " ").concat(expected.slice(0, len - 1).join(', '), ", or ") + expected[len - 1];
    } else if (len === 2) {
      return "one of ".concat(thing, " ").concat(expected[0], " or ").concat(expected[1]);
    } else {
      return "of ".concat(thing, " ").concat(expected[0]);
    }
  } else {
    return "of ".concat(thing, " ").concat(String(expected));
  }
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith
function startsWith(str, search, pos) {
  return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
function endsWith(str, search, this_len) {
  if (this_len === undefined || this_len > str.length) {
    this_len = str.length;
  }
  return str.substring(this_len - search.length, this_len) === search;
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes
function includes(str, search, start) {
  if (typeof start !== 'number') {
    start = 0;
  }
  if (start + search.length > str.length) {
    return false;
  } else {
    return str.indexOf(search, start) !== -1;
  }
}
createErrorType('ERR_AMBIGUOUS_ARGUMENT', 'The "%s" argument is ambiguous. %s', TypeError);
createErrorType('ERR_INVALID_ARG_TYPE', function (name, expected, actual) {
  if (assert === undefined) assert = __webpack_require__(/*! ../assert */ "./node_modules/assert/build/assert.js");
  assert(typeof name === 'string', "'name' must be a string");

  // determiner: 'must be' or 'must not be'
  var determiner;
  if (typeof expected === 'string' && startsWith(expected, 'not ')) {
    determiner = 'must not be';
    expected = expected.replace(/^not /, '');
  } else {
    determiner = 'must be';
  }
  var msg;
  if (endsWith(name, ' argument')) {
    // For cases like 'first argument'
    msg = "The ".concat(name, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  } else {
    var type = includes(name, '.') ? 'property' : 'argument';
    msg = "The \"".concat(name, "\" ").concat(type, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  }

  // TODO(BridgeAR): Improve the output by showing `null` and similar.
  msg += ". Received type ".concat(_typeof(actual));
  return msg;
}, TypeError);
createErrorType('ERR_INVALID_ARG_VALUE', function (name, value) {
  var reason = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'is invalid';
  if (util === undefined) util = __webpack_require__(/*! util/ */ "./node_modules/util/util.js");
  var inspected = util.inspect(value);
  if (inspected.length > 128) {
    inspected = "".concat(inspected.slice(0, 128), "...");
  }
  return "The argument '".concat(name, "' ").concat(reason, ". Received ").concat(inspected);
}, TypeError, RangeError);
createErrorType('ERR_INVALID_RETURN_VALUE', function (input, name, value) {
  var type;
  if (value && value.constructor && value.constructor.name) {
    type = "instance of ".concat(value.constructor.name);
  } else {
    type = "type ".concat(_typeof(value));
  }
  return "Expected ".concat(input, " to be returned from the \"").concat(name, "\"") + " function but got ".concat(type, ".");
}, TypeError);
createErrorType('ERR_MISSING_ARGS', function () {
  for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }
  if (assert === undefined) assert = __webpack_require__(/*! ../assert */ "./node_modules/assert/build/assert.js");
  assert(args.length > 0, 'At least one arg needs to be specified');
  var msg = 'The ';
  var len = args.length;
  args = args.map(function (a) {
    return "\"".concat(a, "\"");
  });
  switch (len) {
    case 1:
      msg += "".concat(args[0], " argument");
      break;
    case 2:
      msg += "".concat(args[0], " and ").concat(args[1], " arguments");
      break;
    default:
      msg += args.slice(0, len - 1).join(', ');
      msg += ", and ".concat(args[len - 1], " arguments");
      break;
  }
  return "".concat(msg, " must be specified");
}, TypeError);
module.exports.codes = codes;

/***/ },

/***/ "./node_modules/assert/build/internal/util/comparisons.js"
/*!****************************************************************!*\
  !*** ./node_modules/assert/build/internal/util/comparisons.js ***!
  \****************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";
// Currently in sync with Node.js lib/internal/util/comparisons.js
// https://github.com/nodejs/node/commit/112cc7c27551254aa2b17098fb774867f05ed0d9



function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
var regexFlagsSupported = /a/g.flags !== undefined;
var arrayFromSet = function arrayFromSet(set) {
  var array = [];
  set.forEach(function (value) {
    return array.push(value);
  });
  return array;
};
var arrayFromMap = function arrayFromMap(map) {
  var array = [];
  map.forEach(function (value, key) {
    return array.push([key, value]);
  });
  return array;
};
var objectIs = Object.is ? Object.is : __webpack_require__(/*! object-is */ "./node_modules/object-is/index.js");
var objectGetOwnPropertySymbols = Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols : function () {
  return [];
};
var numberIsNaN = Number.isNaN ? Number.isNaN : __webpack_require__(/*! is-nan */ "./node_modules/is-nan/index.js");
function uncurryThis(f) {
  return f.call.bind(f);
}
var hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);
var propertyIsEnumerable = uncurryThis(Object.prototype.propertyIsEnumerable);
var objectToString = uncurryThis(Object.prototype.toString);
var _require$types = (__webpack_require__(/*! util/ */ "./node_modules/util/util.js").types),
  isAnyArrayBuffer = _require$types.isAnyArrayBuffer,
  isArrayBufferView = _require$types.isArrayBufferView,
  isDate = _require$types.isDate,
  isMap = _require$types.isMap,
  isRegExp = _require$types.isRegExp,
  isSet = _require$types.isSet,
  isNativeError = _require$types.isNativeError,
  isBoxedPrimitive = _require$types.isBoxedPrimitive,
  isNumberObject = _require$types.isNumberObject,
  isStringObject = _require$types.isStringObject,
  isBooleanObject = _require$types.isBooleanObject,
  isBigIntObject = _require$types.isBigIntObject,
  isSymbolObject = _require$types.isSymbolObject,
  isFloat32Array = _require$types.isFloat32Array,
  isFloat64Array = _require$types.isFloat64Array;
function isNonIndex(key) {
  if (key.length === 0 || key.length > 10) return true;
  for (var i = 0; i < key.length; i++) {
    var code = key.charCodeAt(i);
    if (code < 48 || code > 57) return true;
  }
  // The maximum size for an array is 2 ** 32 -1.
  return key.length === 10 && key >= Math.pow(2, 32);
}
function getOwnNonIndexProperties(value) {
  return Object.keys(value).filter(isNonIndex).concat(objectGetOwnPropertySymbols(value).filter(Object.prototype.propertyIsEnumerable.bind(value)));
}

// Taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
// original notice:
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
function compare(a, b) {
  if (a === b) {
    return 0;
  }
  var x = a.length;
  var y = b.length;
  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }
  if (x < y) {
    return -1;
  }
  if (y < x) {
    return 1;
  }
  return 0;
}
var ONLY_ENUMERABLE = undefined;
var kStrict = true;
var kLoose = false;
var kNoIterator = 0;
var kIsArray = 1;
var kIsSet = 2;
var kIsMap = 3;

// Check if they have the same source and flags
function areSimilarRegExps(a, b) {
  return regexFlagsSupported ? a.source === b.source && a.flags === b.flags : RegExp.prototype.toString.call(a) === RegExp.prototype.toString.call(b);
}
function areSimilarFloatArrays(a, b) {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (var offset = 0; offset < a.byteLength; offset++) {
    if (a[offset] !== b[offset]) {
      return false;
    }
  }
  return true;
}
function areSimilarTypedArrays(a, b) {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0;
}
function areEqualArrayBuffers(buf1, buf2) {
  return buf1.byteLength === buf2.byteLength && compare(new Uint8Array(buf1), new Uint8Array(buf2)) === 0;
}
function isEqualBoxedPrimitive(val1, val2) {
  if (isNumberObject(val1)) {
    return isNumberObject(val2) && objectIs(Number.prototype.valueOf.call(val1), Number.prototype.valueOf.call(val2));
  }
  if (isStringObject(val1)) {
    return isStringObject(val2) && String.prototype.valueOf.call(val1) === String.prototype.valueOf.call(val2);
  }
  if (isBooleanObject(val1)) {
    return isBooleanObject(val2) && Boolean.prototype.valueOf.call(val1) === Boolean.prototype.valueOf.call(val2);
  }
  if (isBigIntObject(val1)) {
    return isBigIntObject(val2) && BigInt.prototype.valueOf.call(val1) === BigInt.prototype.valueOf.call(val2);
  }
  return isSymbolObject(val2) && Symbol.prototype.valueOf.call(val1) === Symbol.prototype.valueOf.call(val2);
}

// Notes: Type tags are historical [[Class]] properties that can be set by
// FunctionTemplate::SetClassName() in C++ or Symbol.toStringTag in JS
// and retrieved using Object.prototype.toString.call(obj) in JS
// See https://tc39.github.io/ecma262/#sec-object.prototype.tostring
// for a list of tags pre-defined in the spec.
// There are some unspecified tags in the wild too (e.g. typed array tags).
// Since tags can be altered, they only serve fast failures
//
// Typed arrays and buffers are checked by comparing the content in their
// underlying ArrayBuffer. This optimization requires that it's
// reasonable to interpret their underlying memory in the same way,
// which is checked by comparing their type tags.
// (e.g. a Uint8Array and a Uint16Array with the same memory content
// could still be different because they will be interpreted differently).
//
// For strict comparison, objects should have
// a) The same built-in type tags
// b) The same prototypes.

function innerDeepEqual(val1, val2, strict, memos) {
  // All identical values are equivalent, as determined by ===.
  if (val1 === val2) {
    if (val1 !== 0) return true;
    return strict ? objectIs(val1, val2) : true;
  }

  // Check more closely if val1 and val2 are equal.
  if (strict) {
    if (_typeof(val1) !== 'object') {
      return typeof val1 === 'number' && numberIsNaN(val1) && numberIsNaN(val2);
    }
    if (_typeof(val2) !== 'object' || val1 === null || val2 === null) {
      return false;
    }
    if (Object.getPrototypeOf(val1) !== Object.getPrototypeOf(val2)) {
      return false;
    }
  } else {
    if (val1 === null || _typeof(val1) !== 'object') {
      if (val2 === null || _typeof(val2) !== 'object') {
        // eslint-disable-next-line eqeqeq
        return val1 == val2;
      }
      return false;
    }
    if (val2 === null || _typeof(val2) !== 'object') {
      return false;
    }
  }
  var val1Tag = objectToString(val1);
  var val2Tag = objectToString(val2);
  if (val1Tag !== val2Tag) {
    return false;
  }
  if (Array.isArray(val1)) {
    // Check for sparse arrays and general fast path
    if (val1.length !== val2.length) {
      return false;
    }
    var keys1 = getOwnNonIndexProperties(val1, ONLY_ENUMERABLE);
    var keys2 = getOwnNonIndexProperties(val2, ONLY_ENUMERABLE);
    if (keys1.length !== keys2.length) {
      return false;
    }
    return keyCheck(val1, val2, strict, memos, kIsArray, keys1);
  }
  // [browserify] This triggers on certain types in IE (Map/Set) so we don't
  // wan't to early return out of the rest of the checks. However we can check
  // if the second value is one of these values and the first isn't.
  if (val1Tag === '[object Object]') {
    // return keyCheck(val1, val2, strict, memos, kNoIterator);
    if (!isMap(val1) && isMap(val2) || !isSet(val1) && isSet(val2)) {
      return false;
    }
  }
  if (isDate(val1)) {
    if (!isDate(val2) || Date.prototype.getTime.call(val1) !== Date.prototype.getTime.call(val2)) {
      return false;
    }
  } else if (isRegExp(val1)) {
    if (!isRegExp(val2) || !areSimilarRegExps(val1, val2)) {
      return false;
    }
  } else if (isNativeError(val1) || val1 instanceof Error) {
    // Do not compare the stack as it might differ even though the error itself
    // is otherwise identical.
    if (val1.message !== val2.message || val1.name !== val2.name) {
      return false;
    }
  } else if (isArrayBufferView(val1)) {
    if (!strict && (isFloat32Array(val1) || isFloat64Array(val1))) {
      if (!areSimilarFloatArrays(val1, val2)) {
        return false;
      }
    } else if (!areSimilarTypedArrays(val1, val2)) {
      return false;
    }
    // Buffer.compare returns true, so val1.length === val2.length. If they both
    // only contain numeric keys, we don't need to exam further than checking
    // the symbols.
    var _keys = getOwnNonIndexProperties(val1, ONLY_ENUMERABLE);
    var _keys2 = getOwnNonIndexProperties(val2, ONLY_ENUMERABLE);
    if (_keys.length !== _keys2.length) {
      return false;
    }
    return keyCheck(val1, val2, strict, memos, kNoIterator, _keys);
  } else if (isSet(val1)) {
    if (!isSet(val2) || val1.size !== val2.size) {
      return false;
    }
    return keyCheck(val1, val2, strict, memos, kIsSet);
  } else if (isMap(val1)) {
    if (!isMap(val2) || val1.size !== val2.size) {
      return false;
    }
    return keyCheck(val1, val2, strict, memos, kIsMap);
  } else if (isAnyArrayBuffer(val1)) {
    if (!areEqualArrayBuffers(val1, val2)) {
      return false;
    }
  } else if (isBoxedPrimitive(val1) && !isEqualBoxedPrimitive(val1, val2)) {
    return false;
  }
  return keyCheck(val1, val2, strict, memos, kNoIterator);
}
function getEnumerables(val, keys) {
  return keys.filter(function (k) {
    return propertyIsEnumerable(val, k);
  });
}
function keyCheck(val1, val2, strict, memos, iterationType, aKeys) {
  // For all remaining Object pairs, including Array, objects and Maps,
  // equivalence is determined by having:
  // a) The same number of owned enumerable properties
  // b) The same set of keys/indexes (although not necessarily the same order)
  // c) Equivalent values for every corresponding key/index
  // d) For Sets and Maps, equal contents
  // Note: this accounts for both named and indexed properties on Arrays.
  if (arguments.length === 5) {
    aKeys = Object.keys(val1);
    var bKeys = Object.keys(val2);

    // The pair must have the same number of owned properties.
    if (aKeys.length !== bKeys.length) {
      return false;
    }
  }

  // Cheap key test
  var i = 0;
  for (; i < aKeys.length; i++) {
    if (!hasOwnProperty(val2, aKeys[i])) {
      return false;
    }
  }
  if (strict && arguments.length === 5) {
    var symbolKeysA = objectGetOwnPropertySymbols(val1);
    if (symbolKeysA.length !== 0) {
      var count = 0;
      for (i = 0; i < symbolKeysA.length; i++) {
        var key = symbolKeysA[i];
        if (propertyIsEnumerable(val1, key)) {
          if (!propertyIsEnumerable(val2, key)) {
            return false;
          }
          aKeys.push(key);
          count++;
        } else if (propertyIsEnumerable(val2, key)) {
          return false;
        }
      }
      var symbolKeysB = objectGetOwnPropertySymbols(val2);
      if (symbolKeysA.length !== symbolKeysB.length && getEnumerables(val2, symbolKeysB).length !== count) {
        return false;
      }
    } else {
      var _symbolKeysB = objectGetOwnPropertySymbols(val2);
      if (_symbolKeysB.length !== 0 && getEnumerables(val2, _symbolKeysB).length !== 0) {
        return false;
      }
    }
  }
  if (aKeys.length === 0 && (iterationType === kNoIterator || iterationType === kIsArray && val1.length === 0 || val1.size === 0)) {
    return true;
  }

  // Use memos to handle cycles.
  if (memos === undefined) {
    memos = {
      val1: new Map(),
      val2: new Map(),
      position: 0
    };
  } else {
    // We prevent up to two map.has(x) calls by directly retrieving the value
    // and checking for undefined. The map can only contain numbers, so it is
    // safe to check for undefined only.
    var val2MemoA = memos.val1.get(val1);
    if (val2MemoA !== undefined) {
      var val2MemoB = memos.val2.get(val2);
      if (val2MemoB !== undefined) {
        return val2MemoA === val2MemoB;
      }
    }
    memos.position++;
  }
  memos.val1.set(val1, memos.position);
  memos.val2.set(val2, memos.position);
  var areEq = objEquiv(val1, val2, strict, aKeys, memos, iterationType);
  memos.val1.delete(val1);
  memos.val2.delete(val2);
  return areEq;
}
function setHasEqualElement(set, val1, strict, memo) {
  // Go looking.
  var setValues = arrayFromSet(set);
  for (var i = 0; i < setValues.length; i++) {
    var val2 = setValues[i];
    if (innerDeepEqual(val1, val2, strict, memo)) {
      // Remove the matching element to make sure we do not check that again.
      set.delete(val2);
      return true;
    }
  }
  return false;
}

// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness#Loose_equality_using
// Sadly it is not possible to detect corresponding values properly in case the
// type is a string, number, bigint or boolean. The reason is that those values
// can match lots of different string values (e.g., 1n == '+00001').
function findLooseMatchingPrimitives(prim) {
  switch (_typeof(prim)) {
    case 'undefined':
      return null;
    case 'object':
      // Only pass in null as object!
      return undefined;
    case 'symbol':
      return false;
    case 'string':
      prim = +prim;
    // Loose equal entries exist only if the string is possible to convert to
    // a regular number and not NaN.
    // Fall through
    case 'number':
      if (numberIsNaN(prim)) {
        return false;
      }
  }
  return true;
}
function setMightHaveLoosePrim(a, b, prim) {
  var altValue = findLooseMatchingPrimitives(prim);
  if (altValue != null) return altValue;
  return b.has(altValue) && !a.has(altValue);
}
function mapMightHaveLoosePrim(a, b, prim, item, memo) {
  var altValue = findLooseMatchingPrimitives(prim);
  if (altValue != null) {
    return altValue;
  }
  var curB = b.get(altValue);
  if (curB === undefined && !b.has(altValue) || !innerDeepEqual(item, curB, false, memo)) {
    return false;
  }
  return !a.has(altValue) && innerDeepEqual(item, curB, false, memo);
}
function setEquiv(a, b, strict, memo) {
  // This is a lazily initiated Set of entries which have to be compared
  // pairwise.
  var set = null;
  var aValues = arrayFromSet(a);
  for (var i = 0; i < aValues.length; i++) {
    var val = aValues[i];
    // Note: Checking for the objects first improves the performance for object
    // heavy sets but it is a minor slow down for primitives. As they are fast
    // to check this improves the worst case scenario instead.
    if (_typeof(val) === 'object' && val !== null) {
      if (set === null) {
        set = new Set();
      }
      // If the specified value doesn't exist in the second set its an not null
      // object (or non strict only: a not matching primitive) we'll need to go
      // hunting for something thats deep-(strict-)equal to it. To make this
      // O(n log n) complexity we have to copy these values in a new set first.
      set.add(val);
    } else if (!b.has(val)) {
      if (strict) return false;

      // Fast path to detect missing string, symbol, undefined and null values.
      if (!setMightHaveLoosePrim(a, b, val)) {
        return false;
      }
      if (set === null) {
        set = new Set();
      }
      set.add(val);
    }
  }
  if (set !== null) {
    var bValues = arrayFromSet(b);
    for (var _i = 0; _i < bValues.length; _i++) {
      var _val = bValues[_i];
      // We have to check if a primitive value is already
      // matching and only if it's not, go hunting for it.
      if (_typeof(_val) === 'object' && _val !== null) {
        if (!setHasEqualElement(set, _val, strict, memo)) return false;
      } else if (!strict && !a.has(_val) && !setHasEqualElement(set, _val, strict, memo)) {
        return false;
      }
    }
    return set.size === 0;
  }
  return true;
}
function mapHasEqualEntry(set, map, key1, item1, strict, memo) {
  // To be able to handle cases like:
  //   Map([[{}, 'a'], [{}, 'b']]) vs Map([[{}, 'b'], [{}, 'a']])
  // ... we need to consider *all* matching keys, not just the first we find.
  var setValues = arrayFromSet(set);
  for (var i = 0; i < setValues.length; i++) {
    var key2 = setValues[i];
    if (innerDeepEqual(key1, key2, strict, memo) && innerDeepEqual(item1, map.get(key2), strict, memo)) {
      set.delete(key2);
      return true;
    }
  }
  return false;
}
function mapEquiv(a, b, strict, memo) {
  var set = null;
  var aEntries = arrayFromMap(a);
  for (var i = 0; i < aEntries.length; i++) {
    var _aEntries$i = _slicedToArray(aEntries[i], 2),
      key = _aEntries$i[0],
      item1 = _aEntries$i[1];
    if (_typeof(key) === 'object' && key !== null) {
      if (set === null) {
        set = new Set();
      }
      set.add(key);
    } else {
      // By directly retrieving the value we prevent another b.has(key) check in
      // almost all possible cases.
      var item2 = b.get(key);
      if (item2 === undefined && !b.has(key) || !innerDeepEqual(item1, item2, strict, memo)) {
        if (strict) return false;
        // Fast path to detect missing string, symbol, undefined and null
        // keys.
        if (!mapMightHaveLoosePrim(a, b, key, item1, memo)) return false;
        if (set === null) {
          set = new Set();
        }
        set.add(key);
      }
    }
  }
  if (set !== null) {
    var bEntries = arrayFromMap(b);
    for (var _i2 = 0; _i2 < bEntries.length; _i2++) {
      var _bEntries$_i = _slicedToArray(bEntries[_i2], 2),
        _key = _bEntries$_i[0],
        item = _bEntries$_i[1];
      if (_typeof(_key) === 'object' && _key !== null) {
        if (!mapHasEqualEntry(set, a, _key, item, strict, memo)) return false;
      } else if (!strict && (!a.has(_key) || !innerDeepEqual(a.get(_key), item, false, memo)) && !mapHasEqualEntry(set, a, _key, item, false, memo)) {
        return false;
      }
    }
    return set.size === 0;
  }
  return true;
}
function objEquiv(a, b, strict, keys, memos, iterationType) {
  // Sets and maps don't have their entries accessible via normal object
  // properties.
  var i = 0;
  if (iterationType === kIsSet) {
    if (!setEquiv(a, b, strict, memos)) {
      return false;
    }
  } else if (iterationType === kIsMap) {
    if (!mapEquiv(a, b, strict, memos)) {
      return false;
    }
  } else if (iterationType === kIsArray) {
    for (; i < a.length; i++) {
      if (hasOwnProperty(a, i)) {
        if (!hasOwnProperty(b, i) || !innerDeepEqual(a[i], b[i], strict, memos)) {
          return false;
        }
      } else if (hasOwnProperty(b, i)) {
        return false;
      } else {
        // Array is sparse.
        var keysA = Object.keys(a);
        for (; i < keysA.length; i++) {
          var key = keysA[i];
          if (!hasOwnProperty(b, key) || !innerDeepEqual(a[key], b[key], strict, memos)) {
            return false;
          }
        }
        if (keysA.length !== Object.keys(b).length) {
          return false;
        }
        return true;
      }
    }
  }

  // The pair must have equivalent values for every corresponding key.
  // Possibly expensive deep test:
  for (i = 0; i < keys.length; i++) {
    var _key2 = keys[i];
    if (!innerDeepEqual(a[_key2], b[_key2], strict, memos)) {
      return false;
    }
  }
  return true;
}
function isDeepEqual(val1, val2) {
  return innerDeepEqual(val1, val2, kLoose);
}
function isDeepStrictEqual(val1, val2) {
  return innerDeepEqual(val1, val2, kStrict);
}
module.exports = {
  isDeepEqual: isDeepEqual,
  isDeepStrictEqual: isDeepStrictEqual
};

/***/ },

/***/ "./node_modules/call-bind-apply-helpers/actualApply.js"
/*!*************************************************************!*\
  !*** ./node_modules/call-bind-apply-helpers/actualApply.js ***!
  \*************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var bind = __webpack_require__(/*! function-bind */ "./node_modules/function-bind/index.js");

var $apply = __webpack_require__(/*! ./functionApply */ "./node_modules/call-bind-apply-helpers/functionApply.js");
var $call = __webpack_require__(/*! ./functionCall */ "./node_modules/call-bind-apply-helpers/functionCall.js");
var $reflectApply = __webpack_require__(/*! ./reflectApply */ "./node_modules/call-bind-apply-helpers/reflectApply.js");

/** @type {import('./actualApply')} */
module.exports = $reflectApply || bind.call($call, $apply);


/***/ },

/***/ "./node_modules/call-bind-apply-helpers/applyBind.js"
/*!***********************************************************!*\
  !*** ./node_modules/call-bind-apply-helpers/applyBind.js ***!
  \***********************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var bind = __webpack_require__(/*! function-bind */ "./node_modules/function-bind/index.js");
var $apply = __webpack_require__(/*! ./functionApply */ "./node_modules/call-bind-apply-helpers/functionApply.js");
var actualApply = __webpack_require__(/*! ./actualApply */ "./node_modules/call-bind-apply-helpers/actualApply.js");

/** @type {import('./applyBind')} */
module.exports = function applyBind() {
	return actualApply(bind, $apply, arguments);
};


/***/ },

/***/ "./node_modules/call-bind-apply-helpers/functionApply.js"
/*!***************************************************************!*\
  !*** ./node_modules/call-bind-apply-helpers/functionApply.js ***!
  \***************************************************************/
(module) {

"use strict";


/** @type {import('./functionApply')} */
module.exports = Function.prototype.apply;


/***/ },

/***/ "./node_modules/call-bind-apply-helpers/functionCall.js"
/*!**************************************************************!*\
  !*** ./node_modules/call-bind-apply-helpers/functionCall.js ***!
  \**************************************************************/
(module) {

"use strict";


/** @type {import('./functionCall')} */
module.exports = Function.prototype.call;


/***/ },

/***/ "./node_modules/call-bind-apply-helpers/index.js"
/*!*******************************************************!*\
  !*** ./node_modules/call-bind-apply-helpers/index.js ***!
  \*******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var bind = __webpack_require__(/*! function-bind */ "./node_modules/function-bind/index.js");
var $TypeError = __webpack_require__(/*! es-errors/type */ "./node_modules/es-errors/type.js");

var $call = __webpack_require__(/*! ./functionCall */ "./node_modules/call-bind-apply-helpers/functionCall.js");
var $actualApply = __webpack_require__(/*! ./actualApply */ "./node_modules/call-bind-apply-helpers/actualApply.js");

/** @type {(args: [Function, thisArg?: unknown, ...args: unknown[]]) => Function} TODO FIXME, find a way to use import('.') */
module.exports = function callBindBasic(args) {
	if (args.length < 1 || typeof args[0] !== 'function') {
		throw new $TypeError('a function is required');
	}
	return $actualApply(bind, $call, args);
};


/***/ },

/***/ "./node_modules/call-bind-apply-helpers/reflectApply.js"
/*!**************************************************************!*\
  !*** ./node_modules/call-bind-apply-helpers/reflectApply.js ***!
  \**************************************************************/
(module) {

"use strict";


/** @type {import('./reflectApply')} */
module.exports = typeof Reflect !== 'undefined' && Reflect && Reflect.apply;


/***/ },

/***/ "./node_modules/call-bind/callBound.js"
/*!*********************************************!*\
  !*** ./node_modules/call-bind/callBound.js ***!
  \*********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var GetIntrinsic = __webpack_require__(/*! get-intrinsic */ "./node_modules/get-intrinsic/index.js");

var callBind = __webpack_require__(/*! ./ */ "./node_modules/call-bind/index.js");

var $indexOf = callBind(GetIntrinsic('String.prototype.indexOf'));

module.exports = function callBoundIntrinsic(name, allowMissing) {
	var intrinsic = GetIntrinsic(name, !!allowMissing);
	if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
		return callBind(intrinsic);
	}
	return intrinsic;
};


/***/ },

/***/ "./node_modules/call-bind/index.js"
/*!*****************************************!*\
  !*** ./node_modules/call-bind/index.js ***!
  \*****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var setFunctionLength = __webpack_require__(/*! set-function-length */ "./node_modules/set-function-length/index.js");

var $defineProperty = __webpack_require__(/*! es-define-property */ "./node_modules/es-define-property/index.js");

var callBindBasic = __webpack_require__(/*! call-bind-apply-helpers */ "./node_modules/call-bind-apply-helpers/index.js");
var applyBind = __webpack_require__(/*! call-bind-apply-helpers/applyBind */ "./node_modules/call-bind-apply-helpers/applyBind.js");

module.exports = function callBind(originalFunction) {
	var func = callBindBasic(arguments);
	var adjustedLength = originalFunction.length - (arguments.length - 1);
	return setFunctionLength(
		func,
		1 + (adjustedLength > 0 ? adjustedLength : 0),
		true
	);
};

if ($defineProperty) {
	$defineProperty(module.exports, 'apply', { value: applyBind });
} else {
	module.exports.apply = applyBind;
}


/***/ },

/***/ "./node_modules/call-bound/index.js"
/*!******************************************!*\
  !*** ./node_modules/call-bound/index.js ***!
  \******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var GetIntrinsic = __webpack_require__(/*! get-intrinsic */ "./node_modules/get-intrinsic/index.js");

var callBindBasic = __webpack_require__(/*! call-bind-apply-helpers */ "./node_modules/call-bind-apply-helpers/index.js");

/** @type {(thisArg: string, searchString: string, position?: number) => number} */
var $indexOf = callBindBasic([GetIntrinsic('%String.prototype.indexOf%')]);

/** @type {import('.')} */
module.exports = function callBoundIntrinsic(name, allowMissing) {
	/* eslint no-extra-parens: 0 */

	var intrinsic = /** @type {(this: unknown, ...args: unknown[]) => unknown} */ (GetIntrinsic(name, !!allowMissing));
	if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
		return callBindBasic(/** @type {const} */ ([intrinsic]));
	}
	return intrinsic;
};


/***/ },

/***/ "./node_modules/debug/src/browser.js"
/*!*******************************************!*\
  !*** ./node_modules/debug/src/browser.js ***!
  \*******************************************/
(module, exports, __webpack_require__) {

/* provided dependency */ var process = __webpack_require__(/*! process/browser */ "./node_modules/process/browser.js");
/* eslint-env browser */

/**
 * This is the web browser implementation of `debug()`.
 */

exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = localstorage();
exports.destroy = (() => {
	let warned = false;

	return () => {
		if (!warned) {
			warned = true;
			console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
		}
	};
})();

/**
 * Colors.
 */

exports.colors = [
	'#0000CC',
	'#0000FF',
	'#0033CC',
	'#0033FF',
	'#0066CC',
	'#0066FF',
	'#0099CC',
	'#0099FF',
	'#00CC00',
	'#00CC33',
	'#00CC66',
	'#00CC99',
	'#00CCCC',
	'#00CCFF',
	'#3300CC',
	'#3300FF',
	'#3333CC',
	'#3333FF',
	'#3366CC',
	'#3366FF',
	'#3399CC',
	'#3399FF',
	'#33CC00',
	'#33CC33',
	'#33CC66',
	'#33CC99',
	'#33CCCC',
	'#33CCFF',
	'#6600CC',
	'#6600FF',
	'#6633CC',
	'#6633FF',
	'#66CC00',
	'#66CC33',
	'#9900CC',
	'#9900FF',
	'#9933CC',
	'#9933FF',
	'#99CC00',
	'#99CC33',
	'#CC0000',
	'#CC0033',
	'#CC0066',
	'#CC0099',
	'#CC00CC',
	'#CC00FF',
	'#CC3300',
	'#CC3333',
	'#CC3366',
	'#CC3399',
	'#CC33CC',
	'#CC33FF',
	'#CC6600',
	'#CC6633',
	'#CC9900',
	'#CC9933',
	'#CCCC00',
	'#CCCC33',
	'#FF0000',
	'#FF0033',
	'#FF0066',
	'#FF0099',
	'#FF00CC',
	'#FF00FF',
	'#FF3300',
	'#FF3333',
	'#FF3366',
	'#FF3399',
	'#FF33CC',
	'#FF33FF',
	'#FF6600',
	'#FF6633',
	'#FF9900',
	'#FF9933',
	'#FFCC00',
	'#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

// eslint-disable-next-line complexity
function useColors() {
	// NB: In an Electron preload script, document will be defined but not fully
	// initialized. Since we know we're in Chrome, we'll just detect this case
	// explicitly
	if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
		return true;
	}

	// Internet Explorer and Edge do not support colors.
	if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
		return false;
	}

	let m;

	// Is webkit? http://stackoverflow.com/a/16459606/376773
	// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
	// eslint-disable-next-line no-return-assign
	return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
		// Is firebug? http://stackoverflow.com/a/398120/376773
		(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
		// Is firefox >= v31?
		// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
		(typeof navigator !== 'undefined' && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31) ||
		// Double check webkit in userAgent just in case we are in a worker
		(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
	args[0] = (this.useColors ? '%c' : '') +
		this.namespace +
		(this.useColors ? ' %c' : ' ') +
		args[0] +
		(this.useColors ? '%c ' : ' ') +
		'+' + module.exports.humanize(this.diff);

	if (!this.useColors) {
		return;
	}

	const c = 'color: ' + this.color;
	args.splice(1, 0, c, 'color: inherit');

	// The final "%c" is somewhat tricky, because there could be other
	// arguments passed either before or after the %c, so we need to
	// figure out the correct index to insert the CSS into
	let index = 0;
	let lastC = 0;
	args[0].replace(/%[a-zA-Z%]/g, match => {
		if (match === '%%') {
			return;
		}
		index++;
		if (match === '%c') {
			// We only are interested in the *last* %c
			// (the user may have provided their own)
			lastC = index;
		}
	});

	args.splice(lastC, 0, c);
}

/**
 * Invokes `console.debug()` when available.
 * No-op when `console.debug` is not a "function".
 * If `console.debug` is not available, falls back
 * to `console.log`.
 *
 * @api public
 */
exports.log = console.debug || console.log || (() => {});

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */
function save(namespaces) {
	try {
		if (namespaces) {
			exports.storage.setItem('debug', namespaces);
		} else {
			exports.storage.removeItem('debug');
		}
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */
function load() {
	let r;
	try {
		r = exports.storage.getItem('debug') || exports.storage.getItem('DEBUG') ;
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}

	// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
	if (!r && typeof process !== 'undefined' && 'env' in process) {
		r = process.env.DEBUG;
	}

	return r;
}

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
	try {
		// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
		// The Browser also has localStorage in the global context.
		return localStorage;
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

module.exports = __webpack_require__(/*! ./common */ "./node_modules/debug/src/common.js")(exports);

const {formatters} = module.exports;

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

formatters.j = function (v) {
	try {
		return JSON.stringify(v);
	} catch (error) {
		return '[UnexpectedJSONParseError]: ' + error.message;
	}
};


/***/ },

/***/ "./node_modules/debug/src/common.js"
/*!******************************************!*\
  !*** ./node_modules/debug/src/common.js ***!
  \******************************************/
(module, __unused_webpack_exports, __webpack_require__) {


/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 */

function setup(env) {
	createDebug.debug = createDebug;
	createDebug.default = createDebug;
	createDebug.coerce = coerce;
	createDebug.disable = disable;
	createDebug.enable = enable;
	createDebug.enabled = enabled;
	createDebug.humanize = __webpack_require__(/*! ms */ "./node_modules/ms/index.js");
	createDebug.destroy = destroy;

	Object.keys(env).forEach(key => {
		createDebug[key] = env[key];
	});

	/**
	* The currently active debug mode names, and names to skip.
	*/

	createDebug.names = [];
	createDebug.skips = [];

	/**
	* Map of special "%n" handling functions, for the debug "format" argument.
	*
	* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
	*/
	createDebug.formatters = {};

	/**
	* Selects a color for a debug namespace
	* @param {String} namespace The namespace string for the debug instance to be colored
	* @return {Number|String} An ANSI color code for the given namespace
	* @api private
	*/
	function selectColor(namespace) {
		let hash = 0;

		for (let i = 0; i < namespace.length; i++) {
			hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}

		return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
	}
	createDebug.selectColor = selectColor;

	/**
	* Create a debugger with the given `namespace`.
	*
	* @param {String} namespace
	* @return {Function}
	* @api public
	*/
	function createDebug(namespace) {
		let prevTime;
		let enableOverride = null;
		let namespacesCache;
		let enabledCache;

		function debug(...args) {
			// Disabled?
			if (!debug.enabled) {
				return;
			}

			const self = debug;

			// Set `diff` timestamp
			const curr = Number(new Date());
			const ms = curr - (prevTime || curr);
			self.diff = ms;
			self.prev = prevTime;
			self.curr = curr;
			prevTime = curr;

			args[0] = createDebug.coerce(args[0]);

			if (typeof args[0] !== 'string') {
				// Anything else let's inspect with %O
				args.unshift('%O');
			}

			// Apply any `formatters` transformations
			let index = 0;
			args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
				// If we encounter an escaped % then don't increase the array index
				if (match === '%%') {
					return '%';
				}
				index++;
				const formatter = createDebug.formatters[format];
				if (typeof formatter === 'function') {
					const val = args[index];
					match = formatter.call(self, val);

					// Now we need to remove `args[index]` since it's inlined in the `format`
					args.splice(index, 1);
					index--;
				}
				return match;
			});

			// Apply env-specific formatting (colors, etc.)
			createDebug.formatArgs.call(self, args);

			const logFn = self.log || createDebug.log;
			logFn.apply(self, args);
		}

		debug.namespace = namespace;
		debug.useColors = createDebug.useColors();
		debug.color = createDebug.selectColor(namespace);
		debug.extend = extend;
		debug.destroy = createDebug.destroy; // XXX Temporary. Will be removed in the next major release.

		Object.defineProperty(debug, 'enabled', {
			enumerable: true,
			configurable: false,
			get: () => {
				if (enableOverride !== null) {
					return enableOverride;
				}
				if (namespacesCache !== createDebug.namespaces) {
					namespacesCache = createDebug.namespaces;
					enabledCache = createDebug.enabled(namespace);
				}

				return enabledCache;
			},
			set: v => {
				enableOverride = v;
			}
		});

		// Env-specific initialization logic for debug instances
		if (typeof createDebug.init === 'function') {
			createDebug.init(debug);
		}

		return debug;
	}

	function extend(namespace, delimiter) {
		const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
		newDebug.log = this.log;
		return newDebug;
	}

	/**
	* Enables a debug mode by namespaces. This can include modes
	* separated by a colon and wildcards.
	*
	* @param {String} namespaces
	* @api public
	*/
	function enable(namespaces) {
		createDebug.save(namespaces);
		createDebug.namespaces = namespaces;

		createDebug.names = [];
		createDebug.skips = [];

		const split = (typeof namespaces === 'string' ? namespaces : '')
			.trim()
			.replace(/\s+/g, ',')
			.split(',')
			.filter(Boolean);

		for (const ns of split) {
			if (ns[0] === '-') {
				createDebug.skips.push(ns.slice(1));
			} else {
				createDebug.names.push(ns);
			}
		}
	}

	/**
	 * Checks if the given string matches a namespace template, honoring
	 * asterisks as wildcards.
	 *
	 * @param {String} search
	 * @param {String} template
	 * @return {Boolean}
	 */
	function matchesTemplate(search, template) {
		let searchIndex = 0;
		let templateIndex = 0;
		let starIndex = -1;
		let matchIndex = 0;

		while (searchIndex < search.length) {
			if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === '*')) {
				// Match character or proceed with wildcard
				if (template[templateIndex] === '*') {
					starIndex = templateIndex;
					matchIndex = searchIndex;
					templateIndex++; // Skip the '*'
				} else {
					searchIndex++;
					templateIndex++;
				}
			} else if (starIndex !== -1) { // eslint-disable-line no-negated-condition
				// Backtrack to the last '*' and try to match more characters
				templateIndex = starIndex + 1;
				matchIndex++;
				searchIndex = matchIndex;
			} else {
				return false; // No match
			}
		}

		// Handle trailing '*' in template
		while (templateIndex < template.length && template[templateIndex] === '*') {
			templateIndex++;
		}

		return templateIndex === template.length;
	}

	/**
	* Disable debug output.
	*
	* @return {String} namespaces
	* @api public
	*/
	function disable() {
		const namespaces = [
			...createDebug.names,
			...createDebug.skips.map(namespace => '-' + namespace)
		].join(',');
		createDebug.enable('');
		return namespaces;
	}

	/**
	* Returns true if the given mode name is enabled, false otherwise.
	*
	* @param {String} name
	* @return {Boolean}
	* @api public
	*/
	function enabled(name) {
		for (const skip of createDebug.skips) {
			if (matchesTemplate(name, skip)) {
				return false;
			}
		}

		for (const ns of createDebug.names) {
			if (matchesTemplate(name, ns)) {
				return true;
			}
		}

		return false;
	}

	/**
	* Coerce `val`.
	*
	* @param {Mixed} val
	* @return {Mixed}
	* @api private
	*/
	function coerce(val) {
		if (val instanceof Error) {
			return val.stack || val.message;
		}
		return val;
	}

	/**
	* XXX DO NOT USE. This is a temporary stub function.
	* XXX It WILL be removed in the next major release.
	*/
	function destroy() {
		console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
	}

	createDebug.enable(createDebug.load());

	return createDebug;
}

module.exports = setup;


/***/ },

/***/ "./node_modules/define-data-property/index.js"
/*!****************************************************!*\
  !*** ./node_modules/define-data-property/index.js ***!
  \****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var $defineProperty = __webpack_require__(/*! es-define-property */ "./node_modules/es-define-property/index.js");

var $SyntaxError = __webpack_require__(/*! es-errors/syntax */ "./node_modules/es-errors/syntax.js");
var $TypeError = __webpack_require__(/*! es-errors/type */ "./node_modules/es-errors/type.js");

var gopd = __webpack_require__(/*! gopd */ "./node_modules/gopd/index.js");

/** @type {import('.')} */
module.exports = function defineDataProperty(
	obj,
	property,
	value
) {
	if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {
		throw new $TypeError('`obj` must be an object or a function`');
	}
	if (typeof property !== 'string' && typeof property !== 'symbol') {
		throw new $TypeError('`property` must be a string or a symbol`');
	}
	if (arguments.length > 3 && typeof arguments[3] !== 'boolean' && arguments[3] !== null) {
		throw new $TypeError('`nonEnumerable`, if provided, must be a boolean or null');
	}
	if (arguments.length > 4 && typeof arguments[4] !== 'boolean' && arguments[4] !== null) {
		throw new $TypeError('`nonWritable`, if provided, must be a boolean or null');
	}
	if (arguments.length > 5 && typeof arguments[5] !== 'boolean' && arguments[5] !== null) {
		throw new $TypeError('`nonConfigurable`, if provided, must be a boolean or null');
	}
	if (arguments.length > 6 && typeof arguments[6] !== 'boolean') {
		throw new $TypeError('`loose`, if provided, must be a boolean');
	}

	var nonEnumerable = arguments.length > 3 ? arguments[3] : null;
	var nonWritable = arguments.length > 4 ? arguments[4] : null;
	var nonConfigurable = arguments.length > 5 ? arguments[5] : null;
	var loose = arguments.length > 6 ? arguments[6] : false;

	/* @type {false | TypedPropertyDescriptor<unknown>} */
	var desc = !!gopd && gopd(obj, property);

	if ($defineProperty) {
		$defineProperty(obj, property, {
			configurable: nonConfigurable === null && desc ? desc.configurable : !nonConfigurable,
			enumerable: nonEnumerable === null && desc ? desc.enumerable : !nonEnumerable,
			value: value,
			writable: nonWritable === null && desc ? desc.writable : !nonWritable
		});
	} else if (loose || (!nonEnumerable && !nonWritable && !nonConfigurable)) {
		// must fall back to [[Set]], and was not explicitly asked to make non-enumerable, non-writable, or non-configurable
		obj[property] = value; // eslint-disable-line no-param-reassign
	} else {
		throw new $SyntaxError('This environment does not support defining a property as non-configurable, non-writable, or non-enumerable.');
	}
};


/***/ },

/***/ "./node_modules/define-properties/index.js"
/*!*************************************************!*\
  !*** ./node_modules/define-properties/index.js ***!
  \*************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var keys = __webpack_require__(/*! object-keys */ "./node_modules/object-keys/index.js");
var hasSymbols = typeof Symbol === 'function' && typeof Symbol('foo') === 'symbol';

var toStr = Object.prototype.toString;
var concat = Array.prototype.concat;
var defineDataProperty = __webpack_require__(/*! define-data-property */ "./node_modules/define-data-property/index.js");

var isFunction = function (fn) {
	return typeof fn === 'function' && toStr.call(fn) === '[object Function]';
};

var supportsDescriptors = __webpack_require__(/*! has-property-descriptors */ "./node_modules/has-property-descriptors/index.js")();

var defineProperty = function (object, name, value, predicate) {
	if (name in object) {
		if (predicate === true) {
			if (object[name] === value) {
				return;
			}
		} else if (!isFunction(predicate) || !predicate()) {
			return;
		}
	}

	if (supportsDescriptors) {
		defineDataProperty(object, name, value, true);
	} else {
		defineDataProperty(object, name, value);
	}
};

var defineProperties = function (object, map) {
	var predicates = arguments.length > 2 ? arguments[2] : {};
	var props = keys(map);
	if (hasSymbols) {
		props = concat.call(props, Object.getOwnPropertySymbols(map));
	}
	for (var i = 0; i < props.length; i += 1) {
		defineProperty(object, props[i], map[props[i]], predicates[props[i]]);
	}
};

defineProperties.supportsDescriptors = !!supportsDescriptors;

module.exports = defineProperties;


/***/ },

/***/ "./node_modules/dunder-proto/get.js"
/*!******************************************!*\
  !*** ./node_modules/dunder-proto/get.js ***!
  \******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var callBind = __webpack_require__(/*! call-bind-apply-helpers */ "./node_modules/call-bind-apply-helpers/index.js");
var gOPD = __webpack_require__(/*! gopd */ "./node_modules/gopd/index.js");

var hasProtoAccessor;
try {
	// eslint-disable-next-line no-extra-parens, no-proto
	hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */ ([]).__proto__ === Array.prototype;
} catch (e) {
	if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'ERR_PROTO_ACCESS') {
		throw e;
	}
}

// eslint-disable-next-line no-extra-parens
var desc = !!hasProtoAccessor && gOPD && gOPD(Object.prototype, /** @type {keyof typeof Object.prototype} */ ('__proto__'));

var $Object = Object;
var $getPrototypeOf = $Object.getPrototypeOf;

/** @type {import('./get')} */
module.exports = desc && typeof desc.get === 'function'
	? callBind([desc.get])
	: typeof $getPrototypeOf === 'function'
		? /** @type {import('./get')} */ function getDunder(value) {
			// eslint-disable-next-line eqeqeq
			return $getPrototypeOf(value == null ? value : $Object(value));
		}
		: false;


/***/ },

/***/ "./node_modules/es-define-property/index.js"
/*!**************************************************!*\
  !*** ./node_modules/es-define-property/index.js ***!
  \**************************************************/
(module) {

"use strict";


/** @type {import('.')} */
var $defineProperty = Object.defineProperty || false;
if ($defineProperty) {
	try {
		$defineProperty({}, 'a', { value: 1 });
	} catch (e) {
		// IE 8 has a broken defineProperty
		$defineProperty = false;
	}
}

module.exports = $defineProperty;


/***/ },

/***/ "./node_modules/es-errors/eval.js"
/*!****************************************!*\
  !*** ./node_modules/es-errors/eval.js ***!
  \****************************************/
(module) {

"use strict";


/** @type {import('./eval')} */
module.exports = EvalError;


/***/ },

/***/ "./node_modules/es-errors/index.js"
/*!*****************************************!*\
  !*** ./node_modules/es-errors/index.js ***!
  \*****************************************/
(module) {

"use strict";


/** @type {import('.')} */
module.exports = Error;


/***/ },

/***/ "./node_modules/es-errors/range.js"
/*!*****************************************!*\
  !*** ./node_modules/es-errors/range.js ***!
  \*****************************************/
(module) {

"use strict";


/** @type {import('./range')} */
module.exports = RangeError;


/***/ },

/***/ "./node_modules/es-errors/ref.js"
/*!***************************************!*\
  !*** ./node_modules/es-errors/ref.js ***!
  \***************************************/
(module) {

"use strict";


/** @type {import('./ref')} */
module.exports = ReferenceError;


/***/ },

/***/ "./node_modules/es-errors/syntax.js"
/*!******************************************!*\
  !*** ./node_modules/es-errors/syntax.js ***!
  \******************************************/
(module) {

"use strict";


/** @type {import('./syntax')} */
module.exports = SyntaxError;


/***/ },

/***/ "./node_modules/es-errors/type.js"
/*!****************************************!*\
  !*** ./node_modules/es-errors/type.js ***!
  \****************************************/
(module) {

"use strict";


/** @type {import('./type')} */
module.exports = TypeError;


/***/ },

/***/ "./node_modules/es-errors/uri.js"
/*!***************************************!*\
  !*** ./node_modules/es-errors/uri.js ***!
  \***************************************/
(module) {

"use strict";


/** @type {import('./uri')} */
module.exports = URIError;


/***/ },

/***/ "./node_modules/es-object-atoms/index.js"
/*!***********************************************!*\
  !*** ./node_modules/es-object-atoms/index.js ***!
  \***********************************************/
(module) {

"use strict";


/** @type {import('.')} */
module.exports = Object;


/***/ },

/***/ "./node_modules/events/events.js"
/*!***************************************!*\
  !*** ./node_modules/events/events.js ***!
  \***************************************/
(module) {

"use strict";
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.



var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function errorListener(err) {
      emitter.removeListener(name, resolver);
      reject(err);
    }

    function resolver() {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };

    eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
    if (name !== 'error') {
      addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
    }
  });
}

function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
  if (typeof emitter.on === 'function') {
    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
  }
}

function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === 'function') {
    if (flags.once) {
      emitter.once(name, listener);
    } else {
      emitter.on(name, listener);
    }
  } else if (typeof emitter.addEventListener === 'function') {
    // EventTarget does not have `error` event semantics like Node
    // EventEmitters, we do not listen for `error` events here.
    emitter.addEventListener(name, function wrapListener(arg) {
      // IE does not have builtin `{ once: true }` support so we
      // have to do it manually.
      if (flags.once) {
        emitter.removeEventListener(name, wrapListener);
      }
      listener(arg);
    });
  } else {
    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
  }
}


/***/ },

/***/ "./node_modules/for-each/index.js"
/*!****************************************!*\
  !*** ./node_modules/for-each/index.js ***!
  \****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var isCallable = __webpack_require__(/*! is-callable */ "./node_modules/is-callable/index.js");

var toStr = Object.prototype.toString;
var hasOwnProperty = Object.prototype.hasOwnProperty;

/** @type {<This, A extends readonly unknown[]>(arr: A, iterator: (this: This | void, value: A[number], index: number, arr: A) => void, receiver: This | undefined) => void} */
var forEachArray = function forEachArray(array, iterator, receiver) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            if (receiver == null) {
                iterator(array[i], i, array);
            } else {
                iterator.call(receiver, array[i], i, array);
            }
        }
    }
};

/** @type {<This, S extends string>(string: S, iterator: (this: This | void, value: S[number], index: number, string: S) => void, receiver: This | undefined) => void} */
var forEachString = function forEachString(string, iterator, receiver) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        if (receiver == null) {
            iterator(string.charAt(i), i, string);
        } else {
            iterator.call(receiver, string.charAt(i), i, string);
        }
    }
};

/** @type {<This, O>(obj: O, iterator: (this: This | void, value: O[keyof O], index: keyof O, obj: O) => void, receiver: This | undefined) => void} */
var forEachObject = function forEachObject(object, iterator, receiver) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            if (receiver == null) {
                iterator(object[k], k, object);
            } else {
                iterator.call(receiver, object[k], k, object);
            }
        }
    }
};

/** @type {(x: unknown) => x is readonly unknown[]} */
function isArray(x) {
    return toStr.call(x) === '[object Array]';
}

/** @type {import('.')._internal} */
module.exports = function forEach(list, iterator, thisArg) {
    if (!isCallable(iterator)) {
        throw new TypeError('iterator must be a function');
    }

    var receiver;
    if (arguments.length >= 3) {
        receiver = thisArg;
    }

    if (isArray(list)) {
        forEachArray(list, iterator, receiver);
    } else if (typeof list === 'string') {
        forEachString(list, iterator, receiver);
    } else {
        forEachObject(list, iterator, receiver);
    }
};


/***/ },

/***/ "./node_modules/function-bind/implementation.js"
/*!******************************************************!*\
  !*** ./node_modules/function-bind/implementation.js ***!
  \******************************************************/
(module) {

"use strict";


/* eslint no-invalid-this: 1 */

var ERROR_MESSAGE = 'Function.prototype.bind called on incompatible ';
var toStr = Object.prototype.toString;
var max = Math.max;
var funcType = '[object Function]';

var concatty = function concatty(a, b) {
    var arr = [];

    for (var i = 0; i < a.length; i += 1) {
        arr[i] = a[i];
    }
    for (var j = 0; j < b.length; j += 1) {
        arr[j + a.length] = b[j];
    }

    return arr;
};

var slicy = function slicy(arrLike, offset) {
    var arr = [];
    for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) {
        arr[j] = arrLike[i];
    }
    return arr;
};

var joiny = function (arr, joiner) {
    var str = '';
    for (var i = 0; i < arr.length; i += 1) {
        str += arr[i];
        if (i + 1 < arr.length) {
            str += joiner;
        }
    }
    return str;
};

module.exports = function bind(that) {
    var target = this;
    if (typeof target !== 'function' || toStr.apply(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
    }
    var args = slicy(arguments, 1);

    var bound;
    var binder = function () {
        if (this instanceof bound) {
            var result = target.apply(
                this,
                concatty(args, arguments)
            );
            if (Object(result) === result) {
                return result;
            }
            return this;
        }
        return target.apply(
            that,
            concatty(args, arguments)
        );

    };

    var boundLength = max(0, target.length - args.length);
    var boundArgs = [];
    for (var i = 0; i < boundLength; i++) {
        boundArgs[i] = '$' + i;
    }

    bound = Function('binder', 'return function (' + joiny(boundArgs, ',') + '){ return binder.apply(this,arguments); }')(binder);

    if (target.prototype) {
        var Empty = function Empty() {};
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
    }

    return bound;
};


/***/ },

/***/ "./node_modules/function-bind/index.js"
/*!*********************************************!*\
  !*** ./node_modules/function-bind/index.js ***!
  \*********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var implementation = __webpack_require__(/*! ./implementation */ "./node_modules/function-bind/implementation.js");

module.exports = Function.prototype.bind || implementation;


/***/ },

/***/ "./node_modules/generator-function/index.js"
/*!**************************************************!*\
  !*** ./node_modules/generator-function/index.js ***!
  \**************************************************/
(module) {

"use strict";


// eslint-disable-next-line no-extra-parens, no-empty-function
const cached = /** @type {GeneratorFunctionConstructor} */ (function* () {}.constructor);

/** @type {import('.')} */
module.exports = () => cached;



/***/ },

/***/ "./node_modules/get-intrinsic/index.js"
/*!*********************************************!*\
  !*** ./node_modules/get-intrinsic/index.js ***!
  \*********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var undefined;

var $Object = __webpack_require__(/*! es-object-atoms */ "./node_modules/es-object-atoms/index.js");

var $Error = __webpack_require__(/*! es-errors */ "./node_modules/es-errors/index.js");
var $EvalError = __webpack_require__(/*! es-errors/eval */ "./node_modules/es-errors/eval.js");
var $RangeError = __webpack_require__(/*! es-errors/range */ "./node_modules/es-errors/range.js");
var $ReferenceError = __webpack_require__(/*! es-errors/ref */ "./node_modules/es-errors/ref.js");
var $SyntaxError = __webpack_require__(/*! es-errors/syntax */ "./node_modules/es-errors/syntax.js");
var $TypeError = __webpack_require__(/*! es-errors/type */ "./node_modules/es-errors/type.js");
var $URIError = __webpack_require__(/*! es-errors/uri */ "./node_modules/es-errors/uri.js");

var abs = __webpack_require__(/*! math-intrinsics/abs */ "./node_modules/math-intrinsics/abs.js");
var floor = __webpack_require__(/*! math-intrinsics/floor */ "./node_modules/math-intrinsics/floor.js");
var max = __webpack_require__(/*! math-intrinsics/max */ "./node_modules/math-intrinsics/max.js");
var min = __webpack_require__(/*! math-intrinsics/min */ "./node_modules/math-intrinsics/min.js");
var pow = __webpack_require__(/*! math-intrinsics/pow */ "./node_modules/math-intrinsics/pow.js");
var round = __webpack_require__(/*! math-intrinsics/round */ "./node_modules/math-intrinsics/round.js");
var sign = __webpack_require__(/*! math-intrinsics/sign */ "./node_modules/math-intrinsics/sign.js");

var $Function = Function;

// eslint-disable-next-line consistent-return
var getEvalledConstructor = function (expressionSyntax) {
	try {
		return $Function('"use strict"; return (' + expressionSyntax + ').constructor;')();
	} catch (e) {}
};

var $gOPD = __webpack_require__(/*! gopd */ "./node_modules/gopd/index.js");
var $defineProperty = __webpack_require__(/*! es-define-property */ "./node_modules/es-define-property/index.js");

var throwTypeError = function () {
	throw new $TypeError();
};
var ThrowTypeError = $gOPD
	? (function () {
		try {
			// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
			arguments.callee; // IE 8 does not throw here
			return throwTypeError;
		} catch (calleeThrows) {
			try {
				// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
				return $gOPD(arguments, 'callee').get;
			} catch (gOPDthrows) {
				return throwTypeError;
			}
		}
	}())
	: throwTypeError;

var hasSymbols = __webpack_require__(/*! has-symbols */ "./node_modules/has-symbols/index.js")();

var getProto = __webpack_require__(/*! get-proto */ "./node_modules/get-proto/index.js");
var $ObjectGPO = __webpack_require__(/*! get-proto/Object.getPrototypeOf */ "./node_modules/get-proto/Object.getPrototypeOf.js");
var $ReflectGPO = __webpack_require__(/*! get-proto/Reflect.getPrototypeOf */ "./node_modules/get-proto/Reflect.getPrototypeOf.js");

var $apply = __webpack_require__(/*! call-bind-apply-helpers/functionApply */ "./node_modules/call-bind-apply-helpers/functionApply.js");
var $call = __webpack_require__(/*! call-bind-apply-helpers/functionCall */ "./node_modules/call-bind-apply-helpers/functionCall.js");

var needsEval = {};

var TypedArray = typeof Uint8Array === 'undefined' || !getProto ? undefined : getProto(Uint8Array);

var INTRINSICS = {
	__proto__: null,
	'%AggregateError%': typeof AggregateError === 'undefined' ? undefined : AggregateError,
	'%Array%': Array,
	'%ArrayBuffer%': typeof ArrayBuffer === 'undefined' ? undefined : ArrayBuffer,
	'%ArrayIteratorPrototype%': hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined,
	'%AsyncFromSyncIteratorPrototype%': undefined,
	'%AsyncFunction%': needsEval,
	'%AsyncGenerator%': needsEval,
	'%AsyncGeneratorFunction%': needsEval,
	'%AsyncIteratorPrototype%': needsEval,
	'%Atomics%': typeof Atomics === 'undefined' ? undefined : Atomics,
	'%BigInt%': typeof BigInt === 'undefined' ? undefined : BigInt,
	'%BigInt64Array%': typeof BigInt64Array === 'undefined' ? undefined : BigInt64Array,
	'%BigUint64Array%': typeof BigUint64Array === 'undefined' ? undefined : BigUint64Array,
	'%Boolean%': Boolean,
	'%DataView%': typeof DataView === 'undefined' ? undefined : DataView,
	'%Date%': Date,
	'%decodeURI%': decodeURI,
	'%decodeURIComponent%': decodeURIComponent,
	'%encodeURI%': encodeURI,
	'%encodeURIComponent%': encodeURIComponent,
	'%Error%': $Error,
	'%eval%': eval, // eslint-disable-line no-eval
	'%EvalError%': $EvalError,
	'%Float16Array%': typeof Float16Array === 'undefined' ? undefined : Float16Array,
	'%Float32Array%': typeof Float32Array === 'undefined' ? undefined : Float32Array,
	'%Float64Array%': typeof Float64Array === 'undefined' ? undefined : Float64Array,
	'%FinalizationRegistry%': typeof FinalizationRegistry === 'undefined' ? undefined : FinalizationRegistry,
	'%Function%': $Function,
	'%GeneratorFunction%': needsEval,
	'%Int8Array%': typeof Int8Array === 'undefined' ? undefined : Int8Array,
	'%Int16Array%': typeof Int16Array === 'undefined' ? undefined : Int16Array,
	'%Int32Array%': typeof Int32Array === 'undefined' ? undefined : Int32Array,
	'%isFinite%': isFinite,
	'%isNaN%': isNaN,
	'%IteratorPrototype%': hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined,
	'%JSON%': typeof JSON === 'object' ? JSON : undefined,
	'%Map%': typeof Map === 'undefined' ? undefined : Map,
	'%MapIteratorPrototype%': typeof Map === 'undefined' || !hasSymbols || !getProto ? undefined : getProto(new Map()[Symbol.iterator]()),
	'%Math%': Math,
	'%Number%': Number,
	'%Object%': $Object,
	'%Object.getOwnPropertyDescriptor%': $gOPD,
	'%parseFloat%': parseFloat,
	'%parseInt%': parseInt,
	'%Promise%': typeof Promise === 'undefined' ? undefined : Promise,
	'%Proxy%': typeof Proxy === 'undefined' ? undefined : Proxy,
	'%RangeError%': $RangeError,
	'%ReferenceError%': $ReferenceError,
	'%Reflect%': typeof Reflect === 'undefined' ? undefined : Reflect,
	'%RegExp%': RegExp,
	'%Set%': typeof Set === 'undefined' ? undefined : Set,
	'%SetIteratorPrototype%': typeof Set === 'undefined' || !hasSymbols || !getProto ? undefined : getProto(new Set()[Symbol.iterator]()),
	'%SharedArrayBuffer%': typeof SharedArrayBuffer === 'undefined' ? undefined : SharedArrayBuffer,
	'%String%': String,
	'%StringIteratorPrototype%': hasSymbols && getProto ? getProto(''[Symbol.iterator]()) : undefined,
	'%Symbol%': hasSymbols ? Symbol : undefined,
	'%SyntaxError%': $SyntaxError,
	'%ThrowTypeError%': ThrowTypeError,
	'%TypedArray%': TypedArray,
	'%TypeError%': $TypeError,
	'%Uint8Array%': typeof Uint8Array === 'undefined' ? undefined : Uint8Array,
	'%Uint8ClampedArray%': typeof Uint8ClampedArray === 'undefined' ? undefined : Uint8ClampedArray,
	'%Uint16Array%': typeof Uint16Array === 'undefined' ? undefined : Uint16Array,
	'%Uint32Array%': typeof Uint32Array === 'undefined' ? undefined : Uint32Array,
	'%URIError%': $URIError,
	'%WeakMap%': typeof WeakMap === 'undefined' ? undefined : WeakMap,
	'%WeakRef%': typeof WeakRef === 'undefined' ? undefined : WeakRef,
	'%WeakSet%': typeof WeakSet === 'undefined' ? undefined : WeakSet,

	'%Function.prototype.call%': $call,
	'%Function.prototype.apply%': $apply,
	'%Object.defineProperty%': $defineProperty,
	'%Object.getPrototypeOf%': $ObjectGPO,
	'%Math.abs%': abs,
	'%Math.floor%': floor,
	'%Math.max%': max,
	'%Math.min%': min,
	'%Math.pow%': pow,
	'%Math.round%': round,
	'%Math.sign%': sign,
	'%Reflect.getPrototypeOf%': $ReflectGPO
};

if (getProto) {
	try {
		null.error; // eslint-disable-line no-unused-expressions
	} catch (e) {
		// https://github.com/tc39/proposal-shadowrealm/pull/384#issuecomment-1364264229
		var errorProto = getProto(getProto(e));
		INTRINSICS['%Error.prototype%'] = errorProto;
	}
}

var doEval = function doEval(name) {
	var value;
	if (name === '%AsyncFunction%') {
		value = getEvalledConstructor('async function () {}');
	} else if (name === '%GeneratorFunction%') {
		value = getEvalledConstructor('function* () {}');
	} else if (name === '%AsyncGeneratorFunction%') {
		value = getEvalledConstructor('async function* () {}');
	} else if (name === '%AsyncGenerator%') {
		var fn = doEval('%AsyncGeneratorFunction%');
		if (fn) {
			value = fn.prototype;
		}
	} else if (name === '%AsyncIteratorPrototype%') {
		var gen = doEval('%AsyncGenerator%');
		if (gen && getProto) {
			value = getProto(gen.prototype);
		}
	}

	INTRINSICS[name] = value;

	return value;
};

var LEGACY_ALIASES = {
	__proto__: null,
	'%ArrayBufferPrototype%': ['ArrayBuffer', 'prototype'],
	'%ArrayPrototype%': ['Array', 'prototype'],
	'%ArrayProto_entries%': ['Array', 'prototype', 'entries'],
	'%ArrayProto_forEach%': ['Array', 'prototype', 'forEach'],
	'%ArrayProto_keys%': ['Array', 'prototype', 'keys'],
	'%ArrayProto_values%': ['Array', 'prototype', 'values'],
	'%AsyncFunctionPrototype%': ['AsyncFunction', 'prototype'],
	'%AsyncGenerator%': ['AsyncGeneratorFunction', 'prototype'],
	'%AsyncGeneratorPrototype%': ['AsyncGeneratorFunction', 'prototype', 'prototype'],
	'%BooleanPrototype%': ['Boolean', 'prototype'],
	'%DataViewPrototype%': ['DataView', 'prototype'],
	'%DatePrototype%': ['Date', 'prototype'],
	'%ErrorPrototype%': ['Error', 'prototype'],
	'%EvalErrorPrototype%': ['EvalError', 'prototype'],
	'%Float32ArrayPrototype%': ['Float32Array', 'prototype'],
	'%Float64ArrayPrototype%': ['Float64Array', 'prototype'],
	'%FunctionPrototype%': ['Function', 'prototype'],
	'%Generator%': ['GeneratorFunction', 'prototype'],
	'%GeneratorPrototype%': ['GeneratorFunction', 'prototype', 'prototype'],
	'%Int8ArrayPrototype%': ['Int8Array', 'prototype'],
	'%Int16ArrayPrototype%': ['Int16Array', 'prototype'],
	'%Int32ArrayPrototype%': ['Int32Array', 'prototype'],
	'%JSONParse%': ['JSON', 'parse'],
	'%JSONStringify%': ['JSON', 'stringify'],
	'%MapPrototype%': ['Map', 'prototype'],
	'%NumberPrototype%': ['Number', 'prototype'],
	'%ObjectPrototype%': ['Object', 'prototype'],
	'%ObjProto_toString%': ['Object', 'prototype', 'toString'],
	'%ObjProto_valueOf%': ['Object', 'prototype', 'valueOf'],
	'%PromisePrototype%': ['Promise', 'prototype'],
	'%PromiseProto_then%': ['Promise', 'prototype', 'then'],
	'%Promise_all%': ['Promise', 'all'],
	'%Promise_reject%': ['Promise', 'reject'],
	'%Promise_resolve%': ['Promise', 'resolve'],
	'%RangeErrorPrototype%': ['RangeError', 'prototype'],
	'%ReferenceErrorPrototype%': ['ReferenceError', 'prototype'],
	'%RegExpPrototype%': ['RegExp', 'prototype'],
	'%SetPrototype%': ['Set', 'prototype'],
	'%SharedArrayBufferPrototype%': ['SharedArrayBuffer', 'prototype'],
	'%StringPrototype%': ['String', 'prototype'],
	'%SymbolPrototype%': ['Symbol', 'prototype'],
	'%SyntaxErrorPrototype%': ['SyntaxError', 'prototype'],
	'%TypedArrayPrototype%': ['TypedArray', 'prototype'],
	'%TypeErrorPrototype%': ['TypeError', 'prototype'],
	'%Uint8ArrayPrototype%': ['Uint8Array', 'prototype'],
	'%Uint8ClampedArrayPrototype%': ['Uint8ClampedArray', 'prototype'],
	'%Uint16ArrayPrototype%': ['Uint16Array', 'prototype'],
	'%Uint32ArrayPrototype%': ['Uint32Array', 'prototype'],
	'%URIErrorPrototype%': ['URIError', 'prototype'],
	'%WeakMapPrototype%': ['WeakMap', 'prototype'],
	'%WeakSetPrototype%': ['WeakSet', 'prototype']
};

var bind = __webpack_require__(/*! function-bind */ "./node_modules/function-bind/index.js");
var hasOwn = __webpack_require__(/*! hasown */ "./node_modules/hasown/index.js");
var $concat = bind.call($call, Array.prototype.concat);
var $spliceApply = bind.call($apply, Array.prototype.splice);
var $replace = bind.call($call, String.prototype.replace);
var $strSlice = bind.call($call, String.prototype.slice);
var $exec = bind.call($call, RegExp.prototype.exec);

/* adapted from https://github.com/lodash/lodash/blob/4.17.15/dist/lodash.js#L6735-L6744 */
var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
var reEscapeChar = /\\(\\)?/g; /** Used to match backslashes in property paths. */
var stringToPath = function stringToPath(string) {
	var first = $strSlice(string, 0, 1);
	var last = $strSlice(string, -1);
	if (first === '%' && last !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected closing `%`');
	} else if (last === '%' && first !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected opening `%`');
	}
	var result = [];
	$replace(string, rePropName, function (match, number, quote, subString) {
		result[result.length] = quote ? $replace(subString, reEscapeChar, '$1') : number || match;
	});
	return result;
};
/* end adaptation */

var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
	var intrinsicName = name;
	var alias;
	if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
		alias = LEGACY_ALIASES[intrinsicName];
		intrinsicName = '%' + alias[0] + '%';
	}

	if (hasOwn(INTRINSICS, intrinsicName)) {
		var value = INTRINSICS[intrinsicName];
		if (value === needsEval) {
			value = doEval(intrinsicName);
		}
		if (typeof value === 'undefined' && !allowMissing) {
			throw new $TypeError('intrinsic ' + name + ' exists, but is not available. Please file an issue!');
		}

		return {
			alias: alias,
			name: intrinsicName,
			value: value
		};
	}

	throw new $SyntaxError('intrinsic ' + name + ' does not exist!');
};

module.exports = function GetIntrinsic(name, allowMissing) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new $TypeError('intrinsic name must be a non-empty string');
	}
	if (arguments.length > 1 && typeof allowMissing !== 'boolean') {
		throw new $TypeError('"allowMissing" argument must be a boolean');
	}

	if ($exec(/^%?[^%]*%?$/, name) === null) {
		throw new $SyntaxError('`%` may not be present anywhere but at the beginning and end of the intrinsic name');
	}
	var parts = stringToPath(name);
	var intrinsicBaseName = parts.length > 0 ? parts[0] : '';

	var intrinsic = getBaseIntrinsic('%' + intrinsicBaseName + '%', allowMissing);
	var intrinsicRealName = intrinsic.name;
	var value = intrinsic.value;
	var skipFurtherCaching = false;

	var alias = intrinsic.alias;
	if (alias) {
		intrinsicBaseName = alias[0];
		$spliceApply(parts, $concat([0, 1], alias));
	}

	for (var i = 1, isOwn = true; i < parts.length; i += 1) {
		var part = parts[i];
		var first = $strSlice(part, 0, 1);
		var last = $strSlice(part, -1);
		if (
			(
				(first === '"' || first === "'" || first === '`')
				|| (last === '"' || last === "'" || last === '`')
			)
			&& first !== last
		) {
			throw new $SyntaxError('property names with quotes must have matching quotes');
		}
		if (part === 'constructor' || !isOwn) {
			skipFurtherCaching = true;
		}

		intrinsicBaseName += '.' + part;
		intrinsicRealName = '%' + intrinsicBaseName + '%';

		if (hasOwn(INTRINSICS, intrinsicRealName)) {
			value = INTRINSICS[intrinsicRealName];
		} else if (value != null) {
			if (!(part in value)) {
				if (!allowMissing) {
					throw new $TypeError('base intrinsic for ' + name + ' exists, but the property is not available.');
				}
				return void undefined;
			}
			if ($gOPD && (i + 1) >= parts.length) {
				var desc = $gOPD(value, part);
				isOwn = !!desc;

				// By convention, when a data property is converted to an accessor
				// property to emulate a data property that does not suffer from
				// the override mistake, that accessor's getter is marked with
				// an `originalValue` property. Here, when we detect this, we
				// uphold the illusion by pretending to see that original data
				// property, i.e., returning the value rather than the getter
				// itself.
				if (isOwn && 'get' in desc && !('originalValue' in desc.get)) {
					value = desc.get;
				} else {
					value = value[part];
				}
			} else {
				isOwn = hasOwn(value, part);
				value = value[part];
			}

			if (isOwn && !skipFurtherCaching) {
				INTRINSICS[intrinsicRealName] = value;
			}
		}
	}
	return value;
};


/***/ },

/***/ "./node_modules/get-proto/Object.getPrototypeOf.js"
/*!*********************************************************!*\
  !*** ./node_modules/get-proto/Object.getPrototypeOf.js ***!
  \*********************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var $Object = __webpack_require__(/*! es-object-atoms */ "./node_modules/es-object-atoms/index.js");

/** @type {import('./Object.getPrototypeOf')} */
module.exports = $Object.getPrototypeOf || null;


/***/ },

/***/ "./node_modules/get-proto/Reflect.getPrototypeOf.js"
/*!**********************************************************!*\
  !*** ./node_modules/get-proto/Reflect.getPrototypeOf.js ***!
  \**********************************************************/
(module) {

"use strict";


/** @type {import('./Reflect.getPrototypeOf')} */
module.exports = (typeof Reflect !== 'undefined' && Reflect.getPrototypeOf) || null;


/***/ },

/***/ "./node_modules/get-proto/index.js"
/*!*****************************************!*\
  !*** ./node_modules/get-proto/index.js ***!
  \*****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var reflectGetProto = __webpack_require__(/*! ./Reflect.getPrototypeOf */ "./node_modules/get-proto/Reflect.getPrototypeOf.js");
var originalGetProto = __webpack_require__(/*! ./Object.getPrototypeOf */ "./node_modules/get-proto/Object.getPrototypeOf.js");

var getDunderProto = __webpack_require__(/*! dunder-proto/get */ "./node_modules/dunder-proto/get.js");

/** @type {import('.')} */
module.exports = reflectGetProto
	? function getProto(O) {
		// @ts-expect-error TS can't narrow inside a closure, for some reason
		return reflectGetProto(O);
	}
	: originalGetProto
		? function getProto(O) {
			if (!O || (typeof O !== 'object' && typeof O !== 'function')) {
				throw new TypeError('getProto: not an object');
			}
			// @ts-expect-error TS can't narrow inside a closure, for some reason
			return originalGetProto(O);
		}
		: getDunderProto
			? function getProto(O) {
				// @ts-expect-error TS can't narrow inside a closure, for some reason
				return getDunderProto(O);
			}
			: null;


/***/ },

/***/ "./node_modules/gopd/gOPD.js"
/*!***********************************!*\
  !*** ./node_modules/gopd/gOPD.js ***!
  \***********************************/
(module) {

"use strict";


/** @type {import('./gOPD')} */
module.exports = Object.getOwnPropertyDescriptor;


/***/ },

/***/ "./node_modules/gopd/index.js"
/*!************************************!*\
  !*** ./node_modules/gopd/index.js ***!
  \************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


/** @type {import('.')} */
var $gOPD = __webpack_require__(/*! ./gOPD */ "./node_modules/gopd/gOPD.js");

if ($gOPD) {
	try {
		$gOPD([], 'length');
	} catch (e) {
		// IE 8 has a broken gOPD
		$gOPD = null;
	}
}

module.exports = $gOPD;


/***/ },

/***/ "./node_modules/has-property-descriptors/index.js"
/*!********************************************************!*\
  !*** ./node_modules/has-property-descriptors/index.js ***!
  \********************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var $defineProperty = __webpack_require__(/*! es-define-property */ "./node_modules/es-define-property/index.js");

var hasPropertyDescriptors = function hasPropertyDescriptors() {
	return !!$defineProperty;
};

hasPropertyDescriptors.hasArrayLengthDefineBug = function hasArrayLengthDefineBug() {
	// node v0.6 has a bug where array lengths can be Set but not Defined
	if (!$defineProperty) {
		return null;
	}
	try {
		return $defineProperty([], 'length', { value: 1 }).length !== 1;
	} catch (e) {
		// In Firefox 4-22, defining length on an array throws an exception.
		return true;
	}
};

module.exports = hasPropertyDescriptors;


/***/ },

/***/ "./node_modules/has-symbols/index.js"
/*!*******************************************!*\
  !*** ./node_modules/has-symbols/index.js ***!
  \*******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var origSymbol = typeof Symbol !== 'undefined' && Symbol;
var hasSymbolSham = __webpack_require__(/*! ./shams */ "./node_modules/has-symbols/shams.js");

/** @type {import('.')} */
module.exports = function hasNativeSymbols() {
	if (typeof origSymbol !== 'function') { return false; }
	if (typeof Symbol !== 'function') { return false; }
	if (typeof origSymbol('foo') !== 'symbol') { return false; }
	if (typeof Symbol('bar') !== 'symbol') { return false; }

	return hasSymbolSham();
};


/***/ },

/***/ "./node_modules/has-symbols/shams.js"
/*!*******************************************!*\
  !*** ./node_modules/has-symbols/shams.js ***!
  \*******************************************/
(module) {

"use strict";


/** @type {import('./shams')} */
/* eslint complexity: [2, 18], max-statements: [2, 33] */
module.exports = function hasSymbols() {
	if (typeof Symbol !== 'function' || typeof Object.getOwnPropertySymbols !== 'function') { return false; }
	if (typeof Symbol.iterator === 'symbol') { return true; }

	/** @type {{ [k in symbol]?: unknown }} */
	var obj = {};
	var sym = Symbol('test');
	var symObj = Object(sym);
	if (typeof sym === 'string') { return false; }

	if (Object.prototype.toString.call(sym) !== '[object Symbol]') { return false; }
	if (Object.prototype.toString.call(symObj) !== '[object Symbol]') { return false; }

	// temp disabled per https://github.com/ljharb/object.assign/issues/17
	// if (sym instanceof Symbol) { return false; }
	// temp disabled per https://github.com/WebReflection/get-own-property-symbols/issues/4
	// if (!(symObj instanceof Symbol)) { return false; }

	// if (typeof Symbol.prototype.toString !== 'function') { return false; }
	// if (String(sym) !== Symbol.prototype.toString.call(sym)) { return false; }

	var symVal = 42;
	obj[sym] = symVal;
	for (var _ in obj) { return false; } // eslint-disable-line no-restricted-syntax, no-unreachable-loop
	if (typeof Object.keys === 'function' && Object.keys(obj).length !== 0) { return false; }

	if (typeof Object.getOwnPropertyNames === 'function' && Object.getOwnPropertyNames(obj).length !== 0) { return false; }

	var syms = Object.getOwnPropertySymbols(obj);
	if (syms.length !== 1 || syms[0] !== sym) { return false; }

	if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) { return false; }

	if (typeof Object.getOwnPropertyDescriptor === 'function') {
		// eslint-disable-next-line no-extra-parens
		var descriptor = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(obj, sym));
		if (descriptor.value !== symVal || descriptor.enumerable !== true) { return false; }
	}

	return true;
};


/***/ },

/***/ "./node_modules/has-tostringtag/shams.js"
/*!***********************************************!*\
  !*** ./node_modules/has-tostringtag/shams.js ***!
  \***********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var hasSymbols = __webpack_require__(/*! has-symbols/shams */ "./node_modules/has-symbols/shams.js");

/** @type {import('.')} */
module.exports = function hasToStringTagShams() {
	return hasSymbols() && !!Symbol.toStringTag;
};


/***/ },

/***/ "./node_modules/hasown/index.js"
/*!**************************************!*\
  !*** ./node_modules/hasown/index.js ***!
  \**************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var call = Function.prototype.call;
var $hasOwn = Object.prototype.hasOwnProperty;
var bind = __webpack_require__(/*! function-bind */ "./node_modules/function-bind/index.js");

/** @type {import('.')} */
module.exports = bind.call(call, $hasOwn);


/***/ },

/***/ "./node_modules/inherits/inherits_browser.js"
/*!***************************************************!*\
  !*** ./node_modules/inherits/inherits_browser.js ***!
  \***************************************************/
(module) {

if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}


/***/ },

/***/ "./node_modules/is-arguments/index.js"
/*!********************************************!*\
  !*** ./node_modules/is-arguments/index.js ***!
  \********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var hasToStringTag = __webpack_require__(/*! has-tostringtag/shams */ "./node_modules/has-tostringtag/shams.js")();
var callBound = __webpack_require__(/*! call-bound */ "./node_modules/call-bound/index.js");

var $toString = callBound('Object.prototype.toString');

/** @type {import('.')} */
var isStandardArguments = function isArguments(value) {
	if (
		hasToStringTag
		&& value
		&& typeof value === 'object'
		&& Symbol.toStringTag in value
	) {
		return false;
	}
	return $toString(value) === '[object Arguments]';
};

/** @type {import('.')} */
var isLegacyArguments = function isArguments(value) {
	if (isStandardArguments(value)) {
		return true;
	}
	return value !== null
		&& typeof value === 'object'
		&& 'length' in value
		&& typeof value.length === 'number'
		&& value.length >= 0
		&& $toString(value) !== '[object Array]'
		&& 'callee' in value
		&& $toString(value.callee) === '[object Function]';
};

var supportsStandardArguments = (function () {
	return isStandardArguments(arguments);
}());

// @ts-expect-error TODO make this not error
isStandardArguments.isLegacyArguments = isLegacyArguments; // for tests

/** @type {import('.')} */
module.exports = supportsStandardArguments ? isStandardArguments : isLegacyArguments;


/***/ },

/***/ "./node_modules/is-callable/index.js"
/*!*******************************************!*\
  !*** ./node_modules/is-callable/index.js ***!
  \*******************************************/
(module) {

"use strict";


var fnToStr = Function.prototype.toString;
var reflectApply = typeof Reflect === 'object' && Reflect !== null && Reflect.apply;
var badArrayLike;
var isCallableMarker;
if (typeof reflectApply === 'function' && typeof Object.defineProperty === 'function') {
	try {
		badArrayLike = Object.defineProperty({}, 'length', {
			get: function () {
				throw isCallableMarker;
			}
		});
		isCallableMarker = {};
		// eslint-disable-next-line no-throw-literal
		reflectApply(function () { throw 42; }, null, badArrayLike);
	} catch (_) {
		if (_ !== isCallableMarker) {
			reflectApply = null;
		}
	}
} else {
	reflectApply = null;
}

var constructorRegex = /^\s*class\b/;
var isES6ClassFn = function isES6ClassFunction(value) {
	try {
		var fnStr = fnToStr.call(value);
		return constructorRegex.test(fnStr);
	} catch (e) {
		return false; // not a function
	}
};

var tryFunctionObject = function tryFunctionToStr(value) {
	try {
		if (isES6ClassFn(value)) { return false; }
		fnToStr.call(value);
		return true;
	} catch (e) {
		return false;
	}
};
var toStr = Object.prototype.toString;
var objectClass = '[object Object]';
var fnClass = '[object Function]';
var genClass = '[object GeneratorFunction]';
var ddaClass = '[object HTMLAllCollection]'; // IE 11
var ddaClass2 = '[object HTML document.all class]';
var ddaClass3 = '[object HTMLCollection]'; // IE 9-10
var hasToStringTag = typeof Symbol === 'function' && !!Symbol.toStringTag; // better: use `has-tostringtag`

var isIE68 = !(0 in [,]); // eslint-disable-line no-sparse-arrays, comma-spacing

var isDDA = function isDocumentDotAll() { return false; };
if (typeof document === 'object') {
	// Firefox 3 canonicalizes DDA to undefined when it's not accessed directly
	var all = document.all;
	if (toStr.call(all) === toStr.call(document.all)) {
		isDDA = function isDocumentDotAll(value) {
			/* globals document: false */
			// in IE 6-8, typeof document.all is "object" and it's truthy
			if ((isIE68 || !value) && (typeof value === 'undefined' || typeof value === 'object')) {
				try {
					var str = toStr.call(value);
					return (
						str === ddaClass
						|| str === ddaClass2
						|| str === ddaClass3 // opera 12.16
						|| str === objectClass // IE 6-8
					) && value('') == null; // eslint-disable-line eqeqeq
				} catch (e) { /**/ }
			}
			return false;
		};
	}
}

module.exports = reflectApply
	? function isCallable(value) {
		if (isDDA(value)) { return true; }
		if (!value) { return false; }
		if (typeof value !== 'function' && typeof value !== 'object') { return false; }
		try {
			reflectApply(value, null, badArrayLike);
		} catch (e) {
			if (e !== isCallableMarker) { return false; }
		}
		return !isES6ClassFn(value) && tryFunctionObject(value);
	}
	: function isCallable(value) {
		if (isDDA(value)) { return true; }
		if (!value) { return false; }
		if (typeof value !== 'function' && typeof value !== 'object') { return false; }
		if (hasToStringTag) { return tryFunctionObject(value); }
		if (isES6ClassFn(value)) { return false; }
		var strClass = toStr.call(value);
		if (strClass !== fnClass && strClass !== genClass && !(/^\[object HTML/).test(strClass)) { return false; }
		return tryFunctionObject(value);
	};


/***/ },

/***/ "./node_modules/is-generator-function/index.js"
/*!*****************************************************!*\
  !*** ./node_modules/is-generator-function/index.js ***!
  \*****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var callBound = __webpack_require__(/*! call-bound */ "./node_modules/call-bound/index.js");
var safeRegexTest = __webpack_require__(/*! safe-regex-test */ "./node_modules/safe-regex-test/index.js");
var isFnRegex = safeRegexTest(/^\s*(?:function)?\*/);
var hasToStringTag = __webpack_require__(/*! has-tostringtag/shams */ "./node_modules/has-tostringtag/shams.js")();
var getProto = __webpack_require__(/*! get-proto */ "./node_modules/get-proto/index.js");

var toStr = callBound('Object.prototype.toString');
var fnToStr = callBound('Function.prototype.toString');

var getGeneratorFunction = __webpack_require__(/*! generator-function */ "./node_modules/generator-function/index.js");

/** @type {import('.')} */
module.exports = function isGeneratorFunction(fn) {
	if (typeof fn !== 'function') {
		return false;
	}
	if (isFnRegex(fnToStr(fn))) {
		return true;
	}
	if (!hasToStringTag) {
		var str = toStr(fn);
		return str === '[object GeneratorFunction]';
	}
	if (!getProto) {
		return false;
	}
	var GeneratorFunction = getGeneratorFunction();
	return GeneratorFunction && getProto(fn) === GeneratorFunction.prototype;
};


/***/ },

/***/ "./node_modules/is-nan/implementation.js"
/*!***********************************************!*\
  !*** ./node_modules/is-nan/implementation.js ***!
  \***********************************************/
(module) {

"use strict";


/* http://www.ecma-international.org/ecma-262/6.0/#sec-number.isnan */

module.exports = function isNaN(value) {
	return value !== value;
};


/***/ },

/***/ "./node_modules/is-nan/index.js"
/*!**************************************!*\
  !*** ./node_modules/is-nan/index.js ***!
  \**************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var callBind = __webpack_require__(/*! call-bind */ "./node_modules/call-bind/index.js");
var define = __webpack_require__(/*! define-properties */ "./node_modules/define-properties/index.js");

var implementation = __webpack_require__(/*! ./implementation */ "./node_modules/is-nan/implementation.js");
var getPolyfill = __webpack_require__(/*! ./polyfill */ "./node_modules/is-nan/polyfill.js");
var shim = __webpack_require__(/*! ./shim */ "./node_modules/is-nan/shim.js");

var polyfill = callBind(getPolyfill(), Number);

/* http://www.ecma-international.org/ecma-262/6.0/#sec-number.isnan */

define(polyfill, {
	getPolyfill: getPolyfill,
	implementation: implementation,
	shim: shim
});

module.exports = polyfill;


/***/ },

/***/ "./node_modules/is-nan/polyfill.js"
/*!*****************************************!*\
  !*** ./node_modules/is-nan/polyfill.js ***!
  \*****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var implementation = __webpack_require__(/*! ./implementation */ "./node_modules/is-nan/implementation.js");

module.exports = function getPolyfill() {
	if (Number.isNaN && Number.isNaN(NaN) && !Number.isNaN('a')) {
		return Number.isNaN;
	}
	return implementation;
};


/***/ },

/***/ "./node_modules/is-nan/shim.js"
/*!*************************************!*\
  !*** ./node_modules/is-nan/shim.js ***!
  \*************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var define = __webpack_require__(/*! define-properties */ "./node_modules/define-properties/index.js");
var getPolyfill = __webpack_require__(/*! ./polyfill */ "./node_modules/is-nan/polyfill.js");

/* http://www.ecma-international.org/ecma-262/6.0/#sec-number.isnan */

module.exports = function shimNumberIsNaN() {
	var polyfill = getPolyfill();
	define(Number, { isNaN: polyfill }, {
		isNaN: function testIsNaN() {
			return Number.isNaN !== polyfill;
		}
	});
	return polyfill;
};


/***/ },

/***/ "./node_modules/is-regex/index.js"
/*!****************************************!*\
  !*** ./node_modules/is-regex/index.js ***!
  \****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var callBound = __webpack_require__(/*! call-bound */ "./node_modules/call-bound/index.js");
var hasToStringTag = __webpack_require__(/*! has-tostringtag/shams */ "./node_modules/has-tostringtag/shams.js")();
var hasOwn = __webpack_require__(/*! hasown */ "./node_modules/hasown/index.js");
var gOPD = __webpack_require__(/*! gopd */ "./node_modules/gopd/index.js");

/** @type {import('.')} */
var fn;

if (hasToStringTag) {
	/** @type {(receiver: ThisParameterType<typeof RegExp.prototype.exec>, ...args: Parameters<typeof RegExp.prototype.exec>) => ReturnType<typeof RegExp.prototype.exec>} */
	var $exec = callBound('RegExp.prototype.exec');
	/** @type {object} */
	var isRegexMarker = {};

	var throwRegexMarker = function () {
		throw isRegexMarker;
	};
	/** @type {{ toString(): never, valueOf(): never, [Symbol.toPrimitive]?(): never }} */
	var badStringifier = {
		toString: throwRegexMarker,
		valueOf: throwRegexMarker
	};

	if (typeof Symbol.toPrimitive === 'symbol') {
		badStringifier[Symbol.toPrimitive] = throwRegexMarker;
	}

	/** @type {import('.')} */
	// @ts-expect-error TS can't figure out that the $exec call always throws
	// eslint-disable-next-line consistent-return
	fn = function isRegex(value) {
		if (!value || typeof value !== 'object') {
			return false;
		}

		// eslint-disable-next-line no-extra-parens
		var descriptor = /** @type {NonNullable<typeof gOPD>} */ (gOPD)(/** @type {{ lastIndex?: unknown }} */ (value), 'lastIndex');
		var hasLastIndexDataProperty = descriptor && hasOwn(descriptor, 'value');
		if (!hasLastIndexDataProperty) {
			return false;
		}

		try {
			// eslint-disable-next-line no-extra-parens
			$exec(value, /** @type {string} */ (/** @type {unknown} */ (badStringifier)));
		} catch (e) {
			return e === isRegexMarker;
		}
	};
} else {
	/** @type {(receiver: ThisParameterType<typeof Object.prototype.toString>, ...args: Parameters<typeof Object.prototype.toString>) => ReturnType<typeof Object.prototype.toString>} */
	var $toString = callBound('Object.prototype.toString');
	/** @const @type {'[object RegExp]'} */
	var regexClass = '[object RegExp]';

	/** @type {import('.')} */
	fn = function isRegex(value) {
		// In older browsers, typeof regex incorrectly returns 'function'
		if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
			return false;
		}

		return $toString(value) === regexClass;
	};
}

module.exports = fn;


/***/ },

/***/ "./node_modules/is-typed-array/index.js"
/*!**********************************************!*\
  !*** ./node_modules/is-typed-array/index.js ***!
  \**********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var whichTypedArray = __webpack_require__(/*! which-typed-array */ "./node_modules/which-typed-array/index.js");

/** @type {import('.')} */
module.exports = function isTypedArray(value) {
	return !!whichTypedArray(value);
};


/***/ },

/***/ "./node_modules/math-intrinsics/abs.js"
/*!*********************************************!*\
  !*** ./node_modules/math-intrinsics/abs.js ***!
  \*********************************************/
(module) {

"use strict";


/** @type {import('./abs')} */
module.exports = Math.abs;


/***/ },

/***/ "./node_modules/math-intrinsics/floor.js"
/*!***********************************************!*\
  !*** ./node_modules/math-intrinsics/floor.js ***!
  \***********************************************/
(module) {

"use strict";


/** @type {import('./floor')} */
module.exports = Math.floor;


/***/ },

/***/ "./node_modules/math-intrinsics/isNaN.js"
/*!***********************************************!*\
  !*** ./node_modules/math-intrinsics/isNaN.js ***!
  \***********************************************/
(module) {

"use strict";


/** @type {import('./isNaN')} */
module.exports = Number.isNaN || function isNaN(a) {
	return a !== a;
};


/***/ },

/***/ "./node_modules/math-intrinsics/max.js"
/*!*********************************************!*\
  !*** ./node_modules/math-intrinsics/max.js ***!
  \*********************************************/
(module) {

"use strict";


/** @type {import('./max')} */
module.exports = Math.max;


/***/ },

/***/ "./node_modules/math-intrinsics/min.js"
/*!*********************************************!*\
  !*** ./node_modules/math-intrinsics/min.js ***!
  \*********************************************/
(module) {

"use strict";


/** @type {import('./min')} */
module.exports = Math.min;


/***/ },

/***/ "./node_modules/math-intrinsics/pow.js"
/*!*********************************************!*\
  !*** ./node_modules/math-intrinsics/pow.js ***!
  \*********************************************/
(module) {

"use strict";


/** @type {import('./pow')} */
module.exports = Math.pow;


/***/ },

/***/ "./node_modules/math-intrinsics/round.js"
/*!***********************************************!*\
  !*** ./node_modules/math-intrinsics/round.js ***!
  \***********************************************/
(module) {

"use strict";


/** @type {import('./round')} */
module.exports = Math.round;


/***/ },

/***/ "./node_modules/math-intrinsics/sign.js"
/*!**********************************************!*\
  !*** ./node_modules/math-intrinsics/sign.js ***!
  \**********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var $isNaN = __webpack_require__(/*! ./isNaN */ "./node_modules/math-intrinsics/isNaN.js");

/** @type {import('./sign')} */
module.exports = function sign(number) {
	if ($isNaN(number) || number === 0) {
		return number;
	}
	return number < 0 ? -1 : +1;
};


/***/ },

/***/ "./node_modules/ms/index.js"
/*!**********************************!*\
  !*** ./node_modules/ms/index.js ***!
  \**********************************/
(module) {

/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var w = d * 7;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function (val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isFinite(val)) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (msAbs >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (msAbs >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (msAbs >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, msAbs, n, name) {
  var isPlural = msAbs >= n * 1.5;
  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
}


/***/ },

/***/ "./node_modules/object-is/implementation.js"
/*!**************************************************!*\
  !*** ./node_modules/object-is/implementation.js ***!
  \**************************************************/
(module) {

"use strict";


var numberIsNaN = function (value) {
	return value !== value;
};

module.exports = function is(a, b) {
	if (a === 0 && b === 0) {
		return 1 / a === 1 / b;
	}
	if (a === b) {
		return true;
	}
	if (numberIsNaN(a) && numberIsNaN(b)) {
		return true;
	}
	return false;
};



/***/ },

/***/ "./node_modules/object-is/index.js"
/*!*****************************************!*\
  !*** ./node_modules/object-is/index.js ***!
  \*****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var define = __webpack_require__(/*! define-properties */ "./node_modules/define-properties/index.js");
var callBind = __webpack_require__(/*! call-bind */ "./node_modules/call-bind/index.js");

var implementation = __webpack_require__(/*! ./implementation */ "./node_modules/object-is/implementation.js");
var getPolyfill = __webpack_require__(/*! ./polyfill */ "./node_modules/object-is/polyfill.js");
var shim = __webpack_require__(/*! ./shim */ "./node_modules/object-is/shim.js");

var polyfill = callBind(getPolyfill(), Object);

define(polyfill, {
	getPolyfill: getPolyfill,
	implementation: implementation,
	shim: shim
});

module.exports = polyfill;


/***/ },

/***/ "./node_modules/object-is/polyfill.js"
/*!********************************************!*\
  !*** ./node_modules/object-is/polyfill.js ***!
  \********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var implementation = __webpack_require__(/*! ./implementation */ "./node_modules/object-is/implementation.js");

module.exports = function getPolyfill() {
	return typeof Object.is === 'function' ? Object.is : implementation;
};


/***/ },

/***/ "./node_modules/object-is/shim.js"
/*!****************************************!*\
  !*** ./node_modules/object-is/shim.js ***!
  \****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var getPolyfill = __webpack_require__(/*! ./polyfill */ "./node_modules/object-is/polyfill.js");
var define = __webpack_require__(/*! define-properties */ "./node_modules/define-properties/index.js");

module.exports = function shimObjectIs() {
	var polyfill = getPolyfill();
	define(Object, { is: polyfill }, {
		is: function testObjectIs() {
			return Object.is !== polyfill;
		}
	});
	return polyfill;
};


/***/ },

/***/ "./node_modules/object-keys/implementation.js"
/*!****************************************************!*\
  !*** ./node_modules/object-keys/implementation.js ***!
  \****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var keysShim;
if (!Object.keys) {
	// modified from https://github.com/es-shims/es5-shim
	var has = Object.prototype.hasOwnProperty;
	var toStr = Object.prototype.toString;
	var isArgs = __webpack_require__(/*! ./isArguments */ "./node_modules/object-keys/isArguments.js"); // eslint-disable-line global-require
	var isEnumerable = Object.prototype.propertyIsEnumerable;
	var hasDontEnumBug = !isEnumerable.call({ toString: null }, 'toString');
	var hasProtoEnumBug = isEnumerable.call(function () {}, 'prototype');
	var dontEnums = [
		'toString',
		'toLocaleString',
		'valueOf',
		'hasOwnProperty',
		'isPrototypeOf',
		'propertyIsEnumerable',
		'constructor'
	];
	var equalsConstructorPrototype = function (o) {
		var ctor = o.constructor;
		return ctor && ctor.prototype === o;
	};
	var excludedKeys = {
		$applicationCache: true,
		$console: true,
		$external: true,
		$frame: true,
		$frameElement: true,
		$frames: true,
		$innerHeight: true,
		$innerWidth: true,
		$onmozfullscreenchange: true,
		$onmozfullscreenerror: true,
		$outerHeight: true,
		$outerWidth: true,
		$pageXOffset: true,
		$pageYOffset: true,
		$parent: true,
		$scrollLeft: true,
		$scrollTop: true,
		$scrollX: true,
		$scrollY: true,
		$self: true,
		$webkitIndexedDB: true,
		$webkitStorageInfo: true,
		$window: true
	};
	var hasAutomationEqualityBug = (function () {
		/* global window */
		if (typeof window === 'undefined') { return false; }
		for (var k in window) {
			try {
				if (!excludedKeys['$' + k] && has.call(window, k) && window[k] !== null && typeof window[k] === 'object') {
					try {
						equalsConstructorPrototype(window[k]);
					} catch (e) {
						return true;
					}
				}
			} catch (e) {
				return true;
			}
		}
		return false;
	}());
	var equalsConstructorPrototypeIfNotBuggy = function (o) {
		/* global window */
		if (typeof window === 'undefined' || !hasAutomationEqualityBug) {
			return equalsConstructorPrototype(o);
		}
		try {
			return equalsConstructorPrototype(o);
		} catch (e) {
			return false;
		}
	};

	keysShim = function keys(object) {
		var isObject = object !== null && typeof object === 'object';
		var isFunction = toStr.call(object) === '[object Function]';
		var isArguments = isArgs(object);
		var isString = isObject && toStr.call(object) === '[object String]';
		var theKeys = [];

		if (!isObject && !isFunction && !isArguments) {
			throw new TypeError('Object.keys called on a non-object');
		}

		var skipProto = hasProtoEnumBug && isFunction;
		if (isString && object.length > 0 && !has.call(object, 0)) {
			for (var i = 0; i < object.length; ++i) {
				theKeys.push(String(i));
			}
		}

		if (isArguments && object.length > 0) {
			for (var j = 0; j < object.length; ++j) {
				theKeys.push(String(j));
			}
		} else {
			for (var name in object) {
				if (!(skipProto && name === 'prototype') && has.call(object, name)) {
					theKeys.push(String(name));
				}
			}
		}

		if (hasDontEnumBug) {
			var skipConstructor = equalsConstructorPrototypeIfNotBuggy(object);

			for (var k = 0; k < dontEnums.length; ++k) {
				if (!(skipConstructor && dontEnums[k] === 'constructor') && has.call(object, dontEnums[k])) {
					theKeys.push(dontEnums[k]);
				}
			}
		}
		return theKeys;
	};
}
module.exports = keysShim;


/***/ },

/***/ "./node_modules/object-keys/index.js"
/*!*******************************************!*\
  !*** ./node_modules/object-keys/index.js ***!
  \*******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var slice = Array.prototype.slice;
var isArgs = __webpack_require__(/*! ./isArguments */ "./node_modules/object-keys/isArguments.js");

var origKeys = Object.keys;
var keysShim = origKeys ? function keys(o) { return origKeys(o); } : __webpack_require__(/*! ./implementation */ "./node_modules/object-keys/implementation.js");

var originalKeys = Object.keys;

keysShim.shim = function shimObjectKeys() {
	if (Object.keys) {
		var keysWorksWithArguments = (function () {
			// Safari 5.0 bug
			var args = Object.keys(arguments);
			return args && args.length === arguments.length;
		}(1, 2));
		if (!keysWorksWithArguments) {
			Object.keys = function keys(object) { // eslint-disable-line func-name-matching
				if (isArgs(object)) {
					return originalKeys(slice.call(object));
				}
				return originalKeys(object);
			};
		}
	} else {
		Object.keys = keysShim;
	}
	return Object.keys || keysShim;
};

module.exports = keysShim;


/***/ },

/***/ "./node_modules/object-keys/isArguments.js"
/*!*************************************************!*\
  !*** ./node_modules/object-keys/isArguments.js ***!
  \*************************************************/
(module) {

"use strict";


var toStr = Object.prototype.toString;

module.exports = function isArguments(value) {
	var str = toStr.call(value);
	var isArgs = str === '[object Arguments]';
	if (!isArgs) {
		isArgs = str !== '[object Array]' &&
			value !== null &&
			typeof value === 'object' &&
			typeof value.length === 'number' &&
			value.length >= 0 &&
			toStr.call(value.callee) === '[object Function]';
	}
	return isArgs;
};


/***/ },

/***/ "./node_modules/object.assign/implementation.js"
/*!******************************************************!*\
  !*** ./node_modules/object.assign/implementation.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


// modified from https://github.com/es-shims/es6-shim
var objectKeys = __webpack_require__(/*! object-keys */ "./node_modules/object-keys/index.js");
var hasSymbols = __webpack_require__(/*! has-symbols/shams */ "./node_modules/has-symbols/shams.js")();
var callBound = __webpack_require__(/*! call-bound */ "./node_modules/call-bound/index.js");
var $Object = __webpack_require__(/*! es-object-atoms */ "./node_modules/es-object-atoms/index.js");
var $push = callBound('Array.prototype.push');
var $propIsEnumerable = callBound('Object.prototype.propertyIsEnumerable');
var originalGetSymbols = hasSymbols ? $Object.getOwnPropertySymbols : null;

// eslint-disable-next-line no-unused-vars
module.exports = function assign(target, source1) {
	if (target == null) { throw new TypeError('target must be an object'); }
	var to = $Object(target); // step 1
	if (arguments.length === 1) {
		return to; // step 2
	}
	for (var s = 1; s < arguments.length; ++s) {
		var from = $Object(arguments[s]); // step 3.a.i

		// step 3.a.ii:
		var keys = objectKeys(from);
		var getSymbols = hasSymbols && ($Object.getOwnPropertySymbols || originalGetSymbols);
		if (getSymbols) {
			var syms = getSymbols(from);
			for (var j = 0; j < syms.length; ++j) {
				var key = syms[j];
				if ($propIsEnumerable(from, key)) {
					$push(keys, key);
				}
			}
		}

		// step 3.a.iii:
		for (var i = 0; i < keys.length; ++i) {
			var nextKey = keys[i];
			if ($propIsEnumerable(from, nextKey)) { // step 3.a.iii.2
				var propValue = from[nextKey]; // step 3.a.iii.2.a
				to[nextKey] = propValue; // step 3.a.iii.2.b
			}
		}
	}

	return to; // step 4
};


/***/ },

/***/ "./node_modules/object.assign/polyfill.js"
/*!************************************************!*\
  !*** ./node_modules/object.assign/polyfill.js ***!
  \************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var implementation = __webpack_require__(/*! ./implementation */ "./node_modules/object.assign/implementation.js");

var lacksProperEnumerationOrder = function () {
	if (!Object.assign) {
		return false;
	}
	/*
	 * v8, specifically in node 4.x, has a bug with incorrect property enumeration order
	 * note: this does not detect the bug unless there's 20 characters
	 */
	var str = 'abcdefghijklmnopqrst';
	var letters = str.split('');
	var map = {};
	for (var i = 0; i < letters.length; ++i) {
		map[letters[i]] = letters[i];
	}
	var obj = Object.assign({}, map);
	var actual = '';
	for (var k in obj) {
		actual += k;
	}
	return str !== actual;
};

var assignHasPendingExceptions = function () {
	if (!Object.assign || !Object.preventExtensions) {
		return false;
	}
	/*
	 * Firefox 37 still has "pending exception" logic in its Object.assign implementation,
	 * which is 72% slower than our shim, and Firefox 40's native implementation.
	 */
	var thrower = Object.preventExtensions({ 1: 2 });
	try {
		Object.assign(thrower, 'xy');
	} catch (e) {
		return thrower[1] === 'y';
	}
	return false;
};

module.exports = function getPolyfill() {
	if (!Object.assign) {
		return implementation;
	}
	if (lacksProperEnumerationOrder()) {
		return implementation;
	}
	if (assignHasPendingExceptions()) {
		return implementation;
	}
	return Object.assign;
};


/***/ },

/***/ "./node_modules/possible-typed-array-names/index.js"
/*!**********************************************************!*\
  !*** ./node_modules/possible-typed-array-names/index.js ***!
  \**********************************************************/
(module) {

"use strict";


/** @type {import('.')} */
module.exports = [
	'Float16Array',
	'Float32Array',
	'Float64Array',
	'Int8Array',
	'Int16Array',
	'Int32Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Uint16Array',
	'Uint32Array',
	'BigInt64Array',
	'BigUint64Array'
];


/***/ },

/***/ "./node_modules/process/browser.js"
/*!*****************************************!*\
  !*** ./node_modules/process/browser.js ***!
  \*****************************************/
(module) {

// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };


/***/ },

/***/ "./node_modules/pryv/src/Auth/AuthController.js"
/*!******************************************************!*\
  !*** ./node_modules/pryv/src/Auth/AuthController.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const utils = __webpack_require__(/*! ../utils */ "./node_modules/pryv/src/utils.js");
const AuthStates = __webpack_require__(/*! ./AuthStates */ "./node_modules/pryv/src/Auth/AuthStates.js");
const Messages = __webpack_require__(/*! ./LoginMessages */ "./node_modules/pryv/src/Auth/LoginMessages.js");

/**
 * Controller for authentication flow
 * @memberof pryv.Auth
 */
class AuthController {
  /**
   * Create an AuthController
   * @param {AuthSettings} settings - Authentication settings
   * @param {Service} service - Pryv service instance
   * @param {CustomLoginButton} loginButton - Login button implementation
   */
  constructor (settings, service, loginButton) {
    this.settings = settings;
    validateSettings.call(this, settings);

    this.stateChangeListeners = [];
    if (this.settings.onStateChange) {
      this.stateChangeListeners.push(this.settings.onStateChange);
    }
    this.service = service;

    // probably remove
    this.languageCode = this.settings.authRequest.languageCode || 'en';
    this.messages = Messages(this.languageCode);

    this.loginButton = loginButton;

    function validateSettings (settings) {
      if (!settings) { throw new Error('settings cannot be null'); }
      // -- settings
      if (!settings.authRequest) { throw new Error('Missing settings.authRequest'); }

      // -- Extract returnURL
      settings.authRequest.returnURL =
        this.getReturnURL(settings.authRequest.returnURL);

      if (!settings.authRequest.requestingAppId) {
        throw new Error('Missing settings.authRequest.requestingAppId');
      }
      if (!settings.authRequest.requestedPermissions) {
        throw new Error('Missing settings.authRequest.requestedPermissions');
      }
    }
  }

  /**
   * Initialize the auth controller. Call this right after instantiation.
   * @returns {Promise<Service>} Promise resolving to the Service instance
   */
  async init () {
    this.serviceInfo = this.service.infoSync();
    this.state = { status: AuthStates.LOADING };
    this.assets = await loadAssets(this);

    const loginButton = this.loginButton;
    // initialize human interaction interface
    if (loginButton != null) {
      this.stateChangeListeners.push(loginButton.onStateChange.bind(loginButton));
      // autologin needs cookies/storage implemented in human interaction interface
      await checkAutoLogin(this);
    }

    // if auto login is not prompted
    if (this.state.status !== AuthStates.AUTHORIZED) {
      this.state = { status: AuthStates.INITIALIZED, serviceInfo: this.serviceInfo };
    }

    if (loginButton != null && loginButton.finishAuthProcessAfterRedirection != null) {
      // @ts-ignore - this is a valid AuthController
      await loginButton.finishAuthProcessAfterRedirection(this);
    }

    return this.service;
  }

  /**
   * Stops poll for auth request
   */
  stopAuthRequest (msg) {
    this.state = { status: AuthStates.ERROR, message: msg };
  }

  /**
   * Handle button click - triggers appropriate action based on current state
   * @returns {Promise<void>}
   */
  async handleClick () {
    if (isAuthorized.call(this)) {
      this.state = { status: AuthStates.SIGNOUT };
    } else if (isInitialized.call(this)) {
      this.startAuthRequest();
    } else if (isNeedSignIn.call(this)) {
      // reopen popup (HACK for now: set to private property to avoid self-assignment)
      this.state = this._state;
    } else {
      console.log('Unhandled action in "handleClick()" for status:', this.state.status);
    }

    function isAuthorized () {
      return this.state.status === AuthStates.AUTHORIZED;
    }
    function isInitialized () {
      return this.state.status === AuthStates.INITIALIZED;
    }
    function isNeedSignIn () {
      return this.state.status === AuthStates.NEED_SIGNIN;
    }
  }

  /**
   * Compute the return URL for authentication redirect.
   * Used only in browser environments.
   * @param {string} [returnURL] - The return URL setting ('auto#', 'self#', or custom URL)
   * @param {string} [windowLocationForTest] - Mock window.location.href for testing
   * @param {string|Navigator} [navigatorForTests] - Mock navigator for testing
   * @returns {string|boolean} The computed return URL, or false if using popup mode
   */
  getReturnURL (
    returnURL,
    windowLocationForTest,
    navigatorForTests
  ) {
    const RETURN_URL_AUTO = 'auto';

    returnURL = returnURL || RETURN_URL_AUTO + '#';

    // check the trailer
    const trailer = returnURL.slice(-1);
    if ('#&?'.indexOf(trailer) < 0) {
      throw new Error('Pryv access: Last character of --returnURL setting-- is not ' +
        '"?", "&" or "#": ' + returnURL);
    }
    // auto mode for desktop
    if (returnUrlIsAuto(returnURL) &&
        !utils.browserIsMobileOrTablet(navigatorForTests)) {
      return false;
    // auto mode for mobile or self
    } else if ((returnUrlIsAuto(returnURL) &&
                utils.browserIsMobileOrTablet(navigatorForTests)) ||
               returnURL.indexOf('self') === 0) {
      // set self as return url?
      // eventually clean-up current url from previous pryv returnURL
      const locationHref = windowLocationForTest || window.location.href;
      returnURL = locationHref + returnURL.substring(4);
    }
    return utils.cleanURLFromPrYvParams(returnURL);

    function returnUrlIsAuto (returnURL) {
      return returnURL.indexOf(RETURN_URL_AUTO) === 0;
    }
  }

  /**
   * Start the authentication request and polling process
   * @returns {Promise<void>}
   * @see https://pryv.github.io/reference/#auth-request
   */
  async startAuthRequest () {
    // @ts-ignore - postAccess uses .call(this) for context
    this.state = await postAccess.call(this);

    await doPolling.call(this);

    /** @this {AuthController} */
    async function postAccess () {
      try {
        const { response, body } = await utils.fetchPost(
          // @ts-ignore - this is bound via .call()
          this.serviceInfo.access,
          // @ts-ignore - this is bound via .call()
          this.settings.authRequest
        );
        if (!response.ok) {
          throw new Error('Access request failed: ' + JSON.stringify(body));
        }
        return body;
      } catch (e) {
        this.state = {
          status: AuthStates.ERROR,
          message: 'Requesting access',
          error: e
        };
        throw e; // forward error
      }
    }

    /** @this {AuthController} */
    async function doPolling () {
      // @ts-ignore - this is bound via .call()
      if (this.state?.status !== AuthStates.NEED_SIGNIN) {
        return;
      }
      // @ts-ignore - this is bound via .call()
      const pollResponse = await pollAccess(this.state?.poll);

      if (pollResponse.status === AuthStates.NEED_SIGNIN) {
        // @ts-ignore - this is bound via .call()
        setTimeout(await doPolling.bind(this), this.state?.poll_rate_ms);
      } else {
        this.state = pollResponse;
      }

      async function pollAccess (pollUrl) {
        try {
          const { response, body } = await utils.fetchGet(pollUrl);
          if (response.status === 403 && body?.status === 'REFUSED') {
            return { status: AuthStates.INITIALIZED };
          }
          return body;
        } catch (e) {
          return { status: AuthStates.ERROR, message: 'Error while polling for auth request', error: e };
        }
      }
    }
  }

  // -------------- state listeners ---------------------
  set state (newState) {
    // retro-compatibility for lib-js < 2.0.9
    newState.id = newState.status;

    this._state = newState;

    this.stateChangeListeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (e) {
        console.log('Error during set state ()', e);
      }
    });
  }

  get state () {
    return this._state;
  }
}

// ----------- private methods -------------

async function checkAutoLogin (authController) {
  const loginButton = authController.loginButton;
  if (loginButton == null) {
    return;
  }

  const storedCredentials = await loginButton.getAuthorizationData();
  if (storedCredentials != null) {
    authController.state = Object.assign({}, { status: AuthStates.AUTHORIZED }, storedCredentials);
  }
}

// ------------------ ACTIONS  ----------- //

async function loadAssets (authController) {
  let loadedAssets = {};
  try {
    loadedAssets = await authController.service.assets();
    if (typeof location !== 'undefined') {
      await loadedAssets.loginButtonLoadCSS();
      const thisMessages = await loadedAssets.loginButtonGetMessages();
      if (thisMessages.LOADING) {
        authController.messages = Messages(authController.languageCode, thisMessages);
      } else {
        console.log('WARNING Messages cannot be loaded using defaults: ', thisMessages);
      }
    }
  } catch (e) {
    authController.state = {
      status: AuthStates.ERROR,
      message: 'Cannot fetch button visuals',
      error: e
    };
    throw e; // forward error
  }
  return loadedAssets;
}

module.exports = AuthController;


/***/ },

/***/ "./node_modules/pryv/src/Auth/AuthStates.js"
/*!**************************************************!*\
  !*** ./node_modules/pryv/src/Auth/AuthStates.js ***!
  \**************************************************/
(module) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
/**
 * The possible auth states:
 * ERROR, LOADING, INITIALIZED, NEED_SIGNIN, AUTHORIZED, SIGNOUT, REFUSED
 * @readonly
 * @enum {string}
 * @memberof pryv.Browser
 */
module.exports = {
  ERROR: 'ERROR',
  LOADING: 'LOADING',
  INITIALIZED: 'INITIALIZED',
  NEED_SIGNIN: 'NEED_SIGNIN',
  AUTHORIZED: 'ACCEPTED',
  SIGNOUT: 'SIGNOUT',
  REFUSED: 'REFUSED'
};


/***/ },

/***/ "./node_modules/pryv/src/Auth/LoginMessages.js"
/*!*****************************************************!*\
  !*** ./node_modules/pryv/src/Auth/LoginMessages.js ***!
  \*****************************************************/
(module) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
module.exports = get;

const Messages = {
  LOADING: {
    en: '...'
  },
  ERROR: {
    en: 'Error',
    fr: 'Erreur'
  },
  LOGIN: {
    en: 'Signin',
    fr: 'Login'
  },
  SIGNOUT_CONFIRM: {
    en: 'Logout?',
    fr: 'Se déconnecter ?'
  }
};

function get (languageCode, definitions) {
  const myMessages = definitions || Messages;
  const res = {};
  Object.keys(myMessages).forEach((key) => {
    res[key] = myMessages[key][languageCode] || myMessages[key].en;
  });
  return res;
}


/***/ },

/***/ "./node_modules/pryv/src/Auth/index.js"
/*!*********************************************!*\
  !*** ./node_modules/pryv/src/Auth/index.js ***!
  \*********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const AuthController = __webpack_require__(/*! ./AuthController */ "./node_modules/pryv/src/Auth/AuthController.js");
const AuthStates = __webpack_require__(/*! ./AuthStates */ "./node_modules/pryv/src/Auth/AuthStates.js");
const LoginButton = __webpack_require__(/*! ../Browser/LoginButton */ "./node_modules/pryv/src/Browser/LoginButton.js");
const Service = __webpack_require__(/*! ../Service */ "./node_modules/pryv/src/Service.js");

/**
 * @memberof pryv
 * @namespace pryv.Auth
 */
module.exports = {
  setupAuth,
  AuthStates,
  AuthController
};

/**
 * Start an authentication process
 *
 * @memberof pryv.Auth
 * @param {Object} settings
 * @param {Object} settings.authRequest See https://api.pryv.com/reference/#data-structure-access
 * @param {string} [settings.authRequest.languageCode] Language code, as per LoginButton Messages: 'en', 'fr
 * @param {string} settings.authRequest.requestingAppId Application id, ex: 'my-app'
 * @param {Object} settings.authRequest.requestedPermissions
 * @param {string | boolean} settings.authRequest.returnURL : false, // set this if you don't want a popup
 * @param {string} [settings.authRequest.referer] To track registration source
 * @param {string} settings.spanButtonID set and <span> id in DOM to insert default login button or null for custom
 * @param {Function} settings.onStateChange
 * @param {string} [settings.returnURL] Set to "self#" to disable popup and force using the same page
 * @param {string} serviceInfoUrl
 * @param {Object} [serviceCustomizations] override properties of serviceInfoUrl
 * @returns {Promise<Service>}
 */
async function setupAuth (settings, serviceInfoUrl, serviceCustomizations, HumanInteraction = LoginButton) {
  const service = new Service(serviceInfoUrl, serviceCustomizations);
  await service.info();

  const humanInteraction = new HumanInteraction(settings, service);
  await humanInteraction.init();

  return service;
}


/***/ },

/***/ "./node_modules/pryv/src/Browser/CookieUtils.js"
/*!******************************************************!*\
  !*** ./node_modules/pryv/src/Browser/CookieUtils.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */

const utils = __webpack_require__(/*! ../utils */ "./node_modules/pryv/src/utils.js");

/**
 * @memberof pryv.Browser
 * @namespace pryv.Browser.CookieUtils
 */
module.exports = {
  get,
  set,
  del
};

/**
  * Set a local cookie
  * @memberof pryv.Browser.CookieUtils
  * @template T
  * @param {string} cookieKey - The key for the cookie
  * @param {T} value - The value (will be JSON stringified)
  * @param {number} [expireInDays=365] - Expiration date in days from now
  */
function set (cookieKey, value, expireInDays) {
  if (!utils.isBrowser()) return;
  expireInDays = expireInDays || 365;
  const myDate = new Date();
  const hostName = window.location.hostname;
  const path = window.location.pathname;
  myDate.setDate(myDate.getDate() + expireInDays);
  let cookieStr = encodeURIComponent(cookieKey) + '=' +
    encodeURIComponent(JSON.stringify(value)) +
    ';expires=' + myDate.toUTCString() +
    ';domain=.' + hostName + ';path=' + path;
  // do not add SameSite when removing a cookie
  if (expireInDays >= 0) cookieStr += ';SameSite=Strict';
  document.cookie = cookieStr;
}

/**
 * Return the value of a local cookie
 * @memberof pryv.Browser.CookieUtils
 * @template T
 * @param {string} cookieKey - The key
 * @returns {T|undefined} The parsed cookie value or undefined if not found
 */
function get (cookieKey) {
  const name = encodeURIComponent(cookieKey);
  if (!utils.isBrowser()) return;
  const value = '; ' + document.cookie;
  const parts = value.split('; ' + name + '=');
  if (parts.length === 2) return JSON.parse(decodeURIComponent(parts.pop().split(';').shift()));
}

/**
 * Delete a local cookie
 * @memberof pryv.Browser.CookieUtils
 * @param {string} cookieKey - The key
 */
function del (cookieKey) {
  set(cookieKey, { deleted: true }, -1);
}


/***/ },

/***/ "./node_modules/pryv/src/Browser/LoginButton.js"
/*!******************************************************!*\
  !*** ./node_modules/pryv/src/Browser/LoginButton.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const Cookies = __webpack_require__(/*! ./CookieUtils */ "./node_modules/pryv/src/Browser/CookieUtils.js");
const AuthStates = __webpack_require__(/*! ../Auth/AuthStates */ "./node_modules/pryv/src/Auth/AuthStates.js");
const AuthController = __webpack_require__(/*! ../Auth/AuthController */ "./node_modules/pryv/src/Auth/AuthController.js");
const Messages = __webpack_require__(/*! ../Auth/LoginMessages */ "./node_modules/pryv/src/Auth/LoginMessages.js");
const utils = __webpack_require__(/*! ../utils */ "./node_modules/pryv/src/utils.js");

/* global location, confirm */

/**
 * @memberof pryv.Browser
 */
class LoginButton {
  constructor (authSettings, service) {
    this.authSettings = authSettings;
    this.service = service;
    this.serviceInfo = service.infoSync();
  }

  /**
   * setup button and load assets
   */
  async init () {
    // initialize button visuals
    setupButton(this);
    this.languageCode = this.authSettings.authRequest.languageCode || 'en';
    this.messages = Messages(this.languageCode);
    // @ts-ignore - loginButtonText is set by setupButton
    if (this.loginButtonText) {
      await loadAssets(this);
    }
    // set cookie key for authorization data
    this._cookieKey = 'pryv-libjs-' + this.authSettings.authRequest.requestingAppId;

    // initialize controller
    this.auth = new AuthController(this.authSettings, this.service, this);
    await this.auth.init();

    return this.service;
  }

  onClick () {
    this.auth.handleClick();
  }

  async onStateChange (state) {
    switch (state.status) {
      case AuthStates.LOADING:
        this.text = getLoadingMessage(this);
        break;
      case AuthStates.INITIALIZED:
        this.text = getInitializedMessage(this, this.serviceInfo.name);
        break;
      case AuthStates.NEED_SIGNIN: {
        const loginUrl = state.authUrl || state.url; // url is deprecated
        if (this.authSettings.authRequest.returnURL) { // open on same page (no Popup)
          location.href = loginUrl;
          return;
        } else {
          startLoginScreen(this, loginUrl);
        }
        break;
      }
      case AuthStates.AUTHORIZED:
        this.text = state.username;
        this.saveAuthorizationData({
          apiEndpoint: state.apiEndpoint,
          username: state.username
        });
        break;
      case AuthStates.SIGNOUT: {
        const message = this.messages.SIGNOUT_CONFIRM ? this.messages.SIGNOUT_CONFIRM : 'Logout ?';
        if (confirm(message)) {
          this.deleteAuthorizationData();
          this.auth.init();
        }
        break;
      }
      case AuthStates.ERROR:
        this.text = getErrorMessage(this, state.message);
        break;
      default:
        console.log('WARNING Unhandled state for Login: ' + state.status);
    }
    // @ts-ignore - loginButtonText is set by setupButton
    if (this.loginButtonText) {
      // @ts-ignore
      this.loginButtonText.innerHTML = this.text;
    }
  }

  getAuthorizationData () {
    return Cookies.get(this._cookieKey);
  }

  saveAuthorizationData (authData) {
    Cookies.set(this._cookieKey, authData);
  }

  async deleteAuthorizationData () {
    Cookies.del(this._cookieKey);
  }

  /**
   * not mandatory to implement as non-browsers don't have this behaviour
   * @param {*} authController
   */
  async finishAuthProcessAfterRedirection (authController) {
    // this step should be applied only for the browser
    if (!utils.isBrowser()) return;

    // 3. Check if there is a prYvkey as result of "out of page login"
    const url = window.location.href;
    const pollUrl = retrievePollUrl(url);
    if (pollUrl !== null) {
      try {
        const { body } = await utils.fetchGet(pollUrl);
        authController.state = body;
      } catch (e) {
        authController.state = {
          status: AuthStates.ERROR,
          message: 'Cannot fetch result',
          error: e
        };
      }
    }

    function retrievePollUrl (url) {
      const params = utils.getQueryParamsFromURL(url);
      let pollUrl = null;
      if (params.prYvkey) { // deprecated method - To be removed
        pollUrl = authController.serviceInfo.access + params.prYvkey;
      }
      if (params.prYvpoll) {
        pollUrl = params.prYvpoll;
      }
      return pollUrl;
    }
  }
}

module.exports = LoginButton;

async function startLoginScreen (loginButton, authUrl) {
  const screenX = typeof window.screenX !== 'undefined' ? window.screenX : window.screenLeft;
  const screenY = typeof window.screenY !== 'undefined' ? window.screenY : window.screenTop;
  const outerWidth = typeof window.outerWidth !== 'undefined' ? window.outerWidth : document.body.clientWidth;
  const outerHeight = typeof window.outerHeight !== 'undefined' ? window.outerHeight : (document.body.clientHeight - 22);
  const width = 400;
  const height = 620;
  const left = Math.floor(screenX + ((outerWidth - width) / 2));
  const top = Math.floor(screenY + ((outerHeight - height) / 2.5));
  const features = (
    'width=' + width +
    ',height=' + height +
    ',left=' + left +
    ',top=' + top +
    ',scrollbars=yes'
  );
  loginButton.popup = window.open(authUrl, 'prYv Sign-in', features);

  if (!loginButton.popup) {
    // loginButton.auth.stopAuthRequest('FAILED_TO_OPEN_WINDOW');
    console.log('Pop-up blocked. A second click should allow it.');
  } else if (window.focus) {
    loginButton.popup.focus();
  }
}

function setupButton (loginBtn) {
  loginBtn.loginButtonSpan = document.getElementById(loginBtn.authSettings.spanButtonID);

  if (!loginBtn.loginButtonSpan) {
    console.log('WARNING: pryv.Browser initialized with no spanButtonID');
  } else {
    // up to the time the button is loaded use the Span to display eventual
    // error messages
    loginBtn.loginButtonText = loginBtn.loginButtonSpan;

    // bind actions dynamically to the button click
    loginBtn.loginButtonSpan.addEventListener('click', loginBtn.onClick.bind(loginBtn));
  }
}

/**
 * Loads the style from the service info
 */
async function loadAssets (loginBtn) {
  const assets = await loginBtn.service.assets();
  loginBtn.loginButtonSpan.innerHTML = await assets.loginButtonGetHTML();
  loginBtn.loginButtonText = document.getElementById('pryv-access-btn-text');
}

function getErrorMessage (loginButton, message) {
  return loginButton.messages.ERROR + ': ' + message;
}

function getLoadingMessage (loginButton) {
  return loginButton.messages.LOADING;
}

function getInitializedMessage (loginButton, serviceName) {
  return loginButton.messages.LOGIN + ': ' + serviceName;
}


/***/ },

/***/ "./node_modules/pryv/src/Browser/index.js"
/*!************************************************!*\
  !*** ./node_modules/pryv/src/Browser/index.js ***!
  \************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const LoginButton = __webpack_require__(/*! ./LoginButton */ "./node_modules/pryv/src/Browser/LoginButton.js");
const CookieUtils = __webpack_require__(/*! ./CookieUtils */ "./node_modules/pryv/src/Browser/CookieUtils.js");
const utils = __webpack_require__(/*! ../utils */ "./node_modules/pryv/src/utils.js");

/**
 * @memberof pryv
 * @namespace pryv.Browser
 */
module.exports = {
  LoginButton,
  CookieUtils,
  // retro-compatibility for lib-js < 2.0.9
  AuthStates: __webpack_require__(/*! ../Auth/AuthStates */ "./node_modules/pryv/src/Auth/AuthStates.js"),
  setupAuth: (__webpack_require__(/*! ../Auth */ "./node_modules/pryv/src/Auth/index.js").setupAuth),
  serviceInfoFromUrl: getServiceInfoFromURL
};

/**
 * Util to grab parameters from url query string
 * @param {*} url
 */
function getServiceInfoFromURL (url) {
  const queryParams = utils.getQueryParamsFromURL(url || window.location.href);
  return queryParams.pryvServiceInfoUrl;
}


/***/ },

/***/ "./node_modules/pryv/src/Connection.js"
/*!*********************************************!*\
  !*** ./node_modules/pryv/src/Connection.js ***!
  \*********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const utils = __webpack_require__(/*! ./utils.js */ "./node_modules/pryv/src/utils.js");
const jsonParser = __webpack_require__(/*! ./lib/json-parser */ "./node_modules/pryv/src/lib/json-parser.js");
const libGetEventStreamed = __webpack_require__(/*! ./lib/getEventStreamed */ "./node_modules/pryv/src/lib/getEventStreamed.js");
const PryvError = __webpack_require__(/*! ./lib/PryvError */ "./node_modules/pryv/src/lib/PryvError.js");

/**
 * @class Connection
 * A connection is an authenticated link to a Pryv.io account.
 *
 * @type {TokenAndEndpoint}
 *
 * @example
 * create a connection for the user 'tom' on 'pryv.me' backend with the token 'TTZycvBTiq'
 * const conn = new pryv.Connection('https://TTZycvBTiq@tom.pryv.me');
 *
 * @property {string} [token]
 * @property {string} endpoint
 * @memberof pryv
 *
 * @constructor
 * @this {Connection}
 * @param {APIEndpoint} apiEndpoint
 * @param {pryv.Service} [service] - eventually initialize Connection with a Service
 */
class Connection {
  constructor (apiEndpoint, service) {
    const { token, endpoint } = utils.extractTokenAndAPIEndpoint(apiEndpoint);
    this.token = token;
    this.endpoint = endpoint;
    this.options = {};
    this.options.chunkSize = 1000;
    this._deltaTime = { value: 0, weight: 0 };
    if (service && !(service instanceof Service)) {
      throw new Error('Invalid service param');
    }
    this._service = service;
  }

  /**
   * get pryv.Service object relative to this connection
   * @readonly
   * @property {pryv.Service} service
   */
  get service () {
    if (this._service) return this._service;
    this._service = new Service(this.endpoint + 'service/info');
    return this._service;
  }

  /**
   * Get username for this connection.
   * It's async as it's constructed from access info.
   * @returns {Promise<string>} Promise resolving to the username
   */
  async username () {
    const accessInfo = await this.accessInfo();
    if (accessInfo.error) {
      throw new PryvError(
        'Failed fetching accessinfo: ' + accessInfo.error.message,
        accessInfo.error
      );
    }
    // @ts-ignore - username is always a string
    return accessInfo.user.username;
  }

  /**
   * Get access info for this connection.
   * It's async as it is fetched from the API.
   * @returns {Promise<AccessInfo>} Promise resolving to the access info
   */
  async accessInfo () {
    return this.get('access-info', null);
  }

  /**
   * Issue a Batch call https://api.pryv.com/reference/#call-batch .
   * arrayOfAPICalls will be splited in multiple calls if the size is > `conn.options.chunkSize` .
   * Default chunksize is 1000.
   * @param {Array.<MethodCall>} arrayOfAPICalls Array of Method Calls
   * @param {Function} [progress] Return percentage of progress (0 - 100);
   * @returns {Promise<Array>} Promise to Array of results matching each method call in order
   */
  async api (arrayOfAPICalls, progress) {
    function httpHandler (batchCall) {
      return this.post('', batchCall);
    }
    return await this._chunkedBatchCall(
      arrayOfAPICalls,
      progress,
      httpHandler.bind(this)
    );
  }

  /**
   * Make one API call
   * @param {string} method - Method ID (e.g., 'events.get', 'streams.create')
   * @param {Object|Array} [params={}] - The params associated with this method
   * @param {string} [expectedKey] - If given, returns the value of this key or throws an error if not present
   * @returns {Promise<Object>} Promise resolving to the API result or the value of expectedKey
   * @throws {Error} If .error is present in the response or expectedKey is missing
   */
  async apiOne (method, params = {}, expectedKey) {
    const result = await this.api([{ method, params }]);
    if (
      result[0] == null ||
      result[0].error ||
      (expectedKey != null && result[0][expectedKey] == null)
    ) {
      const innerObject = result[0]?.error || result;
      throw new PryvError(
        `Error for api method: "${method}" with params: ${JSON.stringify(
          params
        )} >> Result: ${JSON.stringify(innerObject)}"`,
        innerObject
      );
    }
    if (expectedKey != null) return result[0][expectedKey];
    return result[0];
  }

  /**
   * Revoke : Delete the accessId
   * - Do not throw error if access is already revoked, just return null;
   * @param {boolean} [throwOnFail=true] - if set to false do not throw Error on failure
   * @param {Connection} [usingConnection] - specify which connection issues the revoke, might be necessary when selfRevoke
   * @returns {Promise<Object|null>} Promise resolving to deletion result or null if already revoked/failed
   */
  async revoke (throwOnFail = true, usingConnection) {
    usingConnection = usingConnection || this;
    let accessInfo = null;
    // get accessId
    try {
      accessInfo = await this.accessInfo();
    } catch (e) {
      if (e.response?.body?.error?.id === 'invalid-access-token') {
        return null; // Already revoked OK..
      }
      if (throwOnFail) throw e;
      return null;
    }
    // delete access
    try {
      const result = usingConnection.apiOne('accesses.delete', {
        id: accessInfo.id
      });
      return result;
    } catch (e) {
      if (throwOnFail) throw e;
      return null;
    }
  }

  /**
   * @private
   */
  async _chunkedBatchCall (arrayOfAPICalls, progress, callHandler) {
    if (!Array.isArray(arrayOfAPICalls)) {
      throw new Error('Connection.api() takes an array as input');
    }

    const res = [];
    let percent = 0;
    for (
      let cursor = 0;
      arrayOfAPICalls.length >= cursor;
      cursor += this.options.chunkSize
    ) {
      const thisBatch = [];
      const cursorMax = Math.min(
        cursor + this.options.chunkSize,
        arrayOfAPICalls.length
      );
      // copy only method and params into a back call to be exuted
      for (let i = cursor; i < cursorMax; i++) {
        thisBatch.push({
          method: arrayOfAPICalls[i].method,
          params: arrayOfAPICalls[i].params
        });
      }
      const resRequest = await callHandler(thisBatch);
      // result checks
      if (!resRequest || !Array.isArray(resRequest.results)) {
        throw new Error(
          'API call result is not an Array: ' + JSON.stringify(resRequest)
        );
      }
      if (resRequest.results.length !== thisBatch.length) {
        throw new Error(
          'API call result Array does not match request: ' +
            JSON.stringify(resRequest)
        );
      }

      // eventually call handleResult
      for (let i = 0; i < resRequest.results.length; i++) {
        if (arrayOfAPICalls[i + cursor].handleResult) {
          await arrayOfAPICalls[i + cursor].handleResult.call(
            null,
            resRequest.results[i],
            thisBatch[i] // request
          );
        }
      }
      Array.prototype.push.apply(res, resRequest.results);
      percent = Math.round((100 * res.length) / arrayOfAPICalls.length);
      if (progress) {
        progress(percent, res);
      }
    }
    return res;
  }

  /**
   * Post to API and return results
   * @param {string} path - API path
   * @param {(Array | Object)} data - Data to post
   * @returns {Promise<Object|Object[]>} Promise to result.body
   */
  async post (path, data) {
    const now = getTimestamp();
    const res = await this._postFetch(path, data);
    this._handleMeta(res.body, now);
    return res.body;
  }

  /**
   * @private
   * Post object as JSON to API
   * @param {string} path - API path
   * @param {Array | Object} data - Data to post as JSON
   * @returns {Promise<{response: Response, body: Object|Object[]}>} Promise to response and body
   */
  async _postFetch (path, data) {
    return this._postFetchRaw(path, JSON.stringify(data), 'application/json');
  }

  /**
   * @private
   * Raw Post to API
   * @param {string} path - API path
   * @param {any} data - Raw data to post
   * @param {string} [contentType] - Content-Type header (optional, allows fetch to set it for FormData)
   * @returns {Promise<{response: Response, body: Object|Object[]}>} Promise to response and body
   */
  async _postFetchRaw (path, data, contentType) {
    const headers = {
      Authorization: this.token,
      Accept: 'application/json'
    };
    // optional for form-data llowing fetch to
    // automatically set multipart/form-data with the correct boundary
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    const response = await fetch(this.endpoint + path, {
      method: 'POST',
      headers,
      body: data
    });
    const body = await response.json();
    return { response, body };
  }

  /**
   * GET from API and return results
   * @param {string} path - API path
   * @param {Object} [queryParams] - Query parameters
   * @returns {Promise<Object|Object[]>} Promise to result.body
   */
  async get (path, queryParams) {
    const now = getTimestamp();
    const res = await this._getFetchRaw(path, queryParams);
    this._handleMeta(res.body, now);
    return res.body;
  }

  /**
   * @private
   * Raw GET from API
   * @param {string} path - API path
   * @param {Object} [queryParams={}] - Query parameters
   * @returns {Promise<{response: Response, body: Object|Object[]}>} Promise to response and body
   */
  async _getFetchRaw (path, queryParams = {}) {
    path = path || '';
    let queryStr = '';
    if (queryParams && Object.keys(queryParams).length > 0) {
      queryStr = '?' + new URLSearchParams(queryParams).toString();
    }
    const response = await fetch(this.endpoint + path + queryStr, {
      headers: {
        Authorization: this.token,
        Accept: 'application/json'
      }
    });
    const body = await response.json();
    return { response, body };
  }

  /**
   * Add data points to an HF (High Frequency) series event (flatJSON format)
   * @param {string} eventId - The HF event ID
   * @param {string[]} fields - Array of field names for the series
   * @param {Array<Array<number|string>>} points - Array of data points, each point is an array of values
   * @returns {Promise<HFSeriesAddResult>} Promise resolving to status response
   * @see https://api.pryv.com/reference/#add-hf-series-data-points
   */
  async addPointsToHFEvent (eventId, fields, points) {
    const res = await this.post('events/' + eventId + '/series', {
      format: 'flatJSON',
      fields,
      points
    });
    if (res.status !== 'ok') {
      throw new Error('Failed loading serie: ' + JSON.stringify(res.status));
    }
    return res;
  }

  /**
   * Streamed get Event.
   * @see https://api.pryv.com/reference/#get-events
   * @param {Object} queryParams See `events.get` parameters
   * @param {Function} forEachEvent Function taking one event as parameter. Will be called for each event
   * @returns {Promise<Object>} Promise to result.body transformed with `eventsCount: {count}` replacing `events: [...]`
   */
  async getEventsStreamed (queryParams, forEachEvent) {
    const myParser = jsonParser(forEachEvent, queryParams.includeDeletions);
    const res = await libGetEventStreamed(this, queryParams, myParser);
    const now = getTimestamp();
    this._handleMeta(res.body, now);
    return res.body;
  }

  /**
   * Create an event with attached file
   * NODE.jS ONLY
   * @param {Event} event
   * @param {string} filePath
   */
  async createEventWithFile (event, filePath) {
    const fs = __webpack_require__(/*! fs */ "?e606");
    const path = __webpack_require__(/*! path */ "?2070");

    if (!fs || !path) {
      throw new Error('createEventWithFile is only available in Node.js. Use createEventWithFormData in browser.');
    }

    const fileName = path.basename(filePath);
    const mimeType = getMimeType(path.extname(filePath));
    const fileBlob = await fs.openAsBlob(filePath, { type: mimeType });

    const formData = new FormData();
    formData.append('event', JSON.stringify(event));
    formData.append('file', fileBlob, fileName);

    const now = getTimestamp();
    const { body } = await this._postFetchRaw('events', formData);
    this._handleMeta(body, now);
    return body;
  }

  /**
   * Create an event from a Buffer
   * @param {Object} event
   * @param {Buffer|Blob} bufferData - Buffer for node, Blob for browser
   * @param {string} filename
   */
  async createEventWithFileFromBuffer (event, bufferData, filename) {
    const mimeType = getMimeType(getExtname(filename));
    const fileBlob = bufferData instanceof Blob
      ? bufferData
      // @ts-ignore - Buffer is valid for Blob in Node.js
      : new Blob([bufferData], { type: mimeType });

    const formData = new FormData();
    formData.append('file', fileBlob, filename);
    const body = await this.createEventWithFormData(event, formData);
    return body;
  }

  /**
   * Create an event with attached formData
   * !! BROWSER ONLY
   * @param {Event} event
   * @param {FormData} formData https://developer.mozilla.org/en-US/docs/Web/API/FormData/FormData
   */
  async createEventWithFormData (event, formData) {
    formData.append('event', JSON.stringify(event));
    const { body } = await this._postFetchRaw('events', formData);
    return body;
  }

  /**
   * Difference in seconds between the Pryv.io API and local time
   * deltaTime is refined at each (non-raw) API call
   * @readonly
   * @property {number} deltaTime
   */
  get deltaTime () {
    return this._deltaTime.value;
  }

  /**
   * API endpoint of this connection (includes token if present)
   * @readonly
   * @property {APIEndpoint} apiEndpoint
   */
  get apiEndpoint () {
    return utils.buildAPIEndpoint(this);
  }

  // private method that handle meta data parsing
  _handleMeta (res, requestLocalTimestamp) {
    if (!res.meta) throw new Error('Cannot find .meta in response.');
    if (!res.meta.serverTime) { throw new Error('Cannot find .meta.serverTime in response.'); }

    // update deltaTime and weight it
    this._deltaTime.value =
      (this._deltaTime.value * this._deltaTime.weight +
        res.meta.serverTime -
        requestLocalTimestamp) /
      ++this._deltaTime.weight;
  }
}

module.exports = Connection;

function getTimestamp () {
  return Date.now() / 1000;
}

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime'
};

function getMimeType (ext) {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

function getExtname (filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot) : '';
}

// service is require "after" to allow circular require
const Service = __webpack_require__(/*! ./Service */ "./node_modules/pryv/src/Service.js");

/**
 * API Method call, for batch call https://api.pryv.com/reference/#call-batch
 * @typedef {Object} MethodCall
 * @property {string} method - The method id
 * @property {(Object|Array)}  params - The call parameters as required by the method.
 * @property {(Function|Promise)} [handleResult] - Will be called with the result corresponding to this specific call.
 */


/***/ },

/***/ "./node_modules/pryv/src/Service.js"
/*!******************************************!*\
  !*** ./node_modules/pryv/src/Service.js ***!
  \******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const utils = __webpack_require__(/*! ./utils.js */ "./node_modules/pryv/src/utils.js");
// Connection is required at the end of this file to allow circular requires.
const Assets = __webpack_require__(/*! ./ServiceAssets.js */ "./node_modules/pryv/src/ServiceAssets.js");

/**
 * @class pryv.Service
 * A Pryv.io deployment is a unique "Service", as an example **Pryv Lab** is a service, deployed with the domain name **pryv.me**.
 *
 * `pryv.Service` exposes tools to interact with Pryv.io at a "Platform" level.
 *
 *  ##### Initizalization with a service info URL
```js
const service = new pryv.Service('https://reg.pryv.me/service/info');
```

- With the content of a serviceInfo configuration

Service information properties can be overriden with specific values. This might be usefull to test new designs on production platforms.

```js
const serviceInfoUrl = 'https://reg.pryv.me/service/info';
const serviceCustomizations = {
  name: 'Pryv Lab 2',
  assets: {
    definitions: 'https://pryv.github.io/assets-pryv.me/index.json'
  }
}
const service = new pryv.Service(serviceInfoUrl, serviceCustomizations);
```

 * @memberof pryv
 *
 * @constructor
 * @param {string} serviceInfoUrl Url point to /service/info of a Pryv platform see: {@link https://api.pryv.com/reference/#service-info}
 */
class Service {
  constructor (serviceInfoUrl, serviceCustomizations) {
    this._serviceInfo = null;
    this._assets = null;
    this._polling = false;
    this._serviceInfoUrl = serviceInfoUrl;
    this._pryvServiceCustomizations = serviceCustomizations;
  }

  /**
   * Return service info parameters info known of fetch it if needed.
   * Example
   *  - name of a platform
   *    `const serviceName = await service.info().name`
   * @see ServiceInfo For details on available properties.
   * @param {boolean} [forceFetch] If true, will force fetching service info.
   * @returns {Promise<ServiceInfo>} Promise to Service info Object
   */
  async info (forceFetch) {
    if (forceFetch || !this._serviceInfo) {
      let baseServiceInfo = {};
      if (this._serviceInfoUrl) {
        const { body } = await utils.fetchGet(this._serviceInfoUrl);
        baseServiceInfo = body;
      }
      Object.assign(baseServiceInfo, this._pryvServiceCustomizations);
      // @ts-ignore - baseServiceInfo is populated from body or customizations
      this.setServiceInfo(baseServiceInfo);
    }
    return this._serviceInfo;
  }

  /**
   * Check if a service supports High Frequency Data Sets
   * @returns {Promise<boolean>} Promise resolving to true if HF is supported
   */
  async supportsHF () {
    const infos = await this.info();
    return (infos.features == null || infos.features.noHF !== true);
  }

  /**
   * Check if a service has username in the hostname or in the path of the API.
   * @returns {Promise<boolean>} Promise resolving to true if the service does not rely on DNS to find a host related to a username
   */
  async isDnsLess () {
    const infos = await this.info();
    const hostname = infos.api.split('/')[2];
    return !hostname.includes('{username}');
  }

  /**
   * @private
   * @param {ServiceInfo} serviceInfo
   */
  setServiceInfo (serviceInfo) {
    if (!serviceInfo.name) {
      throw new Error('Invalid data from service/info');
    }
    // cleanup serviceInfo for eventual url not finishing by "/"
    // code will be obsolete with next version of register
    ['access', 'api', 'register'].forEach((key) => {
      if (serviceInfo[key].slice(-1) !== '/') {
        serviceInfo[key] += '/';
      }
    });
    this._serviceInfo = serviceInfo;
  }

  /**
   * Return assets property content
   * @param {boolean} [forceFetch] If true, will force fetching service info.
   * @returns {Promise<ServiceAssets|null>} Promise to ServiceAssets
   */
  async assets (forceFetch) {
    if (!forceFetch && this._assets) {
      return this._assets;
    } else {
      const serviceInfo = await this.info();
      if (!serviceInfo.assets || !serviceInfo.assets.definitions) {
        console.log('Warning: no assets for this service');
        return null;
      }
      this._assets = await Assets.setup(serviceInfo.assets.definitions);
      return this._assets;
    }
  }

  /**
   * Return service info parameters info known or null if not yet loaded
   * @returns {ServiceInfo} Service Info definition
   */
  infoSync () {
    return this._serviceInfo;
  }

  /**
   * Return an API endpoint from a username and token
   * @param {string} username - The username
   * @param {string} [token] - Optional authorization token
   * @returns {Promise<APIEndpoint>} Promise resolving to the API endpoint URL
   */
  async apiEndpointFor (username, token) {
    const serviceInfo = await this.info();
    return Service.buildAPIEndpoint(serviceInfo, username, token);
  }

  /**
   * Return an API endpoint from a username, token and ServiceInfo.
   * This method is rarely used. See **apiEndpointFor** as an alternative.
   * @param {ServiceInfo} serviceInfo - The service info object containing API URL template
   * @param {string} username - The username
   * @param {string} [token] - Optional authorization token
   * @returns {APIEndpoint} The constructed API endpoint URL
   */
  static buildAPIEndpoint (serviceInfo, username, token) {
    const endpoint = serviceInfo.api.replace('{username}', username);
    return utils.buildAPIEndpoint({ endpoint, token });
  }

  /**
   * Issue a "login call on the Service" return a Connection on success
   * **! Warning**: the token of the connection will be a "Personal" token that expires
   * @see https://api.pryv.com/reference-full/#login-user
   * @param {string} username
   * @param {string} password
   * @param {string} appId
   * @param {string} [originHeader=service-info.register] Only for Node.js. If not set will use the register value of service info. In browsers this will overridden by current page location.
   * @throws {Error} on invalid login
   */
  async login (username, password, appId, originHeader) {
    const apiEndpoint = await this.apiEndpointFor(username);

    const headers = {};
    originHeader = originHeader || (await this.info()).register;
    if (!utils.isBrowser()) {
      headers.Origin = originHeader;
    }
    const { response, body } = await utils.fetchPost(
      apiEndpoint + 'auth/login',
      { username, password, appId },
      headers
    );

    if (!response.ok) {
      if (body?.error?.message) {
        throw new Error(body.error.message);
      }
      throw new Error('Login failed: ' + JSON.stringify(body));
    }

    if (!body.token) {
      throw new Error('Invalid login response: ' + JSON.stringify(body));
    }
    return new Connection(
      Service.buildAPIEndpoint(await this.info(), username, body.token),
      this // Pre load Connection with service
    );
  }
}

module.exports = Service;

// Require is done after exports to allow circular references
const Connection = __webpack_require__(/*! ./Connection */ "./node_modules/pryv/src/Connection.js");

/**
 * Object to handle Pryv Service Informations https://api.pryv.com/reference/#service-info
 * @typedef {Object} ServiceInfo
 * @property {string} register The URL of the register service.
 * @property {string} access The URL of the access page.
 * @property {string} api The API endpoint format.
 * @property {string} name The platform name.
 * @property {string} home The URL of the platform's home page.
 * @property {string} support The email or URL of the support page.
 * @property {string} terms The terms and conditions, in plain text or the URL displaying them.
 * @property {string} eventTypes The URL of the list of validated event types.
 * @property {Object} [assets] Holder for service specific Assets (icons, css, ...)
 * @property {string} [assets.definitions] URL to json object with assets definitions
 * @property {Object} [features] Platform feature flags
 * @property {boolean} [features.noHF] True if HF data is not supported
 */


/***/ },

/***/ "./node_modules/pryv/src/ServiceAssets.js"
/*!************************************************!*\
  !*** ./node_modules/pryv/src/ServiceAssets.js ***!
  \************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const utils = __webpack_require__(/*! ./utils.js */ "./node_modules/pryv/src/utils.js");

/* global location */

/**
 * Holds Pryv Service informations.
 *
 * It's returned by `service.assets()`
 *
 * @memberof pryv
 **/
class ServiceAssets {
  /**
   * Private => use ServiceAssets.setup()
   * @param {Object} assets The content of service/info.assets properties.
   * @param {string} assetsURL Url point to assets of the service of a Pryv platform
   */
  constructor (assets, assetsURL) {
    this._assets = assets;
    this._assetsURL = assetsURL;
  }

  /**
   * Load Assets definition from URL
   * @param {string} pryvServiceAssetsSourceUrl - URL to the assets definition JSON
   * @returns {Promise<ServiceAssets>} Promise resolving to ServiceAssets instance
   */
  static async setup (pryvServiceAssetsSourceUrl) {
    const { body } = await utils.fetchGet(pryvServiceAssetsSourceUrl);
    return new ServiceAssets(body, pryvServiceAssetsSourceUrl);
  }

  /**
   * get a value from path separated by `:`
   * example of key `lib-js:buttonSignIn`
   * @param {string} [keyPath] if null, will return the all assets
   */
  get (keyPath) {
    let result = Object.assign({}, this._assets);
    if (keyPath) {
      keyPath.split(':').forEach((key) => {
        result = result[key];
        if (typeof result === 'undefined') return result;
      });
    }
    return result;
  }

  /**
   * get an Url from path separated by `:`
   * identical to doing assets.relativeURL(assets.get(keyPath))
   * example of key `lib-js:buttonSignIn`
   * @param {string} [keyPath] if null, will return the all assets
   */
  getUrl (keyPath) {
    const url = this.get(keyPath);
    if (typeof url !== 'string') {
      throw new Error(`Unexpected value for ${keyPath}: ${url}`);
    }
    return this.relativeURL(url);
  }

  /**
   * get relativeUrl
   */
  relativeURL (url) {
    return relPathToAbs(this._assets.baseUrl || this._assetsURL, url);
  }

  // ---------------- Default service resources

  /**
   * Set all defaults Favicon, CSS
   */
  async setAllDefaults () {
    this.setFavicon();
    await this.loadCSS();
  }

  /**
   * Set service Favicon to Web Page
   */
  setFavicon () {
    /** @type {HTMLLinkElement} */
    // @ts-ignore - querySelector returns Element but we know it's HTMLLinkElement
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = this.relativeURL(this._assets.favicon.default.url);
    document.getElementsByTagName('head')[0].appendChild(link);
  }

  /**
   * Set default service CSS
   */
  async loadCSS () {
    loadCSS(this.relativeURL(this._assets.css.default.url));
  }

  // ---- Login

  /**
   * Load CSS for Login button
   */
  async loginButtonLoadCSS () {
    loadCSS(this.relativeURL(this._assets['lib-js'].buttonSignIn.css));
  }

  /**
   * Get HTML for Login Button
   * @returns {Promise<string>} Promise resolving to HTML string
   */
  async loginButtonGetHTML () {
    const { text } = await utils.fetchGetText(this.relativeURL(this._assets['lib-js'].buttonSignIn.html));
    return text;
  }

  /**
   * Get Messages strings for Login Button
   * @returns {Promise<Object.<string, string>>} Promise resolving to messages object
   */
  async loginButtonGetMessages () {
    const { body } = await utils.fetchGet(this.relativeURL(this._assets['lib-js'].buttonSignIn.messages));
    return body;
  }
}

module.exports = ServiceAssets;

function loadCSS (url) {
  const head = document.getElementsByTagName('head')[0];
  const link = document.createElement('link');
  link.id = url;
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = url;
  link.media = 'all';
  head.appendChild(link);
}

/* HACK: disabling linting until code is cleaned up */
/* eslint-disable */

  /*\
  |*| Modified version of
  |*| :: translate relative paths to absolute paths ::
  |*|
  |*| https://developer.mozilla.org/en-US/docs/Web/API/document.cookie
  |*|
  |*| The following code is released under the GNU Public License, version 3 or later.
  |*| http://www.gnu.org/licenses/gpl-3.0-standalone.html
  |*|
  \*/

function relPathToAbs (baseUrlString, sRelPath) {
  /** @type {Location|HTMLAnchorElement} */
  var baseLocation = location;
  if (baseUrlString) {
    // @ts-ignore - HTMLAnchorElement has compatible URL properties
    baseLocation = document.createElement('a');
    baseLocation.href = baseUrlString;
  }

  var nUpLn, sDir = "", sPath = baseLocation.pathname.replace(/[^\/]*$/, sRelPath.replace(/(\/|^)(?:\.?\/+)+/g, "$1"));
  for (var nEnd, nStart = 0; nEnd = sPath.indexOf("/../", nStart), nEnd > -1; nStart = nEnd + nUpLn) {
    nUpLn = /^\/(?:\.\.\/)*/.exec(sPath.slice(nEnd))[0].length;
    sDir = (sDir + sPath.substring(nStart, nEnd)).replace(new RegExp("(?:\\\/+[^\\\/]*){0," + ((nUpLn - 1) / 3) + "}$"),
      "/");
  }
  const portStr = baseLocation.port ? ':' + baseLocation.port : '';
  return baseLocation.protocol + '//' + baseLocation.hostname + portStr + sDir + sPath.substr(nStart);
}


/***/ },

/***/ "./node_modules/pryv/src/index.js"
/*!****************************************!*\
  !*** ./node_modules/pryv/src/index.js ***!
  \****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
/**
 * `pryv` library
 * @exports pryv
 * @property {pryv.Service} Service - To interact with Pryv.io at a "Platform level"
 * @property {pryv.Connection} Connection - To interact with an individual's (user) data set
 * @property {pryv.Browser} Browser - Browser Tools - Access request helpers and visuals (button)
 * @property {pryv.utils} utils - Exposes some utils for HTTP calls and tools to manipulate Pryv's API endpoints
 * @property {pryv.PryvError} PryvError - Custom error class with innerObject support
 */
module.exports = {
  Service: __webpack_require__(/*! ./Service */ "./node_modules/pryv/src/Service.js"),
  Connection: __webpack_require__(/*! ./Connection */ "./node_modules/pryv/src/Connection.js"),
  Auth: __webpack_require__(/*! ./Auth */ "./node_modules/pryv/src/Auth/index.js"),
  Browser: __webpack_require__(/*! ./Browser */ "./node_modules/pryv/src/Browser/index.js"),
  utils: __webpack_require__(/*! ./utils */ "./node_modules/pryv/src/utils.js"),
  PryvError: __webpack_require__(/*! ./lib/PryvError */ "./node_modules/pryv/src/lib/PryvError.js"),
  version: (__webpack_require__(/*! ../package.json */ "./node_modules/pryv/package.json").version)
};


/***/ },

/***/ "./node_modules/pryv/src/lib/PryvError.js"
/*!************************************************!*\
  !*** ./node_modules/pryv/src/lib/PryvError.js ***!
  \************************************************/
(module) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */

/**
 * Custom error class for Pryv library errors.
 * Includes an innerObject property for wrapping underlying errors.
 * @extends Error
 */
class PryvError extends Error {
  /**
   * Create a PryvError
   * @param {string} message - Error message
   * @param {Error|Object} [innerObject] - The underlying error or object that caused this error
   */
  constructor (message, innerObject) {
    super(message);
    this.name = 'PryvError';
    /** @type {Error|Object|undefined} */
    this.innerObject = innerObject;

    // Maintains proper stack trace for where error was thrown (only in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PryvError);
    }
  }
}

module.exports = PryvError;


/***/ },

/***/ "./node_modules/pryv/src/lib/getEventStreamed.js"
/*!*******************************************************!*\
  !*** ./node_modules/pryv/src/lib/getEventStreamed.js ***!
  \*******************************************************/
(module) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
/* global fetch */

module.exports = getEventStreamed;

async function getEventStreamed (conn, queryParam, parser) {
  /**
   * Holds Parser's settings
   */
  const parserSettings = {
    ondata: null,
    onend: null,
    encoding: 'utf8'
  };

  /**
   * Mock Response
   */
  const fakeRes = {
    setEncoding: function (encoding) {
      parserSettings.encoding = encoding;
    }, // will receive 'data' and 'end' callbacks
    on: function (key, f) {
      parserSettings['on' + key] = f;
    }
  };

  /**
   * Holds results from the parser
   */
  let errResult;
  let bodyObjectResult;
  /**
   *
   */
  parser(fakeRes, function (err, bodyObject) {
    errResult = err;
    bodyObjectResult = bodyObject;
  });

  // ------------   fetch ------------------- //
  const url = new URL(conn.endpoint + 'events');
  url.search = new URLSearchParams(queryParam).toString();
  const fetchParams = { method: 'GET', headers: { Accept: 'application/json' } };
  if (conn.token) fetchParams.headers.Authorization = conn.token;

  const response = await fetch(url, fetchParams);
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    parserSettings.ondata(new TextDecoder(parserSettings.encoding).decode(value));
    if (done) { parserSettings.onend(); break; }
  }

  if (errResult) {
    throw new Error(errResult);
  }

  // We're done!
  const result = {
    text: fakeRes.text, // from the parser
    body: bodyObjectResult, // from the parser
    statusCode: response.status,
    headers: {}
  };
  // add headers to result
  // @ts-ignore - Headers.entries() exists in modern environments
  for (const pair of response.headers.entries()) {
    result.headers[pair[0]] = pair[1];
  }

  return result;
}


/***/ },

/***/ "./node_modules/pryv/src/lib/json-parser.js"
/*!**************************************************!*\
  !*** ./node_modules/pryv/src/lib/json-parser.js ***!
  \**************************************************/
(module) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
// there two steps 1 find events, then eventDeletions
const EVENTMARKERS = ['"events":[', '"eventDeletions":['];

/**
 * Stremed JSON parser for events
 */
module.exports = function (foreachEvent, includeDeletions) {
  let eventOrEventDeletions = 0; // start with event
  let buffer = ''; // temp data
  let body = null; // to be returned

  // IN EVENTS VARS
  let depth = 0; // level of depth in brackets
  let inString = false; // cursor is in a String
  let skipNextOne = false; // when a backslash is found
  let cursorPos = 0; // position of Character Cursor

  // counters
  let eventsCount = 0;
  let eventDeletionsCount = 0;

  const states = {
    A_BEFORE_EVENTS: 0,
    B_IN_EVENTS: 1,
    D_AFTER_EVENTS: 2
  };

  let state = states.A_BEFORE_EVENTS;

  function processBuffer () {
    switch (state) {
      case states.A_BEFORE_EVENTS:
        searchStartEvents();
        break;
      case states.B_IN_EVENTS:
        processEvents();
        break;
      default:
        afterEvents();
        break;
    }
  }

  function searchStartEvents () {
    // search for "events": and happend any info before to the body
    const n = buffer.indexOf(EVENTMARKERS[eventOrEventDeletions]);
    if (n > 0) {
      if (eventOrEventDeletions === 0) { // do only once
        body = buffer.substring(0, n);
      }
      buffer = buffer.substr(n + EVENTMARKERS[eventOrEventDeletions].length);
      state = states.B_IN_EVENTS;
      processEvents();
    }
  }

  function processEvents () {
    /// ---- in Event
    while (cursorPos < buffer.length && (state === states.B_IN_EVENTS)) {
      if (skipNextOne) { // ignore next character
        skipNextOne = false;
        cursorPos++;
        continue;
      }
      switch (buffer.charCodeAt(cursorPos)) {
        case 93: // ]
          if (depth === 0) { // end of events
            if (cursorPos !== 0) {
              throw new Error('Found trailling ] in mid-course');
            }
            if (eventOrEventDeletions === 0 && includeDeletions) {
              state = states.A_BEFORE_EVENTS;
              eventOrEventDeletions = 1; // now look for eventDeletions
              return;
            } else { // done
              state = states.D_AFTER_EVENTS;
              let eventsOrDeletionMsg = '';
              if (eventOrEventDeletions === 1) {
                eventsOrDeletionMsg = '"eventDeletionsCount":' + eventDeletionsCount + ',';
              }
              buffer = eventsOrDeletionMsg + '"eventsCount":' + eventsCount + '' + buffer.substr(1);
            }
          }
          break;
        case 92: // \
          skipNextOne = true;
          break;
        case 123: // {
          if (!inString) depth++;
          break;
        case 34: // "
          inString = !inString;
          break;
        case 125: // }
          if (!inString) depth--;
          if (depth === 0) {
            // ignore possible coma ',' if first char
            const ignoreComa = (buffer.charCodeAt(0) === 44) ? 1 : 0;
            const eventStr = buffer.substring(ignoreComa, cursorPos + 1);

            if (eventOrEventDeletions === 0) {
              eventsCount++;
            } else {
              eventDeletionsCount++;
            }
            buffer = buffer.substr(cursorPos + 1);
            addEvent(eventStr);
            cursorPos = -1;
          }
          break;
      }
      cursorPos++;
    }
  }

  function afterEvents () {
    // just happend the end of message;
    body += buffer;
    buffer = '';
  }

  return function (res, fn) {
    res.setEncoding('utf8'); // Already UTF8 in browsers
    res.on('data', chunk => {
      buffer += chunk;
      processBuffer();
    });
    res.on('end', () => {
      let err;
      let bodyObject;
      try {
        res.text = body + buffer;
        bodyObject = res.text && JSON.parse(res.text);
      } catch (err_) {
        err = err_;
        // issue #675: return the raw response if the response parsing fails
        err.rawResponse = res.text || null;
        // issue #876: return the http status code if the response parsing fails
        err.statusCode = res.statusCode;
      } finally {
        fn(err, bodyObject);
      }
    });
  };

  /// --- Direct Push
  function addEvent (strEvent) {
    foreachEvent(JSON.parse(strEvent));
  }
};


/***/ },

/***/ "./node_modules/pryv/src/utils.js"
/*!****************************************!*\
  !*** ./node_modules/pryv/src/utils.js ***!
  \****************************************/
(module) {

/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/lib-js/blob/master/LICENSE)
 */
const regexAPIandToken = /(.+):\/\/(.+)@(.+)/gm;
const regexSchemaAndPath = /(.+):\/\/(.+)/gm;

/**
 * Utilities to access Pryv API.
 * @memberof pryv
 * @namespace pryv.utils
 */
const utils = module.exports = {
  /**
   * Perform a GET request and parse JSON response
   * @param {string} url - URL to fetch
   * @param {Object} [queryParams={}] - Query parameters to append
   * @param {Object} [headers={}] - Additional headers
   * @returns {Promise<{response: Response, body: Object}>} Promise resolving to response and parsed body
   */
  async fetchGet (url, queryParams = {}, headers = {}) {
    let queryStr = '';
    if (queryParams && Object.keys(queryParams).length > 0) {
      queryStr = '?' + new URLSearchParams(queryParams).toString();
    }
    const myHeaders = Object.assign({ Accept: 'application/json' }, headers);
    const response = await fetch(url + queryStr, { headers: myHeaders });
    const body = await response.json();
    return { response, body };
  },

  /**
   * Perform a GET request and return text response
   * @param {string} url - URL to fetch
   * @param {Object} [headers={}] - Additional headers
   * @returns {Promise<{response: Response, text: string}>} Promise resolving to response and text body
   */
  async fetchGetText (url, headers = {}) {
    const myHeaders = Object.assign({ Accept: 'text/html' }, headers);
    const response = await fetch(url, { headers: myHeaders });
    const text = await response.text();
    return { response, text };
  },

  /**
   * Perform a POST request with JSON data
   * @param {string} url - URL to post to
   * @param {Object} [data] - Data to send as JSON
   * @param {Object} [headers={}] - Additional headers
   * @returns {Promise<{response: Response, body: Object}>} Promise resolving to response and parsed body
   */
  async fetchPost (url, data, headers = {}) {
    const myHeaders = Object.assign({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }, headers);
    const response = await fetch(url, {
      method: 'POST',
      headers: myHeaders,
      body: JSON.stringify(data)
    });
    const body = await response.json();
    return { response, body };
  },

  /**
   * Returns true is run in a browser
   * @memberof pryv.utils
   * @returns {boolean}
   */
  isBrowser: function () {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  },

  /**
   * From a APIEndpoint URL, return an object (TokenAndAPI) with two properties
   * @memberof pryv.utils
   * @param {APIEndpoint} apiEndpoint
   * @returns {TokenAndEndpoint}
   */
  extractTokenAndAPIEndpoint: function (apiEndpoint) {
    regexAPIandToken.lastIndex = 0;
    const res = regexAPIandToken.exec(apiEndpoint);

    if (res !== null) { // has token
      // add a trailing '/' to end point if missing
      if (!res[3].endsWith('/')) {
        res[3] += '/';
      }
      return { endpoint: res[1] + '://' + res[3], token: res[2] };
    }
    // else check if valid url
    regexSchemaAndPath.lastIndex = 0;
    const res2 = regexSchemaAndPath.exec(apiEndpoint);
    if (res2 === null) {
      throw new Error('Cannot find endpoint, invalid URL format');
    }
    // add a trailing '/' to end point if missing
    if (!res2[2].endsWith('/')) {
      res2[2] += '/';
    }

    return { endpoint: res2[1] + '://' + res2[2], token: null };
  },

  /**
   * Get a APIEndpoint URL from a TokenAndAPI object
   * @memberof pryv.utils
   * @param {TokenAndEndpoint} tokenAndAPI
   * @returns {APIEndpoint}
   */
  buildAPIEndpoint: function (tokenAndAPI) {
    if (!tokenAndAPI.token) {
      let res = tokenAndAPI.endpoint + '';
      if (!tokenAndAPI.endpoint.endsWith('/')) {
        res += '/';
      }
      return res;
    }
    regexSchemaAndPath.lastIndex = 0;
    const res = regexSchemaAndPath.exec(tokenAndAPI.endpoint);
    // add a trailing '/' to end point if missing
    if (!res[2].endsWith('/')) {
      res[2] += '/';
    }
    return res[1] + '://' + tokenAndAPI.token + '@' + res[2];
  },

  /**
   * Check if the browser is running on a mobile device or tablet
   * @memberof pryv.utils
   * @param {string|Navigator} [navigator] - Navigator object or user agent string (for testing)
   * @returns {boolean} True if mobile or tablet
   */
  browserIsMobileOrTablet: function (navigator) {
    if (navigator == null) {
      return false;
    }
    let check = false;
    // @ts-ignore - navigator is Navigator when not null
    // eslint-disable-next-line no-useless-escape
    (function (a) { if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true; })(navigator.userAgent || navigator.vendor || navigator.opera);
    return check;
  },

  /**
   * Remove Pryv-specific query parameters from URL
   * @memberof pryv.utils
   * @param {string} url - URL to clean
   * @returns {string} URL without prYv* parameters
   */
  cleanURLFromPrYvParams: function (url) {
    const PRYV_REGEXP = /[?#&]+prYv([^=&]+)=([^&]*)/g;
    return url.replace(PRYV_REGEXP, '');
  },

  /**
   * Extract query parameters from a URL
   * @memberof pryv.utils
   * @param {string} url - URL to parse
   * @returns {Object.<string, string>} Object with key-value pairs of query parameters
   */
  getQueryParamsFromURL: function (url) {
    /** @type {Object.<string, string>} */
    const vars = {};
    const QUERY_REGEXP = /[?#&]+([^=&]+)=([^&]*)/g;
    url.replace(QUERY_REGEXP,
      // @ts-ignore - replace callback is used for side effects
      function (m, key, value) {
        vars[key] = decodeURIComponent(value);
      });
    return vars;
  }
};

// TODO: remove following deprecated aliases with next major version

/**
 * @deprecated Renamed to `extractTokenAndAPIEndpoint()`
 */
utils.extractTokenAndApiEndpoint = utils.extractTokenAndAPIEndpoint;

/**
 * @deprecated Renamed to `buildAPIEndpoint()`
 */
// TODO: remove deprecated alias with next major version
utils.buildPryvApiEndpoint = utils.buildAPIEndpoint;

// --------------- typedfs ------------------------------- //

/**
 * An object with two properties: token & apiEndpoint
 * @typedef {Object} TokenAndEndpoint
 * @property {string} [token] Authorization token
 * @property {string} endpoint url of API endpoint
 */

/**
 * A String url of the form http(s)://{token}@{apiEndpoint}
 * @typedef {string} APIEndpoint
 */

/**
 * Common Meta are returned by each standard call on the API https://api.pryv.com/reference/#in-method-results
 * @typedef {Object} CommonMeta
 * @property {string} apiVersion The version of the API in the form {major}.{minor}.{revision}. Mirrored in HTTP header API-Version.
 * @property {number} serverTime The current server time as a timestamp in second. Keeping track of server time is necessary to properly handle time in API calls.
 * @property {string} serial The serial will change every time the core or register is updated. If you compare it with the serial of a previous response and notice a difference, you should reload the service information.
 */


/***/ },

/***/ "./node_modules/safe-regex-test/index.js"
/*!***********************************************!*\
  !*** ./node_modules/safe-regex-test/index.js ***!
  \***********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var callBound = __webpack_require__(/*! call-bound */ "./node_modules/call-bound/index.js");
var isRegex = __webpack_require__(/*! is-regex */ "./node_modules/is-regex/index.js");

var $exec = callBound('RegExp.prototype.exec');
var $TypeError = __webpack_require__(/*! es-errors/type */ "./node_modules/es-errors/type.js");

/** @type {import('.')} */
module.exports = function regexTester(regex) {
	if (!isRegex(regex)) {
		throw new $TypeError('`regex` must be a RegExp');
	}
	return function test(s) {
		return $exec(regex, s) !== null;
	};
};


/***/ },

/***/ "./node_modules/set-function-length/index.js"
/*!***************************************************!*\
  !*** ./node_modules/set-function-length/index.js ***!
  \***************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var GetIntrinsic = __webpack_require__(/*! get-intrinsic */ "./node_modules/get-intrinsic/index.js");
var define = __webpack_require__(/*! define-data-property */ "./node_modules/define-data-property/index.js");
var hasDescriptors = __webpack_require__(/*! has-property-descriptors */ "./node_modules/has-property-descriptors/index.js")();
var gOPD = __webpack_require__(/*! gopd */ "./node_modules/gopd/index.js");

var $TypeError = __webpack_require__(/*! es-errors/type */ "./node_modules/es-errors/type.js");
var $floor = GetIntrinsic('%Math.floor%');

/** @type {import('.')} */
module.exports = function setFunctionLength(fn, length) {
	if (typeof fn !== 'function') {
		throw new $TypeError('`fn` is not a function');
	}
	if (typeof length !== 'number' || length < 0 || length > 0xFFFFFFFF || $floor(length) !== length) {
		throw new $TypeError('`length` must be a positive 32-bit integer');
	}

	var loose = arguments.length > 2 && !!arguments[2];

	var functionLengthIsConfigurable = true;
	var functionLengthIsWritable = true;
	if ('length' in fn && gOPD) {
		var desc = gOPD(fn, 'length');
		if (desc && !desc.configurable) {
			functionLengthIsConfigurable = false;
		}
		if (desc && !desc.writable) {
			functionLengthIsWritable = false;
		}
	}

	if (functionLengthIsConfigurable || functionLengthIsWritable || !loose) {
		if (hasDescriptors) {
			define(/** @type {Parameters<define>[0]} */ (fn), 'length', length, true, true);
		} else {
			define(/** @type {Parameters<define>[0]} */ (fn), 'length', length);
		}
	}
	return fn;
};


/***/ },

/***/ "./node_modules/short-unique-id/dist/short-unique-id.js"
/*!**************************************************************!*\
  !*** ./node_modules/short-unique-id/dist/short-unique-id.js ***!
  \**************************************************************/
(module) {

"use strict";

var ShortUniqueId = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    DEFAULT_OPTIONS: () => DEFAULT_OPTIONS,
    DEFAULT_UUID_LENGTH: () => DEFAULT_UUID_LENGTH,
    default: () => ShortUniqueId
  });

  // package.json
  var version = "5.3.2";

  // src/index.ts
  var DEFAULT_UUID_LENGTH = 6;
  var DEFAULT_OPTIONS = {
    dictionary: "alphanum",
    shuffle: true,
    debug: false,
    length: DEFAULT_UUID_LENGTH,
    counter: 0
  };
  var _ShortUniqueId = class _ShortUniqueId {
    constructor(argOptions = {}) {
      __publicField(this, "counter");
      __publicField(this, "debug");
      __publicField(this, "dict");
      __publicField(this, "version");
      __publicField(this, "dictIndex", 0);
      __publicField(this, "dictRange", []);
      __publicField(this, "lowerBound", 0);
      __publicField(this, "upperBound", 0);
      __publicField(this, "dictLength", 0);
      __publicField(this, "uuidLength");
      __publicField(this, "_digit_first_ascii", 48);
      __publicField(this, "_digit_last_ascii", 58);
      __publicField(this, "_alpha_lower_first_ascii", 97);
      __publicField(this, "_alpha_lower_last_ascii", 123);
      __publicField(this, "_hex_last_ascii", 103);
      __publicField(this, "_alpha_upper_first_ascii", 65);
      __publicField(this, "_alpha_upper_last_ascii", 91);
      __publicField(this, "_number_dict_ranges", {
        digits: [this._digit_first_ascii, this._digit_last_ascii]
      });
      __publicField(this, "_alpha_dict_ranges", {
        lowerCase: [this._alpha_lower_first_ascii, this._alpha_lower_last_ascii],
        upperCase: [this._alpha_upper_first_ascii, this._alpha_upper_last_ascii]
      });
      __publicField(this, "_alpha_lower_dict_ranges", {
        lowerCase: [this._alpha_lower_first_ascii, this._alpha_lower_last_ascii]
      });
      __publicField(this, "_alpha_upper_dict_ranges", {
        upperCase: [this._alpha_upper_first_ascii, this._alpha_upper_last_ascii]
      });
      __publicField(this, "_alphanum_dict_ranges", {
        digits: [this._digit_first_ascii, this._digit_last_ascii],
        lowerCase: [this._alpha_lower_first_ascii, this._alpha_lower_last_ascii],
        upperCase: [this._alpha_upper_first_ascii, this._alpha_upper_last_ascii]
      });
      __publicField(this, "_alphanum_lower_dict_ranges", {
        digits: [this._digit_first_ascii, this._digit_last_ascii],
        lowerCase: [this._alpha_lower_first_ascii, this._alpha_lower_last_ascii]
      });
      __publicField(this, "_alphanum_upper_dict_ranges", {
        digits: [this._digit_first_ascii, this._digit_last_ascii],
        upperCase: [this._alpha_upper_first_ascii, this._alpha_upper_last_ascii]
      });
      __publicField(this, "_hex_dict_ranges", {
        decDigits: [this._digit_first_ascii, this._digit_last_ascii],
        alphaDigits: [this._alpha_lower_first_ascii, this._hex_last_ascii]
      });
      __publicField(this, "_dict_ranges", {
        _number_dict_ranges: this._number_dict_ranges,
        _alpha_dict_ranges: this._alpha_dict_ranges,
        _alpha_lower_dict_ranges: this._alpha_lower_dict_ranges,
        _alpha_upper_dict_ranges: this._alpha_upper_dict_ranges,
        _alphanum_dict_ranges: this._alphanum_dict_ranges,
        _alphanum_lower_dict_ranges: this._alphanum_lower_dict_ranges,
        _alphanum_upper_dict_ranges: this._alphanum_upper_dict_ranges,
        _hex_dict_ranges: this._hex_dict_ranges
      });
      /* tslint:disable consistent-return */
      __publicField(this, "log", (...args) => {
        const finalArgs = [...args];
        finalArgs[0] = "[short-unique-id] ".concat(args[0]);
        if (this.debug === true) {
          if (typeof console !== "undefined" && console !== null) {
            console.log(...finalArgs);
            return;
          }
        }
      });
      /* tslint:enable consistent-return */
      __publicField(this, "_normalizeDictionary", (dictionary, shuffle) => {
        let finalDict;
        if (dictionary && Array.isArray(dictionary) && dictionary.length > 1) {
          finalDict = dictionary;
        } else {
          finalDict = [];
          this.dictIndex = 0;
          const rangesName = "_".concat(dictionary, "_dict_ranges");
          const ranges = this._dict_ranges[rangesName];
          let capacity = 0;
          for (const [, rangeValue] of Object.entries(ranges)) {
            const [lower, upper] = rangeValue;
            capacity += Math.abs(upper - lower);
          }
          finalDict = new Array(capacity);
          let dictIdx = 0;
          for (const [, rangeTypeValue] of Object.entries(ranges)) {
            this.dictRange = rangeTypeValue;
            this.lowerBound = this.dictRange[0];
            this.upperBound = this.dictRange[1];
            const isAscending = this.lowerBound <= this.upperBound;
            const start = this.lowerBound;
            const end = this.upperBound;
            if (isAscending) {
              for (let i = start; i < end; i++) {
                finalDict[dictIdx++] = String.fromCharCode(i);
                this.dictIndex = i;
              }
            } else {
              for (let i = start; i > end; i--) {
                finalDict[dictIdx++] = String.fromCharCode(i);
                this.dictIndex = i;
              }
            }
          }
          finalDict.length = dictIdx;
        }
        if (shuffle) {
          const len = finalDict.length;
          for (let i = len - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalDict[i], finalDict[j]] = [finalDict[j], finalDict[i]];
          }
        }
        return finalDict;
      });
      /** Change the dictionary after initialization. */
      __publicField(this, "setDictionary", (dictionary, shuffle) => {
        this.dict = this._normalizeDictionary(dictionary, shuffle);
        this.dictLength = this.dict.length;
        this.setCounter(0);
      });
      __publicField(this, "seq", () => {
        return this.sequentialUUID();
      });
      /**
       * Generates UUID based on internal counter that's incremented after each ID generation.
       * @alias `const uid = new ShortUniqueId(); uid.seq();`
       */
      __publicField(this, "sequentialUUID", () => {
        const dictLen = this.dictLength;
        const dict = this.dict;
        let counterDiv = this.counter;
        const idParts = [];
        do {
          const counterRem = counterDiv % dictLen;
          counterDiv = Math.trunc(counterDiv / dictLen);
          idParts.push(dict[counterRem]);
        } while (counterDiv !== 0);
        const id = idParts.join("");
        this.counter += 1;
        return id;
      });
      __publicField(this, "rnd", (uuidLength = this.uuidLength || DEFAULT_UUID_LENGTH) => {
        return this.randomUUID(uuidLength);
      });
      /**
       * Generates UUID by creating each part randomly.
       * @alias `const uid = new ShortUniqueId(); uid.rnd(uuidLength: number);`
       */
      __publicField(this, "randomUUID", (uuidLength = this.uuidLength || DEFAULT_UUID_LENGTH) => {
        if (uuidLength === null || typeof uuidLength === "undefined" || uuidLength < 1) {
          throw new Error("Invalid UUID Length Provided");
        }
        const result = new Array(uuidLength);
        const dictLen = this.dictLength;
        const dict = this.dict;
        for (let j = 0; j < uuidLength; j++) {
          const randomPartIdx = Math.floor(Math.random() * dictLen);
          result[j] = dict[randomPartIdx];
        }
        return result.join("");
      });
      __publicField(this, "fmt", (format, date) => {
        return this.formattedUUID(format, date);
      });
      /**
       * Generates custom UUID with the provided format string.
       * @alias `const uid = new ShortUniqueId(); uid.fmt(format: string);`
       */
      __publicField(this, "formattedUUID", (format, date) => {
        const fnMap = {
          $r: this.randomUUID,
          $s: this.sequentialUUID,
          $t: this.stamp
        };
        const result = format.replace(/\$[rs]\d{0,}|\$t0|\$t[1-9]\d{1,}/g, (m) => {
          const fn = m.slice(0, 2);
          const len = Number.parseInt(m.slice(2), 10);
          if (fn === "$s") {
            return fnMap[fn]().padStart(len, "0");
          }
          if (fn === "$t" && date) {
            return fnMap[fn](len, date);
          }
          return fnMap[fn](len);
        });
        return result;
      });
      /**
       * Calculates total number of possible UUIDs.
       *
       * Given that:
       *
       * - `H` is the total number of possible UUIDs
       * - `n` is the number of unique characters in the dictionary
       * - `l` is the UUID length
       *
       * Then `H` is defined as `n` to the power of `l`:
       *
       * <div style="background: white; padding: 5px; border-radius: 5px; overflow: hidden;">
       *  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOwAAABHCAYAAAAECKs5AAALxUlEQVR4Ae2dd+wFRRHHv1YsGHtXVLBjV9T4jw3FAoIFu2JH7ARFjSVqUCFo7CIIKKioMUrsMdagwdiNvTcs2LCLXe8Tb8lm2L3f/d7evtt7v5nkZe/u3e7OfW/2dmd3ZlZycgQcgVYQ2EXSzSXdX9Khko6QdKykd0k6TdIprTDqfDgCjoB0pKT/Dvy+6yA5Ao5AOwjcpGPleZKO7nvTv5rG+/p2WHVOHAFHwCLwEdNgH2Rv8HNHwBFoA4HzSvqtabBXboM158IRcAQsAjc2jfU79gY/dwQcgXYQeLJpsMe1w5pz4gg4AhYBlnLiGWPXXy1Cfu4INILAeST92jRY118beTnOhiNgEXD91SLi545Awwi4/trwy3HWHAGLgOuvFhE/dwQaRcD110ZfjLPlCKQQcP01hYpfcwQaRWAt+ut9JR0m6TGSHi7pQEn7S9p7xG+//v6D+vy4FZF/DOGKdLikg/u85OM3pt59+nsf2Od9gqRDJF1iTMV+jyNQCYHq+uttzHpRvNhbcjym4di1qpL6Qt4HV3oRXqwjsBUCa9Ff95T06c7p9ltd7/pjSWdJOnubjfgffb4fSMJmEqfdrYiHe6+kr0j6fm8o/cdt1ksjhd8z+jI+JskXqLdC3v+vhcBs+uv5Jd1U0ukDDeizku4iadeJn/7qkl42UC8eEI+WdKWJ6/XiHIFSBJ5i5Hbt9sPPNwyEYedvukZ18dKnG8h/i0y91H/XgXz+lyMwJwKnGrldu/3wWw0DocHW/nIwkRTqitMzJeFn6OQItIYAcklHFsvrVdfN5A8NA4EZZpBr0isz9Z5Qs1Iv2xEoQIDwMKF9kK7d/3U3w0Bg5t+SLlnwYGOyMhEV6otTnwEeg57fMwcCs+uvrMfGjSUcf6EyGpeWxEch1BenfEScHIEWEZhdf31jptG8tDJa98nU6yEiKwPvxa+MQBP6648yDeceKz/WuIyvztTrISLH4ed3rR+B2fXXa2QazTr0169l6l77FPn637vXuFAEZtdfH5FpNLX118tJ+k+mbrdgWqg07wC2Z9dfT8o0mtr6K04I8SRTOF77FPkOEDJ/xGkQSOmvV0kUfU1JF0xcn+TSXPrrazMNtrahxiSgeSE7EgFrP5yaHKWxMnJ8VA2Eds80mnXor9/M1O36a4037WVOgYD1f01Njj61l+u9pqjQlvHITKNx/dUi5eeOgHSyaS8PSYDyyd5s8XyJ/4ovWQaCHllbf2VPzVBXnLr+WvxKvYCKCHzYyO0NTV2XlfSvzrusmlqHT2zcYMJx7fXX12XqrfagBlg/dQRWQcA6yFzRFPKMXq5vba5PcrpHptGsQ3/9dqZuPHecdjYCLOnREEo9tZilpayrTejHbU14bxC9qot14Y9+0YU8+lR0bdJDZrFCjxqntfVXXkZcX3zs66+TvuLFFIZMMLr6UyQbhBRiUoeJ0TF0YUkP7TdX/llUTpCvX0p6W6GP9QUk0T5Cmax08GHBJv6Dkv4uCf/uKvSmqOLAAGlt/TXn/0qv67TzELhWF1WEBsbI7u1d+pw+DTL5Z0n3G4CFnpShKA2SPOyE/v7Oy+wVkp7V5WOX9I8aWT+t78UHis3+hcHPh6Lyftc3VD422BZUo7n0V76a4WXE6ZjYUNXA8IJnQeCiXa9IbLC/SLqd4eDISE7+KelO5n9OmfQJ7plf7xv2RRL3cQlHE8oJMof8Xz5z75jLt+ommJ7dxzQjZehdjVjcDYzH6Tr0Vxab4zrDseuv1V53swW/uJeFhyU4vI6RE4L37RLdd3dJBPJjGPpESWOWUWz8sA9E5TV9SGCz0FDitLb+SjC1uL742PXXpkVmcuZYAvmbpC9KIqqmpQslZOWe/U00Vhoqw+DtzMgySRTLHMf0lM3TmxOMw/znurCnT6/4y/nduv7avMhMzuAzexnMmfAxwWOdQ5iYotGh1xJR80bb5IoIoayTxo229pzNNllM3/5Tw3T8AHMcL0l/JZLju7vZxs9I+vyCf8xqPi4tHtWv0qMSQ+z3ktBjU4RRvZVFRoAY1zDBs+ps7M9NucTpbpqYlbNAcE6A8NoCaL9ugY8l6a+5NeTwLEtK6cEuNYO03rKXwZQtbmCHSaYclizfrEo/MeXi/NI05fTXj1fmesj/dUmBwnNWWjnhavn6l8xETmUROKf4MNl0wDlXzn3wNNOwAo6ocyXEsk8oixRjh6bpLYbhwDzrVTUpZz/MtiFLoyv0+hMbfC3xdzNJxNFNTfas4118uR/RDQWof2dCTtFbL1PAYGrS86sF5a0la05/tetgUzNzTOIF8LGgx3LaOQiwcRrLh+yNNERW10RWHj+UYcR/d07IIEYWzdK1EwwDBNPrmHbVpG9k6n5AzUq97OYQ2LeXgycNcMaeS2HkF1KGrqVRHDBwCOWFlOF5s8SesIHROP1EZY43RX+tDNOOKB7rJGbZradL/PAp81VcQUuJXj2We47vXVpozfynJBiGaTbCqknYglqgOF+i/loTJy/7/wgcn5AXggWWECaLjCRjOWTVYo5Z8tHPkfJi4AHuMLqE1W7MxW9y/XU1PDc9F/bFccPieKzXTg6blP7KWnqzZG0zAyCYeOUMpqd6GAyzQ31xysyxkyMQI4ARfSwjHLN2WkpHJco9orTQmvkPTjAMGLga1STXX2uiu3llp+KMTaG/Bq+e+GNw25bhs+EtAuMvqMx0Lv4wUROdHAGLQMpOoFR/TY0u8WMtnXW2vE96ntNf7zhpLecu7DWZnp11WSdHIEYAQw6Wb0JnEtJS/RVH9lBWSN8QV9za8XUTDMM4+mvO+HqqZ3D9dSokN7+cPRNyOoX+igtfaKghvVvLcD42wTCMVwsY1YOBz6N1kQqALcl+uOV3u0m84Yge5COkbCVTQmz2ZmWw+eEwwacCAHFae5bswEy9S9ZfcUnDNeyshf8w/WO7z5YoZT9cqr8Gv9tY7pseDvNCcvprKk7OlC8wt//rkvXX72U+QrFALOm4JK7RlLKC/vqrBLal+mtqS9N9tmB81wnCrG5RRf7v6yVAQKAISEUs1ZqUAou6h6Lg1eRnirLZO4Uh1ZIaZYpX3MywfCuN/zsFppRx/QSmZxQWbjdfBgcmtYg8kSPiRvHheHnuhtrXD0kAAeOnV67Y9dfKAG9Y8Sk5ZYmnhF6SkH0CsQ0RcaNoH2zcPAsR6zX1hX1RZW4IK5mqF68dJ0fAIpCyE8DYZ1Vi5JByJcV/eYjCOnAc1X/o/kn/Qy84M9NwthrHlzLyqky92BU7OQIWgdQ8C8uRq9LtE/K31WQnkRr/0MUwRpWbhVJ6Ab3eOvRXPPlTPeyS9ddZXuIOqDQVJ5uOpiQiRqrDYFeBISJWFDLLPMUsxBJEqtHUjhTHXiNEFbB1sx5GeBUnRyBG4KCErLwjvmGFY/ZptfJHAIchIswvPSxRMWahUxNM8xB4LtSke2Xqdf21JurLLZt4w7ZxlYaDIcBcXCbrzkNEQDjuZ4uQWQiXOQIux0yH49phWbBOCXXFKRMLTo6ARSBlvorBfgnFG1Yhg2zGnCPMc9lCBj16KDBcLv8k14/ONBqY32+SGtKF7G02HYob7FAc2nRpfnXTESDigzUdnMJ+GH01lj1WS3J0Yn9v2Aokd1/xdeLj0EAwAWSzWQJbEVTKDgdixjnmS4IXDTouijb58cgnyPgY2q3b1oP9TcjHJBK2yiwTvS+xFUJcN84G9LKHScLvkfyUw/4orSzgj3l+v2c6BEJQtlhOaEClxM4BcUgYdFpLTGoFx3bWbKsS0dPtlyl+6FWOecAxM3OpKfhV6ovz1F5mqvoyvPCVEXih6QmRial2gjg0KhvZjvfiwQoqDJtPGCn3Kz8kGffq99XkATGVwxidLfm288MEi3xhC433jOCInpD9TaiXfT3JzxBmO/XS4Ml3dl8O5+69MwL8DbzFeuigS05pMstoLvS0jPBwtQsGFcgvm7/56G4DBcsfqQ4CRH1gZhZXT4xqajgjEOf4uf3O7AReo2M6fItQq8VP+z8Ye9m2pZEsNQAAAABJRU5ErkJggg==" />
       * </div>
       *
       * This function returns `H`.
       */
      __publicField(this, "availableUUIDs", (uuidLength = this.uuidLength) => {
        return Number.parseFloat(([...new Set(this.dict)].length ** uuidLength).toFixed(0));
      });
      /**
       * Calculates approximate number of hashes before first collision.
       *
       * Given that:
       *
       * - `H` is the total number of possible UUIDs, or in terms of this library,
       * the result of running `availableUUIDs()`
       * - the expected number of values we have to choose before finding the
       * first collision can be expressed as the quantity `Q(H)`
       *
       * Then `Q(H)` can be approximated as the square root of the product of half
       * of pi times `H`:
       *
       * <div style="background: white; padding: 5px; border-radius: 5px; overflow: hidden;">
       *  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAM0AAABNCAYAAAAFDOCxAAAP5klEQVR4Ae2dBdD0SBGGX/xwdyjc3eHgkMLdpaCAw71wOeDQQwp3KdwKd3fncLfD3d0d9vlr+mdu/tmkJ8nut5uvuyq1m2Qy0hlpeXsiBQUHVsOBk0n6vKRDZ3ishmOR667nwC0l/WHBhYfM8Nj1LzcYsBoOPF/Sm1aTdeQaHJgnB74h6b7zbFq0KjgwPQdOKum/kvafPuvIMTgwTw5cV9LfJB1tns2LVgUHpufAEyV9cPpsI8fgwHw58ClJh8y3edGy4MC0HDimpH9KuvK02UZuwYH5cuBykv4t6XjzbWK0LDgwLQdwZn5u2iwjt+DAvDnwHklPnXcTo3XBgek4cGRJf5R0Q2eWR5F0Wkmndx4ncOYbyYIDW8OBCyWn5ql6asxgeYykP6f0OEI9x38knb0n77gdHNgqDtxD0nd6anxESW+W9DtJr5f07HT8OPvPtS8tBsirimv3kcSACwoOzIYDr12IWS/uac2DJL1B0omydGeR9NLsnL9vl4T5Oig4MGsO/FTSbTtaeA5JH5B01CLNQZIIJTBiNfq4ncRvcGCuHDhz0ku6dI4DJAHmLOmTkk6XXTynpLdm5/E3ODBLDtxK0q8lsUq00Gkkfbt44DaSnltci9PgwOw4QNAZukorHSzpecVDz5QE6DMoODBrDhB0du/GFrIqfVfSTYrn3ifpycW1OA0OzIoDFnR20cZWXTHpQaconjtsoeO8qLgWp8GBWXHgepL+UrGK9TUSszL+mJKwwkU8TsmVOJ8VB9A/3t/YorNJwsP/uMpzODoxKhypci8uJQ4cYxEee78d5gYixh12uA7bWjxBZw9rrDxef6AzhBKU9IV072LljW0+P+ECCnEBSTQKsF2rmTFv+7EkvXsJ8/J06/iPJecJ6yhoRmXw/gg6Qz/x0nGTOPezRYQnIM+SXpkGzcPLG9t2fsq0GuCpBTsE4I7YCfBB4I2essAJnbyxUQy2N/Z4kfMsr5A69aMl1Y5H5IkXDjIAhIgOtbRcY4DsVzwDnAMMVZCPA5eX9K8FnxkIXjp18s3cZckDrD5Y1ch7DLHBB+Lfsvd//yLzy/T0L/r8EYpnqqfgf0j8K0n3WvxHlCoJ6wdxFOyoeLXyZsc5g+4tHffLW3ibby6JxgJBZ3kHKUs+t6gwGdj5TRezGkA/5GTS84IfKwln3NUrqyQvnxcGA4P6OQDvP9OfbEdSnF/SgYv3/uC0GvL+f5P6D/3okkWtwMDdLC0Ov039hV11WPHoX1cq0ldPMSHSgWAKHbCLmLGBQ9ApL9uVMN1DEaTj9+Vby4oVCpQsTPA6wbDSkP51tQyLa/gNvhlbEBVcqZ8yWW66T4WJnn7J+y9Xl3qrJERH0qN7uekqaRb/qKRjO5+yeApMhn0IVZj9DGe+ZbLzpAbRqKuWNyvnBC8Rt076O1bul5cYlF/ZAONEWa9NO7egs+tvWsWK+iDu8e45Llzcq52eKUvvbhtiyz+S3NkaLffZVODdarVJ1zAi0ABWmyF01/Q8s4dnA4drZUzwlom8jbiJohtU5wAdkPdYOifrqXfuKuIV9eR91gwPZc3AvpEek3gNYFqmF3Idog8dstXDS2Ys1RT44X1y/v8FlO0x0G9ELMpAHPTQk1L6n3sVuYVhg8mCiSOHrHvK2k1pMJh8awsaTF+kv3iR0y9L6WuO132ayzaiiCUUMBTGcM/0PB2uNqoR9VCuHrBP6b4LWC9+mcrAQOEhs/u/wpM4S4NXGvF0KiLqkEkJM32NN55yaoYYz3OrSEPQ2QtXkfGEecIv+ht9GoOQh36U0rs2CGHmIPO/F/ENnoIszZ1THuTDh31Kuma675Ety2c5H6PPtDovH5iW6BPXKtJwDYscJvnfZ7z5U4pyZBC10JSDuKXcMi2TFyv3rcsbG3beqs/wPui7HMCDOgndAOgCicfMHmxHaoXmgUVWOLBvVqGhm2OjK5G/V5+5TlYfrz5jdcXESFnoREMJMe/LKR8scjjuWP6/mK4xQT3KYTihfHxlmM43gaxznXUTKtNRB+uPXn3mdum9oM+cpCPfPbesM9JJWry7Zb7EVdigqVnQ0GXoREOJzRjI36vPMMOTvkWfsbqxUvIsfp2h9JLU0TGulI4xVs13pTJ+IOkGHYXwLHkx6DaB8HMhJpdt2oS65XX4SOKvV595eUrv0mcscxgxVN6msnRmOhrO0JJgMEYGEAVDCFOwrYZfL3YqsV1Nyl9zarbqM9SP+v41oRaG1Be4EfI0g6OLWA2/l/j23uTnoq1G50tKLHAVLI+bQEyOHp/XTtYVfYaVnP7I9z/LvlE7x/lJ+qf1VRz4i/kxXt2XuOM+lUT0olBWhJIs7uI55Q3n+XlT3uSPvoENveuwpZb0rfqMVQnrEIaEIXSphKvzPAvvECVMaUWcYEW2SQK+4pXeFELUxOizyQQMh3fPgQuhq69wjyA6S9+rzwB9scReC0ONWabkk1etk9rmC16rV1nG3VM96UA10a9Mf+2sXUNl708n0a7M23POBhGt6O0zLJzJj09WTGJUWCnRgZgwpiZ0pCFkk99Fhjy8xmfAItIXmXjylXtZFdhJh/QufQYvuQ2aMfoMe16RD/CYGoAPLBD3W2Hk1khi0Hnea0Ea4p+xsuwXsZX2zI3OPUI/YhYG81duxdTFIyYtVv4pDu8EQj+hv9SknlpdzT+DkaaXzLdCAd4KlZliaWBmJA+U7xrhLOU+IL9WYqZAT+L5Es28LC/kWNKj3A0lgqvQa8YS1ibQtiik6HQYFy44IFNW27EELw9doMt/MjAj8H7oXi3E/s7gGKc4bu8oONdnutApeVbmn1nWf/O0e2RlOhcH4sEQYvXgeTo2CnCNmN1Ig4m1lVCGrY6ECPRRjjfzMHlZfnQujCNjCFnZAIPWBvvls+E4Oz2EcxQg4Vgyfxx16Nt3uVYWIutDazc26Bp9xHhM3+mjHG9GSEEvobBaARfvTb1vApDKOOvIA8j1MsJvQ5ohqFjTZ7AgeQCkOd5sqD5DOzAC9O1PvKy9XAdqTpsxLQMuRR9gS9ZLp729aA8rNPD1o3dllHZt+URPmr7bvCvaY+/b1UGyTC3obGysS5blSv4+MrURa60nbDrHm/X6Z6gxjkbr9MSflMRMyGwNZL50SmKWZYMEXkIfapmZkhl3iK+BYDXK+FhZuSXniBCkB3E9xpfAzI5eM4R4WSjyXeIoxgJEQOpKZ8aYUiMcrXSAO9VuNlzD9J5Pkq1GGQaLd+JqqNbkSekn8JR+4yHwkKR36TOWITgbHkJcyAmH27MWQWaXWMy6WKNKczGyOc+BQ/Ls6P79BkXe6oEMbvZzr2jH17io1xh9BkUXU3zZZqtX3y+GD0zWnpnuRmmAUWcca8yUKM1sGG6AQwaXh8fL6nXjxcAz+d78V627vjABsCfAJhOrobk+vFG4OJfhvUufscYD70Z2pzCTsRElyu1BMRqwkTWzN6BLCsLR5XWIMigxAbaQWd0oyxM9d/zM70THG0rnSu0bqnwT/VnuHtlVF8ROZn5WFNpqBzM78COU2zFE3jaADVmBhOF9d5RNHBRWyU0m208N/nmcwWfMeN0qru6JuMSUiPLLaGWVKYO8gIPge8D8CwARmb2FCJmmMezh6yWsTtaBGMh9xECx9ATGDSVEVfLxKJK1MtBRUDBbiecAGhKWgNPN0+bWMniHxiOvxZTBhfm9uWO1Vm5keiYq2oaU4JkQcJQbL4ZEEu8xg+KJ/mqyctHJjVDkn55s9GxKUaKYbRaz9LVfzKxUsNyKtExLQ9ilxsCO1iiWUcSVMmwVXxOiBulhlqVHJ8FeP2R2RCzDLDtGJyrbtSnnrILGI+9qbEFnrRuorKPNbKBBf2F7XGsXv+iJH6pE7NJ/uP61Ij1mZ3TYZusgnR/9BbQzChWWH5R99AN0F4CDNcIC5GEoMTvL8rB8GaDMgIiK+YFJnCW3jBbEu40Yl6e1/1yvIa6trGW/4MGYJOZIiIJmBke89hD6AZ1yFUSfo+94LKO18lnRwfjZO7dfRC/6S2kRQ9JBgrB0+S/ph5jia/Xacw2dpmZNwjfjdXiRB3L7WBl9aSUnuIHpnZkKvWauZJuNMIl5CICmd4B58iMNHRcLF1ZO6oF6gLEI6+dQmI+37LWlwxuPYprP9Cje6EHAxT2E4xFrWKs+5Ml7qjQvaJgEpipz3fkgfjIxgLXq22sBEZXwiinDvxHRscTlvkEwhYhOrIJso+Qx/Kybb83lmYkZnYfGAS4EBYCu0eecywsjwhP9wwOky59bx3+WbqAzQ6NL11HHKcog6tLkfwwPXWRBZ4BupyBEILYGq2EUyd/iu3D8giTZasoZbQxn5Wn1EGPVABu2SXB3ezEA91zx4fbAlv6aSZ332LdnA1LELyY0irytZ0NGJlO+kEbd3rGl/N1bbUQrZE4bMPhcemMP9j59+D/AWwDw5aLe4VOs/wyTOo5RT+jB+ms3bYl0TNu3oHRqlyUhrr6mvDjw/DgJgYKU0mXiNVQHotoyPOPAKqz/MRqN/4A4HPSZMYQfCFNxi2g3pryuZ7HAoBy3+JC68tuGewbhQV/pIoLOhjp5y3yBDtmk2zVYgQxZuk2P3SnbuPJzZvcSebDyQosCmAgQAzBR7ibKHcfLZn2cq3TeIaEMNV7aSkOeXe89D1nZv5bRbr8G8ncniZVuN4hkJY/z6FZiXmqE+N0Kt6nlk19jZyCwcF0SBtAhBhbWvbHbaOVlx//gwCgO4FA0EWjZt3lAU+BtXyflhgDwbkHBgY3iwA/TwFkWdkHQGWiPdZKBLrHMjsEPrrPOUdYu4gA7ELHa4Jsq4/4t6Mzz+ZSpWGbuCOrEZvdBwYGN44Ahz+mkpbJvQWcMnnWRhZx494JYV72inODAXg4ckOk1ZWQoaN+xIdZ7C3L8QSzDL4NzeY7ocgcLIsk2cADgLLoDKw3bcOUECBcn5DoI/w14M6JWg4IDG88BCw8/LKupBZ1hll41gWgGabJug8Oq2xX5z5gD7APBSoNPxCArAFZdu02O5AuoEja0WPZpRxAaY5EnI6sYjwcH9uUAwFkGDYfB8Qk6Y6P5VRLWOnxAywYMZaPfDAkbX2W9I+/ggPjcvA0aE5EIOuuCuYxlGw5MtvPqi6vCf+SJ9R9bn3g+ONDEASxVKOEMHGD7FnR2YFMubYlZQYjPIramdiAeEqhG3FVQcGAjOQBchUFDuAdhG/xfFYD1oGxlsxVu2e+mfwdnI19mVGo9HLBP7dF5QT8Tt78KQhTEwLBskJTXvRtErqKukWdwoJMD18g6Mns4jPnAV1dB6CdYw7zHfl2Zxb3gwE5ygG2O8lk+cF87+Tai7K3hAOHnNnDYLy4oOBAc6OEAXxVg0LD9bJh5e5gVt4MDcMC+A/TOYEdwIDjg4wCx+Kw0B/uSR6rgQHCAmH02GCGGP6jCgf8BynL2Ji/GeXEAAAAASUVORK5CYII=" />
       * </div>
       *
       * This function returns `Q(H)`.
       *
       * (see [Poisson distribution](https://en.wikipedia.org/wiki/Poisson_distribution))
       */
      // Cache for memoization
      __publicField(this, "_collisionCache", /* @__PURE__ */ new Map());
      __publicField(this, "approxMaxBeforeCollision", (rounds = this.availableUUIDs(this.uuidLength)) => {
        const cacheKey = rounds;
        const cached = this._collisionCache.get(cacheKey);
        if (cached !== void 0) {
          return cached;
        }
        const result = Number.parseFloat(Math.sqrt(Math.PI / 2 * rounds).toFixed(20));
        this._collisionCache.set(cacheKey, result);
        return result;
      });
      /**
       * Calculates probability of generating duplicate UUIDs (a collision) in a
       * given number of UUID generation rounds.
       *
       * Given that:
       *
       * - `r` is the maximum number of times that `randomUUID()` will be called,
       * or better said the number of _rounds_
       * - `H` is the total number of possible UUIDs, or in terms of this library,
       * the result of running `availableUUIDs()`
       *
       * Then the probability of collision `p(r; H)` can be approximated as the result
       * of dividing the square root of the product of half of pi times `r` by `H`:
       *
       * <div style="background: white; padding: 5px; border-radius: 5px; overflow: hidden;">
       *  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANIAAABJCAYAAABIOHjCAAAO+klEQVR4Ae2dBfDsxg3GvzIzY8qMaVJMGVNmZpjSlJnbtCmkkDIzTxlSxpSbMjOnzMxwv9fVG42f9yz7zgd/SzOe89mL8pK0n7RSUnJgOzlwA0mflfSODbm2k4tZ6klz4JiSfiHpvZIO3pBr0h8kK7+dHLi7pF9KOtZ2Fj9LnRxYPweOIukHku6//qJkCZID28uB20n6naTjV6pwZEnXk3SApMfOue5WiZ+PkwM7ngNHkvRNSY+s1PQYRW76i6TvSPqNpMPL/c8lcfGc612VNPJxcmDHc+Amkv4s6SSVmr5I0j0lHbW8f52kE5X7+0m6dCVePk4OTIYDR5D0JUlPqtT4uJJu6d6x9PuY+/9GSad2//M2OTBJDlxzpmD4m6RTBWt/a0kHubA/Si2f40beTpYDh0l6do/aHyrpiiU8mr5/SzpFj/gZNDmw4zhwBUn/knTmYM32KbOX7TOxpPuvpL2D8TNYcmBHcoDZ5WU9avZqSe9z4U9XOtJd3LO8TQ5MigMXlvQfSecK1hoZ6p+S/D4RavM/SfpIMA063gskvVnSY2bX0Uq8E8w0go+ezYyvkPSSskdl74JJZ7DkwHo48HZJb+iR9XnLbNRUkT9E0qMC6bChSwciPvtSdMAnSzqDpEMknbukcaOC9yPdpOTARnPgfGU22neFpbzKDMd3Z5ffr8rG7nucsgJVPB0MuetxLmzeJgc2kgNsqK4agYAsdsLCDZZydBauyzY4dGBZ/lnYxuv8mxzYDA6craisL7HC4jDTvMXlh/qcTvRh9yxvkwNbxQGE+Y/3KPENi4IBJUP0AgDriY50evcATB8dKeUgx5S83R4OnFbSPyTt36PIr5H01Z7XhzrS/2jpSBfvCJevkwOjceA8ks46MPVnFjNyZoh10XFKZwZJnirudX2Fied706LVes4APpxcEo33ugPiLjPKlcts9P5lJpppJQciHDh6wcN9vTRCTB76arWeIOlrM8O8I0YyHDEMau2Uj0ZkcCbdzoETS3q3JEZyUAigEWiI920P3voU26E/SrpF69vVPkTRQfn3W222mdvUOYA8czLHBLBuNMTvzyxagehE6BGzTvQ9SaC1FyWMAN9U1Nmfk/TWGUTocsFE8VKEsoMZNeWjINMy2DgcuEbpSHSmaweywDAP0/A7BsJ2BXngrBPcZwYJAu4D0ZGfXsoTcZpyqRIWNENScmCtHEDGwTcCHekDgZLQwH9W8G2B4NUgZywOI60TWUD+4+8Bc4yz28PKL+bqlLvPsrSSVD5ODizOgXuVBkmjBExaI5QUP5lp+u5dC9DjOebm5MeGbpOeFuwgGABiYbtxy7oLFgRts2I7/T9CMx9kqoTfBJQHNOznzWECdkK/lsTezaJ0seKuC3mrSaaJe3DzxTb8x57kk5IAAE6NEMBfPlv733VqFXf1fVbpSOwNmUcf93qXYgGFxMP8w5HuAcDSqbG43So6TVknn2mDS/02SWh1Pt1yfVESbpw8vVjSF1rCEv/zMwcbj/eBy/LgU5Ku1Hg+lb/ncKrwJi/hwW3K5i3q8zEJOyL8NmDct07ERO86Imyii9/00fjYxWjrDmW0YsR6aRFI+bjNjUFUo3sVb56E5UK1yoc6aUXVC1wGp++n7M3FnREB7Rd8wtWwVwKgTfvGCmx68HNHB/qusynaGs7evmhJPOM2ufCgh61jYA3ZRaYiJc5FuwIXGYFl3hTp6o6313EMgOd/XcEAg3z25W30a4fQiGUhmKttIVvLM2pG6OGlcSBMRzYQ8QOAL4EpIomZ1b9d+PXBwlyWV5xvxP7OmIQpBObq7FNtHbGcQwuDWnNbCHwXswtubyNEgyA8B11FiQ/KMnCKZHsz8AxVOLMU6AEGmLEImQwnJn5VhImGnxXHynvhdBlpWPcOQf4unPnABJBtDBvm3d7WkmOAYElCo2gToGvxblw2BKPeQmvpbONzZoTfF549XxK2PtFBa0h9GcwxB28qFtiS4DtsPF2gMAuIyLaQl48iIyTO2OlEXBfqUUmUF2iOIjCVSLJg28CUsQN/s6I0icTzYUjDW4X6d8u+f0bhGegC+IA5+RiEfP7jMpgzoNuFGy1cF59/jEybaeKCqDZishfEu2Yv92k8qIzux/MP59wzG5Bnk9C0MA2vYncZV7h0iqh8xGYf4aPyka8bKnLvvNC/i96j7cK/Gr6wrUPzy6zKXsk5owkVbNsyEAWRLM/iZn4sWscg/CzQST1f/D3v2trbUstCIfDa/9zi+Z+KQ/wyDTOi0Lsx6cVtURuBqwJj1UUIoEzx2J+wX2N28XQgBES8uTA1v2rG/Ie2JMaoQl5oZCLCfksSux+Z/Ux0qYGJMh8HmacvkQeoYjt6pG98wlNn8mfvChgOB2sB9sTrDp0L2QO+RpACOPu4+ZBCDIxDR6cxjzUrMICjda1dkRXHwKr9Pxq9FHsSmwEYnVnH4oaIKdEjE2B8TQPF2Z7eE0utUDiooAFAwGhoGMDcX+tcH7GRyxTNO2YnT68vz3mHDcxQAldFGlwR+Qg+2UzQRz6y8jH6k9fQhoSqnaURS7o2ArSJQoM84B3haisINkOR9bz5Q1uay3xGva+2zAQ3LS2OW2edbcTmFUsFpuDmiM9o+ndJTecReKfkAzJzdRHeLO0D22YondCbGIPBIj00gGycejItEMcgNjuZD9d17+UjGp6d6Fb7/WEpE+XqIx9ZOeAzcYdqjgBe1s4Isjz4vapTOX9idnLdbWceS82PwrUkvbOUo2229+nkfU8OMBOYXEOjZdRjtEKGaSMaHVO0xSGMKRpsmdYWj2eMSvhUNnpq+ags4zyRNp2sJpSCJmi6pvXxI/cmHwGxZ9btuoAA0RH+0FCrRvIiDPtIxGcgGELMNgAzI4R2kY4Czo08/cX35YzVJnIjkm6GmcMBv+sOqA+m17xcMpOY+tc7N79kiXePOfnwis7hG8NhJd5FOuKN8RpVPXVFLoyQ7R8NkY9In0GE/CJ+qNvKwwzaV1jGbwIyFIMGy3Q2k2uDU1ue+WwgB9AI8bEfUImPIMd7Lq86RQHBsztV4rU9RiBG3hqiAWtLr88zLx/VZA6fnt8/Gmr0RQOGRwf7hBe8by57F0wuHB3n8oB+86qwjLM3+di1GeL65T0dwKMXWJcTzzshr2Sx+7HF6YMQ2B15wRs25igvF0j1LvL7R9hYDSGsM8kPrdoihM84ZheWmKTHQMQsyRGRfQjBn32XIYTi5Cl57eLBHvxjdEN9Om+GMLnCcFOWiDU0VLJRemJpCLXZL5rOkHAs52iE3wpGNnzdUPmIbGxpt4j9zeXdaQhg2PC9xkHFyD3UB7R1dOlGh/ZnCQVZkcG6OGCOw+fJR6jG+WDNJRwYKp7T4KIEcJE4tdkvms6QcCgYyHue9aZP1+QjljJDKSpH1tIHHfFbSZSlOStipmEbtWhVUSbMW/ZxJCTg4iHax1r58nnhANo0GldthjCt009bhF7wVH0aJlo5RtF5s99YH8bLRxGUOvtrpmAZKh9RFw6ogkd9l2DGB7zjYHHc3JKw9/xy1iqdnXwOLxuufgmOsgjQKCr+PGnBc26J9+YYr3kejGXB7jkfyDZT7bn9shdUm80sjP0uKh+x+TgUHo9ygXpwRfahvP1Rcyaw+kR+6YTkGV16NdOE/36vrfne/wfvyH4g+bEcxbiNZZ9tcuNDLlJ3n2beBzhgGjQYj4q6SaYWn2dDwkiIR5gImTOKISM8KnbKyTJz3vKlVg7gScSPwJlIA5nGGqSH5dfSrz3H+pbT3ubNKLW4PMc7Tg0L2RYPVTkyKzAsk6Gw1kVr2NedcFv6+ayFA/gVoLEwK6FFw6zaiFEYB36oPA2RYO/8r424LJ26yI7NGDLCgwmkrFzRZRIdgMaDUgQ5g7jIaGjS2nBpLOeQO5DfDNGAow78EOAhZwhhqbmITdIiG6ggUvwG+pDyZ5wABxBOaVwoC0Ap4PIVlAKjKJ2LpVgXce4naUTkDhonWqchIzyYMzrBZ2YQosix78xabL6iYGg6OgG0yszkvcswWIDURqPXDA9ol/B97Vo4aQHY1TK8iXZ9h3y/Rg6AyaITMGJDwPVBfvf18ELjfmVJY94P6fpZb17Y2jsQEkP3QWppjvX8VgXwWoNdjZXvtqfLDA5iHqUUqyK7kMe5mlpilu0sn4ljYfklLFrKCBZ0MM9MPkJtumjjRr4C3zV0+dOnEgBtayYdfdJZRdhDZ6bVuPNKGsYBzpNloOc6KLCSYdPawr+wAR4YVoJALDtYqYnoDkTdIwgCLhqhPgiHPRIJPmAPqM3xYDD6yoKBSUTYZ+mbNIwDtnVA54jYFRlAgPAr2yszDdpQMGWTNZxAgJq1L8Cymc68/8x4TOPbQNhPcaRj0nAOYFRKp0ClHyGzZF4EiRLJZ3cYtFPmRWeZvhZY245p7wJUaYjGb3fFV3RzmbIx6o0jV5T1jsrGkPos0yJklsyLIFEi+ewKgzbOgI/0dmyMmEkwBFuUaDhfmVnM7r1oQi3xWSotgldrSXKUR8yaDFIrW1qMUov1J+qRKJET/VgJmSUzaJDRqalYQBVNB1hkv8IXmh18fF+D65oasekKIruGApkaPxapr0fq4zK6i0DmMDFw7dsVeFveA+U5YFsKu8RyolHcf4npTTkpQ+pH5SMc6NCJViYfTfnjZN23hwOG1I/KR+AK6UiHbE8Vs6TJgXE5ALbQlmlsqXT51UCeYj+UOCuRj8atfqaeHFgOBzxSH2hW1wUo1zrejpGPlsPKTGXKHDCHmGAiI4Q8TkfC1zgwt6TkQHKgAIfpGOwbRsj2j1I+inArw0yCA5ix2DINiFAXeU9Pq/Jp3lWmfJ8cWDsHMMexjhQxaARFYuH3WXvpswDJgQ3hgFkyAw+KkOHrcGWd8lGEYxlmEhywIzOjnnAxVWFGWsQKeRKMzUpOhwPAymyZ1tcTbspH02knWdMODgCxso7U1xNuykcdzM3X0+EA1sR0JDZgI2T7R+DrUj6KcCzD7FgO4KEJb7T44cDnAh0Ja2t8+eGfo+kFCesCvANzWB3+GAjPeVqc2rHfAH8jO5axWbHpcAADUw6g43C7touTIM0xj3GFM7XawvKM8ByqNjr9D+9YuR11hSRCAAAAAElFTkSuQmCC" />
       * </div>
       *
       * This function returns `p(r; H)`.
       *
       * (see [Poisson distribution](https://en.wikipedia.org/wiki/Poisson_distribution))
       *
       * (Useful if you are wondering _"If I use this lib and expect to perform at most
       * `r` rounds of UUID generations, what is the probability that I will hit a duplicate UUID?"_.)
       */
      __publicField(this, "collisionProbability", (rounds = this.availableUUIDs(this.uuidLength), uuidLength = this.uuidLength) => {
        return Number.parseFloat(
          (this.approxMaxBeforeCollision(rounds) / this.availableUUIDs(uuidLength)).toFixed(20)
        );
      });
      /**
       * Calculate a "uniqueness" score (from 0 to 1) of UUIDs based on size of
       * dictionary and chosen UUID length.
       *
       * Given that:
       *
       * - `H` is the total number of possible UUIDs, or in terms of this library,
       * the result of running `availableUUIDs()`
       * - `Q(H)` is the approximate number of hashes before first collision,
       * or in terms of this library, the result of running `approxMaxBeforeCollision()`
       *
       * Then `uniqueness` can be expressed as the additive inverse of the probability of
       * generating a "word" I had previously generated (a duplicate) at any given iteration
       * up to the the total number of possible UUIDs expressed as the quotiend of `Q(H)` and `H`:
       *
       * <div style="background: white; padding: 5px; border-radius: 5px; overflow: hidden;">
       *  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIcAAABDCAYAAAC2nhaoAAAJK0lEQVR4Ae2dB+w9RRHHvyCgYgUVxViCBQIRFRQEFVEERVGKggYwJiAkxCgqECkRJQqiCQjSYsEYCyrFggRDSywUpSN/ihXQINUCCigK4vvEmWS5XJm99/+/37t3O8nl3tudLTc7tzM7M7snFZgVBVaSdLikrWfVYEM7x0vaqCGvJAco8BhJW0raV9IRkg6V9B5JawfKNqGcKOljTZkzTH+apEslvXKGbS5EU8+T9FlJv5Z0jKQ3S3qZpNdJ+rikuySdIekFmU/7YUnfC5Z5iqRf2XWFpPT6paTfS9oqqeuxkq6zPqe4/L7G8LdP8Pm5nqTfSHpWJb38raHAKpL2l3SPzRRPrcEh6en21v3FGKYB7VHJm0q6U9IzH5Xa/udxkp4vCRHwiF0flLSWpNVrisIgMPZnEvyDbPCfUINP0n6T2fHHkhB3BRoosOZED7hI0t8kvb4BJ01mkP8sCQZZJ82o+b2yMdMBNXmRpBNssP8YQZZ0pOHTN0RjG6xqs8pubUhjznuOpOsl3SeJNzwK6A680V2iYg8TRXVve6StZdbO1yLIki4x/O8H8feR9CdJTwzijwbtyZJuNGK+K/OpX2zl/ivphS1l0RGObslvy3rGRM+hfphwzzZEy2OA/234Hwrgg0KZv0uCSQoYBZCzvF0Q/ts9qEJ5xBDl399QHqWR/I0b8ruSd7by1BFRgLdN8FGio/AtSZdFkceAx5sC0XnTIoSvowkrGur4Yl3mRBn8wuSNvGMKhS9X33BlFH0DXScK77XneEm0wCLjPckGjYHF9tAXbjGiNukd5PeZlbw/LE/pY1Tf+EVHf7ze6p1VDu2w3B49YK+AGFzr96QGYuVfVsdpNXW4TsJysg/k6hswfK6+kfbrbkmnpwlj/M2g3myDirLYFzAeOYMx/VdhR8t/ezUj+H+XpP6I2Htrgp+jb3h3fjZReqPLZS+zcHdMxj6omMT7wnZJPXUK6cGW39eH4foGff1r4Lrf2sP+kqNv+POfMnERPCxpNU8Y4/0TyaC+cQoCYGJ3JqsTTT64fX0x2F6o/8vBPv7c8L8bxK+iHWXl25bl1TIL9x+5CtF5S/Bh9AV8H9SDnQRRVQWUSPKxpeQCJnK3b+Ds64LUvoGjsA8cZv19RZ/Ci1LmJ0aE26d4IEQFA8/1gYZ6cM6Rj88jFzDIef2sJLoA56Djv7QLuSH/QKsDB+NoAUcThLx2Cgp83eq4tcXs7DMUDrRcYHlNH/G+RuDThp9r30jrPsTq2DxNHNtvlp0QHhtCH3hRsmTctaUCFytrtOA0Zbm+8ZUmhEq6+1P66htU90mjy6gNYT59YvrOBXSLC4yI32nQNbzOzxkebvccSPUNLJddgEPvQWsLl35fONbqiIixvm3MfTneDFf2mAVSwP3O6gBfA6uNqqcS/YJZ5ypJTTESXh8DBe5rPCF4f7eVo2yEsd6U4G8YbKMODTH4z4Cbv67sQqWdZQRlKnV4tkV4uRhY14J+PH+nSYjfQ5Iut4AfT2+6v8XaaBM9dWVPsnIY6iJACCOM1Ne+4W0QNjiNUdDrGfydNxJicrkdAjHw3MqTYRgC9ra3CpkeXZoSQMRymeCbHPAlctSfcrExR5N/J9I2RjPiWaJtRuocNM6rzPl2tYXXsQKpAlPtDwyPoJ1c4E08t6MQAwNTYvJ2fYiZgLZfXeMxBh/xt9kkEg3R5SLybBNhGLHq7C5t3djAGKxEhCVUYtZAxyBo+HcWYU5MxPtscJDBvPl1UVwMXBfgQses3bacfblFb50/Gdy6i5UISqoD4o60OlzSyIvoKl4fd5gMkUl8bBbAqZicI5pzVsVzhIxyCVPsZUYtjFAMAnK4znGGIktkehdQB282+sc8wzmTgKQf5nSQ6OvdTQFjmkuVt5x6hoz7W5tN0mcgSv1HkjZJE1t+Y3Rj2TuvQAwts8Y2kQ5+1aKqb7LlnAeQjJE5UFj/kCiqyHpWOtAkCq81ZZbV0DwC1tUro3oKQSOp29Z9BGNkDhiDWZM3C18MvxETuf6Hb9r+k3ljDgKK7jXltlffxswc7kOBKfz6aA8qovjih0H5nCfg+dg01RvGzBwMKkvE2ybbD4mU2qE3FaUtbFtjl2V1iiayir7DnimVElkVgDxm5sgmVkcBFHwMaawAlxLYKnFhn6VrtdOFOaoUme4/sRfs3l9KQDQ27QXO6ldhjixyjQu5MMe4xjvraQtzZJFrXMiFOcY13llPu7yYAxc2fgo260x79dm0w7KU5Vu54jTo3AC+vJgDZxZb7iIbdLpwzsti7/8jsyPsH+XKogGBR62wvJijtZGSOUwKFOYY5rjNpNeFOWZC5mE2UphjmOM2k17jC8Aj+amZtFYaGQwFCFQlEATm+MZgel06usIowK5uIp8JVuUwD49j4H7DJCKaZSRbCt+wwnpQKp5bCnBcEedxshW/6SIsfl7D3uaRsNCUs8GIdOdwufT60uToqVMr9GSrArvuTq7gejlezshpP/NIi9KnCgXY2sCxk8zKHpNLuCG71d422X9LnCmByw5sZWBmJv7Dj4xg5uY8U6zMBA5NFaTjDZX7fFHgTBPVbHuIAPGnLtIj+AVnoBRAwceFwGAza0TAj7M8LoJccIZLARyGMAYXu+O7AL3C8d/ZhVzyh00BziNnsP8z0R/YAtIFbMsEH/0k3RLZVa7kD5ACftY6O+MjgG0J5pjmiKpIOwVniSlAxDk76BjsqL7hm6qKvrHEg7eim2dDE4zBFdE32Kzt+EXfWNGjs8T1c+g8gx3VNzgwBnz0jeyjEZb4WUvzmRRwfeOBlrM10jM3XKQUfSOT0ENDR9/gjFBmAs4YbXJLpOmOX/SNoY12Zn/TE48jDkuObnJ9g4DoAgtMgY/YYPN9lscHnjO1bxR9I0CwIaO4P+WnwYfwox/K0Y9Bgg0VDX2DrRaIiegBOK6Mfn6oD136HaMAG4Ncf4h83yX1pxR9I0bjwWLxSXCYg/PJ646srD4Y348Fv9g3qpRZwP8c4chgc1hKBPxrC0XfiFBrwDh8S94/THx48DlK/EaQUENGQxF1EzgzB19cIK0JCBNMv9DEBwRhrgILRAE+icFXqLmqG8I5fH5Z5Vn5ymQVz/+Dz0G5q1bKzOzv/wAvzKhnhyEMfQAAAABJRU5ErkJggg==" />
       * </div>
       *
       * (Useful if you need a value to rate the "quality" of the combination of given dictionary
       * and UUID length. The closer to 1, higher the uniqueness and thus better the quality.)
       */
      __publicField(this, "uniqueness", (rounds = this.availableUUIDs(this.uuidLength)) => {
        const score = Number.parseFloat(
          (1 - this.approxMaxBeforeCollision(rounds) / rounds).toFixed(20)
        );
        return score > 1 ? 1 : score < 0 ? 0 : score;
      });
      /**
       * Return the version of this module.
       */
      __publicField(this, "getVersion", () => {
        return this.version;
      });
      /**
       * Generates a UUID with a timestamp that can be extracted using `uid.parseStamp(stampString);`.
       *
       * ```js
       *  const uidWithTimestamp = uid.stamp(32);
       *  console.log(uidWithTimestamp);
       *  // GDa608f973aRCHLXQYPTbKDbjDeVsSb3
       *
       *  console.log(uid.parseStamp(uidWithTimestamp));
       *  // 2021-05-03T06:24:58.000Z
       *  ```
       */
      __publicField(this, "stamp", (finalLength, date) => {
        const hexStamp = Math.floor(+(date || /* @__PURE__ */ new Date()) / 1e3).toString(16);
        if (typeof finalLength === "number" && finalLength === 0) {
          return hexStamp;
        }
        if (typeof finalLength !== "number" || finalLength < 10) {
          throw new Error(
            [
              "Param finalLength must be a number greater than or equal to 10,",
              "or 0 if you want the raw hexadecimal timestamp"
            ].join("\n")
          );
        }
        const idLength = finalLength - 9;
        const rndIdx = Math.round(Math.random() * (idLength > 15 ? 15 : idLength));
        const id = this.randomUUID(idLength);
        return "".concat(id.substring(0, rndIdx)).concat(hexStamp).concat(id.substring(rndIdx)).concat(rndIdx.toString(16));
      });
      /**
       * Extracts the date embeded in a UUID generated using the `uid.stamp(finalLength);` method.
       *
       * ```js
       *  const uidWithTimestamp = uid.stamp(32);
       *  console.log(uidWithTimestamp);
       *  // GDa608f973aRCHLXQYPTbKDbjDeVsSb3
       *
       *  console.log(uid.parseStamp(uidWithTimestamp));
       *  // 2021-05-03T06:24:58.000Z
       *  ```
       */
      __publicField(this, "parseStamp", (suid, format) => {
        if (format && !/t0|t[1-9]\d{1,}/.test(format)) {
          throw new Error("Cannot extract date from a formated UUID with no timestamp in the format");
        }
        const stamp = format ? format.replace(/\$[rs]\d{0,}|\$t0|\$t[1-9]\d{1,}/g, (m) => {
          const fnMap = {
            $r: (len2) => [...Array(len2)].map(() => "r").join(""),
            $s: (len2) => [...Array(len2)].map(() => "s").join(""),
            $t: (len2) => [...Array(len2)].map(() => "t").join("")
          };
          const fn = m.slice(0, 2);
          const len = Number.parseInt(m.slice(2), 10);
          return fnMap[fn](len);
        }).replace(/^(.*?)(t{8,})(.*)$/g, (_m, p1, p2) => {
          return suid.substring(p1.length, p1.length + p2.length);
        }) : suid;
        if (stamp.length === 8) {
          return new Date(Number.parseInt(stamp, 16) * 1e3);
        }
        if (stamp.length < 10) {
          throw new Error("Stamp length invalid");
        }
        const rndIdx = Number.parseInt(stamp.substring(stamp.length - 1), 16);
        return new Date(Number.parseInt(stamp.substring(rndIdx, rndIdx + 8), 16) * 1e3);
      });
      /**
       * Set the counter to a specific value.
       */
      __publicField(this, "setCounter", (counter) => {
        this.counter = counter;
      });
      /**
       * Validate given UID contains only characters from the instanced dictionary or optionally provided dictionary.
       */
      __publicField(this, "validate", (uid, dictionary) => {
        const finalDictionary = dictionary ? this._normalizeDictionary(dictionary) : this.dict;
        return uid.split("").every((c) => finalDictionary.includes(c));
      });
      const options = __spreadValues(__spreadValues({}, DEFAULT_OPTIONS), argOptions);
      this.counter = 0;
      this.debug = false;
      this.dict = [];
      this.version = version;
      const { dictionary, shuffle, length, counter } = options;
      this.uuidLength = length;
      this.setDictionary(dictionary, shuffle);
      this.setCounter(counter);
      this.debug = options.debug;
      this.log(this.dict);
      this.log(
        "Generator instantiated with Dictionary Size ".concat(this.dictLength, " and counter set to ").concat(this.counter)
      );
      this.log = this.log.bind(this);
      this.setDictionary = this.setDictionary.bind(this);
      this.setCounter = this.setCounter.bind(this);
      this.seq = this.seq.bind(this);
      this.sequentialUUID = this.sequentialUUID.bind(this);
      this.rnd = this.rnd.bind(this);
      this.randomUUID = this.randomUUID.bind(this);
      this.fmt = this.fmt.bind(this);
      this.formattedUUID = this.formattedUUID.bind(this);
      this.availableUUIDs = this.availableUUIDs.bind(this);
      this.approxMaxBeforeCollision = this.approxMaxBeforeCollision.bind(this);
      this.collisionProbability = this.collisionProbability.bind(this);
      this.uniqueness = this.uniqueness.bind(this);
      this.getVersion = this.getVersion.bind(this);
      this.stamp = this.stamp.bind(this);
      this.parseStamp = this.parseStamp.bind(this);
    }
  };
  /** @hidden */
  __publicField(_ShortUniqueId, "default", _ShortUniqueId);
  var ShortUniqueId = _ShortUniqueId;
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=short-unique-id.js.map
 true&&(module.exports=ShortUniqueId.default),'undefined'!=typeof window&&(ShortUniqueId=ShortUniqueId.default);

/***/ },

/***/ "./node_modules/util/support/isBufferBrowser.js"
/*!******************************************************!*\
  !*** ./node_modules/util/support/isBufferBrowser.js ***!
  \******************************************************/
(module) {

module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}

/***/ },

/***/ "./node_modules/util/support/types.js"
/*!********************************************!*\
  !*** ./node_modules/util/support/types.js ***!
  \********************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
// Currently in sync with Node.js lib/internal/util/types.js
// https://github.com/nodejs/node/commit/112cc7c27551254aa2b17098fb774867f05ed0d9



var isArgumentsObject = __webpack_require__(/*! is-arguments */ "./node_modules/is-arguments/index.js");
var isGeneratorFunction = __webpack_require__(/*! is-generator-function */ "./node_modules/is-generator-function/index.js");
var whichTypedArray = __webpack_require__(/*! which-typed-array */ "./node_modules/which-typed-array/index.js");
var isTypedArray = __webpack_require__(/*! is-typed-array */ "./node_modules/is-typed-array/index.js");

function uncurryThis(f) {
  return f.call.bind(f);
}

var BigIntSupported = typeof BigInt !== 'undefined';
var SymbolSupported = typeof Symbol !== 'undefined';

var ObjectToString = uncurryThis(Object.prototype.toString);

var numberValue = uncurryThis(Number.prototype.valueOf);
var stringValue = uncurryThis(String.prototype.valueOf);
var booleanValue = uncurryThis(Boolean.prototype.valueOf);

if (BigIntSupported) {
  var bigIntValue = uncurryThis(BigInt.prototype.valueOf);
}

if (SymbolSupported) {
  var symbolValue = uncurryThis(Symbol.prototype.valueOf);
}

function checkBoxedPrimitive(value, prototypeValueOf) {
  if (typeof value !== 'object') {
    return false;
  }
  try {
    prototypeValueOf(value);
    return true;
  } catch(e) {
    return false;
  }
}

exports.isArgumentsObject = isArgumentsObject;
exports.isGeneratorFunction = isGeneratorFunction;
exports.isTypedArray = isTypedArray;

// Taken from here and modified for better browser support
// https://github.com/sindresorhus/p-is-promise/blob/cda35a513bda03f977ad5cde3a079d237e82d7ef/index.js
function isPromise(input) {
	return (
		(
			typeof Promise !== 'undefined' &&
			input instanceof Promise
		) ||
		(
			input !== null &&
			typeof input === 'object' &&
			typeof input.then === 'function' &&
			typeof input.catch === 'function'
		)
	);
}
exports.isPromise = isPromise;

function isArrayBufferView(value) {
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
    return ArrayBuffer.isView(value);
  }

  return (
    isTypedArray(value) ||
    isDataView(value)
  );
}
exports.isArrayBufferView = isArrayBufferView;


function isUint8Array(value) {
  return whichTypedArray(value) === 'Uint8Array';
}
exports.isUint8Array = isUint8Array;

function isUint8ClampedArray(value) {
  return whichTypedArray(value) === 'Uint8ClampedArray';
}
exports.isUint8ClampedArray = isUint8ClampedArray;

function isUint16Array(value) {
  return whichTypedArray(value) === 'Uint16Array';
}
exports.isUint16Array = isUint16Array;

function isUint32Array(value) {
  return whichTypedArray(value) === 'Uint32Array';
}
exports.isUint32Array = isUint32Array;

function isInt8Array(value) {
  return whichTypedArray(value) === 'Int8Array';
}
exports.isInt8Array = isInt8Array;

function isInt16Array(value) {
  return whichTypedArray(value) === 'Int16Array';
}
exports.isInt16Array = isInt16Array;

function isInt32Array(value) {
  return whichTypedArray(value) === 'Int32Array';
}
exports.isInt32Array = isInt32Array;

function isFloat32Array(value) {
  return whichTypedArray(value) === 'Float32Array';
}
exports.isFloat32Array = isFloat32Array;

function isFloat64Array(value) {
  return whichTypedArray(value) === 'Float64Array';
}
exports.isFloat64Array = isFloat64Array;

function isBigInt64Array(value) {
  return whichTypedArray(value) === 'BigInt64Array';
}
exports.isBigInt64Array = isBigInt64Array;

function isBigUint64Array(value) {
  return whichTypedArray(value) === 'BigUint64Array';
}
exports.isBigUint64Array = isBigUint64Array;

function isMapToString(value) {
  return ObjectToString(value) === '[object Map]';
}
isMapToString.working = (
  typeof Map !== 'undefined' &&
  isMapToString(new Map())
);

function isMap(value) {
  if (typeof Map === 'undefined') {
    return false;
  }

  return isMapToString.working
    ? isMapToString(value)
    : value instanceof Map;
}
exports.isMap = isMap;

function isSetToString(value) {
  return ObjectToString(value) === '[object Set]';
}
isSetToString.working = (
  typeof Set !== 'undefined' &&
  isSetToString(new Set())
);
function isSet(value) {
  if (typeof Set === 'undefined') {
    return false;
  }

  return isSetToString.working
    ? isSetToString(value)
    : value instanceof Set;
}
exports.isSet = isSet;

function isWeakMapToString(value) {
  return ObjectToString(value) === '[object WeakMap]';
}
isWeakMapToString.working = (
  typeof WeakMap !== 'undefined' &&
  isWeakMapToString(new WeakMap())
);
function isWeakMap(value) {
  if (typeof WeakMap === 'undefined') {
    return false;
  }

  return isWeakMapToString.working
    ? isWeakMapToString(value)
    : value instanceof WeakMap;
}
exports.isWeakMap = isWeakMap;

function isWeakSetToString(value) {
  return ObjectToString(value) === '[object WeakSet]';
}
isWeakSetToString.working = (
  typeof WeakSet !== 'undefined' &&
  isWeakSetToString(new WeakSet())
);
function isWeakSet(value) {
  return isWeakSetToString(value);
}
exports.isWeakSet = isWeakSet;

function isArrayBufferToString(value) {
  return ObjectToString(value) === '[object ArrayBuffer]';
}
isArrayBufferToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  isArrayBufferToString(new ArrayBuffer())
);
function isArrayBuffer(value) {
  if (typeof ArrayBuffer === 'undefined') {
    return false;
  }

  return isArrayBufferToString.working
    ? isArrayBufferToString(value)
    : value instanceof ArrayBuffer;
}
exports.isArrayBuffer = isArrayBuffer;

function isDataViewToString(value) {
  return ObjectToString(value) === '[object DataView]';
}
isDataViewToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  typeof DataView !== 'undefined' &&
  isDataViewToString(new DataView(new ArrayBuffer(1), 0, 1))
);
function isDataView(value) {
  if (typeof DataView === 'undefined') {
    return false;
  }

  return isDataViewToString.working
    ? isDataViewToString(value)
    : value instanceof DataView;
}
exports.isDataView = isDataView;

// Store a copy of SharedArrayBuffer in case it's deleted elsewhere
var SharedArrayBufferCopy = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined;
function isSharedArrayBufferToString(value) {
  return ObjectToString(value) === '[object SharedArrayBuffer]';
}
function isSharedArrayBuffer(value) {
  if (typeof SharedArrayBufferCopy === 'undefined') {
    return false;
  }

  if (typeof isSharedArrayBufferToString.working === 'undefined') {
    isSharedArrayBufferToString.working = isSharedArrayBufferToString(new SharedArrayBufferCopy());
  }

  return isSharedArrayBufferToString.working
    ? isSharedArrayBufferToString(value)
    : value instanceof SharedArrayBufferCopy;
}
exports.isSharedArrayBuffer = isSharedArrayBuffer;

function isAsyncFunction(value) {
  return ObjectToString(value) === '[object AsyncFunction]';
}
exports.isAsyncFunction = isAsyncFunction;

function isMapIterator(value) {
  return ObjectToString(value) === '[object Map Iterator]';
}
exports.isMapIterator = isMapIterator;

function isSetIterator(value) {
  return ObjectToString(value) === '[object Set Iterator]';
}
exports.isSetIterator = isSetIterator;

function isGeneratorObject(value) {
  return ObjectToString(value) === '[object Generator]';
}
exports.isGeneratorObject = isGeneratorObject;

function isWebAssemblyCompiledModule(value) {
  return ObjectToString(value) === '[object WebAssembly.Module]';
}
exports.isWebAssemblyCompiledModule = isWebAssemblyCompiledModule;

function isNumberObject(value) {
  return checkBoxedPrimitive(value, numberValue);
}
exports.isNumberObject = isNumberObject;

function isStringObject(value) {
  return checkBoxedPrimitive(value, stringValue);
}
exports.isStringObject = isStringObject;

function isBooleanObject(value) {
  return checkBoxedPrimitive(value, booleanValue);
}
exports.isBooleanObject = isBooleanObject;

function isBigIntObject(value) {
  return BigIntSupported && checkBoxedPrimitive(value, bigIntValue);
}
exports.isBigIntObject = isBigIntObject;

function isSymbolObject(value) {
  return SymbolSupported && checkBoxedPrimitive(value, symbolValue);
}
exports.isSymbolObject = isSymbolObject;

function isBoxedPrimitive(value) {
  return (
    isNumberObject(value) ||
    isStringObject(value) ||
    isBooleanObject(value) ||
    isBigIntObject(value) ||
    isSymbolObject(value)
  );
}
exports.isBoxedPrimitive = isBoxedPrimitive;

function isAnyArrayBuffer(value) {
  return typeof Uint8Array !== 'undefined' && (
    isArrayBuffer(value) ||
    isSharedArrayBuffer(value)
  );
}
exports.isAnyArrayBuffer = isAnyArrayBuffer;

['isProxy', 'isExternal', 'isModuleNamespaceObject'].forEach(function(method) {
  Object.defineProperty(exports, method, {
    enumerable: false,
    value: function() {
      throw new Error(method + ' is not supported in userland');
    }
  });
});


/***/ },

/***/ "./node_modules/util/util.js"
/*!***********************************!*\
  !*** ./node_modules/util/util.js ***!
  \***********************************/
(__unused_webpack_module, exports, __webpack_require__) {

/* provided dependency */ var process = __webpack_require__(/*! process/browser */ "./node_modules/process/browser.js");
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors ||
  function getOwnPropertyDescriptors(obj) {
    var keys = Object.keys(obj);
    var descriptors = {};
    for (var i = 0; i < keys.length; i++) {
      descriptors[keys[i]] = Object.getOwnPropertyDescriptor(obj, keys[i]);
    }
    return descriptors;
  };

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  if (typeof process !== 'undefined' && process.noDeprecation === true) {
    return fn;
  }

  // Allow for deprecating things in the process of starting up.
  if (typeof process === 'undefined') {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnvRegex = /^$/;

if (process.env.NODE_DEBUG) {
  var debugEnv = process.env.NODE_DEBUG;
  debugEnv = debugEnv.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/,/g, '$|^')
    .toUpperCase();
  debugEnvRegex = new RegExp('^' + debugEnv + '$', 'i');
}
exports.debuglog = function(set) {
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (debugEnvRegex.test(set)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').slice(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.slice(1, -1);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
exports.types = __webpack_require__(/*! ./support/types */ "./node_modules/util/support/types.js");

function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;
exports.types.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;
exports.types.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;
exports.types.isNativeError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = __webpack_require__(/*! ./support/isBuffer */ "./node_modules/util/support/isBufferBrowser.js");

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = __webpack_require__(/*! inherits */ "./node_modules/inherits/inherits_browser.js");

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var kCustomPromisifiedSymbol = typeof Symbol !== 'undefined' ? Symbol('util.promisify.custom') : undefined;

exports.promisify = function promisify(original) {
  if (typeof original !== 'function')
    throw new TypeError('The "original" argument must be of type Function');

  if (kCustomPromisifiedSymbol && original[kCustomPromisifiedSymbol]) {
    var fn = original[kCustomPromisifiedSymbol];
    if (typeof fn !== 'function') {
      throw new TypeError('The "util.promisify.custom" argument must be of type Function');
    }
    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn, enumerable: false, writable: false, configurable: true
    });
    return fn;
  }

  function fn() {
    var promiseResolve, promiseReject;
    var promise = new Promise(function (resolve, reject) {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    args.push(function (err, value) {
      if (err) {
        promiseReject(err);
      } else {
        promiseResolve(value);
      }
    });

    try {
      original.apply(this, args);
    } catch (err) {
      promiseReject(err);
    }

    return promise;
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

  if (kCustomPromisifiedSymbol) Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn, enumerable: false, writable: false, configurable: true
  });
  return Object.defineProperties(
    fn,
    getOwnPropertyDescriptors(original)
  );
}

exports.promisify.custom = kCustomPromisifiedSymbol

function callbackifyOnRejected(reason, cb) {
  // `!reason` guard inspired by bluebird (Ref: https://goo.gl/t5IS6M).
  // Because `null` is a special error value in callbacks which means "no error
  // occurred", we error-wrap so the callback consumer can distinguish between
  // "the promise rejected with null" or "the promise fulfilled with undefined".
  if (!reason) {
    var newReason = new Error('Promise was rejected with a falsy value');
    newReason.reason = reason;
    reason = newReason;
  }
  return cb(reason);
}

function callbackify(original) {
  if (typeof original !== 'function') {
    throw new TypeError('The "original" argument must be of type Function');
  }

  // We DO NOT return the promise as it gives the user a false sense that
  // the promise is actually somehow related to the callback's execution
  // and that the callback throwing will reject the promise.
  function callbackified() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    var maybeCb = args.pop();
    if (typeof maybeCb !== 'function') {
      throw new TypeError('The last argument must be of type Function');
    }
    var self = this;
    var cb = function() {
      return maybeCb.apply(self, arguments);
    };
    // In true node style we process the callback on `nextTick` with all the
    // implications (stack, `uncaughtException`, `async_hooks`)
    original.apply(this, args)
      .then(function(ret) { process.nextTick(cb.bind(null, null, ret)) },
            function(rej) { process.nextTick(callbackifyOnRejected.bind(null, rej, cb)) });
  }

  Object.setPrototypeOf(callbackified, Object.getPrototypeOf(original));
  Object.defineProperties(callbackified,
                          getOwnPropertyDescriptors(original));
  return callbackified;
}
exports.callbackify = callbackify;


/***/ },

/***/ "./node_modules/which-typed-array/index.js"
/*!*************************************************!*\
  !*** ./node_modules/which-typed-array/index.js ***!
  \*************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var forEach = __webpack_require__(/*! for-each */ "./node_modules/for-each/index.js");
var availableTypedArrays = __webpack_require__(/*! available-typed-arrays */ "./node_modules/available-typed-arrays/index.js");
var callBind = __webpack_require__(/*! call-bind */ "./node_modules/call-bind/index.js");
var callBound = __webpack_require__(/*! call-bound */ "./node_modules/call-bound/index.js");
var gOPD = __webpack_require__(/*! gopd */ "./node_modules/gopd/index.js");
var getProto = __webpack_require__(/*! get-proto */ "./node_modules/get-proto/index.js");

var $toString = callBound('Object.prototype.toString');
var hasToStringTag = __webpack_require__(/*! has-tostringtag/shams */ "./node_modules/has-tostringtag/shams.js")();

var g = typeof globalThis === 'undefined' ? __webpack_require__.g : globalThis;
var typedArrays = availableTypedArrays();

var $slice = callBound('String.prototype.slice');

/** @type {<T = unknown>(array: readonly T[], value: unknown) => number} */
var $indexOf = callBound('Array.prototype.indexOf', true) || function indexOf(array, value) {
	for (var i = 0; i < array.length; i += 1) {
		if (array[i] === value) {
			return i;
		}
	}
	return -1;
};

/** @typedef {import('./types').Getter} Getter */
/** @type {import('./types').Cache} */
var cache = { __proto__: null };
if (hasToStringTag && gOPD && getProto) {
	forEach(typedArrays, function (typedArray) {
		var arr = new g[typedArray]();
		if (Symbol.toStringTag in arr && getProto) {
			var proto = getProto(arr);
			// @ts-expect-error TS won't narrow inside a closure
			var descriptor = gOPD(proto, Symbol.toStringTag);
			if (!descriptor && proto) {
				var superProto = getProto(proto);
				// @ts-expect-error TS won't narrow inside a closure
				descriptor = gOPD(superProto, Symbol.toStringTag);
			}
			if (descriptor && descriptor.get) {
				var bound = callBind(descriptor.get);
				cache[
					/** @type {`$${import('.').TypedArrayName}`} */ ('$' + typedArray)
				] = bound;
			}
		}
	});
} else {
	forEach(typedArrays, function (typedArray) {
		var arr = new g[typedArray]();
		var fn = arr.slice || arr.set;
		if (fn) {
			var bound = /** @type {import('./types').BoundSlice | import('./types').BoundSet} */ (
				// @ts-expect-error TODO FIXME
				callBind(fn)
			);
			cache[
				/** @type {`$${import('.').TypedArrayName}`} */ ('$' + typedArray)
			] = bound;
		}
	});
}

/** @type {(value: object) => false | import('.').TypedArrayName} */
var tryTypedArrays = function tryAllTypedArrays(value) {
	/** @type {ReturnType<typeof tryAllTypedArrays>} */ var found = false;
	forEach(
		/** @type {Record<`\$${import('.').TypedArrayName}`, Getter>} */ (cache),
		/** @type {(getter: Getter, name: `\$${import('.').TypedArrayName}`) => void} */
		function (getter, typedArray) {
			if (!found) {
				try {
					// @ts-expect-error a throw is fine here
					if ('$' + getter(value) === typedArray) {
						found = /** @type {import('.').TypedArrayName} */ ($slice(typedArray, 1));
					}
				} catch (e) { /**/ }
			}
		}
	);
	return found;
};

/** @type {(value: object) => false | import('.').TypedArrayName} */
var trySlices = function tryAllSlices(value) {
	/** @type {ReturnType<typeof tryAllSlices>} */ var found = false;
	forEach(
		/** @type {Record<`\$${import('.').TypedArrayName}`, Getter>} */(cache),
		/** @type {(getter: Getter, name: `\$${import('.').TypedArrayName}`) => void} */ function (getter, name) {
			if (!found) {
				try {
					// @ts-expect-error a throw is fine here
					getter(value);
					found = /** @type {import('.').TypedArrayName} */ ($slice(name, 1));
				} catch (e) { /**/ }
			}
		}
	);
	return found;
};

/** @type {import('.')} */
module.exports = function whichTypedArray(value) {
	if (!value || typeof value !== 'object') { return false; }
	if (!hasToStringTag) {
		/** @type {string} */
		var tag = $slice($toString(value), 8, -1);
		if ($indexOf(typedArrays, tag) > -1) {
			return tag;
		}
		if (tag !== 'Object') {
			return false;
		}
		// node < 0.6 hits here on real Typed Arrays
		return trySlices(value);
	}
	if (!gOPD) { return null; } // unknown engine
	return tryTypedArrays(value);
};


/***/ },

/***/ "./tests/applicationClass.test.js"
/*!****************************************!*\
  !*** ./tests/applicationClass.test.js ***!
  \****************************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");
const { createUserAndPermissions } = __webpack_require__(/*! ./test-utils/pryvService */ "./tests/test-utils/pryvService.js");
const HDSLib = __webpack_require__(/*! ../js */ "./js/index.js");
const Application = HDSLib.appTemplates.Application;

describe('[APAX] Application class', function () {
  this.timeout(5000);
  const baseStreamId = 'application-class';
  const appName = 'application-app';
  let user;
  before(async () => {
    const initialStreams = [{ id: 'applications', name: 'Applications' }, { id: baseStreamId, name: appName, parentId: 'applications' }];
    const permissionsManager = [{ streamId: baseStreamId, level: 'manage' }];
    user = await createUserAndPermissions(null, permissionsManager, initialStreams, appName);
  });

  describe('[APIX] Application class internal', () => {
    it('[APIS] Application custom settings', async () => {
      class Dummy extends Application {
        get appSettings () {
          return { };
        }
      }
      const appDummy = await Dummy.newFromApiEndpoint(baseStreamId, user.appApiEndpoint, appName);

      const settings = await appDummy.getCustomSettings();
      assert.deepEqual(settings, {});
      const newSettings = { hello: 'Tom', value: 2 };
      const newSettings1 = await appDummy.setCustomSettings(newSettings);
      assert.deepEqual(newSettings, newSettings1);
      const newSettings2 = await appDummy.getCustomSettings();
      assert.deepEqual(newSettings, newSettings2);
      assert.deepEqual(newSettings1, newSettings2);
      assert.equal(newSettings1, newSettings2, 'should be the same object');
      const newSettings3 = await appDummy.getCustomSettings(true);
      assert.deepEqual(newSettings1, newSettings3);
      assert.notEqual(newSettings1, newSettings3, 'should not be the same object');
    });
  });

  describe('[APAE] Application class errors', () => {
    it('[APAI] Application extension', async () => {
      class Dummy extends Application { }

      try {
        await Dummy.newFromApiEndpoint(baseStreamId, user.appApiEndpoint, appName);
        throw new Error('Should throw an error');
      } catch (e) {
        assert.equal(e.message, 'appSettings must be implemented');
      }

      try {
      // eslint-disable-next-line no-new
        new Dummy('u', user.appApiEndpoint, appName);
        throw new Error('Should throw an error');
      } catch (e) {
        assert.equal(e.message, 'Missing or too short baseStreamId');
      }
    });

    it('[APAA] Application name from accessInfo fails in not in settings', () => {
      class Dummy extends Application {
        get appSettings () {
          return { };
        }
      }

      try {
      // eslint-disable-next-line no-new
        new Dummy(baseStreamId, user.appApiEndpoint);
        throw new Error('Should throw an error');
      } catch (e) {
        assert.equal(e.message, 'appName must be given unless appSettings.appNameFromAccessInfo = true');
      }
    });

    it('[APAB] Application name from accessInfo', async () => {
      class Dummy2 extends Application {
        get appSettings () {
          return {
            appNameFromAccessInfo: true
          };
        }
      }

      const dummy2 = await Dummy2.newFromApiEndpoint(baseStreamId, user.appApiEndpoint);
      assert.ok(dummy2, 'if appSettings.appNameFromAccessInfo = true appName is not required');
    });

    it('[APAC] Application should throw error if baseStream is not accessible', async () => {
      class Dummy extends Application {
        get appSettings () {
          return { };
        }
      }

      try {
        await Dummy.newFromApiEndpoint('uuuu', user.appApiEndpoint, appName);
        throw new Error('Should throw an error');
      } catch (e) {
        assert.equal(e.message, 'Application with "app" type of access requires  (streamId = "uuuu", level = "manage") or master access');
      }
    });

    it('[APAD] Application should throw error if personaToken are not explicity allowed', async () => {
      class Dummy extends Application {
        get appSettings () {
          return { };
        }
      }

      try {
        await Dummy.newFromApiEndpoint('uuuu', user.personalApiEndpoint, appName);
        throw new Error('Should throw an error');
      } catch (e) {
        assert.equal(e.message, 'Application should not use a personal token');
      }
    });

    it('[APAE] Application should throw error if master token not provided and required', async () => {
      class Dummy extends Application {
        get appSettings () {
          return {
            mustBemaster: true
          };
        }
      }

      try {
        await Dummy.newFromApiEndpoint('uuuu', user.appApiEndpoint, appName);
        throw new Error('Should throw an error');
      } catch (e) {
        assert.equal(e.message, 'Application with "app" type of access requires "master" token (streamId = "*", level = "manage")');
      }
    });
  });
});


/***/ },

/***/ "./tests/apptemplates.test.js"
/*!************************************!*\
  !*** ./tests/apptemplates.test.js ***!
  \************************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");
const { pryv, createUserPermissions } = __webpack_require__(/*! ./test-utils/pryvService */ "./tests/test-utils/pryvService.js");
const HDSLib = __webpack_require__(/*! ../js */ "./js/index.js");
const { AppManagingAccount, AppClientAccount, Collector, CollectorClient } = HDSLib.appTemplates;
const { HDSLibError } = __webpack_require__(/*! ../js/errors */ "./js/errors.js");
const { initHDSModel } = __webpack_require__(/*! ../js/index */ "./js/index.js");
const { helperNewAppAndUsers, helperNewInvite, helperNewAppManaging } = __webpack_require__(/*! ./test-utils/helpersAppTemplate */ "./tests/test-utils/helpersAppTemplate.js");

describe('[APTX] appTemplates', function () {
  this.timeout(10000);

  let managingUser, appManaging, clientUser, _clientUserResultPermissions, appClient;
  const baseStreamIdManager = 'test-app-template-manager';
  const baseStreamIdClient = 'test-app-template-client';
  const appName = 'Test HDSLib.appTemplates';
  const appClientName = 'Test Client HDSLib.appTemplates';

  before(async () => {
    ({ managingUser, appManaging, clientUser, clientUserResultPermissions: _clientUserResultPermissions, appClient } = await helperNewAppAndUsers(baseStreamIdManager, appName, baseStreamIdClient, appClientName));
    await initHDSModel();
  });

  it('[APTA] Full flow create collector and sharing', async () => {
    assert.equal(appManaging.appName, appName);
    assert.equal(appManaging.baseStreamId, baseStreamIdManager);

    const collectorEmpty = await appManaging.getCollectors();
    assert.ok(Array.isArray(collectorEmpty), 'Collectors should be an array');
    assert.equal(collectorEmpty.length, 0, 'Collectors should be an empty array');

    const collectorName = 'Test';
    // create a Collector
    const newCollector = await appManaging.createCollectorUnitialized(collectorName);
    assert.ok(newCollector.streamId.startsWith(baseStreamIdManager), 'Collectors id should start with baseStreamId');
    assert.ok(newCollector.name, collectorName);
    // check that streams has been addes to streamData
    assert.ok(appManaging.streamData.children[0].name, collectorName);

    // Create a Collector with the same name should fail
    try {
      await appManaging.createCollectorUnitialized(collectorName);
      throw new Error('Creating a Collector with the same name should fail');
    } catch (e) {
      assert.ok(e.message.endsWith('>> Result: {"id":"item-already-exists","message":"A stream with name \\"Test\\" already exists","data":{"name":"Test"}}"'));
      assert.equal(e.innerObject?.id, 'item-already-exists');
    }

    // check if collector is in the list
    const collectors = await appManaging.getCollectors();
    const found = collectors.find(c => c.name === collectorName);
    if (!found) throw new Error('Should find collector with name: ' + collectorName);
    assert.equal(found, newCollector);

    // check StreamStructure
    const resultCheckStructure = await newCollector.checkStreamStructure();
    assert.equal(resultCheckStructure.created.length, 7, 'Should create 7 streams');
    for (const created of resultCheckStructure.created) {
      assert.equal(created.parentId, newCollector.streamId, 'Should have collector stream as parentid');
    }

    // 2nd call of StreamStructure should be empty
    const resultCheckStructure2 = await newCollector.checkStreamStructure();
    assert.equal(resultCheckStructure2.created.length, 0, 'Should create 0 streams');

    // Should throw error as status is not yet set
    try {
      newCollector.statusCode;
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'Init Collector first');
    }

    await newCollector.init();

    // Get status
    assert.equal(newCollector.statusCode, 'draft');

    // trying to get a sharing token in draft should throw an error
    try {
      await newCollector.sharingApiEndpoint();
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'Collector must be in "active" state error to get sharing link, current: draft');
    }

    // trying to create an invite in draft should throw an error
    try {
      await newCollector.createInvite({});
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'Collector must be in "active" state error to create invite, current: draft');
    }

    // Publish
    await newCollector.publish();

    // Sharing token creation
    const sharingApiEndpoint = await newCollector.sharingApiEndpoint();
    assert.ok(sharingApiEndpoint.startsWith('https://'));

    // Should return the same
    const sharingApiEndpoint2 = await newCollector.sharingApiEndpoint();
    assert.equal(sharingApiEndpoint2, sharingApiEndpoint);

    // ---------- creation of a manager on existing structure ---------- //

    // creating a new Manager with same connection should load the structure
    const connection2 = new pryv.Connection(appManaging.connection.apiEndpoint);
    const appManaging2 = await AppManagingAccount.newFromConnection(baseStreamIdManager, connection2);
    // check if collector is in the list
    const collectors2 = await appManaging2.getCollectors();
    const collector2 = collectors2.find(c => c.name === collectorName);
    if (!collector2) throw new Error('Should find collector with name: ' + collectorName);
    // init collector found;
    await collector2.init();
    // call of StreamStructure should be empty as already created
    const resultCheckStructure3 = await collector2.checkStreamStructure();
    assert.equal(resultCheckStructure3.created.length, 0, 'Should create 0 streams');
    // should return the same access access point
    const sharingApiEndpoint3 = await collector2.sharingApiEndpoint();
    assert.equal(sharingApiEndpoint3, sharingApiEndpoint);
  });

  describe('[APIX] Collector invite flows & internals', async function () {
    this.timeout(10000);

    it('[APTI] Collector invite accept full flow testing internal', async () => {
      const newCollector = await appManaging.createCollector('Invite test 1');
      assert(newCollector.statusCode, 'draft');

      // set request content
      const requestContent = {
        version: 1,
        requester: {
          name: 'Test requester name'
        },
        title: {
          en: 'Title of the request'
        },
        description: {
          en: 'Short Description'
        },
        consent: {
          en: 'This is a consent message'
        },
        features: { },
        permissionsExtra: [],
        permissions: [
          { streamId: 'profile-name', defaultName: 'Name', level: 'read' },
          {
            streamId: 'profile-date-of-birth',
            defaultName: 'Date of Birth',
            level: 'read'
          }
        ],
        app: { // may have "url" in the future
          id: 'test-app',
          url: 'https://xxx.yyy',
          data: { // settings for the app
            dummy: 'dummy'
          }
        },
        sections: [{
          itemKeys: [
            'profile-name',
            'profile-surname'
          ],
          key: 'profile',
          name: {
            en: 'Profile'
          },
          type: 'permanent'
        },
        {
          itemKeys: ['fertility-ttc-tta', 'body-weight'],
          key: 'history',
          name: {
            en: 'History'
          },
          type: 'recurring'
        }
        ]
      };
      newCollector.request.setContent(requestContent);

      // save
      await newCollector.save();
      assert.deepEqual(newCollector.request.content, requestContent);
      assert.ok(newCollector.request.content !== requestContent, 'Should be the same content but different objects');
      // publish
      await newCollector.publish();
      assert.equal(newCollector.statusCode, Collector.STATUSES.active);

      // create invite
      const options = { customData: { hello: 'bob' } };
      const invite = await newCollector.createInvite('Invite One', options);
      assert.equal(invite.status, 'pending');
      const inviteSharingData = await invite.getSharingData();
      assert.equal(inviteSharingData.apiEndpoint, await newCollector.sharingApiEndpoint());
      assert.ok(invite.key.length > 5);
      assert.ok(inviteSharingData.eventId.length > 5);

      // check invite can be found in "pendings"
      const inviteEvent = await appManaging.connection.apiOne('events.getOne', { id: inviteSharingData.eventId }, 'event');
      assert.equal(inviteEvent.type, 'invite/collector-v1');
      assert.ok(inviteEvent.streamIds[0].endsWith('-pending'));
      assert.deepEqual(inviteEvent.content, { name: 'Invite One', customData: options.customData });

      // also on current invites
      const invites1 = await newCollector.getInvites();
      assert.equal(invites1.length, 1);
      assert.equal(invites1[0].status, 'pending');

      // Invitee receives the invite
      const permissionsClient = [{ streamId: '*', level: 'manage' }];
      const myClientUserPermissionsResult = await createUserPermissions(clientUser, permissionsClient, [], appClientName + 'APTI');

      const myAppClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, myClientUserPermissionsResult.appApiEndpoint, appClientName);
      const collectorClient = await myAppClient.handleIncomingRequest(inviteSharingData.apiEndpoint, inviteSharingData.eventId);
      assert.equal(collectorClient.eventData.streamIds[0], myAppClient.baseStreamId);
      assert.equal(collectorClient.eventData.content.apiEndpoint, inviteSharingData.apiEndpoint);
      assert.equal(collectorClient.eventData.content.requesterEventId, inviteSharingData.eventId);

      // TODO check collectorClient.eventData.accessInfo

      // check collectorClients
      const collectorClientsCached = await myAppClient.getCollectorClients();
      assert.equal(collectorClientsCached.length, 1);
      const collectorClients = await myAppClient.getCollectorClients(true);
      assert.equal(collectorClients.length, 1);

      // collectorClients can be retrieved by key
      const found = await myAppClient.getCollectorClientByKey(collectorClient.key);
      assert.equal(found, collectorClients[0]);

      // check requestData
      assert.deepEqual(collectorClient.requestData, requestContent);

      // accept
      const acceptResult = await collectorClient.accept();
      assert.equal(acceptResult.requesterEvent.content.eventId, inviteSharingData.eventId);
      assert.ok(!!acceptResult.requesterEvent.content.apiEndpoint);
      assert.equal(collectorClient.status, 'Active');

      // try to re-accept throws an error
      try {
        await collectorClient.accept();
        throw new Error('should throw error');
      } catch (e) {
        assert.equal(e.message, 'Cannot accept an Active CollectorClient');
      }

      // force refresh and check online
      const collectorClients2 = await myAppClient.getCollectorClients(true);
      assert.equal(collectorClients2.length, 1);
      assert.deepEqual(collectorClients2[0].accessData, acceptResult.accessData);

      // Continue on Collector side
      const invitesFromInbox = await newCollector.checkInbox();
      assert.equal(invitesFromInbox[0].eventData.type, 'invite/collector-v1');
      assert.equal(invitesFromInbox[0].status, 'active');

      // check current invites
      const invites2 = await newCollector.getInvites(true);
      assert.equal(invites2.length, 1);
      assert.equal(invites2[0], invitesFromInbox[0]);
      assert.equal(invites2[0].status, 'active');
    });

    it('[APIA] Collector invite accept', async () => {
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APIA');
      assert.ok(invite.status, 'pending');
      assert.ok(!collectorClient.hasChatFeature);
      await collectorClient.accept();
      await collector.checkInbox();
      assert.ok(invite.status, 'active');
      assert.ok(!invite.hasChat);
    });

    it('[APIZ] Collector - with chat', async () => {
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APIZ', { addChat: true });
      assert.ok(collectorClient.hasChatFeature);
      await collectorClient.accept();
      await collector.checkInbox();
      assert.ok(invite.hasChat);
      const expectedChatSettings = {
        type: 'user',
        streamRead: `chat-${managingUser.username}`,
        streamWrite: `chat-${managingUser.username}-in`
      };
      assert.deepEqual(invite.chatSettings, expectedChatSettings);
      // -- post Chat From Doctor
      await invite.chatPost('Hello Patient');

      // -- post Chat From Patient
      await collectorClient.chatPost(appClient.connection, 'Hello Dr.');

      // check events on patient side
      const eventsOnPatient = await appClient.connection.apiOne('events.get', { types: ['message/hds-chat-v1'] }, 'events');
      assert.equal(eventsOnPatient[0].content, 'Hello Dr.');
      assert.deepEqual(collectorClient.chatEventInfos(eventsOnPatient[0]), { source: 'me' });
      assert.equal(eventsOnPatient[1].content, 'Hello Patient');
      assert.deepEqual(collectorClient.chatEventInfos(eventsOnPatient[1]), { source: 'requester' });

      // check events on patient side
      const eventsOnDr = await invite.connection.apiOne('events.get', { types: ['message/hds-chat-v1'] }, 'events');
      assert.equal(eventsOnDr[0].content, 'Hello Dr.');
      assert.deepEqual(invite.chatEventInfos(eventsOnDr[0]), { source: 'user' });
      assert.equal(eventsOnDr[1].content, 'Hello Patient');
      assert.deepEqual(invite.chatEventInfos(eventsOnDr[1]), { source: 'me' });
    });

    it('[APII] Collector invite internals', async () => {
      const beforeCreation = new Date();
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APII');
      const afterCreation = new Date();
      assert.ok(invite.dateCreation > beforeCreation && invite.dateCreation < afterCreation);

      // apiEndpoint should throw Error
      try {
        invite.apiEndpoint;
        throw new HDSLibError('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'invite.apiEndpoint is accessible only when active');
      }

      await collectorClient.accept();
      await collector.checkInbox();

      invite.apiEndpoint; // should not throw error

      // connection is cached and valid
      const connection = invite.connection;
      const inviteInfo = await connection.accessInfo();
      assert.ok(!!inviteInfo.clientData.hdsCollectorClient);
    });

    it('[APTR] Collector invite refuse', async () => {
      const { collector, collectorClient, inviteSharingData } = await helperNewInvite(appManaging, appClient, 'APTR');
      const refuseResult = await collectorClient.refuse();
      assert.equal(refuseResult.requesterEvent.content.eventId, inviteSharingData.eventId);
      assert.equal(collectorClient.status, 'Refused');

      // check collector
      const invitesFromInbox = await collector.checkInbox();
      assert.equal(invitesFromInbox[0].eventData.type, 'invite/collector-v1');
      assert.equal(invitesFromInbox[0].status, 'error');
      assert.equal(invitesFromInbox[0].errorType, 'refused');
    });

    it('[APCR] Collector Client invite revoke', async () => {
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APCR');
      await collectorClient.accept();

      // check collector
      const invitesFromInbox1 = await collector.checkInbox();
      assert.equal(invitesFromInbox1[0], invite);
      assert.equal(invite.status, 'active');

      // client revoke
      await collectorClient.revoke();
      assert.equal(collectorClient.status, 'Deactivated');
      assert.ok(collectorClient.accessData.deleted);

      // check collector
      const invitesFromInbox2 = await collector.checkInbox();
      assert.equal(invitesFromInbox2[0], invite);
      assert.equal(invite.status, 'error');
      assert.equal(invite.errorType, 'revoked');
    });

    it('[APCM] Collector (manager) invite revoke after accept', async () => {
      const { collector, collectorClient, invite } = await helperNewInvite(appManaging, appClient, 'APCM');
      await collectorClient.accept();

      // check collector
      const invitesFromInbox1 = await collector.checkInbox();
      assert.equal(invitesFromInbox1[0], invite);
      assert.equal(invite.status, 'active');

      // revoke invitation
      await invite.revoke();
      assert.equal(invite.status, 'error');
      assert.equal(invite.errorType, 'revoked');

      // check if authorization is revoked

      const res = await invite.connection.accessInfo();
      assert.equal(res.error.id, 'invalid-access-token');
    });

    it('[APCV] Collector convert v0 to v1 correctly', async () => {
      const newCollector = await appManaging.createCollector('Invite test APCV');

      const requestContent = {
        version: 0,
        requester: {
          name: 'Test requester name'
        },
        title: {
          en: 'Title of the request'
        },
        description: {
          en: 'Short Description'
        },
        consent: {
          en: 'This is a consent message'
        },
        features: { },
        permissions: [
          { streamId: 'profile-name', defaultName: 'Name', level: 'read' },
          {
            streamId: 'profile-date-of-birth',
            defaultName: 'Date of Birth',
            level: 'read'
          }
        ],
        app: { // may have "url" in the future
          id: 'test-app',
          url: 'https://xxx.yyy',
          data: { // settings for the app
            dummy: 'dummy',
            forms: {
              profile: {
                itemKeys: [
                  'profile-name',
                  'profile-surname'
                ],
                name: 'Profile',
                type: 'permanent'
              }
            }
          }
        }
      };

      // set expected content
      const expectedContent = {
        version: 1,
        requester: {
          name: 'Test requester name'
        },
        title: {
          en: 'Title of the request'
        },
        description: {
          en: 'Short Description'
        },
        consent: {
          en: 'This is a consent message'
        },
        features: { },
        permissionsExtra: [],
        permissions: [
          { streamId: 'profile-name', defaultName: 'Name', level: 'read' },
          {
            streamId: 'profile-date-of-birth',
            defaultName: 'Date of Birth',
            level: 'read'
          }
        ],
        app: { // may have "url" in the future
          id: 'test-app',
          url: 'https://xxx.yyy',
          data: { // settings for the app
            dummy: 'dummy'
          }
        },
        sections: [{
          itemKeys: [
            'profile-name',
            'profile-surname'
          ],
          key: 'profile',
          name: {
            en: 'Profile'
          },
          type: 'permanent'
        }
        ]
      };
      newCollector.request.setContent(requestContent);
      assert.deepEqual(newCollector.request.content, expectedContent);
    });
  });

  describe('[APEX] Errors ', () => {
    it('[APEH] Collector.client handleIncoming Request Errors', async function () {
      this.timeout(20000);
      const new0 = await helperNewAppAndUsers('dummy', 'dummyApp', 'dummyC', 'dummyCApp');
      const inv0 = await helperNewInvite(new0.appManaging, new0.appClient, 'APEH');

      // Already known but different incomingEnventId
      try {
        await new0.appClient.handleIncomingRequest(inv0.inviteSharingData.apiEndpoint, 'bogusId');
        throw new Error('should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Found existing collectorClient with a different eventId');
      }

      // -- The following case happens when a user revokes its app permission
      // and re-grant other permissions to the same app

      // revoke appManaging
      await new0.appManaging.connection.revoke();
      // create a new appManaging with the same name for the same user
      const manager1 = await helperNewAppManaging('dummy', 'dummyApp', new0.managingUser);
      // get invites from precedent collector
      const collector1 = (await manager1.appManaging.getCollectors())[0];
      await collector1.init();
      const inv1 = (await collector1.getInvites())[0];
      const inviteSharingData1 = await inv1.getSharingData();
      // Already known but different incomingEnventId
      try {
        await new0.appClient.handleIncomingRequest(inviteSharingData1.apiEndpoint, inviteSharingData1.eventId);
        throw new Error('should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Found existing collectorClient with a different apiEndpoint');
      }

      // reset to new incoming (might be implement later)
      const requesterConnection = new pryv.Connection(inviteSharingData1.apiEndpoint);
      const accessInfo = await requesterConnection.accessInfo();
      const collectorClient = await new0.appClient.getCollectorClientByKey(CollectorClient.keyFromInfo(accessInfo));
      await collectorClient.reset(inviteSharingData1.apiEndpoint, inviteSharingData1.eventId);
      assert.equal(collectorClient.status, CollectorClient.STATUSES.incoming);
    });
  });

  describe('[APCX] app Templates Client', function () {
    it('[APCE] Should throw error if not initialized with a personal or master token', async () => {
      const permissionsDummy = [{ streamId: 'dummy', level: 'manage' }];
      const clientUserNonMaster = await createUserPermissions(clientUser, permissionsDummy, [], appName);
      // non master app
      try {
        await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUserNonMaster.appApiEndpoint, appClientName);
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, `Application with "app" type of access requires  (streamId = "${baseStreamIdClient}", level = "manage") or master access`);
      }
      // personal
      const appClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUser.apiEndpoint, appClientName);
      assert.equal(appClient.streamData.id, baseStreamIdClient);
      assert.equal(appClient.streamData.name, appClientName);
    });
  });
});


/***/ },

/***/ "./tests/apptemplatesRequest.test.js"
/*!*******************************************!*\
  !*** ./tests/apptemplatesRequest.test.js ***!
  \*******************************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { initHDSModel } = __webpack_require__(/*! ../js */ "./js/index.js");
const { helperNewAppManaging } = __webpack_require__(/*! ./test-utils/helpersAppTemplate */ "./tests/test-utils/helpersAppTemplate.js");
const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");

describe('[APRX] appTemplates Requests', function () {
  this.timeout(8000);

  before(async () => {
    await initHDSModel();
  });
  it('[APRC] Compute a simple request', async () => {
    const baseStreamId = 'aprc';
    const { appManaging } = await helperNewAppManaging(baseStreamId, 'test-APRC');
    const newCollector = await appManaging.createCollector('Invite test APCV');

    const request = newCollector.request;
    request.appId = 'dr-form';
    request.appUrl = 'https://xxx.yyy';
    request.title = { en: 'My title' };
    request.requesterName = 'Username APRC';
    request.description = { en: 'Short Description' };
    request.consent = { en: 'Short Consent' };
    request.addPermissionExtra({ streamId: 'profile' });
    request.addPermissionExtra({ streamId: 'fertility' });

    const sectionA = request.createSection('profile', 'permanent');
    sectionA.setNameLocal('en', 'A');
    sectionA.addItemKeys([
      'profile-name',
      'profile-surname',
      'profile-sex',
      'family-children-count',
      'fertility-miscarriages-count'
    ]);

    const sectionB = request.createSection('history', 'recurring');
    sectionB.setNameLocal('en', 'B');
    sectionB.addItemKeys([
      'fertility-ttc-tta',
      'body-weight'
    ]);
    // build permissions needed
    request.buildPermissions();
    const requestContent = request.content;
    assert.ok(requestContent.id.startsWith(baseStreamId), 'id should start with the basetreamid of the manager');

    const expectedContent = {
      version: 1,
      title: { en: 'My title' },
      consent: { en: 'Short Consent' },
      description: { en: 'Short Description' },
      requester: { name: 'Username APRC' },
      features: {},
      permissionsExtra: [
        { streamId: 'profile', defaultName: 'Profile', level: 'read' },
        {
          streamId: 'fertility',
          defaultName: 'Fertility',
          level: 'read'
        }
      ],
      permissions: [
        { streamId: 'profile', defaultName: 'Profile', level: 'read' },
        { streamId: 'fertility', defaultName: 'Fertility', level: 'read' },
        {
          streamId: 'family-children',
          defaultName: 'Children',
          level: 'read'
        },
        {
          streamId: 'body-weight',
          defaultName: 'Body Weight',
          level: 'read'
        }
      ],
      app: { id: 'dr-form', url: 'https://xxx.yyy', data: {} },
      sections: [
        {
          key: 'profile',
          type: 'permanent',
          name: { en: 'A' },
          itemKeys: [
            'profile-name',
            'profile-surname',
            'profile-sex',
            'family-children-count',
            'fertility-miscarriages-count'
          ]
        },
        {
          key: 'history',
          type: 'recurring',
          name: { en: 'B' },
          itemKeys: ['fertility-ttc-tta', 'body-weight']
        }
      ],
      id: requestContent.id
    };
    assert.deepEqual(requestContent, expectedContent);
  });

  it('[APRD] A request with chat', async () => {
    const baseStreamId = 'aprd';
    const { appManaging } = await helperNewAppManaging(baseStreamId, 'test-APRD');
    const newCollector = await appManaging.createCollector('Invite test APRD');

    const request = newCollector.request;
    request.appId = 'dr-form';
    request.appUrl = 'https://xxx.yyy';
    request.title = { en: 'My title' };
    request.requesterName = 'Username APRD';
    request.description = { en: 'Short Description' };
    request.consent = { en: 'Short Consent' };
    request.addPermissionExtra({ streamId: 'profile' });
    request.addChatFeature();

    const sectionA = request.createSection('profile', 'permanent');
    sectionA.setNameLocal('en', 'A');
    sectionA.addItemKeys([
      'profile-name',
      'profile-surname'
    ]);

    // build permissions needed
    request.buildPermissions();

    const requestContent = request.content;

    assert.ok(requestContent.id.startsWith(baseStreamId), 'id should start with the basetreamid of the manager');

    const expectedContent = {
      version: 1,
      title: { en: 'My title' },
      consent: { en: 'Short Consent' },
      description: { en: 'Short Description' },
      requester: { name: 'Username APRD' },
      features: { chat: { type: 'user' } },
      permissionsExtra: [{ streamId: 'profile', defaultName: 'Profile', level: 'read' }],
      permissions: [{ streamId: 'profile', defaultName: 'Profile', level: 'read' }],
      app: { id: 'dr-form', url: 'https://xxx.yyy', data: {} },
      sections: [
        {
          key: 'profile',
          type: 'permanent',
          name: { en: 'A' },
          itemKeys: ['profile-name', 'profile-surname']
        }
      ],
      id: requestContent.id
    };
    assert.deepEqual(requestContent, expectedContent);
  });
});


/***/ },

/***/ "./tests/errors.test.js"
/*!******************************!*\
  !*** ./tests/errors.test.js ***!
  \******************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");

const { HDSLibError } = __webpack_require__(/*! ../js/errors */ "./js/errors.js");

describe('[ERRX] HDSLibError', () => {
  it('[ERRS] HDSLibError.toString() without inner message', async () => {
    const error = new HDSLibError('Hello');
    assert.equal(error.message, 'Hello');
    assert.equal('' + error, 'Error: Hello\nInner Object:\n{}');
  });

  it('[ERRM] HDSLibError.toString() with inner message', async () => {
    const innerObject = { message: 'Bob', dummy: 'Dummy' };
    const error = new HDSLibError('Hello', innerObject);
    assert.equal(error.message, 'Hello >> Bob');
    assert.equal('' + error, 'Error: Hello >> Bob\nInner Object:\n{\n  "message": "Bob",\n  "dummy": "Dummy"\n}');
    assert.deepEqual(error.innerObject, innerObject);
  });

  it('[ERRO] HDSLibError.toString() with bject without message', async () => {
    const error = new HDSLibError('Hello', { dummy: 'Dummy' });
    assert.equal(error.message, 'Hello');
    assert.equal('' + error, 'Error: Hello\nInner Object:\n{\n  "dummy": "Dummy"\n}');
  });
});


/***/ },

/***/ "./tests/hdsLib.test.js"
/*!******************************!*\
  !*** ./tests/hdsLib.test.js ***!
  \******************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");
/**
 * Tests related to HDSLib.index.js & utils
 */
const HDSLib = __webpack_require__(/*! ../js */ "./js/index.js");
const { waitUntilFalse } = __webpack_require__(/*! ../js/utils */ "./js/utils.js");
const { resetModel } = __webpack_require__(/*! ../js/HDSModel/HDSModelInitAndSingleton */ "./js/HDSModel/HDSModelInitAndSingleton.js");

describe('[HDLX] HDSLib.index', () => {
  before(async () => {
    await HDSLib.initHDSModel();
    resetModel();
  });

  it('[HDME] HDSLib.getHDSModel() throws error if not initialized', () => {
    try {
      HDSLib.getHDSModel().modelData;
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
    }

    try {
      HDSLib.getHDSModel().streams;
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Model not loaded call `HDSLib.initHDSModel()` or `await model.load()` first.');
    }
  });

  it('[HDMF] HDSLib.initHDSModel()', async () => {
    const model0 = await HDSLib.initHDSModel();
    const model1 = await HDSLib.initHDSModel();
    assert.equal(model0, model1, 'HDSLib.initHDSModel() should used cached model');
    const model2 = HDSLib.getHDSModel();
    assert.equal(model0, model2, 'HDSLib.getHDSModel() should used cached model');
    // -- refresh model
  });

  describe('[HDUX] Utils', () => {
    it('[HDUW] utils.waitUntilFalse', async function () {
      this.timeout('1000');
      let toBeSetToFalse = true;
      setTimeout(() => { toBeSetToFalse = false; }, 500);

      let count = 0;
      await waitUntilFalse(() => {
        count++;
        return toBeSetToFalse;
      }, 700);
      assert.ok(count > 2, 'should do at least 2 loops');
    });

    it('[HDUW] utils.waitUntilFalse throw timout on error', async function () {
      this.timeout('1000');
      let toBeSetToFalse = true;
      setTimeout(() => { toBeSetToFalse = false; }, 600);

      let count = 0;
      try {
        await waitUntilFalse(() => {
          count++;
          return toBeSetToFalse;
        }, 400);
        throw new Error('Should throw errors');
      } catch (e) {
        assert.equal(e.message, 'Timeout after 400ms');
      }
      assert.ok(count > 2, 'should do at least 2 loops');
    });
  });
});


/***/ },

/***/ "./tests/hdsModel.test.js"
/*!********************************!*\
  !*** ./tests/hdsModel.test.js ***!
  \********************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");

const modelURL = 'https://model.datasafe.dev/pack.json';

const { HDSModel } = __webpack_require__(/*! ../js/ */ "./js/index.js");
const { resetPreferredLocales, setPreferredLocales } = __webpack_require__(/*! ../js/localizeText */ "./js/localizeText.js");

describe('[MODX] Model', () => {
  let model;
  before(async () => {
    model = new HDSModel(modelURL);
    await model.load();
  });

  it('[MODL] Load model for item with multiple types: body-weight', async () => {
    const modelLoad = new HDSModel(modelURL);
    await modelLoad.load();
    const itemDef = modelLoad.itemsDefs.forKey('body-weight');
    assert.equal(itemDef.data.streamId, 'body-weight');
    assert.deepEqual(itemDef.eventTypes, ['mass/kg', 'mass/lb']);
    assert.equal(itemDef.key, 'body-weight');
  });

  it('[MODM] Load model for item with single type: body-vulva-wetness-feeling', async () => {
    const modelLoad = new HDSModel(modelURL);
    await modelLoad.load();
    const itemDef = modelLoad.itemsDefs.forKey('body-vulva-wetness-feeling');
    assert.deepEqual(itemDef.eventTypes, ['ratio/generic']);
  });

  it('[MODN] get All itemsDef', async () => {
    const modelLoad = new HDSModel(modelURL);
    await modelLoad.load();
    const itemDefs = modelLoad.itemsDefs.getAll();
    assert.ok(itemDefs.length > 0);
    for (const itemDef of itemDefs) {
      assert.ok(itemDef.key);
    }
  });

  // ---------- items ------------ //
  describe('[MOLX] items localization', function () {
    afterEach(() => {
      // make sure locales are set back to default after each test
      resetPreferredLocales();
    });
    it('[MOLL] Label  & Description properties are localized', () => {
      const itemDef = model.itemsDefs.forKey('body-weight');
      assert.equal(itemDef.label, 'Body weight');
      assert.equal(itemDef.description, 'Measured body weight');
      setPreferredLocales(['fr']);
      assert.equal(itemDef.label, 'Poids corporel');
      assert.equal(itemDef.description, 'Poids corporel mesuré');
    });
  });

  describe('[MOIX] items', function () {
    it('[MOIE] Throw error if itemsDefs.forKey not found', async () => {
      try {
        model.itemsDefs.forKey('dummy');
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Cannot find item definition with key: dummy');
      }
    });

    it('[MOIN] Return null with throwErrorIfNotFound = false', async () => {
      const notFound = model.itemsDefs.forKey('dummy', false);
      assert.equal(notFound, null);
    });
  });
  // ---------- events ------------ //

  describe('[MOEX] events', function () {
    it('[MODS] Get definition from event data', async () => {
      const fakeEvent = {
        streamIds: ['body-weight', 'dummy'],
        type: 'mass/kg'
      };
      const itemDef = model.itemsDefs.forEvent(fakeEvent);
      assert.equal(itemDef.data.streamId, 'body-weight');
      assert.deepEqual(itemDef.eventTypes, ['mass/kg', 'mass/lb']);
    });

    it('[MOEE] Throw error if itemsDefs.forEvent not found', async () => {
      const fakeEvent = {
        streamIds: ['dummy'],
        type: 'mass/kg'
      };
      try {
        model.itemsDefs.forEvent(fakeEvent);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Cannot find definition for event: {"streamIds":["dummy"],"type":"mass/kg"}');
      }
    });

    it('[MOEN] Return if itemsDefs.forEvent not found and throwErrorIfNotFound = false', async () => {
      const fakeEvent = {
        streamIds: ['dummy'],
        type: 'mass/kg'
      };
      const notFound = model.itemsDefs.forEvent(fakeEvent, false);
      assert.equal(notFound, null);
    });

    it('[MOED] Throw error if itemsDefs.forEvent finds duplicates', async () => {
      const fakeEvent = {
        streamIds: ['body-vulva-wetness-feeling', 'body-vulva-mucus-stretch'],
        type: 'ratio/generic'
      };
      try {
        model.itemsDefs.forEvent(fakeEvent);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Found multiple matching definitions "body-vulva-wetness-feeling, body-vulva-mucus-stretch" for event: {"streamIds":["body-vulva-wetness-feeling","body-vulva-mucus-stretch"],"type":"ratio/generic"}');
      }
    });
  });

  // ----------- event types ----------- //
  describe('[MOTX] eventTypes', function () {
    it('[MOTA] event type definition', async () => {
      const eventTypeDev = model.eventTypes.getEventTypeDefinition('temperature/c');
      assert.deepEqual(eventTypeDev, { description: 'Celsius', type: 'number' });
    });

    it('[MOTB] extra definition', async () => {
      const eventTypeExtra = model.eventTypes.getEventTypeExtra('temperature/c');
      assert.deepEqual(eventTypeExtra, { name: { en: 'Degrees Celsius', fr: 'Degrés Celsius' }, symbol: '°C' });
    });

    it('[MOTC] symbol exists', async () => {
      const eventTypeSymbol = model.eventTypes.getEventTypeSymbol('temperature/c');
      assert.deepEqual(eventTypeSymbol, '°C');
    });

    it('[MOTD] symbol not exists', async () => {
      const eventTypeSymbol = model.eventTypes.getEventTypeSymbol('audio/attached');
      assert.deepEqual(eventTypeSymbol, null);
    });
  });

  // ---------- streams ------------ //

  describe('[MOSX] streams', function () {
    it('[MOSB] Streams Data by Id', async () => {
      const streamData = model.streams.getDataById('fertility-cycles-start');
      assert.equal(streamData.parentId, 'fertility-cycles');
    });

    it('[MOSE] Streams Data by Id, Throw Error if not found', async () => {
      try {
        model.streams.getDataById('dummy');
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Stream with id: "dummy" not found');
      }
    });

    it('[MOSP] Streams Data parents', async () => {
      const streamParentIds = model.streams.getParentsIds('fertility-cycles-start');
      assert.deepEqual(streamParentIds, ['fertility', 'fertility-cycles']);
    });

    it('[MOSC] Necessary streams to handle itemKeys', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys);
      // keeè a list of streams check that necessary streams exists
      const streamIdsToCheck = {};
      for (const itemKey of itemKeys) {
        const streamId = model.itemsDefs.forKey(itemKey).data.streamId;
        streamIdsToCheck[streamId] = true;
      }
      const parentExist = {}; // list of parent id in order
      for (const stream of streamsToBeCreated) {
        assert.ok(!!stream.id, 'stream should have an id');
        assert.ok(!!stream.name, `stream "${stream.id}" should have a name`);
        delete streamIdsToCheck[stream.id];
        if (stream.parentId) assert.ok(!!parentExist[stream.parentId], `stream "${stream.id}" should have parent "${stream.parentId}" already in list`);
        parentExist[stream.id] = true;
      }
      assert.deepEqual(Object.keys(streamIdsToCheck), []);
    });

    it('[MOSD] Necessary streams to handle itemKey, with existing streamIds', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const knowExistingStreamsIds = ['body-vulva', 'profile', 'applications'];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys, { knowExistingStreamsIds });
      assert.deepEqual(streamsToBeCreated, [
        {
          id: 'body-vulva-mucus',
          name: 'Vulva Mucus',
          parentId: 'body-vulva'
        },
        {
          id: 'body-vulva-mucus-inspect',
          name: 'Vulva Mucus Inspect',
          parentId: 'body-vulva-mucus'
        },
        { id: 'profile-name', name: 'Name', parentId: 'profile' },
        {
          id: 'profile-date-of-birth',
          name: 'Date of Birth',
          parentId: 'profile'
        },
        {
          id: 'body-vulva-mucus-stretch',
          name: 'Vulva Mucus Stretch',
          parentId: 'body-vulva-mucus'
        }
      ]);
    });

    it('[MOSE] Necessary streams to handle itemKey, with nameProperty: defaultName', async () => {
      const itemKeys = [
        'profile-name'
      ];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys, { nameProperty: 'defaultName' });
      assert.deepEqual(streamsToBeCreated, [
        { id: 'profile', parentId: null, defaultName: 'Profile' },
        { id: 'profile-name', parentId: 'profile', defaultName: 'Name' }
      ]);
    });

    it('[MOSF] Necessary streams to handle itemKey, with nameProperty: none', async () => {
      const itemKeys = [
        'profile-name'
      ];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys, { nameProperty: 'none' });
      assert.deepEqual(streamsToBeCreated, [
        { id: 'profile', parentId: null },
        { id: 'profile-name', parentId: 'profile' }
      ]);
    });
  });

  // ------------------- authorizations ------------------ //

  describe('[MOAX] authorizations', function () {
    it('[MOAA] Get Authorizations from items', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const authorizationSet = model.authorizations.forItemKeys(itemKeys);
      const expected = [
        {
          streamId: 'body-vulva-mucus-inspect',
          defaultName: 'Vulva Mucus Inspect',
          level: 'read'
        },
        { streamId: 'profile-name', defaultName: 'Name', level: 'read' },
        {
          streamId: 'profile-date-of-birth',
          defaultName: 'Date of Birth',
          level: 'read'
        },
        {
          streamId: 'body-vulva-mucus-stretch',
          defaultName: 'Vulva Mucus Stretch',
          level: 'read'
        }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAL] Get Authorizations from items override correctly authorized level', async () => {
      const itemKeys = ['profile-name'];
      const options = { preRequest: [{ streamId: 'profile', level: 'contribute' }] };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', level: 'contribute', defaultName: 'Profile' }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAV] Get Authorizations from items override correctly authorized level', async () => {
      const itemKeys = ['profile-name'];
      const options = {
        defaultLevel: 'manage',
        preRequest: [{ streamId: 'profile', level: 'read' }]
      };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', level: 'read', defaultName: 'Profile' },
        { streamId: 'profile-name', defaultName: 'Name', level: 'manage' }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAM] Get Authorizations from items mix correctly authorized level', async () => {
      const levels = [{ request: 'manage', expect: 'manage' }, { request: 'contribute', expect: 'contribute' }, { request: 'writeOnly', expect: 'contribute' }];
      for (const level of levels) {
        const itemKeys = ['profile-name'];
        const options = {
          preRequest: [{ streamId: 'profile-name', level: level.request }]
        };
        const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
        const expected = [
          { streamId: 'profile-name', level: level.expect, defaultName: 'Name' }
        ];
        assert.deepEqual(authorizationSet, expected);
      }
    });

    it('[MOAO] Get Authorizations from items with overrides', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'profile' },
          { streamId: 'app-test', defaultName: 'App test', level: 'write' }
        ]
      };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', defaultName: 'Profile', level: 'read' },
        { streamId: 'app-test', defaultName: 'App test', level: 'write' },
        {
          streamId: 'body-vulva-mucus-inspect',
          defaultName: 'Vulva Mucus Inspect',
          level: 'read'
        },
        {
          streamId: 'body-vulva-mucus-stretch',
          defaultName: 'Vulva Mucus Stretch',
          level: 'read'
        }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAW] Get Authorizations from items with overrides and no defaultName', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'profile' },
          { streamId: 'app-test', level: 'write' }
        ],
        includeDefaultName: false
      };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', level: 'read' },
        { streamId: 'app-test', level: 'write' },
        {
          streamId: 'body-vulva-mucus-inspect',
          level: 'read'
        },
        {
          streamId: 'body-vulva-mucus-stretch',
          level: 'read'
        }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAZ] Get authorization throw error on unknown streamId with no defaultName', async () => {
      const itemKeys = [
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'dummy', defaultName: 'Dummy', level: 'read' }
        ],
        includeDefaultName: false
      };
      try {
        model.authorizations.forItemKeys(itemKeys, options);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Do not include defaultName when not included explicitely on {"streamId":"dummy","defaultName":"Dummy","level":"read"}');
      }
    });

    it('[MOAE] Throw error when defaultName is in one of of the "pre" but not desired ', async () => {
      const itemKeys = [
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamIdXXXX: 'dummy', level: 'read' }
        ]
      };
      try {
        model.authorizations.forItemKeys(itemKeys, options);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Missing streamId in options.preRequest item: {"streamIdXXXX":"dummy","level":"read"}');
      }
    });

    it('[MOAR] Get authorization throw error on unknown streamId with no defaultName', async () => {
      const itemKeys = [
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'dummy', level: 'read' }
        ]
      };
      try {
        model.authorizations.forItemKeys(itemKeys, options);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'No "defaultName" in options.preRequest item: {"streamId":"dummy","level":"read"} and cannot find matching streams in default list');
      }
    });
  });
});


/***/ },

/***/ "./tests/libSettings.test.js"
/*!***********************************!*\
  !*** ./tests/libSettings.test.js ***!
  \***********************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");

const HDSLib = __webpack_require__(/*! ../js */ "./js/index.js");

describe('[LISX] Lib settings', () => {
  before(async () => {

  });

  it('[LISL] settings.setPreferredLocales default Local', async () => {
    const text = {
      en: 'Hello',
      fr: 'Bonjour'
    };
    HDSLib.settings.setPreferredLocales(['en']);
    assert.equal(HDSLib.l(text), text.en);
    HDSLib.settings.setPreferredLocales(['fr']);
    assert.equal(HDSLib.l(text), text.fr);
  });
});


/***/ },

/***/ "./tests/localizeText.test.js"
/*!************************************!*\
  !*** ./tests/localizeText.test.js ***!
  \************************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");
const { resetPreferredLocales, getPreferredLocales, getSupportedLocales, localizeText, setPreferredLocales } = __webpack_require__(/*! ../js/localizeText */ "./js/localizeText.js");

describe('[LOCX] Localization', () => {
  afterEach(() => {
    // make sure locales are set back to default after each test
    resetPreferredLocales();
  });

  describe('[LOSX] Localization settings', () => {
    it('[LOSG] getSupportedLocales', () => {
      const defaultLocales = getSupportedLocales();
      assert.deepEqual(defaultLocales, ['en', 'fr', 'es']);
    });

    it('[LOSS] setPreferredLocales, resetPrefferedLocales', () => {
      const defaultLocales = getSupportedLocales();
      const text = {
        en: 'Hello',
        fr: 'Bonjour'
      };
      setPreferredLocales(['en']);
      assert.equal(localizeText(text), text.en);
      setPreferredLocales(['fr', 'es']);
      assert.equal(localizeText(text), text.fr);
      const prefferedLocales = getPreferredLocales();
      assert.deepEqual(prefferedLocales, ['fr', 'es', 'en']);
      resetPreferredLocales();
      assert.deepEqual(getPreferredLocales(), defaultLocales);
    });

    it('[LOSE] setPreferredLocales throws error if language code unsuported', () => {
      try {
        setPreferredLocales(['ex', 'en', 'fr', 'ut']);
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'locales "ex, ut" are not supported');
      }
    });

    it('[LOSA] setPreferredLocales throws error if not array', () => {
      try {
        setPreferredLocales('en');
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'setPreferredLocales takes an array of language codes');
      }
    });
  });

  // --- item localization

  describe('[LOLX] item localization', () => {
    it('[LOLN] localizable null items return null', () => {
      const nullRes = localizeText(null);
      assert.equal(nullRes, null);
    });

    it('[LOLE] localizable should return english translation if none other found', () => {
      setPreferredLocales(['fr', 'es']);
      const text = {
        en: 'Hello'
      };
      const res = localizeText(text);
      assert.equal(res, 'Hello');
    });

    it('[LOLT] localizable items must have an english translation, even if default language is not english', () => {
      try {
        const text = {
          es: 'Ola',
          fr: 'Bonjour'
        };
        setPreferredLocales(['fr']);
        localizeText(text);
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'textItems must have an english translation');
      }
    });
  });
});


/***/ },

/***/ "./tests/test-utils/config.js"
/*!************************************!*\
  !*** ./tests/test-utils/config.js ***!
  \************************************/
(module) {

module.exports = {
  serviceInfoURL: 'https://demo.datasafe.dev/reg/service/info',
  appId: 'hds-lib-tests',
  modelURL: 'https://model.datasafe.dev/pack.json'
};


/***/ },

/***/ "./tests/test-utils/debug.js"
/*!***********************************!*\
  !*** ./tests/test-utils/debug.js ***!
  \***********************************/
(module, __unused_webpack_exports, __webpack_require__) {

const util = __webpack_require__(/*! util */ "./node_modules/util/util.js");

function log () {
  for (let i = 0; i < arguments.length; i++) {
    console.log(util.inspect(arguments[i], { depth: 12, colors: true }));
  }
}

function stack (start = 0, length = 100) {
  const e = new Error();
  return e.stack.split('\n').filter(l => l.indexOf('node_modules') < 0).slice(start + 1, start + length + 1);
}

function logstack () {
  log(...arguments, stack(2, 4));
}

module.exports = {
  logstack,
  log,
  stack
};

__webpack_require__.g.$$ = logstack;
__webpack_require__.g.$$$ = log;


/***/ },

/***/ "./tests/test-utils/deps-browser.js"
/*!******************************************!*\
  !*** ./tests/test-utils/deps-browser.js ***!
  \******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

module.exports = {
  assert: __webpack_require__(/*! assert */ "./node_modules/assert/build/assert.js")
};


/***/ },

/***/ "./tests/test-utils/helpersAppTemplate.js"
/*!************************************************!*\
  !*** ./tests/test-utils/helpersAppTemplate.js ***!
  \************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./deps-node */ "./tests/test-utils/deps-browser.js");
const { createUserAndPermissions, pryv, createUser, createUserPermissions } = __webpack_require__(/*! ./pryvService */ "./tests/test-utils/pryvService.js");
const AppManagingAccount = (__webpack_require__(/*! ../../js/ */ "./js/index.js").appTemplates).AppManagingAccount;
const AppClientAccount = (__webpack_require__(/*! ../../js/ */ "./js/index.js").appTemplates).AppClientAccount;

module.exports = {
  helperNewAppAndUsers,
  helperNewAppClient,
  helperNewAppManaging,
  helperNewInvite
};

/**
 * function helperNewAppManaging
 */
async function helperNewAppManaging (baseStreamIdManager, appName, managingUser = null) {
  // -- managing
  const initialStreams = [{ id: 'applications', name: 'Applications' }, { id: baseStreamIdManager, name: appName, parentId: 'applications' }];
  const permissionsManager = [{ streamId: baseStreamIdManager, level: 'manage' }];
  if (!managingUser) {
    managingUser = await createUserAndPermissions(null, permissionsManager, initialStreams, appName);
  } else {
    // replace managing user with new permissions set
    managingUser = await createUserPermissions(managingUser, permissionsManager, initialStreams, appName);
  }
  const connection = new pryv.Connection(managingUser.appApiEndpoint);
  const appManaging = await AppManagingAccount.newFromConnection(baseStreamIdManager, connection);
  return { managingUser, appManaging };
}

/**
 * helper to generate a new managing user and new client user
 */
async function helperNewAppClient (baseStreamIdClient, appClientName) {
  // -- receiving user
  const clientUser = await createUser();
  const permissionsClient = [{ streamId: '*', level: 'manage' }];
  const clientUserResultPermissions = await createUserPermissions(clientUser, permissionsClient, [], appClientName);
  const appClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUserResultPermissions.appApiEndpoint, appClientName);
  return { clientUser, clientUserResultPermissions, appClient };
}

/**
 * helper to generate a new managing user and new client user
 */
async function helperNewAppAndUsers (baseStreamIdManager, appName, baseStreamIdClient, appClientName) {
  const res = {};
  const resManager = await helperNewAppManaging(baseStreamIdManager, appName);
  const resClient = await helperNewAppClient(baseStreamIdClient, appClientName);
  Object.assign(res, resManager);
  Object.assign(res, resClient);
  return res;
}

/**
 * heper to generate a new collector and invite for this managing application
 * @param {AppManagingAccount} appManaging
 * @returns {Object}
 */
async function helperNewInvite (appManaging, appClient, code, extraFeatures = { requestContent: {}, addChat: false }) {
  code = code || Math.floor(Math.random() * 1000);
  const collector = await appManaging.createCollector('Invite test ' + code);

  // set request content
  const requestContent = {
    version: 0,
    requester: { name: 'Test requester name' },
    title: { en: 'Title of the request' },
    description: { en: 'Short Description' },
    consent: { en: 'This is a consent message' },
    permissions: [{ streamId: 'profile-name', defaultName: 'Name', level: 'read' }],
    app: { id: 'test-app', url: 'https://xxx.yyy', data: { } }
  };
  Object.assign(requestContent, extraFeatures.extraContent || {});
  collector.request.setContent(requestContent);
  if (extraFeatures.addChat) {
    collector.request.addChatFeature();
  }

  await collector.save();
  await collector.publish();
  // create invite
  const options = { customData: { hello: 'bob' } };
  const invite = await collector.createInvite('Invite One', options);
  const inviteSharingData = await invite.getSharingData();
  assert.equal(inviteSharingData.apiEndpoint, await collector.sharingApiEndpoint());

  // Invitee receives the invite
  const collectorClient = await appClient.handleIncomingRequest(inviteSharingData.apiEndpoint, inviteSharingData.eventId);

  return { collector, invite, collectorClient, inviteSharingData };
}


/***/ },

/***/ "./tests/test-utils/pryvService.js"
/*!*****************************************!*\
  !*** ./tests/test-utils/pryvService.js ***!
  \*****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

__webpack_require__(/*! ./debug */ "./tests/test-utils/debug.js");
const pryv = (__webpack_require__(/*! ../../js/ */ "./js/index.js").pryv);
const HDSService = (__webpack_require__(/*! ../../js/ */ "./js/index.js").HDSService);

const ShortUniqueId = __webpack_require__(/*! short-unique-id */ "./node_modules/short-unique-id/dist/short-unique-id.js");
const passwordGenerator = new ShortUniqueId({ dictionary: 'alphanum', length: 12 });

const config = __webpack_require__(/*! ./config */ "./tests/test-utils/config.js");
const { setServiceInfoURL } = __webpack_require__(/*! ../../js/settings */ "./js/settings.js");

module.exports = {
  init,
  userExists,
  createUser,
  createUserAndPermissions,
  createUserPermissions,
  service,
  pryv,
  config
};

/**
 * @type {HDSService}
 */
let serviceSingleton;

/**
 * @type {ServiceInfo}
 */
let infosSingleton;

/**
 * Get current HDSService
 * @returns {HDSService}
 */
function service () {
  if (serviceSingleton == null) throw new Error('Init pryvService first');
  return serviceSingleton;
}

/**
 * Initialize HDSservice from config and creates a singleton
 * accessible via service()
 * @returns {HDSService}
 */
async function init () {
  if (infosSingleton) return infosSingleton;
  if (!config.appId) throw new Error('Cannot find appId in config');
  if (!config.serviceInfoURL) throw new Error('Cannot find serviceInfoURL in config');
  setServiceInfoURL(config.serviceInfoURL);
  serviceSingleton = new HDSService(config.serviceInfoURL);
  infosSingleton = await serviceSingleton.info();
  return infosSingleton;
}

/**
 * @typedef {Object} CreateUserResult
 * @property {string} apiEndpoint - a personal ApiEnpoint
 * @property {string} username - The username
 * @property {string} password - The password
 */

/**
 * Create a user on Pryv.io
 * @param {string} userId - desireg UserId for Prvy.io
 * @param {string} password
 * @param {string} email
 * @returns {CreateUserResult}
 */
async function createUser (username, password, email) {
  const host = await getHost();
  password = password || passwordGenerator.rnd();
  username = username || getNewUserId('u');
  email = email || username + '@hds.bogus';
  try {
    // create user
    const res = await fetch(host + 'users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: config.appId,
        username,
        password,
        email,
        invitationtoken: 'enjoy',
        languageCode: 'en',
        referer: 'none'
      })
    });
    const body = await res.json();
    if (body.apiEndpoint == null) throw new Error('Cannot find apiEndpoint in response');
    return { apiEndpoint: body.apiEndpoint, username: body.username, password };
  } catch (e) {
    throw new Error('Failed creating user ' + host + 'users');
  }
}

/**
 * Create userAccountAndPermission
 * @param {string} username
 * @param {Object} permissions - permission set (as per pryv api) - Add name if they might not exist
 * @param {Array<Stream creation>} initialStreams - to be created
 * @param {string} [appName] - default: from config
 * @param {string} [password] - if not provided will be 'pass{usernam}'
 * @param {string} [email] - if not provided will be '{usernam}@hds.bogus'
 * @returns {Object} username, personalApiEndpoint, appId, appApiEndpoint
 */
async function createUserAndPermissions (username, permissions, initialStreams, appName, password, email) {
  const newUser = await createUser(username, password, email);
  const result = await createUserPermissions(newUser, permissions, initialStreams, appName);
  result.appId = config.appId;
  return result;
}

async function createUserPermissions (user, permissions, initialStreams = [], appName) {
  const personalConnection = new pryv.Connection(user.apiEndpoint || user.personalApiEndpoint);
  // -- make sure requested streams exists
  const createStreams = initialStreams.map(s => ({
    method: 'streams.create',
    params: {
      id: s.id,
      name: s.name,
      parentId: s.parentId || null
    }
  }));
  // -- create access
  const accessRequest = {
    method: 'accesses.create',
    params: {
      type: 'app',
      name: appName,
      permissions
    }
  };
  const apiCalls = [...createStreams, accessRequest];
  const res = await personalConnection.api(apiCalls);
  const accessRequestResult = res.pop();
  if (accessRequestResult.error) throw new Error(accessRequestResult.error.message);
  const appApiEndpoint = accessRequestResult.access?.apiEndpoint;
  const result = {
    username: user.username,
    personalApiEndpoint: user.apiEndpoint,
    appApiEndpoint
  };

  return result;
}

/**
 * Utility to check if a user exists on a Pryv pltafom
 * @param {string} userId
 * @returns {boolean}
 */
async function userExists (userId) {
  await init();
  const userExistsRes = await fetch(infosSingleton.register + userId + '/check_username');
  const userExistsBody = await userExistsRes.json();
  if (typeof userExistsBody.reserved === 'undefined') throw Error('Pryv invalid user exists response ' + JSON.stringify(userExistsBody));
  return userExistsBody.reserved;
}

/**
 * Not really usefull for Open-Pryv.io kept if entreprise version becoms availble
 * @returns {string} first available hosting
 */
async function getHost () {
  await init();
  // get available hosting
  const hostingsRes = await fetch(infosSingleton.register + 'hostings', {
    headers: { Accept: 'application/json' }
  });
  const hostings = await hostingsRes.json();
  let hostingCandidate = null;
  findOneHostingKey(hostings, 'N');
  function findOneHostingKey (o, parentKey) {
    for (const key of Object.keys(o)) {
      if (parentKey === 'hostings') {
        const hosting = o[key];
        if (hosting.available) {
          hostingCandidate = hosting;
        }
        return;
      }
      if (typeof o[key] !== 'string') {
        findOneHostingKey(o[key], key);
      }
    }
  }
  if (hostingCandidate == null) throw Error('Cannot find hosting in: ' + JSON.stringify(hostings));
  return hostingCandidate.availableCore;
}

const userIdGenerator = new ShortUniqueId({ dictionary: 'alphanum_lower', length: 7 });
function getNewUserId (startWith = 'x') {
  const id = startWith + userIdGenerator.rnd();
  return id;
}


/***/ },

/***/ "./tests/toolkitStreamAutoCreate.test.js"
/*!***********************************************!*\
  !*** ./tests/toolkitStreamAutoCreate.test.js ***!
  \***********************************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

const { assert } = __webpack_require__(/*! ./test-utils/deps-node */ "./tests/test-utils/deps-browser.js");

const HDSLib = __webpack_require__(/*! ../js */ "./js/index.js");
const { createUserAndPermissions } = __webpack_require__(/*! ./test-utils/pryvService */ "./tests/test-utils/pryvService.js");

describe('[TKSX] toolKit Stream Auto Create', function () {
  this.timeout(5000);
  before(async () => {
    await HDSLib.initHDSModel();
  });

  it('[TKSA] create required streams based on itemsDefs', async () => {
    const permissionsManager = [{ streamId: '*', level: 'manage' }];
    const user = await createUserAndPermissions(null, permissionsManager, [], 'tk-test LISL');
    const connection = new HDSLib.pryv.Connection(user.appApiEndpoint);
    const streamsAutoCreate = HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);

    const itemKeys = [
      'profile-name'
    ];

    const createdStreams = await streamsAutoCreate.ensureExistsForItems(itemKeys);
    assert.equal(createdStreams.length, 2);
    assert.equal(createdStreams[0].id, 'profile');
    assert.equal(createdStreams[1].id, 'profile-name');

    const createdStream2 = await streamsAutoCreate.ensureExistsForItems(itemKeys);
    assert.equal(createdStream2.length, 0, 'Should not recreate existing streams');
  });
});


/***/ },

/***/ "?e606"
/*!********************!*\
  !*** fs (ignored) ***!
  \********************/
() {

/* (ignored) */

/***/ },

/***/ "?2070"
/*!**********************!*\
  !*** path (ignored) ***!
  \**********************/
() {

/* (ignored) */

/***/ },

/***/ "./node_modules/available-typed-arrays/index.js"
/*!******************************************************!*\
  !*** ./node_modules/available-typed-arrays/index.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

"use strict";


var possibleNames = __webpack_require__(/*! possible-typed-array-names */ "./node_modules/possible-typed-array-names/index.js");

var g = typeof globalThis === 'undefined' ? __webpack_require__.g : globalThis;

/** @type {import('.')} */
module.exports = function availableTypedArrays() {
	var /** @type {ReturnType<typeof availableTypedArrays>} */ out = [];
	for (var i = 0; i < possibleNames.length; i++) {
		if (typeof g[possibleNames[i]] === 'function') {
			// @ts-expect-error
			out[out.length] = possibleNames[i];
		}
	}
	return out;
};


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/contrib/has-cors.js"
/*!*********************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/contrib/has-cors.js ***!
  \*********************************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hasCORS = void 0;
// imported from https://github.com/component/has-cors
let value = false;
try {
    value = typeof XMLHttpRequest !== 'undefined' &&
        'withCredentials' in new XMLHttpRequest();
}
catch (err) {
    // if XMLHttp support is disabled in IE then it will throw
    // when trying to create
}
exports.hasCORS = value;


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/contrib/parseqs.js"
/*!********************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/contrib/parseqs.js ***!
  \********************************************************************/
(__unused_webpack_module, exports) {

"use strict";

// imported from https://github.com/galkn/querystring
/**
 * Compiles a querystring
 * Returns string representation of the object
 *
 * @param {Object}
 * @api private
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encode = encode;
exports.decode = decode;
function encode(obj) {
    let str = '';
    for (let i in obj) {
        if (obj.hasOwnProperty(i)) {
            if (str.length)
                str += '&';
            str += encodeURIComponent(i) + '=' + encodeURIComponent(obj[i]);
        }
    }
    return str;
}
/**
 * Parses a simple querystring into an object
 *
 * @param {String} qs
 * @api private
 */
function decode(qs) {
    let qry = {};
    let pairs = qs.split('&');
    for (let i = 0, l = pairs.length; i < l; i++) {
        let pair = pairs[i].split('=');
        qry[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
    }
    return qry;
}


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/contrib/parseuri.js"
/*!*********************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/contrib/parseuri.js ***!
  \*********************************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parse = parse;
// imported from https://github.com/galkn/parseuri
/**
 * Parses a URI
 *
 * Note: we could also have used the built-in URL object, but it isn't supported on all platforms.
 *
 * See:
 * - https://developer.mozilla.org/en-US/docs/Web/API/URL
 * - https://caniuse.com/url
 * - https://www.rfc-editor.org/rfc/rfc3986#appendix-B
 *
 * History of the parse() method:
 * - first commit: https://github.com/socketio/socket.io-client/commit/4ee1d5d94b3906a9c052b459f1a818b15f38f91c
 * - export into its own module: https://github.com/socketio/engine.io-client/commit/de2c561e4564efeb78f1bdb1ba39ef81b2822cb3
 * - reimport: https://github.com/socketio/engine.io-client/commit/df32277c3f6d622eec5ed09f493cae3f3391d242
 *
 * @author Steven Levithan <stevenlevithan.com> (MIT license)
 * @api private
 */
const re = /^(?:(?![^:@\/?#]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@\/?#]*)(?::([^:@\/?#]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;
const parts = [
    'source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'
];
function parse(str) {
    if (str.length > 8000) {
        throw "URI too long";
    }
    const src = str, b = str.indexOf('['), e = str.indexOf(']');
    if (b != -1 && e != -1) {
        str = str.substring(0, b) + str.substring(b, e).replace(/:/g, ';') + str.substring(e, str.length);
    }
    let m = re.exec(str || ''), uri = {}, i = 14;
    while (i--) {
        uri[parts[i]] = m[i] || '';
    }
    if (b != -1 && e != -1) {
        uri.source = src;
        uri.host = uri.host.substring(1, uri.host.length - 1).replace(/;/g, ':');
        uri.authority = uri.authority.replace('[', '').replace(']', '').replace(/;/g, ':');
        uri.ipv6uri = true;
    }
    uri.pathNames = pathNames(uri, uri['path']);
    uri.queryKey = queryKey(uri, uri['query']);
    return uri;
}
function pathNames(obj, path) {
    const regx = /\/{2,9}/g, names = path.replace(regx, "/").split("/");
    if (path.slice(0, 1) == '/' || path.length === 0) {
        names.splice(0, 1);
    }
    if (path.slice(-1) == '/') {
        names.splice(names.length - 1, 1);
    }
    return names;
}
function queryKey(uri, query) {
    const data = {};
    query.replace(/(?:^|&)([^&=]*)=?([^&]*)/g, function ($0, $1, $2) {
        if ($1) {
            data[$1] = $2;
        }
    });
    return data;
}


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/globals.js"
/*!************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/globals.js ***!
  \************************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultBinaryType = exports.globalThisShim = exports.nextTick = void 0;
exports.createCookieJar = createCookieJar;
exports.nextTick = (() => {
    const isPromiseAvailable = typeof Promise === "function" && typeof Promise.resolve === "function";
    if (isPromiseAvailable) {
        return (cb) => Promise.resolve().then(cb);
    }
    else {
        return (cb, setTimeoutFn) => setTimeoutFn(cb, 0);
    }
})();
exports.globalThisShim = (() => {
    if (typeof self !== "undefined") {
        return self;
    }
    else if (typeof window !== "undefined") {
        return window;
    }
    else {
        return Function("return this")();
    }
})();
exports.defaultBinaryType = "arraybuffer";
function createCookieJar() { }


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/index.js"
/*!**********************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/index.js ***!
  \**********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WebTransport = exports.WebSocket = exports.NodeWebSocket = exports.XHR = exports.NodeXHR = exports.Fetch = exports.nextTick = exports.parse = exports.installTimerFunctions = exports.transports = exports.TransportError = exports.Transport = exports.protocol = exports.SocketWithUpgrade = exports.SocketWithoutUpgrade = exports.Socket = void 0;
const socket_js_1 = __webpack_require__(/*! ./socket.js */ "./node_modules/engine.io-client/build/cjs/socket.js");
Object.defineProperty(exports, "Socket", ({ enumerable: true, get: function () { return socket_js_1.Socket; } }));
var socket_js_2 = __webpack_require__(/*! ./socket.js */ "./node_modules/engine.io-client/build/cjs/socket.js");
Object.defineProperty(exports, "SocketWithoutUpgrade", ({ enumerable: true, get: function () { return socket_js_2.SocketWithoutUpgrade; } }));
Object.defineProperty(exports, "SocketWithUpgrade", ({ enumerable: true, get: function () { return socket_js_2.SocketWithUpgrade; } }));
exports.protocol = socket_js_1.Socket.protocol;
var transport_js_1 = __webpack_require__(/*! ./transport.js */ "./node_modules/engine.io-client/build/cjs/transport.js");
Object.defineProperty(exports, "Transport", ({ enumerable: true, get: function () { return transport_js_1.Transport; } }));
Object.defineProperty(exports, "TransportError", ({ enumerable: true, get: function () { return transport_js_1.TransportError; } }));
var index_js_1 = __webpack_require__(/*! ./transports/index.js */ "./node_modules/engine.io-client/build/cjs/transports/index.js");
Object.defineProperty(exports, "transports", ({ enumerable: true, get: function () { return index_js_1.transports; } }));
var util_js_1 = __webpack_require__(/*! ./util.js */ "./node_modules/engine.io-client/build/cjs/util.js");
Object.defineProperty(exports, "installTimerFunctions", ({ enumerable: true, get: function () { return util_js_1.installTimerFunctions; } }));
var parseuri_js_1 = __webpack_require__(/*! ./contrib/parseuri.js */ "./node_modules/engine.io-client/build/cjs/contrib/parseuri.js");
Object.defineProperty(exports, "parse", ({ enumerable: true, get: function () { return parseuri_js_1.parse; } }));
var globals_node_js_1 = __webpack_require__(/*! ./globals.node.js */ "./node_modules/engine.io-client/build/cjs/globals.js");
Object.defineProperty(exports, "nextTick", ({ enumerable: true, get: function () { return globals_node_js_1.nextTick; } }));
var polling_fetch_js_1 = __webpack_require__(/*! ./transports/polling-fetch.js */ "./node_modules/engine.io-client/build/cjs/transports/polling-fetch.js");
Object.defineProperty(exports, "Fetch", ({ enumerable: true, get: function () { return polling_fetch_js_1.Fetch; } }));
var polling_xhr_node_js_1 = __webpack_require__(/*! ./transports/polling-xhr.node.js */ "./node_modules/engine.io-client/build/cjs/transports/polling-xhr.js");
Object.defineProperty(exports, "NodeXHR", ({ enumerable: true, get: function () { return polling_xhr_node_js_1.XHR; } }));
var polling_xhr_js_1 = __webpack_require__(/*! ./transports/polling-xhr.js */ "./node_modules/engine.io-client/build/cjs/transports/polling-xhr.js");
Object.defineProperty(exports, "XHR", ({ enumerable: true, get: function () { return polling_xhr_js_1.XHR; } }));
var websocket_node_js_1 = __webpack_require__(/*! ./transports/websocket.node.js */ "./node_modules/engine.io-client/build/cjs/transports/websocket.js");
Object.defineProperty(exports, "NodeWebSocket", ({ enumerable: true, get: function () { return websocket_node_js_1.WS; } }));
var websocket_js_1 = __webpack_require__(/*! ./transports/websocket.js */ "./node_modules/engine.io-client/build/cjs/transports/websocket.js");
Object.defineProperty(exports, "WebSocket", ({ enumerable: true, get: function () { return websocket_js_1.WS; } }));
var webtransport_js_1 = __webpack_require__(/*! ./transports/webtransport.js */ "./node_modules/engine.io-client/build/cjs/transports/webtransport.js");
Object.defineProperty(exports, "WebTransport", ({ enumerable: true, get: function () { return webtransport_js_1.WT; } }));


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/socket.js"
/*!***********************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/socket.js ***!
  \***********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Socket = exports.SocketWithUpgrade = exports.SocketWithoutUpgrade = void 0;
const index_js_1 = __webpack_require__(/*! ./transports/index.js */ "./node_modules/engine.io-client/build/cjs/transports/index.js");
const util_js_1 = __webpack_require__(/*! ./util.js */ "./node_modules/engine.io-client/build/cjs/util.js");
const parseqs_js_1 = __webpack_require__(/*! ./contrib/parseqs.js */ "./node_modules/engine.io-client/build/cjs/contrib/parseqs.js");
const parseuri_js_1 = __webpack_require__(/*! ./contrib/parseuri.js */ "./node_modules/engine.io-client/build/cjs/contrib/parseuri.js");
const component_emitter_1 = __webpack_require__(/*! @socket.io/component-emitter */ "./node_modules/@socket.io/component-emitter/lib/esm/index.js");
const engine_io_parser_1 = __webpack_require__(/*! engine.io-parser */ "./node_modules/engine.io-parser/build/cjs/index.js");
const globals_node_js_1 = __webpack_require__(/*! ./globals.node.js */ "./node_modules/engine.io-client/build/cjs/globals.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("engine.io-client:socket"); // debug()
const withEventListeners = typeof addEventListener === "function" &&
    typeof removeEventListener === "function";
const OFFLINE_EVENT_LISTENERS = [];
if (withEventListeners) {
    // within a ServiceWorker, any event handler for the 'offline' event must be added on the initial evaluation of the
    // script, so we create one single event listener here which will forward the event to the socket instances
    addEventListener("offline", () => {
        debug("closing %d connection(s) because the network was lost", OFFLINE_EVENT_LISTENERS.length);
        OFFLINE_EVENT_LISTENERS.forEach((listener) => listener());
    }, false);
}
/**
 * This class provides a WebSocket-like interface to connect to an Engine.IO server. The connection will be established
 * with one of the available low-level transports, like HTTP long-polling, WebSocket or WebTransport.
 *
 * This class comes without upgrade mechanism, which means that it will keep the first low-level transport that
 * successfully establishes the connection.
 *
 * In order to allow tree-shaking, there are no transports included, that's why the `transports` option is mandatory.
 *
 * @example
 * import { SocketWithoutUpgrade, WebSocket } from "engine.io-client";
 *
 * const socket = new SocketWithoutUpgrade({
 *   transports: [WebSocket]
 * });
 *
 * socket.on("open", () => {
 *   socket.send("hello");
 * });
 *
 * @see SocketWithUpgrade
 * @see Socket
 */
class SocketWithoutUpgrade extends component_emitter_1.Emitter {
    /**
     * Socket constructor.
     *
     * @param {String|Object} uri - uri or options
     * @param {Object} opts - options
     */
    constructor(uri, opts) {
        super();
        this.binaryType = globals_node_js_1.defaultBinaryType;
        this.writeBuffer = [];
        this._prevBufferLen = 0;
        this._pingInterval = -1;
        this._pingTimeout = -1;
        this._maxPayload = -1;
        /**
         * The expiration timestamp of the {@link _pingTimeoutTimer} object is tracked, in case the timer is throttled and the
         * callback is not fired on time. This can happen for example when a laptop is suspended or when a phone is locked.
         */
        this._pingTimeoutTime = Infinity;
        if (uri && "object" === typeof uri) {
            opts = uri;
            uri = null;
        }
        if (uri) {
            const parsedUri = (0, parseuri_js_1.parse)(uri);
            opts.hostname = parsedUri.host;
            opts.secure =
                parsedUri.protocol === "https" || parsedUri.protocol === "wss";
            opts.port = parsedUri.port;
            if (parsedUri.query)
                opts.query = parsedUri.query;
        }
        else if (opts.host) {
            opts.hostname = (0, parseuri_js_1.parse)(opts.host).host;
        }
        (0, util_js_1.installTimerFunctions)(this, opts);
        this.secure =
            null != opts.secure
                ? opts.secure
                : typeof location !== "undefined" && "https:" === location.protocol;
        if (opts.hostname && !opts.port) {
            // if no port is specified manually, use the protocol default
            opts.port = this.secure ? "443" : "80";
        }
        this.hostname =
            opts.hostname ||
                (typeof location !== "undefined" ? location.hostname : "localhost");
        this.port =
            opts.port ||
                (typeof location !== "undefined" && location.port
                    ? location.port
                    : this.secure
                        ? "443"
                        : "80");
        this.transports = [];
        this._transportsByName = {};
        opts.transports.forEach((t) => {
            const transportName = t.prototype.name;
            this.transports.push(transportName);
            this._transportsByName[transportName] = t;
        });
        this.opts = Object.assign({
            path: "/engine.io",
            agent: false,
            withCredentials: false,
            upgrade: true,
            timestampParam: "t",
            rememberUpgrade: false,
            addTrailingSlash: true,
            rejectUnauthorized: true,
            perMessageDeflate: {
                threshold: 1024,
            },
            transportOptions: {},
            closeOnBeforeunload: false,
        }, opts);
        this.opts.path =
            this.opts.path.replace(/\/$/, "") +
                (this.opts.addTrailingSlash ? "/" : "");
        if (typeof this.opts.query === "string") {
            this.opts.query = (0, parseqs_js_1.decode)(this.opts.query);
        }
        if (withEventListeners) {
            if (this.opts.closeOnBeforeunload) {
                // Firefox closes the connection when the "beforeunload" event is emitted but not Chrome. This event listener
                // ensures every browser behaves the same (no "disconnect" event at the Socket.IO level when the page is
                // closed/reloaded)
                this._beforeunloadEventListener = () => {
                    if (this.transport) {
                        // silently close the transport
                        this.transport.removeAllListeners();
                        this.transport.close();
                    }
                };
                addEventListener("beforeunload", this._beforeunloadEventListener, false);
            }
            if (this.hostname !== "localhost") {
                debug("adding listener for the 'offline' event");
                this._offlineEventListener = () => {
                    this._onClose("transport close", {
                        description: "network connection lost",
                    });
                };
                OFFLINE_EVENT_LISTENERS.push(this._offlineEventListener);
            }
        }
        if (this.opts.withCredentials) {
            this._cookieJar = (0, globals_node_js_1.createCookieJar)();
        }
        this._open();
    }
    /**
     * Creates transport of the given type.
     *
     * @param {String} name - transport name
     * @return {Transport}
     * @private
     */
    createTransport(name) {
        debug('creating transport "%s"', name);
        const query = Object.assign({}, this.opts.query);
        // append engine.io protocol identifier
        query.EIO = engine_io_parser_1.protocol;
        // transport name
        query.transport = name;
        // session id if we already have one
        if (this.id)
            query.sid = this.id;
        const opts = Object.assign({}, this.opts, {
            query,
            socket: this,
            hostname: this.hostname,
            secure: this.secure,
            port: this.port,
        }, this.opts.transportOptions[name]);
        debug("options: %j", opts);
        return new this._transportsByName[name](opts);
    }
    /**
     * Initializes transport to use and starts probe.
     *
     * @private
     */
    _open() {
        if (this.transports.length === 0) {
            // Emit error on next tick so it can be listened to
            this.setTimeoutFn(() => {
                this.emitReserved("error", "No transports available");
            }, 0);
            return;
        }
        const transportName = this.opts.rememberUpgrade &&
            SocketWithoutUpgrade.priorWebsocketSuccess &&
            this.transports.indexOf("websocket") !== -1
            ? "websocket"
            : this.transports[0];
        this.readyState = "opening";
        const transport = this.createTransport(transportName);
        transport.open();
        this.setTransport(transport);
    }
    /**
     * Sets the current transport. Disables the existing one (if any).
     *
     * @private
     */
    setTransport(transport) {
        debug("setting transport %s", transport.name);
        if (this.transport) {
            debug("clearing existing transport %s", this.transport.name);
            this.transport.removeAllListeners();
        }
        // set up transport
        this.transport = transport;
        // set up transport listeners
        transport
            .on("drain", this._onDrain.bind(this))
            .on("packet", this._onPacket.bind(this))
            .on("error", this._onError.bind(this))
            .on("close", (reason) => this._onClose("transport close", reason));
    }
    /**
     * Called when connection is deemed open.
     *
     * @private
     */
    onOpen() {
        debug("socket open");
        this.readyState = "open";
        SocketWithoutUpgrade.priorWebsocketSuccess =
            "websocket" === this.transport.name;
        this.emitReserved("open");
        this.flush();
    }
    /**
     * Handles a packet.
     *
     * @private
     */
    _onPacket(packet) {
        if ("opening" === this.readyState ||
            "open" === this.readyState ||
            "closing" === this.readyState) {
            debug('socket receive: type "%s", data "%s"', packet.type, packet.data);
            this.emitReserved("packet", packet);
            // Socket is live - any packet counts
            this.emitReserved("heartbeat");
            switch (packet.type) {
                case "open":
                    this.onHandshake(JSON.parse(packet.data));
                    break;
                case "ping":
                    this._sendPacket("pong");
                    this.emitReserved("ping");
                    this.emitReserved("pong");
                    this._resetPingTimeout();
                    break;
                case "error":
                    const err = new Error("server error");
                    // @ts-ignore
                    err.code = packet.data;
                    this._onError(err);
                    break;
                case "message":
                    this.emitReserved("data", packet.data);
                    this.emitReserved("message", packet.data);
                    break;
            }
        }
        else {
            debug('packet received with socket readyState "%s"', this.readyState);
        }
    }
    /**
     * Called upon handshake completion.
     *
     * @param {Object} data - handshake obj
     * @private
     */
    onHandshake(data) {
        this.emitReserved("handshake", data);
        this.id = data.sid;
        this.transport.query.sid = data.sid;
        this._pingInterval = data.pingInterval;
        this._pingTimeout = data.pingTimeout;
        this._maxPayload = data.maxPayload;
        this.onOpen();
        // In case open handler closes socket
        if ("closed" === this.readyState)
            return;
        this._resetPingTimeout();
    }
    /**
     * Sets and resets ping timeout timer based on server pings.
     *
     * @private
     */
    _resetPingTimeout() {
        this.clearTimeoutFn(this._pingTimeoutTimer);
        const delay = this._pingInterval + this._pingTimeout;
        this._pingTimeoutTime = Date.now() + delay;
        this._pingTimeoutTimer = this.setTimeoutFn(() => {
            this._onClose("ping timeout");
        }, delay);
        if (this.opts.autoUnref) {
            this._pingTimeoutTimer.unref();
        }
    }
    /**
     * Called on `drain` event
     *
     * @private
     */
    _onDrain() {
        this.writeBuffer.splice(0, this._prevBufferLen);
        // setting prevBufferLen = 0 is very important
        // for example, when upgrading, upgrade packet is sent over,
        // and a nonzero prevBufferLen could cause problems on `drain`
        this._prevBufferLen = 0;
        if (0 === this.writeBuffer.length) {
            this.emitReserved("drain");
        }
        else {
            this.flush();
        }
    }
    /**
     * Flush write buffers.
     *
     * @private
     */
    flush() {
        if ("closed" !== this.readyState &&
            this.transport.writable &&
            !this.upgrading &&
            this.writeBuffer.length) {
            const packets = this._getWritablePackets();
            debug("flushing %d packets in socket", packets.length);
            this.transport.send(packets);
            // keep track of current length of writeBuffer
            // splice writeBuffer and callbackBuffer on `drain`
            this._prevBufferLen = packets.length;
            this.emitReserved("flush");
        }
    }
    /**
     * Ensure the encoded size of the writeBuffer is below the maxPayload value sent by the server (only for HTTP
     * long-polling)
     *
     * @private
     */
    _getWritablePackets() {
        const shouldCheckPayloadSize = this._maxPayload &&
            this.transport.name === "polling" &&
            this.writeBuffer.length > 1;
        if (!shouldCheckPayloadSize) {
            return this.writeBuffer;
        }
        let payloadSize = 1; // first packet type
        for (let i = 0; i < this.writeBuffer.length; i++) {
            const data = this.writeBuffer[i].data;
            if (data) {
                payloadSize += (0, util_js_1.byteLength)(data);
            }
            if (i > 0 && payloadSize > this._maxPayload) {
                debug("only send %d out of %d packets", i, this.writeBuffer.length);
                return this.writeBuffer.slice(0, i);
            }
            payloadSize += 2; // separator + packet type
        }
        debug("payload size is %d (max: %d)", payloadSize, this._maxPayload);
        return this.writeBuffer;
    }
    /**
     * Checks whether the heartbeat timer has expired but the socket has not yet been notified.
     *
     * Note: this method is private for now because it does not really fit the WebSocket API, but if we put it in the
     * `write()` method then the message would not be buffered by the Socket.IO client.
     *
     * @return {boolean}
     * @private
     */
    /* private */ _hasPingExpired() {
        if (!this._pingTimeoutTime)
            return true;
        const hasExpired = Date.now() > this._pingTimeoutTime;
        if (hasExpired) {
            debug("throttled timer detected, scheduling connection close");
            this._pingTimeoutTime = 0;
            (0, globals_node_js_1.nextTick)(() => {
                this._onClose("ping timeout");
            }, this.setTimeoutFn);
        }
        return hasExpired;
    }
    /**
     * Sends a message.
     *
     * @param {String} msg - message.
     * @param {Object} options.
     * @param {Function} fn - callback function.
     * @return {Socket} for chaining.
     */
    write(msg, options, fn) {
        this._sendPacket("message", msg, options, fn);
        return this;
    }
    /**
     * Sends a message. Alias of {@link Socket#write}.
     *
     * @param {String} msg - message.
     * @param {Object} options.
     * @param {Function} fn - callback function.
     * @return {Socket} for chaining.
     */
    send(msg, options, fn) {
        this._sendPacket("message", msg, options, fn);
        return this;
    }
    /**
     * Sends a packet.
     *
     * @param {String} type: packet type.
     * @param {String} data.
     * @param {Object} options.
     * @param {Function} fn - callback function.
     * @private
     */
    _sendPacket(type, data, options, fn) {
        if ("function" === typeof data) {
            fn = data;
            data = undefined;
        }
        if ("function" === typeof options) {
            fn = options;
            options = null;
        }
        if ("closing" === this.readyState || "closed" === this.readyState) {
            return;
        }
        options = options || {};
        options.compress = false !== options.compress;
        const packet = {
            type: type,
            data: data,
            options: options,
        };
        this.emitReserved("packetCreate", packet);
        this.writeBuffer.push(packet);
        if (fn)
            this.once("flush", fn);
        this.flush();
    }
    /**
     * Closes the connection.
     */
    close() {
        const close = () => {
            this._onClose("forced close");
            debug("socket closing - telling transport to close");
            this.transport.close();
        };
        const cleanupAndClose = () => {
            this.off("upgrade", cleanupAndClose);
            this.off("upgradeError", cleanupAndClose);
            close();
        };
        const waitForUpgrade = () => {
            // wait for upgrade to finish since we can't send packets while pausing a transport
            this.once("upgrade", cleanupAndClose);
            this.once("upgradeError", cleanupAndClose);
        };
        if ("opening" === this.readyState || "open" === this.readyState) {
            this.readyState = "closing";
            if (this.writeBuffer.length) {
                this.once("drain", () => {
                    if (this.upgrading) {
                        waitForUpgrade();
                    }
                    else {
                        close();
                    }
                });
            }
            else if (this.upgrading) {
                waitForUpgrade();
            }
            else {
                close();
            }
        }
        return this;
    }
    /**
     * Called upon transport error
     *
     * @private
     */
    _onError(err) {
        debug("socket error %j", err);
        SocketWithoutUpgrade.priorWebsocketSuccess = false;
        if (this.opts.tryAllTransports &&
            this.transports.length > 1 &&
            this.readyState === "opening") {
            debug("trying next transport");
            this.transports.shift();
            return this._open();
        }
        this.emitReserved("error", err);
        this._onClose("transport error", err);
    }
    /**
     * Called upon transport close.
     *
     * @private
     */
    _onClose(reason, description) {
        if ("opening" === this.readyState ||
            "open" === this.readyState ||
            "closing" === this.readyState) {
            debug('socket close with reason: "%s"', reason);
            // clear timers
            this.clearTimeoutFn(this._pingTimeoutTimer);
            // stop event from firing again for transport
            this.transport.removeAllListeners("close");
            // ensure transport won't stay open
            this.transport.close();
            // ignore further transport communication
            this.transport.removeAllListeners();
            if (withEventListeners) {
                if (this._beforeunloadEventListener) {
                    removeEventListener("beforeunload", this._beforeunloadEventListener, false);
                }
                if (this._offlineEventListener) {
                    const i = OFFLINE_EVENT_LISTENERS.indexOf(this._offlineEventListener);
                    if (i !== -1) {
                        debug("removing listener for the 'offline' event");
                        OFFLINE_EVENT_LISTENERS.splice(i, 1);
                    }
                }
            }
            // set ready state
            this.readyState = "closed";
            // clear session id
            this.id = null;
            // emit close event
            this.emitReserved("close", reason, description);
            // clean buffers after, so users can still
            // grab the buffers on `close` event
            this.writeBuffer = [];
            this._prevBufferLen = 0;
        }
    }
}
exports.SocketWithoutUpgrade = SocketWithoutUpgrade;
SocketWithoutUpgrade.protocol = engine_io_parser_1.protocol;
/**
 * This class provides a WebSocket-like interface to connect to an Engine.IO server. The connection will be established
 * with one of the available low-level transports, like HTTP long-polling, WebSocket or WebTransport.
 *
 * This class comes with an upgrade mechanism, which means that once the connection is established with the first
 * low-level transport, it will try to upgrade to a better transport.
 *
 * In order to allow tree-shaking, there are no transports included, that's why the `transports` option is mandatory.
 *
 * @example
 * import { SocketWithUpgrade, WebSocket } from "engine.io-client";
 *
 * const socket = new SocketWithUpgrade({
 *   transports: [WebSocket]
 * });
 *
 * socket.on("open", () => {
 *   socket.send("hello");
 * });
 *
 * @see SocketWithoutUpgrade
 * @see Socket
 */
class SocketWithUpgrade extends SocketWithoutUpgrade {
    constructor() {
        super(...arguments);
        this._upgrades = [];
    }
    onOpen() {
        super.onOpen();
        if ("open" === this.readyState && this.opts.upgrade) {
            debug("starting upgrade probes");
            for (let i = 0; i < this._upgrades.length; i++) {
                this._probe(this._upgrades[i]);
            }
        }
    }
    /**
     * Probes a transport.
     *
     * @param {String} name - transport name
     * @private
     */
    _probe(name) {
        debug('probing transport "%s"', name);
        let transport = this.createTransport(name);
        let failed = false;
        SocketWithoutUpgrade.priorWebsocketSuccess = false;
        const onTransportOpen = () => {
            if (failed)
                return;
            debug('probe transport "%s" opened', name);
            transport.send([{ type: "ping", data: "probe" }]);
            transport.once("packet", (msg) => {
                if (failed)
                    return;
                if ("pong" === msg.type && "probe" === msg.data) {
                    debug('probe transport "%s" pong', name);
                    this.upgrading = true;
                    this.emitReserved("upgrading", transport);
                    if (!transport)
                        return;
                    SocketWithoutUpgrade.priorWebsocketSuccess =
                        "websocket" === transport.name;
                    debug('pausing current transport "%s"', this.transport.name);
                    this.transport.pause(() => {
                        if (failed)
                            return;
                        if ("closed" === this.readyState)
                            return;
                        debug("changing transport and sending upgrade packet");
                        cleanup();
                        this.setTransport(transport);
                        transport.send([{ type: "upgrade" }]);
                        this.emitReserved("upgrade", transport);
                        transport = null;
                        this.upgrading = false;
                        this.flush();
                    });
                }
                else {
                    debug('probe transport "%s" failed', name);
                    const err = new Error("probe error");
                    // @ts-ignore
                    err.transport = transport.name;
                    this.emitReserved("upgradeError", err);
                }
            });
        };
        function freezeTransport() {
            if (failed)
                return;
            // Any callback called by transport should be ignored since now
            failed = true;
            cleanup();
            transport.close();
            transport = null;
        }
        // Handle any error that happens while probing
        const onerror = (err) => {
            const error = new Error("probe error: " + err);
            // @ts-ignore
            error.transport = transport.name;
            freezeTransport();
            debug('probe transport "%s" failed because of error: %s', name, err);
            this.emitReserved("upgradeError", error);
        };
        function onTransportClose() {
            onerror("transport closed");
        }
        // When the socket is closed while we're probing
        function onclose() {
            onerror("socket closed");
        }
        // When the socket is upgraded while we're probing
        function onupgrade(to) {
            if (transport && to.name !== transport.name) {
                debug('"%s" works - aborting "%s"', to.name, transport.name);
                freezeTransport();
            }
        }
        // Remove all listeners on the transport and on self
        const cleanup = () => {
            transport.removeListener("open", onTransportOpen);
            transport.removeListener("error", onerror);
            transport.removeListener("close", onTransportClose);
            this.off("close", onclose);
            this.off("upgrading", onupgrade);
        };
        transport.once("open", onTransportOpen);
        transport.once("error", onerror);
        transport.once("close", onTransportClose);
        this.once("close", onclose);
        this.once("upgrading", onupgrade);
        if (this._upgrades.indexOf("webtransport") !== -1 &&
            name !== "webtransport") {
            // favor WebTransport
            this.setTimeoutFn(() => {
                if (!failed) {
                    transport.open();
                }
            }, 200);
        }
        else {
            transport.open();
        }
    }
    onHandshake(data) {
        this._upgrades = this._filterUpgrades(data.upgrades);
        super.onHandshake(data);
    }
    /**
     * Filters upgrades, returning only those matching client transports.
     *
     * @param {Array} upgrades - server upgrades
     * @private
     */
    _filterUpgrades(upgrades) {
        const filteredUpgrades = [];
        for (let i = 0; i < upgrades.length; i++) {
            if (~this.transports.indexOf(upgrades[i]))
                filteredUpgrades.push(upgrades[i]);
        }
        return filteredUpgrades;
    }
}
exports.SocketWithUpgrade = SocketWithUpgrade;
/**
 * This class provides a WebSocket-like interface to connect to an Engine.IO server. The connection will be established
 * with one of the available low-level transports, like HTTP long-polling, WebSocket or WebTransport.
 *
 * This class comes with an upgrade mechanism, which means that once the connection is established with the first
 * low-level transport, it will try to upgrade to a better transport.
 *
 * @example
 * import { Socket } from "engine.io-client";
 *
 * const socket = new Socket();
 *
 * socket.on("open", () => {
 *   socket.send("hello");
 * });
 *
 * @see SocketWithoutUpgrade
 * @see SocketWithUpgrade
 */
class Socket extends SocketWithUpgrade {
    constructor(uri, opts = {}) {
        const o = typeof uri === "object" ? uri : opts;
        if (!o.transports ||
            (o.transports && typeof o.transports[0] === "string")) {
            o.transports = (o.transports || ["polling", "websocket", "webtransport"])
                .map((transportName) => index_js_1.transports[transportName])
                .filter((t) => !!t);
        }
        super(uri, o);
    }
}
exports.Socket = Socket;


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/transport.js"
/*!**************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/transport.js ***!
  \**************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Transport = exports.TransportError = void 0;
const engine_io_parser_1 = __webpack_require__(/*! engine.io-parser */ "./node_modules/engine.io-parser/build/cjs/index.js");
const component_emitter_1 = __webpack_require__(/*! @socket.io/component-emitter */ "./node_modules/@socket.io/component-emitter/lib/esm/index.js");
const util_js_1 = __webpack_require__(/*! ./util.js */ "./node_modules/engine.io-client/build/cjs/util.js");
const parseqs_js_1 = __webpack_require__(/*! ./contrib/parseqs.js */ "./node_modules/engine.io-client/build/cjs/contrib/parseqs.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("engine.io-client:transport"); // debug()
class TransportError extends Error {
    constructor(reason, description, context) {
        super(reason);
        this.description = description;
        this.context = context;
        this.type = "TransportError";
    }
}
exports.TransportError = TransportError;
class Transport extends component_emitter_1.Emitter {
    /**
     * Transport abstract constructor.
     *
     * @param {Object} opts - options
     * @protected
     */
    constructor(opts) {
        super();
        this.writable = false;
        (0, util_js_1.installTimerFunctions)(this, opts);
        this.opts = opts;
        this.query = opts.query;
        this.socket = opts.socket;
        this.supportsBinary = !opts.forceBase64;
    }
    /**
     * Emits an error.
     *
     * @param {String} reason
     * @param description
     * @param context - the error context
     * @return {Transport} for chaining
     * @protected
     */
    onError(reason, description, context) {
        super.emitReserved("error", new TransportError(reason, description, context));
        return this;
    }
    /**
     * Opens the transport.
     */
    open() {
        this.readyState = "opening";
        this.doOpen();
        return this;
    }
    /**
     * Closes the transport.
     */
    close() {
        if (this.readyState === "opening" || this.readyState === "open") {
            this.doClose();
            this.onClose();
        }
        return this;
    }
    /**
     * Sends multiple packets.
     *
     * @param {Array} packets
     */
    send(packets) {
        if (this.readyState === "open") {
            this.write(packets);
        }
        else {
            // this might happen if the transport was silently closed in the beforeunload event handler
            debug("transport is not open, discarding packets");
        }
    }
    /**
     * Called upon open
     *
     * @protected
     */
    onOpen() {
        this.readyState = "open";
        this.writable = true;
        super.emitReserved("open");
    }
    /**
     * Called with data.
     *
     * @param {String} data
     * @protected
     */
    onData(data) {
        const packet = (0, engine_io_parser_1.decodePacket)(data, this.socket.binaryType);
        this.onPacket(packet);
    }
    /**
     * Called with a decoded packet.
     *
     * @protected
     */
    onPacket(packet) {
        super.emitReserved("packet", packet);
    }
    /**
     * Called upon close.
     *
     * @protected
     */
    onClose(details) {
        this.readyState = "closed";
        super.emitReserved("close", details);
    }
    /**
     * Pauses the transport, in order not to lose packets during an upgrade.
     *
     * @param onPause
     */
    pause(onPause) { }
    createUri(schema, query = {}) {
        return (schema +
            "://" +
            this._hostname() +
            this._port() +
            this.opts.path +
            this._query(query));
    }
    _hostname() {
        const hostname = this.opts.hostname;
        return hostname.indexOf(":") === -1 ? hostname : "[" + hostname + "]";
    }
    _port() {
        if (this.opts.port &&
            ((this.opts.secure && Number(this.opts.port) !== 443) ||
                (!this.opts.secure && Number(this.opts.port) !== 80))) {
            return ":" + this.opts.port;
        }
        else {
            return "";
        }
    }
    _query(query) {
        const encodedQuery = (0, parseqs_js_1.encode)(query);
        return encodedQuery.length ? "?" + encodedQuery : "";
    }
}
exports.Transport = Transport;


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/transports/index.js"
/*!*********************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/transports/index.js ***!
  \*********************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.transports = void 0;
const polling_xhr_node_js_1 = __webpack_require__(/*! ./polling-xhr.node.js */ "./node_modules/engine.io-client/build/cjs/transports/polling-xhr.js");
const websocket_node_js_1 = __webpack_require__(/*! ./websocket.node.js */ "./node_modules/engine.io-client/build/cjs/transports/websocket.js");
const webtransport_js_1 = __webpack_require__(/*! ./webtransport.js */ "./node_modules/engine.io-client/build/cjs/transports/webtransport.js");
exports.transports = {
    websocket: websocket_node_js_1.WS,
    webtransport: webtransport_js_1.WT,
    polling: polling_xhr_node_js_1.XHR,
};


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/transports/polling-fetch.js"
/*!*****************************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/transports/polling-fetch.js ***!
  \*****************************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Fetch = void 0;
const polling_js_1 = __webpack_require__(/*! ./polling.js */ "./node_modules/engine.io-client/build/cjs/transports/polling.js");
/**
 * HTTP long-polling based on the built-in `fetch()` method.
 *
 * Usage: browser, Node.js (since v18), Deno, Bun
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/fetch
 * @see https://caniuse.com/fetch
 * @see https://nodejs.org/api/globals.html#fetch
 */
class Fetch extends polling_js_1.Polling {
    doPoll() {
        this._fetch()
            .then((res) => {
            if (!res.ok) {
                return this.onError("fetch read error", res.status, res);
            }
            res.text().then((data) => this.onData(data));
        })
            .catch((err) => {
            this.onError("fetch read error", err);
        });
    }
    doWrite(data, callback) {
        this._fetch(data)
            .then((res) => {
            if (!res.ok) {
                return this.onError("fetch write error", res.status, res);
            }
            callback();
        })
            .catch((err) => {
            this.onError("fetch write error", err);
        });
    }
    _fetch(data) {
        var _a;
        const isPost = data !== undefined;
        const headers = new Headers(this.opts.extraHeaders);
        if (isPost) {
            headers.set("content-type", "text/plain;charset=UTF-8");
        }
        (_a = this.socket._cookieJar) === null || _a === void 0 ? void 0 : _a.appendCookies(headers);
        return fetch(this.uri(), {
            method: isPost ? "POST" : "GET",
            body: isPost ? data : null,
            headers,
            credentials: this.opts.withCredentials ? "include" : "omit",
        }).then((res) => {
            var _a;
            // @ts-ignore getSetCookie() was added in Node.js v19.7.0
            (_a = this.socket._cookieJar) === null || _a === void 0 ? void 0 : _a.parseCookies(res.headers.getSetCookie());
            return res;
        });
    }
}
exports.Fetch = Fetch;


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/transports/polling-xhr.js"
/*!***************************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/transports/polling-xhr.js ***!
  \***************************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.XHR = exports.Request = exports.BaseXHR = void 0;
const polling_js_1 = __webpack_require__(/*! ./polling.js */ "./node_modules/engine.io-client/build/cjs/transports/polling.js");
const component_emitter_1 = __webpack_require__(/*! @socket.io/component-emitter */ "./node_modules/@socket.io/component-emitter/lib/esm/index.js");
const util_js_1 = __webpack_require__(/*! ../util.js */ "./node_modules/engine.io-client/build/cjs/util.js");
const globals_node_js_1 = __webpack_require__(/*! ../globals.node.js */ "./node_modules/engine.io-client/build/cjs/globals.js");
const has_cors_js_1 = __webpack_require__(/*! ../contrib/has-cors.js */ "./node_modules/engine.io-client/build/cjs/contrib/has-cors.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("engine.io-client:polling"); // debug()
function empty() { }
class BaseXHR extends polling_js_1.Polling {
    /**
     * XHR Polling constructor.
     *
     * @param {Object} opts
     * @package
     */
    constructor(opts) {
        super(opts);
        if (typeof location !== "undefined") {
            const isSSL = "https:" === location.protocol;
            let port = location.port;
            // some user agents have empty `location.port`
            if (!port) {
                port = isSSL ? "443" : "80";
            }
            this.xd =
                (typeof location !== "undefined" &&
                    opts.hostname !== location.hostname) ||
                    port !== opts.port;
        }
    }
    /**
     * Sends data.
     *
     * @param {String} data to send.
     * @param {Function} called upon flush.
     * @private
     */
    doWrite(data, fn) {
        const req = this.request({
            method: "POST",
            data: data,
        });
        req.on("success", fn);
        req.on("error", (xhrStatus, context) => {
            this.onError("xhr post error", xhrStatus, context);
        });
    }
    /**
     * Starts a poll cycle.
     *
     * @private
     */
    doPoll() {
        debug("xhr poll");
        const req = this.request();
        req.on("data", this.onData.bind(this));
        req.on("error", (xhrStatus, context) => {
            this.onError("xhr poll error", xhrStatus, context);
        });
        this.pollXhr = req;
    }
}
exports.BaseXHR = BaseXHR;
class Request extends component_emitter_1.Emitter {
    /**
     * Request constructor
     *
     * @param {Object} options
     * @package
     */
    constructor(createRequest, uri, opts) {
        super();
        this.createRequest = createRequest;
        (0, util_js_1.installTimerFunctions)(this, opts);
        this._opts = opts;
        this._method = opts.method || "GET";
        this._uri = uri;
        this._data = undefined !== opts.data ? opts.data : null;
        this._create();
    }
    /**
     * Creates the XHR object and sends the request.
     *
     * @private
     */
    _create() {
        var _a;
        const opts = (0, util_js_1.pick)(this._opts, "agent", "pfx", "key", "passphrase", "cert", "ca", "ciphers", "rejectUnauthorized", "autoUnref");
        opts.xdomain = !!this._opts.xd;
        const xhr = (this._xhr = this.createRequest(opts));
        try {
            debug("xhr open %s: %s", this._method, this._uri);
            xhr.open(this._method, this._uri, true);
            try {
                if (this._opts.extraHeaders) {
                    // @ts-ignore
                    xhr.setDisableHeaderCheck && xhr.setDisableHeaderCheck(true);
                    for (let i in this._opts.extraHeaders) {
                        if (this._opts.extraHeaders.hasOwnProperty(i)) {
                            xhr.setRequestHeader(i, this._opts.extraHeaders[i]);
                        }
                    }
                }
            }
            catch (e) { }
            if ("POST" === this._method) {
                try {
                    xhr.setRequestHeader("Content-type", "text/plain;charset=UTF-8");
                }
                catch (e) { }
            }
            try {
                xhr.setRequestHeader("Accept", "*/*");
            }
            catch (e) { }
            (_a = this._opts.cookieJar) === null || _a === void 0 ? void 0 : _a.addCookies(xhr);
            // ie6 check
            if ("withCredentials" in xhr) {
                xhr.withCredentials = this._opts.withCredentials;
            }
            if (this._opts.requestTimeout) {
                xhr.timeout = this._opts.requestTimeout;
            }
            xhr.onreadystatechange = () => {
                var _a;
                if (xhr.readyState === 3) {
                    (_a = this._opts.cookieJar) === null || _a === void 0 ? void 0 : _a.parseCookies(
                    // @ts-ignore
                    xhr.getResponseHeader("set-cookie"));
                }
                if (4 !== xhr.readyState)
                    return;
                if (200 === xhr.status || 1223 === xhr.status) {
                    this._onLoad();
                }
                else {
                    // make sure the `error` event handler that's user-set
                    // does not throw in the same tick and gets caught here
                    this.setTimeoutFn(() => {
                        this._onError(typeof xhr.status === "number" ? xhr.status : 0);
                    }, 0);
                }
            };
            debug("xhr data %s", this._data);
            xhr.send(this._data);
        }
        catch (e) {
            // Need to defer since .create() is called directly from the constructor
            // and thus the 'error' event can only be only bound *after* this exception
            // occurs.  Therefore, also, we cannot throw here at all.
            this.setTimeoutFn(() => {
                this._onError(e);
            }, 0);
            return;
        }
        if (typeof document !== "undefined") {
            this._index = Request.requestsCount++;
            Request.requests[this._index] = this;
        }
    }
    /**
     * Called upon error.
     *
     * @private
     */
    _onError(err) {
        this.emitReserved("error", err, this._xhr);
        this._cleanup(true);
    }
    /**
     * Cleans up house.
     *
     * @private
     */
    _cleanup(fromError) {
        if ("undefined" === typeof this._xhr || null === this._xhr) {
            return;
        }
        this._xhr.onreadystatechange = empty;
        if (fromError) {
            try {
                this._xhr.abort();
            }
            catch (e) { }
        }
        if (typeof document !== "undefined") {
            delete Request.requests[this._index];
        }
        this._xhr = null;
    }
    /**
     * Called upon load.
     *
     * @private
     */
    _onLoad() {
        const data = this._xhr.responseText;
        if (data !== null) {
            this.emitReserved("data", data);
            this.emitReserved("success");
            this._cleanup();
        }
    }
    /**
     * Aborts the request.
     *
     * @package
     */
    abort() {
        this._cleanup();
    }
}
exports.Request = Request;
Request.requestsCount = 0;
Request.requests = {};
/**
 * Aborts pending requests when unloading the window. This is needed to prevent
 * memory leaks (e.g. when using IE) and to ensure that no spurious error is
 * emitted.
 */
if (typeof document !== "undefined") {
    // @ts-ignore
    if (typeof attachEvent === "function") {
        // @ts-ignore
        attachEvent("onunload", unloadHandler);
    }
    else if (typeof addEventListener === "function") {
        const terminationEvent = "onpagehide" in globals_node_js_1.globalThisShim ? "pagehide" : "unload";
        addEventListener(terminationEvent, unloadHandler, false);
    }
}
function unloadHandler() {
    for (let i in Request.requests) {
        if (Request.requests.hasOwnProperty(i)) {
            Request.requests[i].abort();
        }
    }
}
const hasXHR2 = (function () {
    const xhr = newRequest({
        xdomain: false,
    });
    return xhr && xhr.responseType !== null;
})();
/**
 * HTTP long-polling based on the built-in `XMLHttpRequest` object.
 *
 * Usage: browser
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest
 */
class XHR extends BaseXHR {
    constructor(opts) {
        super(opts);
        const forceBase64 = opts && opts.forceBase64;
        this.supportsBinary = hasXHR2 && !forceBase64;
    }
    request(opts = {}) {
        Object.assign(opts, { xd: this.xd }, this.opts);
        return new Request(newRequest, this.uri(), opts);
    }
}
exports.XHR = XHR;
function newRequest(opts) {
    const xdomain = opts.xdomain;
    // XMLHttpRequest can be disabled on IE
    try {
        if ("undefined" !== typeof XMLHttpRequest && (!xdomain || has_cors_js_1.hasCORS)) {
            return new XMLHttpRequest();
        }
    }
    catch (e) { }
    if (!xdomain) {
        try {
            return new globals_node_js_1.globalThisShim[["Active"].concat("Object").join("X")]("Microsoft.XMLHTTP");
        }
        catch (e) { }
    }
}


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/transports/polling.js"
/*!***********************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/transports/polling.js ***!
  \***********************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Polling = void 0;
const transport_js_1 = __webpack_require__(/*! ../transport.js */ "./node_modules/engine.io-client/build/cjs/transport.js");
const util_js_1 = __webpack_require__(/*! ../util.js */ "./node_modules/engine.io-client/build/cjs/util.js");
const engine_io_parser_1 = __webpack_require__(/*! engine.io-parser */ "./node_modules/engine.io-parser/build/cjs/index.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("engine.io-client:polling"); // debug()
class Polling extends transport_js_1.Transport {
    constructor() {
        super(...arguments);
        this._polling = false;
    }
    get name() {
        return "polling";
    }
    /**
     * Opens the socket (triggers polling). We write a PING message to determine
     * when the transport is open.
     *
     * @protected
     */
    doOpen() {
        this._poll();
    }
    /**
     * Pauses polling.
     *
     * @param {Function} onPause - callback upon buffers are flushed and transport is paused
     * @package
     */
    pause(onPause) {
        this.readyState = "pausing";
        const pause = () => {
            debug("paused");
            this.readyState = "paused";
            onPause();
        };
        if (this._polling || !this.writable) {
            let total = 0;
            if (this._polling) {
                debug("we are currently polling - waiting to pause");
                total++;
                this.once("pollComplete", function () {
                    debug("pre-pause polling complete");
                    --total || pause();
                });
            }
            if (!this.writable) {
                debug("we are currently writing - waiting to pause");
                total++;
                this.once("drain", function () {
                    debug("pre-pause writing complete");
                    --total || pause();
                });
            }
        }
        else {
            pause();
        }
    }
    /**
     * Starts polling cycle.
     *
     * @private
     */
    _poll() {
        debug("polling");
        this._polling = true;
        this.doPoll();
        this.emitReserved("poll");
    }
    /**
     * Overloads onData to detect payloads.
     *
     * @protected
     */
    onData(data) {
        debug("polling got data %s", data);
        const callback = (packet) => {
            // if its the first message we consider the transport open
            if ("opening" === this.readyState && packet.type === "open") {
                this.onOpen();
            }
            // if its a close packet, we close the ongoing requests
            if ("close" === packet.type) {
                this.onClose({ description: "transport closed by the server" });
                return false;
            }
            // otherwise bypass onData and handle the message
            this.onPacket(packet);
        };
        // decode payload
        (0, engine_io_parser_1.decodePayload)(data, this.socket.binaryType).forEach(callback);
        // if an event did not trigger closing
        if ("closed" !== this.readyState) {
            // if we got data we're not polling
            this._polling = false;
            this.emitReserved("pollComplete");
            if ("open" === this.readyState) {
                this._poll();
            }
            else {
                debug('ignoring poll - transport state "%s"', this.readyState);
            }
        }
    }
    /**
     * For polling, send a close packet.
     *
     * @protected
     */
    doClose() {
        const close = () => {
            debug("writing close packet");
            this.write([{ type: "close" }]);
        };
        if ("open" === this.readyState) {
            debug("transport open - closing");
            close();
        }
        else {
            // in case we're trying to close while
            // handshaking is in progress (GH-164)
            debug("transport not open - deferring close");
            this.once("open", close);
        }
    }
    /**
     * Writes a packets payload.
     *
     * @param {Array} packets - data packets
     * @protected
     */
    write(packets) {
        this.writable = false;
        (0, engine_io_parser_1.encodePayload)(packets, (data) => {
            this.doWrite(data, () => {
                this.writable = true;
                this.emitReserved("drain");
            });
        });
    }
    /**
     * Generates uri for connection.
     *
     * @private
     */
    uri() {
        const schema = this.opts.secure ? "https" : "http";
        const query = this.query || {};
        // cache busting is forced
        if (false !== this.opts.timestampRequests) {
            query[this.opts.timestampParam] = (0, util_js_1.randomString)();
        }
        if (!this.supportsBinary && !query.sid) {
            query.b64 = 1;
        }
        return this.createUri(schema, query);
    }
}
exports.Polling = Polling;


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/transports/websocket.js"
/*!*************************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/transports/websocket.js ***!
  \*************************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WS = exports.BaseWS = void 0;
const transport_js_1 = __webpack_require__(/*! ../transport.js */ "./node_modules/engine.io-client/build/cjs/transport.js");
const util_js_1 = __webpack_require__(/*! ../util.js */ "./node_modules/engine.io-client/build/cjs/util.js");
const engine_io_parser_1 = __webpack_require__(/*! engine.io-parser */ "./node_modules/engine.io-parser/build/cjs/index.js");
const globals_node_js_1 = __webpack_require__(/*! ../globals.node.js */ "./node_modules/engine.io-client/build/cjs/globals.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("engine.io-client:websocket"); // debug()
// detect ReactNative environment
const isReactNative = typeof navigator !== "undefined" &&
    typeof navigator.product === "string" &&
    navigator.product.toLowerCase() === "reactnative";
class BaseWS extends transport_js_1.Transport {
    get name() {
        return "websocket";
    }
    doOpen() {
        const uri = this.uri();
        const protocols = this.opts.protocols;
        // React Native only supports the 'headers' option, and will print a warning if anything else is passed
        const opts = isReactNative
            ? {}
            : (0, util_js_1.pick)(this.opts, "agent", "perMessageDeflate", "pfx", "key", "passphrase", "cert", "ca", "ciphers", "rejectUnauthorized", "localAddress", "protocolVersion", "origin", "maxPayload", "family", "checkServerIdentity");
        if (this.opts.extraHeaders) {
            opts.headers = this.opts.extraHeaders;
        }
        try {
            this.ws = this.createSocket(uri, protocols, opts);
        }
        catch (err) {
            return this.emitReserved("error", err);
        }
        this.ws.binaryType = this.socket.binaryType;
        this.addEventListeners();
    }
    /**
     * Adds event listeners to the socket
     *
     * @private
     */
    addEventListeners() {
        this.ws.onopen = () => {
            if (this.opts.autoUnref) {
                this.ws._socket.unref();
            }
            this.onOpen();
        };
        this.ws.onclose = (closeEvent) => this.onClose({
            description: "websocket connection closed",
            context: closeEvent,
        });
        this.ws.onmessage = (ev) => this.onData(ev.data);
        this.ws.onerror = (e) => this.onError("websocket error", e);
    }
    write(packets) {
        this.writable = false;
        // encodePacket efficient as it uses WS framing
        // no need for encodePayload
        for (let i = 0; i < packets.length; i++) {
            const packet = packets[i];
            const lastPacket = i === packets.length - 1;
            (0, engine_io_parser_1.encodePacket)(packet, this.supportsBinary, (data) => {
                // Sometimes the websocket has already been closed but the browser didn't
                // have a chance of informing us about it yet, in that case send will
                // throw an error
                try {
                    this.doWrite(packet, data);
                }
                catch (e) {
                    debug("websocket closed before onclose event");
                }
                if (lastPacket) {
                    // fake drain
                    // defer to next tick to allow Socket to clear writeBuffer
                    (0, globals_node_js_1.nextTick)(() => {
                        this.writable = true;
                        this.emitReserved("drain");
                    }, this.setTimeoutFn);
                }
            });
        }
    }
    doClose() {
        if (typeof this.ws !== "undefined") {
            this.ws.onerror = () => { };
            this.ws.close();
            this.ws = null;
        }
    }
    /**
     * Generates uri for connection.
     *
     * @private
     */
    uri() {
        const schema = this.opts.secure ? "wss" : "ws";
        const query = this.query || {};
        // append timestamp to URI
        if (this.opts.timestampRequests) {
            query[this.opts.timestampParam] = (0, util_js_1.randomString)();
        }
        // communicate binary support capabilities
        if (!this.supportsBinary) {
            query.b64 = 1;
        }
        return this.createUri(schema, query);
    }
}
exports.BaseWS = BaseWS;
const WebSocketCtor = globals_node_js_1.globalThisShim.WebSocket || globals_node_js_1.globalThisShim.MozWebSocket;
/**
 * WebSocket transport based on the built-in `WebSocket` object.
 *
 * Usage: browser, Node.js (since v21), Deno, Bun
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
 * @see https://caniuse.com/mdn-api_websocket
 * @see https://nodejs.org/api/globals.html#websocket
 */
class WS extends BaseWS {
    createSocket(uri, protocols, opts) {
        return !isReactNative
            ? protocols
                ? new WebSocketCtor(uri, protocols)
                : new WebSocketCtor(uri)
            : new WebSocketCtor(uri, protocols, opts);
    }
    doWrite(_packet, data) {
        this.ws.send(data);
    }
}
exports.WS = WS;


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/transports/webtransport.js"
/*!****************************************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/transports/webtransport.js ***!
  \****************************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WT = void 0;
const transport_js_1 = __webpack_require__(/*! ../transport.js */ "./node_modules/engine.io-client/build/cjs/transport.js");
const globals_node_js_1 = __webpack_require__(/*! ../globals.node.js */ "./node_modules/engine.io-client/build/cjs/globals.js");
const engine_io_parser_1 = __webpack_require__(/*! engine.io-parser */ "./node_modules/engine.io-parser/build/cjs/index.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("engine.io-client:webtransport"); // debug()
/**
 * WebTransport transport based on the built-in `WebTransport` object.
 *
 * Usage: browser, Node.js (with the `@fails-components/webtransport` package)
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebTransport
 * @see https://caniuse.com/webtransport
 */
class WT extends transport_js_1.Transport {
    get name() {
        return "webtransport";
    }
    doOpen() {
        try {
            // @ts-ignore
            this._transport = new WebTransport(this.createUri("https"), this.opts.transportOptions[this.name]);
        }
        catch (err) {
            return this.emitReserved("error", err);
        }
        this._transport.closed
            .then(() => {
            debug("transport closed gracefully");
            this.onClose();
        })
            .catch((err) => {
            debug("transport closed due to %s", err);
            this.onError("webtransport error", err);
        });
        // note: we could have used async/await, but that would require some additional polyfills
        this._transport.ready.then(() => {
            this._transport.createBidirectionalStream().then((stream) => {
                const decoderStream = (0, engine_io_parser_1.createPacketDecoderStream)(Number.MAX_SAFE_INTEGER, this.socket.binaryType);
                const reader = stream.readable.pipeThrough(decoderStream).getReader();
                const encoderStream = (0, engine_io_parser_1.createPacketEncoderStream)();
                encoderStream.readable.pipeTo(stream.writable);
                this._writer = encoderStream.writable.getWriter();
                const read = () => {
                    reader
                        .read()
                        .then(({ done, value }) => {
                        if (done) {
                            debug("session is closed");
                            return;
                        }
                        debug("received chunk: %o", value);
                        this.onPacket(value);
                        read();
                    })
                        .catch((err) => {
                        debug("an error occurred while reading: %s", err);
                    });
                };
                read();
                const packet = { type: "open" };
                if (this.query.sid) {
                    packet.data = `{"sid":"${this.query.sid}"}`;
                }
                this._writer.write(packet).then(() => this.onOpen());
            });
        });
    }
    write(packets) {
        this.writable = false;
        for (let i = 0; i < packets.length; i++) {
            const packet = packets[i];
            const lastPacket = i === packets.length - 1;
            this._writer.write(packet).then(() => {
                if (lastPacket) {
                    (0, globals_node_js_1.nextTick)(() => {
                        this.writable = true;
                        this.emitReserved("drain");
                    }, this.setTimeoutFn);
                }
            });
        }
    }
    doClose() {
        var _a;
        (_a = this._transport) === null || _a === void 0 ? void 0 : _a.close();
    }
}
exports.WT = WT;


/***/ },

/***/ "./node_modules/engine.io-client/build/cjs/util.js"
/*!*********************************************************!*\
  !*** ./node_modules/engine.io-client/build/cjs/util.js ***!
  \*********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.pick = pick;
exports.installTimerFunctions = installTimerFunctions;
exports.byteLength = byteLength;
exports.randomString = randomString;
const globals_node_js_1 = __webpack_require__(/*! ./globals.node.js */ "./node_modules/engine.io-client/build/cjs/globals.js");
function pick(obj, ...attr) {
    return attr.reduce((acc, k) => {
        if (obj.hasOwnProperty(k)) {
            acc[k] = obj[k];
        }
        return acc;
    }, {});
}
// Keep a reference to the real timeout functions so they can be used when overridden
const NATIVE_SET_TIMEOUT = globals_node_js_1.globalThisShim.setTimeout;
const NATIVE_CLEAR_TIMEOUT = globals_node_js_1.globalThisShim.clearTimeout;
function installTimerFunctions(obj, opts) {
    if (opts.useNativeTimers) {
        obj.setTimeoutFn = NATIVE_SET_TIMEOUT.bind(globals_node_js_1.globalThisShim);
        obj.clearTimeoutFn = NATIVE_CLEAR_TIMEOUT.bind(globals_node_js_1.globalThisShim);
    }
    else {
        obj.setTimeoutFn = globals_node_js_1.globalThisShim.setTimeout.bind(globals_node_js_1.globalThisShim);
        obj.clearTimeoutFn = globals_node_js_1.globalThisShim.clearTimeout.bind(globals_node_js_1.globalThisShim);
    }
}
// base64 encoded buffers are about 33% bigger (https://en.wikipedia.org/wiki/Base64)
const BASE64_OVERHEAD = 1.33;
// we could also have used `new Blob([obj]).size`, but it isn't supported in IE9
function byteLength(obj) {
    if (typeof obj === "string") {
        return utf8Length(obj);
    }
    // arraybuffer or blob
    return Math.ceil((obj.byteLength || obj.size) * BASE64_OVERHEAD);
}
function utf8Length(str) {
    let c = 0, length = 0;
    for (let i = 0, l = str.length; i < l; i++) {
        c = str.charCodeAt(i);
        if (c < 0x80) {
            length += 1;
        }
        else if (c < 0x800) {
            length += 2;
        }
        else if (c < 0xd800 || c >= 0xe000) {
            length += 3;
        }
        else {
            i++;
            length += 4;
        }
    }
    return length;
}
/**
 * Generates a random 8-characters string.
 */
function randomString() {
    return (Date.now().toString(36).substring(3) +
        Math.random().toString(36).substring(2, 5));
}


/***/ },

/***/ "./node_modules/engine.io-parser/build/cjs/commons.js"
/*!************************************************************!*\
  !*** ./node_modules/engine.io-parser/build/cjs/commons.js ***!
  \************************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ERROR_PACKET = exports.PACKET_TYPES_REVERSE = exports.PACKET_TYPES = void 0;
const PACKET_TYPES = Object.create(null); // no Map = no polyfill
exports.PACKET_TYPES = PACKET_TYPES;
PACKET_TYPES["open"] = "0";
PACKET_TYPES["close"] = "1";
PACKET_TYPES["ping"] = "2";
PACKET_TYPES["pong"] = "3";
PACKET_TYPES["message"] = "4";
PACKET_TYPES["upgrade"] = "5";
PACKET_TYPES["noop"] = "6";
const PACKET_TYPES_REVERSE = Object.create(null);
exports.PACKET_TYPES_REVERSE = PACKET_TYPES_REVERSE;
Object.keys(PACKET_TYPES).forEach((key) => {
    PACKET_TYPES_REVERSE[PACKET_TYPES[key]] = key;
});
const ERROR_PACKET = { type: "error", data: "parser error" };
exports.ERROR_PACKET = ERROR_PACKET;


/***/ },

/***/ "./node_modules/engine.io-parser/build/cjs/contrib/base64-arraybuffer.js"
/*!*******************************************************************************!*\
  !*** ./node_modules/engine.io-parser/build/cjs/contrib/base64-arraybuffer.js ***!
  \*******************************************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decode = exports.encode = void 0;
// imported from https://github.com/socketio/base64-arraybuffer
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Use a lookup table to find the index.
const lookup = typeof Uint8Array === 'undefined' ? [] : new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
}
const encode = (arraybuffer) => {
    let bytes = new Uint8Array(arraybuffer), i, len = bytes.length, base64 = '';
    for (i = 0; i < len; i += 3) {
        base64 += chars[bytes[i] >> 2];
        base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        base64 += chars[bytes[i + 2] & 63];
    }
    if (len % 3 === 2) {
        base64 = base64.substring(0, base64.length - 1) + '=';
    }
    else if (len % 3 === 1) {
        base64 = base64.substring(0, base64.length - 2) + '==';
    }
    return base64;
};
exports.encode = encode;
const decode = (base64) => {
    let bufferLength = base64.length * 0.75, len = base64.length, i, p = 0, encoded1, encoded2, encoded3, encoded4;
    if (base64[base64.length - 1] === '=') {
        bufferLength--;
        if (base64[base64.length - 2] === '=') {
            bufferLength--;
        }
    }
    const arraybuffer = new ArrayBuffer(bufferLength), bytes = new Uint8Array(arraybuffer);
    for (i = 0; i < len; i += 4) {
        encoded1 = lookup[base64.charCodeAt(i)];
        encoded2 = lookup[base64.charCodeAt(i + 1)];
        encoded3 = lookup[base64.charCodeAt(i + 2)];
        encoded4 = lookup[base64.charCodeAt(i + 3)];
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return arraybuffer;
};
exports.decode = decode;


/***/ },

/***/ "./node_modules/engine.io-parser/build/cjs/decodePacket.browser.js"
/*!*************************************************************************!*\
  !*** ./node_modules/engine.io-parser/build/cjs/decodePacket.browser.js ***!
  \*************************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodePacket = void 0;
const commons_js_1 = __webpack_require__(/*! ./commons.js */ "./node_modules/engine.io-parser/build/cjs/commons.js");
const base64_arraybuffer_js_1 = __webpack_require__(/*! ./contrib/base64-arraybuffer.js */ "./node_modules/engine.io-parser/build/cjs/contrib/base64-arraybuffer.js");
const withNativeArrayBuffer = typeof ArrayBuffer === "function";
const decodePacket = (encodedPacket, binaryType) => {
    if (typeof encodedPacket !== "string") {
        return {
            type: "message",
            data: mapBinary(encodedPacket, binaryType),
        };
    }
    const type = encodedPacket.charAt(0);
    if (type === "b") {
        return {
            type: "message",
            data: decodeBase64Packet(encodedPacket.substring(1), binaryType),
        };
    }
    const packetType = commons_js_1.PACKET_TYPES_REVERSE[type];
    if (!packetType) {
        return commons_js_1.ERROR_PACKET;
    }
    return encodedPacket.length > 1
        ? {
            type: commons_js_1.PACKET_TYPES_REVERSE[type],
            data: encodedPacket.substring(1),
        }
        : {
            type: commons_js_1.PACKET_TYPES_REVERSE[type],
        };
};
exports.decodePacket = decodePacket;
const decodeBase64Packet = (data, binaryType) => {
    if (withNativeArrayBuffer) {
        const decoded = (0, base64_arraybuffer_js_1.decode)(data);
        return mapBinary(decoded, binaryType);
    }
    else {
        return { base64: true, data }; // fallback for old browsers
    }
};
const mapBinary = (data, binaryType) => {
    switch (binaryType) {
        case "blob":
            if (data instanceof Blob) {
                // from WebSocket + binaryType "blob"
                return data;
            }
            else {
                // from HTTP long-polling or WebTransport
                return new Blob([data]);
            }
        case "arraybuffer":
        default:
            if (data instanceof ArrayBuffer) {
                // from HTTP long-polling (base64) or WebSocket + binaryType "arraybuffer"
                return data;
            }
            else {
                // from WebTransport (Uint8Array)
                return data.buffer;
            }
    }
};


/***/ },

/***/ "./node_modules/engine.io-parser/build/cjs/encodePacket.browser.js"
/*!*************************************************************************!*\
  !*** ./node_modules/engine.io-parser/build/cjs/encodePacket.browser.js ***!
  \*************************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodePacket = void 0;
exports.encodePacketToBinary = encodePacketToBinary;
const commons_js_1 = __webpack_require__(/*! ./commons.js */ "./node_modules/engine.io-parser/build/cjs/commons.js");
const withNativeBlob = typeof Blob === "function" ||
    (typeof Blob !== "undefined" &&
        Object.prototype.toString.call(Blob) === "[object BlobConstructor]");
const withNativeArrayBuffer = typeof ArrayBuffer === "function";
// ArrayBuffer.isView method is not defined in IE10
const isView = (obj) => {
    return typeof ArrayBuffer.isView === "function"
        ? ArrayBuffer.isView(obj)
        : obj && obj.buffer instanceof ArrayBuffer;
};
const encodePacket = ({ type, data }, supportsBinary, callback) => {
    if (withNativeBlob && data instanceof Blob) {
        if (supportsBinary) {
            return callback(data);
        }
        else {
            return encodeBlobAsBase64(data, callback);
        }
    }
    else if (withNativeArrayBuffer &&
        (data instanceof ArrayBuffer || isView(data))) {
        if (supportsBinary) {
            return callback(data);
        }
        else {
            return encodeBlobAsBase64(new Blob([data]), callback);
        }
    }
    // plain string
    return callback(commons_js_1.PACKET_TYPES[type] + (data || ""));
};
exports.encodePacket = encodePacket;
const encodeBlobAsBase64 = (data, callback) => {
    const fileReader = new FileReader();
    fileReader.onload = function () {
        const content = fileReader.result.split(",")[1];
        callback("b" + (content || ""));
    };
    return fileReader.readAsDataURL(data);
};
function toArray(data) {
    if (data instanceof Uint8Array) {
        return data;
    }
    else if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    else {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
}
let TEXT_ENCODER;
function encodePacketToBinary(packet, callback) {
    if (withNativeBlob && packet.data instanceof Blob) {
        return packet.data.arrayBuffer().then(toArray).then(callback);
    }
    else if (withNativeArrayBuffer &&
        (packet.data instanceof ArrayBuffer || isView(packet.data))) {
        return callback(toArray(packet.data));
    }
    encodePacket(packet, false, (encoded) => {
        if (!TEXT_ENCODER) {
            TEXT_ENCODER = new TextEncoder();
        }
        callback(TEXT_ENCODER.encode(encoded));
    });
}


/***/ },

/***/ "./node_modules/engine.io-parser/build/cjs/index.js"
/*!**********************************************************!*\
  !*** ./node_modules/engine.io-parser/build/cjs/index.js ***!
  \**********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodePayload = exports.decodePacket = exports.encodePayload = exports.encodePacket = exports.protocol = void 0;
exports.createPacketEncoderStream = createPacketEncoderStream;
exports.createPacketDecoderStream = createPacketDecoderStream;
const encodePacket_js_1 = __webpack_require__(/*! ./encodePacket.js */ "./node_modules/engine.io-parser/build/cjs/encodePacket.browser.js");
Object.defineProperty(exports, "encodePacket", ({ enumerable: true, get: function () { return encodePacket_js_1.encodePacket; } }));
const decodePacket_js_1 = __webpack_require__(/*! ./decodePacket.js */ "./node_modules/engine.io-parser/build/cjs/decodePacket.browser.js");
Object.defineProperty(exports, "decodePacket", ({ enumerable: true, get: function () { return decodePacket_js_1.decodePacket; } }));
const commons_js_1 = __webpack_require__(/*! ./commons.js */ "./node_modules/engine.io-parser/build/cjs/commons.js");
const SEPARATOR = String.fromCharCode(30); // see https://en.wikipedia.org/wiki/Delimiter#ASCII_delimited_text
const encodePayload = (packets, callback) => {
    // some packets may be added to the array while encoding, so the initial length must be saved
    const length = packets.length;
    const encodedPackets = new Array(length);
    let count = 0;
    packets.forEach((packet, i) => {
        // force base64 encoding for binary packets
        (0, encodePacket_js_1.encodePacket)(packet, false, (encodedPacket) => {
            encodedPackets[i] = encodedPacket;
            if (++count === length) {
                callback(encodedPackets.join(SEPARATOR));
            }
        });
    });
};
exports.encodePayload = encodePayload;
const decodePayload = (encodedPayload, binaryType) => {
    const encodedPackets = encodedPayload.split(SEPARATOR);
    const packets = [];
    for (let i = 0; i < encodedPackets.length; i++) {
        const decodedPacket = (0, decodePacket_js_1.decodePacket)(encodedPackets[i], binaryType);
        packets.push(decodedPacket);
        if (decodedPacket.type === "error") {
            break;
        }
    }
    return packets;
};
exports.decodePayload = decodePayload;
function createPacketEncoderStream() {
    return new TransformStream({
        transform(packet, controller) {
            (0, encodePacket_js_1.encodePacketToBinary)(packet, (encodedPacket) => {
                const payloadLength = encodedPacket.length;
                let header;
                // inspired by the WebSocket format: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#decoding_payload_length
                if (payloadLength < 126) {
                    header = new Uint8Array(1);
                    new DataView(header.buffer).setUint8(0, payloadLength);
                }
                else if (payloadLength < 65536) {
                    header = new Uint8Array(3);
                    const view = new DataView(header.buffer);
                    view.setUint8(0, 126);
                    view.setUint16(1, payloadLength);
                }
                else {
                    header = new Uint8Array(9);
                    const view = new DataView(header.buffer);
                    view.setUint8(0, 127);
                    view.setBigUint64(1, BigInt(payloadLength));
                }
                // first bit indicates whether the payload is plain text (0) or binary (1)
                if (packet.data && typeof packet.data !== "string") {
                    header[0] |= 0x80;
                }
                controller.enqueue(header);
                controller.enqueue(encodedPacket);
            });
        },
    });
}
let TEXT_DECODER;
function totalLength(chunks) {
    return chunks.reduce((acc, chunk) => acc + chunk.length, 0);
}
function concatChunks(chunks, size) {
    if (chunks[0].length === size) {
        return chunks.shift();
    }
    const buffer = new Uint8Array(size);
    let j = 0;
    for (let i = 0; i < size; i++) {
        buffer[i] = chunks[0][j++];
        if (j === chunks[0].length) {
            chunks.shift();
            j = 0;
        }
    }
    if (chunks.length && j < chunks[0].length) {
        chunks[0] = chunks[0].slice(j);
    }
    return buffer;
}
function createPacketDecoderStream(maxPayload, binaryType) {
    if (!TEXT_DECODER) {
        TEXT_DECODER = new TextDecoder();
    }
    const chunks = [];
    let state = 0 /* State.READ_HEADER */;
    let expectedLength = -1;
    let isBinary = false;
    return new TransformStream({
        transform(chunk, controller) {
            chunks.push(chunk);
            while (true) {
                if (state === 0 /* State.READ_HEADER */) {
                    if (totalLength(chunks) < 1) {
                        break;
                    }
                    const header = concatChunks(chunks, 1);
                    isBinary = (header[0] & 0x80) === 0x80;
                    expectedLength = header[0] & 0x7f;
                    if (expectedLength < 126) {
                        state = 3 /* State.READ_PAYLOAD */;
                    }
                    else if (expectedLength === 126) {
                        state = 1 /* State.READ_EXTENDED_LENGTH_16 */;
                    }
                    else {
                        state = 2 /* State.READ_EXTENDED_LENGTH_64 */;
                    }
                }
                else if (state === 1 /* State.READ_EXTENDED_LENGTH_16 */) {
                    if (totalLength(chunks) < 2) {
                        break;
                    }
                    const headerArray = concatChunks(chunks, 2);
                    expectedLength = new DataView(headerArray.buffer, headerArray.byteOffset, headerArray.length).getUint16(0);
                    state = 3 /* State.READ_PAYLOAD */;
                }
                else if (state === 2 /* State.READ_EXTENDED_LENGTH_64 */) {
                    if (totalLength(chunks) < 8) {
                        break;
                    }
                    const headerArray = concatChunks(chunks, 8);
                    const view = new DataView(headerArray.buffer, headerArray.byteOffset, headerArray.length);
                    const n = view.getUint32(0);
                    if (n > Math.pow(2, 53 - 32) - 1) {
                        // the maximum safe integer in JavaScript is 2^53 - 1
                        controller.enqueue(commons_js_1.ERROR_PACKET);
                        break;
                    }
                    expectedLength = n * Math.pow(2, 32) + view.getUint32(4);
                    state = 3 /* State.READ_PAYLOAD */;
                }
                else {
                    if (totalLength(chunks) < expectedLength) {
                        break;
                    }
                    const data = concatChunks(chunks, expectedLength);
                    controller.enqueue((0, decodePacket_js_1.decodePacket)(isBinary ? data : TEXT_DECODER.decode(data), binaryType));
                    state = 0 /* State.READ_HEADER */;
                }
                if (expectedLength === 0 || expectedLength > maxPayload) {
                    controller.enqueue(commons_js_1.ERROR_PACKET);
                    break;
                }
            }
        },
    });
}
exports.protocol = 4;


/***/ },

/***/ "./node_modules/socket.io-client/build/cjs/contrib/backo2.js"
/*!*******************************************************************!*\
  !*** ./node_modules/socket.io-client/build/cjs/contrib/backo2.js ***!
  \*******************************************************************/
(__unused_webpack_module, exports) {

"use strict";

/**
 * Initialize backoff timer with `opts`.
 *
 * - `min` initial timeout in milliseconds [100]
 * - `max` max timeout [10000]
 * - `jitter` [0]
 * - `factor` [2]
 *
 * @param {Object} opts
 * @api public
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Backoff = Backoff;
function Backoff(opts) {
    opts = opts || {};
    this.ms = opts.min || 100;
    this.max = opts.max || 10000;
    this.factor = opts.factor || 2;
    this.jitter = opts.jitter > 0 && opts.jitter <= 1 ? opts.jitter : 0;
    this.attempts = 0;
}
/**
 * Return the backoff duration.
 *
 * @return {Number}
 * @api public
 */
Backoff.prototype.duration = function () {
    var ms = this.ms * Math.pow(this.factor, this.attempts++);
    if (this.jitter) {
        var rand = Math.random();
        var deviation = Math.floor(rand * this.jitter * ms);
        ms = (Math.floor(rand * 10) & 1) == 0 ? ms - deviation : ms + deviation;
    }
    return Math.min(ms, this.max) | 0;
};
/**
 * Reset the number of attempts.
 *
 * @api public
 */
Backoff.prototype.reset = function () {
    this.attempts = 0;
};
/**
 * Set the minimum duration
 *
 * @api public
 */
Backoff.prototype.setMin = function (min) {
    this.ms = min;
};
/**
 * Set the maximum duration
 *
 * @api public
 */
Backoff.prototype.setMax = function (max) {
    this.max = max;
};
/**
 * Set the jitter
 *
 * @api public
 */
Backoff.prototype.setJitter = function (jitter) {
    this.jitter = jitter;
};


/***/ },

/***/ "./node_modules/socket.io-client/build/cjs/index.js"
/*!**********************************************************!*\
  !*** ./node_modules/socket.io-client/build/cjs/index.js ***!
  \**********************************************************/
(module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WebTransport = exports.WebSocket = exports.NodeWebSocket = exports.XHR = exports.NodeXHR = exports.Fetch = exports.Socket = exports.Manager = exports.protocol = void 0;
exports.io = lookup;
exports.connect = lookup;
exports["default"] = lookup;
const url_js_1 = __webpack_require__(/*! ./url.js */ "./node_modules/socket.io-client/build/cjs/url.js");
const manager_js_1 = __webpack_require__(/*! ./manager.js */ "./node_modules/socket.io-client/build/cjs/manager.js");
Object.defineProperty(exports, "Manager", ({ enumerable: true, get: function () { return manager_js_1.Manager; } }));
const socket_js_1 = __webpack_require__(/*! ./socket.js */ "./node_modules/socket.io-client/build/cjs/socket.js");
Object.defineProperty(exports, "Socket", ({ enumerable: true, get: function () { return socket_js_1.Socket; } }));
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("socket.io-client"); // debug()
/**
 * Managers cache.
 */
const cache = {};
function lookup(uri, opts) {
    if (typeof uri === "object") {
        opts = uri;
        uri = undefined;
    }
    opts = opts || {};
    const parsed = (0, url_js_1.url)(uri, opts.path || "/socket.io");
    const source = parsed.source;
    const id = parsed.id;
    const path = parsed.path;
    const sameNamespace = cache[id] && path in cache[id]["nsps"];
    const newConnection = opts.forceNew ||
        opts["force new connection"] ||
        false === opts.multiplex ||
        sameNamespace;
    let io;
    if (newConnection) {
        debug("ignoring socket cache for %s", source);
        io = new manager_js_1.Manager(source, opts);
    }
    else {
        if (!cache[id]) {
            debug("new io instance for %s", source);
            cache[id] = new manager_js_1.Manager(source, opts);
        }
        io = cache[id];
    }
    if (parsed.query && !opts.query) {
        opts.query = parsed.queryKey;
    }
    return io.socket(parsed.path, opts);
}
// so that "lookup" can be used both as a function (e.g. `io(...)`) and as a
// namespace (e.g. `io.connect(...)`), for backward compatibility
Object.assign(lookup, {
    Manager: manager_js_1.Manager,
    Socket: socket_js_1.Socket,
    io: lookup,
    connect: lookup,
});
/**
 * Protocol version.
 *
 * @public
 */
var socket_io_parser_1 = __webpack_require__(/*! socket.io-parser */ "./node_modules/socket.io-parser/build/cjs/index.js");
Object.defineProperty(exports, "protocol", ({ enumerable: true, get: function () { return socket_io_parser_1.protocol; } }));
var engine_io_client_1 = __webpack_require__(/*! engine.io-client */ "./node_modules/engine.io-client/build/cjs/index.js");
Object.defineProperty(exports, "Fetch", ({ enumerable: true, get: function () { return engine_io_client_1.Fetch; } }));
Object.defineProperty(exports, "NodeXHR", ({ enumerable: true, get: function () { return engine_io_client_1.NodeXHR; } }));
Object.defineProperty(exports, "XHR", ({ enumerable: true, get: function () { return engine_io_client_1.XHR; } }));
Object.defineProperty(exports, "NodeWebSocket", ({ enumerable: true, get: function () { return engine_io_client_1.NodeWebSocket; } }));
Object.defineProperty(exports, "WebSocket", ({ enumerable: true, get: function () { return engine_io_client_1.WebSocket; } }));
Object.defineProperty(exports, "WebTransport", ({ enumerable: true, get: function () { return engine_io_client_1.WebTransport; } }));

module.exports = lookup;


/***/ },

/***/ "./node_modules/socket.io-client/build/cjs/manager.js"
/*!************************************************************!*\
  !*** ./node_modules/socket.io-client/build/cjs/manager.js ***!
  \************************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Manager = void 0;
const engine_io_client_1 = __webpack_require__(/*! engine.io-client */ "./node_modules/engine.io-client/build/cjs/index.js");
const socket_js_1 = __webpack_require__(/*! ./socket.js */ "./node_modules/socket.io-client/build/cjs/socket.js");
const parser = __importStar(__webpack_require__(/*! socket.io-parser */ "./node_modules/socket.io-parser/build/cjs/index.js"));
const on_js_1 = __webpack_require__(/*! ./on.js */ "./node_modules/socket.io-client/build/cjs/on.js");
const backo2_js_1 = __webpack_require__(/*! ./contrib/backo2.js */ "./node_modules/socket.io-client/build/cjs/contrib/backo2.js");
const component_emitter_1 = __webpack_require__(/*! @socket.io/component-emitter */ "./node_modules/@socket.io/component-emitter/lib/esm/index.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("socket.io-client:manager"); // debug()
class Manager extends component_emitter_1.Emitter {
    constructor(uri, opts) {
        var _a;
        super();
        this.nsps = {};
        this.subs = [];
        if (uri && "object" === typeof uri) {
            opts = uri;
            uri = undefined;
        }
        opts = opts || {};
        opts.path = opts.path || "/socket.io";
        this.opts = opts;
        (0, engine_io_client_1.installTimerFunctions)(this, opts);
        this.reconnection(opts.reconnection !== false);
        this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
        this.reconnectionDelay(opts.reconnectionDelay || 1000);
        this.reconnectionDelayMax(opts.reconnectionDelayMax || 5000);
        this.randomizationFactor((_a = opts.randomizationFactor) !== null && _a !== void 0 ? _a : 0.5);
        this.backoff = new backo2_js_1.Backoff({
            min: this.reconnectionDelay(),
            max: this.reconnectionDelayMax(),
            jitter: this.randomizationFactor(),
        });
        this.timeout(null == opts.timeout ? 20000 : opts.timeout);
        this._readyState = "closed";
        this.uri = uri;
        const _parser = opts.parser || parser;
        this.encoder = new _parser.Encoder();
        this.decoder = new _parser.Decoder();
        this._autoConnect = opts.autoConnect !== false;
        if (this._autoConnect)
            this.open();
    }
    reconnection(v) {
        if (!arguments.length)
            return this._reconnection;
        this._reconnection = !!v;
        if (!v) {
            this.skipReconnect = true;
        }
        return this;
    }
    reconnectionAttempts(v) {
        if (v === undefined)
            return this._reconnectionAttempts;
        this._reconnectionAttempts = v;
        return this;
    }
    reconnectionDelay(v) {
        var _a;
        if (v === undefined)
            return this._reconnectionDelay;
        this._reconnectionDelay = v;
        (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setMin(v);
        return this;
    }
    randomizationFactor(v) {
        var _a;
        if (v === undefined)
            return this._randomizationFactor;
        this._randomizationFactor = v;
        (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setJitter(v);
        return this;
    }
    reconnectionDelayMax(v) {
        var _a;
        if (v === undefined)
            return this._reconnectionDelayMax;
        this._reconnectionDelayMax = v;
        (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setMax(v);
        return this;
    }
    timeout(v) {
        if (!arguments.length)
            return this._timeout;
        this._timeout = v;
        return this;
    }
    /**
     * Starts trying to reconnect if reconnection is enabled and we have not
     * started reconnecting yet
     *
     * @private
     */
    maybeReconnectOnOpen() {
        // Only try to reconnect if it's the first time we're connecting
        if (!this._reconnecting &&
            this._reconnection &&
            this.backoff.attempts === 0) {
            // keeps reconnection from firing twice for the same reconnection loop
            this.reconnect();
        }
    }
    /**
     * Sets the current transport `socket`.
     *
     * @param {Function} fn - optional, callback
     * @return self
     * @public
     */
    open(fn) {
        debug("readyState %s", this._readyState);
        if (~this._readyState.indexOf("open"))
            return this;
        debug("opening %s", this.uri);
        this.engine = new engine_io_client_1.Socket(this.uri, this.opts);
        const socket = this.engine;
        const self = this;
        this._readyState = "opening";
        this.skipReconnect = false;
        // emit `open`
        const openSubDestroy = (0, on_js_1.on)(socket, "open", function () {
            self.onopen();
            fn && fn();
        });
        const onError = (err) => {
            debug("error");
            this.cleanup();
            this._readyState = "closed";
            this.emitReserved("error", err);
            if (fn) {
                fn(err);
            }
            else {
                // Only do this if there is no fn to handle the error
                this.maybeReconnectOnOpen();
            }
        };
        // emit `error`
        const errorSub = (0, on_js_1.on)(socket, "error", onError);
        if (false !== this._timeout) {
            const timeout = this._timeout;
            debug("connect attempt will timeout after %d", timeout);
            // set timer
            const timer = this.setTimeoutFn(() => {
                debug("connect attempt timed out after %d", timeout);
                openSubDestroy();
                onError(new Error("timeout"));
                socket.close();
            }, timeout);
            if (this.opts.autoUnref) {
                timer.unref();
            }
            this.subs.push(() => {
                this.clearTimeoutFn(timer);
            });
        }
        this.subs.push(openSubDestroy);
        this.subs.push(errorSub);
        return this;
    }
    /**
     * Alias for open()
     *
     * @return self
     * @public
     */
    connect(fn) {
        return this.open(fn);
    }
    /**
     * Called upon transport open.
     *
     * @private
     */
    onopen() {
        debug("open");
        // clear old subs
        this.cleanup();
        // mark as open
        this._readyState = "open";
        this.emitReserved("open");
        // add new subs
        const socket = this.engine;
        this.subs.push((0, on_js_1.on)(socket, "ping", this.onping.bind(this)), (0, on_js_1.on)(socket, "data", this.ondata.bind(this)), (0, on_js_1.on)(socket, "error", this.onerror.bind(this)), (0, on_js_1.on)(socket, "close", this.onclose.bind(this)), 
        // @ts-ignore
        (0, on_js_1.on)(this.decoder, "decoded", this.ondecoded.bind(this)));
    }
    /**
     * Called upon a ping.
     *
     * @private
     */
    onping() {
        this.emitReserved("ping");
    }
    /**
     * Called with data.
     *
     * @private
     */
    ondata(data) {
        try {
            this.decoder.add(data);
        }
        catch (e) {
            this.onclose("parse error", e);
        }
    }
    /**
     * Called when parser fully decodes a packet.
     *
     * @private
     */
    ondecoded(packet) {
        // the nextTick call prevents an exception in a user-provided event listener from triggering a disconnection due to a "parse error"
        (0, engine_io_client_1.nextTick)(() => {
            this.emitReserved("packet", packet);
        }, this.setTimeoutFn);
    }
    /**
     * Called upon socket error.
     *
     * @private
     */
    onerror(err) {
        debug("error", err);
        this.emitReserved("error", err);
    }
    /**
     * Creates a new socket for the given `nsp`.
     *
     * @return {Socket}
     * @public
     */
    socket(nsp, opts) {
        let socket = this.nsps[nsp];
        if (!socket) {
            socket = new socket_js_1.Socket(this, nsp, opts);
            this.nsps[nsp] = socket;
        }
        else if (this._autoConnect && !socket.active) {
            socket.connect();
        }
        return socket;
    }
    /**
     * Called upon a socket close.
     *
     * @param socket
     * @private
     */
    _destroy(socket) {
        const nsps = Object.keys(this.nsps);
        for (const nsp of nsps) {
            const socket = this.nsps[nsp];
            if (socket.active) {
                debug("socket %s is still active, skipping close", nsp);
                return;
            }
        }
        this._close();
    }
    /**
     * Writes a packet.
     *
     * @param packet
     * @private
     */
    _packet(packet) {
        debug("writing packet %j", packet);
        const encodedPackets = this.encoder.encode(packet);
        for (let i = 0; i < encodedPackets.length; i++) {
            this.engine.write(encodedPackets[i], packet.options);
        }
    }
    /**
     * Clean up transport subscriptions and packet buffer.
     *
     * @private
     */
    cleanup() {
        debug("cleanup");
        this.subs.forEach((subDestroy) => subDestroy());
        this.subs.length = 0;
        this.decoder.destroy();
    }
    /**
     * Close the current socket.
     *
     * @private
     */
    _close() {
        debug("disconnect");
        this.skipReconnect = true;
        this._reconnecting = false;
        this.onclose("forced close");
    }
    /**
     * Alias for close()
     *
     * @private
     */
    disconnect() {
        return this._close();
    }
    /**
     * Called when:
     *
     * - the low-level engine is closed
     * - the parser encountered a badly formatted packet
     * - all sockets are disconnected
     *
     * @private
     */
    onclose(reason, description) {
        var _a;
        debug("closed due to %s", reason);
        this.cleanup();
        (_a = this.engine) === null || _a === void 0 ? void 0 : _a.close();
        this.backoff.reset();
        this._readyState = "closed";
        this.emitReserved("close", reason, description);
        if (this._reconnection && !this.skipReconnect) {
            this.reconnect();
        }
    }
    /**
     * Attempt a reconnection.
     *
     * @private
     */
    reconnect() {
        if (this._reconnecting || this.skipReconnect)
            return this;
        const self = this;
        if (this.backoff.attempts >= this._reconnectionAttempts) {
            debug("reconnect failed");
            this.backoff.reset();
            this.emitReserved("reconnect_failed");
            this._reconnecting = false;
        }
        else {
            const delay = this.backoff.duration();
            debug("will wait %dms before reconnect attempt", delay);
            this._reconnecting = true;
            const timer = this.setTimeoutFn(() => {
                if (self.skipReconnect)
                    return;
                debug("attempting reconnect");
                this.emitReserved("reconnect_attempt", self.backoff.attempts);
                // check again for the case socket closed in above events
                if (self.skipReconnect)
                    return;
                self.open((err) => {
                    if (err) {
                        debug("reconnect attempt error");
                        self._reconnecting = false;
                        self.reconnect();
                        this.emitReserved("reconnect_error", err);
                    }
                    else {
                        debug("reconnect success");
                        self.onreconnect();
                    }
                });
            }, delay);
            if (this.opts.autoUnref) {
                timer.unref();
            }
            this.subs.push(() => {
                this.clearTimeoutFn(timer);
            });
        }
    }
    /**
     * Called upon successful reconnect.
     *
     * @private
     */
    onreconnect() {
        const attempt = this.backoff.attempts;
        this._reconnecting = false;
        this.backoff.reset();
        this.emitReserved("reconnect", attempt);
    }
}
exports.Manager = Manager;


/***/ },

/***/ "./node_modules/socket.io-client/build/cjs/on.js"
/*!*******************************************************!*\
  !*** ./node_modules/socket.io-client/build/cjs/on.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.on = on;
function on(obj, ev, fn) {
    obj.on(ev, fn);
    return function subDestroy() {
        obj.off(ev, fn);
    };
}


/***/ },

/***/ "./node_modules/socket.io-client/build/cjs/socket.js"
/*!***********************************************************!*\
  !*** ./node_modules/socket.io-client/build/cjs/socket.js ***!
  \***********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Socket = void 0;
const socket_io_parser_1 = __webpack_require__(/*! socket.io-parser */ "./node_modules/socket.io-parser/build/cjs/index.js");
const on_js_1 = __webpack_require__(/*! ./on.js */ "./node_modules/socket.io-client/build/cjs/on.js");
const component_emitter_1 = __webpack_require__(/*! @socket.io/component-emitter */ "./node_modules/@socket.io/component-emitter/lib/esm/index.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("socket.io-client:socket"); // debug()
/**
 * Internal events.
 * These events can't be emitted by the user.
 */
const RESERVED_EVENTS = Object.freeze({
    connect: 1,
    connect_error: 1,
    disconnect: 1,
    disconnecting: 1,
    // EventEmitter reserved events: https://nodejs.org/api/events.html#events_event_newlistener
    newListener: 1,
    removeListener: 1,
});
/**
 * A Socket is the fundamental class for interacting with the server.
 *
 * A Socket belongs to a certain Namespace (by default /) and uses an underlying {@link Manager} to communicate.
 *
 * @example
 * const socket = io();
 *
 * socket.on("connect", () => {
 *   console.log("connected");
 * });
 *
 * // send an event to the server
 * socket.emit("foo", "bar");
 *
 * socket.on("foobar", () => {
 *   // an event was received from the server
 * });
 *
 * // upon disconnection
 * socket.on("disconnect", (reason) => {
 *   console.log(`disconnected due to ${reason}`);
 * });
 */
class Socket extends component_emitter_1.Emitter {
    /**
     * `Socket` constructor.
     */
    constructor(io, nsp, opts) {
        super();
        /**
         * Whether the socket is currently connected to the server.
         *
         * @example
         * const socket = io();
         *
         * socket.on("connect", () => {
         *   console.log(socket.connected); // true
         * });
         *
         * socket.on("disconnect", () => {
         *   console.log(socket.connected); // false
         * });
         */
        this.connected = false;
        /**
         * Whether the connection state was recovered after a temporary disconnection. In that case, any missed packets will
         * be transmitted by the server.
         */
        this.recovered = false;
        /**
         * Buffer for packets received before the CONNECT packet
         */
        this.receiveBuffer = [];
        /**
         * Buffer for packets that will be sent once the socket is connected
         */
        this.sendBuffer = [];
        /**
         * The queue of packets to be sent with retry in case of failure.
         *
         * Packets are sent one by one, each waiting for the server acknowledgement, in order to guarantee the delivery order.
         * @private
         */
        this._queue = [];
        /**
         * A sequence to generate the ID of the {@link QueuedPacket}.
         * @private
         */
        this._queueSeq = 0;
        this.ids = 0;
        /**
         * A map containing acknowledgement handlers.
         *
         * The `withError` attribute is used to differentiate handlers that accept an error as first argument:
         *
         * - `socket.emit("test", (err, value) => { ... })` with `ackTimeout` option
         * - `socket.timeout(5000).emit("test", (err, value) => { ... })`
         * - `const value = await socket.emitWithAck("test")`
         *
         * From those that don't:
         *
         * - `socket.emit("test", (value) => { ... });`
         *
         * In the first case, the handlers will be called with an error when:
         *
         * - the timeout is reached
         * - the socket gets disconnected
         *
         * In the second case, the handlers will be simply discarded upon disconnection, since the client will never receive
         * an acknowledgement from the server.
         *
         * @private
         */
        this.acks = {};
        this.flags = {};
        this.io = io;
        this.nsp = nsp;
        if (opts && opts.auth) {
            this.auth = opts.auth;
        }
        this._opts = Object.assign({}, opts);
        if (this.io._autoConnect)
            this.open();
    }
    /**
     * Whether the socket is currently disconnected
     *
     * @example
     * const socket = io();
     *
     * socket.on("connect", () => {
     *   console.log(socket.disconnected); // false
     * });
     *
     * socket.on("disconnect", () => {
     *   console.log(socket.disconnected); // true
     * });
     */
    get disconnected() {
        return !this.connected;
    }
    /**
     * Subscribe to open, close and packet events
     *
     * @private
     */
    subEvents() {
        if (this.subs)
            return;
        const io = this.io;
        this.subs = [
            (0, on_js_1.on)(io, "open", this.onopen.bind(this)),
            (0, on_js_1.on)(io, "packet", this.onpacket.bind(this)),
            (0, on_js_1.on)(io, "error", this.onerror.bind(this)),
            (0, on_js_1.on)(io, "close", this.onclose.bind(this)),
        ];
    }
    /**
     * Whether the Socket will try to reconnect when its Manager connects or reconnects.
     *
     * @example
     * const socket = io();
     *
     * console.log(socket.active); // true
     *
     * socket.on("disconnect", (reason) => {
     *   if (reason === "io server disconnect") {
     *     // the disconnection was initiated by the server, you need to manually reconnect
     *     console.log(socket.active); // false
     *   }
     *   // else the socket will automatically try to reconnect
     *   console.log(socket.active); // true
     * });
     */
    get active() {
        return !!this.subs;
    }
    /**
     * "Opens" the socket.
     *
     * @example
     * const socket = io({
     *   autoConnect: false
     * });
     *
     * socket.connect();
     */
    connect() {
        if (this.connected)
            return this;
        this.subEvents();
        if (!this.io["_reconnecting"])
            this.io.open(); // ensure open
        if ("open" === this.io._readyState)
            this.onopen();
        return this;
    }
    /**
     * Alias for {@link connect()}.
     */
    open() {
        return this.connect();
    }
    /**
     * Sends a `message` event.
     *
     * This method mimics the WebSocket.send() method.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
     *
     * @example
     * socket.send("hello");
     *
     * // this is equivalent to
     * socket.emit("message", "hello");
     *
     * @return self
     */
    send(...args) {
        args.unshift("message");
        this.emit.apply(this, args);
        return this;
    }
    /**
     * Override `emit`.
     * If the event is in `events`, it's emitted normally.
     *
     * @example
     * socket.emit("hello", "world");
     *
     * // all serializable datastructures are supported (no need to call JSON.stringify)
     * socket.emit("hello", 1, "2", { 3: ["4"], 5: Uint8Array.from([6]) });
     *
     * // with an acknowledgement from the server
     * socket.emit("hello", "world", (val) => {
     *   // ...
     * });
     *
     * @return self
     */
    emit(ev, ...args) {
        var _a, _b, _c;
        if (RESERVED_EVENTS.hasOwnProperty(ev)) {
            throw new Error('"' + ev.toString() + '" is a reserved event name');
        }
        args.unshift(ev);
        if (this._opts.retries && !this.flags.fromQueue && !this.flags.volatile) {
            this._addToQueue(args);
            return this;
        }
        const packet = {
            type: socket_io_parser_1.PacketType.EVENT,
            data: args,
        };
        packet.options = {};
        packet.options.compress = this.flags.compress !== false;
        // event ack callback
        if ("function" === typeof args[args.length - 1]) {
            const id = this.ids++;
            debug("emitting packet with ack id %d", id);
            const ack = args.pop();
            this._registerAckCallback(id, ack);
            packet.id = id;
        }
        const isTransportWritable = (_b = (_a = this.io.engine) === null || _a === void 0 ? void 0 : _a.transport) === null || _b === void 0 ? void 0 : _b.writable;
        const isConnected = this.connected && !((_c = this.io.engine) === null || _c === void 0 ? void 0 : _c._hasPingExpired());
        const discardPacket = this.flags.volatile && !isTransportWritable;
        if (discardPacket) {
            debug("discard packet as the transport is not currently writable");
        }
        else if (isConnected) {
            this.notifyOutgoingListeners(packet);
            this.packet(packet);
        }
        else {
            this.sendBuffer.push(packet);
        }
        this.flags = {};
        return this;
    }
    /**
     * @private
     */
    _registerAckCallback(id, ack) {
        var _a;
        const timeout = (_a = this.flags.timeout) !== null && _a !== void 0 ? _a : this._opts.ackTimeout;
        if (timeout === undefined) {
            this.acks[id] = ack;
            return;
        }
        // @ts-ignore
        const timer = this.io.setTimeoutFn(() => {
            delete this.acks[id];
            for (let i = 0; i < this.sendBuffer.length; i++) {
                if (this.sendBuffer[i].id === id) {
                    debug("removing packet with ack id %d from the buffer", id);
                    this.sendBuffer.splice(i, 1);
                }
            }
            debug("event with ack id %d has timed out after %d ms", id, timeout);
            ack.call(this, new Error("operation has timed out"));
        }, timeout);
        const fn = (...args) => {
            // @ts-ignore
            this.io.clearTimeoutFn(timer);
            ack.apply(this, args);
        };
        fn.withError = true;
        this.acks[id] = fn;
    }
    /**
     * Emits an event and waits for an acknowledgement
     *
     * @example
     * // without timeout
     * const response = await socket.emitWithAck("hello", "world");
     *
     * // with a specific timeout
     * try {
     *   const response = await socket.timeout(1000).emitWithAck("hello", "world");
     * } catch (err) {
     *   // the server did not acknowledge the event in the given delay
     * }
     *
     * @return a Promise that will be fulfilled when the server acknowledges the event
     */
    emitWithAck(ev, ...args) {
        return new Promise((resolve, reject) => {
            const fn = (arg1, arg2) => {
                return arg1 ? reject(arg1) : resolve(arg2);
            };
            fn.withError = true;
            args.push(fn);
            this.emit(ev, ...args);
        });
    }
    /**
     * Add the packet to the queue.
     * @param args
     * @private
     */
    _addToQueue(args) {
        let ack;
        if (typeof args[args.length - 1] === "function") {
            ack = args.pop();
        }
        const packet = {
            id: this._queueSeq++,
            tryCount: 0,
            pending: false,
            args,
            flags: Object.assign({ fromQueue: true }, this.flags),
        };
        args.push((err, ...responseArgs) => {
            if (packet !== this._queue[0]) {
                return debug("packet [%d] already acknowledged", packet.id);
            }
            const hasError = err !== null;
            if (hasError) {
                if (packet.tryCount > this._opts.retries) {
                    debug("packet [%d] is discarded after %d tries", packet.id, packet.tryCount);
                    this._queue.shift();
                    if (ack) {
                        ack(err);
                    }
                }
            }
            else {
                debug("packet [%d] was successfully sent", packet.id);
                this._queue.shift();
                if (ack) {
                    ack(null, ...responseArgs);
                }
            }
            packet.pending = false;
            return this._drainQueue();
        });
        this._queue.push(packet);
        this._drainQueue();
    }
    /**
     * Send the first packet of the queue, and wait for an acknowledgement from the server.
     * @param force - whether to resend a packet that has not been acknowledged yet
     *
     * @private
     */
    _drainQueue(force = false) {
        debug("draining queue");
        if (!this.connected || this._queue.length === 0) {
            return;
        }
        const packet = this._queue[0];
        if (packet.pending && !force) {
            debug("packet [%d] has already been sent and is waiting for an ack", packet.id);
            return;
        }
        packet.pending = true;
        packet.tryCount++;
        debug("sending packet [%d] (try n°%d)", packet.id, packet.tryCount);
        this.flags = packet.flags;
        this.emit.apply(this, packet.args);
    }
    /**
     * Sends a packet.
     *
     * @param packet
     * @private
     */
    packet(packet) {
        packet.nsp = this.nsp;
        this.io._packet(packet);
    }
    /**
     * Called upon engine `open`.
     *
     * @private
     */
    onopen() {
        debug("transport is open - connecting");
        if (typeof this.auth == "function") {
            this.auth((data) => {
                this._sendConnectPacket(data);
            });
        }
        else {
            this._sendConnectPacket(this.auth);
        }
    }
    /**
     * Sends a CONNECT packet to initiate the Socket.IO session.
     *
     * @param data
     * @private
     */
    _sendConnectPacket(data) {
        this.packet({
            type: socket_io_parser_1.PacketType.CONNECT,
            data: this._pid
                ? Object.assign({ pid: this._pid, offset: this._lastOffset }, data)
                : data,
        });
    }
    /**
     * Called upon engine or manager `error`.
     *
     * @param err
     * @private
     */
    onerror(err) {
        if (!this.connected) {
            this.emitReserved("connect_error", err);
        }
    }
    /**
     * Called upon engine `close`.
     *
     * @param reason
     * @param description
     * @private
     */
    onclose(reason, description) {
        debug("close (%s)", reason);
        this.connected = false;
        delete this.id;
        this.emitReserved("disconnect", reason, description);
        this._clearAcks();
    }
    /**
     * Clears the acknowledgement handlers upon disconnection, since the client will never receive an acknowledgement from
     * the server.
     *
     * @private
     */
    _clearAcks() {
        Object.keys(this.acks).forEach((id) => {
            const isBuffered = this.sendBuffer.some((packet) => String(packet.id) === id);
            if (!isBuffered) {
                // note: handlers that do not accept an error as first argument are ignored here
                const ack = this.acks[id];
                delete this.acks[id];
                if (ack.withError) {
                    ack.call(this, new Error("socket has been disconnected"));
                }
            }
        });
    }
    /**
     * Called with socket packet.
     *
     * @param packet
     * @private
     */
    onpacket(packet) {
        const sameNamespace = packet.nsp === this.nsp;
        if (!sameNamespace)
            return;
        switch (packet.type) {
            case socket_io_parser_1.PacketType.CONNECT:
                if (packet.data && packet.data.sid) {
                    this.onconnect(packet.data.sid, packet.data.pid);
                }
                else {
                    this.emitReserved("connect_error", new Error("It seems you are trying to reach a Socket.IO server in v2.x with a v3.x client, but they are not compatible (more information here: https://socket.io/docs/v3/migrating-from-2-x-to-3-0/)"));
                }
                break;
            case socket_io_parser_1.PacketType.EVENT:
            case socket_io_parser_1.PacketType.BINARY_EVENT:
                this.onevent(packet);
                break;
            case socket_io_parser_1.PacketType.ACK:
            case socket_io_parser_1.PacketType.BINARY_ACK:
                this.onack(packet);
                break;
            case socket_io_parser_1.PacketType.DISCONNECT:
                this.ondisconnect();
                break;
            case socket_io_parser_1.PacketType.CONNECT_ERROR:
                this.destroy();
                const err = new Error(packet.data.message);
                // @ts-ignore
                err.data = packet.data.data;
                this.emitReserved("connect_error", err);
                break;
        }
    }
    /**
     * Called upon a server event.
     *
     * @param packet
     * @private
     */
    onevent(packet) {
        const args = packet.data || [];
        debug("emitting event %j", args);
        if (null != packet.id) {
            debug("attaching ack callback to event");
            args.push(this.ack(packet.id));
        }
        if (this.connected) {
            this.emitEvent(args);
        }
        else {
            this.receiveBuffer.push(Object.freeze(args));
        }
    }
    emitEvent(args) {
        if (this._anyListeners && this._anyListeners.length) {
            const listeners = this._anyListeners.slice();
            for (const listener of listeners) {
                listener.apply(this, args);
            }
        }
        super.emit.apply(this, args);
        if (this._pid && args.length && typeof args[args.length - 1] === "string") {
            this._lastOffset = args[args.length - 1];
        }
    }
    /**
     * Produces an ack callback to emit with an event.
     *
     * @private
     */
    ack(id) {
        const self = this;
        let sent = false;
        return function (...args) {
            // prevent double callbacks
            if (sent)
                return;
            sent = true;
            debug("sending ack %j", args);
            self.packet({
                type: socket_io_parser_1.PacketType.ACK,
                id: id,
                data: args,
            });
        };
    }
    /**
     * Called upon a server acknowledgement.
     *
     * @param packet
     * @private
     */
    onack(packet) {
        const ack = this.acks[packet.id];
        if (typeof ack !== "function") {
            debug("bad ack %s", packet.id);
            return;
        }
        delete this.acks[packet.id];
        debug("calling ack %s with %j", packet.id, packet.data);
        // @ts-ignore FIXME ack is incorrectly inferred as 'never'
        if (ack.withError) {
            packet.data.unshift(null);
        }
        // @ts-ignore
        ack.apply(this, packet.data);
    }
    /**
     * Called upon server connect.
     *
     * @private
     */
    onconnect(id, pid) {
        debug("socket connected with id %s", id);
        this.id = id;
        this.recovered = pid && this._pid === pid;
        this._pid = pid; // defined only if connection state recovery is enabled
        this.connected = true;
        this.emitBuffered();
        this._drainQueue(true);
        this.emitReserved("connect");
    }
    /**
     * Emit buffered events (received and emitted).
     *
     * @private
     */
    emitBuffered() {
        this.receiveBuffer.forEach((args) => this.emitEvent(args));
        this.receiveBuffer = [];
        this.sendBuffer.forEach((packet) => {
            this.notifyOutgoingListeners(packet);
            this.packet(packet);
        });
        this.sendBuffer = [];
    }
    /**
     * Called upon server disconnect.
     *
     * @private
     */
    ondisconnect() {
        debug("server disconnect (%s)", this.nsp);
        this.destroy();
        this.onclose("io server disconnect");
    }
    /**
     * Called upon forced client/server side disconnections,
     * this method ensures the manager stops tracking us and
     * that reconnections don't get triggered for this.
     *
     * @private
     */
    destroy() {
        if (this.subs) {
            // clean subscriptions to avoid reconnections
            this.subs.forEach((subDestroy) => subDestroy());
            this.subs = undefined;
        }
        this.io["_destroy"](this);
    }
    /**
     * Disconnects the socket manually. In that case, the socket will not try to reconnect.
     *
     * If this is the last active Socket instance of the {@link Manager}, the low-level connection will be closed.
     *
     * @example
     * const socket = io();
     *
     * socket.on("disconnect", (reason) => {
     *   // console.log(reason); prints "io client disconnect"
     * });
     *
     * socket.disconnect();
     *
     * @return self
     */
    disconnect() {
        if (this.connected) {
            debug("performing disconnect (%s)", this.nsp);
            this.packet({ type: socket_io_parser_1.PacketType.DISCONNECT });
        }
        // remove socket from pool
        this.destroy();
        if (this.connected) {
            // fire events
            this.onclose("io client disconnect");
        }
        return this;
    }
    /**
     * Alias for {@link disconnect()}.
     *
     * @return self
     */
    close() {
        return this.disconnect();
    }
    /**
     * Sets the compress flag.
     *
     * @example
     * socket.compress(false).emit("hello");
     *
     * @param compress - if `true`, compresses the sending data
     * @return self
     */
    compress(compress) {
        this.flags.compress = compress;
        return this;
    }
    /**
     * Sets a modifier for a subsequent event emission that the event message will be dropped when this socket is not
     * ready to send messages.
     *
     * @example
     * socket.volatile.emit("hello"); // the server may or may not receive it
     *
     * @returns self
     */
    get volatile() {
        this.flags.volatile = true;
        return this;
    }
    /**
     * Sets a modifier for a subsequent event emission that the callback will be called with an error when the
     * given number of milliseconds have elapsed without an acknowledgement from the server:
     *
     * @example
     * socket.timeout(5000).emit("my-event", (err) => {
     *   if (err) {
     *     // the server did not acknowledge the event in the given delay
     *   }
     * });
     *
     * @returns self
     */
    timeout(timeout) {
        this.flags.timeout = timeout;
        return this;
    }
    /**
     * Adds a listener that will be fired when any event is emitted. The event name is passed as the first argument to the
     * callback.
     *
     * @example
     * socket.onAny((event, ...args) => {
     *   console.log(`got ${event}`);
     * });
     *
     * @param listener
     */
    onAny(listener) {
        this._anyListeners = this._anyListeners || [];
        this._anyListeners.push(listener);
        return this;
    }
    /**
     * Adds a listener that will be fired when any event is emitted. The event name is passed as the first argument to the
     * callback. The listener is added to the beginning of the listeners array.
     *
     * @example
     * socket.prependAny((event, ...args) => {
     *   console.log(`got event ${event}`);
     * });
     *
     * @param listener
     */
    prependAny(listener) {
        this._anyListeners = this._anyListeners || [];
        this._anyListeners.unshift(listener);
        return this;
    }
    /**
     * Removes the listener that will be fired when any event is emitted.
     *
     * @example
     * const catchAllListener = (event, ...args) => {
     *   console.log(`got event ${event}`);
     * }
     *
     * socket.onAny(catchAllListener);
     *
     * // remove a specific listener
     * socket.offAny(catchAllListener);
     *
     * // or remove all listeners
     * socket.offAny();
     *
     * @param listener
     */
    offAny(listener) {
        if (!this._anyListeners) {
            return this;
        }
        if (listener) {
            const listeners = this._anyListeners;
            for (let i = 0; i < listeners.length; i++) {
                if (listener === listeners[i]) {
                    listeners.splice(i, 1);
                    return this;
                }
            }
        }
        else {
            this._anyListeners = [];
        }
        return this;
    }
    /**
     * Returns an array of listeners that are listening for any event that is specified. This array can be manipulated,
     * e.g. to remove listeners.
     */
    listenersAny() {
        return this._anyListeners || [];
    }
    /**
     * Adds a listener that will be fired when any event is emitted. The event name is passed as the first argument to the
     * callback.
     *
     * Note: acknowledgements sent to the server are not included.
     *
     * @example
     * socket.onAnyOutgoing((event, ...args) => {
     *   console.log(`sent event ${event}`);
     * });
     *
     * @param listener
     */
    onAnyOutgoing(listener) {
        this._anyOutgoingListeners = this._anyOutgoingListeners || [];
        this._anyOutgoingListeners.push(listener);
        return this;
    }
    /**
     * Adds a listener that will be fired when any event is emitted. The event name is passed as the first argument to the
     * callback. The listener is added to the beginning of the listeners array.
     *
     * Note: acknowledgements sent to the server are not included.
     *
     * @example
     * socket.prependAnyOutgoing((event, ...args) => {
     *   console.log(`sent event ${event}`);
     * });
     *
     * @param listener
     */
    prependAnyOutgoing(listener) {
        this._anyOutgoingListeners = this._anyOutgoingListeners || [];
        this._anyOutgoingListeners.unshift(listener);
        return this;
    }
    /**
     * Removes the listener that will be fired when any event is emitted.
     *
     * @example
     * const catchAllListener = (event, ...args) => {
     *   console.log(`sent event ${event}`);
     * }
     *
     * socket.onAnyOutgoing(catchAllListener);
     *
     * // remove a specific listener
     * socket.offAnyOutgoing(catchAllListener);
     *
     * // or remove all listeners
     * socket.offAnyOutgoing();
     *
     * @param [listener] - the catch-all listener (optional)
     */
    offAnyOutgoing(listener) {
        if (!this._anyOutgoingListeners) {
            return this;
        }
        if (listener) {
            const listeners = this._anyOutgoingListeners;
            for (let i = 0; i < listeners.length; i++) {
                if (listener === listeners[i]) {
                    listeners.splice(i, 1);
                    return this;
                }
            }
        }
        else {
            this._anyOutgoingListeners = [];
        }
        return this;
    }
    /**
     * Returns an array of listeners that are listening for any event that is specified. This array can be manipulated,
     * e.g. to remove listeners.
     */
    listenersAnyOutgoing() {
        return this._anyOutgoingListeners || [];
    }
    /**
     * Notify the listeners for each packet sent
     *
     * @param packet
     *
     * @private
     */
    notifyOutgoingListeners(packet) {
        if (this._anyOutgoingListeners && this._anyOutgoingListeners.length) {
            const listeners = this._anyOutgoingListeners.slice();
            for (const listener of listeners) {
                listener.apply(this, packet.data);
            }
        }
    }
}
exports.Socket = Socket;


/***/ },

/***/ "./node_modules/socket.io-client/build/cjs/url.js"
/*!********************************************************!*\
  !*** ./node_modules/socket.io-client/build/cjs/url.js ***!
  \********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.url = url;
const engine_io_client_1 = __webpack_require__(/*! engine.io-client */ "./node_modules/engine.io-client/build/cjs/index.js");
const debug_1 = __importDefault(__webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js")); // debug()
const debug = (0, debug_1.default)("socket.io-client:url"); // debug()
/**
 * URL parser.
 *
 * @param uri - url
 * @param path - the request path of the connection
 * @param loc - An object meant to mimic window.location.
 *        Defaults to window.location.
 * @public
 */
function url(uri, path = "", loc) {
    let obj = uri;
    // default to window.location
    loc = loc || (typeof location !== "undefined" && location);
    if (null == uri)
        uri = loc.protocol + "//" + loc.host;
    // relative path support
    if (typeof uri === "string") {
        if ("/" === uri.charAt(0)) {
            if ("/" === uri.charAt(1)) {
                uri = loc.protocol + uri;
            }
            else {
                uri = loc.host + uri;
            }
        }
        if (!/^(https?|wss?):\/\//.test(uri)) {
            debug("protocol-less url %s", uri);
            if ("undefined" !== typeof loc) {
                uri = loc.protocol + "//" + uri;
            }
            else {
                uri = "https://" + uri;
            }
        }
        // parse
        debug("parse %s", uri);
        obj = (0, engine_io_client_1.parse)(uri);
    }
    // make sure we treat `localhost:80` and `localhost` equally
    if (!obj.port) {
        if (/^(http|ws)$/.test(obj.protocol)) {
            obj.port = "80";
        }
        else if (/^(http|ws)s$/.test(obj.protocol)) {
            obj.port = "443";
        }
    }
    obj.path = obj.path || "/";
    const ipv6 = obj.host.indexOf(":") !== -1;
    const host = ipv6 ? "[" + obj.host + "]" : obj.host;
    // define unique id
    obj.id = obj.protocol + "://" + host + ":" + obj.port + path;
    // define href
    obj.href =
        obj.protocol +
            "://" +
            host +
            (loc && loc.port === obj.port ? "" : ":" + obj.port);
    return obj;
}


/***/ },

/***/ "./node_modules/socket.io-parser/build/cjs/binary.js"
/*!***********************************************************!*\
  !*** ./node_modules/socket.io-parser/build/cjs/binary.js ***!
  \***********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deconstructPacket = deconstructPacket;
exports.reconstructPacket = reconstructPacket;
const is_binary_js_1 = __webpack_require__(/*! ./is-binary.js */ "./node_modules/socket.io-parser/build/cjs/is-binary.js");
/**
 * Replaces every Buffer | ArrayBuffer | Blob | File in packet with a numbered placeholder.
 *
 * @param {Object} packet - socket.io event packet
 * @return {Object} with deconstructed packet and list of buffers
 * @public
 */
function deconstructPacket(packet) {
    const buffers = [];
    const packetData = packet.data;
    const pack = packet;
    pack.data = _deconstructPacket(packetData, buffers);
    pack.attachments = buffers.length; // number of binary 'attachments'
    return { packet: pack, buffers: buffers };
}
function _deconstructPacket(data, buffers) {
    if (!data)
        return data;
    if ((0, is_binary_js_1.isBinary)(data)) {
        const placeholder = { _placeholder: true, num: buffers.length };
        buffers.push(data);
        return placeholder;
    }
    else if (Array.isArray(data)) {
        const newData = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            newData[i] = _deconstructPacket(data[i], buffers);
        }
        return newData;
    }
    else if (typeof data === "object" && !(data instanceof Date)) {
        const newData = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                newData[key] = _deconstructPacket(data[key], buffers);
            }
        }
        return newData;
    }
    return data;
}
/**
 * Reconstructs a binary packet from its placeholder packet and buffers
 *
 * @param {Object} packet - event packet with placeholders
 * @param {Array} buffers - binary buffers to put in placeholder positions
 * @return {Object} reconstructed packet
 * @public
 */
function reconstructPacket(packet, buffers) {
    packet.data = _reconstructPacket(packet.data, buffers);
    delete packet.attachments; // no longer useful
    return packet;
}
function _reconstructPacket(data, buffers) {
    if (!data)
        return data;
    if (data && data._placeholder === true) {
        const isIndexValid = typeof data.num === "number" &&
            data.num >= 0 &&
            data.num < buffers.length;
        if (isIndexValid) {
            return buffers[data.num]; // appropriate buffer (should be natural order anyway)
        }
        else {
            throw new Error("illegal attachments");
        }
    }
    else if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            data[i] = _reconstructPacket(data[i], buffers);
        }
    }
    else if (typeof data === "object") {
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                data[key] = _reconstructPacket(data[key], buffers);
            }
        }
    }
    return data;
}


/***/ },

/***/ "./node_modules/socket.io-parser/build/cjs/index.js"
/*!**********************************************************!*\
  !*** ./node_modules/socket.io-parser/build/cjs/index.js ***!
  \**********************************************************/
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Decoder = exports.Encoder = exports.PacketType = exports.protocol = void 0;
exports.isPacketValid = isPacketValid;
const component_emitter_1 = __webpack_require__(/*! @socket.io/component-emitter */ "./node_modules/@socket.io/component-emitter/lib/esm/index.js");
const binary_js_1 = __webpack_require__(/*! ./binary.js */ "./node_modules/socket.io-parser/build/cjs/binary.js");
const is_binary_js_1 = __webpack_require__(/*! ./is-binary.js */ "./node_modules/socket.io-parser/build/cjs/is-binary.js");
const debug_1 = __webpack_require__(/*! debug */ "./node_modules/debug/src/browser.js"); // debug()
const debug = (0, debug_1.default)("socket.io-parser"); // debug()
/**
 * These strings must not be used as event names, as they have a special meaning.
 */
const RESERVED_EVENTS = [
    "connect", // used on the client side
    "connect_error", // used on the client side
    "disconnect", // used on both sides
    "disconnecting", // used on the server side
    "newListener", // used by the Node.js EventEmitter
    "removeListener", // used by the Node.js EventEmitter
];
/**
 * Protocol version.
 *
 * @public
 */
exports.protocol = 5;
var PacketType;
(function (PacketType) {
    PacketType[PacketType["CONNECT"] = 0] = "CONNECT";
    PacketType[PacketType["DISCONNECT"] = 1] = "DISCONNECT";
    PacketType[PacketType["EVENT"] = 2] = "EVENT";
    PacketType[PacketType["ACK"] = 3] = "ACK";
    PacketType[PacketType["CONNECT_ERROR"] = 4] = "CONNECT_ERROR";
    PacketType[PacketType["BINARY_EVENT"] = 5] = "BINARY_EVENT";
    PacketType[PacketType["BINARY_ACK"] = 6] = "BINARY_ACK";
})(PacketType || (exports.PacketType = PacketType = {}));
/**
 * A socket.io Encoder instance
 */
class Encoder {
    /**
     * Encoder constructor
     *
     * @param {function} replacer - custom replacer to pass down to JSON.parse
     */
    constructor(replacer) {
        this.replacer = replacer;
    }
    /**
     * Encode a packet as a single string if non-binary, or as a
     * buffer sequence, depending on packet type.
     *
     * @param {Object} obj - packet object
     */
    encode(obj) {
        debug("encoding packet %j", obj);
        if (obj.type === PacketType.EVENT || obj.type === PacketType.ACK) {
            if ((0, is_binary_js_1.hasBinary)(obj)) {
                return this.encodeAsBinary({
                    type: obj.type === PacketType.EVENT
                        ? PacketType.BINARY_EVENT
                        : PacketType.BINARY_ACK,
                    nsp: obj.nsp,
                    data: obj.data,
                    id: obj.id,
                });
            }
        }
        return [this.encodeAsString(obj)];
    }
    /**
     * Encode packet as string.
     */
    encodeAsString(obj) {
        // first is type
        let str = "" + obj.type;
        // attachments if we have them
        if (obj.type === PacketType.BINARY_EVENT ||
            obj.type === PacketType.BINARY_ACK) {
            str += obj.attachments + "-";
        }
        // if we have a namespace other than `/`
        // we append it followed by a comma `,`
        if (obj.nsp && "/" !== obj.nsp) {
            str += obj.nsp + ",";
        }
        // immediately followed by the id
        if (null != obj.id) {
            str += obj.id;
        }
        // json data
        if (null != obj.data) {
            str += JSON.stringify(obj.data, this.replacer);
        }
        debug("encoded %j as %s", obj, str);
        return str;
    }
    /**
     * Encode packet as 'buffer sequence' by removing blobs, and
     * deconstructing packet into object with placeholders and
     * a list of buffers.
     */
    encodeAsBinary(obj) {
        const deconstruction = (0, binary_js_1.deconstructPacket)(obj);
        const pack = this.encodeAsString(deconstruction.packet);
        const buffers = deconstruction.buffers;
        buffers.unshift(pack); // add packet info to beginning of data list
        return buffers; // write all the buffers
    }
}
exports.Encoder = Encoder;
/**
 * A socket.io Decoder instance
 *
 * @return {Object} decoder
 */
class Decoder extends component_emitter_1.Emitter {
    /**
     * Decoder constructor
     *
     * @param {function} reviver - custom reviver to pass down to JSON.stringify
     */
    constructor(reviver) {
        super();
        this.reviver = reviver;
    }
    /**
     * Decodes an encoded packet string into packet JSON.
     *
     * @param {String} obj - encoded packet
     */
    add(obj) {
        let packet;
        if (typeof obj === "string") {
            if (this.reconstructor) {
                throw new Error("got plaintext data when reconstructing a packet");
            }
            packet = this.decodeString(obj);
            const isBinaryEvent = packet.type === PacketType.BINARY_EVENT;
            if (isBinaryEvent || packet.type === PacketType.BINARY_ACK) {
                packet.type = isBinaryEvent ? PacketType.EVENT : PacketType.ACK;
                // binary packet's json
                this.reconstructor = new BinaryReconstructor(packet);
                // no attachments, labeled binary but no binary data to follow
                if (packet.attachments === 0) {
                    super.emitReserved("decoded", packet);
                }
            }
            else {
                // non-binary full packet
                super.emitReserved("decoded", packet);
            }
        }
        else if ((0, is_binary_js_1.isBinary)(obj) || obj.base64) {
            // raw binary data
            if (!this.reconstructor) {
                throw new Error("got binary data when not reconstructing a packet");
            }
            else {
                packet = this.reconstructor.takeBinaryData(obj);
                if (packet) {
                    // received final buffer
                    this.reconstructor = null;
                    super.emitReserved("decoded", packet);
                }
            }
        }
        else {
            throw new Error("Unknown type: " + obj);
        }
    }
    /**
     * Decode a packet String (JSON data)
     *
     * @param {String} str
     * @return {Object} packet
     */
    decodeString(str) {
        let i = 0;
        // look up type
        const p = {
            type: Number(str.charAt(0)),
        };
        if (PacketType[p.type] === undefined) {
            throw new Error("unknown packet type " + p.type);
        }
        // look up attachments if type binary
        if (p.type === PacketType.BINARY_EVENT ||
            p.type === PacketType.BINARY_ACK) {
            const start = i + 1;
            while (str.charAt(++i) !== "-" && i != str.length) { }
            const buf = str.substring(start, i);
            if (buf != Number(buf) || str.charAt(i) !== "-") {
                throw new Error("Illegal attachments");
            }
            p.attachments = Number(buf);
        }
        // look up namespace (if any)
        if ("/" === str.charAt(i + 1)) {
            const start = i + 1;
            while (++i) {
                const c = str.charAt(i);
                if ("," === c)
                    break;
                if (i === str.length)
                    break;
            }
            p.nsp = str.substring(start, i);
        }
        else {
            p.nsp = "/";
        }
        // look up id
        const next = str.charAt(i + 1);
        if ("" !== next && Number(next) == next) {
            const start = i + 1;
            while (++i) {
                const c = str.charAt(i);
                if (null == c || Number(c) != c) {
                    --i;
                    break;
                }
                if (i === str.length)
                    break;
            }
            p.id = Number(str.substring(start, i + 1));
        }
        // look up json data
        if (str.charAt(++i)) {
            const payload = this.tryParse(str.substr(i));
            if (Decoder.isPayloadValid(p.type, payload)) {
                p.data = payload;
            }
            else {
                throw new Error("invalid payload");
            }
        }
        debug("decoded %s as %j", str, p);
        return p;
    }
    tryParse(str) {
        try {
            return JSON.parse(str, this.reviver);
        }
        catch (e) {
            return false;
        }
    }
    static isPayloadValid(type, payload) {
        switch (type) {
            case PacketType.CONNECT:
                return isObject(payload);
            case PacketType.DISCONNECT:
                return payload === undefined;
            case PacketType.CONNECT_ERROR:
                return typeof payload === "string" || isObject(payload);
            case PacketType.EVENT:
            case PacketType.BINARY_EVENT:
                return (Array.isArray(payload) &&
                    (typeof payload[0] === "number" ||
                        (typeof payload[0] === "string" &&
                            RESERVED_EVENTS.indexOf(payload[0]) === -1)));
            case PacketType.ACK:
            case PacketType.BINARY_ACK:
                return Array.isArray(payload);
        }
    }
    /**
     * Deallocates a parser's resources
     */
    destroy() {
        if (this.reconstructor) {
            this.reconstructor.finishedReconstruction();
            this.reconstructor = null;
        }
    }
}
exports.Decoder = Decoder;
/**
 * A manager of a binary event's 'buffer sequence'. Should
 * be constructed whenever a packet of type BINARY_EVENT is
 * decoded.
 *
 * @param {Object} packet
 * @return {BinaryReconstructor} initialized reconstructor
 */
class BinaryReconstructor {
    constructor(packet) {
        this.packet = packet;
        this.buffers = [];
        this.reconPack = packet;
    }
    /**
     * Method to be called when binary data received from connection
     * after a BINARY_EVENT packet.
     *
     * @param {Buffer | ArrayBuffer} binData - the raw binary data received
     * @return {null | Object} returns null if more binary data is expected or
     *   a reconstructed packet object if all buffers have been received.
     */
    takeBinaryData(binData) {
        this.buffers.push(binData);
        if (this.buffers.length === this.reconPack.attachments) {
            // done with buffer list
            const packet = (0, binary_js_1.reconstructPacket)(this.reconPack, this.buffers);
            this.finishedReconstruction();
            return packet;
        }
        return null;
    }
    /**
     * Cleans up binary packet reconstruction variables.
     */
    finishedReconstruction() {
        this.reconPack = null;
        this.buffers = [];
    }
}
function isNamespaceValid(nsp) {
    return typeof nsp === "string";
}
// see https://caniuse.com/mdn-javascript_builtins_number_isinteger
const isInteger = Number.isInteger ||
    function (value) {
        return (typeof value === "number" &&
            isFinite(value) &&
            Math.floor(value) === value);
    };
function isAckIdValid(id) {
    return id === undefined || isInteger(id);
}
// see https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
function isObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}
function isDataValid(type, payload) {
    switch (type) {
        case PacketType.CONNECT:
            return payload === undefined || isObject(payload);
        case PacketType.DISCONNECT:
            return payload === undefined;
        case PacketType.EVENT:
            return (Array.isArray(payload) &&
                (typeof payload[0] === "number" ||
                    (typeof payload[0] === "string" &&
                        RESERVED_EVENTS.indexOf(payload[0]) === -1)));
        case PacketType.ACK:
            return Array.isArray(payload);
        case PacketType.CONNECT_ERROR:
            return typeof payload === "string" || isObject(payload);
        default:
            return false;
    }
}
function isPacketValid(packet) {
    return (isNamespaceValid(packet.nsp) &&
        isAckIdValid(packet.id) &&
        isDataValid(packet.type, packet.data));
}


/***/ },

/***/ "./node_modules/socket.io-parser/build/cjs/is-binary.js"
/*!**************************************************************!*\
  !*** ./node_modules/socket.io-parser/build/cjs/is-binary.js ***!
  \**************************************************************/
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isBinary = isBinary;
exports.hasBinary = hasBinary;
const withNativeArrayBuffer = typeof ArrayBuffer === "function";
const isView = (obj) => {
    return typeof ArrayBuffer.isView === "function"
        ? ArrayBuffer.isView(obj)
        : obj.buffer instanceof ArrayBuffer;
};
const toString = Object.prototype.toString;
const withNativeBlob = typeof Blob === "function" ||
    (typeof Blob !== "undefined" &&
        toString.call(Blob) === "[object BlobConstructor]");
const withNativeFile = typeof File === "function" ||
    (typeof File !== "undefined" &&
        toString.call(File) === "[object FileConstructor]");
/**
 * Returns true if obj is a Buffer, an ArrayBuffer, a Blob or a File.
 *
 * @private
 */
function isBinary(obj) {
    return ((withNativeArrayBuffer && (obj instanceof ArrayBuffer || isView(obj))) ||
        (withNativeBlob && obj instanceof Blob) ||
        (withNativeFile && obj instanceof File));
}
function hasBinary(obj, toJSON) {
    if (!obj || typeof obj !== "object") {
        return false;
    }
    if (Array.isArray(obj)) {
        for (let i = 0, l = obj.length; i < l; i++) {
            if (hasBinary(obj[i])) {
                return true;
            }
        }
        return false;
    }
    if (isBinary(obj)) {
        return true;
    }
    if (obj.toJSON &&
        typeof obj.toJSON === "function" &&
        arguments.length === 1) {
        return hasBinary(obj.toJSON(), true);
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && hasBinary(obj[key])) {
            return true;
        }
    }
    return false;
}


/***/ },

/***/ "./node_modules/@socket.io/component-emitter/lib/esm/index.js"
/*!********************************************************************!*\
  !*** ./node_modules/@socket.io/component-emitter/lib/esm/index.js ***!
  \********************************************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Emitter: () => (/* binding */ Emitter)
/* harmony export */ });
/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
}

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks['$' + event] = this._callbacks['$' + event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  function on() {
    this.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks['$' + event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks['$' + event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }

  // Remove event specific arrays for event types that no
  // one is subscribed for to avoid memory leak.
  if (callbacks.length === 0) {
    delete this._callbacks['$' + event];
  }

  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};

  var args = new Array(arguments.length - 1)
    , callbacks = this._callbacks['$' + event];

  for (var i = 1; i < arguments.length; i++) {
    args[i - 1] = arguments[i];
  }

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

// alias used for reserved events (protected method)
Emitter.prototype.emitReserved = Emitter.prototype.emit;

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks['$' + event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};


/***/ },

/***/ "./node_modules/pryv/package.json"
/*!****************************************!*\
  !*** ./node_modules/pryv/package.json ***!
  \****************************************/
(module) {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"name":"pryv","version":"3.0.0","description":"Pryv JavaScript library","keywords":["Pryv","Pryv.io"],"homepage":"https://github.com/pryv/lib-js","bugs":{"url":"https://github.com/pryv/lib-js/issues"},"repository":{"type":"git","url":"git://github.com/pryv/lib-js.git"},"license":"BSD-3-Clause","author":"Pryv S.A. <info@pryv.com> (https://pryv.com)","main":"src/index.js","types":"src/index.d.ts","dependencies":{},"engines":{"node":">=20.0.0"}}');

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!********************************!*\
  !*** ./tests/browser-tests.js ***!
  \********************************/
/**
 * Hook for webpack to build browser test-suite
 * Add new tests here
 */
__webpack_require__(/*! ./applicationClass.test */ "./tests/applicationClass.test.js");
__webpack_require__(/*! ./apptemplates.test */ "./tests/apptemplates.test.js");
__webpack_require__(/*! ./apptemplatesRequest.test */ "./tests/apptemplatesRequest.test.js");
__webpack_require__(/*! ./errors.test */ "./tests/errors.test.js");
__webpack_require__(/*! ./hdsLib.test */ "./tests/hdsLib.test.js");
__webpack_require__(/*! ./hdsModel.test */ "./tests/hdsModel.test.js");
__webpack_require__(/*! ./libSettings.test */ "./tests/libSettings.test.js");
__webpack_require__(/*! ./localizeText.test */ "./tests/localizeText.test.js");
__webpack_require__(/*! ./toolkitStreamAutoCreate.test */ "./tests/toolkitStreamAutoCreate.test.js");

})();

/******/ })()
;
//# sourceMappingURL=tests-browser.js.map