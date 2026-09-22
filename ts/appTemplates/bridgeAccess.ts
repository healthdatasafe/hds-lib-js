import { pryv } from '../patchedPryv.ts';
import * as logger from '../logger.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import type { Permission } from './interfaces.ts';

export interface BridgeAccessOptions {
  /** Access name — used to lookup existing access (e.g. 'bridge-mira') */
  name: string;
  /** Permissions for the access */
  permissions: Permission[];
  /** clientData to store (appStreamId, etc.) */
  clientData?: Record<string, any>;
}

export interface BridgeAccessResult {
  apiEndpoint: string;
  accessId: string;
  /** Whether the access was newly created (vs. reused/updated) */
  created: boolean;
  /** Whether an existing access was updated in place via accesses.update */
  updated: boolean;
}

/**
 * Get or create a bridge access on a user's account.
 * Looks up by name; if found, returns existing. If not, creates new.
 *
 * @param connection - Pryv connection to the user's account (personal token)
 * @param options - access configuration
 */
export async function getOrCreateBridgeAccess (
  connection: pryv.Connection,
  options: BridgeAccessOptions
): Promise<BridgeAccessResult> {
  const accesses = await (connection as any).apiOne('accesses.get', {}, 'accesses');
  const existing = accesses.find((a: any) => a.name === options.name);

  if (existing) {
    return {
      apiEndpoint: existing.apiEndpoint,
      accessId: existing.id,
      created: false,
      updated: false
    };
  }

  // Build the model's stream hierarchy BEFORE minting the access.
  //
  // Pryv's `accesses.create` auto-creates any stream named by a permission's
  // `defaultName` — but FLAT, at root. So on an account that does not already have
  // the tree, a permission on `body-temperature-basal` yielded a root-level stream
  // instead of `body > body-temperature > body-temperature-basal`. The bridge cannot
  // repair it afterwards: its scoped access is `forbidden` from creating the model
  // parents, which is why bridge-tempdrop logged exactly that and carried on.
  //
  // The comment in bridge-tempdrop's ensureBaseStreams assumed "the webapp provisions
  // [the parents] when it mints the access". Nothing did — this is now the code that
  // makes that true, and it fixes every bridge, not just Tempdrop.
  //
  // Best-effort by design: a model that is not loaded, or a stream the model does not
  // know (a bridge's own home stream such as `bridge-tempdrop`), must not block the
  // connect. Those keep the existing flat-at-root behaviour, which is correct for them.
  await ensureModelStreamHierarchy(connection, options.permissions);

  const access = await (connection as any).apiOne('accesses.create', {
    name: options.name,
    permissions: options.permissions,
    clientData: options.clientData || {}
  }, 'access');

  return {
    apiEndpoint: access.apiEndpoint,
    accessId: access.id,
    created: true,
    updated: false
  };
}

/**
 * Create the model-defined parent chain for every permission streamId the model
 * knows about, root-first, on the user's own (personal) connection.
 *
 * Idempotent: `item-already-exists` is the normal result on an account that already
 * has the tree. Never throws — see the rationale at the call site.
 */
async function ensureModelStreamHierarchy (
  connection: pryv.Connection,
  permissions: Permission[]
): Promise<void> {
  let toCreate: Array<{ id: string; parentId: string | null; name?: string }> = [];
  try {
    const modelStreams = getModel().streams;
    const seen = new Set<string>();
    for (const permission of permissions) {
      const streamId = (permission as any).streamId;
      if (typeof streamId !== 'string') continue;
      // Not a model stream (e.g. a bridge's own home stream) — leave it to defaultName.
      if (modelStreams.getDataById(streamId, false) == null) continue;
      // getParentsIds `unshift`s, so the chain is ALREADY root-first:
      // ['body', 'body-temperature', 'body-temperature-basal']. Iterate forward — a
      // parent must exist before its child, because `streams.create` calls in one
      // batch do not see each other and a forward reference fails
      // `unknown-referenced-resource`. (getNecessaryListForItems walks this backwards
      // only so it can `break` early on a known stream, and reverses afterwards.)
      const chain = modelStreams.getParentsIds(streamId, false, [streamId]);
      for (const id of chain) {
        if (seen.has(id)) continue;
        seen.add(id);
        const data = modelStreams.getDataById(id, false);
        if (data == null) continue;
        toCreate.push({ id, parentId: data.parentId ?? null, name: data.name });
      }
    }
  } catch (e: any) {
    logger.warn(`getOrCreateBridgeAccess: could not resolve model streams, falling back to defaultName: ${e?.message ?? e}`);
    toCreate = [];
  }
  if (toCreate.length === 0) return;

  try {
    const results: any[] = await (connection as any).api(
      toCreate.map((s) => ({ method: 'streams.create', params: s }))
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r?.stream != null) continue;
      if (r?.error?.id === 'item-already-exists') continue;
      logger.warn(`getOrCreateBridgeAccess: could not create stream ${toCreate[i]?.id}: ${r?.error?.id ?? 'unknown'}`);
    }
  } catch (e: any) {
    logger.warn(`getOrCreateBridgeAccess: stream hierarchy creation failed: ${e?.message ?? e}`);
  }
}

/**
 * Get or create a bridge access, with optional permission update detection.
 *
 * If the access exists and `updateIfDifferent` is set and permissions differ,
 * updates it in place via `accesses.update` (Plan 66). The access id becomes
 * composite (`<base>:<serial>`) but the token and apiEndpoint are preserved.
 *
 * Server-side `clientData` merge means any pre-existing keys on the access
 * (notably `previousAccessIds` from the legacy delete+create era) are
 * preserved automatically — we only send the keys we want to set.
 *
 * `StaleAccessIdError` handling: if another writer updates the access between
 * our `accesses.get` and our `accesses.update`, we refetch + retry once.
 * Two consecutive stale errors propagate.
 *
 * @param connection - Pryv connection to the user's account (personal token)
 * @param options - access configuration
 * @param options.updateIfDifferent - if true, update permissions in place when they differ (default: false)
 */
export async function ensureBridgeAccess (
  connection: pryv.Connection,
  options: BridgeAccessOptions & { updateIfDifferent?: boolean }
): Promise<BridgeAccessResult> {
  let attempt = 0;
  while (true) {
    const accesses = await (connection as any).apiOne('accesses.get', {}, 'accesses');
    const existing = accesses.find((a: any) => a.name === options.name);

    if (!existing) {
      // Same reason as in getOrCreateBridgeAccess: build the model hierarchy before
      // `accesses.create`, or `defaultName` creates the streams flat at root.
      await ensureModelStreamHierarchy(connection, options.permissions);
      const access = await (connection as any).apiOne('accesses.create', {
        name: options.name,
        permissions: options.permissions,
        clientData: options.clientData || {}
      }, 'access');
      return {
        apiEndpoint: access.apiEndpoint,
        accessId: access.id,
        created: true,
        updated: false
      };
    }

    if (!options.updateIfDifferent || permissionsMatch(existing.permissions, options.permissions)) {
      return {
        apiEndpoint: existing.apiEndpoint,
        accessId: existing.id,
        created: false,
        updated: false
      };
    }

    // Update in place. Server merges clientData; we only send our new keys.
    // accesses.update's permissions schema is strict (rejects defaultName / name);
    // strip to canonical {streamId,level} | {feature,setting} regardless of caller input.
    const cleanedPermissions = options.permissions.map((p: any) => {
      if (p.streamId) return { streamId: p.streamId, level: p.level };
      if (p.feature) return { feature: p.feature, setting: p.setting };
      return p;
    });
    const updatePayload: Record<string, any> = { permissions: cleanedPermissions };
    if (options.clientData != null) updatePayload.clientData = options.clientData;

    try {
      logger.info('Bridge access permissions differ, updating', { name: options.name, id: existing.id });
      const updated = await (connection as any).updateAccess(existing.id, updatePayload);
      return {
        apiEndpoint: updated.apiEndpoint,
        accessId: updated.id,
        created: false,
        updated: true
      };
    } catch (e: any) {
      if (e instanceof (pryv as any).StaleAccessIdError && attempt === 0) {
        attempt++;
        logger.info('Bridge access stale on update, refetching and retrying once', { name: options.name });
        continue;
      }
      throw e;
    }
  }
}

/** Compare two permission arrays (order-independent) */
function permissionsMatch (a: any[], b: Permission[]): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const normalize = (p: any): string => `${p.streamId || ''}:${p.level || ''}:${p.feature || ''}:${p.setting || ''}`;
  const setA = new Set(a.map(normalize));
  const setB = new Set(b.map(normalize));
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}
