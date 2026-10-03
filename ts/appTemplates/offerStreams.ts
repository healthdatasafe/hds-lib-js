import * as logger from '../logger.ts';

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

/**
 * Resolve the granted permissions into streams to create, ancestors first.
 *
 * Insertion order is parent-before-child, so the batch applies top-down with no
 * separate sort.
 */
export function offerStreamsToCreate (
  permissions: Array<{ streamId?: string }>,
  modelStreams: ModelStreams
): StreamToCreate[] {
  const wanted = new Map<string, StreamToCreate>();

  const add = (id: string, { granted = false }: { granted?: boolean } = {}): void => {
    if (wanted.has(id)) return;
    const data = modelStreams.getDataById(id, false);
    if (data == null) {
      // Unknown to the model. What reaches here is the requester's OWN root
      // (e.g. `bridge-mira`), since `:_cmc:*` and `:_system:*` are filtered below.
      //
      // Only ever create an id the user explicitly granted, never an inferred
      // ancestor: inventing a hierarchy inside someone else's subtree is the
      // requester's business, not ours. Hence `granted` is not defaulted true.
      if (!granted) return;
      wanted.set(id, { id, name: id });
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
    add(streamId, { granted: true });
  }

  return [...wanted.values()];
}

/** Turn the resolved list into `streams.create` API calls. */
export function offerStreamsToApiCalls (streams: StreamToCreate[]): Array<{ method: string; params: Record<string, unknown> }> {
  return streams.map((s) => ({
    method: 'streams.create',
    params: s.parentId != null ? { id: s.id, name: s.name, parentId: s.parentId } : { id: s.id, name: s.name },
  }));
}
