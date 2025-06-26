const pryv = require('../patchedPryv');

/**
 * - applications
 *   - [baseStreamId] "Root" stream from this app
 */
class AppClientAccount {
  conection;
  baseStreamId;
  appName;
  #cache;

  get streamData () {
    return this.#cache.streamData;
  }

  /**
   * Create with an apiEnpoint
   * @param {string} apiEndpoint
   * @param {string} baseStreamId - application base Strem ID
   * @param {string} appName
   * @returns {AppClientAccount}
   */
  static async newFromApiEndpoint (apiEndpoint, baseStreamId, appName) {
    const connection = new pryv.Connection(apiEndpoint);
    return await this.newWithConnection(connection, baseStreamId, appName);
  }

  /**
   * Create with an apiEnpoint
   * @param {Pryv.connection} connection - must be a connection with personnalToken or masterToken
     * @param {string} baseStreamId - application base Strem ID
     * @param {string} appName
  *  @returns {AppClientAccount}
  */
  static async newWithConnection (connection, baseStreamId, appName) {
    const appClientAccount = new AppClientAccount(connection, baseStreamId, appName);
    await appClientAccount.init();
    return appClientAccount;
  }

  /**
   * @private
   * use one of AppClientAccount.createWith..()
   * @param {string} baseStreamId - application base Strem ID
   * @param {Pryv.connection} connection - must be a connection with personnalToken or masterToken
   */
  constructor (connection, baseStreamId, appName) {
    if (!baseStreamId || baseStreamId.length < 2) throw new Error('Missing or too short baseStreamId');
    this.connection = connection;
    this.baseStreamId = baseStreamId;
    this.appName = appName;
    this.#cache = {};
  }

  /**
   * - Check connection validity
   * - Make sure stream structure exists
   */
  async init () {
    // check that connection has a master token or is a personnal token
    const infos = await this.connection.accessInfo();
    if (infos.type !== 'personal') {
      if (infos.type !== 'app') throw new Error('AppClientAccount requires a "personal" or "app" type of access');
      const masterFound = infos.permissions.find(p => (p.streamId === '*' && p.level === 'manage'));
      if (!masterFound) throw new Error('AppClientAccount with "app" type of access requires "master" token (streamId = "*", level = "manage")');
    }
    // get streamStructure
    let found = false;
    try {
      const streams = await this.connection.apiOne('streams.get', { id: this.baseStreamId }, 'streams');
      if (streams[0]) this.#cache.streamData = streams[0];
      found = true;
    } catch (e) {
      if (e.innerObject?.id !== 'unknown-referenced-resource' || e.innerObject?.data?.id !== 'test-app-template-client') {
        throw e;
      }
    }
    // not found create streams
    if (!found) {
      const apiCalls = [
        { method: 'streams.create', params: { id: 'applications', name: 'Applications' } },
        { method: 'streams.create', params: { id: this.baseStreamId, name: this.appName, parentId: 'applications' } }
      ];
      const streamCreateResult = await this.connection.api(apiCalls);
      const stream = streamCreateResult[1].stream;
      this.#cache.streamData = stream;
    }
  }
}

module.exports = AppClientAccount;
