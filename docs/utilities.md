---
layout: default
title: Utilities
---

# Utilities

## Error handling

### HDSLibError

Custom error class used throughout the library.

```javascript
const { HDSLibError } = require('hds-lib/js/errors');

throw new HDSLibError('Item not found', { key: 'body-weight' });
```

**Properties:**
- `message` — Error message string
- `innerObject` — Context data object
- `toString()` — Returns message with JSON-formatted inner object

## Duration utilities

ISO 8601 duration parsing and formatting for reminder intervals.

### durationToSeconds(iso)

Parses an ISO 8601 duration string to seconds.

```javascript
HDSLib.durationToSeconds('P1D');        // 86400 (1 day)
HDSLib.durationToSeconds('PT12H');      // 43200 (12 hours)
HDSLib.durationToSeconds('P1W');        // 604800 (1 week)
HDSLib.durationToSeconds('P1Y6M3W2D'); // ~57,456,000
```

**Supported format:** `P[n]Y[n]M[n]W[n]DT[n]H[n]M`

### durationToLabel(seconds)

Formats seconds into a human-readable label.

```javascript
HDSLib.durationToLabel(86400);   // "1 day"
HDSLib.durationToLabel(259200);  // "3 days"
HDSLib.durationToLabel(2592000); // "1 month"
```

## Reminders

### computeReminders(itemDefs, events, overrides?, now?)

Computes reminder status for a set of items based on their configuration and event history.

```javascript
const statuses = HDSLib.computeReminders(itemDefs, events);
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `itemDefs` | `ItemDefLike[]` | Item definitions with reminder configs |
| `events` | `EventLike[]` | Recent events to check against |
| `overrides` | `Record<string, ReminderSource[]>` | Optional per-item reminder overrides |
| `now` | `number` | Optional current timestamp (default: `Date.now()`) |

**Returns:** `ReminderStatus[]` sorted by urgency (overdue first).

### ReminderStatus

```typescript
{
  itemKey: string;
  status: 'cooldown' | 'ok' | 'upcoming' | 'due' | 'overdue';
  importance: 'may' | 'should' | 'must';
  lastEntry?: number;    // Timestamp of last matching event
  dueDate?: number;      // When the item is next due
  sources: ReminderSource[];
}
```

### ReminderSource

```typescript
{
  origin: 'default' | 'collector' | 'user';
  collectorId?: string;
  reminder: ReminderConfig;
}
```

### ReminderConfig

```typescript
{
  cooldown?: string;           // ISO 8601 duration, e.g., "P1D"
  expectedInterval?: {
    min?: string;              // ISO 8601 duration
    max?: string;              // ISO 8601 duration
  };
  relativeTo?: string;         // Another item key (for cycle-relative reminders)
  relativeDays?: number[];     // Days within cycle when due
  importance?: 'may' | 'should' | 'must';
}
```

### Reminder evaluation logic

1. **Cooldown-only** — Item is in cooldown if last entry was within the cooldown period
2. **Interval-based** (`expectedInterval`) — Due when `max` interval elapsed since last entry; "upcoming" at 90% of max
3. **Cycle-relative** (`relativeTo` + `relativeDays`) — Due on specific days relative to a reference item's cycle

Results are sorted: `overdue > due > upcoming > ok > cooldown`, with higher importance first within each status.

## Menstrual cycle

Cycle day and phase are derived from the person's own events, never stored (data-model
`documentation/MENSTRUAL-CYCLE.md`). Days are calendar days in the patient's `timeZone` (IANA name; default: the
runtime's), not 24-hour steps.

### cycleDayAt(time, cycleStart, timeZone?)

`1` on the calendar day of `cycleStart`, `2` on the next one, and so on.

### cyclePhaseAt(time, events, timeZone?)

```javascript
const r = cyclePhaseAt(Date.now() / 1000, events, 'Europe/Zurich');
// { phase: 'fertile', basis: 'predicted', predictedBy: ['<access id>'], cycleDay: 12, cycleStart, cycleEnd }
```

`events`: the patient's `fertility-cycles-*` events (`activity/plain`) and `body-vulva-bleeding` events
(`ratio/proportion`), any order; others are ignored, as are trashed ones.

- A cycle runs from a `fertility-cycles-start` day to the day before the next one; an open cycle stops after 90 days.
  A boundary belongs to the cycle holding its day (the earliest when several).
- `menstrual`: the start day through the period end. The period end is the cycle's `fertility-cycles-period-end`;
  when none is recorded, the last of the consecutive days with bleeding above 0 (spotting included) that begin on the
  start day or the day after. No bleeding on either day: no period end. A recorded period end always wins.
- `fertile`: the fertile-window days (first and last inclusive) and the ovulation day.
- `follicular`: after the period end, before the first fertile day (window start, else ovulation day).
- `luteal`: after the ovulation day (and after the window).
- Any other day: `phase: null`. It never guesses, and it never projects an ovulation. A period end (recorded or from
  bleeding) on or after the first fertile day is ignored.
- **The boundaries decide.** A day's phase does not depend on whether anything was logged that day; a "log today"
  nudge is the app's.

| Field | Meaning |
|-------|---------|
| `phase` | `'menstrual' \| 'follicular' \| 'fertile' \| 'luteal' \| null` |
| `basis` | from `clientData.hdsBasis` of the boundaries the phase rests on: `'predicted'` when any is predicted, `'confirmed'` when all are confirmed, else `'unknown'` (not stated). Bleeding observations do not count. |
| `predictedBy` | when `basis` is `'predicted'`: the distinct `createdBy` (access ids) of the predicted boundaries; else `[]` |
| `cycleDay` | 1 on the start day; null outside a cycle |
| `cycleStart` / `cycleEnd` | first second of the start day / of the next start day (null while open) |

For a label: `basis === 'predicted'` reads "predicted by {app}", the app names coming from `predictedBy` (resolve each
access id to its app, e.g. through the contact whose `accessIds` hold it); `'confirmed'` and `'unknown'` read
"recorded".

## Logger

Configurable logging. Default logger outputs to console.

```javascript
HDSLib.logger.info('Message', data);
HDSLib.logger.error('Error occurred', error);
HDSLib.logger.debug('Debug info', details);
HDSLib.logger.warn('Warning', context);
```

### Custom logger

```javascript
HDSLib.logger.setLogger({
  info: (...args) => myLogger.info(...args),
  error: (...args) => myLogger.error(...args),
  debug: (...args) => myLogger.debug(...args),
  warn: (...args) => myLogger.warn(...args),
});
```
