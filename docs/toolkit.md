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

## Event formatters

Exported at the top level (`import { eventToShortText, eventToShortTextWithOrigin, formatEventDate } from 'hds-lib'`).

### eventToShortText(event)

One short text for an event's value, driven by its itemDef (`getHDSModel().itemsDefs.forEvent`): a select's option
label (a `ratio/proportion` value between options reads as the nearest one), a number with its unit symbol, or as
its item's `number.display` declares (`multiplier`, `precision`, `suffix`: AMH `2.1 ng/mL`, sperm concentration
`15 10⁶/mL`; a `ratio/proportion` number without display as a percentage, `0.057` → `5.7 %`), a `date/iso-8601` value as the stored date in the
person's date format, a medication's drug and intake, a convertible observation in the method set by
`preferred-display-<itemKey>` followed by its origin (`Creamy (Apple Health <- Mira)`).

### eventToShortTextWithOrigin(event)

The same text, plus where a convertible value came from, as fields. Read these instead of parsing the text:

```javascript
const { text, origin } = eventToShortTextWithOrigin(event);
// with preferred-display-body-vulva-mucus-inspect = 'appleHealth', a Mira "Creamy" observation:
// text:   'Creamy (Apple Health <- Mira)'
// origin: { sourceKey: 'mira', sourceName: 'Mira', sourceLabel: 'Creamy',
//           targetKey: 'appleHealth', targetName: 'Apple Health', match: 100 }
```

`origin` is null for non-convertible items. `targetKey` / `targetName` / `match` are null when the value is shown as
recorded; `match` is 0-100 (the text leaves it out at 100).

### formatEventDate(timeSec, options?)

A day in the resolved date format (`resolveAccountPreference('dateFormat')`), else the ISO date.

| Option | Default | Effect |
|--------|---------|--------|
| `year` | `true` | `false` leaves the year out: `15.01.`, `15/01`, `01/15`, `01-15` |
| `weekday` | `false` | `true` puts the short weekday name first: `Mon 15.01.2024`, `lun. 15.01.` |
| `locale` | first preferred locale | language of the weekday name |
