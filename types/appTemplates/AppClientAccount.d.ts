
export = AppClientAccount;
declare class AppClientAccount extends Application {
    constructor(baseStreamId: any, connection: any, appName: any, features: any, ...args: any[]);
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
    getCollectorClientByKey(collectorKey: any): Promise<any>;
    getCollectorClients(forceRefresh?: boolean): Promise<any[]>;
}
import Application = require("./Application");
import CollectorClient = require("./CollectorClient");
