
import pryv = require('pryv');
export = AppClientAccount;
declare class AppClientAccount extends Application {
    constructor(baseStreamId: string, connection: pryv.Connection, appName: string, features: any, ...args: Application.ApplicationFeatures[]);
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
    getCollectorClientByKey(collectorKey: any): Promise<CollectorClient>;
    getCollectorClients(forceRefresh?: boolean): Promise<CollectorClient[]>;
}
import Application = require("./Application");
import CollectorClient = require("./CollectorClient");
