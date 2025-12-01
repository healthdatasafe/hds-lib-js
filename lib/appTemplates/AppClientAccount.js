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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppClientAccount = void 0;
const errors_1 = require("../errors");
const patchedPryv_1 = require("../patchedPryv");
const Application_1 = require("./Application");
const CollectorClient_1 = require("./CollectorClient");
const logger = __importStar(require("../logger"));
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