const ShortUniqueId = require('short-unique-id');
const collectorIdGenerator = new ShortUniqueId({ dictionary: 'alphanum_lower', length: 7 });
const Collector = require('./Collector');

/**
 * App which manages Collectors
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 *
 * The App can create multiple "collectors e.g. Questionnaries"
 *
 * Stream structure
 * - [baseStreamId]  "Root" stream for this app
 *     - [baseStreamId]-[collectorsId] Each "questionnary" or "request for a set of data" has it's own stream
 *       - [baseStreamId]-[collectorsId]-internal Private stuff not to be shared
 *       - [baseStreamId]-[collectorsId]-public Contains events with the current settings of this app (this stream will be shared in "read" with the request)
 *       - [baseStreamId]-[collectorsId]-pending Contains events with "pending" requests
 *       - [baseStreamId]-[collectorsId]-inbox Contains events with "inbox" requests Will be shared in createOnly
 *       - [baseStreamId]-[collectorsId]-active Contains events with "active" users
 *       - [baseStreamId]-[scollectorsId]-errors Contains events with "revoked" or "erroneous" users
 */
class AppManagingAccount {
  /** @type {Pryv.Connection} */
  connection;
  /** @type {string} */
  baseStreamId;
  /** @type {string} */
  appName;

  #cache;

  /**
   * use AppManagingAccount.newFromConnection() to create new AppManagingAccount
   * @param {string} appName
   * @param {string} baseStreamId
   * @param {Pryv.Connection} connection
   */
  constructor (appName, baseStreamId, connection) {
    this.baseStreamId = baseStreamId;
    this.appName = appName;
    this.connection = connection;
    this.#cache = { };
  }

  /**
   * Return an initialized AppManagingAccount instance
   * @param {Pryv.Connection} connection
   * @returns {AppManagingAccount}
   */
  static async newFromConnection (connection, baseStreamId) {
    const appManagingAccount = await newAppManagingAccountFromConnection(connection, baseStreamId);
    await appManagingAccount.init();
    return appManagingAccount;
  }

  async init () {
    // -- check if stream structure exists
    await this.getCollectors();
    return this;
  }

  async getCollectors (forceRefresh) {
    if (!forceRefresh && this.#cache.collectorsMap) return Object.values(this.#cache.collectorsMap);
    // Collectors are materialized by streams
    const streams = await this.connection.apiOne('streams.get', { parentId: this.baseStreamId }, 'streams');
    const collectorsMap = {};
    for (const stream of streams) {
      const collector = new Collector(this, stream);
      collectorsMap[collector.streamId] = collector;
    }
    this.#cache.collectorsMap = collectorsMap;
    return Object.values(this.#cache.collectorsMap);
  }

  async createCollector (name) {
    const streamId = this.baseStreamId + '-' + collectorIdGenerator.rnd();
    const params = {
      id: streamId,
      name,
      parentId: this.baseStreamId
    };
    const stream = await this.connection.apiOne('streams.create', params, 'stream');
    const collector = new Collector(this, stream);
    this.#cache.collectorsMap[collector.streamId] = collector;
    return collector;
  }
}

module.exports = AppManagingAccount;

async function newAppManagingAccountFromConnection (connection, baseStreamId) {
  const accessInfo = await connection.apiOne('getAccessInfo');
  if (!accessInfo.type === 'app') throw new Error('Failed creating new AppManagingAccount, "app" authorization required: ' + JSON.stringify(accessInfo));
  // check if baseStreamId is in pemission set
  const found = accessInfo.permissions.find(p => (p.streamId === baseStreamId || p.streamId === '*'));
  if (found && found.level !== 'manage') { // check if level 'manage'
    throw new Error(`Failed creating new AppManagingAccount, Not sufficient permissions on stream: ${baseStreamId}`);
  }
  if (!found) {
    // here we may check if we can create or manage baseStreamId as it might be covered by permissions
    throw new Error(`Failed creating new AppManagingAccount, cannot find "${baseStreamId}" in permission list`);
  }
  const appManagingAccount = new AppManagingAccount(accessInfo.name, baseStreamId, connection);
  return appManagingAccount;
}
