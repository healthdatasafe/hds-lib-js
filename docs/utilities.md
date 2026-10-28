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
  when none is recorded, the last of the consecutive days with period-level bleeding that begin on the start day or
  the day after. Period-level means Very light (0.2) or more: **spotting (0.08) does not count**, as
  `fertility-cycles-start` requires full bleeding; a value between the two anchors reads as the nearer one (above
  0.14 counts). A spotting day ends the run, and spotting alone on day 1 and day 2 gives no period end. No
  period-level bleeding on either day: no period end. A recorded period end always wins.
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

### Temperature shift and coverline

The basal-temperature coverline of a cycle and the high temperatures it counts, by the rule the person's method
charts the temperature by. **Chart notation only:** the line and its counted highs, as a paper chart shows them;
nothing here says a day is fertile or infertile (data-model `MENSTRUAL-CYCLE.md`, "Coverline").

**The rule of a method** comes from the data model: each method of the `cervical-fluid` converter pack carries
`temperatureRule` (3.24.0), a key of the pack's `temperatureRules` or `'none'`. The parameters of each rule are
model-cervical-fluid's method specification (`references/rules/coverline-rules.json`, version 2026-10-28), in
`TEMPERATURE_RULES`:

| Rule | Methods (3.24.0) | Parameters |
|------|------------------|------------|
| `sympto-thermal` (STM / TCOYF) | `sympto-thermal` | 6 lows, line 0.05 °C above the highest, first high ≥ 0.1 °C above the highest low, 3 highs above the line, the 3rd ≥ 0.15 °C above it, else a 4th above the line |
| `sensiplan` ("3 over 6") | `sensiplan`, `chartneo` | 6 lows, line on the highest, any higher temperature starts the count, 3 highs, the 3rd ≥ 0.2 °C above. First exception: else a 4th above the line. Second exception: the 2nd or 3rd on or under the line is left out, the next counts and must itself be 0.2 °C above. Never combined |
| `manual` | `justisse` | No calculation: the person draws the line |
| `'none'` | the others | No coverline: `temperatureRuleOf` returns `null` |

A temperature on or under the line during the count starts it again (unless Sensiplan's second exception applies).
Not modelled (as in the specification): TCOYF's slow-rise variant and the double check with the mucus.

```javascript
const engine = await model.converters.ensureEngine('cervical-fluid');
const rule = temperatureRuleOf(engine.getMethodDef(methodId)); // null: the method draws no coverline
const lines = coverlinesOf(series, events, rule, 'Europe/Zurich');
// [{ cycleStart, cycleEnd, value: 36.5, origin: 'computed', computed: 36.5, event: null,
//    shift: { source: 'Thermometer', low: 36.5, line: 36.5, first, confirmed, highs: [t1, t2, t3] } }]
```

- `temperatureRuleOf(methodDef)` → `TemperatureRule | null` (`null` for `'none'`, a pack before 3.24.0, or a rule id
  this version does not know). `isManualTemperatureRule(rule)`. The pack's labels and sources are on
  `engine.temperatureRules`.
- `shiftOf(values, rule)` → `{ low, line, first, confirmed, highs } | null`: indexes into `values` (one temperature
  a day, in order, disturbed ones already left out). `highs` are the counted highs, without the one Sensiplan's
  second exception leaves out, with the 4th when the first exception applies. Always `null` for `manual`.
- `shiftInCycle(series, from, to, rule, { events?, timeZone? })` → the same in times (unix seconds), plus the
  `source` of the series used, over `[from, to)`.
- `coverlinesOf(series, events, rule, timeZone?)` → one `Coverline` per cycle that has one.

**Inputs.** `series` is `{ source, points: [{ time, value }] }[]`, one per device (thermometer, ring…); the
grouping is the caller's. Per cycle, the series with the most daily temperatures is used and devices are never
mixed (the first listed on a tie). One temperature a calendar day (the first) in the patient's time zone. `events`:
the `fertility-cycles-start`, `fertility-cycles-coverline` and `body-temperature-basal-disturbance` events, any
order; trashed and other events are ignored. Cycles are those of `cyclePhaseAt` (a start day to the day before the
next one; an open cycle stops after 90 days).

**Disturbed temperatures** are left out: every reading on the calendar day of a
`body-temperature-basal-disturbance` event (any reason). The data model defines the disturbance as a qualifier of a
co-occurring reading without a pairing key, so it is paired by day: on a day with readings from two devices, both
are left out.

**A drawn or moved line** is a `fertility-cycles-coverline` event of the cycle (its calendar day within the cycle).
Precedence, as the data model states it: with a calculated rule, an event with `clientData.hdsBasis: 'manual'` wins,
otherwise the rule's line, and a stored `'auto'` or unstated event is never shown; with the `manual` rule (nothing
to compute), whichever event exists is shown. Among several, the latest `modified`. Writing the event (0.05 °C
steps, deleting it to go back to the rule) is the app's.

| `Coverline` field | Meaning |
|-------------------|---------|
| `value` | the line to show, °C |
| `origin` | `'event'` (the coverline event's value) or `'computed'` (the rule's) |
| `computed` | the rule's line, `null` before the shift and for `manual` |
| `event` | the coverline event shown, or `null` |
| `shift` | the rule's shift with its counted `highs` (times), `null` before the shift and for `manual`; counted against the rule's line, not a moved one |
| `cycleStart` / `cycleEnd` | first second of the start day / of the next start day (`null` while open) |

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
