/**
 * Catalogue connectors (`bridge-<x>` entries of the app catalogue) seen from the
 * user's own account: which accesses are "the user's connection" to a connector,
 * the connector's minimal access used to start a connect, and the
 * `sync-status/connector-v1` status the user's side may have to set itself.
 *
 * Shared by the HDS webapp and the account app's `/connect`, so that both apply
 * the same rule. Everything here runs with the user's personal connection; the
 * personal token itself is never handed to a connector.
 */

import { pryv } from '../patchedPryv.ts';
import * as logger from '../logger.ts';

/** Event type of a connector's status (data-model `sync-status/connector-v1`). */
export const CONNECTOR_STATUS_TYPE = 'sync-status/connector-v1';

// ---- Matching rule ---- //

/**
 * The CMC app code a connector invites with: catalogue id `bridge-<x>` →
 * `hds-bridge-<x>`. Null for an id that is not a bridge.
 */
export function connectorCmcAppCode (catalogueId: string): string | null {
  return /^bridge-[a-z0-9-]+$/.test(catalogueId) ? 'hds-' + catalogueId : null;
}

/** The catalogue id behind a CMC app code: `hds-bridge-<x>` → `bridge-<x>`, else null. */
export function connectorIdFromCmcAppCode (appCode: string | null | undefined): string | null {
  if (typeof appCode !== 'string') return null;
  const m = /^hds-(bridge-[a-z0-9-]+)$/.exec(appCode);
  return m == null ? null : m[1];
}

/** The fields of an `accesses.get` entry this module reads. */
export interface ConnectorAccessLike {
  id?: string;
  name?: string;
  type?: string;
  deviceName?: string | null;
  token?: string;
  apiEndpoint?: string;
  created?: number;
  expires?: number | null;
  deleted?: unknown;
  permissions?: Array<{ streamId?: string; level?: string; feature?: string; setting?: string }>;
  clientData?: { cmc?: { role?: string; appCode?: string | null } | null } & Record<string, unknown>;
}

export interface ConnectorConnection {
  access: ConnectorAccessLike;
  /** `cmc`: an accepted CMC relationship (current bridges); `legacy`: a plain app access named after the connector. */
  kind: 'cmc' | 'legacy';
}

/**
 * The user's connection to catalogue entry `catalogueId`: every access, not
 * deleted and not expired, that is either
 * - a CMC counterparty access (`clientData.cmc.role === 'counterparty'`) whose
 *   `appCode` is `connectorCmcAppCode(catalogueId)`, or
 * - an `app` or `shared` access named exactly `catalogueId`: a plain-access connector's data access
 *   (bridge-tempdrop), or a bridge from before CMC. `getOrCreateBridgeAccess` / `ensureBridgeAccess` create
 *   it without a type, so the core makes it `shared`.
 *
 * Several entries are orphans of earlier double connects. Newest first.
 *
 * `appCode` is declared by the inviter: an account inviting under a bridge's
 * app code matches as that bridge. Use the result for the user's own actions on
 * those accesses (resync, revoke), not as proof of who the counterparty is.
 *
 * @param accesses the user's `accesses.get` result (personal token)
 */
export function findConnectorAccesses (
  accesses: ConnectorAccessLike[],
  catalogueId: string,
  nowSeconds: number = Date.now() / 1000
): ConnectorConnection[] {
  const appCode = connectorCmcAppCode(catalogueId);
  const found: ConnectorConnection[] = [];
  for (const access of accesses ?? []) {
    if (access == null || access.deleted != null) continue;
    if (typeof access.expires === 'number' && access.expires <= nowSeconds) continue;
    const cmc = access.clientData?.cmc;
    if (cmc?.role === 'counterparty') {
      if (appCode != null && cmc.appCode === appCode) found.push({ access, kind: 'cmc' });
    } else if ((access.type === 'app' || access.type === 'shared') && access.name === catalogueId) {
      found.push({ access, kind: 'legacy' });
    }
  }
  return found.sort((x, y) => (y.access.created ?? 0) - (x.access.created ?? 0));
}

// ---- The connector's minimal access ---- //

/**
 * Name of the connector's own access on the user's account: `<catalogue id>-connect`
 * (`bridge-mira-connect`). Not the bare id, which older flows use for an access
 * with broader rights.
 */
export function connectorAccessName (catalogueId: string): string {
  return `${catalogueId}-connect`;
}

/**
 * The `sync-status` leaf of a connector: `bridge-mira` → `sync-status-mira`. The
 * caller checks the leaf exists in the model.
 */
export function syncStatusLeafFor (catalogueId: string): string {
  return 'sync-status-' + catalogueId.replace(/^bridge-/, '');
}

interface ApiConnection {
  api: (calls: any[]) => Promise<any>;
  endpoint: string;
}

interface ApiError { id?: string; message?: string }

async function apiOne (connection: ApiConnection, method: string, params: unknown): Promise<any> {
  const [res] = await connection.api([{ method, params }]);
  if (res == null) throw new Error(`${method}: no result`);
  if (res.error) throw Object.assign(new Error(res.error.message ?? res.error.id ?? method), { id: res.error.id });
  return res;
}

function apiEndpointOf (connection: ApiConnection, access: ConnectorAccessLike): string {
  if (typeof access.apiEndpoint === 'string' && access.apiEndpoint !== '') return access.apiEndpoint;
  if (typeof access.token !== 'string' || access.token === '') throw new Error('connector access has no token');
  return pryv.utils.buildAPIEndpoint({ endpoint: connection.endpoint, token: access.token });
}

/**
 * The stream permissions of `access` as granted, minus what the core adds on its
 * own: feature entries and the two entries injected into every non-personal
 * access (`:_system:account` at `none`, `:_audit:access-<own id>` at `read`).
 */
function grantedStreamPermissions (access: ConnectorAccessLike): Array<{ streamId?: string; level?: string }> {
  return (access.permissions ?? []).filter((p) => {
    if (p == null || p.streamId == null) return false;
    if (p.streamId === ':_system:account' && p.level === 'none') return false;
    if (access.id != null && p.streamId === ':_audit:access-' + access.id && p.level === 'read') return false;
    return true;
  });
}

/**
 * Whether an existing access may stand in as the connector access: type `app`,
 * not expired, granting exactly `read` on the leaf and nothing else. Returns why
 * not, or null when it may.
 */
export function connectorAccessRefusal (access: ConnectorAccessLike, leafStreamId: string, nowSeconds: number = Date.now() / 1000): string | null {
  if (access.type !== 'app') return `type is ${String(access.type)}`;
  if (typeof access.expires === 'number' && access.expires <= nowSeconds) return 'expired';
  const perms = grantedStreamPermissions(access);
  if (perms.length !== 1 || perms[0].streamId !== leafStreamId || perms[0].level !== 'read') {
    return 'permissions are not exactly read on ' + leafStreamId + ': ' + perms.map((p) => `${p.streamId}:${p.level}`).join(', ');
  }
  return null;
}

function escapeRegExp (text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function randomHex (bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Every app access named `<base>` or `<base>-<4 hex>` with no `deviceName` (the
 * core keeps (name, type, deviceName) unique). Expired ones included, so their
 * names are not reused for a create.
 */
async function listConnectorAccesses (connection: ApiConnection, baseName: string): Promise<ConnectorAccessLike[]> {
  const res = await apiOne(connection, 'accesses.get', { includeExpired: true });
  const accesses: ConnectorAccessLike[] = res.accesses ?? [];
  const pattern = new RegExp('^' + escapeRegExp(baseName) + '(-[0-9a-f]{4})?$');
  return accesses.filter(
    (a) => a.type === 'app' && typeof a.name === 'string' && pattern.test(a.name) && (a.deviceName == null || a.deviceName === '')
  );
}

function firstExact (candidates: ConnectorAccessLike[], baseName: string, leafStreamId: string): ConnectorAccessLike | null {
  const ordered = [...candidates].sort((x, y) => Number(x.name !== baseName) - Number(y.name !== baseName));
  for (const access of ordered) {
    const refusal = connectorAccessRefusal(access, leafStreamId);
    if (refusal == null) return access;
    logger.warn(`connectors: access "${access.name}" (${access.id ?? '?'}) not reused: ${refusal}`);
  }
  return null;
}

function freeConnectorAccessName (taken: ConnectorAccessLike[], baseName: string): string {
  const names = new Set(taken.map((a) => a.name));
  if (!names.has(baseName)) return baseName;
  for (;;) {
    const name = `${baseName}-${randomHex(2)}`;
    if (!names.has(name)) return name;
  }
}

/**
 * The apiEndpoint of the connector's own access: type `app`, name
 * `<id>-connect` (`bridge-mira-connect`), exactly `read` on its `sync-status`
 * leaf. This, never the personal token, is what a first connect hands the
 * connector's hook. The leaf must exist (provision it first).
 *
 * Idempotent across retries: an existing `<id>-connect[-<4 hex>]` access granting
 * exactly that is reused. One that grants anything else, is expired or is not
 * `app` is left alone and its endpoint is sent nowhere; a new access is created
 * beside it (`<id>-connect-<4 hex>` when the bare name is taken).
 *
 * @param connection the user's personal connection
 */
export async function getOrCreateConnectorAccess (
  connection: ApiConnection,
  catalogueId: string,
  leafStreamId: string
): Promise<string> {
  const baseName = connectorAccessName(catalogueId);
  const existing = await listConnectorAccesses(connection, baseName);
  const exact = firstExact(existing, baseName, leafStreamId);
  if (exact != null) return apiEndpointOf(connection, exact);
  const create = async (name: string): Promise<string> => {
    const res = await apiOne(connection, 'accesses.create', {
      type: 'app',
      name,
      permissions: [{ streamId: leafStreamId, level: 'read' }]
    });
    return apiEndpointOf(connection, res.access ?? {});
  };
  try {
    return await create(freeConnectorAccessName(existing, baseName));
  } catch (err) {
    // A concurrent attempt took the name first: use its access if exact, else
    // create once more under a name still free.
    if ((err as ApiError).id !== 'item-already-exists') throw err;
    const now = await listConnectorAccesses(connection, baseName);
    const raced = firstExact(now, baseName, leafStreamId);
    if (raced != null) return apiEndpointOf(connection, raced);
    return await create(freeConnectorAccessName(now, baseName));
  }
}

// ---- Status: disconnected ---- //

export interface ConnectorStatusContent {
  status: 'active' | 'needs-reauth' | 'error' | 'disconnected';
  connectedAt?: number;
  lastRunAt?: number;
  lastSuccessAt?: number;
  syncedUntil?: number;
  lastError?: { class: 'auth' | 'upstream' | 'hds' | 'other'; code?: string; at: number };
}

const STATUS_VALUES = ['active', 'needs-reauth', 'error', 'disconnected'];
const ERROR_CLASSES = ['auth', 'upstream', 'hds', 'other'];
const ERROR_CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function seconds (v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined;
}

/**
 * The content after the user disconnected: `status: disconnected`, every other
 * field of the previous content carried (only the schema's fields: it is closed).
 * Same as the bridges' state machine (lib-bridge-js `nextConnectorStatus`).
 */
export function disconnectedStatusContent (previous: unknown): ConnectorStatusContent {
  const next: ConnectorStatusContent = { status: 'disconnected' };
  if (previous == null || typeof previous !== 'object') return next;
  const o = previous as Record<string, unknown>;
  if (typeof o.status !== 'string' || !STATUS_VALUES.includes(o.status)) return next;
  for (const k of ['connectedAt', 'lastRunAt', 'lastSuccessAt', 'syncedUntil'] as const) {
    const v = seconds(o[k]);
    if (v != null) next[k] = v;
  }
  const e = o.lastError as Record<string, unknown> | null | undefined;
  const at = seconds(e?.at);
  if (e != null && typeof e.class === 'string' && ERROR_CLASSES.includes(e.class) && at != null) {
    next.lastError = { class: e.class as 'auth' | 'upstream' | 'hds' | 'other', at };
    if (typeof e.code === 'string' && ERROR_CODE.test(e.code)) next.lastError.code = e.code;
  }
  return next;
}

/**
 * Set the connector's status to `disconnected` on its leaf, as the user: update
 * the latest status event in place (create one if there is none), trash any
 * duplicate left by racing writers. Run after the connector's grant is revoked,
 * this is the last word: the connector can no longer write.
 *
 * @param connection the user's personal connection
 * @returns the content written
 */
export async function markConnectorDisconnected (
  connection: ApiConnection,
  leafStreamId: string
): Promise<ConnectorStatusContent> {
  const found = await apiOne(connection, 'events.get', { streams: [leafStreamId], types: [CONNECTOR_STATUS_TYPE], limit: 10 });
  const events: Array<{ id?: string; content?: unknown }> = (found.events ?? []).filter((e: { id?: string }) => e?.id != null);
  const [latest, ...duplicates] = events;
  const content = disconnectedStatusContent(latest?.content);
  if (latest == null) {
    await apiOne(connection, 'events.create', { streamIds: [leafStreamId], type: CONNECTOR_STATUS_TYPE, content });
    return content;
  }
  await apiOne(connection, 'events.update', { id: latest.id, update: { content } });
  if (duplicates.length > 0) {
    try {
      await connection.api(duplicates.map((e) => ({ method: 'events.delete', params: { id: e.id } })));
    } catch { /* the next write tries again */ }
  }
  return content;
}
