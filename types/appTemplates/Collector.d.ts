import pryv = require('pryv');
import type AppManagingAccount from './AppManagingAccount';
import CollectorInvite = require('./CollectorInvite');
import { CollectorRequest } from '../../src/appTemplates/CollectorRequest';
export = Collector;
/**
 * Collector is used by AppManagingAccount
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 */
declare class Collector {
  static STREAMID_SUFFIXES: {
        archive: string;
        internal: string;
        public: string;
        pending: string;
        inbox: string;
        active: string;
        error: string;
    };

  static STATUSES: Readonly<{
        draft: 'draft';
        active: 'active';
        deactivated: 'deactivated';
    }>;

  /**
     * @param {AppManagingAccount} appManaging
     * @param {Pryv.Stream} streamData
     */
  constructor(appManaging: AppManagingAccount, streamData: pryv.Stream);
  appManaging: AppManagingAccount;
  streamId: string;
  name: string;
  /**
     * @property {string} id - shortcut for steamid
     */
  get id(): string;
  /**
     * Payload that can be modified
     */
  request: CollectorRequest;
  /**
     * @property {string} one of 'draft', 'active', 'deactivated'
     */
  get statusCode(): string;
  /**
     * Fetch online data
     */
  init(forceRefresh?: boolean): Promise<void>;
  save(): Promise<pryv.Event>;
  publish(): Promise<pryv.Event>;
  /**
     * Retrieve an invite by its key
     */
  getInviteByKey(key: string): Promise<CollectorInvite>;
  /**
     * Retreive all invites
     * @param {boolean} [forceRefresh]
     * @returns {Array<CollectorInvite>}
     */
  getInvites(forceRefresh?: boolean): Promise<CollectorInvite[]>;
  checkInbox(): Promise<CollectorInvite[]>;
  /**
     * Create a "pending" invite to be sent to an app using AppSharingAccount
     * @param {string} name a default display name for this request
     * @param {Object} [options]
     * @param {Object} [options.customData] any data to be used by the client app
     */
  createInvite(name: string, options?: {
        customData?: any;
    }): Promise<CollectorInvite>;

  /**
     * Get sharing api endpoint
     */
  sharingApiEndpoint(): Promise<string>;
  /**
     * @private
     * @param {CollectorInvite} invite
     * @returns {CollectorInvite}
     */
  private revokeInvite(): Promise<CollectorInvite>;
  /**
     * check if required streams are present, if not create them
     */
  checkStreamStructure(): Promise<{
        created: pryv.Stream[];
        errors?: any[];
    }>;

  /**
     * @param {string} suffix
     */
  streamIdFor(suffix: string): string;
  /**
     * Invite Status for streamId
     * reverse of streamIdFor
     */
  inviteStatusForStreamId(streamId: string): string;
  #private;
}
