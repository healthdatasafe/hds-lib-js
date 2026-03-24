import { HDSLibError } from '../errors.ts';
import { pryv } from '../patchedPryv.ts';
import { Application } from './Application.ts';
import { CollectorClient } from './CollectorClient.ts';
import { Contact } from './Contact.ts';
import type { ContactSource } from './interfaces.ts';
import * as logger from '../logger.ts';

/**
 * - applications
 *   - [baseStreamId] "Root" stream from this app
 */

const MAX_COLLECTORS = 1000;
export class AppClientAccount extends Application {
  constructor (baseStreamId: string, connection: pryv.Connection, appName?: string, features?: any) {
    super(baseStreamId, connection, appName, features);
    this.cache.collectorClientsMap = {};
  }

  get appSettings (): any {
    return {
      canBePersonnal: true,
      mustBeMaster: true
    };
  }

  /**
   * When the app receives a new request for data sharing
   */
  async handleIncomingRequest (apiEndpoint: string, incomingEventId?: string): Promise<CollectorClient> {
    // make sure that collectorClientsMap is initialized
    await this.getCollectorClients();

    const requesterConnection = new pryv.Connection(apiEndpoint);
    const accessInfo = await requesterConnection.accessInfo();
    // check if request is known
    const collectorClientKey = CollectorClient.keyFromInfo(accessInfo);
    logger.debug('AppClient:handleIncomingRequest', { collectorClientKey, accessInfo, incomingEventId });
    if (this.cache.collectorClientsMap[collectorClientKey]) {
      const collectorClient = this.cache.collectorClientsMap[collectorClientKey];
      logger.debug('AppClient:handleIncomingRequest found existing', { collectorClient });
      if (collectorClient.requesterApiEndpoint !== apiEndpoint) {
        // console.log('⚠️⚠️⚠️⚠️ RESET! Found existing collectorClient with a different apiEndpoint', { actual: collectorClient.requesterApiEndpoint, incoming: apiEndpoint });
        throw new HDSLibError('Found existing collectorClient with a different apiEndpoint', { actual: collectorClient.requesterApiEndpoint, incoming: apiEndpoint });
        // we might consider reseting() in the future;
        // return await collectorClient.reset(apiEndpoint, incomingEventId, accessInfo);
      }
      if (incomingEventId && collectorClient.requesterEventId !== incomingEventId) {
        throw new HDSLibError('Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
        // console.log('⚠️⚠️⚠️⚠️ RESET! Found existing collectorClient with a different eventId', { actual: collectorClient.requesterEventId, incoming: incomingEventId });
        // we might consider reseting() in the future;
        // return await collectorClient.reset(apiEndpoint, incomingEventId, accessInfo);
        // return null;
      }
      return collectorClient;
    }
    // check if comming form hdsCollector
    if (!accessInfo?.clientData?.hdsCollector || (accessInfo.clientData?.hdsCollector as any)?.version !== 0) {
      throw new HDSLibError('Invalid collector request, cannot find clientData.hdsCollector or wrong version', { clientData: accessInfo?.clientData });
    }
    // else create it
    const collectorClient = await CollectorClient.create(this, apiEndpoint, incomingEventId, accessInfo);
    this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    return collectorClient;
  }

  async getCollectorClientByKey (collectorKey: string): Promise<CollectorClient | undefined> {
    // ensure collectors are initialized
    await this.getCollectorClients();
    return this.cache.collectorClientsMap[collectorKey];
  }

  async getCollectorClients (forceRefresh: boolean = false): Promise<CollectorClient[]> {
    if (!forceRefresh && this.cache.collectorClientsMapInitialized) return Object.values(this.cache.collectorClientsMap);
    const apiCalls: pryv.APICall[] = [{
      method: 'accesses.get',
      params: { includeDeletions: true }
    }, {
      method: 'events.get',
      params: { types: ['request/collector-client-v1'], streams: [this.baseStreamId], limit: MAX_COLLECTORS }
    }];
    const [accessesRes, eventRes] = await this.connection.api(apiCalls);
    const accessHDSCollectorMap: { [key: string]: any } = {};
    for (const access of accessesRes.accesses) {
      if (access.clientData?.hdsCollectorClient) {
        accessHDSCollectorMap[access.name] = access;
      }
    }
    for (const event of eventRes.events) {
      const collectorClient = new CollectorClient(this, event);
      if (accessHDSCollectorMap[collectorClient.key] != null) collectorClient.accessData = accessHDSCollectorMap[collectorClient.key];
      // temp process - might be removed
      await collectorClient.checkConsistency();
      this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    }

    this.cache.collectorClientsMapInitialized = true;
    return Object.values(this.cache.collectorClientsMap);
  }

  /**
   * Get all contacts grouped by remote user.
   * Combines CollectorClients (person-to-person) and bridge/other accesses.
   * Multiple forms from the same doctor → one Contact with multiple sources.
   * Contacts are enriched with CollectorClient instances and access objects.
   */
  async getContacts (forceRefresh: boolean = false): Promise<Contact[]> {
    const collectorClients = await this.getCollectorClients(forceRefresh);
    const sources: ContactSource[] = [];

    // Collector clients → person contacts
    for (const cc of collectorClients) {
      sources.push(cc.toContactSource());
    }

    // Other accesses (bridges, orphan collectors, custom apps)
    const allAccesses = await this.connection.apiOne('accesses.get', {}, 'accesses');
    const collectorAccessNames = new Set(collectorClients.map(cc => cc.key));
    for (const access of allAccesses) {
      if (collectorAccessNames.has(access.name)) continue;
      if (access.type === 'personal') continue;

      // Orphan collector access: has hdsCollectorClient clientData but no matching event
      const clientData = access.clientData as Record<string, any> | undefined;
      if (clientData?.hdsCollectorClient) {
        const evtData = clientData.hdsCollectorClient.eventData;
        const requestData = evtData?.content?.requesterEventData?.content;
        const username: string | undefined = evtData?.content?.accessInfo?.user?.username;
        if (username && requestData) {
          const chatEnabled = requestData.features?.chat != null;
          sources.push({
            remoteUsername: username,
            displayName: requestData.requester?.name || username,
            chatStreams: chatEnabled ? { main: `chat-${username}`, incoming: `chat-${username}-in` } : null,
            appStreamId: (clientData.appStreamId as string) || null,
            permissions: access.permissions || requestData.permissions || [],
            status: access.deleted ? 'Deactivated' : 'Active',
            type: 'collector',
            accessId: access.id || null
          });
          continue;
        }
      }

      // Bridge access: has appStreamId
      const source = Contact.sourceFromAccess(access);
      if (source.type === 'bridge') {
        sources.push(source);
      }
    }

    // Group sources into contacts
    const contacts = Contact.groupByContact(sources);

    // Enrich contacts with CollectorClients and access objects
    const accessById: Record<string, any> = {};
    for (const access of allAccesses) {
      accessById[access.id] = access;
    }

    for (const contact of contacts) {
      // Match CollectorClients to contacts
      for (const cc of collectorClients) {
        if (cc.requesterUsername === contact.remoteUsername) {
          contact.addCollectorClient(cc);
          if (cc.accessData?.id && accessById[cc.accessData.id]) {
            contact.addAccessObject(accessById[cc.accessData.id]);
          }
        }
      }
      // Add access objects for orphan/bridge sources
      for (const source of contact.sources) {
        if (source.accessId && accessById[source.accessId]) {
          contact.addAccessObject(accessById[source.accessId]);
        }
      }
    }

    return contacts;
  }

  /**
   * - Check connection validity
   * - Make sure stream structure exists
   */
  async init (): Promise<this> {
    return super.init();
  }
}
