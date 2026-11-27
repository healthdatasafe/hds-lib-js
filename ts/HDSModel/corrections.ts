import { localizeText } from '../localizeText.ts';
import type { localizableText } from '../localizeText.ts';
import { HDSLibError } from '../errors.ts';
import { getModel } from './HDSModelInitAndSingleton.ts';
import { CORRECTIONS_ROOT_ID, isCorrectionStreamId } from '../cmc/correctionIds.ts';
import { holdsProposedValue } from '../cmc/conversation.ts';

/**
 * A professional's correction of one entry (data-model 4.43.0, `documentation/CORRECTIONS.md`): `correction/entry-v1`
 * on the contact's own `corr-` child of `entry-corrections`. The entry itself is never changed by the professional;
 * she applies a correction with her own app. Pure helpers: build and check one, pick the current ones, and say where
 * one stands against the live entry. Also `clientData.hdsTextFormat` (markdown text, PROVENANCE.md).
 */

export const ENTRY_CORRECTION = 'correction/entry-v1';
export const ENTRY_CORRECTION_ITEM = 'entry-correction';
export const CORRECTION_KINDS = ['change', 'add', 'remove'] as const;
export type CorrectionKind = typeof CORRECTION_KINDS[number];
/** The `authorRole` values of data-model 4.43.0, in the vocabulary's order. A newer pack may hold more. */
export const PROFESSIONAL_ROLES = ['physician', 'midwife', 'nurse', 'pharmacist', 'psychologist', 'dietitian', 'physiotherapist', 'health-educator', 'other'] as const;
export type ProfessionalRole = typeof PROFESSIONAL_ROLES[number];
export const PROFESSIONAL_ROLE_VOCABULARY = 'professional-role';
export const TEXT_FORMAT_KEY = 'hdsTextFormat';
export const TEXT_FORMAT_MARKDOWN = 'text/markdown';
/** The eventTypes whose text `hdsTextFormat` formats, and where that text is. */
const TEXT_FORMAT_FIELDS: Record<string, (content: any) => unknown> = {
  'note/txt': (c) => c,
  [ENTRY_CORRECTION]: (c) => c?.comment
};

const CORRECTED_CLIENT_DATA_KEYS = ['hdsTimePrecision', 'hdsBasis', 'hdsComparator'];
const ID_RE = /^[a-zA-Z0-9_-]+$/;

export interface EntryLike {
  id: string;
  streamIds?: string[];
  type?: string;
  time?: number;
  modified?: number;
  trashed?: boolean;
  content?: any;
  clientData?: any;
}

export interface CorrectionLike {
  id?: string;
  streamIds?: string[];
  type?: string;
  time?: number;
  created?: number;
  modified?: number;
  createdBy?: string;
  trashed?: boolean;
  content?: any;
  clientData?: any;
}

export interface Corrected { type?: string; content?: any; time?: number; clientData?: Record<string, any> }

export interface CorrectionIssue {
  code: 'wrong-type' | 'not-on-correction-child' | 'unknown-kind' | 'unknown-role' | 'field-for-kind' | 'unknown-item' |
  'item-not-correctable' | 'corrected-type-not-of-item' | 'invalid-content' | 'corrected-client-data' | 'missing-related' |
  'anchor-not-about' | 'entry-mismatch' | 'invalid-id';
  /** The content field concerned (`field-for-kind`, `invalid-id`, `missing-related`). */
  field?: string;
  eventId?: string;
}

function isPlainObject (v: unknown): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function hasOwn (o: unknown, k: string): boolean {
  return isPlainObject(o) && Object.prototype.hasOwnProperty.call(o, k);
}

/** The event ids a correction holds in its content (`entryId`, `about`, `replaces`), each to mirror in `related`. */
export function correctionEventIds (content: any): Array<{ field: 'entryId' | 'about' | 'replaces'; eventId: string }> {
  const out: Array<{ field: 'entryId' | 'about' | 'replaces'; eventId: string }> = [];
  if (!isPlainObject(content)) return out;
  for (const field of ['entryId', 'about', 'replaces'] as const) {
    if (typeof content[field] === 'string' && content[field] !== '') out.push({ field, eventId: content[field] });
  }
  return out;
}

/** The model's item, or null when the model is not loaded or does not hold it. */
function itemOf (itemKey: unknown, model: any): any {
  if (typeof itemKey !== 'string') return null;
  try {
    return model?.itemsDefs?.forKey(itemKey, false) ?? null;
  } catch {
    return null;
  }
}

/**
 * What a writer MUST include that the schema cannot say (data-model CORRECTIONS.md § What a writer MUST include), and
 * what a reader checks before showing a correction (§ Where a correction counts). Empty when it passes.
 * - `entry`: the corrected event, when the caller holds it (`entry-mismatch` when it is not the one named, or not on the
 *   item's stream with one of its types);
 * - `validateContent(type, content)`: validates `corrected.content` against its eventType's schema; hds-lib compiles no
 *   schema at runtime (no `eval` under a Content-Security-Policy), so without it the content is not checked;
 * - `writer: true`: the writer's checks; only then is an `authorRole` its pack does not know an issue (`unknown-role`).
 *   A reader reads such a role as `other`;
 * - the item checks need a loaded model; without one they are skipped.
 */
export function checkCorrection (
  event: CorrectionLike,
  opts: { entry?: EntryLike | null; model?: any; validateContent?: (type: string, content: any) => boolean; writer?: boolean } = {}
): CorrectionIssue[] {
  const issues: CorrectionIssue[] = [];
  if (event?.type !== ENTRY_CORRECTION) return [{ code: 'wrong-type' }];
  const streamIds = Array.isArray(event.streamIds) ? event.streamIds : [];
  if (streamIds.length !== 1 || !isCorrectionStreamId(streamIds[0])) issues.push({ code: 'not-on-correction-child' });
  const c = isPlainObject(event.content) ? event.content : {};
  const kind = c.kind;
  if (!(CORRECTION_KINDS as readonly string[]).includes(kind)) issues.push({ code: 'unknown-kind' });
  if (opts.writer === true && !(PROFESSIONAL_ROLES as readonly string[]).includes(c.authorRole) && !knownRole(c.authorRole, opts.model)) {
    issues.push({ code: 'unknown-role' });
  }

  const withEntry = kind === 'change' || kind === 'remove';
  const withCorrected = kind === 'change' || kind === 'add';
  const need = (field: string, wanted: boolean): void => {
    if (hasOwn(c, field) !== wanted) issues.push({ code: 'field-for-kind', field });
  };
  if ((CORRECTION_KINDS as readonly string[]).includes(kind)) {
    need('entryId', withEntry);
    need('entryModified', withEntry);
    need('corrected', withCorrected);
  }
  const corrected: Corrected = isPlainObject(c.corrected) ? c.corrected : {};
  const hasTypeContent = hasOwn(corrected, 'type') && hasOwn(corrected, 'content');
  if (hasOwn(corrected, 'type') !== hasOwn(corrected, 'content')) issues.push({ code: 'field-for-kind', field: 'corrected.type' });
  if (kind === 'add' && !hasTypeContent) issues.push({ code: 'field-for-kind', field: 'corrected.content' });
  if (kind === 'add' && hasOwn(corrected, 'time')) issues.push({ code: 'field-for-kind', field: 'corrected.time' });
  if (kind === 'change' && hasOwn(c, 'corrected') && !hasTypeContent && !hasOwn(corrected, 'time')) {
    issues.push({ code: 'field-for-kind', field: 'corrected' });
  }
  if (hasOwn(corrected, 'clientData') && !(isPlainObject(corrected.clientData) &&
    Object.keys(corrected.clientData).length > 0 && Object.keys(corrected.clientData).every((k) => CORRECTED_CLIENT_DATA_KEYS.includes(k)))) {
    issues.push({ code: 'corrected-client-data' });
  }

  const related = isPlainObject(event.clientData?.related) ? event.clientData.related : {};
  for (const { field, eventId } of correctionEventIds(c)) {
    if (!ID_RE.test(eventId) || eventId.length > 64) issues.push({ code: 'invalid-id', field, eventId });
    if (related[eventId] !== true) issues.push({ code: 'missing-related', field, eventId });
  }
  const anchor = event.clientData?.hdsSourceAnchor;
  if (anchor != null && (typeof c.about !== 'string' || anchor.eventId !== c.about)) issues.push({ code: 'anchor-not-about' });

  const model = opts.model ?? (getModel().isLoaded ? getModel() : null);
  const item = model ? itemOf(c.itemKey, model) : null;
  if (model && item == null) issues.push({ code: 'unknown-item' });
  if (item != null) {
    const streamId: string = item.data.streamId;
    if (item.isSystem || item.isAttachments || model.streams.isExplicitGrantOnly(streamId)) issues.push({ code: 'item-not-correctable' });
    if (hasOwn(corrected, 'type') && !item.eventTypes.includes(corrected.type)) issues.push({ code: 'corrected-type-not-of-item' });
    const entry = opts.entry;
    if (entry != null && withEntry) {
      const onItem = (entry.streamIds ?? []).some((s) => s === streamId || safeParents(model, s).includes(streamId));
      if (entry.id !== c.entryId || !onItem || !item.eventTypes.includes(entry.type)) issues.push({ code: 'entry-mismatch' });
    }
  }
  if (hasTypeContent && opts.validateContent && !opts.validateContent(corrected.type as string, corrected.content)) {
    issues.push({ code: 'invalid-content' });
  }
  return issues;
}

function safeParents (model: any, streamId: string): string[] {
  try {
    return model.streams.getParentsIds(streamId, false);
  } catch {
    return [];
  }
}

function knownRole (role: unknown, model: any): boolean {
  if (typeof role !== 'string') return false;
  try {
    const m = model ?? (getModel().isLoaded ? getModel() : null);
    return m?.vocabularies?.forKey(PROFESSIONAL_ROLE_VOCABULARY)?.values?.[role] != null;
  } catch {
    return false;
  }
}

export interface BuildCorrectionParams {
  /** The contact's own `corr-` child. */
  streamId: string;
  kind: CorrectionKind;
  authorRole: ProfessionalRole | string;
  itemKey: string;
  /** With `change` and `remove`: the entry, as read (its `id`, `time`, `modified`, `clientData.hdsTimePrecision`). */
  entry?: EntryLike;
  /** With `change` and `add`. */
  corrected?: Corrected;
  /** With `add`: the moment the missing entry is about, and its precision (`day`: pass 12:00 UTC of the day). */
  time?: number;
  timePrecision?: 'minute' | 'day' | 'month' | 'year';
  comment?: string;
  /** The comment is markdown (`clientData.hdsTextFormat`). */
  markdown?: boolean;
  about?: string;
  /** Where in `about` the correction was read: `{ attachmentId, page, bbox? }`; its `eventId` is set to `about`. */
  anchor?: { attachmentId: string; page: number; bbox?: number[] };
  replaces?: string;
}

/**
 * The event to create for a correction: `time` from the entry (or `time` for `add`), `entryModified` from the entry,
 * every id in content mirrored in `clientData.related`. Throws an `HDSLibError` (with `issues`) when `checkCorrection`
 * finds anything with the loaded model.
 */
export function buildCorrection (p: BuildCorrectionParams, opts: { model?: any; validateContent?: (type: string, content: any) => boolean } = {}): {
  streamIds: string[]; type: string; time: number; content: Record<string, any>; clientData: Record<string, any>;
} {
  const content: Record<string, any> = { kind: p.kind, authorRole: p.authorRole, itemKey: p.itemKey };
  const clientData: Record<string, any> = {};
  let time: number | undefined;
  if (p.kind === 'change' || p.kind === 'remove') {
    if (p.entry == null) throw new HDSLibError(`buildCorrection: a ${p.kind} needs the entry`);
    content.entryId = p.entry.id;
    content.entryModified = p.entry.modified;
    time = p.entry.time;
    const precision = p.entry.clientData?.hdsTimePrecision;
    if (precision != null) clientData.hdsTimePrecision = precision;
  } else {
    time = p.time;
    if (p.timePrecision != null) clientData.hdsTimePrecision = p.timePrecision;
  }
  if (typeof time !== 'number') throw new HDSLibError('buildCorrection: no time (the entry\'s, or `time` for an add)');
  if (p.corrected != null) content.corrected = p.corrected;
  if (p.comment != null) content.comment = p.comment;
  if (p.about != null) content.about = p.about;
  if (p.replaces != null) content.replaces = p.replaces;
  const related: Record<string, true> = {};
  for (const { eventId } of correctionEventIds(content)) related[eventId] = true;
  if (Object.keys(related).length > 0) clientData.related = related;
  if (p.anchor != null) {
    if (p.about == null) throw new HDSLibError('buildCorrection: an anchor needs `about`');
    clientData.hdsSourceAnchor = { eventId: p.about, ...p.anchor };
  }
  if (p.markdown === true) clientData[TEXT_FORMAT_KEY] = TEXT_FORMAT_MARKDOWN;
  const event = { streamIds: [p.streamId], type: ENTRY_CORRECTION, time, content, clientData };
  const issues = checkCorrection(event, { entry: p.entry, model: opts.model, validateContent: opts.validateContent, writer: true });
  if (issues.length > 0) {
    throw new HDSLibError(`buildCorrection: ${issues.map((i) => i.code + (i.field ? ` (${i.field})` : '')).join(', ')}`, { issues });
  }
  return event;
}

/** Whether an event is a correction that counts where it is: `correction/entry-v1` on a `corr-` child. */
export function isCountedCorrection (event: CorrectionLike): boolean {
  return event?.type === ENTRY_CORRECTION && Array.isArray(event.streamIds) && event.streamIds.length === 1 &&
    isCorrectionStreamId(event.streamIds[0]);
}

/** The key a correction supersedes within: its child, and its entry (for `add`, its item). */
function slotOf (event: CorrectionLike): string | null {
  const c = event.content;
  if (!isPlainObject(c)) return null;
  const target = c.kind === 'add' ? 'add:' + c.itemKey : 'entry:' + c.entryId;
  return event.streamIds![0] + '|' + target;
}

/**
 * The current corrections among `events` (read them with `state: 'all'`, so a trashed replacement still supersedes):
 * corrections that count (`isCountedCorrection`), not trashed, not named in `replaces` by another correction of the same
 * child and the same entry (for `add`, the same item). Newest `created` first.
 */
export function currentCorrections<T extends CorrectionLike> (events: T[]): T[] {
  const counted = (events ?? []).filter(isCountedCorrection);
  const superseded = new Set<string>();
  for (const e of counted) {
    const replaces = e.content?.replaces;
    const slot = slotOf(e);
    if (typeof replaces === 'string' && slot != null) superseded.add(slot + '|' + replaces);
  }
  return counted
    .filter((e) => e.trashed !== true && !(e.id != null && superseded.has(slotOf(e) + '|' + e.id)))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}

/** The current corrections of each entry, by `entryId` (`change` and `remove`; an `add` names no entry). */
export function correctionsByEntry<T extends CorrectionLike> (events: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const e of currentCorrections(events)) {
    const id = e.content?.entryId;
    if (typeof id !== 'string' || e.content?.kind === 'add') continue;
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push(e);
  }
  return out;
}

export type CorrectionState = 'applied' | 'outdated' | 'entry-gone' | 'open';

/**
 * Where a correction stands against the live entry (data-model CORRECTIONS.md § A correction and the live entry),
 * computed, never stored. `entry`:
 * - for `change` and `remove`: the event `entryId` names; `null` when it is gone (deleted); `undefined` when the
 *   reader cannot read it (a contact that reads the root but not the item): the state is then `open`, it cannot tell;
 * - for `add`: the entry carrying `clientData.related.<correction id>` (her app writes it when she applies it), or null.
 * States:
 * - `applied`: the entry is as corrected, on what `corrected` holds (type and content as CONVERSATION.md § A value she
 *   already has compares them, comparator included, absent equals absent; time and its precision; `hdsBasis` when
 *   `corrected` holds it), a `remove` whose entry is gone or trashed, an `add` whose entry exists;
 * - `outdated`: not applied, and the entry changed after the writer saw it (a signal, never a reason to refuse applying);
 * - `entry-gone`: a `change` whose entry is gone or trashed;
 * - `open`: otherwise.
 */
export function correctionState (correction: CorrectionLike, entry: EntryLike | null | undefined): CorrectionState {
  const c = correction?.content ?? {};
  if (entry === undefined) return 'open';
  const live = entry != null && entry.trashed !== true ? entry : null;
  if (c.kind === 'add') {
    return live != null && correction.id != null && live.clientData?.related?.[correction.id] === true ? 'applied' : 'open';
  }
  if (c.kind === 'remove') {
    if (live == null) return 'applied';
  } else {
    if (live == null) return 'entry-gone';
    if (isAsCorrected(live, isPlainObject(c.corrected) ? c.corrected : {}, c.itemKey)) return 'applied';
  }
  if (typeof c.entryModified === 'number' && typeof live?.modified === 'number' && live.modified > c.entryModified) return 'outdated';
  return 'open';
}

/** The live entry is as `corrected` says, on what it holds; false when it holds neither a type nor a time. */
function isAsCorrected (live: EntryLike, corrected: Corrected, itemKey: unknown): boolean {
  const hasType = hasOwn(corrected, 'type');
  const hasTime = hasOwn(corrected, 'time');
  if (!hasType && !hasTime) return false;
  const want: Record<string, any> = isPlainObject(corrected.clientData) ? corrected.clientData : {};
  if (hasType) {
    const proposal = { itemKey, type: corrected.type, content: corrected.content, clientData: want };
    if (!holdsProposedValue({ type: live.type as string, content: live.content, clientData: live.clientData }, { content: { proposal } } as any)) return false;
    if ((live.clientData?.hdsComparator ?? null) !== (want.hdsComparator ?? null)) return false;
  }
  if (hasTime && (live.time !== corrected.time || (live.clientData?.hdsTimePrecision ?? null) !== (want.hdsTimePrecision ?? null))) return false;
  if (hasOwn(want, 'hdsBasis') && live.clientData?.hdsBasis !== want.hdsBasis) return false;
  return true;
}

/** Built-in labels, for a pack without the vocabulary (as data-model 4.43.0's). */
const ROLE_LABELS: Record<string, localizableText> = {
  physician: { en: 'Physician', fr: 'Médecin', es: 'Médico' },
  midwife: { en: 'Midwife', fr: 'Sage-femme', es: 'Matrona' },
  nurse: { en: 'Nurse', fr: 'Infirmier ou infirmière', es: 'Enfermero o enfermera' },
  pharmacist: { en: 'Pharmacist', fr: 'Pharmacien ou pharmacienne', es: 'Farmacéutico o farmacéutica' },
  psychologist: { en: 'Psychologist', fr: 'Psychologue', es: 'Psicólogo o psicóloga' },
  dietitian: { en: 'Dietitian', fr: 'Diététicien ou diététicienne', es: 'Dietista' },
  physiotherapist: { en: 'Physiotherapist', fr: 'Physiothérapeute', es: 'Fisioterapeuta' },
  'health-educator': { en: 'Health educator', fr: 'Éducateur ou éducatrice en santé', es: 'Educador o educadora en salud' },
  other: { en: 'Other', fr: 'Autre', es: 'Otro' }
};

/** The label of an author's role: the pack's vocabulary, else the built-in one; a role it does not know reads as `other`. */
export function professionalRoleLabel (role: string, model: any = null): string {
  const m = model ?? (getModel().isLoaded ? getModel() : null);
  for (const r of [role, 'other']) {
    const fromPack = m?.vocabularies?.label(PROFESSIONAL_ROLE_VOCABULARY, r);
    if (fromPack) return fromPack;
    if (Object.prototype.hasOwnProperty.call(ROLE_LABELS, r)) return localizeText(ROLE_LABELS[r]);
  }
  return role;
}

/**
 * Whether an event's text is markdown (`clientData.hdsTextFormat: 'text/markdown'`, PROVENANCE.md) on an eventType the
 * key applies to (`note/txt`, `correction/entry-v1`). A reader that renders it renders no raw HTML, loads no remote
 * image, links `http`, `https` and `mailto` only with the destination visible, and shows no link preview.
 */
export function isMarkdown (event: { type?: string; clientData?: any }): boolean {
  return event?.clientData?.[TEXT_FORMAT_KEY] === TEXT_FORMAT_MARKDOWN && Object.prototype.hasOwnProperty.call(TEXT_FORMAT_FIELDS, event.type ?? '');
}

/** The text `hdsTextFormat` formats on an event (`content` of a note, the comment of a correction), or null. */
export function formattedText (event: { type?: string; content?: any }): string | null {
  const read = Object.prototype.hasOwnProperty.call(TEXT_FORMAT_FIELDS, event?.type ?? '') ? TEXT_FORMAT_FIELDS[event.type as string] : null;
  const text = read ? read(event.content) : null;
  return typeof text === 'string' ? text : null;
}

export { CORRECTIONS_ROOT_ID };
