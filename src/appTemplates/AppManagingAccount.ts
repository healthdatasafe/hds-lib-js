import ShortUniqueId from 'short-unique-id';
import Application from './Application';
import Collector from './Collector';

const collectorIdGenerator = new ShortUniqueId({ dictionary: 'alphanum_lower', length: 7 });

/**
 * App which manages Collectors
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 *
 * The App can create multiple "collectors e.g. Questionnaires"
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
export default class AppManagingAccount extends Application {
  // used by Application.init();
  get appSettings (): any {
    return {
      canBePersonnal: true,
      mustBeMaster: true,
      appNameFromAccessInfo: true // application name will be taken from Access-Info Name
    };
  }

  async init (): Promise<this> {
    await super.init();
    // -- check if stream structure exists
    await this.getCollectors();
    return this;
  }

  async getCollectors (forceRefresh?: boolean): Promise<Collector[]> {
    await this.#updateCollectorsIfNeeded(forceRefresh);
    return Object.values(this.cache.collectorsMap);
  }

  async getCollectorById (id: string): Promise<Collector | undefined> {
    await this.#updateCollectorsIfNeeded();
    return this.cache.collectorsMap[id];
  }

  async #updateCollectorsIfNeeded (forceRefresh: boolean = false): Promise<void> {
    if (!forceRefresh && this.cache.collectorsMap) return;
    if (forceRefresh) await this.loadStreamData();
    // TODO do not replace the map, but update collectors if streamData has changed and add new collectors
    const streams = this.streamData.children || [];
    const collectorsMap: { [key: string]: Collector } = {};
    for (const stream of streams) {
      const collector = new Collector(this, stream);
      collectorsMap[collector.id] = collector;
    }
    this.cache.collectorsMap = collectorsMap;
  }

  /**
   * Create an initialized Collector
   */
  async createCollector (name: string): Promise<Collector> {
    const collector = await this.createCollectorUnitialized(name);
    await collector.init();
    return collector;
  }

  /**
   * Create an un-initialized Collector (mostly used by tests)
   */
  async createCollectorUnitialized (name: string): Promise<Collector> {
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
