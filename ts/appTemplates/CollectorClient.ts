import { CollectorRequest } from './CollectorRequest';
import { pryv } from '../patchedPryv';
import { HDSLibError } from '../errors';
import * as logger from '../logger';
import { CollectorSectionInterface } from './interfaces';

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

  /** @property {Object} - full content of the request */
  get requestData (): any {
    return this.eventData.content.requesterEventData.content;
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

    const responseContent = {
      apiEndpoint: this.accessData.apiEndpoint
    };

    const requesterEvent = await this.#updateRequester('accept', responseContent);
    if (requesterEvent != null) {
      await this.#updateStatus(CollectorClient.STATUSES.active);
      return { accessData: this.accessData, requesterEvent };
    }
    return null;
  }

  async revoke () {
    if (!this.accessData) {
      throw new HDSLibError('Cannot revoke if no accessData');
    }
    if (this.accessData.deleted && this.status === CollectorClient.STATUSES.deactivated) {
      throw new HDSLibError('Already revoked');
    }
    // revoke access
    await this.app.connection.apiOne('accesses.delete', { id: this.accessData.id }, 'accessDeletion');
    // lazyly flag currentAccess as deleted
    this.accessData.deleted = Date.now() / 1000;

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
    const requestrerApiEndpoint = this.eventData.content.apiEndpoint;

    // add eventId to content
    const content = Object.assign({ type, eventId: requesterEventId }, responseContent);

    // acceptEvent to be sent to requester
    const responseEvent = {
      type: 'response/collector-v1',
      streamIds: [publicStreamId],
      content
    };

    try {
      const requesterConnection = new pryv.Connection(requestrerApiEndpoint);
      const requesterEvent = await (requesterConnection as any).apiOne('events.create', responseEvent, 'event');
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
    return info.user.username + ':' + info.name;
  }

  // -------------------- sections and forms ------------- //

  getSections (): Array<CollectorSectionInterface> {
    return this.request?.sections;
  }
}
