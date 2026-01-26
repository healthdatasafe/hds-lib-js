import type { pryv as Pryv } from '../patchedPryv';

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
