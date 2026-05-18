import { HDSLibError } from '../errors.ts';
import { pryv } from '../patchedPryv.ts';
import { Application } from './Application.ts';
import { CollectorClient } from './CollectorClient.ts';
import { Contact } from './Contact.ts';
import type { ContactSource } from './interfaces.ts';
import * as logger from '../logger.ts';

/**
 * Plan 56: discriminated outcome of `handleIncomingRequest`. Caller branches
 * per `kind` for UX (e.g. `created` → success toast; `event-mismatch` →
 * collision modal; `in-terminal-state` → "previously refused" message).
 *
 * Every outcome carries the relevant `CollectorClient` so callers can still
 * navigate to / display the existing relationship even when no new client was
 * minted.
 */
export type IncomingRequestOutcome =
  | { kind: 'created'; collectorClient: CollectorClient }
  | { kind: 'in-incoming'; collectorClient: CollectorClient }
  | { kind: 'already-active'; collectorClient: CollectorClient }
  | { kind: 'event-mismatch'; collectorClient: CollectorClient; incomingEventId: string }
  | { kind: 'in-terminal-state'; collectorClient: CollectorClient; status: 'Refused' | 'Deactivated' }
  | { kind: 'key-collision-different-endpoint'; collectorClient: CollectorClient };

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
   * When the app receives a new request for data sharing.
   *
   * Returns a discriminated outcome (Plan 56) — caller decides per-kind UX.
   * Never silently activates a stale event against an existing CollectorClient;
   * never silently dedupes a second invite as if it were the first.
   *
   * Branch logic:
   *   1. Resolve accessInfo for the URL's apiEndpoint, compute the cache key.
   *   2. If the cache already holds a CC for that key:
   *      - apiEndpoint mismatch → `key-collision-different-endpoint`.
   *      - incomingEventId mismatch (the actual reproduction case, see plan 56
   *        "Concrete reproduction") → `event-mismatch` — caller must not
   *        auto-activate the existing CC against the new event.
   *      - Status === Active → `already-active`.
   *      - Status terminal (Refused / Deactivated) → `in-terminal-state`.
   *      - Status Incoming / null → `in-incoming`.
   *   3. Otherwise mint a new CollectorClient and return `created`.
   */
  async handleIncomingRequest (apiEndpoint: string, incomingEventId?: string): Promise<IncomingRequestOutcome> {
    // make sure that collectorClientsMap is initialized
    await this.getCollectorClients();

    const requesterConnection = new pryv.Connection(apiEndpoint);
    const accessInfo = await requesterConnection.accessInfo();
    const collectorClientKey = CollectorClient.keyFromInfo(accessInfo);
    logger.debug('AppClient:handleIncomingRequest', { collectorClientKey, accessInfo, incomingEventId });

    const existing = this.cache.collectorClientsMap[collectorClientKey];
    if (existing) {
      logger.debug('AppClient:handleIncomingRequest found existing', { collectorClient: existing });

      if (existing.requesterApiEndpoint !== apiEndpoint) {
        logger.info('AppClient:handleIncomingRequest key-collision-different-endpoint', {
          existing: existing.requesterApiEndpoint, incoming: apiEndpoint
        });
        return { kind: 'key-collision-different-endpoint', collectorClient: existing };
      }

      if (incomingEventId != null && incomingEventId !== existing.requesterEventId) {
        logger.info('AppClient:handleIncomingRequest event-mismatch', {
          existing: existing.requesterEventId, incoming: incomingEventId
        });
        return { kind: 'event-mismatch', collectorClient: existing, incomingEventId };
      }

      const status = existing.status;
      if (status === CollectorClient.STATUSES.active) {
        return { kind: 'already-active', collectorClient: existing };
      }
      if (status === CollectorClient.STATUSES.refused || status === CollectorClient.STATUSES.deactivated) {
        return { kind: 'in-terminal-state', collectorClient: existing, status: status as 'Refused' | 'Deactivated' };
      }
      // Incoming or null
      return { kind: 'in-incoming', collectorClient: existing };
    }

    // No existing — mint a fresh CollectorClient
    if (!accessInfo?.clientData?.hdsCollector || (accessInfo.clientData?.hdsCollector as any)?.version !== 0) {
      throw new HDSLibError('Invalid collector request, cannot find clientData.hdsCollector or wrong version', { clientData: accessInfo?.clientData });
    }
    const collectorClient = await CollectorClient.create(this, apiEndpoint, incomingEventId, accessInfo);
    this.cache.collectorClientsMap[collectorClient.key] = collectorClient;
    return { kind: 'created', collectorClient };
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
   * Also checks for pending access update requests on active CollectorClients.
   */
  async getContacts (forceRefresh: boolean = false): Promise<Contact[]> {
    const collectorClients = await this.getCollectorClients(forceRefresh);

    // Check for pending update requests in parallel (with timeout)
    const activeClients = collectorClients.filter(cc => cc.status === 'Active');
    if (activeClients.length > 0) {
      const UPDATE_CHECK_TIMEOUT = 10000;
      await Promise.allSettled(
        activeClients.map(cc =>
          Promise.race([
            cc.checkForUpdateRequests(),
            new Promise(resolve => setTimeout(resolve, UPDATE_CHECK_TIMEOUT))
          ])
        )
      );
    }

    const sources: ContactSource[] = [];

    // Collector clients → person contacts
    for (const cc of collectorClients) {
      sources.push(cc.toContactSource());
    }

    // Other accesses (bridges, orphan collectors, custom apps)
    // Include deletions so bridge contacts can match events created by old (recreated) accesses
    const allAccesses = await this.connection.apiOne('accesses.get', { includeDeletions: true }, 'accesses');
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

      // For bridge contacts: also add deleted accesses with the same name
      // so eventIsFromContact can match events created by old (recreated) access IDs
      if (!contact.isPerson) {
        const contactAccessNames = new Set(contact.accessObjects.map((a: any) => a.name));
        for (const access of allAccesses) {
          if (!access.deleted) continue;
          if (contactAccessNames.has(access.name) && !contact.accessObjects.some((a: any) => a.id === access.id)) {
            contact.addAccessObject(access);
          }
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
