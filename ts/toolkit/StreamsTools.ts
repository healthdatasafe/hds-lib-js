/**
 * Iterate all streams and children
 */
export function * allStreamsAndChildren (streamStructure: any): Generator<any, void, unknown> {
  for (const stream of streamStructure) {
    yield stream;
    if (stream.children && stream.children.length > 0) {
      for (const child of allStreamsAndChildren(stream.children)) {
        yield child;
      }
    }
  }
}
