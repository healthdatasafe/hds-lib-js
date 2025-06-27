/**
 * Client App in relation to an AppManagingAccount/Collector
 * A "Collector" can be seen as a "Request" and set of "Responses"
 *
 */

class CollectorClient {
  apiEndpoint;
  eventId;
  constructor (apiEndpoint, eventId) {
    this.apiEndpoint = apiEndpoint;
    this.eventId = eventId;
  }
}

module.exports = CollectorClient;
