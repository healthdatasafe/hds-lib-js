import { CollectorRequest } from './CollectorRequest';
/**
 * Collector is used by AppManagingAccount
 * A "Collector" can be seen as a "Request" and set of "Responses"
 * - Responses are authorization tokens from individuals
 */
export declare class Collector {
  #private;
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

  appManaging: any;
  streamId: string;
  name: string;
  request: CollectorRequest;
  /**
     * @param appManaging
     * @param streamData
     */
  constructor(appManaging: any, streamData: any);
  /**
     * @property {string} id - shortcut for streamId
     */
  get id(): string;
  /**
     * @property {string} one of 'draft', 'active', 'deactivated'
     */
  get statusCode(): string;
  /**
     * Fetch online data
     */
  init(forceRefresh?: boolean): Promise<void>;
  save(): Promise<any>;
  publish(): Promise<any>;
  /**
     * Retrieve an invite by its key
     */
  getInviteByKey(key: any): Promise<any>;
  /**
     * Retreive all invites
     * @param {boolean} [forceRefresh]
     * @returns {Array<CollectorInvite>}
     */
  getInvites(forceRefresh?: boolean): Promise<any[]>;
  checkInbox(): Promise<any[]>;
  /**
     * Create a "pending" invite to be sent to an app using AppSharingAccount
     * @param {string} name a default display name for this request
     * @param {Object} [options]
     * @param {Object} [options.customData] any data to be used by the client app
     */
  createInvite(name: any, options?: {}): Promise<any>;
  /**
     * Get sharing api endpoint
     */
  sharingApiEndpoint(): Promise<any>;
  /**
     * @private
     * @param {CollectorInvite} invite
     * @param {boolean} alreadyChecked // to avoid loops
     * @returns {CollectorInvite}
     */
  revokeInvite(invite: any, alreadyChecked?: boolean): Promise<any>;
  /**
     * check if required streams are present, if not create them
     */
  checkStreamStructure(): Promise<{
        created: any[];
        errors: any[];
    } | {
        created: any[];
    }>;

  /**
     * @param {string} suffix
     */
  streamIdFor(suffix: any): string;
  /**
     * Invite Status for streamId
     * reverse of streamIdFor
     */
  inviteStatusForStreamId(streamId: any): string;
}
/**
 * @typedef {CollectorRequest}
 * @property {number} version
 * @property {Localizable} description
 * @property {Localizable} consent
 * @property {Array<Permission>} permissions - Like Pryv permission request
 * @property {Object} app
 * @property {String} app.id
 * @property {String} app.url
 * @property {Object} app.data - to be finalized
 */
// # sourceMappingURL=Collector.d.ts.map
