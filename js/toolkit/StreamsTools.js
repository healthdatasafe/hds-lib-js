"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allStreamsAndChildren = allStreamsAndChildren;
exports.getStreamIdAndChildrenIds = getStreamIdAndChildrenIds;
/**
 * Iterate all streams and children
 */
function* allStreamsAndChildren(streamStructure) {
    for (const stream of streamStructure) {
        yield stream;
        if (stream.children && stream.children.length > 0) {
            for (const child of allStreamsAndChildren(stream.children)) {
                yield child;
            }
        }
    }
}
function getStreamIdAndChildrenIds(stream) {
    const streamIds = [];
    for (const s of allStreamsAndChildren([stream])) {
        streamIds.push(s.id);
    }
    return streamIds;
}
//# sourceMappingURL=StreamsTools.js.map