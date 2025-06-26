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
  internal: 'internal',
  public: 'public',
  pending: 'pending',
  inbox: 'inbox',
  active: 'active',
  error: 'error'
};
Object.freeze(COLLECTOR_STREAMID_SUFFIXES);
class Collector {
  static STREAMID_SUFFIXES = COLLECTOR_STREAMID_SUFFIXES;
  static STATUSES = Object.freeze({
    draft: 'draft',
    active: 'active',
    deactivated: 'deactivated'
  });

  appManaging;
  streamId;
  name;
  #streamData;
  #cache;

  /**
   * @param {AppManagingAccount} appManaging
   * @param {Pryv.Stream} streamData
   */
  constructor (appManaging, streamData) {
    this.streamId = streamData.id;
    this.name = streamData.name;
    this.appManaging = appManaging;
    this.#streamData = streamData;
    this.#cache = {};
  }

  /**
   * @property {string} one of 'draft', 'active', 'deactivated'
   */
  get statusCode () {
    if (this.#cache.status == null) throw new Error('Init Collector first');
    return this.#cache.status.content.status;
  }

  /**
   * Fetch online data
   */
  async init () {
    await this.checkStreamStructure();
    await this.getStatus();
  }

  /**
   * @type {StatusEvent} - extends PryvEvent with a specific content
   * @property {Object} content - content
   * @property {String} content.status - one of 'draft', 'active', 'deactivated'
   * @property {Data} content.data - app specific data
   */

  /**
   * Get Collector status,
   * @param {boolean} forceRefresh - if true, forces fetching the status from the server
   * @returns {StatusEvent}
   */
  async getStatus (forceRefresh = false) {
    if (!forceRefresh && this.#cache.status) return this.#cache.status;
    const params = { types: ['status/collector-v1'], limit: 1, streams: [this.streamIdFor(Collector.STREAMID_SUFFIXES.internal)] };
    const statusEvents = await this.appManaging.connection.apiOne('events.get', params, 'events');
    if (statusEvents.length === 0) { // non exsitent set "draft" status
      return this.setStatus(Collector.STATUSES.draft, {});
    }
    this.#cache.status = statusEvents[0];
    return this.#cache.status;
  }

  /**
   * Change the status
   * @param {string} status one of of 'draft', 'active', 'deactivated'
   * @param {object} data - custom data
   * @returns {StatusEvent}
   */
  async setStatus (status, data) {
    if (!Collector.STATUSES[status]) throw new HDSLibError('Unkown status key', { status, data });
    const event = {
      type: 'status/collector-v1',
      streamIds: [this.streamIdFor(Collector.STREAMID_SUFFIXES.internal)],
      content: {
        status,
        data
      }
    };
    const statusEvent = await this.appManaging.connection.apiOne('events.create', event, 'event');
    this.#cache.status = statusEvent;
    return this.#cache.status;
  }

  /**
   * Create a "pending" invite to be sent to an app usin AppSharingAccount
   * @param {string} name a default display name for this request
   * @param {Object} [options]
   * @param {Object} [options.customData] any data to be used by the client app
   */
  async createInvite (name, options) {

  }

  /**
   * Get sharing api endpoint
   */
  async sharingApiEndpoint () {
    if (this.#cache.sharingApiEndpoint) return this.#cache.sharingApiEndpoint;
    // check if sharing present
    const sharedAccessId = 'a-' + this.streamId;
    const accessesCheckRes = (await this.appManaging.connection.api([
      { method: 'accesses.get', params: {} }
    ]))[0];
    if (accessesCheckRes?.error) throw new HDSLibError('Failed getting list of accesses', accessesCheckRes.error);
    if (!accessesCheckRes?.accesses) throw new HDSLibError('Failed getting list of accesses', accessesCheckRes);
    const sharedAccess = accessesCheckRes.accesses.find(
      (access) => access.name === sharedAccessId
    );
    // found return it
    if (sharedAccess) {
      this.#cache.sharingApiEndpoint = sharedAccess.apiEndpoint;
      return sharedAccess.apiEndpoint;
    }

    // not found create it
    const permissions = [
      { streamId: this.streamIdFor(Collector.STREAMID_SUFFIXES.inbox), level: 'create-only' },
      { streamId: this.streamIdFor(Collector.STREAMID_SUFFIXES.public), level: 'read' },
      // for "publicly shared access" always forbid the selfRevoke feature
      { feature: 'selfRevoke', setting: 'forbidden' },
      // for "publicly shared access" always forbid the selfAudit feature
      { feature: 'selfAudit', setting: 'forbidden' }
    ];
    const clientData = {
      hdsCollector: {
        public: {
          streamId: this.streamIdFor(Collector.public)
        },
        inbox: {
          streamId: this.streamIdFor(Collector.inbox)
        }
      }
    };
    const accessesCreate = await this.appManaging.connection.api([{
      method: 'accesses.create',
      params: {
        name: sharedAccessId,
        type: 'shared',
        permissions,
        clientData
      }
    }]);
    if (accessesCreate?.[0]?.error) throw new HDSLibError('Failed creating shared token', accessesCreate?.[0]?.error);
    const newSharingApiEndpoint = accessesCreate?.[0]?.access?.apiEndpoint;
    if (!newSharingApiEndpoint) throw new HDSLibError('Cannot find apiEndpoint in sharing creation request', accessesCreate);
    this.#cache.sharingApiEndpoint = newSharingApiEndpoint;
    return newSharingApiEndpoint;
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
