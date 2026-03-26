import ShortUniqueId from 'short-unique-id';
import { Application } from './Application.ts';
import { Collector } from './Collector.ts';
import { Contact } from './Contact.ts';
import type { ContactSource } from './interfaces.ts';

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
export class AppManagingAccount extends Application {
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
   * Get all patient contacts grouped by username, across all collectors.
   * Each Contact may have invites from multiple forms.
   */
  async getContacts (forceRefresh: boolean = false): Promise<Contact[]> {
    const collectors = await this.getCollectors(forceRefresh);
    const sources: ContactSource[] = [];

    // Collect all invites from all collectors in parallel (with error tolerance + timeout)
    const allInvitePairs: Array<{ collector: any; invite: any }> = [];
    const TIMEOUT_MS = 10000;

    const loadCollector = async (collector: any) => {
      await collector.init(forceRefresh);
      const invites = await collector.getInvites(forceRefresh);
      return invites;
    };

    const results = await Promise.allSettled(
      collectors.map(async (collector) => {
        const race = Promise.race([
          loadCollector(collector),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
        ]);
        const invites = await race as any[];
        return { collector, invites };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { collector, invites } = result.value;
        for (const invite of invites) {
          sources.push(invite.toContactSource());
          allInvitePairs.push({ collector, invite });
        }
      } else {
        console.error('Contact: failed loading collector', result.reason);
      }
    }

    // Group by patient username
    const contacts = Contact.groupByContact(sources);

    // Enrich contacts with collector+invite references (no extra API calls — reuse cached invites)
    for (const contact of contacts) {
      for (const { collector, invite } of allInvitePairs) {
        const username = invite.patientUsername;
        if (username && username === contact.remoteUsername) {
          contact.addInvite(collector, invite);
        }
      }
    }

    return contacts;
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
    if (!this.streamData.children) this.streamData.children = [];
    this.streamData.children.push(stream);
    const collector = new Collector(this, stream);
    this.cache.collectorsMap[collector.streamId] = collector;
    return collector;
  }
}
