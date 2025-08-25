
import pryv = require('pryv');
export = AppClientAccount;
declare class AppClientAccount extends Application {
    /**
     * Create with an apiEnpoint
     * @param {string} apiEndpoint
     * @param {string} baseStreamId - application base Strem ID
     * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
     * @param {ApplicationFeatures} [features]
     * @returns {AppClientAccount}
     */
    static newFromApiEndpoint(baseStreamId: string, apiEndpoint: string, appName?: string, features?: Application.ApplicationFeatures): AppClientAccount;
    /**
    * Create with an apiEnpoint
    * @param {Pryv.connection} connection - must be a connection with personnalToken or masterToken
    * @param {string} baseStreamId - application base Strem ID
    * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
    * @param {ApplicationFeatures} [features]
    * @returns {AppClientAccount}
    */
    static newFromConnection(baseStreamId: string, connection: pryv.Connection, appName?: string, features?: Application.ApplicationFeatures): AppClientAccount;
    constructor(baseStreamId: string, connection: pryv.Connection, appName: string, features:  Application.ApplicationFeatures);
    get appSettings(): {
        canBePersonnal: boolean;
        mustBeMaster: boolean;
    };
    /**
     * When the app receives a new request for data sharing
     * @param {string} apiEndpoint
     * @param {string} [incomingEventId] - Information for the recipient
     * @returns {CollectorClient}
     */
    handleIncomingRequest(apiEndpoint: string, incomingEventId?: string): CollectorClient;
    getCollectorClientByKey(collectorKey: string): Promise<CollectorClient>;
    getCollectorClients(forceRefresh?: boolean): Promise<CollectorClient[]>;
}
import Application = require("./Application");
import CollectorClient = require("./CollectorClient");
