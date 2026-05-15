import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import * as logger from '../logger.ts';
import { CmcCollector, type CmcRequestParams, type CmcRequestResult } from './CmcCollector.ts';
import type { Permission } from './interfaces.ts';

/**
 * Bridge-side CMC primitive (Plan 59 Phase 4c).
 *
 * A bridge IS a doctor/requester from CMC's perspective: it has its own
 * Pryv account, writes `consent/request-cmc` events, and shares the
 * resulting `capabilityUrl` with the patient via the bridge's existing
 * out-of-band channel (email, partner-system push, doctor-driven invite).
 *
 * What CmcBridgeAccess adds over a bare CmcCollector:
 *   - `bridgeId` mapped 1:1 to `collectorId` (deterministic per bridge).
 *   - `getPendingAccepts()` — read the bridge's `:_cmc:inbox` and surface
 *     each accept's data-grant apiEndpoint (the bridge then opens that
 *     endpoint to read patient data).
 *   - `requestScopeChange()` — propose a permission change to a patient
 *     via `consent/scope-request-cmc`. Patient applies via
 *     `CmcCollectorClient.applyScopeUpdate`.
 *
 * Replaces the legacy `bridgeAccess` helper (Plan 27 / Plan 58 Phase 4b
 * delete-then-create / accesses.update flows) for new patient relationships.
 * Existing legacy bridgeAccess relationships migrate via Phase 9 cutover.
 */

export interface CmcInboxAcceptEntry {
  /** Event id of the accept on the bridge's `:_cmc:inbox`. */
  eventId: string;
  /** Created timestamp. */
  created: number;
  /** Patient who accepted. */
  peer: { username: string; host: string };
  /** apiEndpoint of the data-grant access on the patient's account. */
  dataGrantApiEndpoint: string;
  /** Plugin-stamped reference to the requester-side request event. */
  requesterEventId?: string;
  /** Full event for caller inspection. */
  raw: pryv.Event;
}

export interface CmcScopeChangeParams {
  /** id of the data-grant access on the patient's side. */
  accessId: string;
  /** Counterparty (the patient). */
  counterparty: { username: string; host: string };
  /** Proposed new permissions list. Patient sees this and decides whether to apply. */
  newPermissions: Permission[];
  /** Optional per-locale rationale shown to the patient. */
  rationale?: { [locale: string]: string };
}

export class CmcBridgeAccess {
  /** Composed primitive — public so callers can tap raw CmcCollector methods if needed. */
  collector: CmcCollector;
  bridgeId: string;
  connection: pryv.Connection;

  constructor (connection: pryv.Connection, bridgeId: string) {
    if (!bridgeId || typeof bridgeId !== 'string') {
      throw new HDSLibError('CmcBridgeAccess: bridgeId required');
    }
    this.connection = connection;
    this.bridgeId = bridgeId;
    this.collector = new CmcCollector(connection, bridgeId);
  }

  /** Convenience getter — same as `collector.collectorStreamId`. */
  get bridgeStreamId (): string {
    return this.collector.collectorStreamId;
  }

  /**
   * Create a per-patient consent request. Returns `eventId` + `capabilityUrl`.
   * The bridge sends the URL to the patient via its existing channel.
   */
  async createPatientRequest (params: CmcRequestParams): Promise<CmcRequestResult> {
    return this.collector.createRequest(params);
  }

  /**
   * Read the bridge's `:_cmc:inbox` and surface each pending accept.
   * Each entry carries the data-grant apiEndpoint the bridge can open to
   * read that patient's data.
   *
   * The plugin posts `consent/accept-cmc` events here when patients accept;
   * the bridge consumes them. Idempotent — caller can re-poll without harm.
   */
  async getPendingAccepts (limit: number = 200): Promise<CmcInboxAcceptEntry[]> {
    const res = await this.connection.api([{
      method: 'events.get',
      params: { streams: [pryv.cmc.NS_INBOX], types: [pryv.cmc.ET_ACCEPT], limit }
    }]);
    const events: pryv.Event[] = (res?.[0] as any)?.events ?? [];
    return events.map((e: any) => ({
      eventId: e.id,
      created: e.created,
      peer: e.content?.from ?? { username: '', host: '' },
      dataGrantApiEndpoint: e.content?.grantedAccess?.apiEndpoint ?? '',
      requesterEventId: e.content?.requesterEventId,
      raw: e
    })).filter((entry) => entry.dataGrantApiEndpoint !== '');
  }

  /**
   * Propose a permission change to a patient via `consent/scope-request-cmc`.
   * The plugin propagates to the patient's collectors stream; the patient
   * applies via `CmcCollectorClient.applyScopeUpdate`.
   *
   * IMPORTANT: `newPermissions` REPLACES the patient's existing perms set
   * (server is not merge-style, see Phase 3 SessionState observation).
   * Caller must include CMC machinery streams in the payload.
   */
  async requestScopeChange (params: CmcScopeChangeParams): Promise<void> {
    if (!params?.accessId) throw new HDSLibError('requestScopeChange: accessId required');
    if (!params?.counterparty?.username || !params?.counterparty?.host) {
      throw new HDSLibError('requestScopeChange: counterparty.{username,host} required');
    }
    if (!Array.isArray(params?.newPermissions)) {
      throw new HDSLibError('requestScopeChange: newPermissions[] required');
    }

    // Compute the bridge's collectors anchor stream for this peer (auto-provisioned by the plugin).
    const peerSlug = pryv.cmc.counterpartySlug(params.counterparty);
    const collectorStreamId = pryv.cmc.collectorStreamUnder(this.bridgeStreamId, peerSlug);

    const res = await this.connection.api([{
      method: 'events.create',
      params: {
        streamIds: [collectorStreamId],
        type: pryv.cmc.ET_SYSTEM_SCOPE_REQUEST,
        content: {
          accessId: params.accessId,
          newPermissions: params.newPermissions,
          rationale: params.rationale
        }
      }
    }]);
    const err = (res?.[0] as any)?.error;
    if (err != null) {
      logger.error('CmcBridgeAccess.requestScopeChange failed', err);
      throw new HDSLibError('requestScopeChange failed: ' + JSON.stringify(err));
    }
  }

  /**
   * Revoke a specific patient relationship. Pass-through to CmcCollector.revoke.
   */
  async revokePatient (params: { accessId: string; counterparty: { username: string; host: string }; reason?: { [locale: string]: string } }): Promise<void> {
    return this.collector.revoke(params);
  }
}
