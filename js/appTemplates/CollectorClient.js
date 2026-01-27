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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectorClient = void 0;
const CollectorRequest_1 = require("./CollectorRequest");
const patchedPryv_1 = require("../patchedPryv");
const errors_1 = require("../errors");
const logger = __importStar(require("../logger"));
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
        return this.requestData.features.chat != null;
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
                const chatStreamRead = `chat-${this.requesterUsername}`;
                const chatStreamWrite = `${chatStreamRead}-in`;
                const chatStreamsCreateApiCalls = [
                    { method: 'streams.create', params: { name: 'Chats', id: 'chats' } },
                    { method: 'streams.create', params: { name: `Chat ${this.requesterUsername}`, parentId: 'chats', id: chatStreamRead } },
                    { method: 'streams.create', params: { name: `Chat ${this.requesterUsername}`, parentId: chatStreamRead, id: chatStreamWrite } }
                ];
                const streamCreateResults = await this.app.connection.api(chatStreamsCreateApiCalls);
                streamCreateResults.forEach((r) => {
                    if (r.stream?.id || r.error?.id === 'item-already-exists')
                        return;
                    throw new errors_1.HDSLibError('Failed creating chat stream', streamCreateResults);
                });
                // 3. add streams to permissions
                cleanedPermissions.push(...[
                    { streamId: chatStreamRead, level: 'read' },
                    { streamId: chatStreamWrite, level: 'manage' }
                ]);
                responseContent.chat = {
                    type: 'user',
                    streamRead: chatStreamRead,
                    streamWrite: chatStreamWrite
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
}
exports.CollectorClient = CollectorClient;
_a = CollectorClient;
//# sourceMappingURL=CollectorClient.js.map