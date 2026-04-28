import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import type { ContactSource } from './interfaces.ts';

/** Generate a v4-ish UUID. Uses crypto.randomUUID() when available, falls back to a manual impl. */
function newUuid (): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // RFC4122-ish v4 fallback
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[(Math.random() * 4 | 0) + 8];
    else s += hex[Math.random() * 16 | 0];
  }
  return s;
}

/**
 * Collector Invite
 * There is one Collector Invite per Collector => Enduser connection
 */

export class CollectorInvite {
  /**
   * get the key that will be assigned to this event;
   */
  static getKeyForEvent (eventData: any): string {
    return eventData.id;
  }

  collector: any;
  eventData: any;
  #connection: pryv.Connection | null = null;
  #accessInfo: any = null;

  get key (): string {
    return CollectorInvite.getKeyForEvent(this.eventData);
  }

  get status (): string {
    return this.collector.inviteStatusForStreamId(this.eventData.streamIds[0]);
  }

  get apiEndpoint (): string {
    if (this.status !== 'active') {
      throw new HDSLibError('invite.apiEndpoint is accessible only when active');
    }
    return this.eventData.content.apiEndpoint;
  }

  get errorType (): string | undefined {
    return this.eventData.content?.errorType;
  }

  get dateCreation (): Date {
    return new Date(this.eventData.created * 1000);
  }

  get connection (): pryv.Connection {
    if (this.#connection == null) {
      this.#connection = new pryv.Connection(this.apiEndpoint);
    }
    return this.#connection;
  }

  get hasChat (): boolean {
    return this.eventData.content.chat != null;
  }

  get chatSettings (): { type: 'user', streamRead: string, streamWrite: string } {
    return this.eventData.content.chat;
  }

  // -------------------- chat methods ----------------- //
  chatEventInfos (event: pryv.Event): { source: 'me' | 'user' | 'unkown' } {
    if (event.streamIds.includes(this.chatSettings.streamWrite)) return { source: 'me' };
    if (event.streamIds.includes(this.chatSettings.streamRead)) return { source: 'user' };
    return { source: 'unkown' };
  }

  async chatPost (content: string): Promise<pryv.Event> {
    if (!this.hasChat) throw new Error('Cannot chat with this contact');
    const newEvent = {
      type: 'message/hds-chat-v1',
      streamIds: [this.chatSettings.streamWrite],
      content
    };
    return await this.connection.apiOne('events.create', newEvent, 'event');
  }

  // -------------------- system stream (Plan 45) ----------------- //
  /** Whether this invite has system-stream access (operator → user alerts + user → operator acks). */
  get hasSystem (): boolean {
    return this.eventData.content.system != null;
  }

  /** Stream wiring for the system feature. streamOut is the operator's write target; streamIn is read. */
  get systemSettings (): { streamOut?: string, streamIn?: string } {
    return this.eventData.content.system || {};
  }

  /** Identify the source of a system event. */
  systemEventInfos (event: pryv.Event): { source: 'me' | 'user' | 'unknown' } {
    const s = this.systemSettings;
    if (s.streamOut && event.streamIds.includes(s.streamOut)) return { source: 'me' };
    if (s.streamIn && event.streamIds.includes(s.streamIn)) return { source: 'user' };
    return { source: 'unknown' };
  }

  /**
   * Post a system alert to the user. Generates ackId if ackRequired and not provided.
   * Requires `hasSystem === true` and `systemSettings.streamOut` (manage permission).
   */
  async systemPostAlert (alert: {
    level: 'info' | 'warning' | 'critical',
    title: string,
    body: string,
    ackRequired?: boolean,
    ackId?: string
  }): Promise<pryv.Event> {
    const s = this.systemSettings;
    if (!s.streamOut) throw new HDSLibError('No system streamOut on this invite');
    const content: any = { level: alert.level, title: alert.title, body: alert.body };
    if (alert.ackRequired) {
      content.ackRequired = true;
      content.ackId = alert.ackId || newUuid();
    } else if (alert.ackId) {
      content.ackId = alert.ackId;
    }
    const newEvent = {
      type: 'message/system-alert',
      streamIds: [s.streamOut],
      content
    };
    return await this.connection.apiOne('events.create', newEvent, 'event');
  }

  /**
   * Read system-ack events for this invite, optionally filtered by alert ackId.
   * Returns events sorted ascending by `created`.
   */
  async systemPollAcks (filter: { ackId?: string, limit?: number } = {}): Promise<pryv.Event[]> {
    const s = this.systemSettings;
    if (!s.streamIn) throw new HDSLibError('No system streamIn on this invite');
    const params: any = {
      streams: [s.streamIn],
      types: ['message/system-ack'],
      limit: filter.limit ?? 100,
      sortAscending: true
    };
    const events = await this.connection.apiOne('events.get', params, 'events');
    if (filter.ackId) {
      return (events as pryv.Event[]).filter((e: any) => e.content?.ackId === filter.ackId);
    }
    return events as pryv.Event[];
  }

  /**
   * Check if connection is valid. (only if active)
   * If result is "forbidden" update and set as revoked
   * @returns accessInfo if valid.
   */
  async checkAndGetAccessInfo (forceRefresh: boolean = false): Promise<any> {
    if (!forceRefresh && this.#accessInfo) return this.#accessInfo;
    try {
      this.#accessInfo = await this.connection.accessInfo();
      return this.#accessInfo;
    } catch (e: any) {
      this.#accessInfo = null;
      if (e.response?.body?.error?.id === 'invalid-access-token') {
        await this.collector.revokeInvite(this, true);
        return null;
      }
      throw e;
    }
  }

  /**
   * revoke the invite
   */
  async revoke (): Promise<any> {
    return this.collector.revokeInvite(this);
  }

  get displayName (): string {
    return this.eventData.content.name;
  }

  /** Extract patient username from apiEndpoint (only available for active invites) */
  get patientUsername (): string | null {
    if (this.status !== 'active') return null;
    try {
      const endpoint = this.eventData.content.apiEndpoint;
      if (!endpoint) return null;
      // apiEndpoint format: https://token@host/username/
      const url = new URL(endpoint.replace(/\/\/[^@]+@/, '//'));
      const path = url.pathname.replace(/^\/|\/$/g, '');
      return path || null;
    } catch {
      return null;
    }
  }

  /** Convert to ContactSource for Contact grouping (doctor side) */
  toContactSource (): ContactSource {
    const chat = this.hasChat ? this.chatSettings : null;
    return {
      remoteUsername: this.patientUsername,
      displayName: this.displayName || this.patientUsername || 'Unknown',
      chatStreams: chat ? { main: chat.streamRead, incoming: chat.streamWrite } : null,
      appStreamId: null,
      permissions: [],
      status: this.status,
      type: 'collector',
      accessId: this.key
    };
  }

  constructor (collector: any, eventData: any) {
    if (eventData.type !== 'invite/collector-v1') throw new HDSLibError('Wrong type of event', eventData);
    this.collector = collector;
    this.eventData = eventData;
  }

  /**
   * private
   */
  setEventData (eventData: any): void {
    if (eventData.id !== this.eventData.id) throw new HDSLibError('CollectInvite event id does not match new Event');
    this.eventData = eventData;
  }

  async getSharingData (): Promise<{ apiEndpoint: string; eventId: string }> {
    if (this.status !== 'pending') throw new HDSLibError('Only pendings can be shared');
    return {
      apiEndpoint: await this.collector.sharingApiEndpoint(),
      eventId: this.eventData.id
    };
  }
}
