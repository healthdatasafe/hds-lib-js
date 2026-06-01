/**
 * Idempotently provision streams under `:_cmc:apps` on a CMC-enabled account.
 *
 * The CMC plugin owns the `:_cmc:apps` namespace. The per-app leaf
 * (`:_cmc:apps:<appCode>`) is auto-provisioned server-side by the
 * `cmcAccessProvisionAppScopeHook` post-hook on `accesses.create` /
 * `accesses.update`, whenever the access references a matching
 * `:_cmc:apps:<appCode>:*` permission (deployed 2026-05-26, plan-61
 * upstream fix). Callers therefore do not need to `streams.create` the
 * leaf — this helper returns its id directly.
 *
 * Sub-scopes (`:_cmc:apps:<appCode>:<subPath>`) are NOT auto-provisioned
 * and still require a `streams.create` here.
 *
 * Hoisted in Plan 60 B1 from three independent copies that had drifted:
 * `doctor-dashboard/app/cmcDoctor.ts` (canonical, used here),
 * `bridge-mira/src/methods/cmcBridgeMira.ts`, and the archived
 * `_plans/_archives/59-…/scripts/cmc-migrate.mjs`.
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
    await connection.apiOne('streams.create', { id: sub, parentId: appScope, name: subPath });
  } catch (e: unknown) {
    const code = pryvErrorCode(e);
    if (code !== 'item-already-exists') throw e;
  }
  return sub;
}
