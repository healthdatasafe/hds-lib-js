const pryv = require('pryv');
const { HDSLibError } = require('../errors');

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

  get key () {
    return CollectorClient.keyFromInfo(this.eventData.content.accessInfo);
  }

  get requesterEventId () {
    return this.eventData.content.requesterEventId;
  }

  get requestData () {
    return this.eventData.content.requesterEventData.content;
  }

  get status () {
    // TODO the following test is bogus this.eventData.status does not exists
    if (!this.accessData && this.eventData.status === CollectorClient.STATUSES.refused) {
      return CollectorClient.STATUSES.refused;
    }
    if (this.accessData) return CollectorClient.STATUSES.active;
    return CollectorClient.STATUSES.incoming;
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
        accessInfo
      }
    };
    const event = await app.connection.apiOne('events.create', eventData, 'event');
    return new CollectorClient(app, event);
  }

  /**
   * Accept current request
   */
  async accept () {
    // create access for requester
    if (this.accessData != null) throw new HDSLibError('Access Info already set');
    // create access
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
    if (!this.accessData.apiEndpoint) throw new HDSLibError('Failed creating request access', accessData);

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

    const requesterConnection = new pryv.Connection(requestrerApiEndpoint);
    const requesterEvent = await requesterConnection.apiOne('events.create', acceptEvent, 'event');

    return { accessData, requesterEvent };
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
