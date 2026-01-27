import { pryv } from '../patchedPryv';
import { HDSLibError } from '../errors';

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

  get chatSettings (): {type: 'user', streamRead: string, streamWrite: string } {
    return this.eventData.content.chat;
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
