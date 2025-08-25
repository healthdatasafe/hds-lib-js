import pryv = require('pryv');
import AppClientAccount from './AppClientAccount';

export = CollectorClient;

/**
 * Client App in relation to an AppManagingAccount/Collector
 */
declare class CollectorClient {
     
    static STATUSES: Readonly<{
        incoming: "Incoming";
        active: "Active";
        deactivated: "Deactivated";
        refused: "Refused";
    }>;
    /**
     * @private
     * used by appClientAccount.handleIncomingRequest
     */
    private static create;
    /**
     * return the key to discriminate collectorClients
     * @param {PryvAccessInfo} accessInfo
     */
    static keyFromInfo(info: pryv.AccessInfo): string;
    constructor(app: AppClientAccount, eventData: pryv.Event, accessData?: any);
    /** @type {AppClientAccount} */
    app: AppClientAccount;
    /** @type {PryvEvent} */
    eventData: pryv.Event;
    /** @type {Object} - when active or deactivated - there is a link with accessData */
    accessData: any;
    /** @property {String} - identified within user's account - can be used to retreive a Collector Client from an app */
    get key(): string;
    /** @property {String} - id matching an event within requester's account - used as a reference to communicate with requester */
    get requesterEventId(): string;
    /** @property {String}  */
    get requesterApiEndpoint(): string;
    /** @property {Object} - full content of the request */
    get requestData(): any;
    /** @property {string} - one of 'Incoming', 'Active', 'Deactivated', 'Refused' */
    get status(): string;
    /**
     * @private
     * reset with new request Event of ApiEndpoint
     * Identical as create but keep current event
     */
    private reset;
    /**
     * Accept current request
     * @param {boolean} forceAndSkipAccessCreation - internal temporary option,
     */
    accept(forceAndSkipAccessCreation?: boolean): Promise<{
        accessData: any;
        requesterEvent: pryv.Event;
    }>;
    revoke(): Promise<{
        requesterEvent: pryv.Event;
    }>;
    refuse(): Promise<{
        requesterEvent: pryv.Event;
    }>;
    /**
     * Probable temporary internal to fix possible inconsenticies during lib early stages
     */
    checkConsistency(): Promise<void>;
    #private;
}
