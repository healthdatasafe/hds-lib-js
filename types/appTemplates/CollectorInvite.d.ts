
import pryv = require("pryv");
import type Collector from './Collector';
export = CollectorInvite;
/**
 * Collector Invite
 * There is one Collector Invite per Collector => Enduser connection
 */
declare class CollectorInvite {
    /**
     * get the key that will be assigne to this event;
     * @param {pryv.Event} eventData
     * @returns {string}
     */
    static getKeyForEvent(eventData: Event): string;
    constructor(collector: any, eventData: any);
    /** @type {Collector} */
    collector: Collector;
    /** @type {Event} */
    eventData: pryv.Event;
    get key(): string;
    get status(): any;
    get apiEndpoint(): any;
    /** @type {string} - on of 'revoked', 'refused' */
    get errorType(): string;
    get dateCreation(): Date;
    get connection(): pryv.Connection;
    /**
     * Check if connection is valid. (only if active)
     * If result is "forbidden" update and set as revoked
     * @returns {Object} accessInfo if valid.
     */
    checkAndGetAccessInfo(forceRefresh?: boolean): any;
    get displayName(): any;
    /**
     * private
     * @param {*} eventData
     */
    setEventData(eventData: any): void;
    getSharingData(): Promise<{
        apiEndpoint: any;
        eventId: any;
    }>;
    #private;
}
