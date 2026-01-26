"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allStreamsAndChildren = allStreamsAndChildren;
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
//# sourceMappingURL=StreamsTools.js.map