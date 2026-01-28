import { pryv } from '../patchedPryv';
/**
 * Collector Invite
 * There is one Collector Invite per Collector => Enduser connection
 */
export declare class CollectorInvite {
    #private;
    /**
     * get the key that will be assigned to this event;
     */
    static getKeyForEvent(eventData: any): string;
    collector: any;
    eventData: any;
    get key(): string;
    get status(): string;
    get apiEndpoint(): string;
    get errorType(): string | undefined;
    get dateCreation(): Date;
    get connection(): pryv.Connection;
    get hasChat(): boolean;
    get chatSettings(): {
        type: 'user';
        streamRead: string;
        streamWrite: string;
    };
    chatEventInfos(event: pryv.Event): {
        source: 'me' | 'user' | 'unkown';
    };
    /**
     * Check if connection is valid. (only if active)
     * If result is "forbidden" update and set as revoked
     * @returns accessInfo if valid.
     */
    checkAndGetAccessInfo(forceRefresh?: boolean): Promise<any>;
    /**
     * revoke the invite
     */
    revoke(): Promise<any>;
    get displayName(): string;
    constructor(collector: any, eventData: any);
    /**
     * private
     */
    setEventData(eventData: any): void;
    getSharingData(): Promise<{
        apiEndpoint: string;
        eventId: string;
    }>;
}
//# sourceMappingURL=CollectorInvite.d.ts.map