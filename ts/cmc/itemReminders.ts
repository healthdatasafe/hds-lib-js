/**
 * A contact reminds the person to fill in one item of its request. data-model 3.40.0,
 * `CUSTOM-FIELDS-AND-SYSTEM.md` (the `item-reminder` kind): a `notification/alert-cmc` with
 * `content.hds = { kind: 'item-reminder', itemKey }` on the contact's own collectors stream, which
 * the plugin delivers to the person. Nothing else: no reminder state, the request is unchanged, and
 * the item's own `reminder` definition (`computeReminders`) is not involved.
 *
 * - The contact (`postItemReminder`) names only an enterable item of a section of its request.
 * - The person keeps the reminders carrying `content.from` (delivered), and offers the item's form
 *   only while the relationship's grant covers the stream the entry would be written to
 *   (`reminderAction`), read at display time.
 */

import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { ET_ALERT } from './dataExport.ts';
import type { ScopePermission } from './scope.ts';

export const ITEM_REMINDER_KIND = 'item-reminder';

/** A reminder as a conversation shows it. */
export interface ItemReminder {
  alertEventId: string;
  itemKey: string;
  time: number;
  /** `received` when the alert carries `content.from` (delivered by the peer), else `sent` (the writer's own copy). */
  direction: 'sent' | 'received';
  from: { username: string; host: string } | null;
}

/** A request section as these helpers read it (a `CollectorSectionInterface` fits). */
export interface ReminderSection {
  itemKeys?: string[];
  itemCustomizations?: Record<string, Record<string, unknown>>;
}

/** Why a reminder cannot be sent, or why its form cannot be opened. */
export type ItemReminderRefusal = 'unknown-item' | 'not-enterable' | 'not-in-request' | 'not-covered';

const READ_LEVELS = new Set(['read', 'contribute', 'manage']);

// ---- pure helpers ---- //

/** Alert content for one item: fixed title and body, the item named by the reader from its model. */
export function buildItemReminderContent (itemKey: string, locale: string = 'en'): Record<string, unknown> {
  if (typeof itemKey !== 'string' || itemKey.length === 0) throw new HDSLibError('buildItemReminderContent: itemKey is required');
  const lang = TEXT[locale] ? locale : 'en';
  return {
    level: 'info',
    title: { [lang]: TEXT[lang].title },
    body: { [lang]: TEXT[lang].body },
    code: 'hds-' + ITEM_REMINDER_KIND,
    hds: { kind: ITEM_REMINDER_KIND, itemKey }
  };
}

/** The item, when the loaded model knows it and a person can enter it; else the refusal. */
function enterableItem (itemKey: string): { ok: true; streamId: string } | { ok: false; reason: 'unknown-item' | 'not-enterable' } {
  let itemDef: any = null;
  try { itemDef = getModel().itemsDefs.forKey(itemKey, false); } catch { /* model not loaded */ }
  if (itemDef == null) return { ok: false, reason: 'unknown-item' };
  if (!itemDef.isEnterable) return { ok: false, reason: 'not-enterable' };
  return { ok: true, streamId: itemDef.data.streamId };
}

/** The first section of `sections` that lists `itemKey`, with its index; null when none does. */
export function sectionOfItem<S extends ReminderSection> (itemKey: string, sections: S[] | null | undefined): { section: S; index: number } | null {
  const index = (sections ?? []).findIndex(s => (s?.itemKeys ?? []).includes(itemKey));
  return index < 0 ? null : { section: sections![index], index };
}

/** The writer rule: null when `itemKey` may be reminded of under `sections`, else the refusal. */
export function checkItemReminder (itemKey: string, sections: ReminderSection[]): ItemReminderRefusal | null {
  const item = enterableItem(itemKey);
  if ('reason' in item) return item.reason;
  return sectionOfItem(itemKey, sections) == null ? 'not-in-request' : null;
}

/** The stream an entry of `itemKey` would be written to: the section's `context` stream, else the item's. */
export function entryStreamOf (itemKey: string, section?: ReminderSection | null): string | null {
  const context = section?.itemCustomizations?.[itemKey]?.context;
  if (typeof context === 'string' && context.length > 0) return context;
  const item = enterableItem(itemKey);
  return item.ok ? item.streamId : null;
}

/** `perms` lets the contact read `streamId`: on that stream, a parent of it in the data model, or `*`. */
export function grantCovers (perms: ScopePermission[], streamId: string): boolean {
  const covering = new Set<string>(['*', streamId]);
  try {
    for (const id of getModel().streams.getParentsIds(streamId, false)) covering.add(id);
  } catch { /* model not loaded or stream unknown: the stream itself and `*` */ }
  return (perms ?? []).some(p => p.streamId != null && covering.has(p.streamId) && READ_LEVELS.has(p.level ?? 'read'));
}

/**
 * What the person's app may do with a reminder: open the item's form (`{ ok: true }`, with the
 * section to open it in), or show the bubble without the action. `perms` is the grant of the
 * relationship whose collectors stream carries the reminder, `sections` its request's sections.
 */
export function reminderAction<S extends ReminderSection> (
  itemKey: string,
  sections: S[] | null | undefined,
  perms: ScopePermission[]
): { ok: true; section: S; sectionIndex: number; streamId: string } | { ok: false; reason: ItemReminderRefusal } {
  const item = enterableItem(itemKey);
  if ('reason' in item) return { ok: false, reason: item.reason };
  const found = sectionOfItem(itemKey, sections);
  if (found == null) return { ok: false, reason: 'not-in-request' };
  const streamId = entryStreamOf(itemKey, found.section) ?? item.streamId;
  if (!grantCovers(perms, streamId)) return { ok: false, reason: 'not-covered' };
  return { ok: true, section: found.section, sectionIndex: found.index, streamId };
}

/** Pure part of `listItemReminders` (exported for tests): every reminder, oldest first. */
export function parseItemReminders (events: Array<{ id: string; type: string; time?: number; content?: Record<string, any> | null }>): ItemReminder[] {
  const out: ItemReminder[] = [];
  for (const e of events ?? []) {
    if (e.type !== ET_ALERT) continue;
    const c = e.content ?? {};
    const itemKey = c.hds?.itemKey;
    if (c.hds?.kind !== ITEM_REMINDER_KIND || typeof itemKey !== 'string' || itemKey.length === 0) continue;
    const from = c.from && typeof c.from.username === 'string' ? { username: c.from.username, host: String(c.from.host ?? '') } : null;
    out.push({ alertEventId: e.id, itemKey, time: e.time ?? 0, direction: from ? 'received' : 'sent', from });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** The contact's side: when it last reminded the person of each item (its own copies), by `itemKey`. */
export function lastRemindedAt (reminders: ItemReminder[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reminders ?? []) {
    if (r.direction === 'sent' && (out[r.itemKey] ?? -Infinity) < r.time) out[r.itemKey] = r.time;
  }
  return out;
}

// ---- both sides ---- //

/**
 * The contact's side: remind the person of one item, on the own collectors stream (the plugin
 * delivers it). `sections` are the request's sections: an item outside them, unknown to the model or
 * not enterable is refused (`HDSLibError`, `reason`).
 */
export async function postItemReminder (
  connection: pryv.Connection,
  collectorStreamId: string,
  itemKey: string,
  opts: { sections: ReminderSection[]; locale?: string }
): Promise<{ alertEventId: string }> {
  if (!collectorStreamId) throw new HDSLibError('postItemReminder: collectorStreamId is required', { reason: 'no-collector-stream' });
  const refusal = checkItemReminder(itemKey, opts?.sections ?? []);
  if (refusal != null) throw new HDSLibError(`postItemReminder: cannot remind of "${itemKey}" (${refusal})`, { reason: refusal, itemKey });
  const event = await connection.apiOne('events.create', {
    streamIds: [collectorStreamId],
    type: ET_ALERT,
    content: buildItemReminderContent(itemKey, opts.locale)
  }, 'event') as { id: string };
  return { alertEventId: event.id };
}

/** The reminders on one collectors stream (either side), as `parseItemReminders` returns them. */
export async function listItemReminders (connection: pryv.Connection, collectorStreamId: string, opts: { limit?: number } = {}): Promise<ItemReminder[]> {
  const events = await connection.apiOne('events.get', {
    streams: [collectorStreamId],
    types: [ET_ALERT],
    limit: opts.limit ?? 500
  }, 'events') as Array<{ id: string; type: string; time?: number; content?: Record<string, any> }>;
  return parseItemReminders(events);
}

const TEXT: Record<string, { title: string; body: string }> = {
  en: { title: 'Reminder', body: 'Your contact asks you to fill in an entry.' },
  fr: { title: 'Rappel', body: 'Votre contact vous demande de compléter une saisie.' },
  es: { title: 'Recordatorio', body: 'Su contacto le pide que complete un registro.' }
};
