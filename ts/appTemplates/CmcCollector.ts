import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import * as logger from '../logger.ts';
import type { Permission } from './interfaces.ts';

/**
 * Doctor-side primitive for a CMC consent request.
 *
 * One CmcCollector wraps a doctor's Pryv connection plus a logical
 * collectorId (e.g. a study, practice, cohort identifier). All consent
 * requests for that collector live under the deterministic stream path
 * `:_cmc:apps:hds-collector:<collectorId>`.
 *
 * Replaces the writer side of `CollectorRequest` (Plan 59 Phase 4a).
 * Use `CmcCollectorClient` on the patient side and `Contact.fromCmcConsentEvents`
 * to read the resulting state back.
 */

const HDS_APP_CODE = 'hds-collector';
const DEFAULT_CAPABILITY_TIMEOUT_MS = 15_000;
const CAPABILITY_POLL_INTERVAL_MS = 500;

export interface CmcRequestParams {
  /** Per-locale title shown to the patient at accept-time. */
  title: { [locale: string]: string };
  /** Per-locale description. */
  description: { [locale: string]: string };
  /** Per-locale consent text the patient agrees to. */
  consent: { [locale: string]: string };
  /** Permissions the resulting data-grant access will carry on the patient's account. */
  permissions: Permission[];
  /** Optional metadata about the requester (carried on the offer event). */
  requesterMeta?: { [key: string]: any };
  /** If set, target a specific peer; if null, the capability URL is open. */
  to?: { username: string; host: string } | null;
  /** Override the default 15s capability-stamping wait. */
  capabilityTimeoutMs?: number;
}

export interface CmcRequestResult {
  /** Pryv event id of the consent/request-cmc trigger event. */
  eventId: string;
  /** Capability URL minted by the plugin — share with the patient out-of-band. */
  capabilityUrl: string;
}

export interface CmcRevokeParams {
  /** Required by the CMC plugin schema: id of the data-grant access being revoked. */
  accessId: string;
  /** Required: the peer being revoked. */
  counterparty: { username: string; host: string };
  /** Optional per-locale reason carried on the revoke event. */
  reason?: { [locale: string]: string };
}

export class CmcCollector {
  static APP_CODE = HDS_APP_CODE;

  connection: pryv.Connection;
  collectorId: string;

  constructor (connection: pryv.Connection, collectorId: string) {
    if (connection == null) throw new HDSLibError('CmcCollector: connection is required');
    if (!collectorId || typeof collectorId !== 'string') {
      throw new HDSLibError('CmcCollector: collectorId is required');
    }
    this.connection = connection;
    this.collectorId = collectorId;
  }

  /** `:_cmc:apps:hds-collector` */
  get appScope (): string {
    return pryv.cmc.appScope(HDS_APP_CODE);
  }

  /** `:_cmc:apps:hds-collector:<collectorId>` */
  get collectorStreamId (): string {
    return this.appScope + ':' + this.collectorId;
  }

  /**
   * Idempotently create the appScope + collector sub-stream.
   * `:_cmc:` and `:_cmc:apps:` parents lazy-provision automatically per [H§152].
   */
  async ensureStreams (collectorName?: string): Promise<void> {
    const ops: pryv.APICall[] = [
      {
        method: 'streams.create',
        params: { id: this.appScope, parentId: ':_cmc:apps', name: HDS_APP_CODE }
      },
      {
        method: 'streams.create',
        params: { id: this.collectorStreamId, parentId: this.appScope, name: collectorName ?? this.collectorId }
      }
    ];
    const res = await this.connection.api(ops);
    for (const r of res ?? []) {
      const errId = r?.error?.id;
      if (errId != null && errId !== 'item-already-exists') {
        throw new HDSLibError('CmcCollector.ensureStreams failed: ' + JSON.stringify(r.error));
      }
    }
  }

  /**
   * Create a `consent/request-cmc` event and wait for the plugin to stamp
   * `content.capabilityUrl`.
   *
   * The patient receives the capability URL out-of-band (email, link, etc.)
   * and accepts via `CmcCollectorClient.acceptCapability(url)`.
   */
  async createRequest (params: CmcRequestParams): Promise<CmcRequestResult> {
    if (!Array.isArray(params.permissions) || params.permissions.length === 0) {
      throw new HDSLibError('CmcCollector.createRequest: permissions[] required');
    }

    await this.ensureStreams();

    const createRes = await this.connection.api([{
      method: 'events.create',
      params: {
        streamIds: [this.collectorStreamId],
        type: pryv.cmc.ET_REQUEST,
        content: {
          to: params.to ?? null,
          capabilityRequested: true,
          request: {
            title: params.title,
            description: params.description,
            consent: params.consent,
            permissions: params.permissions
          },
          requesterMeta: params.requesterMeta ?? { appId: HDS_APP_CODE }
        }
      }
    }]);
    const event = createRes?.[0]?.event;
    if (event == null) {
      const err = createRes?.[0]?.error;
      throw new HDSLibError('CmcCollector.createRequest: events.create failed: ' + JSON.stringify(err));
    }

    const stamped = await this.#waitForCapabilityUrl(event.id, params.capabilityTimeoutMs ?? DEFAULT_CAPABILITY_TIMEOUT_MS);
    return { eventId: stamped.id, capabilityUrl: stamped.content.capabilityUrl };
  }

  /**
   * Read all consent lifecycle events under this collector's scope —
   * `consent/request-cmc`, `consent/accept-cmc`, `consent/refuse-cmc`,
   * `consent/revoke-cmc`. Useful for reconstructing a per-patient view.
   */
  async getConsentEvents (limit: number = 200): Promise<pryv.Event[]> {
    const res = await this.connection.api([{
      method: 'events.get',
      params: {
        streams: [this.collectorStreamId],
        types: pryv.cmc.EVENT_TYPES_LIFECYCLE.slice(),
        limit
      }
    }]);
    return res?.[0]?.events ?? [];
  }

  /**
   * Write a `consent/revoke-cmc` event for a specific peer. Plugin tears down
   * the access pair (data-grant + back-channel) on both sides.
   */
  async revoke (params: CmcRevokeParams): Promise<void> {
    if (!params?.accessId) throw new HDSLibError('CmcCollector.revoke: accessId required');
    if (!params?.counterparty?.username || !params?.counterparty?.host) {
      throw new HDSLibError('CmcCollector.revoke: counterparty.{username,host} required');
    }
    const res = await this.connection.api([{
      method: 'events.create',
      params: {
        streamIds: [this.collectorStreamId],
        type: pryv.cmc.ET_REVOKE,
        content: {
          accessId: params.accessId,
          counterparty: params.counterparty,
          reason: params.reason ?? { en: 'revoked by requester' }
        }
      }
    }]);
    const err = res?.[0]?.error;
    if (err != null) throw new HDSLibError('CmcCollector.revoke failed: ' + JSON.stringify(err));
  }

  async #waitForCapabilityUrl (eventId: string, timeoutMs: number): Promise<pryv.Event> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const res = await this.connection.api([{ method: 'events.getOne', params: { id: eventId } }]);
      const ev = (res?.[0] as any)?.event;
      if (ev?.content?.capabilityUrl != null) return ev;
      await sleep(CAPABILITY_POLL_INTERVAL_MS);
    }
    logger.error('CmcCollector: capabilityUrl not stamped within ' + timeoutMs + 'ms', { eventId });
    throw new HDSLibError('CmcCollector: capabilityUrl not stamped within ' + timeoutMs + 'ms');
  }
}

function sleep (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
