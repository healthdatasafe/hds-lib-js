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
label (a `ratio/proportion` value between options reads as the nearest one), a number with its unit, or as
its item's `number.display` declares (`multiplier`, `precision`, `suffix`: ferritin `2.1 ng/mL`, sperm concentration
`15 10⁶/mL`; a `ratio/proportion` number without display as a percentage, `0.057` → `5.7 %`), a `date/iso-8601` value as the stored date in the
person's date format, a medication's drug and intake, a convertible observation in the method set by
`preferred-display-<itemKey>` followed by its origin (`Creamy (Apple Health <- Mira)`).

The unit of a number, first match wins:

1. the item's `number.display.suffix`;
2. for an unscaled value (no `number.display.multiplier`, or 1), the label of the item's `variations.eventType` option
   for the event's type, **`concentration/*` types only**: AMH on `concentration/ug-l` reads `2.1 ng/mL` (not
   `µg/L`), prolactin on `concentration/uiu-ml` `250 mIU/L` (not `μIU/mL`). Other variation labels are form words
   (`body-height` "Feet", `body-weight` "Lbs"), so those items keep step 3 and the unit-system conversion;
3. the eventType symbol (`60 Kg`), or the target type's symbol when the person's `unitSystem` converts the value.

A value scaled by a `multiplier` with no `suffix` shows no unit. An event with no itemDef uses its eventType symbol.

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

### formatEventDate(eventOrTimeSec, options?)

The local calendar day, in the resolved date format (`resolveAccountPreference('dateFormat')`), else as an ISO date.

| Option | Default | Effect |
|--------|---------|--------|
| `year` | `true` | `false` leaves the year out: `15.01.`, `15/01`, `01/15`, `01-15` |
| `weekday` | `false` | `true` puts the short weekday name first: `Mon 15.01.2024`, `lun. 15.01.` |
| `locale` | first preferred locale | language of the weekday and month names |

Pass the event (anything with `time` and `clientData`) rather than `event.time` to honour a partial date (data-model
`documentation/PARTIAL-DATES.md`, `clientData.hdsTimePrecision`), whose calendar fields are read in UTC:

| `hdsTimePrecision` | Result |
|--------------------|--------|
| *(absent, unknown)* | as for the timestamp |
| `minute` | the day in `hdsTimeZone` when it is a known IANA zone, else as for the timestamp |
| `day` | the date, in the resolved format |
| `month` | `March 1999`, `mars 1999`; `March` with `year: false` |
| `year` | `1997` (`year: false` and `weekday` do not apply) |
| `approx` | `about spring 1998` (`hdsTimeText`), else `about 1998` |

`eventToShortText` passes the event, so a date or checkbox item whose time is the value reads the same way (a partial
date shows no time of day).
