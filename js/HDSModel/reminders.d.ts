import type { ReminderConfig } from './HDSItemDef';
export interface ReminderSource {
    origin: 'default' | 'collector' | 'user';
    collectorId?: string;
    reminder: ReminderConfig;
}
export interface ReminderStatus {
    itemKey: string;
    status: 'cooldown' | 'ok' | 'upcoming' | 'due' | 'overdue';
    importance: 'may' | 'should' | 'must';
    lastEntry?: number;
    lastEventContent?: any;
    dueDate?: number;
    sources: ReminderSource[];
}
interface ItemDefLike {
    key: string;
    eventTypes: string[];
    reminder: ReminderConfig | null;
    data: {
        streamId: string;
    };
}
interface EventLike {
    type: string;
    streamId?: string;
    streamIds?: string[];
    time: number;
    content?: any;
}
/**
 * Compute reminder statuses for a set of items given their events and optional overrides.
 *
 * @param itemDefs - array of item definitions (must have .key, .eventTypes, .reminder, .data.streamId)
 * @param events - all events to search for last entries
 * @param overrides - optional collector/user overrides (matched by itemKey in the ReminderSource)
 * @param now - current time in unix seconds (defaults to Date.now()/1000)
 */
export declare function computeReminders(itemDefs: ItemDefLike[], events: EventLike[], overrides?: Record<string, ReminderSource[]>, now?: number): ReminderStatus[];
export {};
//# sourceMappingURL=reminders.d.ts.map