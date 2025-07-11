const pryv = require('pryv');
const { HDSLibError } = require('../errors');
const logger = require('../logger');

/**
 * Client App in relation to an AppManagingAccount/Collector
 */
class CollectorClient {
  static STATUSES = Object.freeze({
    incoming: 'Incoming',
    active: 'Active',
    deactivated: 'Deactivated',
    refused: 'Refused'
  });

  /** @type {AppClientAccount} */
  app;
  /** @type {PryvEvent} */
  eventData;
  /** @type {Object} - when active or deactivated - there is a link with accessData */
  accessData;

  /** @property {String} - identified within user's account - can be used to retreive a Collector Client from an app */
  get key () {
    return CollectorClient.keyFromInfo(this.eventData.content.accessInfo);
  }

  /** @property {String} - id matching an event within requester's account - used as a reference to communicate with requester */
  get requesterEventId () {
    return this.eventData.content.requesterEventId;
  }

  /** @property {Object} - full content of the request */
  get requestData () {
    return this.eventData.content.requesterEventData.content;
  }

  /** @property {string} - one of 'Incoming', 'Active', 'Deactivated', 'Refused' */
  get status () {
    const eventStatus = this.eventData.content.status;
    if (this.accessData && !this.accessData.deleted && this.eventData.content.status !== CollectorClient.STATUSES.active) {
      console.log(this.accessData);
      throw new HDSLibError('Should be active, try checkConsiency()');
    }
    return eventStatus;
  }

  constructor (app, eventData, accessData = null) {
    this.app = app;
    this.eventData = eventData;
    this.accessData = accessData;
  }

  /**
   * Create a new Event
   */
  static async create (app, apiEndpoint, requesterEventId, accessInfo) {
    // check content of accessInfo
    const publicStreamId = accessInfo.clientData.hdsCollector.public.streamId;
    // get request event cont
    const requesterConnection = new pryv.Connection(apiEndpoint);
    const requesterEvents = await requesterConnection.apiOne('events.get', { types: ['request/collector-v1'], streams: [publicStreamId], limit: 1 }, 'events');
    if (!requesterEvents[0]) throw new HDSLibError('Cannot find requester event in public stream', requesterEvents);

    const eventData = {
      type: 'request/collector-client-v1',
      streamIds: [app.baseStreamId],
      content: {
        apiEndpoint,
        requesterEventId,
        requesterEventData: requesterEvents[0],
        accessInfo,
        status: CollectorClient.STATUSES.incoming
      }
    };
    const event = await app.connection.apiOne('events.create', eventData, 'event');
    return new CollectorClient(app, event);
  }

  /**
   * Update business event with new status
   * @param {string} newStatus
   * @param {Object} [extraData] - if given this will be added to content ⚠️ - This can ovveride content!
   */
  async #updateStatus (newStatus, extraData = null) {
    const newContent = structuredClone(this.eventData.content);
    newContent.status = newStatus;
    if (extraData !== null) Object.assign(newContent, extraData);
    const eventData = await this.app.connection.apiOne('events.update', {
      id: this.eventData.id,
      update: {
        content: newContent
      }
    }, 'event');
    this.eventData = eventData;
  }

  /**
   * Refuse current request
   */
  async refuse () {
    if (this.status !== 'Incoming') throw new HDSLibError('Cannot only refuse incoming requests');
    // sent access credentials to requester
    // check content of accessInfo
    const publicStreamId = this.eventData.content.accessInfo.clientData.hdsCollector.inbox.streamId;
    const requesterEventId = this.requesterEventId;
    const requestrerApiEndpoint = this.eventData.content.apiEndpoint;

    // refuseEvent to be sent to requester
    const refuseEvent = {
      type: 'refusal/collector-v1',
      streamIds: [publicStreamId],
      content: {
        eventId: requesterEventId
      }
    };

    const requesterConnection = new pryv.Connection(requestrerApiEndpoint);
    const requesterEvent = await requesterConnection.apiOne('events.create', refuseEvent, 'event');

    await this.#updateStatus(CollectorClient.STATUSES.refused);
    return { requesterEvent };
  }

  /**
   * Revoke current request
   * @param {boolean} forceAndSkipAccessCreation - internal temporary option,
   */
  async revoke () {
    if (this.status !== 'Active') throw new HDSLibError('Cannot only revoke an Active CollectorClient');

    console.log('Do something for revoke');
  }

  /**
   * Accept current request
   * @param {boolean} forceAndSkipAccessCreation - internal temporary option,
   */
  async accept (forceAndSkipAccessCreation = false) {
    if (forceAndSkipAccessCreation) {
      if (!this.accessData?.apiEndpoint || this.accessData?.delete) throw new HDSLibError('Cannot force accept with empty or deleted accessData', this.accessData);
    } else {
      if (this.status === 'Active') throw new HDSLibError('Cannot accept an Active CollectorClient');
      // create access for requester
      const cleanedPermissions = this.requestData.permissions.map((p) => {
        if (p.streamId) return { streamId: p.streamId, level: p.level };
        return p;
      });
      const accessCreateData = {
        name: this.key,
        type: 'shared',
        permissions: cleanedPermissions,
        clientData: {
          hdsCollectorClient: {
            version: 0,
            eventData: this.eventData
          }
        }
      };
      const accessData = await this.app.connection.apiOne('accesses.create', accessCreateData, 'access');
      this.accessData = accessData;
      if (!this.accessData?.apiEndpoint) throw new HDSLibError('Failed creating request access', accessData);
    }

    // sent access credentials to requester
    // check content of accessInfo
    const publicStreamId = this.eventData.content.accessInfo.clientData.hdsCollector.inbox.streamId;
    const requesterEventId = this.requesterEventId;
    const requestrerApiEndpoint = this.eventData.content.apiEndpoint;

    // acceptEvent to be sent to requester
    const acceptEvent = {
      type: 'credentials/collector-v1',
      streamIds: [publicStreamId],
      content: {
        apiEndpoint: this.accessData.apiEndpoint,
        eventId: requesterEventId
      }
    };

    try {
      const requesterConnection = new pryv.Connection(requestrerApiEndpoint);
      const requesterEvent = await requesterConnection.apiOne('events.create', acceptEvent, 'event');
      await this.#updateStatus(CollectorClient.STATUSES.active);
      return { accessData: this.accessData, requesterEvent };
    } catch (e) {
      const deactivatedDetail = {
        type: 'error',
        message: e.message
      };
      if (e.innerObject) deactivatedDetail.data = e.innerObject;
      logger.error('Failed activating', deactivatedDetail);
      await this.#updateStatus(CollectorClient.STATUSES.deactivated, { deactivatedDetail });
      return false;
    }
  }

  /**
   * Probable temporary internal to fix possible inconsenticies during lib early stages
   */
  async checkConsistency () {
    // accessData but not active
    if (this.accessData && this.eventData.content.status == null) {
      logger.info('Found discrepency with accessData and status not active, fixing it');
      if (this.accessData.deleted) {
        await this.accept(true);
      } else {
        await this.revoke();
      }
    } else {
      logger.debug('CollectorClient:checkConsistency', this.accessData);
    }
  }

  /**
   * return the key to discriminate collectorClients
   * @param {PryvAccessInfo} accessInfo
   */
  static keyFromInfo (info) {
    return info.user.username + ':' + info.name;
  }
}

module.exports = CollectorClient;
