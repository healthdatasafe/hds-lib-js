import type { pryv as Pryv } from '../patchedPryv.ts';

/**
 * Iterate all streams and children
 */
export function * allStreamsAndChildren (streamStructure: Pryv.Stream[]): Generator<Pryv.Stream, void, unknown> {
  for (const stream of streamStructure) {
    yield stream;
    if (stream.children && stream.children.length > 0) {
      for (const child of allStreamsAndChildren(stream.children)) {
        yield child;
      }
    }
  }
}

export function getStreamIdAndChildrenIds (stream: Pryv.Stream): Array<string> {
  const streamIds = [];
  for (const s of allStreamsAndChildren([stream])) {
    streamIds.push(s.id);
  }
  return streamIds;
}

/** The permission levels that read; `create-only` writes without reading, `none` forbids. */
export const READING_LEVELS: readonly string[] = ['read', 'contribute', 'manage'];

/** A stream and its parents (`parentId` chain in `streamsById`), nearest first; the id alone when it is not in the map. */
export function streamAndParents (streamId: string, streamsById: Record<string, { parentId?: string | null } | undefined>): string[] {
  const out: string[] = [];
  let id: string | null | undefined = streamId;
  while (id != null && !out.includes(id)) {
    out.push(id);
    id = streamsById[id]?.parentId;
  }
  return out;
}

/**
 * Whether one access's permissions read an event on these streams, the platform's rule: a reading permission
 * (`READING_LEVELS`, a missing level counts as `read`) on `*`, on one of the streams or on a parent of one, and no
 * `none` permission on any of them or their parents. The one "can read" rule for every screen (B-2026-11-12-7).
 */
export function permissionsRead (
  permissions: Array<{ streamId?: string; level?: string }>,
  streamIds: string[],
  streamsById: Record<string, { parentId?: string | null } | undefined>
): boolean {
  if (streamIds.length === 0) return false;
  const covered = new Set(streamIds.flatMap(id => streamAndParents(id, streamsById)));
  const level = (p: { level?: string }) => p.level ?? 'read';
  if (permissions.some(p => level(p) === 'none' && p.streamId != null && covered.has(p.streamId))) return false;
  return permissions.some(p => READING_LEVELS.includes(level(p)) && p.streamId != null && (p.streamId === '*' || covered.has(p.streamId)));
}
