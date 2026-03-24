import type { ContactSource, ChatStreams, Permission, CollectorSectionInterface } from './interfaces.ts';
import type { CollectorClient } from './CollectorClient.ts';
import { HDSModelAppStreams } from '../HDSModel/HDSModel-AppStreams.ts';
import { getStreamIdAndChildrenIds } from '../toolkit/StreamsTools.ts';
import { pryv } from '../patchedPryv.ts';

/**
 * Groups all accesses/relationships from the same remote user (or service).
 *
 * A Contact represents a person (doctor, researcher) or service (bridge)
 * that has one or more accesses on the current user's account.
 * Multiple forms from the same doctor → one Contact with multiple sources.
 * Each bridge → one Contact per bridge.
 */
export class Contact {
  /** Remote user's Pryv username. null for bridge/service contacts. */
  remoteUsername: string | null;
  /** Display name (from first source, can be overridden) */
  displayName: string;
  /** All access sources grouped into this contact */
  sources: ContactSource[];
  /** CollectorClient instances for collector sources (matched by accessId) */
  collectorClients: CollectorClient[];
  /** Raw Pryv access objects for all sources */
  accessObjects: any[];

  /** Cached set of accessible stream IDs (built by initStreamCache) */
  #accessibleStreamIds: Set<string> | null;

  constructor (remoteUsername: string | null, displayName: string) {
    this.remoteUsername = remoteUsername;
    this.displayName = displayName;
    this.sources = [];
    this.collectorClients = [];
    this.accessObjects = [];
    this.#accessibleStreamIds = null;
  }

  addSource (source: ContactSource): void {
    this.sources.push(source);
    if (this.displayName === this.remoteUsername && source.displayName !== source.remoteUsername) {
      this.displayName = source.displayName;
    }
  }

  /** Associate a CollectorClient with this contact */
  addCollectorClient (cc: CollectorClient): void {
    if (!this.collectorClients.includes(cc)) {
      this.collectorClients.push(cc);
    }
  }

  /** Associate a raw access object with this contact */
  addAccessObject (access: any): void {
    if (!this.accessObjects.find((a: any) => a.id === access.id)) {
      this.accessObjects.push(access);
    }
  }

  // ---- Stream cache & event filtering ---- //

  /**
   * Build the accessible stream IDs cache from all access permissions.
   * @param streamsById - map of streamId → stream object (with children) from the account
   */
  initStreamCache (streamsById: Record<string, any>): void {
    this.#accessibleStreamIds = new Set();
    for (const access of this.accessObjects) {
      if (access.deleted) continue;
      if (!access.permissions) continue;
      for (const p of access.permissions) {
        if (!p.streamId) continue;
        if (p.streamId === '*') {
          this.#accessibleStreamIds.add('*');
          return; // wildcard covers everything
        }
        const stream = streamsById[p.streamId];
        if (!stream) continue;
        const ids = getStreamIdAndChildrenIds(stream);
        ids.forEach((id: string) => this.#accessibleStreamIds!.add(id));
      }
    }
  }

  /** Check if an event is in a stream accessible by this contact */
  eventIsAccessible (event: pryv.Event): boolean {
    if (!this.#accessibleStreamIds) return false;
    if (this.#accessibleStreamIds.has('*')) return true;
    if (!event.streamIds) return false;
    for (const streamId of event.streamIds) {
      if (this.#accessibleStreamIds.has(streamId)) return true;
    }
    return false;
  }

  /** Check if an event was created/modified by this contact */
  eventIsFromContact (event: pryv.Event): boolean {
    for (const access of this.accessObjects) {
      if (access.id && event.modifiedBy === access.id) return true;
    }
    return false;
  }

  /** Determine chat event source: 'me', 'contact', or 'unknown' */
  chatEventInfos (event: pryv.Event): { source: 'me' | 'contact' | 'unknown' } {
    for (const cc of this.collectorClients) {
      if (!cc.hasChatFeature) continue;
      const infos = cc.chatEventInfos(event);
      if (infos.source === 'me') return { source: 'me' };
      if (infos.source === 'requester') return { source: 'contact' };
    }
    return { source: 'unknown' };
  }

  /** Post a chat message via the connection */
  async chatPost (connection: pryv.Connection, content: string): Promise<pryv.Event> {
    const chat = this.chatStreams;
    if (!chat) throw new Error('Cannot chat with this contact — no chat streams');
    const newEvent = {
      type: 'message/hds-chat-v1',
      streamIds: [chat.main],
      content
    };
    return await connection.apiOne('events.create', newEvent, 'event');
  }

  // ---- CollectorClient helpers ---- //

  /** Primary collectorClient (first active, or first available) */
  get primaryCollectorClient (): CollectorClient | undefined {
    return this.collectorClients.find(cc => cc.status === 'Active') ||
      this.collectorClients[0];
  }

  /** Whether any form is pending (Incoming) and actionable */
  get isPending (): boolean {
    return this.collectorClients.some(cc => cc.status === 'Incoming');
  }

  /** The pending CollectorClient, if any */
  get pendingCollectorClient (): CollectorClient | undefined {
    return this.collectorClients.find(cc => cc.status === 'Incoming');
  }

  /** Accept the pending invite */
  async acceptPendingInvite (): Promise<any> {
    const cc = this.pendingCollectorClient;
    if (!cc) throw new Error('No pending invite to accept');
    return await cc.accept();
  }

  /** Refuse the pending invite */
  async refusePendingInvite (): Promise<any> {
    const cc = this.pendingCollectorClient;
    if (!cc) throw new Error('No pending invite to refuse');
    return await cc.refuse();
  }

  /** Aggregated form sections from all active CollectorClients */
  get formSections (): CollectorSectionInterface[] {
    const sections: CollectorSectionInterface[] = [];
    for (const cc of this.collectorClients) {
      if (cc.status !== 'Active') continue;
      try {
        const s = cc.getSections();
        if (s) sections.push(...s);
      } catch { /* ignore */ }
    }
    return sections;
  }

  /** Overall status: Active > Incoming > first source status */
  get status (): string | null {
    if (this.sources.some(s => s.status === 'Active' || s.status === 'active')) return 'Active';
    if (this.sources.some(s => s.status === 'Incoming')) return 'Incoming';
    return this.sources[0]?.status || null;
  }

  // ---- Existing getters ---- //

  /** Chat streams from any source that has chat enabled */
  get chatStreams (): ChatStreams | null {
    for (const source of this.sources) {
      if (source.chatStreams) return source.chatStreams;
    }
    return null;
  }

  get hasChat (): boolean {
    return this.chatStreams !== null;
  }

  get appStreamIds (): string[] {
    const ids: string[] = [];
    for (const source of this.sources) {
      if (source.appStreamId && !ids.includes(source.appStreamId)) {
        ids.push(source.appStreamId);
      }
    }
    return ids;
  }

  get allPermissions (): Permission[] {
    const seen = new Set<string>();
    const result: Permission[] = [];
    for (const source of this.sources) {
      if (source.status === 'Deactivated' || source.status === 'Refused') continue;
      for (const perm of source.permissions) {
        const key = `${perm.streamId}:${perm.level}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(perm);
        }
      }
    }
    return result;
  }

  get isActive (): boolean {
    return this.sources.some(s => s.status === 'Active' || s.status === 'active');
  }

  get isPerson (): boolean {
    return this.remoteUsername !== null;
  }

  get collectorSources (): ContactSource[] {
    return this.sources.filter(s => s.type === 'collector');
  }

  get bridgeSources (): ContactSource[] {
    return this.sources.filter(s => s.type === 'bridge');
  }

  get accessIds (): string[] {
    return this.sources.map(s => s.accessId).filter((id): id is string => id !== null);
  }

  // ---- Static helpers ---- //

  static sourceFromAccess (access: any): ContactSource {
    const appStreamId = HDSModelAppStreams.getAppStreamId(access);
    return {
      remoteUsername: null,
      displayName: access.name || 'Unknown',
      chatStreams: null,
      appStreamId,
      permissions: access.permissions || [],
      status: access.deleted ? 'Deleted' : 'active',
      type: appStreamId ? 'bridge' : 'other',
      accessId: access.id || null
    };
  }

  static groupByContact (sources: ContactSource[]): Contact[] {
    const byUsername = new Map<string, Contact>();
    const standalone: Contact[] = [];

    for (const source of sources) {
      if (source.remoteUsername) {
        let contact = byUsername.get(source.remoteUsername);
        if (!contact) {
          contact = new Contact(source.remoteUsername, source.displayName);
          byUsername.set(source.remoteUsername, contact);
        }
        contact.addSource(source);
      } else {
        const contact = new Contact(null, source.displayName);
        contact.addSource(source);
        standalone.push(contact);
      }
    }

    return [...byUsername.values(), ...standalone];
  }
}
