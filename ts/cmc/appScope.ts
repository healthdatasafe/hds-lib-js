/**
 * Idempotently provision streams under `:_cmc:apps` on a CMC-enabled account.
 *
 * The CMC plugin owns the `:_cmc:apps` namespace. Per-app leaves
 * (`:_cmc:apps:<appCode>`) are auto-provisioned server-side by the
 * `cmcAccessProvisionAppScopeHook` (deployed plan-61, 2026-05-26) whenever
 * `accesses.create` / `accesses.update` references a matching permission;
 * sub-scopes (`:_cmc:apps:<appCode>:<subPath>`) are not.
 *
 * For an OAuth-grant access the client still calls `streams.create` here:
 * pryv checks parent-permission first (no `manage` on `:_cmc:apps` → returns
 * `'forbidden'`), so we tolerate that — by the time the access is usable
 * the upstream hook has already created the leaf. The `'item-already-exists'`
 * branch covers the personal-token-with-`:_cmc:apps`-manage path (registration
 * personal tokens have it; bridge-athena's onboarding used to depend on it).
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
 * Idempotently provision `:_cmc:apps:<appCode>` (and optionally
 * `:_cmc:apps:<appCode>:<subPath>`) on the caller's account.
 *
 * @param connection  caller's Pryv connection (doctor / patient / bridge).
 * @param appCode     `hds-collector`, `hds-patient`, `hds-bridge-mira`, etc.
 * @param subPath     optional leaf scope under the appScope (e.g. a collectorId).
 * @returns           the streamId of the deepest scope provisioned.
 */
export async function ensureAppScope (
  connection: pryv.Connection,
  appCode: string,
  subPath?: string
): Promise<string> {
  const appScope = cmc.appScope(appCode); // :_cmc:apps:<appCode>
  try {
    await connection.apiOne('streams.create', { id: appScope, parentId: ':_cmc:apps', name: appCode });
  } catch (e: unknown) {
    const code = pryvErrorCode(e);
    if (code !== 'item-already-exists' && code !== 'forbidden') throw e;
  }
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
