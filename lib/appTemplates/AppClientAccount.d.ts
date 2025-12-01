import { pryv } from '../patchedPryv';
import { Application } from './Application';
import { CollectorClient } from './CollectorClient';
export declare class AppClientAccount extends Application {
    constructor(baseStreamId: string, connection: pryv.Connection, appName?: string, features?: any);
    get appSettings(): any;
    /**
     * When the app receives a new request for data sharing
     */
    handleIncomingRequest(apiEndpoint: string, incomingEventId?: string): Promise<CollectorClient>;
    getCollectorClientByKey(collectorKey: string): Promise<CollectorClient | undefined>;
    getCollectorClients(forceRefresh?: boolean): Promise<CollectorClient[]>;
    /**
     * - Check connection validity
     * - Make sure stream structure exists
     */
    init(): Promise<this>;
}
//# sourceMappingURL=AppClientAccount.d.ts.map