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
