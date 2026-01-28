"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectorInvite = void 0;
const patchedPryv_1 = require("../patchedPryv");
const errors_1 = require("../errors");
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