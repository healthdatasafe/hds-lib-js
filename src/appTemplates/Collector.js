const { CollectorRequest } = require('./CollectorRequest.ts');
const { HDSLibError } = require('../errors');
const { waitUntilFalse } = require('../utils');
const CollectorInvite = require('./CollectorInvite');
const logger = require('../logger');

const COLLECTOR_STREAMID_SUFFIXES = {
  archive: 'archive',
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
  request;

  /**
   * @param {AppManagingAccount} appManaging
   * @param {Pryv.Stream} streamData
   */
  constructor (appManaging, streamData) {
    this.streamId = streamData.id;
    this.name = streamData.name;
    this.appManaging = appManaging;
    this.#streamData = streamData;
    this.request = new CollectorRequest({});
    this.#cache = {
      initialized: false,
      invites: {},
      invitesInitialized: false,
      invitesInitializing: false,
      statusEvent: null
    };
  }

  /**
   * @property {string} id - shortcut for steamid
   */
  get id () {
    return this.streamId;
  }

  /**
   * @property {string} one of 'draft', 'active', 'deactivated'
   */
  get statusCode () {
    if (this.#cache.statusEvent == null) throw new Error('Init Collector first');
    return this.#cache.statusEvent.content.status;
  }

  /**
   * Fetch online data
   */
  async init (forceRefresh = false) {
    if (!forceRefresh && this.#cache.initialized) return;
    await this.checkStreamStructure(forceRefresh);
    await this.#loadStatus(forceRefresh);
    this.#cache.initialized = true;
  }

  /**
   * @type {StatusEvent} - extends PryvEvent with a specific content
   * @property {Object} content - content
   * @property {String} content.status - one of 'draft', 'active', 'deactivated'
   * @property {CollectorRequestData} content.request - app specific data
   */

  /**
   * Load Collector status,
   * @param {boolean} forceRefresh - if true, forces fetching the status from the server
   */
  async #loadStatus (forceRefresh = false) {
    if (!forceRefresh && this.#cache.statusEvent) return this.#cache.statusEvent;
    const params = { types: ['status/collector-v1'], limit: 1, streams: [this.streamIdFor(Collector.STREAMID_SUFFIXES.internal)] };
    const statusEvents = await this.appManaging.connection.apiOne('events.get', params, 'events');
    if (statusEvents.length === 0) { // non exsitent set "draft" status
      return this.#setStatus(Collector.STATUSES.draft);
    }
    this.#cache.statusEvent = statusEvents[0];
    this.request.loadFromStatusEvent(statusEvents[0]);
  }

  /**
   * Change the status
   * @param {string} status one of of 'draft', 'active', 'deactivated'
   * @returns {StatusEvent}
   */
  async #setStatus (status) {
    if (!Collector.STATUSES[status]) throw new HDSLibError('Unkown status key', { status });

    const event = {
      type: 'status/collector-v1',
      streamIds: [this.streamIdFor(Collector.STREAMID_SUFFIXES.internal)],
      content: {
        status,
        request: this.request.content
      }
    };
    const statusEvent = await this.appManaging.connection.apiOne('events.create', event, 'event');
    this.#cache.statusEvent = statusEvent;
    this.request.loadFromStatusEvent(statusEvent);
    return this.#cache.statusEvent;
  }

  async save () {
    if (this.statusCode !== Collector.STATUSES.draft) throw new Error(`Cannot save when status = "${this.statusCode}".`);
    return await this.#setStatus(Collector.STATUSES.draft);
  }

  async publish () {
    const publicEventData = {
      type: 'request/collector-v1',
      streamIds: [this.streamIdFor(Collector.STREAMID_SUFFIXES.public)],
      content: this.request.content
    };
    await this.appManaging.connection.apiOne('events.create', publicEventData, 'event');
    return await this.#setStatus(Collector.STATUSES.active);
  }

  #addOrUpdateInvite (eventData) {
    const key = CollectorInvite.getKeyForEvent(eventData);
    if (this.#cache.invites[key]) {
      this.#cache.invites[key].setEventData(eventData);
    } else {
      this.#cache.invites[key] = new CollectorInvite(this, eventData);
    }
    return this.#cache.invites[key];
  }

  /**
   * Retrieve an invite by its key
   */
  async getInviteByKey (key) {
    await this.init(); // do not forceRefresh on Init();
    await this.#initInvites();
    return this.#cache.invites[key];
  }

  /**
   * Retreive all invites
   * @param {boolean} [forceRefresh]
   * @returns {Array<CollectorInvite>}
   */
  async getInvites (forceRefresh = false) {
    await this.init(); // do not forceRefresh on Init();
    await this.#initInvites(forceRefresh);
    return Object.values(this.#cache.invites);
  }

  async #initInvites (forceRefresh) {
    await waitUntilFalse(() => (this.#cache.invitesInitializing));
    if (!forceRefresh && this.#cache.invitesInitialized) return;
    this.#cache.invitesInitializing = true;
    const queryParams = { types: ['invite/collector-v1'], streams: [this.streamId], fromTime: 0, toTime: 8640000000000000, limit: 10000 };
    try {
      await this.appManaging.connection.getEventsStreamed(queryParams, (eventData) => {
        this.#addOrUpdateInvite(eventData);
      });
    } catch (e) {
      this.#cache.invitesInitialized = true;
      this.#cache.invitesInitializing = false;
      throw e;
    }
    this.#cache.invitesInitialized = true;
    this.#cache.invitesInitializing = false;
  }

  async checkInbox () {
    const newCollectorInvites = [];

    const params = { types: ['response/collector-v1'], limit: 1000, streams: [this.streamIdFor(Collector.STREAMID_SUFFIXES.inbox)] };
    const responseEvents = await this.appManaging.connection.apiOne('events.get', params, 'events');
    for (const responseEvent of responseEvents) {
      // fetch corresponding invite
      const inviteEvent = await this.appManaging.connection.apiOne('events.getOne', { id: responseEvent.content.eventId }, 'event');
      if (inviteEvent == null) throw new HDSLibError(`Cannot find invite event matching id: ${responseEvent.content.eventId}`, responseEvent);

      const updateInvite = {
        content: structuredClone(inviteEvent.content)
      };
      updateInvite.content.sourceEventId = responseEvent.id;

      // check type of response
      switch (responseEvent.content.type) {
        case 'accept':
          updateInvite.streamIds = [this.streamIdFor(Collector.STREAMID_SUFFIXES.active)];
          Object.assign(updateInvite.content, { apiEndpoint: responseEvent.content.apiEndpoint });
          break;
        case 'refuse':
          updateInvite.streamIds = [this.streamIdFor(Collector.STREAMID_SUFFIXES.error)];
          updateInvite.content.errorType = 'refused';
          break;
        case 'revoke':
          updateInvite.streamIds = [this.streamIdFor(Collector.STREAMID_SUFFIXES.error)];
          updateInvite.content.errorType = 'revoked';
          break;
        default:
          throw new HDSLibError(`Unkown or undefined ${responseEvent.content.type}`, responseEvent);
      }

      // update inviteEvent and archive inbox message
      const apiCalls = [
        {
          method: 'events.update',
          params: {
            id: inviteEvent.id,
            update: updateInvite
          }
        },
        {
          method: 'events.update',
          params: {
            id: responseEvent.id,
            update: {
              streamIds: [this.streamIdFor(Collector.STREAMID_SUFFIXES.archive)]
            }
          }
        }
      ];
      const results = await this.appManaging.connection.api(apiCalls);
      const errors = results.filter((r) => (!r.event));
      if (errors.length > 0) throw new HDSLibError('Error activating incoming request', errors);
      const eventUpdated = results[0].event;
      const inviteUpdated = this.#addOrUpdateInvite(eventUpdated);
      newCollectorInvites.push(inviteUpdated);
    }
    return newCollectorInvites;
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
    const invite = this.#addOrUpdateInvite(newInvite);
    return invite;
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
   * @private
   * @param {CollectorInvite} invite
   * @returns {CollectorInvite}
   */
  async revokeInvite (invite) {
    // Invalidate Invite APIEndpoint(s)
    if (invite.status === 'active') { // invalidate eventual authorization granted
      const accessInfo = await invite.checkAndGetAccessInfo(true);
      const deletionResult = await invite.connection.apiOne('accesses.delete', { id: accessInfo.id });
      if (deletionResult?.accessDeletion?.id == null) {
        logger.warn(`Failed revoking invite access for ${accessInfo.name}`);
      }
    }

    // invalidate this access
    const updateInvite = {
      id: invite.eventData.id,
      update: {
        content: structuredClone(invite.eventData.content),
        streamIds: [this.streamIdFor(Collector.STREAMID_SUFFIXES.error)]
      }
    };

    updateInvite.update.content.errorType = 'revoked';
    const eventData = await this.appManaging.connection.apiOne('events.update', updateInvite, 'event');
    invite.eventData = eventData;
    return invite;
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

  /**
   * Invite Status for streamId
   * reverse of streamIdFor
   */
  inviteStatusForStreamId (streamId) {
    // init cache if needed
    if (!this.#cache.inviteStatusForStreamId) {
      this.#cache.inviteStatusForStreamId = {};
      for (const status of [COLLECTOR_STREAMID_SUFFIXES.pending, COLLECTOR_STREAMID_SUFFIXES.active, COLLECTOR_STREAMID_SUFFIXES.error]) {
        this.#cache.inviteStatusForStreamId[this.streamIdFor(status)] = status;
      }
    }
    // look for status
    const status = this.#cache.inviteStatusForStreamId[streamId];
    if (status == null) throw new HDSLibError(`Cannot find status for streamId: ${streamId}`);
    return status;
  }
}

module.exports = Collector;

/**
 * @typedef {CollectorRequest}
 * @property {number} version
 * @property {Localizable} description
 * @property {Localizable} consent
 * @property {Array<Permission>} permissions - Like Pryv permission request
 * @property {Object} app
 * @property {String} app.id
 * @property {String} app.url
 * @property {Object} app.data - to be finalized
 */
