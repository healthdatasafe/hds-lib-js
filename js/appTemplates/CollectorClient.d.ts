import { CollectorRequest } from './CollectorRequest';
import { pryv } from '../patchedPryv';
import { CollectorSectionInterface } from './interfaces';
/**
 * Client App in relation to an AppManagingAccount/Collector
 */
export declare class CollectorClient {
    #private;
    static STATUSES: Readonly<{
        incoming: "Incoming";
        active: "Active";
        deactivated: "Deactivated";
        refused: "Refused";
    }>;
    app: any;
    eventData: any;
    accessData: any;
    request: CollectorRequest;
    /** @property {String} - identified within user's account - can be used to retrieve a Collector Client from an app */
    get key(): string;
    /** @property {String} - id matching an event within requester's account - used as a reference to communicate with requester */
    get requesterEventId(): string;
    /** @property {String}  */
    get requesterApiEndpoint(): string;
    get requesterUsername(): string;
    get requesterConnection(): pryv.Connection;
    /** @property {Object} - full content of the request */
    get requestData(): any;
    get hasChatFeature(): boolean;
    get chatSettings(): {
        chatStreamIncoming: string;
        chatStreamMain: string;
    };
    /** @property {string} - one of 'Incoming', 'Active', 'Deactivated', 'Refused' */
    get status(): string;
    constructor(app: any, eventData: any, accessData?: any);
    /**
     * @private
     * used by appClientAccount.handleIncomingRequest
     */
    static create(app: any, apiEndpoint: any, requesterEventId: any, accessInfo: any): Promise<CollectorClient>;
    /**
     * @private
     * reset with new request Event of ApiEndpoint
     * Identical as create but keep current event
     */
    reset(apiEndpoint: any, requesterEventId: any): Promise<this>;
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
    /**
     * return the key to discriminate collectorClients
     * @param {PryvAccessInfo} accessInfo
     */
    static keyFromInfo(info: any): string;
    getSections(): Array<CollectorSectionInterface>;
    chatEventInfos(event: pryv.Event): {
        source: 'me' | 'requester' | 'unkown';
    };
    chatPost(hdsConnection: pryv.Connection, content: string): Promise<pryv.Event>;
}
//# sourceMappingURL=CollectorClient.d.ts.map