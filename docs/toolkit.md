---
layout: default
title: Toolkit
---

# Toolkit

Stream management utilities attached to Pryv connections.

## StreamsAutoCreate

Attach to a `pryv.Connection` to automatically create HDS model streams when needed.

### Setup

```javascript
const HDSLib = require('hds-lib');

// Attach to a connection (done once at initialization)
HDSLib.toolkit.StreamsAutoCreate.attachToConnection(connection);
```

### ensureExistsForItems(keysOrDefs)

Creates all parent and leaf streams necessary to store the given items. Skips streams that already exist.

```javascript
// Ensure streams for body-weight and profile-name exist
await connection.streamsAutoCreate.ensureExistsForItems(['body-weight', 'profile-name']);
```

This will create the full hierarchy. For example, for `body-weight`:

```
(root)
  └─ body/
      └─ body-weight/
```

### Other methods

| Method | Description |
|--------|-------------|
| `knowStreamIds()` | Returns array of stream IDs currently known to exist |
| `addStreamStructure(structure)` | Register existing streams to avoid re-creating them |

### With ApplicationFeatures

When using App Templates, you can enable auto-creation via features:

```javascript
const app = await HDSLib.appTemplates.AppManagingAccount.newFromApiEndpoint(
  'my-app', apiEndpoint, 'My App',
  { streamsAutoCreate: true }
);
```

## StreamTools

Low-level stream traversal utilities.

### allStreamsAndChildren(streamStructure)

Generator that yields all streams recursively from a stream tree.

```javascript
for (const stream of HDSLib.toolkit.StreamTools.allStreamsAndChildren(streams)) {
  console.log(stream.id);
}
```

### getStreamIdAndChildrenIds(stream)

Returns an array containing the stream's ID and all its descendants' IDs.

```javascript
const ids = HDSLib.toolkit.StreamTools.getStreamIdAndChildrenIds(bodyStream);
// ['body', 'body-weight', 'body-height', ...]
```
