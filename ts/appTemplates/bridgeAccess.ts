import { pryv } from '../patchedPryv.ts';
import * as logger from '../logger.ts';
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
    const updatePayload: Record<string, any> = { permissions: options.permissions };
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
