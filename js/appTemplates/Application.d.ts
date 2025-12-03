import { pryv } from '../patchedPryv';
/**
 * Settings for application
 */
export type ApplicationFeatures = {
    /**
     * - attach an instance of StreamsAutoCreate to connection
     */
    streamsAutoCreate?: boolean;
};
/**
 * Common code for AppClientAccount and AppManagingAccount
 */
export declare class Application {
    #private;
    /** Pryv.Connection */
    connection: pryv.Connection;
    /** string */
    baseStreamId: string;
    /** string */
    appName: string;
    cache: {
        [key: string]: any;
    };
    /** ApplicationFeatures */
    features: {
        streamsAutoCreate: boolean;
    } & ApplicationFeatures;
    /**
     * Get application stream structure
     * Initialized at init()
     * Can be refreshed with loadStreamData
     */
    get streamData(): any;
    get appSettings(): any;
    /**
     * Create with an apiEnpoint
     */
    static newFromApiEndpoint(baseStreamId: string, apiEndpoint: string, appName?: string, features?: ApplicationFeatures): Promise<Application>;
    /**
    * Create with an apiEnpoint
    */
    static newFromConnection(baseStreamId: string, connection: pryv.Connection, appName?: string, features?: ApplicationFeatures): Promise<Application>;
    /**
     * @private
     * use .newFrom...() to create new AppManagingAccount
     */
    constructor(baseStreamId: string, connection: pryv.Connection, appName?: string, features?: ApplicationFeatures);
    init(): Promise<this>;
    /**
     * Save anything you want for your app
     */
    setCustomSettings(content: any): Promise<any>;
    /**
     * Get current settings previously set with setCustomSettings()
     */
    getCustomSettings(forceRefresh?: boolean): Promise<any>;
    /**
     * Force loading of streamData
     */
    loadStreamData(): Promise<any>;
}
//# sourceMappingURL=Application.d.ts.map