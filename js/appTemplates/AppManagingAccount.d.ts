import { Application } from './Application';
import { Collector } from './Collector';
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
export declare class AppManagingAccount extends Application {
    #private;
    get appSettings(): any;
    init(): Promise<this>;
    getCollectors(forceRefresh?: boolean): Promise<Collector[]>;
    getCollectorById(id: string): Promise<Collector | undefined>;
    /**
     * Create an initialized Collector
     */
    createCollector(name: string): Promise<Collector>;
    /**
     * Create an un-initialized Collector (mostly used by tests)
     */
    createCollectorUnitialized(name: string): Promise<Collector>;
}
//# sourceMappingURL=AppManagingAccount.d.ts.map