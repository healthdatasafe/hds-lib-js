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
 * - `received`, granted `contribute`: the contact's `question` and `proposed-value` events;
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

import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { schemaIssues } from '../utils/schemaCheck.ts';
import { pryvErrorCode } from './appScope.ts';
import { ET_ALERT } from './dataExport.ts';
import { relationshipIdOf } from './documents.ts';
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

export const ITEM_KINDS = { QUESTION: 'question', PROPOSED_VALUE: 'proposed-value', ANSWER: 'answer' } as const;
export type ConversationItemKind = typeof ITEM_KINDS[keyof typeof ITEM_KINDS];

export const QUESTION_CODES = {
  WHICH_SPECIMEN: 'which-specimen',
  WHICH_UNIT: 'which-unit',
  WHICH_ANALYTE: 'which-analyte',
  IS_FASTING: 'is-fasting',
  WHICH_DATE: 'which-date',
  IS_THIS_YOURS: 'is-this-yours'
} as const;

export const TASK_STATUSES = ['received', 'reading', 'awaiting-answers', 'done', 'error'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const ANSWER_ACTIONS = ['confirm', 'correct', 'not-mine', 'skip', 'choose', 'request-item', 'duplicate'] as const;
export type AnswerAction = typeof ANSWER_ACTIONS[number];

export const NOTICE_CODES = { NO_RESULT_FOUND: 'no-result-found', TYPED_TEXT_NOT_READ: 'typed-text-not-read' } as const;
export const ERROR_CODES = { NO_ATTACHMENT: 'no-attachment', WRITE_FAILED: 'write-failed' } as const;

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
  return { level: 'info', title: { ...ALERT_TEXT[kind].title }, body: { ...ALERT_TEXT[kind].body }, code: 'hds-' + kind, hds: { ...hds } };
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
    const allowed = dir === 'received' ? (c.kind === 'question' || c.kind === 'proposed-value') : c.kind === 'answer';
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
}

const PV_ACTIONS = new Set(['confirm', 'correct', 'skip', 'request-item', 'duplicate']);
const CHOOSE_CODES = new Set<string>([QUESTION_CODES.WHICH_SPECIMEN, QUESTION_CODES.WHICH_UNIT, QUESTION_CODES.WHICH_ANALYTE, QUESTION_CODES.IS_FASTING]);
const KNOWN_CODES = new Set<string>(Object.values(QUESTION_CODES));

/** The actions an answer to a question with `code` may carry (§ Answers, by what they answer). */
function questionActions (code: string): Set<string> {
  if (CHOOSE_CODES.has(code)) return new Set(['choose', 'skip']);
  if (code === QUESTION_CODES.WHICH_DATE) return new Set(['confirm', 'skip']);
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
  const pvByCandidate = new Map<string, ConversationItem>();
  for (const i of mine) {
    if (i.kind !== 'proposed-value' || typeof i.content.candidateId !== 'string') continue;
    const prev = pvByCandidate.get(i.content.candidateId);
    if (prev == null || i.modified > prev.modified) pvByCandidate.set(i.content.candidateId, i);
  }
  const answers = mine.filter(i => i.kind === 'answer');

  const covered = (a: ConversationItem): ConversationItem[] => {
    const out: ConversationItem[] = [];
    const target = byId.get(a.content.inReplyTo);
    if (target) out.push(target);
    for (const c of [...(a.content.candidateIds ?? []), target?.content.candidateId]) {
      const pv = typeof c === 'string' ? pvByCandidate.get(c) : undefined;
      if (pv && !out.includes(pv)) out.push(pv);
    }
    return out;
  };
  const counts = (a: ConversationItem): boolean => {
    const target = byId.get(a.content.inReplyTo);
    if (target == null) return false;
    const allowed = target.kind === 'question' ? questionActions(target.content.code) : PV_ACTIONS;
    if (!allowed.has(a.content.action)) return false;
    if (a.content.basis != null && !basisFits(a.content, target)) return false;
    return !covered(a).some(c => c.modified > a.created);
  };
  const counting = answers.filter(counts);

  const replacedBy = new Map<string, string>();
  for (const pv of pvByCandidate.values()) {
    if (typeof pv.content.replaces === 'string') replacedBy.set(pv.content.replaces, pv.content.candidateId);
  }

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

  const writtenCandidates: Record<string, string> = {};
  for (const a of answers) {
    if (!WRITING_ACTIONS.has(a.content.action)) continue;
    for (const w of a.content.written ?? []) {
      if (typeof w?.candidateId === 'string' && typeof w.eventId === 'string') writtenCandidates[w.candidateId] = w.eventId;
    }
  }
  const received = mine.filter(i => i.direction === 'received');
  return { about, proposedValues, questions, answers, received, writtenCandidates, identity, documentDate, candidateDates };
}

const WRITING_ACTIONS = new Set(['confirm', 'correct']);
const TIME_PRECISIONS = new Set(['day', 'month', 'year', 'unknown']);

/** The automatic answers' bases (R3): `profile-match` confirms `is-this-yours`, `existing-value` marks proposed values `duplicate`. */
export const BASES = { PROFILE_MATCH: 'profile-match', EXISTING_VALUE: 'existing-value' } as const;

/** R3 / R8: an answer's `basis` fits what it answers; an unknown one, or one on the wrong target, never counts. */
function basisFits (answer: Record<string, any>, target: ConversationItem): boolean {
  if (answer.basis === BASES.PROFILE_MATCH) return answer.action === 'confirm' && target.kind === 'question' && target.content.code === QUESTION_CODES.IS_THIS_YOURS;
  if (answer.basis === BASES.EXISTING_VALUE) return answer.action === 'duplicate' && target.kind === 'proposed-value';
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
    if (q.state !== 'open' || (q.code === QUESTION_CODES.IS_THIS_YOURS && q.item.content.context?.identity != null)) out.add(q.item.id);
  }
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
    } else if (typeof code === 'string' && code.startsWith('x-')) {
      if (has('context')) issues.push(`question ${code}: context is for is-this-yours and which-date only`);
    } else {
      issues.push(`question: unknown code "${code}" (bare codes are HDS's; a third party's start with x-<vendor>-)`);
    }
  } else if (c.kind === 'proposed-value') {
    if ((c.status === 'kept-aside' || c.status === 'unmapped') && c.reason == null) issues.push(`proposed-value ${c.status}: reason is required`);
    const p = c.proposal;
    if (p?.time != null && p.clientData?.hdsTimePrecision == null) issues.push('proposed-value: proposal with time needs clientData.hdsTimePrecision');
    if (p?.clientData?.hdsTimePrecision === 'unknown' && c.replaces == null) issues.push('proposed-value: hdsTimePrecision unknown only on a re-proposal (replaces)');
  } else if (c.kind === 'answer') {
    const n = c.candidateIds?.length ?? 0;
    if (c.action === 'choose' && c.option == null) issues.push('answer choose: option is required');
    if (c.action !== 'choose' && c.option != null) issues.push('answer: option only with choose');
    if (c.written != null && c.action !== 'confirm' && c.action !== 'correct') issues.push(`answer ${c.action}: no written`);
    if (c.action === 'correct' && (n !== 1 || c.written?.length !== 1)) issues.push('answer correct: exactly one candidateIds entry and its written entry');
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
    if (code === QUESTION_CODES.WHICH_DATE && c.action === 'confirm') {
      if (c.timePrecision == null) issues.push('answer which-date: timePrecision is required');
      else if (c.timePrecision !== 'unknown' && c.time == null) issues.push('answer which-date: time is required');
    }
    if (c.basis != null && (c.basis !== BASES.PROFILE_MATCH || code !== QUESTION_CODES.IS_THIS_YOURS)) issues.push('answer: on a question, basis is profile-match on is-this-yours only');
  } else if (target.kind === 'proposed-value') {
    if (!PV_ACTIONS.has(c.action)) issues.push(`answer: ${c.action} does not answer a proposed value`);
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
    issues.push('answer: the target is not a question or a proposed value');
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
 * alerts. In order: the document's items read again; a candidate is refused when it changed since `shownAt` (Unix
 * seconds, when the cards were shown), when an `is-this-yours` question is not confirmed (or answered `not-mine`),
 * when it has no date (its `proposal.time` or a `which-date` answer), or when R9 refuses it (or the correction);
 * each accepted value is looked up by `sourceKey` and written only when missing; one answer carries every
 * confirmation (`inReplyTo` the first), each correction its own; each answer's alert on the relationship's collectors
 * stream. Refused candidates are returned, the others written. A failure after a value was written throws with
 * `reason: 'write-failed'`: calling again finds the values by `sourceKey` and writes none twice.
 */
export async function acceptProposedValues (
  connection: pryv.Connection,
  rel: ConversationRelationship,
  params: { about: string; decisions: Decision[]; shownAt: number; engines: readonly string[] }
): Promise<{ answers: AnswerWritten[]; refused: Array<{ candidateId: string; reason: AcceptRefusal }> }> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'acceptProposedValues');
  if (typeof params?.shownAt !== 'number') throw new HDSLibError('acceptProposedValues: shownAt is required');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: params.about }), params.about);
  const refused: Array<{ candidateId: string; reason: AcceptRefusal }> = [];
  const accepted: Array<{ pv: ProposedValueView; decision: Decision; event: Record<string, any> }> = [];
  for (const decision of params.decisions ?? []) {
    const reason = acceptRefusal(conv, decision, params);
    if (typeof reason === 'string') refused.push({ candidateId: decision.candidateId, reason });
    else accepted.push(reason);
  }
  const written = new Map<string, string>();
  try {
    for (const { pv, event } of accepted) {
      const found = await findBySourceKey(connection, event.streamIds[0], event.clientData.sourceKey, event.time);
      written.set(pv.candidateId, found ?? (await connection.apiOne('events.create', event as any, 'event') as { id: string }).id);
    }
  } catch (e) {
    throw new HDSLibError('acceptProposedValues: a value was not written', { reason: 'write-failed', written: Object.fromEntries(written), error: e });
  }
  const groups: Array<{ action: 'confirm' | 'correct'; pvs: ProposedValueView[] }> = [];
  const confirms = accepted.filter(a => a.decision.action === 'confirm').map(a => a.pv);
  if (confirms.length > 0) groups.push({ action: 'confirm', pvs: confirms });
  for (const a of accepted.filter(a => a.decision.action === 'correct')) groups.push({ action: 'correct', pvs: [a.pv] });
  const answers: AnswerWritten[] = [];
  for (const g of groups) {
    const w = g.pvs.map(pv => ({ candidateId: pv.candidateId, eventId: written.get(pv.candidateId)! }));
    const content = { kind: 'answer', inReplyTo: g.pvs[0].item.id, about: params.about, action: g.action, candidateIds: g.pvs.map(p => p.candidateId), written: w };
    answers.push({ ...await writeAnswer(connection, streams.sent, collectorStreamId, content, g.pvs[0].item, conv), action: g.action, written: w });
  }
  return { answers, refused };
}

function acceptRefusal (
  conv: DocumentConversation,
  decision: Decision,
  params: { shownAt: number; engines: readonly string[] }
): AcceptRefusal | { pv: ProposedValueView; decision: Decision; event: Record<string, any> } {
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
  params: { questionId: string; action: AnswerAction; option?: string; time?: number; timePrecision?: string; basis?: 'profile-match'; shownAt: number }
): Promise<AnswerWritten & { deletedValueIds: string[] }> {
  const { streams, collectorStreamId } = await personSide(connection, rel, 'answerQuestion');
  if (typeof params?.shownAt !== 'number') throw new HDSLibError('answerQuestion: shownAt is required');
  const question = await receivedItem(connection, streams, params.questionId, 'question', 'answerQuestion');
  const conv = conversationOf(await listConversationItems(connection, streams, { about: question.about }), question.about);
  const current = conv.questions.find(q => q.item.id === question.id)?.item ?? question;
  const about = conv.proposedValues.find(p => p.candidateId === question.content.candidateId)?.item;
  if (current.modified > params.shownAt || (about != null && about.modified > params.shownAt)) {
    throw new HDSLibError('answerQuestion: the question changed since it was shown', { reason: 'changed-since-shown' });
  }
  const content: Record<string, any> = { kind: 'answer', inReplyTo: question.id, about: question.about, action: params.action };
  if (question.content.candidateId != null) content.candidateIds = [question.content.candidateId];
  for (const k of ['option', 'time', 'timePrecision', 'basis'] as const) if (params[k] != null) content[k] = params[k];
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
  params: { about: string; candidateIds: string[]; action: 'skip' | 'request-item' | 'duplicate'; shownAt?: number; basis?: 'existing-value' }
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

/** Her event holds the proposed value: same type and content, a converted other type within the printed tolerance, or the same coded result. */
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
): Promise<(AnswerWritten & { candidateIds: string[] }) | null> {
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
  const takenCandidates = new Set<number>();
  for (const p of pairs) {
    if (takenEvents.has(p.event) || takenCandidates.has(p.c)) continue;
    takenEvents.add(p.event);
    takenCandidates.add(p.c);
  }
  const matched = [...takenCandidates].filter(i => !all[i].prior).sort((a, b) => a - b).map(i => all[i].pv);
  if (matched.length === 0) return null;
  const candidateIds = matched.map(p => p.candidateId);
  const shownAt = Math.max(...matched.map(p => p.item.modified));
  const res = await answerProposedValues(connection, rel, { about: params.about, candidateIds, action: 'duplicate', basis: BASES.EXISTING_VALUE, shownAt });
  return { ...res, candidateIds };
}

/** R3, `not-mine` after values were written: every value listed in the document's answers' `written`, deleted. */
async function deleteWrittenValues (connection: pryv.Connection, conv: DocumentConversation): Promise<string[]> {
  const ids = [...new Set(conv.answers.flatMap(a => (a.content.written ?? []).map((w: any) => w.eventId)))] as string[];
  for (const id of ids) await deleteTwice(connection, 'events.delete', { id });
  return ids;
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
    if (content.candidateId != null && !items.some(i => i.kind === 'proposed-value' && i.content.candidateId === content.candidateId)) {
      issues.push(`question: candidate ${content.candidateId} is not a proposed value of the document`);
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
