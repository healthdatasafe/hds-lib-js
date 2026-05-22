/**
 * Idempotently provision streams under `:_cmc:apps` on a CMC-enabled account.
 *
 * The CMC plugin auto-creates the `:_cmc:apps` parent but does not
 * auto-create the per-app children — each `:_cmc:apps:<appCode>` and its
 * sub-scopes (e.g. `:_cmc:apps:hds-collector:<collectorId>`) need explicit
 * `streams.create` calls. The two error modes are tolerated:
 *
 *   - `'item-already-exists'` — the stream is already there (idempotent re-run).
 *   - `'forbidden'` — happens on the appScope when the caller's OAuth-scoped
 *     access has `manage` on `:_cmc:apps:<appCode>` but not on the parent
 *     `:_cmc:apps` (the plugin-managed namespace). In that case the appScope
 *     is typically pre-existing anyway because the CMC plugin auto-provisions
 *     app-scope roots on first invite.
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
