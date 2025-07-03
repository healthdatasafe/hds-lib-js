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

  get status () {
    if (!this.accessData && this.eventData.status === CollectorClient.STATUSES.refused) {
      return CollectorClient.STATUSES.refused;
    }
    return CollectorClient.STATUSES.incoming;
  }

  constructor (app, eventData) {
    this.app = app;
    this.eventData = eventData;
  }

  /**
   * Create a new Event
   */
  static async create (app, apiEndpoint, requesterEventId, accessInfo) {
    // check content of accessInfo
    const publicStreamId = accessInfo.clientData.hdsCollector.public.streamId;
    // get request event cont
    const requesterConnection = new pryv.Connection(apiEndpoint);
    const requesterEvents = await requesterConnection.apiOne('events.get', { streams: [publicStreamId], limit: 1 }, 'events');
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
   * return the key to discriminate collectorClients
   * @param {PryvAccessInfo} accessInfo
   */
  static keyFromInfo (info) {
    return info.user.username + ':' + info.name;
  }
}

module.exports = CollectorClient;
