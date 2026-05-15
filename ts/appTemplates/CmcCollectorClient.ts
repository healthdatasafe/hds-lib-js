import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import * as logger from '../logger.ts';
import type { Permission } from './interfaces.ts';

/**
 * Patient-side primitive for an accepted CMC consent.
 *
 * Wraps the patient's Pryv connection plus the data-grant access that
 * resulted from accepting a `capabilityUrl`. Provides:
 *   - `acceptCapability` (static) — accept an out-of-band capabilityUrl, get
 *     a discriminated outcome (Plan 56 inheritance — created / already-active
 *     / refused / revoked / unknown-capability / stale-capability).
 *   - `refuseCapability` (static) — write `consent/refuse-cmc` against an
 *     unaccepted capability.
 *   - `applyScopeUpdate` — accept a scope-change request via Plan 66
 *     `accesses.update` semantics (`consent/scope-update-cmc`).
 *   - `revoke` — tear down the access pair from the patient side.
 *
 * Replaces `CollectorClient` accepter side (Plan 59 Phase 4b).
 */

const HDS_APP_CODE = 'hds-collector';
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30_000;
const HANDSHAKE_POLL_INTERVAL_MS = 500;

/**
 * Discriminated outcome of `acceptCapability`. Inherits the per-outcome
 * UX requirements from plan 56.
 */
export type CmcAcceptOutcome =
  | { kind: 'created'; client: CmcCollectorClient }
  | { kind: 'already-active'; client: CmcCollectorClient }
  | { kind: 'refused'; reason?: string }
  | { kind: 'revoked'; reason?: string }
  | { kind: 'unknown-capability'; serverError?: any }
  | { kind: 'stale-capability'; serverError?: any }
  | { kind: 'error'; serverError: any };

export interface CmcAcceptOptions {
  /** Human-readable name for the resulting data-grant access on the patient's account. */
  accessName?: string;
  /** Override the default 30s handshake wait. */
  handshakeTimeoutMs?: number;
}

export interface CmcRefuseOptions {
  reason?: { [locale: string]: string };
}

export interface CmcScopeUpdateParams {
  /** New permissions list to apply (REPLACES existing — caller must include CMC machinery streams). */
  newPermissions: Permission[];
  /** Optional human-readable note. */
  note?: { [locale: string]: string };
}

export class CmcCollectorClient {
  static APP_CODE = HDS_APP_CODE;

  /** Patient's Pryv connection. */
  connection: pryv.Connection;
  /** ID of the data-grant access (lives on the patient's account). */
  accessId: string;
  /** The accept event written on the patient's side (null if reconstructed via fromAccessId). */
  acceptEvent: pryv.Event | null;
  /** The full data-grant access record. */
  accessData: pryv.Access;

  /** `:_cmc:apps:hds-collector` */
  get appScope (): string {
    return pryv.cmc.appScope(HDS_APP_CODE);
  }

  /** Requester `{username, host}` — read directly from clientData.cmc.counterparty. */
  get peer (): { username: string; host: string } | null {
    const cp = this.accessData?.clientData?.cmc?.counterparty;
    if (cp?.username && cp?.host) return { username: cp.username, host: cp.host };
    return null;
  }

  /**
   * Per-collector scope on the requester's side. Derived from the data-grant's
   * `clientData.cmc.counterparty.remoteChatStreamId` (which is the *requester's*
   * chat stream id and embeds the *accepter's* slug — we strip back to the scope).
   */
  get collectorScopeStreamId (): string | null {
    const remoteChat = this.accessData?.clientData?.cmc?.counterparty?.remoteChatStreamId;
    if (typeof remoteChat !== 'string') return null;
    return pryv.cmc.parseChatStreamId(remoteChat).scopeStreamId;
  }

  /** Slug of the patient on the requester's side (= our own slug). */
  get accepterSlug (): string | null {
    const remoteChat = this.accessData?.clientData?.cmc?.counterparty?.remoteChatStreamId;
    if (typeof remoteChat !== 'string') return null;
    return pryv.cmc.parseChatStreamId(remoteChat).counterpartySlug;
  }

  /** Slug of the requester (= peer slug, computed from peer username + host). */
  get peerSlug (): string | null {
    const peer = this.peer;
    if (peer == null) return null;
    return pryv.cmc.counterpartySlug(peer);
  }

  /** Patient's chats stream id for this peer (auto-provisioned by plugin). */
  get chatStreamId (): string | null {
    const scope = this.collectorScopeStreamId;
    const slug = this.peerSlug;
    if (!scope || !slug) return null;
    return pryv.cmc.chatStreamUnder(scope, slug);
  }

  /** Patient's collectors stream id for this peer (auto-provisioned by plugin). */
  get collectorStreamId (): string | null {
    const scope = this.collectorScopeStreamId;
    const slug = this.peerSlug;
    if (!scope || !slug) return null;
    return pryv.cmc.collectorStreamUnder(scope, slug);
  }

  constructor (connection: pryv.Connection, acceptEvent: pryv.Event | null, accessData: pryv.Access) {
    if (connection == null) throw new HDSLibError('CmcCollectorClient: connection required');
    if (accessData?.id == null) throw new HDSLibError('CmcCollectorClient: accessData.id required');
    this.connection = connection;
    this.acceptEvent = acceptEvent;
    this.accessData = accessData;
    this.accessId = accessData.id;
  }

  /**
   * Accept an out-of-band capability URL. The plugin reads the offer via
   * the URL, mints a data-grant access on the patient's account, and posts
   * back to the requester's `:_cmc:inbox`.
   *
   * Returns a discriminated outcome — caller branches per-kind for UX
   * (Plan 56 inheritance).
   */
  static async acceptCapability (
    connection: pryv.Connection,
    capabilityUrl: string,
    opts: CmcAcceptOptions = {}
  ): Promise<CmcAcceptOutcome> {
    if (!connection) throw new HDSLibError('acceptCapability: connection required');
    if (!capabilityUrl || typeof capabilityUrl !== 'string') {
      throw new HDSLibError('acceptCapability: capabilityUrl required');
    }
    const accessName = opts.accessName ?? ('hds-collector-grant-' + Date.now());
    const timeoutMs = opts.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

    // Ensure the appScope stream exists on the patient's side (idempotent).
    const appScope = pryv.cmc.appScope(HDS_APP_CODE);
    await connection.api([{
      method: 'streams.create',
      params: { id: appScope, parentId: ':_cmc:apps', name: HDS_APP_CODE }
    }]).catch(() => undefined); // ignore item-already-exists

    const acceptRes = await connection.api([{
      method: 'events.create',
      params: {
        streamIds: [appScope],
        type: pryv.cmc.ET_ACCEPT,
        content: { capabilityUrl, accessName }
      }
    }]);
    const errEv = (acceptRes?.[0] as any)?.error;
    if (errEv != null) {
      const kind = mapAcceptErrorToOutcomeKind(errEv);
      logger.error('CmcCollectorClient.acceptCapability rejected by plugin', errEv);
      if (kind === 'unknown-capability' || kind === 'stale-capability') {
        return { kind, serverError: errEv };
      }
      if (kind === 'refused' || kind === 'revoked') {
        return { kind } as CmcAcceptOutcome;
      }
      return { kind: 'error', serverError: errEv };
    }
    const acceptEvent = (acceptRes?.[0] as any)?.event;
    if (acceptEvent == null) {
      throw new HDSLibError('CmcCollectorClient.acceptCapability: no event returned');
    }

    // Wait for the plugin to materialise the data-grant access on this side.
    // We disambiguate by the unique `accessName` we set on the accept event;
    // the plugin reuses it on the resulting access.
    const accessData = await waitForDataGrantAccess(connection, accessName, timeoutMs);
    if (accessData == null) {
      // Plugin accepted the event syntactically but the dispatch (capability
      // resolution + access mint) didn't complete in the timeout window.
      // Most common cause: capability URL doesn't resolve (unknown / stale).
      logger.error('CmcCollectorClient.acceptCapability: handshake did not complete within ' + timeoutMs + 'ms');
      return { kind: 'error', serverError: { reason: 'handshake-timeout', acceptEventId: acceptEvent.id, timeoutMs } };
    }

    const client = new CmcCollectorClient(connection, acceptEvent, accessData);
    return { kind: 'created', client };
  }

  /**
   * Reload an existing client by its data-grant access id.
   *
   * NOTE: The accept event is not strictly recoverable from the access
   * record (no back-pointer in the plugin's clientData annotations).
   * We do a best-effort match by `appScope` + `accessName`; if no event
   * is found, returns a client with `acceptEvent == null` (downstream
   * code should tolerate this when reconstructing from existing state).
   */
  static async fromAccessId (connection: pryv.Connection, accessId: string): Promise<CmcCollectorClient> {
    if (!accessId) throw new HDSLibError('fromAccessId: accessId required');
    const res = await connection.api([{ method: 'accesses.get', params: { includeDeletions: false } }]);
    const accesses = (res?.[0] as any)?.accesses ?? [];
    const access = accesses.find((a: any) => a.id === accessId);
    if (access == null) throw new HDSLibError('fromAccessId: access not found ' + accessId);
    if (access.clientData?.cmc?.role !== 'counterparty') {
      throw new HDSLibError('fromAccessId: access ' + accessId + ' is not a CMC data-grant');
    }

    // Best-effort lookup of the accept event via accessName match on the appScope stream.
    const appScope = pryv.cmc.appScope(HDS_APP_CODE);
    const evRes = await connection.api([{
      method: 'events.get',
      params: { streams: [appScope], types: [pryv.cmc.ET_ACCEPT], limit: 200 }
    }]);
    const events = (evRes?.[0] as any)?.events ?? [];
    const acceptEvent = events.find((e: any) => e?.content?.accessName === access.name) ?? null;

    return new CmcCollectorClient(connection, acceptEvent, access);
  }

  /**
   * Refuse an out-of-band capability URL without minting an access.
   */
  static async refuseCapability (
    connection: pryv.Connection,
    capabilityUrl: string,
    opts: CmcRefuseOptions = {}
  ): Promise<void> {
    if (!capabilityUrl) throw new HDSLibError('refuseCapability: capabilityUrl required');
    const appScope = pryv.cmc.appScope(HDS_APP_CODE);
    await connection.api([{
      method: 'streams.create',
      params: { id: appScope, parentId: ':_cmc:apps', name: HDS_APP_CODE }
    }]).catch(() => undefined);

    const res = await connection.api([{
      method: 'events.create',
      params: {
        streamIds: [appScope],
        type: pryv.cmc.ET_REFUSE,
        content: { capabilityUrl, reason: opts.reason ?? { en: 'declined' } }
      }
    }]);
    const err = (res?.[0] as any)?.error;
    if (err != null) throw new HDSLibError('refuseCapability failed: ' + JSON.stringify(err));
  }

  /**
   * Revoke this access pair from the patient side. Plugin tears down the
   * data-grant + back-channel on both sides.
   */
  async revoke (reason?: { [locale: string]: string }): Promise<void> {
    if (this.peer == null) throw new HDSLibError('revoke: peer info missing on accessData');
    const res = await this.connection.api([{
      method: 'events.create',
      params: {
        streamIds: [this.appScope],
        type: pryv.cmc.ET_REVOKE,
        content: {
          accessId: this.accessId,
          counterparty: this.peer,
          reason: reason ?? { en: 'revoked by accepter' }
        }
      }
    }]);
    const err = (res?.[0] as any)?.error;
    if (err != null) throw new HDSLibError('revoke failed: ' + JSON.stringify(err));
  }

  /**
   * Apply a scope update (consent/scope-update-cmc) — the patient widens or
   * narrows the data-grant via Plan 66 `accesses.update` semantics.
   *
   * IMPORTANT: `newPermissions` REPLACES the existing perms set (server is
   * not merge-style). Caller must include the CMC machinery streams
   * (`:_cmc:inbox`, `:_cmc:apps:*:chats:*`, `:_cmc:apps:*:collectors:*`)
   * in the new payload or the chat/collectors channels break.
   */
  async applyScopeUpdate (params: CmcScopeUpdateParams): Promise<void> {
    if (!Array.isArray(params?.newPermissions)) {
      throw new HDSLibError('applyScopeUpdate: newPermissions[] required');
    }
    const collectorStreamId = this.collectorStreamId;
    if (collectorStreamId == null) {
      throw new HDSLibError('applyScopeUpdate: collector anchor stream missing');
    }
    const res = await this.connection.api([{
      method: 'events.create',
      params: {
        streamIds: [collectorStreamId],
        type: pryv.cmc.ET_SYSTEM_SCOPE_UPDATE,
        content: {
          accessId: this.accessId,
          newPermissions: params.newPermissions,
          note: params.note
        }
      }
    }]);
    const err = (res?.[0] as any)?.error;
    if (err != null) throw new HDSLibError('applyScopeUpdate failed: ' + JSON.stringify(err));
  }
}

/**
 * Map a plugin-returned error to a CmcAcceptOutcome kind. Best-effort
 * categorisation; falls back to 'error' for unrecognised shapes.
 *
 * Refined as Phase 5 consumer integration surfaces concrete error codes.
 */
function mapAcceptErrorToOutcomeKind (err: any): CmcAcceptOutcome['kind'] {
  const id = err?.id;
  const msg = (err?.message ?? '').toLowerCase();
  if (id === 'unknown-resource' || msg.includes('unknown capability')) return 'unknown-capability';
  if (id === 'forbidden' && msg.includes('expired')) return 'stale-capability';
  if (msg.includes('refused')) return 'refused';
  if (msg.includes('revoked')) return 'revoked';
  return 'error';
}

/**
 * Poll the patient's `accesses.get` until the data-grant with our chosen
 * `accessName` materialises AND the back-channel handshake has populated
 * `clientData.cmc.counterparty.remoteChatStreamId` (without it the chat /
 * collectors stream getters can't resolve).
 *
 * Two-phase wait reflects the plugin's two-phase work:
 *   1. handleAccept mints the data-grant (clientData.cmc.role='counterparty').
 *   2. handleIncomingBackChannel populates counterparty.remoteChatStreamId
 *      (and remoteCollectorStreamId).
 */
async function waitForDataGrantAccess (
  connection: pryv.Connection,
  accessName: string,
  timeoutMs: number
): Promise<pryv.Access | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const res = await connection.api([{ method: 'accesses.get', params: { includeDeletions: false } }]);
    const accesses = (res?.[0] as any)?.accesses ?? [];
    const found = accesses.find((a: any) =>
      a?.name === accessName &&
      a?.clientData?.cmc?.role === 'counterparty' &&
      typeof a?.clientData?.cmc?.counterparty?.remoteChatStreamId === 'string');
    if (found != null) return found;
    await sleep(HANDSHAKE_POLL_INTERVAL_MS);
  }
  return null;
}

function sleep (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
