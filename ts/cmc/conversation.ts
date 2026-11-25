/**
 * The standard conversation of a CMC relationship: questions, proposed values and answers between the person and a
 * contact (a doctor, the HDS Reader, a third party's service). data-model 4.22.0, `documentation/CONVERSATION.md`
 * (the wire contract, the source of truth for every rule named R1..R12 below) and `CUSTOM-FIELDS-AND-SYSTEM.md` (the
 * five alert kinds).
 *
 * The items live on the person's account, in two children of the `explicitGrantOnly` root `conversation-items`, one
 * pair per relationship, created by her app:
 *
 *   conversation-items/conv-<12 base36>   name = id
 *     clientData.hdsConversationItems = { relationship, direction: 'received' | 'sent' }
 *
 * - `received`, granted `contribute`: the contact's `question`, `proposed-value` and (4.26.0) `proposed-document`
 *   events;
 * - `sent`, granted `read`: her `answer` events.
 *
 * What travels over CMC is a pointer: a `notification/alert-cmc` whose `hds` block carries kinds, event ids, codes
 * and counts only, with fixed words. **Her app writes the values** she confirmed (`acceptProposedValues`), never the
 * contact.
 *
 * Both sides are here, as in `documents.ts`: the person's app (streams, reading, answering, writing values) and the
 * primitives a contact uses through its grant (`writeQuestion`, `writeProposedValues`, `postConversationAlert`),
 * which lib-bridge-js wraps for bridges. Writers validate (R8): every item against the pack's
 * `message/hds-conversation-v1` and the contract's conditional rules, every alert's `hds` against
 * `hds-conversation-alert.json` (mirrored here as `CONVERSATION_ALERT_HDS_SCHEMA`). Readers never validate: they
 * dispatch on `kind` and skip what they do not know.
 */

import type { localizableText } from '../localizeText.ts';
import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { schemaIssues } from '../utils/schemaCheck.ts';
import { pryvErrorCode } from './appScope.ts';
import { cmcText } from './cmcText.ts';
import { ET_ALERT } from './dataExport.ts';
import { DOCUMENTS_STREAM_ID, fileDocument, relationshipIdOf } from './documents.ts';
import { shareStreamsAgain } from './scope.ts';
import type { ScopeChangeOptions, ScopeChangeResult, ScopePermission, ScopeRelationship } from './scope.ts';

export const CONVERSATION_ROOT_ID = 'conversation-items';
export const CONVERSATION_STREAM_PREFIX = 'conv-';
export const ET_CONVERSATION = 'message/hds-conversation-v1';

export const CONVERSATION_ALERT_KINDS = {
  TASK_STATUS: 'task-status',
  NOTICE: 'notice',
  QUESTION: 'question',
  PROPOSED_VALUES: 'proposed-values',
  ANSWER: 'answer'
} as const;
export type ConversationAlertKind = typeof CONVERSATION_ALERT_KINDS[keyof typeof CONVERSATION_ALERT_KINDS];

export const ITEM_KINDS = { QUESTION: 'question', PROPOSED_VALUE: 'proposed-value', PROPOSED_DOCUMENT: 'proposed-document', ANSWER: 'answer' } as const;
export type ConversationItemKind = typeof ITEM_KINDS[keyof typeof ITEM_KINDS];

export const QUESTION_CODES = {
  WHICH_SPECIMEN: 'which-specimen',
  WHICH_UNIT: 'which-unit',
  WHICH_ANALYTE: 'which-analyte',
  IS_FASTING: 'is-fasting',
  WHICH_DATE: 'which-date',
  IS_THIS_YOURS: 'is-this-yours',
  /** 4.26.0: the kind of a document waiting for it, about a `proposed-document`. */
  WHICH_DOCUMENT_KIND: 'which-document-kind',
  /** 4.26.0: the date of a document waiting for it, about a `proposed-document`. */
  WHICH_DOCUMENT_DATE: 'which-document-date'
} as const;

/** The options of `which-specimen`, registered in CONVERSATION.md § Specimen codes (4.26.0), with their labels. */
export const SPECIMEN_CODES: Readonly<Record<string, Record<'en' | 'fr' | 'es', string> & localizableText>> = {
  'serum-plasma': { en: 'Serum or plasma', fr: 'Sérum ou plasma', es: 'Suero o plasma' },
  'whole-blood': { en: 'Whole blood', fr: 'Sang total', es: 'Sangre total' },
  'citrated-plasma': { en: 'Citrated plasma (coagulation)', fr: 'Plasma citraté (coagulation)', es: 'Plasma citratado (coagulación)' },
  rbc: { en: 'Red blood cells', fr: 'Globules rouges', es: 'Glóbulos rojos' },
  urine: { en: 'Urine', fr: 'Urine', es: 'Orina' },
  'urine-24h': { en: '24-hour urine', fr: 'Urines de 24 heures', es: 'Orina de 24 horas' },
  semen: { en: 'Semen', fr: 'Sperme', es: 'Semen' },
  csf: { en: 'Cerebrospinal fluid', fr: 'Liquide céphalorachidien', es: 'Líquido cefalorraquídeo' },
  stool: { en: 'Stool', fr: 'Selles', es: 'Heces' },
  saliva: { en: 'Saliva', fr: 'Salive', es: 'Saliva' }
};

/** The document `clientData` keys of 4.26.0 (DOCUMENTS.md, PROVENANCE.md). */
export const DOCUMENT_PENDING_KEY = 'hdsDocumentPending';
export const DOCUMENT_VALUES_KEY = 'hdsDocumentValues';
export const PRINTED_IN_KEY = 'hdsPrintedIn';
export type DocumentField = 'time' | 'kind';
/** `answer.note`: her comment, plain text (CONVERSATION.md § Her note). */
export const NOTE_MAX_LENGTH = 1000;

/** `on-hold` (data-model 4.33.0): the contact has the document and cannot work on it now; not settled, nothing confirmable. */
export const TASK_STATUSES = ['received', 'reading', 'on-hold', 'awaiting-answers', 'done', 'error'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const ANSWER_ACTIONS = ['confirm', 'correct', 'not-mine', 'skip', 'choose', 'request-item', 'duplicate'] as const;
export type AnswerAction = typeof ANSWER_ACTIONS[number];

export const NOTICE_CODES = {
  NO_RESULT_FOUND: 'no-result-found',
  TYPED_TEXT_NOT_READ: 'typed-text-not-read',
  SEVERAL_SAMPLING_DATES: 'several-sampling-dates',
  /** 4.26.0: the contact does not read her notes, once per document. */
  NOTE_NOT_READ: 'note-not-read'
} as const;
export const ERROR_CODES = { NO_ATTACHMENT: 'no-attachment', WRITE_FAILED: 'write-failed', READING_FAILED: 'reading-failed' } as const;

/** `proposed-value.status` values her app may offer to confirm; any other (or unknown, R8) is shown, not confirmable. */
export const CONFIRMABLE_STATUSES: readonly string[] = ['clear', 'check'];

/**
 * R9, the engine bound to the relationship: the engines whose proposals a relationship's app is vouched for, by CMC
 * app code. In 4.22.0, `hds-reader` from the HDS Reader's relationship only.
 */
export const VOUCHED_ENGINES: Readonly<Record<string, readonly string[]>> = { 'hds-bridge-reader': ['hds-reader'] };

/** The engines vouched for a relationship's app (`VOUCHED_ENGINES`); none for an unknown app. */
export function vouchedEnginesFor (appCode: string | null | undefined): string[] {
  return appCode != null && Object.hasOwn(VOUCHED_ENGINES, appCode) ? [...VOUCHED_ENGINES[appCode]] : [];
}

export type ConversationDirection = 'received' | 'sent';

/** A conversation child as the person's stream tree lists it. */
export interface ConversationStream {
  id: string;
  relationship: string;
  direction: ConversationDirection;
}

/** The two children of one relationship. */
export interface ConversationStreams {
  received: string;
  sent: string;
}

/** A relationship as the person's helpers need it (a `CmcRelationship` fits). */
export type ConversationRelationship = ScopeRelationship;

/** A `message/hds-conversation-v1` event a reader kept (R2: the right kind on the right child). */
export interface ConversationItem {
  id: string;
  streamId: string;
  direction: ConversationDirection;
  kind: ConversationItemKind;
  /** The document's event id. */
  about: string;
  time: number;
  created: number;
  modified: number;
  content: Record<string, any>;
}

/** A conversation alert, one per alert event once duplicates are dropped. */
export interface ConversationAlert {
  alertEventId: string;
  kind: ConversationAlertKind;
  hds: Record<string, any>;
  time: number;
  /** `received` when the alert carries `content.from` (delivered by the peer), else `sent` (the writer's own copy). */
  direction: 'sent' | 'received';
  from: { username: string; host: string } | null;
}

// ---- the alert `hds` block: published schema, mirrored ---- //

const ID = { type: 'string', maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' };
const CODE = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$' };
const COUNT = { type: 'integer', minimum: 0 };
function alertBranch (kind: string, required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, required: ['kind', ...required], properties: { kind: { type: 'string', enum: [kind] }, ...properties } };
}

/**
 * `json-schemas/hds-conversation-alert.json` of data-model 4.22.0 (descriptions left out). The cores do not validate
 * `hds`, so every writer checks it; `tests/cmcConversation.test.js` compares this copy with the published one.
 */
export const CONVERSATION_ALERT_HDS_SCHEMA = {
  type: 'object',
  required: ['kind'],
  oneOf: [
    alertBranch('task-status', ['about', 'status', 'attempt'], {
      about: ID,
      status: { type: 'string', enum: [...TASK_STATUSES] },
      attempt: { type: 'integer', minimum: 1 },
      counts: { type: 'object', additionalProperties: false, properties: { proposed: COUNT, questions: COUNT, keptAside: COUNT, dropped: COUNT } },
      errorCode: CODE
    }),
    alertBranch('notice', ['code'], { code: CODE, about: ID }),
    alertBranch('question', ['eventId', 'about'], { eventId: ID, about: ID }),
    alertBranch('proposed-values', ['about', 'count'], { about: ID, count: { type: 'integer', minimum: 1 } }),
    alertBranch('answer', ['eventId', 'inReplyTo', 'about'], { eventId: ID, inReplyTo: ID, about: ID })
  ]
};

/** The issues of an alert's `hds` block: the published schema, plus `errorCode` MUST with `status: error`. */
export function checkConversationAlertHds (hds: unknown): string[] {
  const issues = schemaIssues(CONVERSATION_ALERT_HDS_SCHEMA, hds, 'hds');
  const h = hds as Record<string, any> | null;
  if (h?.kind === 'task-status' && h.status === 'error' && h.errorCode == null) issues.push('hds: errorCode is required with status error');
  return issues;
}

/**
 * Alert content for one conversation kind (R12): the kind's fixed `title` and `body` in every language the contract
 * defines, `code: hds-<kind>`, and the checked `hds` block. Never anything about the document.
 */
export function buildConversationAlertContent (hds: Record<string, unknown>): Record<string, unknown> {
  const issues = checkConversationAlertHds(hds);
  if (issues.length > 0) throw new HDSLibError('buildConversationAlertContent: invalid hds block: ' + issues.join('; '), { reason: 'invalid-alert', issues });
  const kind = hds.kind as ConversationAlertKind;
  return { level: 'info', title: cmcText(ALERT_TEXT[kind].title), body: cmcText(ALERT_TEXT[kind].body), code: 'hds-' + kind, hds: { ...hds } };
}

/**
 * Pure part of `listConversationAlerts`: the conversation alerts, oldest first, a duplicate (two devices) kept once
 * per direction, keyed as CUSTOM-FIELDS-AND-SYSTEM.md says: `task-status` by (about, attempt, status), `notice` by
 * (code, about), `question` and `answer` by eventId, `proposed-values` by about (a wake-up).
 */
export function parseConversationAlerts (events: Array<{ id: string; type: string; time?: number; content?: Record<string, any> | null }>): ConversationAlert[] {
  const kinds = new Set<string>(Object.values(CONVERSATION_ALERT_KINDS));
  const ids = new Set<string>();
  const byKey = new Map<string, number>();
  const out: Array<ConversationAlert | null> = [];
  const sorted = [...(events ?? [])].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  for (const e of sorted) {
    if (e.type !== ET_ALERT || ids.has(e.id)) continue;
    const c = e.content ?? {};
    const hds = c.hds;
    if (hds == null || typeof hds !== 'object' || !kinds.has(hds.kind)) continue;
    ids.add(e.id);
    const from = c.from && typeof c.from.username === 'string' ? { username: c.from.username, host: String(c.from.host ?? '') } : null;
    const direction = from ? 'received' : 'sent';
    const key = direction + ':' + alertKey(hds);
    const alert: ConversationAlert = { alertEventId: e.id, kind: hds.kind, hds, time: e.time ?? 0, direction, from };
    const earlier = byKey.get(key);
    if (earlier != null) {
      // a `task-status` repeated later (a restarted contact reusing an attempt) is the newer state (R4): keep the latest
      if (hds.kind !== 'task-status') continue;
      out[earlier] = null;
    }
    byKey.set(key, out.length);
    out.push(alert);
  }
  return out.filter((a): a is ConversationAlert => a != null);
}

function alertKey (hds: Record<string, any>): string {
  switch (hds.kind) {
    case 'task-status': return ['task-status', hds.about, hds.attempt, hds.status].join('|');
    case 'notice': return ['notice', hds.code, hds.about ?? ''].join('|');
    case 'proposed-values': return ['proposed-values', hds.about].join('|');
    default: return [hds.kind, hds.eventId].join('|');
  }
}

/**
 * R4: the state of the work on one document, the latest `task-status` of `direction` (default `received`, the
 * contact's as her app reads them) by alert time, `attempt` breaking a tie. Null when none. An unknown `status` is
 * read as in progress (R8) by the caller.
 */
export function taskStatusOf (alerts: ConversationAlert[], about: string, direction: 'sent' | 'received' = 'received'): ConversationAlert | null {
  let best: ConversationAlert | null = null;
  for (const a of alerts ?? []) {
    if (a.kind !== 'task-status' || a.direction !== direction || a.hds.about !== about) continue;
    if (best == null || a.time > best.time || (a.time === best.time && (a.hds.attempt ?? 0) > (best.hds.attempt ?? 0))) best = a;
  }
  return best;
}

/**
 * The latest `done` of the work on one document (her app's side), whatever the contact posted after it (the document shared
 * again, then read or on hold): what the removal of her notes waits for (`notesToRemove`). Null when none.
 */
export function latestDoneOf (alerts: ConversationAlert[], about: string): ConversationAlert | null {
  return taskStatusOf((alerts ?? []).filter(a => a.hds?.status === 'done'), about);
}

// ---- streams ---- //

/** A new conversation child id: `conv-` + 12 lowercase base36 characters, random. */
export function newConversationStreamId (): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return CONVERSATION_STREAM_PREFIX + Array.from(bytes, b => (b % 36).toString(36)).join('');
}

export function isConversationStreamId (streamId: unknown): streamId is string {
  return typeof streamId === 'string' && /^conv-[a-z0-9]{12}$/.test(streamId);
}

/** The conversation children in a stream tree (`streams.get` output, any depth), with a valid `hdsConversationItems`. */
export function conversationStreamsIn (streams: Array<{ id: string; parentId?: string | null; clientData?: any; children?: any[] }>): ConversationStream[] {
  const out: ConversationStream[] = [];
  const walk = (list: any[]): void => {
    for (const s of list ?? []) {
      const info = s.clientData?.hdsConversationItems;
      if (s.parentId === CONVERSATION_ROOT_ID && isConversationStreamId(s.id) && typeof info?.relationship === 'string' &&
        (info.direction === 'received' || info.direction === 'sent')) {
        out.push({ id: s.id, relationship: info.relationship, direction: info.direction });
      }
      if (Array.isArray(s.children)) walk(s.children);
    }
  };
  walk(streams);
  return out;
}

/**
 * The conversation children of a grant: `contribute` on a `conv-` id is the received one, `read` the sent one. A
 * contact reads its own two children this way; the person's app gets them from her streams (`conversationStreamsFor`).
 */
export function conversationStreamsOf (perms: ScopePermission[]): { received: string | null; sent: string | null } {
  let received: string | null = null;
  let sent: string | null = null;
  for (const p of perms ?? []) {
    if (!isConversationStreamId(p.streamId)) continue;
    if (p.level === 'contribute' || p.level === 'manage') received ??= p.streamId;
    else if ((p.level ?? 'read') === 'read') sent ??= p.streamId;
  }
  return { received, sent };
}

/** The label of a child (its name is never shown), from `direction` and the viewer's side. */
export function conversationStreamLabel (direction: ConversationDirection, viewer: 'person' | 'contact', locale: string = 'en'): string {
  const labels = STREAM_LABELS[direction][viewer];
  return labels[locale] ?? labels.en;
}

/** The children in the person's account. Empty when the root does not exist yet. */
export async function listConversationStreams (connection: pryv.Connection, opts: { includeTrashed?: boolean } = {}): Promise<ConversationStream[]> {
  try {
    const params: Record<string, unknown> = { parentId: CONVERSATION_ROOT_ID };
    if (opts.includeTrashed === true) params.state = 'all';
    const streams = await connection.apiOne('streams.get', params, 'streams') as any[];
    return conversationStreamsIn(streams);
  } catch (e) {
    if (pryvErrorCode(e) === 'unknown-referenced-resource') return [];
    throw e;
  }
}

/** The relationship's two children in the person's account, or null when either is missing. */
export async function conversationStreamsFor (connection: pryv.Connection, relationship: string): Promise<ConversationStreams | null> {
  const base = relationshipIdOf(relationship);
  const mine = (await listConversationStreams(connection)).filter(s => s.relationship === base);
  const received = mine.find(s => s.direction === 'received')?.id;
  const sent = mine.find(s => s.direction === 'sent')?.id;
  return received != null && sent != null ? { received, sent } : null;
}

/** Create the `conversation-items` root (with its model name) if missing. Idempotent. */
export async function ensureConversationRoot (connection: pryv.Connection): Promise<void> {
  let name = 'Conversation items';
  try { name = getModel().streams.getDataById(CONVERSATION_ROOT_ID).name ?? name; } catch { /* model not loaded */ }
  try {
    await connection.apiOne('streams.create', { id: CONVERSATION_ROOT_ID, name });
  } catch (e) {
    if (pryvErrorCode(e) !== 'item-already-exists') throw e;
  }
}

/**
 * The relationship's two children, created when missing (root first), and the contact granted `contribute` on
 * `received` and `read` on `sent`, one child at a time, never the root, in one scope update waited for. Call it when
 * she accepts a contact that declares the conversation, or before its first item. Pass a freshly read relationship
 * (the scope update writes the whole permission set from `rel.grantedPermissions`).
 */
export async function ensureConversationStreams (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  opts: ScopeChangeOptions = {}
): Promise<ConversationStreams & { scopeUpdate: ScopeChangeResult | null }> {
  if (!rel?.accessId) throw new HDSLibError('ensureConversationStreams: the relationship\'s accessId is required');
  const relationship = relationshipIdOf(rel.accessId);
  const granted = conversationStreamsOf(rel.grantedPermissions);
  const existing = (await listConversationStreams(connection)).filter(s => s.relationship === relationship);
  const ids: Partial<ConversationStreams> = {};
  for (const direction of ['received', 'sent'] as const) {
    const fromGrant = granted[direction];
    ids[direction] = (fromGrant != null && existing.some(s => s.id === fromGrant)) ? fromGrant : existing.find(s => s.direction === direction)?.id;
    if (ids[direction] == null) {
      await ensureConversationRoot(connection);
      const id = newConversationStreamId();
      // pryv's typings take flat clientData values only
      await connection.apiOne('streams.create', {
        id,
        name: id,
        parentId: CONVERSATION_ROOT_ID,
        clientData: { hdsConversationItems: { relationship, direction } }
      } as any, 'stream');
      ids[direction] = id;
    }
  }
  const streams = ids as ConversationStreams;
  const levels: Record<string, string> = { [streams.received]: 'contribute', [streams.sent]: 'read' };
  const missing = Object.keys(levels).filter(id => !(rel.grantedPermissions ?? []).some(p => p.streamId === id && p.level === levels[id]));
  if (missing.length === 0) return { ...streams, scopeUpdate: null };
  const scopeUpdate = await shareStreamsAgain(connection, rel, missing, { ...opts, levels, waitForCompletion: true });
  return { ...streams, scopeUpdate };
}

/** When a relationship ends: both children deleted with `mergeEventsWithParent: false`. The values she wrote stay. */
export async function cleanupConversationStreams (connection: pryv.Connection, relationship: string): Promise<string[]> {
  const base = relationshipIdOf(relationship);
  const mine = (await listConversationStreams(connection, { includeTrashed: true })).filter(s => s.relationship === base);
  for (const s of mine) await deleteTwice(connection, 'streams.delete', { id: s.id, mergeEventsWithParent: false });
  return mine.map(s => s.id);
}

/**
 * Delete every child whose relationship no longer exists (after a restore, accesses are not restored). Without
 * `liveRelationships` they are read from the accounts' accesses, which needs a personal token.
 */
export async function cleanupOrphanConversationStreams (connection: pryv.Connection, liveRelationships?: string[]): Promise<string[]> {
  const children = await listConversationStreams(connection, { includeTrashed: true });
  if (children.length === 0) return [];
  if (liveRelationships == null) {
    const info = await connection.accessInfo() as { type?: string };
    if (info?.type !== 'personal') throw new HDSLibError('cleanupOrphanConversationStreams: reading the live relationships needs a personal token', { reason: 'not-personal' });
    const accesses = await connection.apiOne('accesses.get', { includeExpired: true }, 'accesses') as Array<{ id: string }>;
    liveRelationships = accesses.map(a => a.id);
  }
  const live = new Set(liveRelationships.map(relationshipIdOf));
  const deleted: string[] = [];
  for (const r of [...new Set(children.map(s => s.relationship))].filter(r => !live.has(r))) {
    deleted.push(...await cleanupConversationStreams(connection, r));
  }
  return deleted;
}

// ---- items: reading ---- //

/**
 * Pure part of `listConversationItems`: the items a reader keeps (R2): a `question` or `proposed-value` only on a
 * `received` child, an `answer` only on a `sent` child, each of `streams` (one relationship's children, or several).
 * Trashed events, other types, unknown kinds (R8) and items without `about` are skipped. Oldest first.
 */
export function parseConversationItems (events: any[], streams: ConversationStream[] | ConversationStreams): ConversationItem[] {
  const children = Array.isArray(streams)
    ? streams
    : [{ id: streams.received, direction: 'received' as const, relationship: '' }, { id: streams.sent, direction: 'sent' as const, relationship: '' }];
  const direction = new Map(children.map(s => [s.id, s.direction]));
  const out: ConversationItem[] = [];
  for (const e of events ?? []) {
    if (e?.type !== ET_CONVERSATION || e.trashed === true) continue;
    const c = e.content;
    if (c == null || typeof c !== 'object' || typeof c.about !== 'string') continue;
    const on = (e.streamIds ?? []).filter((id: string) => direction.has(id));
    if (on.length !== 1) continue;
    const dir = direction.get(on[0])!;
    const allowed = dir === 'received' ? (c.kind === 'question' || c.kind === 'proposed-value' || c.kind === 'proposed-document') : c.kind === 'answer';
    if (!allowed) continue;
    out.push({
      id: e.id,
      streamId: on[0],
      direction: dir,
      kind: c.kind,
      about: c.about,
      time: e.time ?? 0,
      created: e.created ?? e.time ?? 0,
      modified: e.modified ?? e.created ?? e.time ?? 0,
      content: c
    });
  }
  return out.sort((a, b) => a.created - b.created || a.time - b.time);
}

/**
 * The items of one relationship's children (either side, through a grant or her token), of one document when
 * `about`. Every page is read: her answers stay on `sent` for the life of the relationship, and an answer left out
 * would let a written candidate be proposed again (R5).
 */
export async function listConversationItems (
  connection: pryv.Connection,
  streams: ConversationStreams,
  opts: { about?: string } = {}
): Promise<ConversationItem[]> {
  const events: any[] = [];
  for (let skip = 0; ; skip += ITEMS_PAGE) {
    const page = await connection.apiOne('events.get', {
      streams: [streams.received, streams.sent],
      types: [ET_CONVERSATION],
      limit: ITEMS_PAGE,
      skip
    } as any, 'events') as any[];
    events.push(...page);
    if (page.length < ITEMS_PAGE) break;
  }
  const items = parseConversationItems(events, streams);
  return opts.about == null ? items : items.filter(i => i.about === opts.about);
}

const ITEMS_PAGE = 500;

export type ProposedValueState = 'open' | 'confirmed' | 'corrected' | 'skipped' | 'requested' | 'duplicate' | 'replaced';

export interface ProposedValueView {
  item: ConversationItem;
  candidateId: string;
  state: ProposedValueState;
  /** The answer that settled it (the one that wrote it, else the latest that counts). */
  answer: ConversationItem | null;
  /** The value event her app wrote for it (`answer.written`), when confirmed or corrected. */
  writtenEventId: string | null;
  /** The candidate that replaces it (`replaces`), when re-proposed after a question. */
  replacedBy: string | null;
}

export interface QuestionView {
  item: ConversationItem;
  code: string;
  /** A bare HDS code this version knows; an unknown or `x-` code is shown, not answerable (R8). */
  answerable: boolean;
  /** The latest answer that counts (not void, its action allowed for the code), a `skip` only when nothing else. */
  answer: ConversationItem | null;
  /** `skipped`: only `skip` answers, which settle nothing (§ Answers). */
  state: 'open' | 'answered' | 'skipped';
}

/** The date an answer to `which-date` gave: `time` absent when `timePrecision` is `unknown`. */
export interface AnsweredDate { time?: number; timePrecision: string }

/** 4.26.0: `confirmed` / `corrected` (her app wrote `applied`), `skipped` (her tap), `not-pending` (nothing left to apply). */
export type ProposedDocumentState = 'open' | 'confirmed' | 'corrected' | 'skipped' | 'not-pending' | 'replaced';

/** A `proposed-document` (4.26.0): a document's date and kind proposed by the contact. */
export interface ProposedDocumentView {
  item: ConversationItem;
  candidateId: string;
  state: ProposedDocumentState;
  /** The answer that settled it (an answer whose `inReplyTo` is it), or the latest that counts. */
  answer: ConversationItem | null;
  /** The fields her app wrote (`answer.applied`), when confirmed or corrected. */
  applied: DocumentField[] | null;
  replacedBy: string | null;
}

/** What her answers to `which-document-kind` and `which-document-date` supplied for one proposed document. */
export interface DocumentFieldsAnswered { documentKind?: string; date?: AnsweredDate }

/** One document's conversation, settled from its items (R3, R5, § Answers). */
export interface DocumentConversation {
  about: string;
  proposedValues: ProposedValueView[];
  questions: QuestionView[];
  /** Every answer, those that do not count included (void, or an action not allowed for what they answer). */
  answers: ConversationItem[];
  /** Every item of the document on the `received` child, duplicates included (R10 deletes them all). */
  received: ConversationItem[];
  /**
   * Every candidate her app wrote (the `written` entries of her `confirm` and `correct` answers), by candidateId → the
   * value's event id, also when its proposed value was deleted since (R10): never proposed again (R5).
   */
  writtenCandidates: Record<string, string>;
  /**
   * `is-this-yours`: none asked, asked and not confirmed, every one confirmed, or `not-mine` (the latest wins). A
   * `not-mine` stays `not-mine` once its question is deleted (R10).
   */
  identity: 'not-asked' | 'open' | 'confirmed' | 'not-mine';
  /** The `which-date` answer about the whole document. */
  documentDate: AnsweredDate | null;
  /** `which-date` answers about one candidate, by candidateId. */
  candidateDates: Record<string, AnsweredDate>;
  /** 4.26.0: the document's proposed date and kind, by candidate (the latest item of each). */
  proposedDocuments: ProposedDocumentView[];
  /** 4.26.0: her `which-document-kind` / `which-document-date` answers, by the proposed document's candidateId. */
  documentAnswers: Record<string, DocumentFieldsAnswered>;
}

const PV_ACTIONS = new Set(['confirm', 'correct', 'skip', 'request-item', 'duplicate']);
const PD_ACTIONS = new Set(['confirm', 'correct', 'skip']);
const CHOOSE_CODES = new Set<string>([QUESTION_CODES.WHICH_SPECIMEN, QUESTION_CODES.WHICH_UNIT, QUESTION_CODES.WHICH_ANALYTE, QUESTION_CODES.IS_FASTING]);
const DOCUMENT_CODES = new Set<string>([QUESTION_CODES.WHICH_DOCUMENT_KIND, QUESTION_CODES.WHICH_DOCUMENT_DATE]);
const KNOWN_CODES = new Set<string>(Object.values(QUESTION_CODES));

/** The actions an answer to a question with `code` may carry (§ Answers, by what they answer). */
function questionActions (code: string): Set<string> {
  if (CHOOSE_CODES.has(code) || code === QUESTION_CODES.WHICH_DOCUMENT_KIND) return new Set(['choose', 'skip']);
  if (code === QUESTION_CODES.WHICH_DATE || code === QUESTION_CODES.WHICH_DOCUMENT_DATE) return new Set(['confirm', 'skip']);
  if (code === QUESTION_CODES.IS_THIS_YOURS) return new Set(['confirm', 'not-mine', 'skip']);
  return new Set(['skip']);
}

/**
 * Settle one document's conversation from its items (either side). An answer counts when its action is allowed for
 * what it answers and it is not void (R3: no event it covers was modified after the answer was created). A proposed
 * value with a `written` entry is confirmed or corrected for good; otherwise its latest counting answer decides, and
 * a later proposed value naming it in `replaces` makes it `replaced`.
 */
export function conversationOf (items: ConversationItem[], about: string): DocumentConversation {
  const mine = (items ?? []).filter(i => i.about === about);
  const byId = new Map(mine.map(i => [i.id, i]));
  const latestByCandidate = (kind: string): Map<string, ConversationItem> => {
    const out = new Map<string, ConversationItem>();
    for (const i of mine) {
      if (i.kind !== kind || typeof i.content.candidateId !== 'string') continue;
      const prev = out.get(i.content.candidateId);
      if (prev == null || i.modified > prev.modified) out.set(i.content.candidateId, i);
    }
    return out;
  };
  const pvByCandidate = latestByCandidate('proposed-value');
  const pdByCandidate = latestByCandidate('proposed-document');
  const answers = mine.filter(i => i.kind === 'answer');

  const covered = (a: ConversationItem): ConversationItem[] => {
    const out: ConversationItem[] = [];
    const target = byId.get(a.content.inReplyTo);
    if (target) out.push(target);
    for (const c of [...(a.content.candidateIds ?? []), target?.content.candidateId]) {
      const pv = typeof c === 'string' ? (pvByCandidate.get(c) ?? pdByCandidate.get(c)) : undefined;
      if (pv && !out.includes(pv)) out.push(pv);
    }
    return out;
  };
  const counts = (a: ConversationItem): boolean => {
    const target = byId.get(a.content.inReplyTo);
    if (target == null) return false;
    const allowed = target.kind === 'question' ? questionActions(target.content.code) : target.kind === 'proposed-document' ? PD_ACTIONS : PV_ACTIONS;
    if (!allowed.has(a.content.action)) return false;
    if (a.content.basis != null && !basisFits(a.content, target)) return false;
    return !covered(a).some(c => c.modified > a.created);
  };
  const counting = answers.filter(counts);

  const replacedBy = new Map<string, string>();
  for (const pv of [...pvByCandidate.values(), ...pdByCandidate.values()]) {
    if (typeof pv.content.replaces === 'string') replacedBy.set(pv.content.replaces, pv.content.candidateId);
  }

  // 4.26.0: answered means an answer whose inReplyTo is the proposed document (a which-document-date answer naming it
  // in candidateIds answers its question, not the proposal)
  const proposedDocuments: ProposedDocumentView[] = [...pdByCandidate.values()].map(item => {
    const candidateId = item.content.candidateId;
    const onIt = counting.filter(a => byId.get(a.content.inReplyTo)?.kind === 'proposed-document' && (a.content.candidateIds ?? []).includes(candidateId));
    const writing = onIt.filter(a => WRITING_ACTIONS.has(a.content.action) && Array.isArray(a.content.applied)).at(-1);
    if (writing) {
      const applied = (writing.content.applied as unknown[]).filter((f): f is DocumentField => f === 'time' || f === 'kind');
      return { item, candidateId, state: writing.content.action === 'correct' ? 'corrected' : 'confirmed', answer: writing, applied, replacedBy: null };
    }
    const latest = onIt.filter(a => a.content.action === 'skip').at(-1) ?? null;
    const replacement = replacedBy.get(candidateId) ?? null;
    let state: ProposedDocumentState = 'open';
    if (replacement != null) state = 'replaced';
    else if (latest != null) state = latest.content.basis === BASES.NOT_PENDING ? 'not-pending' : 'skipped';
    return { item, candidateId, state, answer: latest, applied: null, replacedBy: replacement };
  });

  const proposedValues: ProposedValueView[] = [...pvByCandidate.values()].map(item => {
    const candidateId = item.content.candidateId;
    const onIt = counting.filter(a => byId.get(a.content.inReplyTo)?.kind === 'proposed-value' && (a.content.candidateIds ?? []).includes(candidateId));
    const writing = onIt.find(a => WRITING_ACTIONS.has(a.content.action) && (a.content.written ?? []).some((w: any) => w?.candidateId === candidateId));
    if (writing) {
      const w = writing.content.written.find((x: any) => x?.candidateId === candidateId);
      return { item, candidateId, state: writing.content.action === 'correct' ? 'corrected' : 'confirmed', answer: writing, writtenEventId: w.eventId, replacedBy: null };
    }
    const latest = onIt.filter(a => a.content.action !== 'confirm' && a.content.action !== 'correct').at(-1) ?? null;
    const replacement = replacedBy.get(candidateId) ?? null;
    let state: ProposedValueState = 'open';
    if (replacement != null) state = 'replaced';
    else if (latest?.content.action === 'skip') state = 'skipped';
    else if (latest?.content.action === 'request-item') state = 'requested';
    else if (latest?.content.action === 'duplicate') state = 'duplicate';
    return { item, candidateId, state, answer: latest, writtenEventId: null, replacedBy: replacement };
  });

  const questions: QuestionView[] = mine.filter(i => i.kind === 'question').map(item => {
    const answer = counting.filter(a => a.content.inReplyTo === item.id && a.content.action !== 'skip').at(-1) ??
      counting.filter(a => a.content.inReplyTo === item.id).at(-1) ?? null;
    const state = answer == null ? 'open' : answer.content.action === 'skip' ? 'skipped' : 'answered';
    return { item, code: item.content.code, answerable: KNOWN_CODES.has(item.content.code), answer, state };
  });

  let identity: DocumentConversation['identity'] = 'not-asked';
  const identityQuestions = questions.filter(q => q.code === QUESTION_CODES.IS_THIS_YOURS);
  if (identityQuestions.length > 0) {
    const settled = identityQuestions.map(q => counting.filter(a => a.content.inReplyTo === q.item.id && a.content.action !== 'skip').at(-1)?.content.action);
    if (settled.includes('not-mine')) identity = 'not-mine';
    else identity = settled.every(a => a === 'confirm') ? 'confirmed' : 'open';
  }
  // a `not-mine` whose question was deleted since (R10) still holds, unless a later identity confirmation counts
  const orphanNotMine = answers.filter(a => a.content.action === 'not-mine' && !byId.has(a.content.inReplyTo)).at(-1);
  if (orphanNotMine != null) {
    const laterConfirm = counting.some(a => a.content.action === 'confirm' && a.created > orphanNotMine.created &&
      byId.get(a.content.inReplyTo)?.content.code === QUESTION_CODES.IS_THIS_YOURS);
    if (!laterConfirm) identity = 'not-mine';
  }

  let documentDate: AnsweredDate | null = null;
  const candidateDates: Record<string, AnsweredDate> = {};
  for (const q of questions) {
    if (q.code !== QUESTION_CODES.WHICH_DATE || q.answer?.content.action !== 'confirm') continue;
    const { time, timePrecision } = q.answer.content;
    // R8: an unknown precision is read as absent, so the answer gives no date
    if (!TIME_PRECISIONS.has(timePrecision) || (timePrecision !== 'unknown' && typeof time !== 'number')) continue;
    const date: AnsweredDate = timePrecision === 'unknown' ? { timePrecision } : { time, timePrecision };
    if (typeof q.item.content.candidateId === 'string') candidateDates[q.item.content.candidateId] = date;
    else documentDate = date;
  }

  const documentAnswers: Record<string, DocumentFieldsAnswered> = {};
  for (const q of questions) {
    const cid = q.item.content.candidateId;
    if (!DOCUMENT_CODES.has(q.code) || typeof cid !== 'string' || q.answer == null) continue;
    const a = q.answer.content;
    const into = documentAnswers[cid] ??= {};
    if (q.code === QUESTION_CODES.WHICH_DOCUMENT_KIND && a.action === 'choose' && typeof a.option === 'string') into.documentKind = a.option;
    if (q.code === QUESTION_CODES.WHICH_DOCUMENT_DATE && a.action === 'confirm' && TIME_PRECISIONS.has(a.timePrecision) &&
      (a.timePrecision === 'unknown' || typeof a.time === 'number')) {
      into.date = a.timePrecision === 'unknown' ? { timePrecision: a.timePrecision } : { time: a.time, timePrecision: a.timePrecision };
    }
  }

  const writtenCandidates: Record<string, string> = {};
  for (const a of answers) {
    if (!WRITING_ACTIONS.has(a.content.action)) continue;
    for (const w of a.content.written ?? []) {
      if (typeof w?.candidateId === 'string' && typeof w.eventId === 'string') writtenCandidates[w.candidateId] = w.eventId;
    }
  }
  const received = mine.filter(i => i.direction === 'received');
  return { about, proposedValues, questions, answers, received, writtenCandidates, identity, documentDate, candidateDates, proposedDocuments, documentAnswers };
}

const WRITING_ACTIONS = new Set(['confirm', 'correct']);
const TIME_PRECISIONS = new Set(['day', 'month', 'year', 'unknown']);

/** The automatic answers' bases (R3): `profile-match` confirms `is-this-yours`, `existing-value` marks proposed values `duplicate`. */
export const BASES = { PROFILE_MATCH: 'profile-match', EXISTING_VALUE: 'existing-value', NOT_PENDING: 'not-pending' } as const;

/** R3 / R8: an answer's `basis` fits what it answers; an unknown one, or one on the wrong target, never counts. */
function basisFits (answer: Record<string, any>, target: ConversationItem): boolean {
  if (answer.basis === BASES.PROFILE_MATCH) return answer.action === 'confirm' && target.kind === 'question' && target.content.code === QUESTION_CODES.IS_THIS_YOURS;
  if (answer.basis === BASES.EXISTING_VALUE) return answer.action === 'duplicate' && target.kind === 'proposed-value';
  if (answer.basis === BASES.NOT_PENDING) return answer.action === 'skip' && target.kind === 'proposed-document';
  return false;
}

/**
 * R10, on her account, once the work on the document is `done`: the item ids the contact deletes. Proposed values
 * written, skipped, marked duplicate or requested, and replaced; questions answered; an `is-this-yours` question
 * carrying `context.identity` always; and any other proposed-value event of the document (a duplicate of a candidate
 * written twice by a racing retry). Open and kept-aside proposed values stay.
 */
export function itemsToDeleteAtDone (conv: DocumentConversation): string[] {
  const out = new Set<string>();
  const shown = new Set(conv.proposedValues.map(p => p.item.id));
  for (const pv of conv.proposedValues) if (pv.state !== 'open') out.add(pv.item.id);
  for (const i of conv.received) if (i.kind === 'proposed-value' && !shown.has(i.id)) out.add(i.id);
  for (const q of conv.questions) {
    // the two document questions go with their proposed document (`proposedDocumentItemsToDelete`), which outlives `done`
    if (DOCUMENT_CODES.has(q.code)) continue;
    if (q.state !== 'open' || (q.code === QUESTION_CODES.IS_THIS_YOURS && q.item.content.context?.identity != null)) out.add(q.item.id);
  }
  return [...out];
}

/**
 * R10, 4.26.0, whenever it happens (not only at `done`): a proposed document answered `confirm`, `correct` or `skip`
 * with `basis: not-pending`, or replaced, with the `which-document-kind` / `which-document-date` questions about it,
 * and any other `proposed-document` event of the document left by a racing retry. One she skipped herself, or open,
 * stays.
 */
export function proposedDocumentItemsToDelete (conv: DocumentConversation): string[] {
  const out = new Set<string>();
  const shown = new Set(conv.proposedDocuments.map(p => p.item.id));
  const gone = new Set<string>();
  for (const pd of conv.proposedDocuments) {
    if (pd.state === 'open' || pd.state === 'skipped') continue;
    out.add(pd.item.id);
    gone.add(pd.candidateId);
  }
  for (const i of conv.received) if (i.kind === 'proposed-document' && !shown.has(i.id)) out.add(i.id);
  for (const q of conv.questions) if (DOCUMENT_CODES.has(q.code) && gone.has(q.item.content.candidateId)) out.add(q.item.id);
  return [...out];
}

/** R10: every item of the document on the `received` child (on `not-mine`, `document-unshared` or a document gone). */
export function itemsOfDocument (conv: DocumentConversation): string[] {
  return conv.received.map(i => i.id);
}

// ---- items: what a writer MUST include ---- //

/**
 * The issues of one `message/hds-conversation-v1` content, before it is written: the pack's schema (the model must
 * be loaded, data-model >= 4.22.0) and the conditions of § What a writer MUST include that hold on the event alone.
 * The conditions between events are checked by the write helpers (`checkAnswerFor`, `writeQuestion`,
 * `writeProposedValues`).
 */
export function checkConversationItem (content: Record<string, any>): string[] {
  let def: any = null;
  try { def = getModel().eventTypes.getEventTypeDefinition(ET_CONVERSATION); } catch { /* model not loaded */ }
  if (def == null) return [`the loaded data model has no ${ET_CONVERSATION} (data-model 4.22.0 or later)`];
  const issues = schemaIssues(def, content, 'content');
  if (issues.length > 0) return issues;
  const c = content;
  if (c.kind === 'question') {
    const code = c.code;
    const has = (k: string): boolean => c[k] != null;
    if (CHOOSE_CODES.has(code)) {
      if (!has('candidateId')) issues.push(`question ${code}: candidateId is required`);
      if (!has('options')) issues.push(`question ${code}: options are required`);
      if (has('context')) issues.push(`question ${code}: no context`);
      if (code === QUESTION_CODES.IS_FASTING && has('options') && [...c.options].sort().join(',') !== 'no,yes') issues.push('question is-fasting: options must be exactly yes, no');
    } else if (code === QUESTION_CODES.WHICH_DATE) {
      if (has('options')) issues.push('question which-date: no options');
      if (c.context != null && Object.keys(c.context).some(k => k !== 'dates')) issues.push('question which-date: context holds dates only');
    } else if (code === QUESTION_CODES.IS_THIS_YOURS) {
      if (has('candidateId') || has('options')) issues.push('question is-this-yours: no candidateId, no options');
      if (c.context?.dates != null) issues.push('question is-this-yours: context holds identity and anchor only');
    } else if (code === QUESTION_CODES.WHICH_DOCUMENT_KIND) {
      if (!has('candidateId')) issues.push('question which-document-kind: candidateId (a proposed-document) is required');
      if (!has('options') || c.options.length < 2 || c.options.length > 8) issues.push('question which-document-kind: 2 to 8 options');
      else for (const o of c.options) if (documentKindRefusal(o) != null) issues.push(`question which-document-kind: ${o} is not a document kind of the pack`);
      if (has('context')) issues.push('question which-document-kind: no context');
    } else if (code === QUESTION_CODES.WHICH_DOCUMENT_DATE) {
      if (!has('candidateId')) issues.push('question which-document-date: candidateId (a proposed-document) is required');
      if (has('options')) issues.push('question which-document-date: no options');
      if (c.context != null && Object.keys(c.context).some(k => k !== 'dates')) issues.push('question which-document-date: context holds dates only');
    } else if (typeof code === 'string' && code.startsWith('x-')) {
      if (has('context')) issues.push(`question ${code}: context is for is-this-yours and the date questions only`);
    } else {
      issues.push(`question: unknown code "${code}" (bare codes are HDS's; a third party's start with x-<vendor>-)`);
    }
  } else if (c.kind === 'proposed-value') {
    if ((c.status === 'kept-aside' || c.status === 'unmapped') && c.reason == null) issues.push(`proposed-value ${c.status}: reason is required`);
    const p = c.proposal;
    if (p?.time != null && p.clientData?.hdsTimePrecision == null) issues.push('proposed-value: proposal with time needs clientData.hdsTimePrecision');
    if (p?.clientData?.hdsTimePrecision === 'unknown' && c.replaces == null) issues.push('proposed-value: hdsTimePrecision unknown only on a re-proposal (replaces)');
  } else if (c.kind === 'proposed-document') {
    const p = c.proposal ?? {};
    if (p.documentKind != null) {
      const refusal = documentKindRefusal(p.documentKind);
      if (refusal != null) issues.push(`proposed-document: documentKind ${p.documentKind} is ${refusal}`);
    }
    if ((p.time == null) !== (p.timePrecision == null)) issues.push('proposed-document: proposal.time and proposal.timePrecision go together');
    if (typeof p.time === 'number' && ((p.time % DAY) + DAY) % DAY !== 12 * HOUR) issues.push('proposed-document: proposal.time at 12:00 UTC at the start of its period');
    if (c.anchor?.eventId != null && c.anchor.eventId !== c.about) issues.push('proposed-document: anchor.eventId must be about');
  } else if (c.kind === 'answer') {
    const n = c.candidateIds?.length ?? 0;
    if (c.action === 'choose' && c.option == null) issues.push('answer choose: option is required');
    if (c.action !== 'choose' && c.option != null) issues.push('answer: option only with choose');
    if (c.written != null && c.action !== 'confirm' && c.action !== 'correct') issues.push(`answer ${c.action}: no written`);
    if (c.applied != null && c.action !== 'confirm' && c.action !== 'correct') issues.push(`answer ${c.action}: no applied`);
    if (c.applied != null && c.written != null) issues.push('answer: applied (a proposed document) never with written');
    if (c.applied != null && n !== 1) issues.push('answer: applied names exactly one proposed document');
    if (c.action === 'correct' && c.applied == null && (n !== 1 || c.written?.length !== 1)) issues.push('answer correct: exactly one candidateIds entry and its written entry');
    if (c.basis === BASES.NOT_PENDING && (c.action !== 'skip' || n !== 1)) issues.push('answer: basis not-pending only with skip, on one proposed document');
    for (const w of c.written ?? []) if (!(c.candidateIds ?? []).includes(w.candidateId)) issues.push(`answer: written ${w.candidateId} is not in candidateIds`);
    if (c.basis === BASES.PROFILE_MATCH && c.action !== 'confirm') issues.push('answer: basis profile-match only with confirm');
    if (c.basis === BASES.EXISTING_VALUE && (c.action !== 'duplicate' || n === 0)) issues.push('answer: basis existing-value only with duplicate, on candidates');
    if (c.timePrecision === 'unknown' && c.time != null) issues.push('answer: no time with timePrecision unknown');
    if (c.time != null && c.timePrecision == null) issues.push('answer: time needs timePrecision');
  }
  return issues;
}

/**
 * The issues of an answer given what it answers (`target`: the question or the first proposed value it replies to)
 * and the document's conversation: § Answers, by what they answer, and § What a writer MUST include.
 */
export function checkAnswerFor (content: Record<string, any>, target: ConversationItem, conv: DocumentConversation): string[] {
  const issues = checkConversationItem(content);
  if (issues.length > 0) return issues;
  const c = content;
  if (c.inReplyTo !== target.id) issues.push('answer: inReplyTo is not the target');
  if (c.about !== target.about) issues.push('answer: about is not the target\'s document');
  const ids: string[] = c.candidateIds ?? [];
  if (target.kind === 'question') {
    const code = target.content.code;
    if (!questionActions(code).has(c.action)) issues.push(`answer: ${c.action} does not answer ${code}`);
    if (c.written != null) issues.push('answer to a question: no written (it writes no value)');
    const qc = target.content.candidateId;
    if (qc != null && !(ids.length === 1 && ids[0] === qc)) issues.push('answer: candidateIds must name the question\'s candidate');
    if (qc == null && ids.length > 0) issues.push('answer: the question has no candidate');
    if (c.action === 'choose' && !(target.content.options ?? []).includes(c.option)) issues.push('answer choose: option is not one of the question\'s options');
    if ((code === QUESTION_CODES.WHICH_DATE || code === QUESTION_CODES.WHICH_DOCUMENT_DATE) && c.action === 'confirm') {
      if (c.timePrecision == null) issues.push(`answer ${code}: timePrecision is required`);
      else if (c.timePrecision !== 'unknown' && c.time == null) issues.push(`answer ${code}: time is required`);
    }
    if (c.applied != null) issues.push('answer to a question: no applied');
    if (c.basis != null && (c.basis !== BASES.PROFILE_MATCH || code !== QUESTION_CODES.IS_THIS_YOURS)) issues.push('answer: on a question, basis is profile-match on is-this-yours only');
  } else if (target.kind === 'proposed-document') {
    if (!PD_ACTIONS.has(c.action)) issues.push(`answer: ${c.action} does not answer a proposed document`);
    if (!(ids.length === 1 && ids[0] === target.content.candidateId)) issues.push('answer: candidateIds must name the proposed document');
    if (c.written != null) issues.push('answer to a proposed document: no written (applied)');
    if ((c.action === 'confirm' || c.action === 'correct') && !(Array.isArray(c.applied) && c.applied.length > 0)) issues.push(`answer ${c.action}: applied is required`);
    if (c.basis != null && c.basis !== BASES.NOT_PENDING) issues.push('answer to a proposed document: basis not-pending only');
  } else if (target.kind === 'proposed-value') {
    if (!PV_ACTIONS.has(c.action)) issues.push(`answer: ${c.action} does not answer a proposed value`);
    if (c.applied != null) issues.push('answer to a proposed value: no applied');
    if (ids.length === 0) issues.push('answer to a proposed value: candidateIds is required');
    if (ids[0] !== target.content.candidateId) issues.push('answer: a batch starts with the candidate it replies to');
    if ((c.action === 'confirm' || c.action === 'correct') && (c.written == null || c.written.length === 0)) issues.push(`answer ${c.action}: written is required`);
    if (c.basis != null && c.basis !== BASES.EXISTING_VALUE) issues.push('answer to a proposed value: basis existing-value only');
    for (const id of ids) {
      const pv = conv.proposedValues.find(p => p.candidateId === id);
      if (pv == null) { issues.push(`answer: candidate ${id} is not a proposed value of the document`); continue; }
      if (c.action === 'request-item' && !['kept-aside', 'unmapped'].includes(pv.item.content.status)) issues.push(`answer request-item: candidate ${id} is not kept-aside or unmapped`);
    }
  } else {
    issues.push('answer: the target is not a question, a proposed value or a proposed document');
  }
  return issues;
}

// ---- R9: the proposal, before it is shown and before it is written ---- //

export type ProposalRefusal =
  | 'answered' | 'replaced' | 'status' | 'no-proposal' | 'unknown-item' | 'item-not-allowed' | 'type-not-of-item'
  | 'unknown-type' | 'invalid-content' | 'comparator' | 'engine-not-vouched';

const COMPARATORS = new Set(['<', '<=', '>', '>=']);

/**
 * R9, the value alone: `itemKey` an item of the loaded pack on `type`, whose own `type` is neither `system` nor
 * `attachments` and whose stream is not under an `explicitGrantOnly` root (an `imported` item is allowed), and
 * `content` valid for `type`. Also used for a correction. Null when it may be written.
 */
export function checkValueProposal (p: { itemKey?: string; type?: string; content?: unknown } | null | undefined): ProposalRefusal | null {
  if (p == null || typeof p.itemKey !== 'string' || typeof p.type !== 'string') return 'no-proposal';
  let itemDef: any = null;
  let typeDef: any = null;
  try {
    itemDef = getModel().itemsDefs.forKey(p.itemKey, false);
    typeDef = getModel().eventTypes.getEventTypeDefinition(p.type);
  } catch { /* model not loaded */ }
  if (itemDef == null) return 'unknown-item';
  if (itemDef.isSystem || itemDef.isAttachments) return 'item-not-allowed';
  try {
    if (getModel().streams.isExplicitGrantOnly(itemDef.data.streamId)) return 'item-not-allowed';
  } catch { return 'item-not-allowed'; }
  if (!itemDef.eventTypes.includes(p.type)) return 'type-not-of-item';
  if (typeDef == null) return 'unknown-type';
  if (schemaIssues(typeDef, p.content, 'content').length > 0) return 'invalid-content';
  return null;
}

/**
 * Whether her app may offer to confirm a proposed value (R8, R9): open, a confirmable `status`, a proposal that
 * passes `checkValueProposal`, a known comparator, and an `extraction.engine` among `engines` (the ones vouched for
 * this relationship's app, `vouchedEnginesFor`). Null when confirmable; else why it is shown, not confirmable. Its
 * date is checked when it is written (`acceptProposedValues`).
 */
export function proposalRefusal (pv: ProposedValueView, engines: readonly string[]): ProposalRefusal | null {
  if (pv.state === 'replaced') return 'replaced';
  // a skip settles nothing, and a duplicate (automatic or tapped) may be added anyway: both may still be confirmed
  if (pv.state !== 'open' && pv.state !== 'skipped' && pv.state !== 'duplicate') return 'answered';
  const c = pv.item.content;
  if (!CONFIRMABLE_STATUSES.includes(c.status)) return 'status';
  const issue = checkValueProposal(c.proposal);
  if (issue != null) return issue;
  const comparator = c.proposal.clientData?.hdsComparator;
  if (comparator != null && !COMPARATORS.has(comparator)) return 'comparator';
  if (!(engines ?? []).includes(c.extraction?.engine)) return 'engine-not-vouched';
  return null;
}

// ---- R3: profile match ---- //

/** The person's profile as the match reads it (`HDSProfile` values fit: `name` is the given name, `surname` the family one). */
export interface ProfileForMatch { name?: string | null; surname?: string | null; dateOfBirth?: string | null }

function nameTokens (s: string): string[] {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[\s,-]+/).filter(t => t.length > 0).sort();
}

/**
 * R3, `basis: profile-match`: true only when the printed name holds exactly her full given and family names (case,
 * accents, hyphens, commas, spaces and order aside: "DUPONT, MARIE"; an initial never matches) and `birthDay` equals
 * her birth date. A profile
 * without a given name, a family name or a birth date never matches.
 */
export function profileMatch (identity: { name?: string; birthDay?: string } | null | undefined, profile: ProfileForMatch | null | undefined): boolean {
  const given = profile?.name?.trim();
  const family = profile?.surname?.trim();
  const born = profile?.dateOfBirth?.trim().slice(0, 10);
  if (!given || !family || !born || !identity?.name || !identity.birthDay) return false;
  if (identity.birthDay !== born) return false;
  const printed = nameTokens(identity.name);
  const mine = nameTokens(given + ' ' + family);
  return printed.length === mine.length && printed.every((t, i) => t === mine[i]);
}

// ---- 4.26.0: a document's date and kind (DOCUMENTS.md § A document waiting for its date and kind) ---- //

/** Why a kind key cannot be proposed: unknown to the loaded pack, or deprecated; null when it can. */
export function documentKindRefusal (key: unknown): 'unknown-kind' | 'deprecated-kind' | null {
  if (typeof key !== 'string') return 'unknown-kind';
  let kind: { deprecated?: true } | null = null;
  try { kind = getModel().documentKinds.forKey(key); } catch { /* model not loaded */ }
  if (kind == null) return 'unknown-kind';
  return kind.deprecated ? 'deprecated-kind' : null;
}

/**
 * The fields of a document still waiting for her: `clientData.hdsDocumentPending`, less a stale entry (an older app
 * set the field and left the flag): `time` counts only while the event has no `hdsTimePrecision`, `kind` only while its
 * kind is still `other`. Empty for a document that is not a `file/xds-v1` event, trashed, or carries no flag.
 */
export function pendingFieldsOf (document: { type?: string; trashed?: boolean; content?: any; clientData?: Record<string, any> } | null | undefined): DocumentField[] {
  if (document?.type !== 'file/xds-v1' || document.trashed === true) return [];
  const flag = document.clientData?.[DOCUMENT_PENDING_KEY];
  if (!Array.isArray(flag)) return [];
  const out: DocumentField[] = [];
  if (flag.includes('time') && document.clientData?.hdsTimePrecision == null) out.push('time');
  if (flag.includes('kind')) {
    let kind: { key: string } | null = null;
    try { kind = getModel().documentKinds.forContent(document.content); } catch { /* model not loaded */ }
    if (kind?.key === 'other') out.push('kind');
  }
  return out;
}

/** The fields a proposed document proposes: `kind` with `documentKind`, `time` with `time`. */
export function proposedFieldsOf (pd: { content: Record<string, any> }): DocumentField[] {
  const p = pd.content?.proposal ?? {};
  const out: DocumentField[] = [];
  if (typeof p.time === 'number') out.push('time');
  if (typeof p.documentKind === 'string') out.push('kind');
  return out;
}

export type DocumentProposalRefusal = 'answered' | 'replaced' | 'not-mine' | 'unknown-kind' | 'deprecated-kind' | 'not-a-document' | 'nothing-pending';

/**
 * R9 for a proposed document (4.26.0), before it is shown and before it is applied: not answered nor replaced, the
 * document hers (`identity` not `not-mine`), its kind a non-deprecated kind of the pack, `document` a `file/xds-v1`
 * event, not trashed, with at least one field still pending (her answers to the two document questions count as
 * proposed fields). No engine binding applies. Null when she may confirm it.
 */
export function documentProposalRefusal (
  pd: ProposedDocumentView,
  document: { type?: string; trashed?: boolean; content?: any; clientData?: Record<string, any> } | null | undefined,
  conv?: DocumentConversation
): DocumentProposalRefusal | null {
  if (pd.state === 'replaced') return 'replaced';
  if (pd.state !== 'open' && pd.state !== 'skipped') return 'answered';
  if (conv?.identity === 'not-mine') return 'not-mine';
  const kind = pd.item.content.proposal?.documentKind;
  if (kind != null) {
    const refusal = documentKindRefusal(kind);
    if (refusal != null) return refusal;
  }
  if (document?.type !== 'file/xds-v1' || document.trashed === true) return 'not-a-document';
  const pending = pendingFieldsOf(document);
  const answered = conv?.documentAnswers[pd.candidateId];
  const fields = new Set<DocumentField>([...proposedFieldsOf(pd.item), ...(answered?.documentKind ? ['kind' as const] : []), ...(answered?.date ? ['time' as const] : [])]);
  return pending.some(f => fields.has(f)) ? null : 'nothing-pending';
}

/** What she confirms or corrects for a proposed document: a kind key, a date (`timePrecision` `unknown`: no time). */
export interface DocumentFields { documentKind?: string; time?: number; timePrecision?: string }

/**
 * The `events.update` of the document (CONVERSATION.md § Writing a document's date and kind) for `fields`, applied
 * only where pending: the whole `content` with `class` and `type` from the pack's kind (`codingsFor`), `time`
 * and `clientData.hdsTimePrecision` (with `unknown`, the time stays), and `hdsDocumentPending` reduced (`null` when
 * empty; `events.update` merges `clientData`). Null `update` when nothing is applied.
 */
export function documentUpdateOf (
  document: { type?: string; trashed?: boolean; time?: number; content?: any; clientData?: Record<string, any> },
  fields: DocumentFields
): { update: Record<string, any> | null; applied: DocumentField[] } {
  const pending = pendingFieldsOf(document);
  const applied: DocumentField[] = [];
  const update: Record<string, any> = {};
  const clientData: Record<string, any> = {};
  if (pending.includes('kind') && typeof fields.documentKind === 'string' && documentKindRefusal(fields.documentKind) == null) {
    update.content = { ...document.content, ...getModel().documentKinds.codingsFor(fields.documentKind)! };
    applied.push('kind');
  }
  if (pending.includes('time') && TIME_PRECISIONS.has(fields.timePrecision as string) && (fields.timePrecision === 'unknown' || typeof fields.time === 'number')) {
    if (fields.timePrecision !== 'unknown') update.time = fields.time;
    clientData.hdsTimePrecision = fields.timePrecision;
    applied.push('time');
  }
  if (applied.length === 0) return { update: null, applied };
  const rest = pending.filter(f => !applied.includes(f));
  clientData[DOCUMENT_PENDING_KEY] = rest.length > 0 ? rest : null;
  update.clientData = clientData;
  return { update, applied: (['time', 'kind'] as DocumentField[]).filter(f => applied.includes(f)) };
}

/**
 * The `events.create` params of a document her app adds without its date or kind (DOCUMENTS.md § A document waiting
 * for its date and kind): the fields she gives are written, the others pending. With neither, kind `other`, `time` the
 * moment she adds it (`now`), no `hdsTimePrecision`, `hdsDocumentPending: ['time', 'kind']`. No `creation` (never the
 * upload date). The file is attached by the caller (`createEventWithFile…`).
 */
export function pendingDocumentEvent (params: {
  title: string;
  language?: string;
  streamIds?: string[];
  documentKind?: string;
  time?: number;
  timePrecision?: string;
  now?: number;
}): { streamIds: string[]; type: string; time: number; content: Record<string, any>; clientData: Record<string, any> } {
  const kind = params.documentKind != null && documentKindRefusal(params.documentKind) == null ? params.documentKind : null;
  const dated = params.timePrecision != null && TIME_PRECISIONS.has(params.timePrecision) && (params.timePrecision === 'unknown' || typeof params.time === 'number');
  const codings = getModel().documentKinds.codingsFor(kind ?? 'other');
  if (codings == null) throw new HDSLibError('pendingDocumentEvent: the loaded data model has no document kinds (data-model 4.17.0 or later)');
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const pending: DocumentField[] = [...(dated ? [] : ['time' as const]), ...(kind != null ? [] : ['kind' as const])];
  const clientData: Record<string, any> = {};
  if (dated) clientData.hdsTimePrecision = params.timePrecision;
  if (pending.length > 0) clientData[DOCUMENT_PENDING_KEY] = pending;
  return {
    streamIds: params.streamIds ?? ['documents'],
    type: 'file/xds-v1',
    time: dated && params.timePrecision !== 'unknown' ? params.time! : now,
    content: { ...codings, title: params.title, language: params.language ?? 'und' },
    clientData
  };
}

/**
 * Her own edit of a document's date or kind (her document viewer, 4.26.0): the `events.update` that writes them, and
 * removes each written field from `hdsDocumentPending` (a stale entry too; `null` when none is left), so no contact's
 * proposal overrides it. Unlike `documentUpdateOf`, it writes the fields whether pending or not. Null when `fields`
 * holds nothing to write.
 */
export function documentEditOf (
  document: { content?: any; clientData?: Record<string, any> },
  fields: DocumentFields
): Record<string, any> | null {
  const update: Record<string, any> = {};
  const clientData: Record<string, any> = {};
  const written: DocumentField[] = [];
  if (typeof fields.documentKind === 'string') {
    const refusal = documentKindRefusal(fields.documentKind);
    if (refusal != null) throw new HDSLibError(`documentEditOf: ${fields.documentKind} is ${refusal}`, { reason: refusal });
    update.content = { ...document.content, ...getModel().documentKinds.codingsFor(fields.documentKind)! };
    written.push('kind');
  }
  if (fields.timePrecision != null) {
    if (!TIME_PRECISIONS.has(fields.timePrecision) || (fields.timePrecision !== 'unknown' && typeof fields.time !== 'number')) {
      throw new HDSLibError('documentEditOf: timePrecision day, month, year or unknown, with time unless unknown', { reason: 'invalid-time' });
    }
    if (fields.timePrecision !== 'unknown') update.time = fields.time;
    clientData.hdsTimePrecision = fields.timePrecision;
    written.push('time');
  }
  if (written.length === 0) return null;
  const flag = document.clientData?.[DOCUMENT_PENDING_KEY];
  if (Array.isArray(flag)) {
    const rest = flag.filter((f: unknown) => (f === 'time' || f === 'kind') && !written.includes(f));
    clientData[DOCUMENT_PENDING_KEY] = rest.length > 0 ? rest : null;
  }
  update.clientData = clientData;
  return update;
}

/** A document's values (PROVENANCE.md): read from it (`source`), and already in her record and printed in it (`matched`). */
export interface DocumentValues { source: any[]; matched: any[] }

/**
 * The value events tied to a document, for its view (4.26.0): `source`, the values read from it, from its
 * `hdsDocumentValues` index and from the events whose `clientData.related` names it (an item value, not a
 * conversation item, an alert or another document); `matched`, the values she already had that it prints, from their
 * `hdsPrintedIn`. Dangling ids, trashed events and events the connection cannot read are skipped. Sorted by time.
 */
export async function listDocumentValues (connection: pryv.Connection, documentId: string): Promise<DocumentValues> {
  const isValue = (e: any): boolean => {
    if (e == null || e.trashed === true || e.id === documentId) return false;
    if (e.type === ET_CONVERSATION || e.type === ET_ALERT || e.type === 'file/xds-v1') return false;
    try { return getModel().itemsDefs.forEvent(e, false) != null; } catch { return false; }
  };
  const query = async (path: string): Promise<any[]> =>
    (await bestEffort(async () => await connection.apiOne('events.get', { clientData: [{ path, eq: true }], limit: 1000 } as any, 'events') as any[])) ?? [];
  const source = new Map<string, any>();
  for (const e of await query(`related.${documentId}`)) if (isValue(e)) source.set(e.id, e);
  const doc = await readEvent(connection, documentId).catch(() => null);
  for (const [id, role] of Object.entries(doc?.clientData?.[DOCUMENT_VALUES_KEY] ?? {})) {
    if (role !== 'source' || source.has(id)) continue;
    const e = await readEvent(connection, id).catch(() => null);
    if (isValue(e) && e.clientData?.related?.[documentId] === true) source.set(id, e);
  }
  const matched = (await query(`${PRINTED_IN_KEY}.${documentId}`)).filter(e => isValue(e) && !source.has(e.id));
  const byTime = (a: any, b: any): number => (a.time ?? 0) - (b.time ?? 0);
  return { source: [...source.values()].sort(byTime), matched: matched.sort(byTime) };
}

// ---- writing a value (her app) ---- //

/** The `clientData.sourceKey` of a value written from a proposal: `<engine>:document:<document event id>:<candidateId>`. */
export function sourceKeyOf (engine: string, about: string, candidateId: string): string {
  return `${engine}:document:${about}:${candidateId}`;
}

const PROPOSAL_CLIENT_DATA_KEYS = ['hdsRefRange', 'hdsFlag', 'hdsInterpretation', 'hdsComparator', 'hdsTimePrecision'];
const INTERPRETATIONS = new Set(['H', 'L', 'N', 'A', 'HH', 'LL']);

function knownClientDataValue (key: string, value: unknown): boolean {
  if (key === 'hdsInterpretation') return INTERPRETATIONS.has(value as string);
  if (key === 'hdsComparator') return COMPARATORS.has(value as string);
  if (key === 'hdsTimePrecision') return TIME_PRECISIONS.has(value as string);
  return true;
}

/** A correction she made: the value written instead of the proposal's (checked like a proposal, R9). */
export interface ValueCorrection {
  itemKey: string;
  type: string;
  content: unknown;
  /** Replaces the proposal's clientData keys (hdsRefRange, hdsFlag, ...) when given. */
  clientData?: Record<string, unknown>;
}

/**
 * The value event her app writes for a proposed value (§ Writing a value): the item's stream, the proposal's (or her
 * correction's) type and content, the time from the proposal or from `date` (her `which-date` answer; `unknown`:
 * no time), the proposal's clientData keys, `related`, `sourceKey`, `hdsSourceAnchor` and `hdsExtraction`.
 */
export function valueEventOf (pv: ConversationItem, opts: { correction?: ValueCorrection; date?: AnsweredDate | null } = {}): Record<string, any> {
  const c = pv.content;
  const p = c.proposal;
  const source = opts.correction ?? p;
  const itemDef = getModel().itemsDefs.forKey(source.itemKey);
  const clientData: Record<string, any> = {};
  const carried = opts.correction?.clientData ?? p.clientData ?? {};
  // R8: a value this version does not know is read as absent, never written on
  for (const k of PROPOSAL_CLIENT_DATA_KEYS) if (carried[k] != null && knownClientDataValue(k, carried[k])) clientData[k] = carried[k];
  const event: Record<string, any> = { streamIds: [itemDef!.data.streamId], type: source.type, content: source.content };
  if (p.time != null) {
    event.time = p.time;
    const precision = p.clientData?.hdsTimePrecision;
    if (TIME_PRECISIONS.has(precision)) clientData.hdsTimePrecision = precision;
    else delete clientData.hdsTimePrecision;
  } else if (opts.date != null) {
    if (opts.date.time != null && opts.date.timePrecision !== 'unknown') event.time = opts.date.time;
    clientData.hdsTimePrecision = opts.date.timePrecision;
  }
  clientData.related = { [c.about]: true };
  clientData.sourceKey = sourceKeyOf(c.extraction.engine, c.about, c.candidateId);
  // the anchor is self-contained (PROVENANCE.md, 4.25.0): it names its document even when the contact left it out;
  // one naming another document is dropped, never rewritten (R11)
  if (c.anchor != null && (c.anchor.eventId == null || c.anchor.eventId === c.about)) clientData.hdsSourceAnchor = { ...c.anchor, eventId: c.about };
  clientData.hdsExtraction = { ...c.extraction, confirmedBy: 'person', ...(opts.correction ? { corrected: true } : {}) };
  event.clientData = clientData;
  return event;
}

/** The value already written for `sourceKey` on `streamId` (trashed included, left as it is), or null. */
async function findBySourceKey (connection: pryv.Connection, streamId: string, sourceKey: string, time?: number): Promise<string | null> {
  const params: Record<string, unknown> = { streams: [streamId], state: 'all', limit: 500 };
  if (time != null) { params.fromTime = time - 1; params.toTime = time + 1; }
  const events = await connection.apiOne('events.get', params as any, 'events') as Array<{ id: string; clientData?: any }>;
  return events.find(e => e.clientData?.sourceKey === sourceKey)?.id ?? null;
}

export interface Decision {
  candidateId: string;
  action: 'confirm' | 'correct';
  /** With `correct`: the value as she corrected it. */
  correction?: ValueCorrection;
}

export interface AnswerWritten {
  answerEventId: string;
  alertEventId: string;
  action: AnswerAction;
  written: Array<{ candidateId: string; eventId: string }>;
}

export type AcceptRefusal = ProposalRefusal | 'unknown-candidate' | 'changed-since-shown' | 'not-mine' | 'identity-not-confirmed' | 'no-date' | 'no-correction';

/**
 * Her app writes the values she confirmed or corrected (§ Writing a value, R3, R9), then the answers, then their
 * alerts, 20 decisions at a time. For each batch: the document's items read again; a candidate is refused when it
 * changed since `shownAt` (Unix seconds, when the cards were shown), when an `is-this-yours` question is not confirmed
 * (or answered `not-mine`), when it has no date (its `proposal.time` or a `which-date` answer), or when R9 refuses it
 * (or the correction); each accepted value is looked up by `sourceKey` and written only when missing; one answer
 * carries the batch's confirmations (`inReplyTo` the first), each correction its own; each answer's alert on the
 * relationship's collectors stream. Refused candidates are returned, the others written. A failure throws with
 * `reason: 'write-failed'`: the values already written are answered (so `not-mine` still deletes them), and calling
 * again finds them answered and writes the rest, none twice (`sourceKey`). A failed alert leaves its answer written: the
 * rest goes on, then it throws `alert-not-posted`, whose `innerObject` carries `answers`, `refused` and `notPosted` (the
 * answers to post again with `postConversationAlert`).
 */
export async function acceptProposedValues (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; decisions: Decision[]; shownAt: number; engines: readonly string[]; note?: string }
): Promise<{ answers: AnswerWritten[]; refused: Array<{ candidateId: string; reason: AcceptRefusal }> }> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'acceptProposedValues');
  if (typeof params?.shownAt !== 'number') throw new HDSLibError('acceptProposedValues: shownAt is required');
  const decisions = [...(params.decisions ?? [])];
  const read = async (): Promise<DocumentConversation> => conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  let conv = await read();
  // a candidate already skipped or marked a duplicate may be confirmed: first, because once the open ones are answered
  // the contact may settle the document and delete the rest between two batches (R10)
  const settled = new Set(conv.proposedValues.filter(p => p.state === 'skipped' || p.state === 'duplicate').map(p => p.candidateId));
  if (decisions.length > ACCEPT_BATCH) decisions.sort((a, b) => Number(settled.has(b.candidateId)) - Number(settled.has(a.candidateId)));
  const refused: Array<{ candidateId: string; reason: AcceptRefusal }> = [];
  const answers: AnswerWritten[] = [];
  const written = new Map<string, string>();
  const notPosted: string[] = [];
  // 4.26.0: the document lists the values written from it (best effort, after the answers)
  const finish = async (): Promise<void> => { await indexDocumentValues(connection, params.about, [...written.values()]); };
  for (let start = 0; start < decisions.length; start += ACCEPT_BATCH) {
    // R3: what an answer covers is read again just before writing
    if (start > 0) {
      try {
        conv = await read();
      } catch (e) {
        await finish();
        throw writeFailed(written, e);
      }
    }
    const accepted: AcceptedDecision[] = [];
    for (const decision of decisions.slice(start, start + ACCEPT_BATCH)) {
      const reason = acceptRefusal(conv, decision, params);
      if (typeof reason === 'string') refused.push({ candidateId: decision.candidateId, reason });
      else accepted.push(reason);
    }
    const done: AcceptedDecision[] = [];
    let failure: unknown = null;
    for (const a of accepted) {
      try {
        const found = await findBySourceKey(connection, a.event.streamIds[0], a.event.clientData.sourceKey, a.event.time);
        written.set(a.pv.candidateId, found ?? (await connection.apiOne('events.create', a.event as any, 'event') as { id: string }).id);
        done.push(a);
      } catch (e) {
        failure = e;
        break;
      }
    }
    // the values of this batch are answered even when it stopped: one that no answer lists would stay after `not-mine`
    for (const g of answerGroups(done)) {
      const w = g.pvs.map(pv => ({ candidateId: pv.candidateId, eventId: written.get(pv.candidateId)! }));
      const content: Record<string, any> = { kind: 'answer', inReplyTo: g.pvs[0].item.id, about: params.about, action: g.action, candidateIds: g.pvs.map(p => p.candidateId), written: w };
      if (answers.length === 0 && params.note != null) content.note = params.note;
      try {
        answers.push({ ...await writeAnswer(connection, streams.sent, collectorStreamId, content, g.pvs[0].item, conv), action: g.action, written: w });
      } catch (e) {
        const inner = (e as any)?.innerObject;
        if (inner?.reason !== 'alert-not-posted') {
          await finish();
          throw written.size > 0 ? writeFailed(written, failure ?? e) : e;
        }
        // the answer is written: the rest goes on, and what was not announced is told at the end
        notPosted.push(inner.answerEventId);
        answers.push({ answerEventId: inner.answerEventId, alertEventId: '', action: g.action, written: w });
      }
    }
    if (failure != null) {
      await finish();
      throw writeFailed(written, failure);
    }
  }
  await finish();
  if (notPosted.length > 0) {
    throw new HDSLibError('an answer was written, its alert was not posted', { reason: 'alert-not-posted', answerEventId: notPosted[0], notPosted, answers, refused });
  }
  return { answers, refused };
}

/** Values written and answered together: a failure leaves at most one batch's values behind an answer not written. */
const ACCEPT_BATCH = 20;

type AcceptedDecision = { pv: ProposedValueView; decision: Decision; event: Record<string, any> };

function writeFailed (written: Map<string, string>, error: unknown): HDSLibError {
  return new HDSLibError('acceptProposedValues: a value was not written', { reason: 'write-failed', written: Object.fromEntries(written), error });
}

/** One answer for the batch's confirmations (`inReplyTo` the first), each correction its own. */
function answerGroups (done: AcceptedDecision[]): Array<{ action: 'confirm' | 'correct'; pvs: ProposedValueView[] }> {
  const confirms = done.filter(a => a.decision.action === 'confirm').map(a => a.pv);
  return [
    ...(confirms.length > 0 ? [{ action: 'confirm' as const, pvs: confirms }] : []),
    ...done.filter(a => a.decision.action === 'correct').map(a => ({ action: 'correct' as const, pvs: [a.pv] }))
  ];
}

function acceptRefusal (
  conv: DocumentConversation,
  decision: Decision,
  params: { shownAt: number; engines: readonly string[] }
): AcceptRefusal | AcceptedDecision {
  const pv = conv.proposedValues.find(p => p.candidateId === decision.candidateId);
  if (pv == null) return 'unknown-candidate';
  if (pv.item.modified > params.shownAt) return 'changed-since-shown';
  if (conv.identity === 'not-mine') return 'not-mine';
  if (conv.identity === 'open') return 'identity-not-confirmed';
  const refusal = proposalRefusal(pv, params.engines);
  if (refusal != null) return refusal;
  if (decision.action === 'correct') {
    if (decision.correction == null) return 'no-correction';
    const issue = checkValueProposal(decision.correction);
    if (issue != null) return issue;
    const comparator = decision.correction.clientData?.hdsComparator;
    if (comparator != null && !COMPARATORS.has(comparator as string)) return 'comparator';
  }
  const date = conv.candidateDates[pv.candidateId] ?? conv.documentDate;
  if (pv.item.content.proposal.time == null && date == null) return 'no-date';
  return { pv, decision, event: valueEventOf(pv.item, { correction: decision.action === 'correct' ? decision.correction : undefined, date }) };
}

/**
 * Answer one question (her tap, or her app on a profile match with `basis`): `choose` (+ `option`), `confirm` on
 * `which-date` (+ `timePrecision`, `time` unless `unknown`), `confirm` or `not-mine` on `is-this-yours`, `skip` on
 * any. Refused when the question, or the proposed value it is about, changed since `shownAt`. An answer to a question
 * writes no value; after `not-mine` the values written from the document are deleted (R3), returned in
 * `deletedValueIds`, before the alert is posted (so a failed alert never leaves them).
 */
export async function answerQuestion (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { questionId: string; action: AnswerAction; option?: string; time?: number; timePrecision?: string; basis?: 'profile-match'; shownAt: number; note?: string }
): Promise<AnswerWritten & { deletedValueIds: string[] }> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'answerQuestion');
  if (typeof params?.shownAt !== 'number') throw new HDSLibError('answerQuestion: shownAt is required');
  const question = await receivedItem(connection, streams, params.questionId, 'question', 'answerQuestion');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: question.about }), question.about);
  const current = conv.questions.find(q => q.item.id === question.id)?.item ?? question;
  const cid = question.content.candidateId;
  const about = (conv.proposedValues.find(p => p.candidateId === cid) ?? conv.proposedDocuments.find(p => p.candidateId === cid))?.item;
  if (current.modified > params.shownAt || (about != null && about.modified > params.shownAt)) {
    throw new HDSLibError('answerQuestion: the question changed since it was shown', { reason: 'changed-since-shown' });
  }
  const content: Record<string, any> = { kind: 'answer', inReplyTo: question.id, about: question.about, action: params.action };
  if (cid != null) content.candidateIds = [cid];
  for (const k of ['option', 'time', 'timePrecision', 'basis', 'note'] as const) if (params[k] != null) content[k] = params[k];
  const answerEventId = await writeAnswerEvent(connection, streams.sent, content, current, conv);
  let deletedValueIds: string[] = [];
  if (params.action === 'not-mine') deletedValueIds = await deleteWrittenValues(connection, conv);
  const { alertEventId } = await announceAnswer(connection, collectorStreamId, answerEventId, content);
  return { answerEventId, alertEventId, action: params.action, written: [], deletedValueIds };
}

/**
 * Answer proposed values without writing one: `skip`, `request-item` (a kept-aside or unmapped one) or `duplicate`.
 * One answer, `inReplyTo` the first candidate. With `shownAt`, refused when one of them changed since it was shown.
 */
export async function answerProposedValues (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; candidateIds: string[]; action: 'skip' | 'request-item' | 'duplicate'; shownAt?: number; basis?: 'existing-value'; note?: string }
): Promise<AnswerWritten> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'answerProposedValues');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  const first = conv.proposedValues.find(p => p.candidateId === params.candidateIds?.[0]);
  if (first == null) throw new HDSLibError('answerProposedValues: unknown candidate', { reason: 'unknown-candidate' });
  if (params.shownAt != null && conv.proposedValues.some(p => params.candidateIds.includes(p.candidateId) && p.item.modified > params.shownAt!)) {
    throw new HDSLibError('answerProposedValues: a proposed value changed since it was shown', { reason: 'changed-since-shown' });
  }
  const content: Record<string, any> = { kind: 'answer', inReplyTo: first.item.id, about: params.about, action: params.action, candidateIds: [...params.candidateIds] };
  if (params.basis != null) content.basis = params.basis;
  if (params.note != null) content.note = params.note;
  return { ...await writeAnswer(connection, streams.sent, collectorStreamId, content, first.item, conv), action: params.action, written: [] };
}

/**
 * R3, the answer her app gives without a tap: `confirm` with `basis: profile-match` on the document's open
 * `is-this-yours` question when `profileMatch` holds, at most one automatic answer per document. Returns null when
 * nothing was answered.
 */
export async function autoConfirmIdentity (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; profile: ProfileForMatch }
): Promise<AnswerWritten | null> {
  const { streams } = await personSide(connection, rel, 'autoConfirmIdentity');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  if (conv.answers.some(a => a.content.basis === BASES.PROFILE_MATCH)) return null;
  const q = conv.questions.find(x => x.code === QUESTION_CODES.IS_THIS_YOURS && x.state === 'open');
  if (q == null || !profileMatch(q.item.content.context?.identity, params.profile)) return null;
  const res = await answerQuestion(connection, rel, { questionId: q.item.id, action: 'confirm', basis: 'profile-match', shownAt: q.item.modified });
  return { answerEventId: res.answerEventId, alertEventId: res.alertEventId, action: res.action, written: [] };
}

// ---- R3, `basis: existing-value`: a value she already has (CONVERSATION.md § A value she already has) ---- //

const HOUR = 3600;
const DAY = 24 * HOUR;
const utcDay = (t: number): string => new Date(t * 1000).toISOString().slice(0, 10);
const dayStart = (day: string): number => Date.parse(day + 'T00:00:00Z') / 1000;

/** The day D a proposed value is compared on: its `proposal.time` at `day` precision, or her `which-date` answer at `day`. */
function comparedDay (pv: ProposedValueView, conv: DocumentConversation): string | null {
  const p = pv.item.content.proposal;
  if (typeof p?.time === 'number') return p.clientData?.hdsTimePrecision === 'day' ? utcDay(p.time) : null;
  const date = conv.candidateDates[pv.candidateId] ?? conv.documentDate;
  return date?.timePrecision === 'day' && typeof date.time === 'number' ? utcDay(date.time) : null;
}

/** Her event lies on day D: at `day` precision on that UTC day; with an exact time, while D runs in some zone (or in its own). */
export function onComparedDay (e: { time: number; clientData?: Record<string, any> }, day: string): boolean {
  const precision = e.clientData?.hdsTimePrecision;
  if (precision === 'day') return utcDay(e.time) === day;
  if (precision != null && precision !== 'minute') return false;
  const zone = e.clientData?.hdsTimeZone;
  if (typeof zone === 'string') {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(e.time * 1000)) === day;
    } catch { /* an unknown zone: the window below */ }
  }
  const start = dayStart(day);
  return e.time >= start - 14 * HOUR && e.time < start + DAY + 12 * HOUR;
}

/** `printed.value` as a plain number with one decimal separator (comma or point) and its last digit's half unit; else null. */
function printedNumber (value: unknown): { n: number; halfUnit: number } | null {
  if (typeof value !== 'string') return null;
  const m = /^\s*([+-]?\d+)(?:[.,](\d+))?\s*$/.exec(value);
  if (m == null) return null;
  const decimals = m[2]?.length ?? 0;
  return { n: Number(m[1] + (m[2] != null ? '.' + m[2] : '')), halfUnit: 0.5 * 10 ** -decimals };
}

const sig12 = (n: number): number => Number(n.toPrecision(12));
const same = (a: unknown, b: unknown): boolean => (a ?? null) === (b ?? null);

/** JSON of a value with its keys in order, undefined ones left out. */
function orderedJson (v: any): string {
  if (Array.isArray(v)) return '[' + v.map(orderedJson).join(',') + ']';
  if (v != null && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + orderedJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

/** A reading that says something: a text or a number, an object or an array that is not empty. */
function isReading (v: unknown): boolean {
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v);
  return v != null && typeof v === 'object' && Object.keys(v).length > 0;
}

/**
 * What a convertible content (cervical fluid, mood) says: its method, what was read and its annotations (a Creighton
 * frequency), and any other field it carries. Only its vectors and its engine and model versions are left out: derived,
 * a newer converter writes other ones for the same reading. Null when it has no method or no reading to compare on (the
 * whole content is then compared).
 */
function convertibleReading (itemKey: unknown, content: any): string | null {
  if (typeof itemKey !== 'string') return null;
  let type: unknown;
  try { type = getModel().itemsDefs.forKey(itemKey, false)?.data.type; } catch { return null; }
  const source = content?.source;
  // `_raw`: the vectors are the reading
  if (type !== 'convertible' || typeof source?.key !== 'string' || source.key === '_raw' || !isReading(source.sourceData)) return null;
  const { vectors: _vectors, source: _source, ...others } = content;
  const { engineVersion: _engine, modelVersion: _model, annotations, ...reading } = source;
  const noted = annotations != null && Object.keys(annotations).length > 0 ? annotations : null;
  return orderedJson([reading, noted, others]);
}

/**
 * Her event holds the proposed value: same type and content (of a convertible item: same method, reading and
 * annotations), a converted other type within the printed tolerance, or the same coded result.
 */
export function holdsProposedValue (e: { type: string; content?: any; clientData?: Record<string, any> }, pv: ConversationItem): boolean {
  const p = pv.content.proposal;
  if (e.type === p.type) {
    if (p.type === 'lab-result/coded-v1') {
      const codes = (c: any): string[] => (c?.analyte?.codes ?? []).map((x: any) => `${x?.system}|${x?.code}`);
      if (!codes(p.content).some(k => codes(e.content).includes(k))) return false;
      if (typeof p.content?.value === 'number' && typeof e.content?.value === 'number') {
        return sig12(p.content.value) === sig12(e.content.value) && same(p.content.unit, e.content.unit) && same(p.content.comparator, e.content.comparator);
      }
      return typeof p.content?.valueText === 'string' && p.content.valueText === e.content?.valueText;
    }
    if (typeof p.content === 'number' && typeof e.content === 'number') {
      return sig12(p.content) === sig12(e.content) && same(p.clientData?.hdsComparator, e.clientData?.hdsComparator);
    }
    const mine = convertibleReading(p.itemKey, e.content);
    if (mine != null && mine === convertibleReading(p.itemKey, p.content)) return true;
    return JSON.stringify(p.content) === JSON.stringify(e.content);
  }
  // another type of the same item: converted into the proposal's unit, within half the last printed digit (scaled)
  const printed = printedNumber(pv.content.printed?.value);
  if (printed == null || printed.n === 0 || typeof p.content !== 'number' || typeof e.content !== 'number') return false;
  if (!same(p.clientData?.hdsComparator, e.clientData?.hdsComparator)) return false;
  for (const system of ['metric', 'imperial'] as const) {
    const converted = getModel().conversions.convert(e.type, e.content, system);
    if (converted == null || converted.targetEventType !== p.type) continue;
    // the conversion rounds to 2 decimals: allow for it too
    const tolerance = printed.halfUnit * Math.abs(p.content / printed.n) + 0.005;
    return Math.abs(converted.value - p.content) <= tolerance;
  }
  return false;
}

/**
 * R3, the answer her app gives without a tap: `duplicate` with `basis: existing-value` on the document's proposed
 * values already in her record (CONVERSATION.md § A value she already has). For any contact's proposals, only those
 * she could confirm (`proposalRefusal` null for `engines`), and only while no `is-this-yours` is open or `not-mine`.
 * Her events: on the item's stream, of one of its types, not written from this document by any engine, on day D,
 * holding the value; one event per candidate over the document (candidates already answered keep theirs), an event
 * fitting several going to its own UTC day first, then the nearest, then the first candidate. One answer for the run,
 * `inReplyTo` the first matched. Null when nothing matched.
 */
export async function autoMarkDuplicates (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; engines: readonly string[] }
): Promise<(AnswerWritten & { candidateIds: string[]; matchedEventIds: string[] }) | null> {
  const { streams } = await personSide(connection, rel, 'autoMarkDuplicates');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  if (conv.identity === 'open' || conv.identity === 'not-mine') return null;
  const settled = new Set(conv.answers.filter(a => a.content.basis === BASES.EXISTING_VALUE).flatMap(a => a.content.candidateIds ?? []));
  const prior = conv.proposedValues.filter(p => settled.has(p.candidateId));
  const open = conv.proposedValues.filter(p => p.state === 'open' && proposalRefusal(p, params.engines) == null);
  const all = [...prior.map(pv => ({ pv, prior: true })), ...open.map(pv => ({ pv, prior: false }))]
    .map(c => ({ ...c, day: comparedDay(c.pv, conv) }))
    .filter((c): c is { pv: ProposedValueView; prior: boolean; day: string } => c.day != null);
  if (!all.some(c => !c.prior)) return null;
  const marker = `:document:${params.about}:`;
  const cache = new Map<string, any[]>();
  const pairs: Array<{ c: number; event: string; own: number; distance: number }> = [];
  for (const [i, c] of all.entries()) {
    const itemDef = getModel().itemsDefs.forKey(c.pv.item.content.proposal.itemKey, false);
    if (itemDef == null) continue;
    const streamId = itemDef.data.streamId;
    const key = streamId + '|' + c.day;
    if (!cache.has(key)) {
      const start = dayStart(c.day);
      cache.set(key, await connection.apiOne('events.get', { streams: [streamId], fromTime: start - 14 * HOUR, toTime: start + DAY + 12 * HOUR, limit: 500 } as any, 'events') as any[]);
    }
    for (const e of cache.get(key)!) {
      if (e.trashed === true || !itemDef.eventTypes.includes(e.type)) continue;
      if (typeof e.clientData?.sourceKey === 'string' && e.clientData.sourceKey.includes(marker)) continue;
      if (!onComparedDay(e, c.day) || !holdsProposedValue(e, c.pv.item)) continue;
      pairs.push({ c: i, event: e.id, own: utcDay(e.time) === c.day ? 0 : 1, distance: Math.abs(e.time - (dayStart(c.day) + 12 * HOUR)) });
    }
  }
  // one for one: earlier answers keep their events, then the own day first, the nearest, the first candidate
  pairs.sort((a, b) => Number(all[b.c].prior) - Number(all[a.c].prior) || a.own - b.own || a.distance - b.distance || a.c - b.c);
  const takenEvents = new Set<string>();
  const eventOf = new Map<number, string>();
  for (const p of pairs) {
    if (takenEvents.has(p.event) || eventOf.has(p.c)) continue;
    takenEvents.add(p.event);
    eventOf.set(p.c, p.event);
  }
  const fresh = [...eventOf.keys()].filter(i => !all[i].prior).sort((a, b) => a - b);
  const matched = fresh.map(i => all[i].pv);
  if (matched.length === 0) return null;
  const candidateIds = matched.map(p => p.candidateId);
  const shownAt = Math.max(...matched.map(p => p.item.modified));
  const res = await answerProposedValues(connection, rel, { about: params.about, candidateIds, action: 'duplicate', basis: BASES.EXISTING_VALUE, shownAt });
  // 4.26.0: each matched event of hers names the document in hdsPrintedIn (best effort, after the answer)
  const matchedEventIds = fresh.map(i => eventOf.get(i)!);
  await markPrintedIn(connection, params.about, matchedEventIds);
  return { ...res, candidateIds, matchedEventIds };
}

/**
 * R3, `not-mine` after values were written: every value listed in the document's answers' `written`, deleted; then
 * (4.26.0, best effort) their entries in the document's `hdsDocumentValues`, and the document in the `hdsPrintedIn` of
 * her events.
 */
async function deleteWrittenValues (connection: pryv.Connection, conv: DocumentConversation): Promise<string[]> {
  const ids = [...new Set(conv.answers.flatMap(a => (a.content.written ?? []).map((w: any) => w.eventId)))] as string[];
  for (const id of ids) await deleteTwice(connection, 'events.delete', { id });
  await bestEffort(async () => {
    const doc = await readEvent(connection, conv.about);
    const index = doc?.clientData?.[DOCUMENT_VALUES_KEY];
    if (index != null && typeof index === 'object') {
      const kept = Object.fromEntries(Object.entries(index).filter(([id]) => !ids.includes(id)));
      await connection.apiOne('events.update', { id: conv.about, update: { clientData: { [DOCUMENT_VALUES_KEY]: Object.keys(kept).length > 0 ? kept : null } } } as any, 'event');
    }
  });
  await bestEffort(async () => {
    const printed = await connection.apiOne('events.get', { clientData: [{ path: `${PRINTED_IN_KEY}.${conv.about}`, eq: true }], limit: 1000 } as any, 'events') as any[];
    for (const e of printed ?? []) {
      const { [conv.about]: _gone, ...rest } = e.clientData?.[PRINTED_IN_KEY] ?? {};
      await connection.apiOne('events.update', { id: e.id, update: { clientData: { [PRINTED_IN_KEY]: Object.keys(rest).length > 0 ? rest : null } } } as any, 'event');
    }
  });
  return ids;
}

/**
 * 4.26.0, after the answer and best effort: the values her app wrote from the document, added to its
 * `clientData.hdsDocumentValues` as `source` (PROVENANCE.md), the whole object written after a fresh read, the
 * dangling entries it finds (deleted, trashed) dropped. Returns the index written, or null when nothing was.
 */
export async function indexDocumentValues (connection: pryv.Connection, about: string, eventIds: string[]): Promise<Record<string, string> | null> {
  if (eventIds.length === 0) return null;
  return await bestEffort(async () => {
    const doc = await readEvent(connection, about);
    if (doc?.type !== 'file/xds-v1') return null;
    const index: Record<string, string> = { ...(doc.clientData?.[DOCUMENT_VALUES_KEY] ?? {}) };
    for (const id of Object.keys(index)) {
      const e = eventIds.includes(id) ? { trashed: false } : await readEvent(connection, id);
      if (e == null || e.trashed === true) delete index[id];
    }
    for (const id of eventIds) index[id] = 'source';
    await connection.apiOne('events.update', { id: about, update: { clientData: { [DOCUMENT_VALUES_KEY]: index } } } as any, 'event');
    return index;
  });
}

/**
 * 4.26.0, best effort: the document added to the `clientData.hdsPrintedIn` of her events an automatic `duplicate`
 * matched (PROVENANCE.md): found in the document, not read from it. Nothing is written on the document.
 */
export async function markPrintedIn (connection: pryv.Connection, about: string, eventIds: string[]): Promise<string[]> {
  const done: string[] = [];
  for (const id of eventIds) {
    await bestEffort(async () => {
      const e = await readEvent(connection, id);
      if (e == null || e.trashed === true || e.clientData?.[PRINTED_IN_KEY]?.[about] === true) return;
      await connection.apiOne('events.update', { id, update: { clientData: { [PRINTED_IN_KEY]: { ...(e.clientData?.[PRINTED_IN_KEY] ?? {}), [about]: true } } } } as any, 'event');
      done.push(id);
    });
  }
  return done;
}

/**
 * Her app confirms (or corrects) a proposed document (CONVERSATION.md § Writing a document's date and kind, 4.26.0):
 * the conversation and the document read again; refused when the proposal or a question about it changed since
 * `shownAt`, or by `documentProposalRefusal`; each field from her `correction`, else the proposal, else her answers to
 * the two document questions; applied only where still pending (one `events.update`); then the answer, `applied`
 * listing the fields, and its alert. When nothing is applied: `nothing-pending`, except on a retry after the update
 * went through (the document already holds every field), which writes the answer. With `file`, a document whose kind was
 * applied is then filed under the kind's stream (`documents.ts` `fileDocument`; `filed` is that stream, null when it
 * was not): the app passes it only once she was told who will newly read it.
 */
export async function acceptProposedDocument (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; candidateId: string; correction?: DocumentFields; shownAt: number; note?: string; file?: boolean }
): Promise<AnswerWritten & { applied: DocumentField[]; filed: string | null }> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'acceptProposedDocument');
  if (typeof params?.shownAt !== 'number') throw new HDSLibError('acceptProposedDocument: shownAt is required');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  const pd = conv.proposedDocuments.find(p => p.candidateId === params.candidateId);
  if (pd == null) throw new HDSLibError('acceptProposedDocument: unknown candidate', { reason: 'unknown-candidate' });
  const asked = conv.questions.filter(q => DOCUMENT_CODES.has(q.code) && q.item.content.candidateId === pd.candidateId);
  if (pd.item.modified > params.shownAt || asked.some(q => q.item.modified > params.shownAt)) {
    throw new HDSLibError('acceptProposedDocument: the proposal changed since it was shown', { reason: 'changed-since-shown' });
  }
  const document = await readEvent(connection, params.about);
  const fields = documentFieldsOf(pd, conv, params.correction);
  const refusal = documentProposalRefusal(pd, document, conv);
  let applied: DocumentField[] = [];
  if (refusal === 'nothing-pending' && document != null && holdsDocumentFields(document, fields)) {
    applied = proposedOrAnswered(fields); // a retry: the update went through, the answer did not
  } else if (refusal != null) {
    throw new HDSLibError('acceptProposedDocument: ' + refusal, { reason: refusal });
  } else {
    const { update, applied: written } = documentUpdateOf(document!, fields);
    if (update == null) throw new HDSLibError('acceptProposedDocument: nothing to apply', { reason: 'nothing-pending' });
    await connection.apiOne('events.update', { id: params.about, update } as any, 'event');
    applied = written;
  }
  let filed: string | null = null;
  if (params.file === true && applied.includes('kind') && typeof fields.documentKind === 'string') {
    const target = getModel().documentKinds.streamFor(fields.documentKind);
    // best effort: a document that could not be filed stays where it is, read by no one new
    if (target !== DOCUMENTS_STREAM_ID) {
      await bestEffort(async () => { await fileDocument(connection, params.about, target); });
      // re-read: a `concurrent-update` is thrown after the filing write, which may hold
      const after = await bestEffort(async () => await readEvent(connection, params.about));
      if (after?.streamIds?.includes(target)) filed = target;
    }
  }
  const action = params.correction != null ? 'correct' : 'confirm';
  const content: Record<string, any> = { kind: 'answer', inReplyTo: pd.item.id, about: params.about, action, candidateIds: [pd.candidateId], applied };
  if (params.note != null) content.note = params.note;
  return { ...await writeAnswer(connection, streams.sent, collectorStreamId, content, pd.item, conv), action, written: [], applied, filed };
}

/**
 * Her tapped `skip` on a proposed document ("Later"), or her comment alone on it (`note`: a `skip` with a note, with
 * every effect of a skip). Refused when the proposal changed since `shownAt`. It writes nothing on the document; the
 * proposal stays and she may confirm it later.
 */
export async function skipProposedDocument (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; candidateId: string; shownAt?: number; note?: string }
): Promise<AnswerWritten> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'skipProposedDocument');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  const pd = conv.proposedDocuments.find(p => p.candidateId === params.candidateId);
  if (pd == null) throw new HDSLibError('skipProposedDocument: unknown candidate', { reason: 'unknown-candidate' });
  if (params.shownAt != null && pd.item.modified > params.shownAt) {
    throw new HDSLibError('skipProposedDocument: the proposal changed since it was shown', { reason: 'changed-since-shown' });
  }
  const content: Record<string, any> = { kind: 'answer', inReplyTo: pd.item.id, about: params.about, action: 'skip', candidateIds: [pd.candidateId] };
  if (params.note != null) content.note = params.note;
  return { ...await writeAnswer(connection, streams.sent, collectorStreamId, content, pd.item, conv), action: 'skip', written: [] };
}

/**
 * R3, the answer her app gives without a tap (4.26.0): `skip` with `basis: not-pending` on each open proposed
 * document none of whose fields is pending on the document any more (she set them, or confirmed another contact's).
 * Returns the answers written.
 */
export async function autoSettleProposedDocuments (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string }
): Promise<AnswerWritten[]> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'autoSettleProposedDocuments');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  const open = conv.proposedDocuments.filter(p => p.state === 'open');
  if (open.length === 0) return [];
  const document = await readEvent(connection, params.about);
  const out: AnswerWritten[] = [];
  for (const pd of open) {
    if (documentProposalRefusal(pd, document, conv) !== 'nothing-pending') continue;
    const content = { kind: 'answer', inReplyTo: pd.item.id, about: params.about, action: 'skip', candidateIds: [pd.candidateId], basis: BASES.NOT_PENDING };
    out.push({ ...await writeAnswer(connection, streams.sent, collectorStreamId, content, pd.item, conv), action: 'skip', written: [] });
  }
  return out;
}

/** The fields to apply for a proposed document: her correction, else the proposal, else her answers to its questions. */
function documentFieldsOf (pd: ProposedDocumentView, conv: DocumentConversation, correction?: DocumentFields): DocumentFields {
  const p = pd.item.content.proposal ?? {};
  const answered = conv.documentAnswers[pd.candidateId] ?? {};
  const out: DocumentFields = {};
  const kind = correction?.documentKind ?? p.documentKind ?? answered.documentKind;
  if (kind != null) out.documentKind = kind;
  if (correction?.timePrecision != null) { out.time = correction.time; out.timePrecision = correction.timePrecision; } else if (typeof p.time === 'number') { out.time = p.time; out.timePrecision = p.timePrecision; } else if (answered.date != null) { out.time = answered.date.time; out.timePrecision = answered.date.timePrecision; }
  return out;
}

function proposedOrAnswered (fields: DocumentFields): DocumentField[] {
  return (['time', 'kind'] as DocumentField[]).filter(f => f === 'time' ? fields.timePrecision != null : fields.documentKind != null);
}

/** The document already holds every field of `fields` (the update of a confirmation went through). */
function holdsDocumentFields (document: { time?: number; content?: any; clientData?: Record<string, any> }, fields: DocumentFields): boolean {
  const wanted = proposedOrAnswered(fields);
  if (wanted.length === 0) return false;
  if (wanted.includes('kind')) {
    let kind: { key: string } | null = null;
    try { kind = getModel().documentKinds.forContent(document.content); } catch { /* model not loaded */ }
    if (kind?.key !== fields.documentKind) return false;
  }
  if (wanted.includes('time')) {
    if (document.clientData?.hdsTimePrecision !== fields.timePrecision) return false;
    if (fields.timePrecision !== 'unknown' && document.time !== fields.time) return false;
  }
  return true;
}

// ---- 4.26.0: her note (CONVERSATION.md § Her note) ---- //

/**
 * The answers whose `note` her app removes now: once a `done` of the contact (`done`: the latest one, `latestDoneOf`) is
 * later than the answer, whatever status follows that `done` (a document shared again, on hold for days); or 24 h after
 * the answer when the work is done now (`current`: the latest status, `taskStatusOf`; left out, `done` is taken as the
 * latest), when she answered `not-mine`, or when the document was unshared (`unshared`). An answer written while the work
 * is in progress again waits for the next `done`.
 */
export function notesToRemove (
  conv: DocumentConversation,
  done: ConversationAlert | null,
  opts: { now?: number; unshared?: boolean; current?: ConversationAlert | null } = {}
): ConversationItem[] {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const doneAt = done?.hds?.status === 'done' ? done.time : null;
  const idle = opts.current === undefined ? doneAt != null : opts.current?.hds?.status === 'done';
  return conv.answers.filter(a => {
    if (typeof a.content.note !== 'string') return false;
    if (doneAt != null && doneAt > a.created) return true;
    return now - a.created >= DAY && (idle || conv.identity === 'not-mine' || opts.unshared === true);
  });
}

/**
 * Remove `note` from her answers about a document when `notesToRemove` says so (an `events.update` of the answer,
 * writing nothing else). Returns the answer ids updated.
 */
export async function removeNotes (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; now?: number; unshared?: boolean }
): Promise<string[]> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'removeNotes');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  if (!conv.answers.some(a => typeof a.content.note === 'string')) return [];
  const alerts = await listConversationAlerts(connection, collectorStreamId);
  const out: string[] = [];
  for (const a of notesToRemove(conv, latestDoneOf(alerts, params.about), { ...params, current: taskStatusOf(alerts, params.about) })) {
    const { note: _note, ...content } = a.content;
    await connection.apiOne('events.update', { id: a.id, update: { content } } as any, 'event');
    out.push(a.id);
  }
  return out;
}

async function readEvent (connection: pryv.Connection, id: string): Promise<any | null> {
  try {
    return await connection.apiOne('events.getOne', { id } as any, 'event');
  } catch (e) {
    if (pryvErrorCode(e) === 'unknown-resource') return null;
    throw e;
  }
}

async function bestEffort<T> (fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

async function personSide (connection: pryv.Connection, rel: ConversationRelationship, fn: string): Promise<{ streams: ConversationStreams; collectorStreamId: string }> {
  if (!rel?.accessId) throw new HDSLibError(`${fn}: the relationship's accessId is required`);
  if (!rel.localCollectorStreamId) throw new HDSLibError(`${fn}: the relationship has no collectors stream (no system channel)`, { reason: 'no-collector-stream' });
  const streams = await conversationStreamsFor(connection, rel.accessId);
  if (streams == null) throw new HDSLibError(`${fn}: the relationship has no conversation children`, { reason: 'no-conversation' });
  return { streams, collectorStreamId: rel.localCollectorStreamId };
}

/** R11: a pointer resolves only on the relationship's `received` child, to the expected kind. */
async function receivedItem (connection: pryv.Connection, streams: ConversationStreams, eventId: string, kind: ConversationItemKind, fn: string): Promise<ConversationItem> {
  let event: any = null;
  try {
    event = await connection.apiOne('events.getOne', { id: eventId }, 'event');
  } catch (e) {
    if (pryvErrorCode(e) !== 'unknown-resource') throw e;
  }
  const item = parseConversationItems(event ? [event] : [], streams)[0];
  if (item == null || item.direction !== 'received' || item.kind !== kind) throw new HDSLibError(`${fn}: no ${kind} ${eventId} in this conversation`, { reason: 'not-in-conversation', eventId });
  return item;
}

async function writeAnswer (
  connection: pryv.Connection,
  sentStreamId: string,
  collectorStreamId: string,
  content: Record<string, any>,
  target: ConversationItem,
  conv: DocumentConversation
): Promise<{ answerEventId: string; alertEventId: string }> {
  const answerEventId = await writeAnswerEvent(connection, sentStreamId, content, target, conv);
  return { answerEventId, ...await announceAnswer(connection, collectorStreamId, answerEventId, content) };
}

/** The answer event on the `sent` child, checked first, with `related` mirroring every id it names (R1). */
async function writeAnswerEvent (
  connection: pryv.Connection,
  sentStreamId: string,
  content: Record<string, any>,
  target: ConversationItem,
  conv: DocumentConversation
): Promise<string> {
  const issues = checkAnswerFor(content, target, conv);
  if (issues.length > 0) throw new HDSLibError('invalid answer: ' + issues.join('; '), { reason: 'invalid-answer', issues });
  const related: Record<string, boolean> = { [content.about]: true, [content.inReplyTo]: true };
  for (const w of content.written ?? []) related[w.eventId] = true;
  const answer = await connection.apiOne('events.create', { streamIds: [sentStreamId], type: ET_CONVERSATION, content, clientData: { related } } as any, 'event') as { id: string };
  return answer.id;
}

async function announceAnswer (connection: pryv.Connection, collectorStreamId: string, answerEventId: string, content: Record<string, any>): Promise<{ alertEventId: string }> {
  try {
    return await postConversationAlert(connection, collectorStreamId, { kind: 'answer', eventId: answerEventId, inReplyTo: content.inReplyTo, about: content.about });
  } catch (e) {
    // written, not announced: post the alert again (`postConversationAlert`), never the answer
    throw new HDSLibError('the answer was written, its alert was not posted', { reason: 'alert-not-posted', answerEventId, error: e });
  }
}

// ---- both sides: alerts ---- //

/** Post a conversation alert on the own collectors stream (the plugin delivers it to the peer). `hds` is checked. */
export async function postConversationAlert (connection: pryv.Connection, collectorStreamId: string, hds: Record<string, unknown>): Promise<{ alertEventId: string }> {
  if (!collectorStreamId) throw new HDSLibError('postConversationAlert: collectorStreamId is required', { reason: 'no-collector-stream' });
  const content = buildConversationAlertContent(hds);
  const event = await connection.apiOne('events.create', { streamIds: [collectorStreamId], type: ET_ALERT, content }, 'event') as { id: string };
  return { alertEventId: event.id };
}

/** The conversation alerts on one collectors stream (either side), as `parseConversationAlerts` returns them. */
export async function listConversationAlerts (connection: pryv.Connection, collectorStreamId: string, opts: { limit?: number; fromTime?: number } = {}): Promise<ConversationAlert[]> {
  const params: Record<string, unknown> = { streams: [collectorStreamId], types: [ET_ALERT], limit: opts.limit ?? 500 };
  if (opts.fromTime != null) params.fromTime = opts.fromTime;
  const events = await connection.apiOne('events.get', params as any, 'events') as any[];
  return parseConversationAlerts(events);
}

// ---- the contact's side (through its grant on the person's children) ---- //

/**
 * Write one question on the person's `received` child, checked (schema, § Question codes; a `candidateId` must name
 * a proposed value of the same document on that child), with `clientData.related.<about>` (R1). The contact then
 * posts its `question` alert (`postConversationAlert`). Returns the event id.
 */
export async function writeQuestion (personConnection: pryv.Connection, streams: ConversationStreams, content: Record<string, any>): Promise<string> {
  const issues = checkConversationItem(content);
  if (content?.kind !== 'question') issues.push('writeQuestion: kind must be question');
  if (issues.length === 0) {
    const items = await listConversationItems(personConnection, streams, { about: content.about });
    if (conversationOf(items, content.about).identity === 'not-mine') notMine('writeQuestion');
    const documentCode = DOCUMENT_CODES.has(content.code);
    const kind = documentCode ? 'proposed-document' : 'proposed-value';
    if (content.candidateId != null && !items.some(i => i.kind === kind && i.content.candidateId === content.candidateId)) {
      issues.push(`question: candidate ${content.candidateId} is not a ${documentCode ? 'proposed document' : 'proposed value'} of the document`);
    }
    // 4.26.0: a document question only while the document waits for that field
    if (documentCode) {
      const field: DocumentField = content.code === QUESTION_CODES.WHICH_DOCUMENT_KIND ? 'kind' : 'time';
      if (!pendingFieldsOf(await readEvent(personConnection, content.about)).includes(field)) issues.push(`question ${content.code}: the document's ${field} is not pending`);
    }
  }
  if (issues.length > 0) throw new HDSLibError('writeQuestion: ' + issues.join('; '), { reason: 'invalid-item', issues });
  const event = await personConnection.apiOne('events.create', {
    streamIds: [streams.received], type: ET_CONVERSATION, content, clientData: { related: { [content.about]: true } }
  } as any, 'event') as { id: string };
  return event.id;
}

export interface ProposedValuesWritten {
  created: Array<{ candidateId: string; eventId: string }>;
  /** Unanswered candidates written again in place (R5). */
  updated: Array<{ candidateId: string; eventId: string }>;
  /** `written`: in an answer's `written`, never proposed again; `answered`: an answered item is never updated. */
  skipped: Array<{ candidateId: string; reason: 'written' | 'answered' }>;
}

/**
 * Write the proposed values of one document on the person's `received` child (R5: idempotent per `candidateId`): a
 * new candidate is created, an unanswered one rewritten in place, one already answered or written left alone. Each
 * is checked first (schema, § What a writer MUST include, `replaces` naming a proposed value of the document that she
 * answered a question about and that was not written); nothing is written when one fails. The contact then posts one
 * `proposed-values` alert for the batch (`count`: created + updated). A candidate her app wrote is never proposed
 * again, also once its proposed value was deleted (R5, from her answers); a document she answered `not-mine` is refused.
 */
export async function writeProposedValues (personConnection: pryv.Connection, streams: ConversationStreams, about: string, contents: Array<Record<string, any>>): Promise<ProposedValuesWritten> {
  const conv = conversationOf(await listConversationItems(personConnection, streams, { about }), about);
  if (conv.identity === 'not-mine') notMine('writeProposedValues');
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const c of contents ?? []) {
    const own = checkConversationItem(c);
    if (c?.kind !== 'proposed-value') own.push('kind must be proposed-value');
    if (c?.about !== about) own.push('about is not the document of the batch');
    if (seen.has(c?.candidateId)) own.push('candidateId listed twice');
    seen.add(c?.candidateId);
    if (own.length === 0 && c.replaces != null) {
      const old = conv.proposedValues.find(p => p.candidateId === c.replaces);
      const asked = conv.questions.some(q => q.item.content.candidateId === c.replaces && q.state === 'answered');
      if (old == null || old.writtenEventId != null || !asked) own.push(`replaces ${c.replaces}: not a proposed value of the document answered by a question and not written`);
    }
    issues.push(...own.map(i => `${c?.candidateId ?? '?'}: ${i}`));
  }
  if (issues.length > 0) throw new HDSLibError('writeProposedValues: ' + issues.join('; '), { reason: 'invalid-item', issues });
  const out: ProposedValuesWritten = { created: [], updated: [], skipped: [] };
  for (const c of contents) {
    const existing = conv.proposedValues.find(p => p.candidateId === c.candidateId);
    if (existing?.writtenEventId != null || Object.hasOwn(conv.writtenCandidates, c.candidateId)) {
      out.skipped.push({ candidateId: c.candidateId, reason: 'written' });
      continue;
    }
    if (existing != null && (existing.state !== 'open' || conv.answers.some(a => (a.content.candidateIds ?? []).includes(c.candidateId)))) {
      out.skipped.push({ candidateId: c.candidateId, reason: 'answered' });
      continue;
    }
    const clientData = { related: { [about]: true } };
    if (existing != null) {
      await personConnection.apiOne('events.update', { id: existing.item.id, update: { content: c, clientData } } as any, 'event');
      out.updated.push({ candidateId: c.candidateId, eventId: existing.item.id });
    } else {
      const event = await personConnection.apiOne('events.create', { streamIds: [streams.received], type: ET_CONVERSATION, content: c, clientData } as any, 'event') as { id: string };
      out.created.push({ candidateId: c.candidateId, eventId: event.id });
    }
  }
  return out;
}

export interface ProposedDocumentWritten {
  /** `created`, `updated` (the same candidate, unanswered, rewritten in place), or `skipped`. */
  outcome: 'created' | 'updated' | 'skipped';
  eventId: string | null;
  /** With `skipped`: `answered` (never updated), `nothing-pending` (the document waits for none of its fields). */
  reason?: 'answered' | 'nothing-pending';
  /** The stale unanswered proposed documents of the contact deleted (one open at a time). */
  deleted: string[];
}

/**
 * Write the contact's proposed date and kind for a document on the person's `received` child (4.26.0, CONVERSATION.md
 * § A document's date and kind): checked first (schema, the kind a non-deprecated pack kind, the time at 12:00 UTC),
 * written only while the document's `hdsDocumentPending` holds a proposed field (read through the contact's grant on
 * the shared document), idempotent per `candidateId` (an unanswered one rewritten in place, an answered one left
 * alone). One open at a time: a new candidate gets `replaces` = the open one it supersedes, which is deleted at once.
 * The contact then posts a `proposed-values` alert (`count` 1). A document she answered `not-mine` is refused.
 */
export async function writeProposedDocument (personConnection: pryv.Connection, streams: ConversationStreams, content: Record<string, any>): Promise<ProposedDocumentWritten> {
  const issues = checkConversationItem(content);
  if (content?.kind !== 'proposed-document') issues.push('kind must be proposed-document');
  if (issues.length > 0) throw new HDSLibError('writeProposedDocument: ' + issues.join('; '), { reason: 'invalid-item', issues });
  const about = content.about;
  const conv = conversationOf(await listConversationItems(personConnection, streams, { about }), about);
  if (conv.identity === 'not-mine') notMine('writeProposedDocument');
  const pending = pendingFieldsOf(await readEvent(personConnection, about));
  if (!proposedFieldsOf({ content }).some(f => pending.includes(f))) return { outcome: 'skipped', eventId: null, reason: 'nothing-pending', deleted: [] };
  const answeredIds = new Set(conv.answers.filter(a => (a.content.candidateIds ?? []).length > 0).flatMap(a => a.content.candidateIds));
  const existing = conv.proposedDocuments.find(p => p.candidateId === content.candidateId);
  if (existing != null && (existing.state !== 'open' || answeredIds.has(existing.candidateId))) {
    return { outcome: 'skipped', eventId: existing.item.id, reason: 'answered', deleted: [] };
  }
  const clientData = { related: { [about]: true } };
  if (existing != null) {
    await personConnection.apiOne('events.update', { id: existing.item.id, update: { content, clientData } } as any, 'event');
    return { outcome: 'updated', eventId: existing.item.id, deleted: [] };
  }
  const stale = conv.proposedDocuments.filter(p => p.state === 'open' && !conv.answers.some(a => a.content.inReplyTo === p.item.id));
  const body = stale.length > 0 && content.replaces == null ? { ...content, replaces: stale.at(-1)!.candidateId } : content;
  const event = await personConnection.apiOne('events.create', { streamIds: [streams.received], type: ET_CONVERSATION, content: body, clientData } as any, 'event') as { id: string };
  const deleted: string[] = [];
  for (const p of stale) {
    const questions = conv.questions.filter(q => DOCUMENT_CODES.has(q.code) && q.item.content.candidateId === p.candidateId).map(q => q.item.id);
    for (const id of [p.item.id, ...questions]) { await deleteTwice(personConnection, 'events.delete', { id }); deleted.push(id); }
  }
  return { outcome: 'created', eventId: event.id, deleted };
}

/** R10: delete items on the person's `received` child (trashed, then deleted). An item already gone is skipped. */
export async function deleteConversationItems (personConnection: pryv.Connection, eventIds: string[]): Promise<void> {
  for (const id of eventIds ?? []) await deleteTwice(personConnection, 'events.delete', { id });
}

// ---- internals ---- //

/** R3 / R10: once she answered `not-mine`, the contact writes nothing more about the document. */
function notMine (fn: string): never {
  throw new HDSLibError(`${fn}: the person answered that this document is not hers`, { reason: 'not-mine' });
}

/** Pryv trashes on the first delete and deletes on the second: both, a resource already gone counting as done. */
async function deleteTwice (connection: pryv.Connection, method: 'events.delete' | 'streams.delete', params: Record<string, unknown>): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      await connection.apiOne(method, params as any);
    } catch (e) {
      if (pryvErrorCode(e) !== 'unknown-resource') throw e;
      return;
    }
  }
}

const ALERT_TEXT: Record<ConversationAlertKind, { title: Record<string, string>; body: Record<string, string> }> = {
  'task-status': {
    title: { en: 'Document update', fr: 'Suivi du document' },
    body: { en: 'Your contact updated the status of a document.', fr: 'Votre contact a mis à jour l\'état d\'un document.' }
  },
  notice: {
    title: { en: 'Message', fr: 'Message' },
    body: { en: 'Your contact sent you a message.', fr: 'Votre contact vous a envoyé un message.' }
  },
  question: {
    title: { en: 'Question', fr: 'Question' },
    body: { en: 'Your contact asks you a question.', fr: 'Votre contact vous pose une question.' }
  },
  'proposed-values': {
    title: { en: 'Proposed values', fr: 'Valeurs proposées' },
    body: { en: 'Your contact proposes values read from a document. Please check them.', fr: 'Votre contact propose des valeurs lues dans un document. Merci de les vérifier.' }
  },
  answer: {
    title: { en: 'Answer', fr: 'Réponse' },
    body: { en: 'The person answered.', fr: 'La personne a répondu.' }
  }
};

const STREAM_LABELS: Record<ConversationDirection, Record<'person' | 'contact', Record<string, string>>> = {
  received: {
    person: { en: 'Received in conversations', fr: 'Reçu dans les conversations', es: 'Recibido en las conversaciones' },
    contact: { en: 'Items you send', fr: 'Éléments que vous envoyez', es: 'Elementos que usted envía' }
  },
  sent: {
    person: { en: 'Your answers', fr: 'Vos réponses', es: 'Sus respuestas' },
    contact: { en: 'Answers shared with you', fr: 'Réponses partagées avec vous', es: 'Respuestas compartidas con usted' }
  }
};
