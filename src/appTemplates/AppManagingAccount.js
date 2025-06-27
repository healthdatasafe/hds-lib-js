const ShortUniqueId = require('short-unique-id');
const collectorIdGenerator = new ShortUniqueId({ dictionary: 'alphanum_lower', length: 7 });
const Application = require('./Application');
const Collector = require('./Collector');

/**
 * App which manages Collectors
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 *
 * The App can create multiple "collectors e.g. Questionnaries"
 *
 * Stream structure
 * - applications
 *   - [baseStreamId]  "Root" stream for this app
 *     - [baseStreamId]-[collectorsId] Each "questionnaire" or "request for a set of data" has it's own stream
 *       - [baseStreamId]-[collectorsId]-internal Private stuff not to be shared
 *       - [baseStreamId]-[collectorsId]-public Contains events with the current settings of this app (this stream will be shared in "read" with the request)
 *       - [baseStreamId]-[collectorsId]-pending Contains events with "pending" requests
 *       - [baseStreamId]-[collectorsId]-inbox Contains events with "inbox" requests Will be shared in createOnly
 *       - [baseStreamId]-[collectorsId]-active Contains events with "active" users
 *       - [baseStreamId]-[scollectorsId]-errors Contains events with "revoked" or "erroneous" users
 */
class AppManagingAccount extends Application {
  // used by Application.init();
  get appSettings () {
    return {
      canBePersonnal: true,
      mustBeMaster: true,
      appNameFromAccessInfo: true // application name will be taken from Access-Info Name
    };
  }

  async init () {
    await super.init();
    // -- check if stream structure exists
    await this.getCollectors();
    return this;
  }

  async getCollectors (forceRefresh) {
    if (!forceRefresh && this.cache.collectorsMap) return Object.values(this.cache.collectorsMap);
    // Collectors are materialized by streams
    if (forceRefresh) await this.loadStreamData();
    const streams = this.streamData.children || [];
    const collectorsMap = {};
    for (const stream of streams) {
      const collector = new Collector(this, stream);
      collectorsMap[collector.streamId] = collector;
    }
    this.cache.collectorsMap = collectorsMap;
    return Object.values(this.cache.collectorsMap);
  }

  /**
   * Create an iniatilized Collector
   * @param {string} name
   * @returns {Collector}
   */
  async createCollector (name) {
    const collector = await this.createCollectorUnitialized(name);
    await collector.init();
    return collector;
  }

  /**
   * Create an un-initialized Collector (mostly used by tests)
   * @param {string} name
   * @returns {Collector}
   */
  async createCollectorUnitialized (name) {
    const streamId = this.baseStreamId + '-' + collectorIdGenerator.rnd();
    const params = {
      id: streamId,
      name,
      parentId: this.baseStreamId
    };
    const stream = await this.connection.apiOne('streams.create', params, 'stream');
    // add new stream to streamCache
    this.streamData.children.push(stream);
    const collector = new Collector(this, stream);
    this.cache.collectorsMap[collector.streamId] = collector;
    return collector;
  }
}

module.exports = AppManagingAccount;
