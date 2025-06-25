const { HDSLibError } = require('../errors');
const ShortUniqueId = require('short-unique-id');
const collectorIdGenerator = new ShortUniqueId({ dictionary: 'alphanum_lower', length: 7 });

/**
 * App which manages Collectors
 * A "Collector" can be see as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 *
 * The App can create multiple "collectors e.g. Questionnaries"
 *
 * Stream structure
 * - [baseStreamId]  "Root" stream for this app
 *     - [baseStreamId]-[collectorsId] Each "questionnary" or "request for a set of data" has it's own stream
 *       - [baseStreamId]-[collectorsId]-settings Contains events with the current settings of this app (this stream will be shared in "read" with the request)
 *       - [baseStreamId]-[collectorsId]-pending Contains events with "pending" requests
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
    const apiCalls = [{
      method: 'streams.get',
      params: {
        parentId: this.baseStreamId
      }
    }];
    const result = (await this.connection.api(apiCalls))[0];
    if (result.error) throw new HDSLibError('Failed getting collectors', result.error);
    if (!result.streams || !Array.isArray(result.streams)) throw new HDSLibError('Failed getting collectors, invalid result', result);
    const collectorsMap = {};
    for (const stream of result.streams) {
      const collector = new Collector(this, stream);
      collectorsMap[collector.streamId] = collector;
    }
    this.#cache.collectorsMap = collectorsMap;
    return Object.values(this.#cache.collectorsMap);
  }

  async createCollector (name) {
    const streamId = this.baseStreamId + '-' + collectorIdGenerator.rnd();
    const apiCalls = [{
      method: 'streams.create',
      params: {
        id: streamId,
        name,
        parentId: this.baseStreamId
      }
    }];
    const result = (await this.connection.api(apiCalls))[0];
    if (result.error) throw new HDSLibError('Failed creating collector', result.error);
    if (!result.stream?.name) throw new HDSLibError('Failed creating collector, invalid result', result);
    const collector = new Collector(this, result.stream);
    this.#cache.collectorsMap[collector.streamId] = collector;
    return collector;
  }
}

const COLLECTOR_STREAMID_SUFFIXES = {
  settings: 'settings',
  pending: 'pending',
  active: 'active',
  error: 'error'
};
Object.freeze(COLLECTOR_STREAMID_SUFFIXES);
class Collector {
  static STREAMID_SUFFIXES = COLLECTOR_STREAMID_SUFFIXES;
  appManaging;
  streamId;
  name;
  #streamData;

  /**
   * @param {AppManagingAccount} appManaging
   * @param {Pryv.Stream} streamData
   */
  constructor (appManaging, streamData) {
    this.streamId = streamData.id;
    this.name = streamData.name;
    this.appManaging = appManaging;
    this.#streamData = streamData;
  }

  /**
   * check if required streams are present, if not create them
   */
  async checkStreamStructure () {
    // if streamData has correct children structure we assume all is OK
    const childrenData = this.#streamData.children;
    const toCreate = Object.values(Collector.STREAMID_SUFFIXES)
      .filter((suffix) => {
        if (!childrenData) return true;
        if (childrenData.find(child => child.id === this.streamIdFor(suffix))) return false;
        return true;
      });

    if (toCreate.length === 0) return { created: [] };
    // create required streams
    const apiCalls = toCreate.map(suffix => ({
      method: 'streams.create',
      params: {
        id: this.streamIdFor(suffix),
        parentId: this.streamId,
        name: this.name + ' ' + suffix
      }
    }));
    const result = { created: [], errors: [] };
    const resultsApi = await this.appManaging.connection.api(apiCalls);
    for (const resultCreate of resultsApi) {
      if (resultCreate.error) {
        result.errors.push(resultCreate.error);
        continue;
      }
      if (resultCreate.stream) {
        result.created.push(resultCreate.stream);
        if (!this.#streamData.children) this.#streamData.children = [];
        this.#streamData.children.push(resultCreate.stream);
        continue;
      }
      result.errors.push({ id: 'unkown-error', message: 'Cannot find stream in result', data: resultCreate });
    }
    return result;
  }

  /**
   * @param {string} suffix
   */
  streamIdFor (suffix) {
    return this.streamId + '-' + suffix;
  }
}

module.exports = AppManagingAccount;

async function newAppManagingAccountFromConnection (connection, baseStreamId) {
  const accessInfo = (await connection.api([{ method: 'getAccessInfo', params: {} }]))[0];
  if (!accessInfo.type === 'app') throw new Error('Failed createing new AppManagingAccount, invalid coonection: ' + JSON.stringify(accessInfo));
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
