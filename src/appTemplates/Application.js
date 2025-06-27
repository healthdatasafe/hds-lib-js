const pryv = require('../patchedPryv');
class Application {
  /** @type {Pryv.Connection} */
  connection;
  /** @type {string} */
  baseStreamId;
  /** @type {string} */
  appName;

  cache;

  /**
   * Get application stream structure
   * Initialized at init()
   * Can be refreshed with loadStreamData
   */
  get streamData () {
    if (!this.cache.streamData) throw new Error('Call .init() first');
    return this.cache.streamData;
  }

  get appSettings () {
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
   * @param {string} apiEndpoint
   * @param {string} baseStreamId - application base Strem ID
   * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
   * @returns {AppClientAccount}
   */
  static async newFromApiEndpoint (baseStreamId, apiEndpoint, appName) {
    const connection = new pryv.Connection(apiEndpoint);
    // in a static method, "this" is the class (here the extending class)
    return await this.newFromConnection(baseStreamId, connection, appName);
  }

  /**
  * Create with an apiEnpoint
  * @param {Pryv.connection} connection - must be a connection with personnalToken or masterToken
  * @param {string} baseStreamId - application base Strem ID
  * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
  *  @returns {AppClientAccount}
  */
  static async newFromConnection (baseStreamId, connection, appName) {
    // in a static method "this" is the class (here the extending class)
    const app = new this(baseStreamId, connection, appName);
    await app.init();
    return app;
  }

  /**
   * @private
   * use .newFrom...() to create new AppManagingAccount
   * @param {string} baseStreamId
   * @param {Pryv.Connection} connection
   * @param {string} [appName] - optional if appSettings.appNameFromAccessInfo is set to true
   */
  constructor (baseStreamId, connection, appName) {
    if (!baseStreamId || baseStreamId.length < 2) throw new Error('Missing or too short baseStreamId');
    this.baseStreamId = baseStreamId;
    if (appName == null && !this.appSettings.appNameFromAccessInfo) {
      throw new Error('appName must be given unless appSettings.appNameFromAccessInfo = true');
    }
    this.appName = appName;
    this.connection = connection;
    this.cache = { };
  }

  async init () {
    await createAppStreams(this);
  }

  /**
   * Force loading of streamData
   */
  async loadStreamData () {
    const streamData = (await this.connection.apiOne('streams.get', { id: this.baseStreamId }, 'streams'))[0];
    if (streamData) {
      this.cache.streamData = streamData;
    }
    return streamData;
  }
}

module.exports = Application;

// create app Streams

async function createAppStreams (app) {
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
    const masterFound = infos.permissions.find(p => (p.streamId === '*' && p.level === 'manage'));
    isPersonalOrMaster = true;
    if (app.appSettings.mustBemaster && !masterFound) {
      throw new Error('Application with "app" type of access requires "master" token (streamId = "*", level = "manage")');
    } else { // check that app has "manage" level on baseStreamId
      const baseStreamFound = infos.permissions.find(p => (p.streamId === app.baseStreamId && p.level === 'manage'));
      if (!baseStreamFound) throw new Error(`Application with "app" type of access requires  (streamId = '${app.baseStreamId}', level = "manage") or master access`);
    }
  }
  // get streamStructure
  let found = false;
  try {
    const streamData = await app.loadStreamData();
    if (streamData) found = true;
  } catch (e) {
    if (e.innerObject?.id !== 'unknown-referenced-resource' || e.innerObject?.data?.id !== 'test-app-template-client') {
      throw e;
    }
  }
  // not found create streams
  if (!found) {
    if (app.appName == null) {
      throw new Error('Cannot create app stream if not "appName" has been given');
    }
    if (!isPersonalOrMaster) {
      throw new Error('Token has not sufficient right to create App streams. Create them upfront');
    }
    const apiCalls = [
      { method: 'streams.create', params: { id: 'applications', name: 'Applications' } },
      { method: 'streams.create', params: { id: app.baseStreamId, name: app.appName, parentId: 'applications' } }
    ];
    const streamCreateResult = await app.connection.api(apiCalls);
    const stream = streamCreateResult[1].stream;
    app.cache.streamData = stream;
  }
}
