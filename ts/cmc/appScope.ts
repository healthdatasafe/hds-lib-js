/**
 * Idempotently provision streams under `:_cmc:apps` on a CMC-enabled account.
 *
 * The CMC plugin owns the `:_cmc:apps` namespace. The per-app leaf
 * (`:_cmc:apps:<appCode>`) is auto-provisioned server-side by the
 * `cmcAccessProvisionAppScopeHook` post-hook on `accesses.create` /
 * `accesses.update`, whenever the access references a matching
 * `:_cmc:apps:<appCode>:*` permission (deployed 2026-05-26, plan-61
 * upstream fix). A caller that never went through such an access (a
 * personal token on a fresh account) finds no leaf: when the sub-scope
 * create reports its parent unknown, this helper creates the leaf under
 * `:_cmc:apps` (which user code may do) and retries (B-2026-10-26-23).
 *
 * Sub-scopes (`:_cmc:apps:<appCode>:<subPath>`) are NOT auto-provisioned
 * and still require a `streams.create` here.
 *
 * Hoisted from three independent copies that had drifted across the
 * doctor-dashboard, the Mira bridge, and an archived migration script.
 */

import { cmc, pryv } from '../patchedPryv.ts';

/** Extract a Pryv API error-code id from a thrown error, regardless of nesting depth. */
export function pryvErrorCode (e: unknown): string | undefined {
  const inner = (e as { innerObject?: { id?: string } })?.innerObject?.id;
  if (inner != null) return inner;
  return (e as { id?: string })?.id;
}

/**
 * Resolve `:_cmc:apps:<appCode>` (and optionally provision
 * `:_cmc:apps:<appCode>:<subPath>`) on the caller's account.
 *
 * @param connection  caller's Pryv connection (doctor / patient / bridge).
 * @param appCode     `hds-collector`, `hds-patient`, `hds-bridge-mira`, etc.
 * @param subPath     optional leaf scope under the appScope (e.g. a collectorId).
 * @returns           the streamId of the deepest scope.
 */
export async function ensureAppScope (
  connection: pryv.Connection,
  appCode: string,
  subPath?: string
): Promise<string> {
  const appScope = cmc.appScope(appCode); // :_cmc:apps:<appCode>
  if (subPath == null) return appScope;
  const sub = appScope + ':' + subPath;
  try {
    await createTolerant(connection, sub, appScope, subPath);
  } catch (e: unknown) {
    if (pryvErrorCode(e) !== 'unknown-referenced-resource') throw e;
    await createTolerant(connection, appScope, ':_cmc:apps', appCode);
    await createTolerant(connection, sub, appScope, subPath);
  }
  return sub;
}

/** `streams.create`, treating an existing stream as success. */
async function createTolerant (connection: pryv.Connection, id: string, parentId: string, name: string): Promise<void> {
  try {
    await connection.apiOne('streams.create', { id, parentId, name });
  } catch (e: unknown) {
    if (pryvErrorCode(e) !== 'item-already-exists') throw e;
  }
}
