import pryv from '../patchedPryv';
import { StreamsAutoCreate } from '../toolkit';

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
export default class Application {
  /** Pryv.Connection */
  connection: pryv.Connection;
  /** string */
  baseStreamId: string;
  /** string */
  appName: string;

  cache: { [key: string]: any } = {};

  /** ApplicationFeatures */
  features: {
    streamsAutoCreate: boolean;
  } & ApplicationFeatures;

  /**
   * Get application stream structure
   * Initialized at init()
   * Can be refreshed with loadStreamData
   */
  get streamData (): any {
    if (!this.cache.streamData) throw new Error('Call .init() first');
    return this.cache.streamData;
  }

  get appSettings (): any {
    throw new Error('appSettings must be implemented');
    // possible return values:
    /**
     * return {
     *  canBePersonnal: true,
     *  mustBeMaster: true
     *  appNameFromAccessInfo: true // application name will be taken from Access-Info Name
     * };
     */
  }

  /**
   * Create with an apiEnpoint
   */
  static async newFromApiEndpoint (baseStreamId: string, apiEndpoint: string, appName?: string, features?: ApplicationFeatures): Promise<Application> {
    const connection = new pryv.Connection(apiEndpoint);
    // in a static method, "this" is the class (here the extending class)
    return await this.newFromConnection(baseStreamId, connection, appName, features);
  }

  /**
  * Create with an apiEnpoint
  */
  static async newFromConnection (baseStreamId: string, connection: pryv.Connection, appName?: string, features?: ApplicationFeatures): Promise<Application> {
    // in a static method "this" is the class (here the extending class)
    const app = new Application(baseStreamId, connection, appName, features);
    await app.init();
    return app;
  }

  /**
   * @private
   * use .newFrom...() to create new AppManagingAccount
   */
  constructor (baseStreamId: string, connection: pryv.Connection, appName?: string, features?: ApplicationFeatures) {
    if (!baseStreamId || baseStreamId.length < 2) throw new Error('Missing or too short baseStreamId');
    this.baseStreamId = baseStreamId;
    if (appName == null && !this.appSettings.appNameFromAccessInfo) {
      throw new Error('appName must be given unless appSettings.appNameFromAccessInfo = true');
    }
    this.appName = appName || '';
    this.connection = connection;
    this.features = Object.assign({ streamsAutoCreate: true }, features);

    if (this.features.streamsAutoCreate) {
      StreamsAutoCreate.attachToConnection(this.connection, undefined);
    }

    this.cache = {};
  }

  async init (): Promise<this> {
    await createAppStreams(this);
    return this;
  }

  /**
   * Save anything you want for your app
   */
  async setCustomSettings (content: any): Promise<any> {
    const currentCustomSettings = await this.getCustomSettings();
    if (currentCustomSettings != null) { // update
      const id = this.cache.customSettingsEvent.id;
      const updatedEvent = await this.connection.apiOne('events.update', { id, update: { content } }, 'event');
      this.cache.customSettingsEvent = updatedEvent;
    } else {
      await this.#createCustomSettings(content);
    }
    return this.cache.customSettingsEvent?.content;
  }

  /**
   * @private
   * Used by getCustomSettings & setCustomSettings
   */
  async #createCustomSettings (content: any): Promise<void> {
    const createdEvent = await this.connection.apiOne('events.create', { streamIds: [this.baseStreamId], type: 'settings/any', content }, 'event');
    this.cache.customSettingsEvent = createdEvent;
  }

  /**
   * Get current settings previously set with setCustomSettings()
   */
  async getCustomSettings (forceRefresh: boolean = false): Promise<any> {
    if (forceRefresh || !this.cache.customSettingsEvent) {
      const customSettingsEvent = (await this.connection.apiOne('events.get', { streams: [this.baseStreamId], types: ['settings/any'], limit: 1 }, 'events'))[0];
      this.cache.customSettingsEvent = customSettingsEvent;
    }
    if (!this.cache.customSettingsEvent) {
      await this.#createCustomSettings({});
    }
    return this.cache.customSettingsEvent?.content;
  }

  /**
   * Force loading of streamData
   */
  async loadStreamData (): Promise<any> {
    const streamData = (await this.connection.apiOne('streams.get', { id: this.baseStreamId }, 'streams'))[0];
    if (streamData) {
      this.cache.streamData = streamData;
    }
    return streamData;
  }
}

// create app Streams

async function createAppStreams (app: Application): Promise<void> {
  // check that connection has a personal or master token or has "manage" rights on baseStream
  const infos = await app.connection.accessInfo();
  if (app.appSettings.appNameFromAccessInfo) {
    app.appName = infos.name;
  }
  let isPersonalOrMaster = infos.type === 'personal';
  if (!app.appSettings.canBePersonnal && infos.type === 'personal') {
    throw new Error('Application should not use a personal token');
  }
  if (!isPersonalOrMaster) {
    const allowPersonalStr = app.appSettings.canBePersonnal ? '"personal" or ' : '';

    if (infos.type !== 'app') throw new Error(`Application requires a ${allowPersonalStr} "app" type of access`);
    const masterFound = infos.permissions.find((p: any) => (p.streamId === '*' && p.level === 'manage'));
    isPersonalOrMaster = true;
    if (app.appSettings.mustBemaster && !masterFound) {
      throw new Error('Application with "app" type of access requires "master" token (streamId = "*", level = "manage")');
    }
    if (!masterFound) { // check that app has "manage" level on baseStreamId
      const baseStreamFound = infos.permissions.find((p: any) => (p.streamId === app.baseStreamId && p.level === 'manage'));
      if (!baseStreamFound) throw new Error(`Application with "app" type of access requires  (streamId = "${app.baseStreamId}", level = "manage") or master access`);
    }
  }
  // get streamStructure
  let found = false;
  try {
    const streamData = await app.loadStreamData();
    if (streamData) found = true;
  } catch (e: any) {
    if (e.innerObject?.id !== 'unknown-referenced-resource' || e.innerObject?.data?.id !== app.baseStreamId) {
      throw e;
    }
  }
  // not found create streams
  if (!found) {
    if (!isPersonalOrMaster) {
      throw new Error('Token has not sufficient right to create App streams. Create them upfront');
    }
    const apiCalls = [
      { method: 'streams.create', params: { id: 'applications', name: 'Applications' } },
      { method: 'streams.create', params: { id: app.baseStreamId, name: app.appName, parentId: 'applications' } }
    ];
    const streamCreateResult = await connection.api(apiCalls);
    for (const r of streamCreateResult) {
      if ((r as any).error) throw new Error('Failed creating app streams');
    }
    const stream = (streamCreateResult[1] as any).stream;
    app.cache.streamData = stream;
  }
}
