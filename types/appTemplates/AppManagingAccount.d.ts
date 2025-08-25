import pryv = require('pryv');
export = AppManagingAccount;
/**
 * App which manages Collectors
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 *
 * The App can create multiple "collectors e.g. Questionnaries"
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
declare class AppManagingAccount extends Application {
     /**
     * Create with an apiEnpoint
     * @param {string} apiEndpoint
     * @param {string} baseStreamId - application base Strem ID
     * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
     * @param {ApplicationFeatures} [features]
     * @returns {AppManagingAccount}
     */
    static newFromApiEndpoint(baseStreamId: string, apiEndpoint: string, appName?: string, features?: Application.ApplicationFeatures): AppManagingAccount;
    /**
    * Create with an apiEnpoint
    * @param {Pryv.connection} connection - must be a connection with personnalToken or masterToken
    * @param {string} baseStreamId - application base Strem ID
    * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
    * @param {ApplicationFeatures} [features]
    * @returns {AppManagingAccount}
    */
    static newFromConnection(baseStreamId: string, connection: pryv.Connection, appName?: string, features?: Application.ApplicationFeatures): AppManagingAccount;
    get appSettings(): {
        canBePersonnal: boolean;
        mustBeMaster: boolean;
        appNameFromAccessInfo: boolean;
    };
    init(): Promise<this>;
    getCollectors(forceRefresh?: boolean): Promise<Collector[]>;
    getCollectorById(id: string): Promise<Collector>;
    /**
     * Create an iniatilized Collector
     * @param {string} name
     * @returns {Collector}
     */
    createCollector(name: string): Collector;
    /**
     * Create an un-initialized Collector (mostly used by tests)
     * @param {string} name
     * @returns {Collector}
     */
    createCollectorUnitialized(name: string): Collector;
    #private;
}
import Application = require("./Application");
import Collector = require("./Collector");
