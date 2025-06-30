const { HDSLibError } = require('../errors');
const pryv = require('../patchedPryv');
const Application = require('./Application');
const CollectorClient = require('./CollectorClient');

/**
 * - applications
 *   - [baseStreamId] "Root" stream from this app
 */

const MAX_COLLECTORS = 1000;
class AppClientAccount extends Application {
  constructor (baseStreamId, connection, appName) {
    super(...arguments);
    this.cache.collectorClientsMap = {};
  }

  get appSettings () {
    return {
      canBePersonnal: true,
      mustBeMaster: true
    };
  }

  /**
   * When the app receives a new request for data sharing
   * @param {string} apiEndpoint
   * @param {string} [incomingEventId] - Information for the recipient
   */
  async handleIncomingRequest (apiEndpoint, incomingEventId) {
    const requesterConnection = new pryv.Connection(apiEndpoint);
    const accessInfos = await requesterConnection.accessInfo();
    // check if request is known
    if (this.cache.collectorClientsMap[CollectorClient.keyFromInfo(accessInfos)]) {
      const collectorClient = this.collectoClientsMap[accessInfos.name];
      if (incomingEventId && collectorClient.requesterEventId !== incomingEventId) {
        throw new HDSLibError('Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
      }
      return collectorClient;
    }
    // check if comming form hdsCollector
    if (!accessInfos?.clientData?.hdsCollector) {
      throw new HDSLibError('Invalid collector request, cannot find clientData.hdsCollector', { clientData: accessInfos?.clientData });
    }
    // else create it

    const collectorClient = await CollectorClient.create(this, apiEndpoint, incomingEventId, accessInfos);
    this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    return collectorClient;
  }

  async getCollectorClients () {
    const apiCalls = [{
      method: 'accesses.get',
      params: { includeDeletions: true }
    }, {
      method: 'events.get',
      params: { types: ['request/collector-client-v1'], streamIds: [this.baseStreamId], limit: MAX_COLLECTORS }
    }
    ];
    const [accessesRes, eventRes] = await this.connection.api(apiCalls);
  }

  /**
   * - Check connection validity
   * - Make sure stream structure exists
   */
  async init () {
    return super.init();
  }
}

module.exports = AppClientAccount;
