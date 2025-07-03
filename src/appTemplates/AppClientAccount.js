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
    const accessInfo = await requesterConnection.accessInfo();
    // check if request is known
    if (this.cache.collectorClientsMap[CollectorClient.keyFromInfo(accessInfo)]) {
      const collectorClient = this.collectoClientsMap[accessInfo.name];
      if (incomingEventId && collectorClient.requesterEventId !== incomingEventId) {
        throw new HDSLibError('Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
      }
      return collectorClient;
    }
    // check if comming form hdsCollector
    if (!accessInfo?.clientData?.hdsCollector || accessInfo.clientData?.hdsCollector?.version !== 0) {
      throw new HDSLibError('Invalid collector request, cannot find clientData.hdsCollector or wrong version', { clientData: accessInfo?.clientData });
    }
    // else create it

    const collectorClient = await CollectorClient.create(this, apiEndpoint, incomingEventId, accessInfo);
    this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    return collectorClient;
  }

  async getCollectorClients (forceRefresh = false) {
    if (!forceRefresh && this.cache.collectorClientsMapInitialized) return Object.values(this.cache.collectoClientsMap);
    const apiCalls = [{
      method: 'accesses.get',
      params: { includeDeletions: true }
    }, {
      method: 'events.get',
      params: { types: ['request/collector-client-v1'], streams: [this.baseStreamId], limit: MAX_COLLECTORS }
    }];
    const [accessesRes, eventRes] = await this.connection.api(apiCalls);
    for (const access of accessesRes.accesses) {
      // do something
      console.log('##', access);
    }
    for (const access of accessesRes.accessDeletions) {
      // do something
      console.log('##', access);
    }
    for (const event of eventRes.events) {
      const collectorClient = new CollectorClient(this, event);
      this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    }

    this.cache.collectorClientsMapInitialized = true;
    return Object.values(this.cache.collectorClientsMap);
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
