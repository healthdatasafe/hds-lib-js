import pryv = require('pryv');
import type AppClientAccount from './AppClientAccount';
export = Application;
/**
 * Settings for application
 * @typedef {Object} ApplicationFeatures
 * @property {Boolean} [streamsAutoCreate = true] - attach an instance of StreamsAutoCreate to connection
 */
/**
 * Common code for AppClientAccount and AppManagingAccount
 */
declare class Application {
  /**
     * Create with an apiEnpoint
     * @param {string} apiEndpoint
     * @param {string} baseStreamId - application base Strem ID
     * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
     * @param {ApplicationFeatures} [features]
     * @returns {Application}
     */
  static newFromApiEndpoint(baseStreamId: string, apiEndpoint: string, appName?: string, features?: ApplicationFeatures): Application;
  /**
    * Create with an apiEnpoint
    * @param {Pryv.connection} connection - must be a connection with personnalToken or masterToken
    * @param {string} baseStreamId - application base Strem ID
    * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
    * @param {ApplicationFeatures} [features]
    * @returns {Application}
    */
  static newFromConnection(baseStreamId: string, connection: pryv.Connection, appName?: string, features?: ApplicationFeatures): Application;
  /**
     * @private
     * use .newFrom...() to create new AppManagingAccount
     * @param {string} baseStreamId
     * @param {Pryv.Connection} connection
     * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
     * @param {ApplicationFeatures} [features]
     */
  constructor();
  /** @type {Pryv.Connection} */
  connection: pryv.Connection;
  /** @type {string} */
  baseStreamId: string;
  /** @type {string} */
  appName: string;
  cache: {};
  /** @property {ApplicationFeatures} */
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
  init(): Promise<this>;
  /**
     * Save anything you want for your app
     * @param {Object} content will fully replace any existing content
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
  #private;
}
declare namespace Application {
    export { ApplicationFeatures };
}
/**
 * Settings for application
 */
type ApplicationFeatures = {
    /**
     * - attach an instance of StreamsAutoCreate to connection
     */
    streamsAutoCreate?: boolean;
};
