import { CollectorRequest } from './CollectorRequest.ts';
import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import * as logger from '../logger.ts';
import type { CollectorSectionInterface, ContactSource, AccessUpdateRequest } from './interfaces.ts';

/**
 * Client App in relation to an AppManagingAccount/Collector
 */
export class CollectorClient {
  static STATUSES = Object.freeze({
    incoming: 'Incoming',
    active: 'Active',
    deactivated: 'Deactivated',
    refused: 'Refused'
  });

  app: any;
  eventData: any;
  accessData: any;
  request: CollectorRequest;
  /** Pending access update request from the requester, if any */
  pendingUpdate: AccessUpdateRequest | null = null;

  #requesterConnection: pryv.Connection;

  /** @property {String} - identified within user's account - can be used to retrieve a Collector Client from an app */
  get key (): string {
    return CollectorClient.keyFromInfo(this.eventData.content.accessInfo);
  }

  /** @property {String} - id matching an event within requester's account - used as a reference to communicate with requester */
  get requesterEventId (): string {
    return this.eventData.content.requesterEventId;
  }

  /** @property {String}  */
  get requesterApiEndpoint (): string {
    return this.eventData.content.apiEndpoint;
  }

  get requesterUsername (): string {
    return this.eventData.content.accessInfo.user.username;
  }

  get requesterConnection (): pryv.Connection {
    if (!this.#requesterConnection) {
      this.#requesterConnection = new pryv.Connection(this.requesterApiEndpoint);
    }
    return this.#requesterConnection;
  }

  /** @property {Object} - full content of the request */
  get requestData (): any {
    return this.eventData.content.requesterEventData.content;
  }

  get hasChatFeature () {
    return this.requestData.features?.chat != null;
  }

  get chatSettings (): { chatStreamIncoming: string, chatStreamMain: string } {
    if (!this.hasChatFeature) return null;
    return {
      chatStreamIncoming: `chat-${this.requesterUsername}-in`,
      chatStreamMain: `chat-${this.requesterUsername}`
    };
  }

  /** Convert to ContactSource for Contact grouping */
  toContactSource (): ContactSource {
    const chat = this.chatSettings;
    return {
      remoteUsername: this.requesterUsername,
      displayName: this.requestData?.requester?.name || this.requesterUsername,
      chatStreams: chat ? { main: chat.chatStreamMain, incoming: chat.chatStreamIncoming } : null,
      appStreamId: this.accessData?.clientData?.appStreamId || null,
      permissions: this.requestData?.permissions || [],
      status: this.status,
      type: 'collector',
      accessId: this.accessData?.id || null
    };
  }

  /** @property {string} - one of 'Incoming', 'Active', 'Deactivated', 'Refused' */
  get status (): string {
    const eventStatus = this.eventData.content.status;
    if (eventStatus === CollectorClient.STATUSES.deactivated || eventStatus === CollectorClient.STATUSES.refused) {
      if (!this.accessData?.deleted) {
        logger.error('>> CollectorClient.status TODO check consistency when access is still valid and deactivated or refused', this.accessData);
      }
      return eventStatus;
    }

    if (this.accessData && !this.accessData.deleted && this.eventData.content.status !== CollectorClient.STATUSES.active) {
      logger.error('>> CollectorClient.status: accessData ', this.accessData);
      throw new HDSLibError('Should be active, try checkConsistency()');
    }
    if (!eventStatus) {
      logger.error('>> CollectorClient.status is null', { eventData: this.eventData, accessData: this.accessData });
    }

    return eventStatus;
  }

  constructor (app: any, eventData: any, accessData: any = null) {
    this.app = app;
    this.eventData = eventData;
    this.accessData = accessData;
    this.request = new CollectorRequest({});
    this.request.loadFromInviteEvent(eventData.content.requesterEventData);
  }

  /**
   * @private
   * used by appClientAccount.handleIncomingRequest
   */
  static async create (app, apiEndpoint, requesterEventId, accessInfo) {
    // check content of accessInfo
    const publicStreamId = (accessInfo as any).clientData.hdsCollector.public.streamId;
    // get request event cont
    const requesterConnection = new pryv.Connection(apiEndpoint);
    const requesterEvents = await (requesterConnection as any).apiOne('events.get', { types: ['request/collector-v1'], streams: [publicStreamId], limit: 1 }, 'events');
    if (!requesterEvents[0]) throw new HDSLibError('Cannot find requester event in public stream', requesterEvents);

    const eventData = {
      type: 'request/collector-client-v1',
      streamIds: [app.baseStreamId],
      content: {
        apiEndpoint,
        requesterEventId,
        requesterEventData: requesterEvents[0],
        accessInfo,
        status: CollectorClient.STATUSES.incoming
      }
    };
    const event = await app.connection.apiOne('events.create', eventData, 'event');
    return new CollectorClient(app, event);
  }

  /**
   * @private
   * reset with new request Event of ApiEndpoint
   * Identical as create but keep current event
   */
  async reset (apiEndpoint, requesterEventId) {
    if (this.accessData && this.accessData?.deleted != null) {
      logger.error('TODO try to revoke current access');
    }
    // get accessInfo
    const requesterConnection = new pryv.Connection(apiEndpoint);
    const accessInfo = await requesterConnection.accessInfo();
    // check content of accessInfo
    const publicStreamId = (accessInfo as any).clientData.hdsCollector.public.streamId;
    // get request event cont
    const requesterEvents = await (requesterConnection as any).apiOne('events.get', { types: ['request/collector-v1'], streams: [publicStreamId], limit: 1 }, 'events');
    if (!requesterEvents[0]) throw new HDSLibError('Cannot find requester event in public stream', requesterEvents);

    const eventData = await this.app.connection.apiOne('events.update', {
      id: this.eventData.id,
      update: {
        content: {
          apiEndpoint,
          requesterEventId,
          requesterEventData: requesterEvents[0],
          accessInfo,
          status: CollectorClient.STATUSES.incoming
        }
      }
    }, 'event');
    this.eventData = eventData;
    this.request.loadFromInviteEvent(requesterEvents[0]);
    return this;
  }

  /**
   * Update business event with new status
   * @param {string} newStatus
   * @param {Object} [extraData] - if given this will be added to content ⚠️ - This can overide content!
   */
  async #updateStatus (newStatus, extraData = null) {
    const newContent = structuredClone(this.eventData.content);
    newContent.status = newStatus;
    if (extraData !== null) Object.assign(newContent, extraData);
    const eventData = await this.app.connection.apiOne('events.update', {
      id: this.eventData.id,
      update: {
        content: newContent
      }
    }, 'event');
    this.eventData = eventData;
  }

  /**
   * Accept current request
   * @param {boolean} forceAndSkipAccessCreation - internal temporary option,
   */
  async accept (forceAndSkipAccessCreation = false) {
    const responseContent: { apiEndpoint?: string, chat?: any, system?: any } = {};
    if (this.accessData && this.accessData.deleted == null && this.status !== 'Active') {
      forceAndSkipAccessCreation = true;
      logger.error('CollectorClient.accept TODO fix accept when access valid');
    }
    if (forceAndSkipAccessCreation) {
      if (!this.accessData?.apiEndpoint || this.accessData?.delete) throw new HDSLibError('Cannot force accept with empty or deleted accessData', this.accessData);
    } else {
      if (this.status === 'Active') throw new HDSLibError('Cannot accept an Active CollectorClient');
      // create access for requester
      const cleanedPermissions = this.requestData.permissions.map((p) => {
        if (p.streamId) return { streamId: p.streamId, level: p.level };
        return p;
      });

      // ------------- chat ------------------------ //
      if (this.hasChatFeature) {
        // user supported mode - might me moved to a lib

        // 2. create streams
        const { chatStreamIncoming, chatStreamMain } = this.chatSettings;
        const chatStreamsCreateApiCalls = [
          { method: 'streams.create', params: { name: 'Chats', id: 'chats' } },
          { method: 'streams.create', params: { name: `Chat ${this.requesterUsername}`, parentId: 'chats', id: chatStreamMain } },
          { method: 'streams.create', params: { name: `Chat ${this.requesterUsername} In`, parentId: chatStreamMain, id: chatStreamIncoming } }
        ];
        const streamCreateResults = await this.app.connection.api(chatStreamsCreateApiCalls);
        streamCreateResults.forEach((r) => {
          if (r.stream?.id || r.error?.id === 'item-already-exists') return;
          throw new HDSLibError('Failed creating chat stream', streamCreateResults);
        });
        // 3. add streams to permissions
        cleanedPermissions.push(...[
          { streamId: chatStreamMain, level: 'read' },
          { streamId: chatStreamIncoming, level: 'manage' }
        ]);
        responseContent.chat = {
          type: 'user',
          streamRead: chatStreamMain,
          streamWrite: chatStreamIncoming
        };
        // ---------- end chat ---------- //
      }

      // ------------- existingStreamRefs (Plan 45 mode-3) ------------------------ //
      const existingStreamRefs: Array<{ streamId: string, permissions: string[], purpose?: string }> =
        this.requestData.existingStreamRefs || [];
      if (existingStreamRefs.length > 0) {
        // 1. Bootstrap-provision `app-system-*` streams if any ref points there and they don't yet exist.
        //    (Defensive — `hds-webapp` provisions them at account setup; this safety net handles users
        //    reaching HDS via an invite without ever opening hds-webapp first.)
        const needsAppSystem = existingStreamRefs.some((r) =>
          r.streamId === 'app-system-out' || r.streamId === 'app-system-in'
        );
        if (needsAppSystem) {
          const appSystemBootstrap = [
            { method: 'streams.create', params: { name: 'System', id: 'app-system' } },
            {
              method: 'streams.create',
              params: {
                name: 'System out',
                id: 'app-system-out',
                parentId: 'app-system',
                clientData: {
                  hdsSystemFeature: {
                    'message/system-alert': { version: 'v1', levels: ['info', 'warning', 'critical'] }
                  }
                }
              }
            },
            {
              method: 'streams.create',
              params: {
                name: 'System in',
                id: 'app-system-in',
                parentId: 'app-system',
                clientData: {
                  hdsSystemFeature: {
                    'message/system-ack': { version: 'v1' }
                  }
                }
              }
            }
          ];
          const bootstrapResults = await this.app.connection.api(appSystemBootstrap);
          bootstrapResults.forEach((r) => {
            if (r.stream?.id || r.error?.id === 'item-already-exists') return;
            throw new HDSLibError('Failed bootstrapping app-system streams', bootstrapResults);
          });
        }

        // 2. Append the requested permissions to the access being granted.
        for (const ref of existingStreamRefs) {
          for (const level of ref.permissions) {
            cleanedPermissions.push({ streamId: ref.streamId, level });
          }
        }

        // 3. Surface system-stream wiring on responseContent.system if app-system-* refs are present.
        const outRef = existingStreamRefs.find((r) => r.streamId === 'app-system-out');
        const inRef = existingStreamRefs.find((r) => r.streamId === 'app-system-in');
        if (outRef || inRef) {
          responseContent.system = {
            ...(outRef ? { streamOut: 'app-system-out' } : {}),
            ...(inRef ? { streamIn: 'app-system-in' } : {})
          };
        }
      }
      // ---------- end existingStreamRefs ---------- //

      // ------------- customFields (Plan 45 mode-2 — provision-new template-private streams) ---- //
      // Each declaration provisions {streamId} (and its parent if needed) carrying
      // clientData.hdsCustomField[<eventType>] = def. Sandbox prefix is re-checked
      // here as defence-in-depth (loader.ts is the canonical enforcer).
      const customFields: Array<any> = this.requestData.customFields || [];
      if (customFields.length > 0) {
        // 1. Verify sandbox prefix again (defence-in-depth).
        for (const cf of customFields) {
          const prefix = cf.def?.templateId ? cf.def.templateId + '-' : null;
          if (!prefix || !cf.streamId.startsWith(prefix)) {
            throw new HDSLibError(
              `customFields[].streamId "${cf.streamId}" violates sandbox prefix (expected to start with "${prefix}")`,
              cf
            );
          }
        }

        // 2. Build streams.create batch — parents first, then children.
        // Each unique parentId (default `${templateId}-custom`) is created once.
        const wantedParents = new Map<string, { id: string, name: string }>();
        const childCalls: Array<any> = [];
        for (const cf of customFields) {
          const parentId = cf.parentId || (cf.def.templateId + '-custom');
          if (!wantedParents.has(parentId)) {
            wantedParents.set(parentId, { id: parentId, name: 'Custom' });
          }
          childCalls.push({
            method: 'streams.create',
            params: {
              id: cf.streamId,
              parentId,
              name: cf.name || cf.def.key,
              clientData: {
                hdsCustomField: { [cf.eventType]: cf.def }
              }
            }
          });
        }
        const parentCalls = Array.from(wantedParents.values()).map((p) => ({
          method: 'streams.create',
          params: { id: p.id, name: p.name }
        }));

        // 3. Run idempotently — `item-already-exists` is fine.
        const cfResults = await this.app.connection.api([...parentCalls, ...childCalls]);
        cfResults.forEach((r) => {
          if (r.stream?.id || r.error?.id === 'item-already-exists') return;
          throw new HDSLibError('Failed provisioning customFields streams', cfResults);
        });

        // 4. Append `contribute` permission so the requester can read submitted events.
        for (const cf of customFields) {
          cleanedPermissions.push({ streamId: cf.streamId, level: 'contribute' });
        }
      }
      // ---------- end customFields ---------- //

      const accessCreateData = {
        name: this.key,
        type: 'shared',
        permissions: cleanedPermissions,
        clientData: {
          hdsCollectorClient: {
            version: 0,
            eventData: this.eventData
          }
        }
      };
      const accessData = await this.app.connection.apiOne('accesses.create', accessCreateData, 'access');
      this.accessData = accessData;
      if (!this.accessData?.apiEndpoint) throw new HDSLibError('Failed creating request access', accessData);
    }

    responseContent.apiEndpoint = this.accessData.apiEndpoint;

    const requesterEvent = await this.#updateRequester('accept', responseContent);
    if (requesterEvent != null) {
      await this.#updateStatus(CollectorClient.STATUSES.active);
      return { accessData: this.accessData, requesterEvent };
    }
    return null;
  }

  async revoke () {
    if (this.accessData?.deleted && this.status === CollectorClient.STATUSES.deactivated) {
      throw new HDSLibError('Already revoked');
    }
    // revoke access if it exists and is not already deleted
    if (this.accessData && !this.accessData.deleted) {
      await this.app.connection.apiOne('accesses.delete', { id: this.accessData.id }, 'accessDeletion');
      // lazily flag currentAccess as deleted
      this.accessData.deleted = Date.now() / 1000;
    }

    const responseContent = { };
    const requesterEvent = await this.#updateRequester('revoke', responseContent);
    if (requesterEvent != null) {
      await this.#updateStatus(CollectorClient.STATUSES.deactivated);
      return { requesterEvent };
    }
    return null;
  }

  async refuse () {
    const responseContent = { };

    const requesterEvent = await this.#updateRequester('refuse', responseContent);
    if (requesterEvent != null) {
      await this.#updateStatus(CollectorClient.STATUSES.refused);
      return { requesterEvent };
    }
    return null;
  }

  /**
   * @param {string} type - one of 'accpet', 'revoke', 'refuse'
   * @param {object} responseContent - content is related to type
   * @returns {Object} - response
   */
  async #updateRequester (type, responseContent) {
    // sent access credentials to requester
    // check content of accessInfo
    const publicStreamId = this.eventData.content.accessInfo.clientData.hdsCollector.inbox.streamId;
    const requesterEventId = this.requesterEventId;

    // add eventId to content
    const content = Object.assign({ type, eventId: requesterEventId }, responseContent);
    // acceptEvent to be sent to requester
    const responseEvent = {
      type: 'response/collector-v1',
      streamIds: [publicStreamId],
      content
    };

    try {
      const requesterEvent = await this.requesterConnection.apiOne('events.create', responseEvent, 'event');
      return requesterEvent;
    } catch (e) {
      const deactivatedDetail = {
        type: 'error',
        message: e.message
      };
      if ((e as any).innerObject) (deactivatedDetail as any).data = (e as any).innerObject;
      logger.error('Failed activating', deactivatedDetail);
      const deactivatedResult = await this.#updateStatus(CollectorClient.STATUSES.deactivated, { deactivatedDetail });
      console.log('***** ', { deactivatedResult });
      return null;
    }
  }

  /**
   * Probable temporary internal to fix possible inconsenticies during lib early stages
   */
  async checkConsistency () {
    // accessData but not active
    if (this.accessData && this.eventData.content.status == null) {
      logger.info('Found discrepency with accessData and status not active, fixing it');
      if (!this.accessData.deleted) {
        await this.accept(true);
      } else {
        await this.revoke();
      }
    } else {
      // logger.debug('CollectorClient:checkConsistency', this.accessData);
    }
  }

  /**
   * return the key to discriminate collectorClients
   * @param {PryvAccessInfo} accessInfo
   */
  static keyFromInfo (info) {
    // Use access id when available (unique per invite), fall back to name for backwards compat
    return info.user.username + ':' + (info.id || info.name);
  }

  // -------------------- access update requests ------------- //

  /**
   * Check the requester's public stream for pending access update requests.
   * Sets this.pendingUpdate if one is found for this client's key.
   */
  async checkForUpdateRequests (): Promise<AccessUpdateRequest | null> {
    if (this.status !== CollectorClient.STATUSES.active) return null;
    try {
      const publicStreamId = this.eventData.content.accessInfo.clientData.hdsCollector.public.streamId;
      const events = await this.requesterConnection.apiOne('events.get', {
        types: ['request/access-update-v1'],
        streams: [publicStreamId],
        limit: 10
      }, 'events');
      for (const event of events) {
        if (event.content?.targetAccessName === this.key) {
          this.pendingUpdate = { eventId: event.id, content: event.content };
          return this.pendingUpdate;
        }
      }
    } catch (e) {
      logger.warn('CollectorClient.checkForUpdateRequests failed', { key: this.key, error: (e as Error).message });
    }
    this.pendingUpdate = null;
    return null;
  }

  /**
   * Accept a pending update request: delete old access, create new one with updated permissions,
   * notify requester via inbox with new apiEndpoint.
   */
  async acceptUpdate (): Promise<{ accessData: any, requesterEvent: any } | null> {
    if (!this.pendingUpdate) throw new HDSLibError('No pending update to accept');
    if (this.status !== CollectorClient.STATUSES.active) throw new HDSLibError('Can only accept updates on active CollectorClients');

    const update = this.pendingUpdate.content;

    // Build new permissions from the update request
    const cleanedPermissions = update.permissions.map((p) => {
      if (p.streamId) return { streamId: p.streamId, level: p.level };
      return p;
    });

    // Handle chat feature if requested
    const responseContent: { apiEndpoint?: string, chat?: any } = {};
    if (update.features?.chat && !this.hasChatFeature) {
      const chatStreamMain = `chat-${this.requesterUsername}`;
      const chatStreamIncoming = `chat-${this.requesterUsername}-in`;
      const chatStreamsCreateApiCalls = [
        { method: 'streams.create', params: { name: 'Chats', id: 'chats' } },
        { method: 'streams.create', params: { name: `Chat ${this.requesterUsername}`, parentId: 'chats', id: chatStreamMain } },
        { method: 'streams.create', params: { name: `Chat ${this.requesterUsername} In`, parentId: chatStreamMain, id: chatStreamIncoming } }
      ];
      const streamCreateResults = await this.app.connection.api(chatStreamsCreateApiCalls);
      streamCreateResults.forEach((r) => {
        if (r.stream?.id || r.error?.id === 'item-already-exists') return;
        throw new HDSLibError('Failed creating chat stream', streamCreateResults);
      });
      cleanedPermissions.push(
        { streamId: chatStreamMain, level: 'read' },
        { streamId: chatStreamIncoming, level: 'manage' }
      );
      responseContent.chat = {
        type: 'user',
        streamRead: chatStreamMain,
        streamWrite: chatStreamIncoming
      };
    } else if (this.hasChatFeature) {
      // Preserve existing chat permissions
      const { chatStreamMain, chatStreamIncoming } = this.chatSettings;
      cleanedPermissions.push(
        { streamId: chatStreamMain, level: 'read' },
        { streamId: chatStreamIncoming, level: 'manage' }
      );
    }

    // Collect previous access IDs for event attribution (modifiedBy tracking)
    const previousAccessIds: string[] = [];
    if (this.accessData) {
      if (this.accessData.id) previousAccessIds.push(this.accessData.id);
      // Chain: carry forward any IDs from the old access's clientData
      const oldPrevIds = this.accessData.clientData?.hdsCollectorClient?.previousAccessIds;
      if (Array.isArray(oldPrevIds)) {
        for (const id of oldPrevIds) {
          if (!previousAccessIds.includes(id)) previousAccessIds.push(id);
        }
      }
    }

    // Delete old access
    if (this.accessData && !this.accessData.deleted) {
      await this.app.connection.apiOne('accesses.delete', { id: this.accessData.id }, 'accessDeletion');
    }

    // Create new access with updated permissions
    const accessCreateData = {
      name: this.key,
      type: 'shared',
      permissions: cleanedPermissions,
      clientData: {
        hdsCollectorClient: {
          version: 0,
          eventData: this.eventData,
          previousAccessIds
        }
      }
    };
    const accessData = await this.app.connection.apiOne('accesses.create', accessCreateData, 'access');
    this.accessData = accessData;
    if (!this.accessData?.apiEndpoint) throw new HDSLibError('Failed creating updated access', accessData);

    responseContent.apiEndpoint = this.accessData.apiEndpoint;

    // Notify requester via inbox
    const requesterEvent = await this.#updateRequester('update-accept', responseContent);
    if (requesterEvent != null) {
      this.pendingUpdate = null;
      return { accessData: this.accessData, requesterEvent };
    }
    return null;
  }

  /**
   * Refuse a pending update request: notify requester via inbox, clear pendingUpdate.
   */
  async refuseUpdate (): Promise<{ requesterEvent: any } | null> {
    if (!this.pendingUpdate) throw new HDSLibError('No pending update to refuse');

    const requesterEvent = await this.#updateRequester('update-refuse', {});
    if (requesterEvent != null) {
      this.pendingUpdate = null;
      return { requesterEvent };
    }
    return null;
  }

  // -------------------- sections and forms ------------- //

  getSections (): Array<CollectorSectionInterface> {
    return this.request?.sections;
  }

  // -------------------- chat methods ----------------- //
  chatEventInfos (event: pryv.Event): { source: 'me' | 'requester' | 'unkown' } {
    if (event.streamIds.includes(this.chatSettings.chatStreamIncoming)) return { source: 'requester' };
    if (event.streamIds.includes(this.chatSettings.chatStreamMain)) return { source: 'me' };
    return { source: 'unkown' };
  }

  async chatPost (hdsConnection: pryv.Connection, content: string): Promise<pryv.Event> {
    if (!this.hasChatFeature) throw new HDSLibError('Cannot chat with this ColleectorClient');
    const newEvent = {
      type: 'message/hds-chat-v1',
      streamIds: [this.chatSettings.chatStreamMain],
      content
    };
    return await hdsConnection.apiOne('events.create', newEvent, 'event');
  }
}
