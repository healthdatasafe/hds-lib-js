/**
 * Client App in relation to an AppManagingAccount/Collector
 * A "Collector" can be seen as a "Request" and set of "Responses"
 *
 */

class CollectorClient {
  /** @type {AppClientAccount} */
  app;
  /** @type {PryvEvent} */
  eventData;

  get key () {
    return CollectorClient.keyFromInfo(this.eventData.content.accessInfo);
  }

  get requesterEventId () {
    return this.eventData.content.requesterEventId;
  }

  constructor (app, eventData) {
    this.app = app;
    this.eventData = eventData;
  }

  /**
   * Create a new Event
   */
  static async create (app, apiEndpoint, requesterEventId, accessInfo) {
    const eventData = {
      type: 'request/collector-client-v1',
      streamIds: [app.baseStreamId],
      content: {
        apiEndpoint,
        requesterEventId,
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
