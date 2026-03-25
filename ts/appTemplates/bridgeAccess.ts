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
  /** Whether the access was newly created (vs. reused) */
  created: boolean;
  /** Whether the access was recreated (old deleted, new created) */
  recreated: boolean;
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
      recreated: false
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
    recreated: false
  };
}

/**
 * Recreate a bridge access with updated permissions/clientData.
 * Deletes the old access and creates a new one, carrying forward previousAccessIds
 * so that events created under old accesses are still attributable.
 *
 * @param connection - Pryv connection to the user's account (personal token)
 * @param options - new access configuration
 */
export async function recreateBridgeAccess (
  connection: pryv.Connection,
  options: BridgeAccessOptions
): Promise<BridgeAccessResult> {
  const accesses = await (connection as any).apiOne('accesses.get', {}, 'accesses');
  const existing = accesses.find((a: any) => a.name === options.name);

  // Build previousAccessIds chain
  const previousAccessIds: string[] = [];
  if (existing) {
    if (existing.id) previousAccessIds.push(existing.id);
    const oldPrevIds = existing.clientData?.previousAccessIds;
    if (Array.isArray(oldPrevIds)) {
      for (const id of oldPrevIds) {
        if (!previousAccessIds.includes(id)) previousAccessIds.push(id);
      }
    }
    // Delete old access
    await (connection as any).apiOne('accesses.delete', { id: existing.id }, 'accessDeletion');
    logger.info('Deleted old bridge access for recreation', { name: options.name, oldId: existing.id });
  }

  // Merge previousAccessIds into clientData
  const clientData = {
    ...options.clientData,
    previousAccessIds: previousAccessIds.length > 0 ? previousAccessIds : undefined
  };

  const access = await (connection as any).apiOne('accesses.create', {
    name: options.name,
    permissions: options.permissions,
    clientData
  }, 'access');

  return {
    apiEndpoint: access.apiEndpoint,
    accessId: access.id,
    created: true,
    recreated: existing != null
  };
}

/**
 * Get or create a bridge access, with optional permission update detection.
 * If the access exists but permissions differ, recreates it with the new permissions
 * while preserving previousAccessIds for event attribution.
 *
 * @param connection - Pryv connection to the user's account (personal token)
 * @param options - access configuration
 * @param options.updateIfDifferent - if true, recreate when permissions differ (default: false)
 */
export async function ensureBridgeAccess (
  connection: pryv.Connection,
  options: BridgeAccessOptions & { updateIfDifferent?: boolean }
): Promise<BridgeAccessResult> {
  const accesses = await (connection as any).apiOne('accesses.get', {}, 'accesses');
  const existing = accesses.find((a: any) => a.name === options.name);

  if (existing) {
    // Check if permissions match
    if (options.updateIfDifferent && !permissionsMatch(existing.permissions, options.permissions)) {
      logger.info('Bridge access permissions differ, recreating', { name: options.name });
      // Can't re-fetch — pass existing directly to avoid double API call
      return await _recreateFromExisting(connection, existing, options);
    }
    return {
      apiEndpoint: existing.apiEndpoint,
      accessId: existing.id,
      created: false,
      recreated: false
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
    recreated: false
  };
}

/** @private recreate from an already-fetched existing access */
async function _recreateFromExisting (
  connection: pryv.Connection,
  existing: any,
  options: BridgeAccessOptions
): Promise<BridgeAccessResult> {
  const previousAccessIds: string[] = [];
  if (existing.id) previousAccessIds.push(existing.id);
  const oldPrevIds = existing.clientData?.previousAccessIds;
  if (Array.isArray(oldPrevIds)) {
    for (const id of oldPrevIds) {
      if (!previousAccessIds.includes(id)) previousAccessIds.push(id);
    }
  }

  await (connection as any).apiOne('accesses.delete', { id: existing.id }, 'accessDeletion');

  const clientData = {
    ...options.clientData,
    previousAccessIds: previousAccessIds.length > 0 ? previousAccessIds : undefined
  };

  const access = await (connection as any).apiOne('accesses.create', {
    name: options.name,
    permissions: options.permissions,
    clientData
  }, 'access');

  return {
    apiEndpoint: access.apiEndpoint,
    accessId: access.id,
    created: true,
    recreated: true
  };
}

/** Compare two permission arrays (order-independent) */
function permissionsMatch (a: any[], b: Permission[]): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const normalize = (p: any) => `${p.streamId || ''}:${p.level || ''}:${p.feature || ''}:${p.setting || ''}`;
  const setA = new Set(a.map(normalize));
  const setB = new Set(b.map(normalize));
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}
