import * as logger from '../logger.ts';
import { DOCUMENT_SHARES_ROOT_ID, isShareStreamId } from '../cmc/shareIds.ts';
import type { APICall } from 'pryv';

/**
 * Which streams the user must create so an incoming CMC grant can write.
 *
 * Pure: the caller keeps the `streams.create` batch and its error handling.
 * Shared by the HDS webapp (accepting an invite) and the account app's
 * `/connect` (accepting a connector's invite, and its own `sync-status` leaf:
 * the model gives the leaf's parent, so the same walk provisions both).
 *
 * The requester cannot provision this itself, which is the whole reason this
 * exists. A CMC data-grant answers `forbidden` when it tries to create a granted
 * root that does not exist yet, because permission is checked against a stream
 * tree the stream is not in; its children then fail with
 * `unknown-referenced-resource` and the requester's first sync dies. Only the
 * user's own connection can break that cycle.
 */

/** The slice of `getHDSModel().streams` this needs. */
export interface ModelStreams {
  getDataById (streamId: string, throwErrorIfNotFound?: boolean): { name?: string; parentId?: string | null } | null;
  getParentsIds (streamId: string, throwErrorIfNotFound?: boolean): string[];
}

export interface StreamToCreate {
  id: string;
  name: string;
  parentId?: string;
}

const APP_SUFFIX = '-app';

/**
 * The app bases a grant names (the app-streams convention: a base `{base}` with its `{base}-app` under it): one per
 * granted `{base}-app` that the model does not know, whose base the model does not know either.
 */
function appBasesOf (permissions: Array<{ streamId?: string }>, modelStreams: ModelStreams): string[] {
  const bases = new Set<string>();
  for (const perm of permissions) {
    const id = perm?.streamId;
    if (typeof id !== 'string' || id.startsWith(':') || !id.endsWith(APP_SUFFIX)) continue;
    const base = id.slice(0, -APP_SUFFIX.length);
    if (base === '' || modelStreams.getDataById(id, false) != null || modelStreams.getDataById(base, false) != null) continue;
    bases.add(base);
  }
  // longest first, so a stream goes under the closest base
  return [...bases].sort((a, b) => b.length - a.length);
}

/**
 * Resolve the granted permissions into streams to create, ancestors first.
 *
 * Insertion order is parent-before-child, so the batch applies top-down with no
 * separate sort.
 *
 * An app's own tree: when the grant names a `{base}-app` stream the model does not know, every granted stream the
 * model does not know whose id starts with `{base}-` (the `-app` one included) is created under `{base}`, and `{base}`
 * is created first (named by its id) even when it is not granted. The HDS Reader's grant (`hds-reader-inbox`,
 * `hds-reader-dialogue`, `hds-reader-app`) thus gives `hds-reader/` with the three under it (data-model
 * `documentation/HDS-READER.md`), while the requester holds nothing on `hds-reader` itself. A grant with no
 * `{base}-app` keeps its unknown streams at the root, as before.
 *
 * A share child (`share-…`, an uploader's offer: `cmcDocuments.newUploaderOffer`) goes under `document-shares`, never at
 * the root, and is named by its id whatever `defaultName` says (data-model DOCUMENTS.md: the name carries nothing).
 * Creating it does not check that the id is free: `cmcDocuments.offeredShareIssues` does, before accepting.
 *
 * A stream the model knows takes the model's name; a granted one it does not know takes the permission's
 * `defaultName` when it carries one, else its id.
 */
export function offerStreamsToCreate (
  permissions: Array<{ streamId?: string; defaultName?: string }>,
  modelStreams: ModelStreams
): StreamToCreate[] {
  const wanted = new Map<string, StreamToCreate>();
  const appBases = appBasesOf(permissions, modelStreams);

  const add = (id: string, { granted = false, defaultName }: { granted?: boolean; defaultName?: string } = {}): void => {
    const name = typeof defaultName === 'string' && defaultName.trim() !== '' ? defaultName.trim() : id;
    const already = wanted.get(id);
    if (already !== undefined) {
      // an app base added ahead of its granted `-…` stream, then granted itself: keep its own name
      if (granted && already.name === id) already.name = name;
      return;
    }
    const data = modelStreams.getDataById(id, false);
    if (data == null) {
      // Unknown to the model. What reaches here is the requester's OWN root
      // (e.g. `bridge-mira`), since `:_cmc:*` and `:_system:*` are filtered below.
      //
      // Only ever create an id the user explicitly granted, never an inferred
      // ancestor: inventing a hierarchy inside someone else's subtree is the
      // requester's business, not ours. Hence `granted` is not defaulted true.
      // The one exception is the base of an app tree the grant itself names (see above).
      if (!granted) return;
      const isShare: boolean = isShareStreamId(id); // annotated: the guard would narrow `id` to never below
      if (isShare) {
        add(DOCUMENT_SHARES_ROOT_ID, { granted: true, defaultName: 'Shared documents' });
        wanted.set(id, { id, name: id, parentId: DOCUMENT_SHARES_ROOT_ID });
        return;
      }
      const base = appBases.find((b) => id.startsWith(b + '-'));
      if (base === undefined) {
        wanted.set(id, { id, name });
        return;
      }
      if (!wanted.has(base)) wanted.set(base, { id: base, name: base });
      wanted.set(id, { id, name, parentId: base });
      return;
    }
    wanted.set(id, { id, name: data.name ?? id, parentId: data.parentId ?? undefined });
  };

  for (const perm of permissions) {
    const streamId = perm?.streamId;
    if (typeof streamId !== 'string' || streamId.startsWith(':')) continue;
    // `getParentsIds` recurses with `throwErrorIfNotFound` hardcoded true further
    // down, so a single stream the model does not know can abort the whole walk.
    // Isolate each one: a bad entry must not cost the others their ancestors.
    try {
      for (const ancestorId of modelStreams.getParentsIds(streamId, false)) add(ancestorId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn(`offerStreams: could not resolve ancestors of "${streamId}":`, message);
    }
    add(streamId, { granted: true, defaultName: perm.defaultName });
  }

  return [...wanted.values()];
}

/** Turn the resolved list into `streams.create` API calls. */
export function offerStreamsToApiCalls (streams: StreamToCreate[]): Array<APICall<'streams.create'>> {
  return streams.map((s) => ({
    method: 'streams.create' as const,
    params: s.parentId != null ? { id: s.id, name: s.name, parentId: s.parentId } : { id: s.id, name: s.name },
  }));
}
