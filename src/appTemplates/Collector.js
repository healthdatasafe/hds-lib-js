const { HDSLibError } = require('../errors');

const COLLECTOR_STREAMID_SUFFIXES = {
  internal: 'internal',
  public: 'public',
  pending: 'pending',
  inbox: 'inbox',
  active: 'active',
  error: 'error'
};
Object.freeze(COLLECTOR_STREAMID_SUFFIXES);

/**
 * Collector is used by AppManagingAccount
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 */
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
   * @typedef {RequestContent}
   * @property {number} version
   * @property {Localizable} description
   * @property {Localizable} consent
   * @property {Array<Permission>} permissions - Like Pryv permission request
   * @property {Object} app
   * @property {String} app.id
   * @property {String} app.url
   * @property {Object} app.data - to be finalized
   */

  /**
   * @typedef {StatusData}
   * @property {RequestContent} requestContent
   */

  /** @type {StatusData} */
  get statusData () {
    if (this.#cache.status == null) throw new Error('Init Collector first');
    return this.#cache.status.content.data;
  }

  /**
   * Fetch online data
   */
  async init () {
    await this.checkStreamStructure();
    await this.#getStatus();
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
  async #getStatus (forceRefresh = false) {
    if (!forceRefresh && this.#cache.status) return this.#cache.status;
    const params = { types: ['status/collector-v1'], limit: 1, streams: [this.streamIdFor(Collector.STREAMID_SUFFIXES.internal)] };
    const statusEvents = await this.appManaging.connection.apiOne('events.get', params, 'events');
    if (statusEvents.length === 0) { // non exsitent set "draft" status
      return this.#setStatus(Collector.STATUSES.draft);
    }
    this.#cache.status = statusEvents[0];
    return this.#cache.status;
  }

  /**
   * Change the status
   * @param {string} status one of of 'draft', 'active', 'deactivated'
   * @param {object} [data] - if not set reuuse current data or { requestContent: {} }
   * @returns {StatusEvent}
   */
  async #setStatus (status, data) {
    if (!Collector.STATUSES[status]) throw new HDSLibError('Unkown status key', { status, data });
    if (!data) {
      data = (!this.#cache.status) ? { requestContent: {} } : this.statusData;
    }

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

  async save () {
    if (this.statusCode !== Collector.STATUSES.draft) throw new Error(`Cannot save when status = "${this.statusCode}".`);
    return await this.#setStatus(Collector.STATUSES.draft);
  }

  async publish () {
    const publicEventData = {
      type: 'request/collector-v1',
      streamIds: [this.streamIdFor(Collector.STREAMID_SUFFIXES.public)],
      content: this.statusData.requestContent
    };
    await this.appManaging.connection.apiOne('events.create', publicEventData, 'event');
    return await this.#setStatus(Collector.STATUSES.active);
  }

  /**
   * Create a "pending" invite to be sent to an app using AppSharingAccount
   * @param {string} name a default display name for this request
   * @param {Object} [options]
   * @param {Object} [options.customData] any data to be used by the client app
   */
  async createInvite (name, options = {}) {
    if (this.statusCode !== Collector.STATUSES.active) throw new Error(`Collector must be in "active" state error to create invite, current: ${this.statusCode}`);
    const eventParams = {
      type: 'invite/collector-v1',
      streamIds: [this.streamIdFor(Collector.STREAMID_SUFFIXES.pending)],
      content: {
        name,
        customData: options.customData || {}
      }
    };
    const newInvite = await this.appManaging.connection.apiOne('events.create', eventParams, 'event');
    const result = {
      apiEndpoint: await this.sharingApiEndpoint(),
      eventId: newInvite.id
    };
    return result;
  }

  /**
   * Get sharing api endpoint
   */
  async sharingApiEndpoint () {
    if (this.statusCode !== Collector.STATUSES.active) throw new Error(`Collector must be in "active" state error to get sharing link, current: ${this.statusCode}`);
    if (this.#cache.sharingApiEndpoint) return this.#cache.sharingApiEndpoint;
    // check if sharing present
    const sharedAccessId = 'a-' + this.streamId;
    const accesses = await this.appManaging.connection.apiOne('accesses.get', {}, 'accesses');
    const sharedAccess = accesses.find(
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
        version: 0,
        public: {
          streamId: this.streamIdFor(Collector.STREAMID_SUFFIXES.public)
        },
        inbox: {
          streamId: this.streamIdFor(Collector.STREAMID_SUFFIXES.inbox)
        }
      }
    };
    const params = { name: sharedAccessId, type: 'shared', permissions, clientData };
    const access = await this.appManaging.connection.apiOne('accesses.create', params, 'access');
    const newSharingApiEndpoint = access?.apiEndpoint;
    if (!newSharingApiEndpoint) throw new HDSLibError('Cannot find apiEndpoint in sharing creation request', { result: access, requestParams: params });
    this.#cache.sharingApiEndpoint = newSharingApiEndpoint;
    return newSharingApiEndpoint;
  }

  /**
   * check if required streams are present, if not create them
   */
  async checkStreamStructure () {
    // if streamData has correct child structure, we assume all is OK
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

module.exports = Collector;
