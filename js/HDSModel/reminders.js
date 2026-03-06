"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeReminders = computeReminders;
const duration_1 = require("../utils/duration");
const IMPORTANCE_ORDER = { may: 0, should: 1, must: 2 };
function maxImportance(a, b) {
    const va = IMPORTANCE_ORDER[a || 'may'] || 0;
    const vb = IMPORTANCE_ORDER[b || 'may'] || 0;
    return va >= vb ? (a || 'may') : (b || 'may');
}
/**
 * Merge reminder configs from multiple sources. Later sources override per-field.
 * Returns merged config + importance (highest across all sources).
 */
function mergeReminders(sources) {
    let merged = {};
    let importance = 'may';
    for (const source of sources) {
        const r = source.reminder;
        if (r.cooldown !== undefined)
            merged.cooldown = r.cooldown;
        if (r.expectedInterval !== undefined)
            merged.expectedInterval = r.expectedInterval;
        if (r.relativeTo !== undefined)
            merged.relativeTo = r.relativeTo;
        if (r.relativeDays !== undefined)
            merged.relativeDays = r.relativeDays;
        if (r.importance !== undefined)
            merged.importance = r.importance;
        importance = maxImportance(importance, r.importance);
    }
    return { config: merged, importance };
}
/**
 * Find the most recent event matching an itemDef (by streamId + eventType).
 */
function findLastEvent(itemDef, events) {
    const streamId = itemDef.data.streamId;
    const types = new Set(itemDef.eventTypes);
    let latest;
    for (const e of events) {
        if (!types.has(e.type))
            continue;
        const eStreamId = e.streamId || (e.streamIds && e.streamIds[0]);
        if (eStreamId !== streamId)
            continue;
        if (!latest || e.time > latest.time)
            latest = e;
    }
    return latest;
}
/**
 * Compute reminder statuses for a set of items given their events and optional overrides.
 *
 * @param itemDefs - array of item definitions (must have .key, .eventTypes, .reminder, .data.streamId)
 * @param events - all events to search for last entries
 * @param overrides - optional collector/user overrides (matched by itemKey in the ReminderSource)
 * @param now - current time in unix seconds (defaults to Date.now()/1000)
 */
function computeReminders(itemDefs, events, overrides, now) {
    const nowSec = now ?? Math.floor(Date.now() / 1000);
    const results = [];
    // Pre-compute last events for relative lookups
    const lastEventCache = new Map();
    for (const itemDef of itemDefs) {
        lastEventCache.set(itemDef.key, findLastEvent(itemDef, events));
    }
    for (const itemDef of itemDefs) {
        // Build sources: default + overrides
        const sources = [];
        if (itemDef.reminder) {
            sources.push({ origin: 'default', reminder: itemDef.reminder });
        }
        const itemOverrides = overrides?.[itemDef.key];
        if (itemOverrides)
            sources.push(...itemOverrides);
        // No reminder config at all → skip
        if (sources.length === 0)
            continue;
        const { config, importance } = mergeReminders(sources);
        const lastEvent = lastEventCache.get(itemDef.key);
        const lastEntry = lastEvent?.time;
        const timeSinceLast = lastEntry != null ? (nowSec - lastEntry) : Infinity;
        let status;
        let dueDate;
        // --- relativeTo logic ---
        if (config.relativeTo && config.relativeDays) {
            const refItemDef = itemDefs.find(d => d.key === config.relativeTo);
            const refEvent = refItemDef ? lastEventCache.get(refItemDef.key) : undefined;
            if (!refEvent) {
                // No reference event → can't compute relative timing
                status = 'ok';
            }
            else {
                // Compute cycle day (day 1 = day of reference event)
                const daysSinceRef = Math.floor((nowSec - refEvent.time) / 86400);
                const cycleDay = daysSinceRef + 1;
                const days = config.relativeDays;
                const minDay = Math.min(...days);
                const maxDay = Math.max(...days);
                if (days.includes(cycleDay)) {
                    // Check cooldown: if already entered today, suppress
                    if (lastEntry != null && timeSinceLast < 86400) {
                        status = 'cooldown';
                    }
                    else {
                        status = 'due';
                        dueDate = refEvent.time + (cycleDay - 1) * 86400;
                    }
                }
                else if (cycleDay === minDay - 1) {
                    status = 'upcoming';
                    dueDate = refEvent.time + (minDay - 1) * 86400;
                }
                else if (cycleDay > maxDay) {
                    // Past the target window — if never entered this cycle, overdue
                    if (!lastEntry || lastEntry < refEvent.time) {
                        status = 'overdue';
                    }
                    else {
                        status = 'ok';
                    }
                }
                else {
                    status = 'ok';
                }
            }
            // --- expectedInterval logic ---
        }
        else if (config.expectedInterval) {
            const interval = config.expectedInterval;
            const cooldownSec = config.cooldown ? (0, duration_1.durationToSeconds)(config.cooldown) : 0;
            if (lastEntry == null) {
                // Never entered → due
                status = 'due';
            }
            else if (cooldownSec > 0 && timeSinceLast < cooldownSec) {
                status = 'cooldown';
            }
            else {
                const minSec = interval.min ? (0, duration_1.durationToSeconds)(interval.min) : 0;
                const maxSec = interval.max ? (0, duration_1.durationToSeconds)(interval.max) : Infinity;
                const thresholdUpcoming = maxSec * 0.9;
                if (timeSinceLast < minSec) {
                    status = 'ok';
                }
                else if (timeSinceLast < thresholdUpcoming) {
                    status = 'upcoming';
                    dueDate = lastEntry + (interval.max ? (0, duration_1.durationToSeconds)(interval.max) : 0);
                }
                else if (timeSinceLast <= maxSec) {
                    status = 'due';
                    dueDate = lastEntry + (interval.max ? (0, duration_1.durationToSeconds)(interval.max) : 0);
                }
                else {
                    status = 'overdue';
                    dueDate = lastEntry + (interval.max ? (0, duration_1.durationToSeconds)(interval.max) : 0);
                }
            }
            // --- cooldown-only logic ---
        }
        else if (config.cooldown) {
            const cooldownSec = (0, duration_1.durationToSeconds)(config.cooldown);
            if (lastEntry != null && timeSinceLast < cooldownSec) {
                status = 'cooldown';
            }
            else {
                status = 'due';
                dueDate = lastEntry != null ? lastEntry + cooldownSec : undefined;
            }
        }
        else {
            // Config has importance but no timing → always due
            status = 'due';
        }
        results.push({
            itemKey: itemDef.key,
            status,
            importance,
            lastEntry,
            lastEventContent: lastEvent?.content,
            dueDate,
            sources
        });
    }
    // Sort: overdue first, then due, then upcoming, then ok, then cooldown
    // Within same status: higher importance first
    const STATUS_ORDER = { overdue: 0, due: 1, upcoming: 2, ok: 3, cooldown: 4 };
    results.sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 5;
        const sb = STATUS_ORDER[b.status] ?? 5;
        if (sa !== sb)
            return sa - sb;
        return (IMPORTANCE_ORDER[b.importance] || 0) - (IMPORTANCE_ORDER[a.importance] || 0);
    });
    return results;
}
//# sourceMappingURL=reminders.js.map