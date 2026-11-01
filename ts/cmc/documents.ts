/**
 * Documents in a conversation: the person shares one document with one contact, takes it back,
 * and lets a contact send documents. data-model 3.37.0, `documentation/DOCUMENTS.md` (the
 * `document-shares` root) and `CUSTOM-FIELDS-AND-SYSTEM.md` (the alert kinds).
 *
 * A document stays one event on `documents`. Sharing adds the id of a share child to its
 * `streamIds`; the child sits under the `document-shares` root, one per relationship and
 * direction, and only that contact is granted it:
 *
 *   document-shares/share-<12 base36>   name = id
 *     clientData.hdsDocumentShare = { relationship, direction: 'shared' | 'received' }
 *
 * - `shared`, granted `read`: the documents the person shares with the contact;
 * - `received`, granted `create-only`: the documents the contact may send (Route B). On receipt
 *   the person's app sets the event's `streamIds` to `['documents']` (`receiveDocument`).
 *
 * `relationship` is the base id of the person's counterparty access (`CmcRelationship.accessId`
 * without its serial), so it survives scope updates. The other side is told by a
 * `notification/alert-cmc` with `content.hds = { kind, eventId }` on the sender's own collectors
 * stream, as the data-export requests (`dataExport.ts`).
 *
 * Known limits: scope updates write the whole permission set from `rel.grantedPermissions`, so pass
 * a freshly read relationship (a stale one re-grants what another device removed). Two devices
 * sharing with a contact for the first time at the same moment can each create a `shared` child;
 * `stopSharingDocuments` removes the first one listed in the grant.
 */

import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { pryvErrorCode } from './appScope.ts';
import { ET_ALERT } from './dataExport.ts';
import { provisionHdsNoop } from './formSpec.ts';
import { personPermissions, shareStreamsAgain, stopSharingStream } from './scope.ts';
import type { ScopeChangeOptions, ScopeChangeResult, ScopePermission, ScopeRelationship } from './scope.ts';

export const DOCUMENTS_STREAM_ID = 'documents';
export const DOCUMENT_SHARES_ROOT_ID = 'document-shares';
export const SHARE_STREAM_PREFIX = 'share-';
export const ET_DOCUMENT = 'file/xds-v1';

export const DOCUMENT_ALERT_KINDS = {
  SHARED: 'document-shared',
  UNSHARED: 'document-unshared',
  SENT: 'document-sent'
} as const;
export type DocumentAlertKind = typeof DOCUMENT_ALERT_KINDS[keyof typeof DOCUMENT_ALERT_KINDS];

export type ShareDirection = 'shared' | 'received';

/** A share child as the person's stream tree lists it. */
export interface ShareStream {
  id: string;
  relationship: string;
  direction: ShareDirection;
}

/** A relationship as these helpers need it (a `CmcRelationship` fits). */
export type DocumentRelationship = ScopeRelationship;

/** A document alert as a conversation shows it, one per `(kind, eventId)`. */
export interface DocumentAlert {
  alertEventId: string;
  kind: DocumentAlertKind;
  /** The document's event id, in the person's account. */
  eventId: string;
  time: number;
  /** `received` when the alert carries `content.from` (delivered by the peer), else `sent`. */
  direction: 'sent' | 'received';
  from: { username: string; host: string } | null;
  /** On `document-shared`: false once a later `document-unshared` of the same document exists. */
  current: boolean;
}

const READ_LEVELS = new Set(['read', 'contribute', 'manage']);

// ---- pure helpers ---- //

/** A new share child id: `share-` + 12 lowercase base36 characters, random. */
export function newShareStreamId (): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return SHARE_STREAM_PREFIX + Array.from(bytes, b => (b % 36).toString(36)).join('');
}

export function isShareStreamId (streamId: unknown): streamId is string {
  return typeof streamId === 'string' && /^share-[a-z0-9]{12}$/.test(streamId);
}

/** The relationship key stored on a share child: the base of the counterparty access id. */
export function relationshipIdOf (accessId: string): string {
  try {
    return (pryv as any).utils.parseAccessRef(accessId).base;
  } catch {
    return accessId;
  }
}

/** The share children of a grant: `read` on a share id is the shared one, `create-only` the received one. */
export function shareStreamsOf (perms: ScopePermission[]): { shared: string | null; received: string | null } {
  let shared: string | null = null;
  let received: string | null = null;
  for (const p of perms ?? []) {
    if (!isShareStreamId(p.streamId)) continue;
    if (p.level === 'create-only') received ??= p.streamId;
    else if (READ_LEVELS.has(p.level ?? 'read')) shared ??= p.streamId;
  }
  return { shared, received };
}

/** The grant already reads every document (`documents` or `*`): sharing one only posts the alert. */
export function sharesAllDocuments (perms: ScopePermission[]): boolean {
  return (perms ?? []).some(p => (p.streamId === DOCUMENTS_STREAM_ID || p.streamId === '*') && READ_LEVELS.has(p.level ?? 'read'));
}

/** The share children in a stream tree (`streams.get` output, any depth), with valid `hdsDocumentShare`. */
export function shareStreamsIn (streams: Array<{ id: string; parentId?: string | null; clientData?: any; children?: any[] }>): ShareStream[] {
  const out: ShareStream[] = [];
  const walk = (list: any[]): void => {
    for (const s of list ?? []) {
      const info = s.clientData?.hdsDocumentShare;
      if (s.parentId === DOCUMENT_SHARES_ROOT_ID && isShareStreamId(s.id) && typeof info?.relationship === 'string' &&
        (info.direction === 'shared' || info.direction === 'received')) {
        out.push({ id: s.id, relationship: info.relationship, direction: info.direction });
      }
      if (Array.isArray(s.children)) walk(s.children);
    }
  };
  walk(streams);
  return out;
}

/** Alert content for one document kind: fixed title and body, never the document's title. */
export function buildDocumentAlertContent (kind: DocumentAlertKind, eventId: string, locale: string = 'en'): Record<string, unknown> {
  if (!Object.values(DOCUMENT_ALERT_KINDS).includes(kind)) throw new HDSLibError(`unknown document alert kind "${kind}"`);
  if (!eventId) throw new HDSLibError('buildDocumentAlertContent: eventId is required');
  const text = TEXT[kind][locale] ?? TEXT[kind].en;
  const lang = TEXT[kind][locale] ? locale : 'en';
  return {
    level: 'info',
    title: { [lang]: text.title },
    body: { [lang]: text.body },
    code: 'hds-' + kind,
    hds: { kind, eventId }
  };
}

/**
 * Pure part of `listDocumentAlerts` (exported for tests): one alert per `(kind, eventId)`, the
 * earliest, oldest first. A `document-shared` is `current` unless a later `document-unshared`
 * of the same document exists.
 */
export function parseDocumentAlerts (events: Array<{ id: string; type: string; time?: number; content?: Record<string, any> | null }>): DocumentAlert[] {
  const kinds = new Set<string>(Object.values(DOCUMENT_ALERT_KINDS));
  const seen = new Map<string, DocumentAlert>();
  const lastShare = new Map<string, { kind: string; time: number }>();
  const sorted = [...(events ?? [])].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  for (const e of sorted) {
    if (e.type !== ET_ALERT) continue;
    const c = e.content ?? {};
    const kind = c.hds?.kind;
    const eventId = c.hds?.eventId;
    if (!kinds.has(kind) || typeof eventId !== 'string' || eventId.length === 0) continue;
    const time = e.time ?? 0;
    if (kind !== DOCUMENT_ALERT_KINDS.SENT) lastShare.set(eventId, { kind, time });
    const key = kind + ':' + eventId;
    if (seen.has(key)) continue;
    const from = c.from && typeof c.from.username === 'string' ? { username: c.from.username, host: String(c.from.host ?? '') } : null;
    seen.set(key, { alertEventId: e.id, kind, eventId, time, direction: from ? 'received' : 'sent', from, current: true });
  }
  const out = [...seen.values()];
  for (const a of out) {
    if (a.kind === DOCUMENT_ALERT_KINDS.SHARED) a.current = lastShare.get(a.eventId)?.kind === DOCUMENT_ALERT_KINDS.SHARED;
  }
  return out;
}

// ---- both sides ---- //

/** Post a document alert on the own collectors stream; the plugin delivers it to the peer. */
export async function postDocumentAlert (connection: pryv.Connection, collectorStreamId: string, kind: DocumentAlertKind, eventId: string, locale?: string): Promise<{ alertEventId: string }> {
  if (!collectorStreamId) throw new HDSLibError('postDocumentAlert: collectorStreamId is required', { reason: 'no-collector-stream' });
  const event = await connection.apiOne('events.create', {
    streamIds: [collectorStreamId],
    type: ET_ALERT,
    content: buildDocumentAlertContent(kind, eventId, locale)
  }, 'event') as { id: string };
  return { alertEventId: event.id };
}

/** The document alerts on one collectors stream (either side), as `parseDocumentAlerts` returns them. */
export async function listDocumentAlerts (connection: pryv.Connection, collectorStreamId: string, opts: { limit?: number } = {}): Promise<DocumentAlert[]> {
  const events = await connection.apiOne('events.get', {
    streams: [collectorStreamId],
    types: [ET_ALERT],
    limit: opts.limit ?? 500
  }, 'events') as Array<{ id: string; type: string; time?: number; content?: Record<string, any> }>;
  return parseDocumentAlerts(events);
}

// ---- the person's side (personal token) ---- //

/**
 * The share children in the person's account. Empty when the root does not exist yet. `includeTrashed`: also the
 * trashed ones (a cleanup interrupted between its two deletes).
 */
export async function listShareStreams (connection: pryv.Connection, opts: { includeTrashed?: boolean } = {}): Promise<ShareStream[]> {
  try {
    const params: Record<string, unknown> = { parentId: DOCUMENT_SHARES_ROOT_ID };
    if (opts.includeTrashed === true) params.state = 'all';
    const streams = await connection.apiOne('streams.get', params, 'streams') as any[];
    return shareStreamsIn(streams);
  } catch (e) {
    if (pryvErrorCode(e) === 'unknown-referenced-resource') return [];
    throw e;
  }
}

/** Create the `document-shares` root (with its model name) if missing. Idempotent. */
export async function ensureDocumentSharesRoot (connection: pryv.Connection): Promise<void> {
  let name = 'Shared documents';
  try { name = getModel().streams.getDataById(DOCUMENT_SHARES_ROOT_ID).name ?? name; } catch { /* model not loaded */ }
  try {
    await connection.apiOne('streams.create', { id: DOCUMENT_SHARES_ROOT_ID, name });
  } catch (e) {
    if (pryvErrorCode(e) !== 'item-already-exists') throw e;
  }
}

/** The relationship's share child for `direction`, created (with the root) when missing. */
export async function ensureShareStream (connection: pryv.Connection, rel: DocumentRelationship, direction: ShareDirection): Promise<string> {
  const relationship = relationshipIdOf(requireAccessId(rel, 'ensureShareStream'));
  const existing = (await listShareStreams(connection)).find(s => s.relationship === relationship && s.direction === direction);
  if (existing) return existing.id;
  await ensureDocumentSharesRoot(connection);
  const id = newShareStreamId();
  // pryv's typings take flat clientData values only
  await connection.apiOne('streams.create', {
    id,
    name: id,
    parentId: DOCUMENT_SHARES_ROOT_ID,
    clientData: { hdsDocumentShare: { relationship, direction } }
  } as any, 'stream');
  return id;
}

export interface ShareDocumentResult {
  /** `all`: the contact already reads every document, only the alert was posted. */
  mode: 'all' | 'shared';
  shareStreamId: string | null;
  /** The scope update written when the contact was granted the share child for the first time. */
  scopeUpdate: ScopeChangeResult | null;
  alertEventId: string;
}

/**
 * Share one document with a contact. In order: the share child (created if needed), the
 * contact's `read` on it (scope update, waited for), the share id added to the document, then
 * the `document-shared` alert. When the grant already reads every document, only the alert.
 */
export async function shareDocument (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  eventId: string,
  opts: ScopeChangeOptions & { locale?: string } = {}
): Promise<ShareDocumentResult> {
  const collectorStreamId = requireCollectorStream(rel, 'shareDocument');
  if (sharesAllDocuments(rel.grantedPermissions)) {
    const { alertEventId } = await postDocumentAlert(connection, collectorStreamId, DOCUMENT_ALERT_KINDS.SHARED, eventId, opts.locale);
    return { mode: 'all', shareStreamId: null, scopeUpdate: null, alertEventId };
  }
  let shareStreamId = shareStreamsOf(rel.grantedPermissions).shared;
  let scopeUpdate: ScopeChangeResult | null = null;
  if (shareStreamId == null) {
    shareStreamId = await ensureShareStream(connection, rel, 'shared');
    scopeUpdate = await shareStreamsAgain(connection, rel, [shareStreamId], { ...opts, level: 'read', waitForCompletion: true });
  }
  await changeEventStreams(connection, eventId, ids => ids.includes(shareStreamId) ? ids : [...ids, shareStreamId], 'shareDocument');
  const { alertEventId } = await postDocumentAlert(connection, collectorStreamId, DOCUMENT_ALERT_KINDS.SHARED, eventId, opts.locale);
  return { mode: 'shared', shareStreamId, scopeUpdate, alertEventId };
}

/** Take one document back: the relationship's share id removed from it, then the `document-unshared` alert. */
export async function unshareDocument (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  eventId: string,
  opts: { locale?: string } = {}
): Promise<{ alertEventId: string }> {
  const collectorStreamId = requireCollectorStream(rel, 'unshareDocument');
  const relationship = relationshipIdOf(requireAccessId(rel, 'unshareDocument'));
  const ids = new Set((await listShareStreams(connection)).filter(s => s.relationship === relationship && s.direction === 'shared').map(s => s.id));
  const granted = shareStreamsOf(rel.grantedPermissions).shared;
  if (granted) ids.add(granted);
  if (ids.size === 0) throw new HDSLibError('unshareDocument: nothing is shared with this relationship', { reason: 'not-shared', eventId });
  await changeEventStreams(connection, eventId, list => list.filter(id => !ids.has(id)), 'unshareDocument');
  return postDocumentAlert(connection, collectorStreamId, DOCUMENT_ALERT_KINDS.UNSHARED, eventId, opts.locale);
}

/**
 * Stop sharing all documents with a contact: its `read` on the share child removed (scope
 * update with `hds.removed`). The conversation goes on: a chat-only remainder is accepted, and
 * when nothing else is shared the `hds-noop` placeholder is granted (and provisioned). Documents
 * keep their share id until the child is deleted (`cleanupDocumentShares`); the contact no longer reads them.
 */
export async function stopSharingDocuments (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  opts: ScopeChangeOptions = {}
): Promise<ScopeChangeResult> {
  const shared = shareStreamsOf(rel.grantedPermissions).shared;
  if (shared == null) throw new HDSLibError('stopSharingDocuments: no document is shared with this relationship', { reason: 'not-shared' });
  const others = personPermissions(rel.grantedPermissions).filter(p => p.streamId !== shared);
  if (!others.some(p => p.streamId != null && !p.streamId.startsWith(':_'))) await provisionHdsNoop(connection);
  return stopSharingStream(connection, rel, shared, { ...opts, parentIds: [DOCUMENT_SHARES_ROOT_ID], allowChatOnly: true });
}

/** Let a contact send documents (Route B): `create-only` on the relationship's receive child. */
export async function allowDocumentsFrom (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  opts: ScopeChangeOptions = {}
): Promise<{ receiveStreamId: string; scopeUpdate: ScopeChangeResult | null }> {
  requireCollectorStream(rel, 'allowDocumentsFrom');
  const granted = shareStreamsOf(rel.grantedPermissions).received;
  if (granted) return { receiveStreamId: granted, scopeUpdate: null };
  const receiveStreamId = await ensureShareStream(connection, rel, 'received');
  const scopeUpdate = await shareStreamsAgain(connection, rel, [receiveStreamId], { ...opts, level: 'create-only', waitForCompletion: true });
  return { receiveStreamId, scopeUpdate };
}

export type ReceiveRefusal = 'not-received' | 'not-a-document' | 'no-attachment' | 'too-large';

/**
 * Process a document a contact sent: checked (only on `received` share children, of
 * `opts.relationship` when given; `file/xds-v1`, with an attachment, at most `maxBytes` in all when
 * given), then moved to `streamIds = ['documents']` in one update so it can later be shared back.
 * An event already on `documents` (received before, or the person's own) is refused, so a repeated
 * or forged `document-sent` never strips its shares. A refused event is left as it is.
 */
export async function receiveDocument (
  connection: pryv.Connection,
  eventId: string,
  opts: { maxBytes?: number; relationship?: string } = {}
): Promise<{ ok: true } | { ok: false; reason: ReceiveRefusal }> {
  const event = await getEvent(connection, eventId);
  const streamIds: string[] = event.streamIds ?? [];
  const relationship = opts.relationship != null ? relationshipIdOf(opts.relationship) : null;
  const receiving = new Set((await listShareStreams(connection))
    .filter(s => s.direction === 'received' && (relationship == null || s.relationship === relationship))
    .map(s => s.id));
  if (streamIds.length === 0 || !streamIds.every(id => receiving.has(id))) return { ok: false, reason: 'not-received' };
  if (event.type !== ET_DOCUMENT) return { ok: false, reason: 'not-a-document' };
  const attachments: Array<{ size?: number }> = event.attachments ?? [];
  if (attachments.length === 0) return { ok: false, reason: 'no-attachment' };
  if (opts.maxBytes != null && attachments.reduce((n, a) => n + (a.size ?? 0), 0) > opts.maxBytes) return { ok: false, reason: 'too-large' };
  await connection.apiOne('events.update', { id: eventId, update: { streamIds: [DOCUMENTS_STREAM_ID] } }, 'event');
  return { ok: true };
}

/**
 * When a relationship ends: every event on its receive child moved to `['documents']`, then both
 * children deleted with `mergeEventsWithParent: false` (shared documents keep `documents`).
 * Returns the deleted child ids.
 */
export async function cleanupDocumentShares (connection: pryv.Connection, relationship: string): Promise<string[]> {
  const base = relationshipIdOf(relationship);
  const mine = (await listShareStreams(connection, { includeTrashed: true })).filter(s => s.relationship === base);
  for (const s of mine.filter(s => s.direction === 'received')) {
    // each moved event leaves the child, so reading the first page again until it is empty walks them all;
    // `state: 'all'` for trashed events, and because a trashed child is not expanded otherwise
    for (;;) {
      const events = await connection.apiOne('events.get', { streams: [s.id], state: 'all', limit: 500 }, 'events') as Array<{ id: string }>;
      if (events.length === 0) break;
      for (const e of events) {
        await connection.apiOne('events.update', { id: e.id, update: { streamIds: [DOCUMENTS_STREAM_ID] } }, 'event');
      }
    }
  }
  for (const s of mine) {
    // the first call trashes the stream, the second deletes it; the API takes the boolean
    // `mergeEventsWithParent` (pryv's typings say `mergeEventsWithParents`, a string)
    for (let i = 0; i < 2; i++) {
      try {
        await connection.apiOne('streams.delete', { id: s.id, mergeEventsWithParent: false } as any);
      } catch (e) {
        if (pryvErrorCode(e) !== 'unknown-resource') throw e;
      }
    }
  }
  return mine.map(s => s.id);
}

/** After a restore (accesses are not restored): clean up every share child whose relationship is not in `liveRelationships`. */
export async function cleanupOrphanDocumentShares (connection: pryv.Connection, liveRelationships: string[]): Promise<string[]> {
  const live = new Set(liveRelationships.map(relationshipIdOf));
  const orphans = [...new Set((await listShareStreams(connection, { includeTrashed: true })).map(s => s.relationship))].filter(r => !live.has(r));
  const deleted: string[] = [];
  for (const r of orphans) deleted.push(...await cleanupDocumentShares(connection, r));
  return deleted;
}

// ---- the contact's side ---- //

/**
 * Send one document to the person (Route B): the event and its file in one multipart create on
 * the person's receive child (through the data grant), then the `document-sent` alert on the own
 * collectors stream. The contact keeps its own copy separately.
 */
export async function sendDocument (
  personConnection: pryv.Connection,
  ownConnection: pryv.Connection,
  params: {
    receiveStreamId: string;
    collectorStreamId: string;
    content: Record<string, unknown>;
    file: Blob | ArrayBuffer | Uint8Array;
    filename: string;
    time?: number;
    locale?: string;
  }
): Promise<{ eventId: string; alertEventId: string }> {
  if (!isShareStreamId(params?.receiveStreamId)) throw new HDSLibError('sendDocument: receiveStreamId must be a share child', { reason: 'not-a-share-stream' });
  if (!params.collectorStreamId) throw new HDSLibError('sendDocument: collectorStreamId is required', { reason: 'no-collector-stream' });
  const event: Record<string, unknown> = { streamIds: [params.receiveStreamId], type: ET_DOCUMENT, content: params.content };
  if (params.time != null) event.time = params.time;
  const body = await (personConnection as any).createEventWithFileFromBuffer(event, params.file, params.filename);
  const eventId = body?.event?.id;
  if (!eventId) throw new HDSLibError('sendDocument: the document was not created', { reason: 'not-created', error: body?.error });
  const { alertEventId } = await postDocumentAlert(ownConnection, params.collectorStreamId, DOCUMENT_ALERT_KINDS.SENT, eventId, params.locale);
  return { eventId, alertEventId };
}

// ---- internals ---- //

function requireAccessId (rel: DocumentRelationship, fn: string): string {
  if (!rel?.accessId) throw new HDSLibError(`${fn}: the relationship's accessId is required`);
  return rel.accessId;
}

function requireCollectorStream (rel: DocumentRelationship, fn: string): string {
  requireAccessId(rel, fn);
  if (!rel.localCollectorStreamId) {
    throw new HDSLibError(`${fn}: the relationship has no collectors stream (no system channel)`, { reason: 'no-collector-stream', accessId: rel.accessId });
  }
  return rel.localCollectorStreamId;
}

async function getEvent (connection: pryv.Connection, eventId: string): Promise<Record<string, any>> {
  return await connection.apiOne('events.getOne', { id: eventId }, 'event') as Record<string, any>;
}

/** Delay before the second re-read of `changeEventStreams` (ms); tests set it to 0. */
export const streamsCheck = { delayMs: 1000 };

/**
 * `events.update` replaces the whole `streamIds` list and has no conditional write: write, then
 * re-read at once and again after `streamsCheck.delayMs`, and throw `concurrent-update` if another
 * device changed the list. This narrows the race, it does not close it: a write from another
 * device landing later still wins (an atomic add / remove is asked of the platform).
 */
async function changeEventStreams (connection: pryv.Connection, eventId: string, change: (ids: string[]) => string[], fn: string): Promise<void> {
  const before: string[] = (await getEvent(connection, eventId)).streamIds ?? [];
  const wanted = change(before);
  if (wanted.length === 0) throw new HDSLibError(`${fn}: an event needs at least one stream`, { reason: 'no-stream-left', eventId });
  if (sameList(before, wanted)) return;
  await connection.apiOne('events.update', { id: eventId, update: { streamIds: wanted } }, 'event');
  for (const wait of [0, streamsCheck.delayMs]) {
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    const after: string[] = (await getEvent(connection, eventId)).streamIds ?? [];
    if (!sameList(after, wanted)) throw new HDSLibError(`${fn}: the document's streams changed meanwhile`, { reason: 'concurrent-update', eventId, streamIds: after });
  }
}

function sameList (a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
}

const TEXT: Record<DocumentAlertKind, Record<string, { title: string; body: string }>> = {
  'document-shared': {
    en: { title: 'Document shared', body: 'A document was shared with you in this conversation.' },
    fr: { title: 'Document partagé', body: 'Un document a été partagé avec vous dans cette conversation.' },
    es: { title: 'Documento compartido', body: 'Se ha compartido un documento con usted en esta conversación.' }
  },
  'document-unshared': {
    en: { title: 'Document no longer shared', body: 'A document shared with you in this conversation is no longer available.' },
    fr: { title: 'Document retiré', body: 'Un document partagé avec vous dans cette conversation n’est plus disponible.' },
    es: { title: 'Documento retirado', body: 'Un documento compartido con usted en esta conversación ya no está disponible.' }
  },
  'document-sent': {
    en: { title: 'Document received', body: 'You received a document in this conversation.' },
    fr: { title: 'Document reçu', body: 'Vous avez reçu un document dans cette conversation.' },
    es: { title: 'Documento recibido', body: 'Ha recibido un documento en esta conversación.' }
  }
};
