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
 * - `received`, granted `contribute`: an uploader, which lists, corrects and removes what it sent, and reads nothing
 *   else. On receipt the received id stays beside the documents stream (`receiveDocument` with `permissions`), until
 *   the person freezes the document (`freezeDocument`: the received id becomes the relationship's `shared` one).
 *
 * A CMC group needs both ids in its original offer, since a member access is bounded by that offer
 * (`newUploaderOffer`); the person's app checks them before accepting (`offeredShareIssues`) and marks the streams after
 * (`ensureOfferedShareStreams`).
 *
 * Filing moves a document between the documents streams (`fileDocument`): one documents stream per document, first in
 * `streamIds`, every share id kept. A contact reads a document through its own share child only, so an id dropped here
 * takes the document away from that contact.
 *
 * `relationship` is the base id of the person's counterparty access (`CmcRelationship.accessId`
 * without its serial), so it survives scope updates. The other side is told by a
 * `notification/alert-cmc` with `content.hds = { kind, eventId }` on the sender's own collectors
 * stream, as the data-export requests (`dataExport.ts`).
 *
 * Known limits: scope updates write the whole permission set from `rel.grantedPermissions`, so pass
 * a freshly read relationship (a stale one re-grants what another device removed). Two devices
 * sharing with a contact for the first time at the same moment can each create a `shared` child;
 * `stopSharingDocuments` removes and deletes the first one listed in the grant.
 */

import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import * as logger from '../logger.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { pryvErrorCode } from './appScope.ts';
import { cmcText } from './cmcText.ts';
import { ET_ALERT } from './dataExport.ts';
import { provisionHdsNoop } from './formSpec.ts';
import { changeSharedLevel, personPermissions, replaceSharedStream, shareStreamsAgain, stopSharingStream } from './scope.ts';
import type { ScopeChangeOptions, ScopeChangeResult, ScopePermission, ScopeRelationship } from './scope.ts';

import { DOCUMENT_SHARES_ROOT_ID, SHARE_STREAM_PREFIX, isShareStreamId } from './shareIds.ts';

export { DOCUMENT_SHARES_ROOT_ID, SHARE_STREAM_PREFIX, isShareStreamId };
export const DOCUMENTS_STREAM_ID = 'documents';
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

/** A document alert as a conversation shows it, one per alert event. */
export interface DocumentAlert {
  alertEventId: string;
  kind: DocumentAlertKind;
  /** The document's event id, in the person's account. */
  eventId: string;
  time: number;
  /** `received` when the alert carries `content.from` (delivered by the peer), else `sent`. */
  direction: 'sent' | 'received';
  from: { username: string; host: string } | null;
  /** On `document-shared`: false once a `document-unshared` of the same document follows this one. */
  current: boolean;
}

const READ_LEVELS = new Set(['read', 'contribute', 'manage']);
const RECEIVE_LEVELS = new Set(['create-only', 'contribute']);

/** What a contact may do with its `received` child: send blind, or send, list, correct and remove its own. */
export type ReceiveLevel = 'create-only' | 'contribute';

// ---- pure helpers ---- //

/** A new share child id: `share-` + 12 lowercase base36 characters, random. */
export function newShareStreamId (): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return SHARE_STREAM_PREFIX + Array.from(bytes, b => (b % 36).toString(36)).join('');
}

/** The relationship key stored on a share child: the base of the counterparty access id. */
export function relationshipIdOf (accessId: string): string {
  try {
    return (pryv as any).utils.parseAccessRef(accessId).base;
  } catch {
    return accessId;
  }
}

/**
 * The share children of a grant: `read` on a share id is the shared one, `create-only` or `contribute` the received one.
 * A `contribute` child is never the shared one, even alone: what is added to it, the contact can change and delete.
 */
export function shareStreamsOf (perms: ScopePermission[]): { shared: string | null; received: string | null } {
  let shared: string | null = null;
  let received: string | null = null;
  for (const p of perms ?? []) {
    if (!isShareStreamId(p.streamId)) continue;
    const direction = directionAt(p.level);
    if (direction === 'received') received ??= p.streamId;
    else if (direction === 'shared') shared ??= p.streamId;
  }
  return { shared, received };
}

/** The direction a share child is granted at this level for; null for a level no share child has (`manage`, `none`). */
function directionAt (level: string | undefined): ShareDirection | null {
  if (RECEIVE_LEVELS.has(level as string)) return 'received';
  return (level ?? 'read') === 'read' ? 'shared' : null;
}

/** The grant already reads every document (`documents` or `*`): sharing one only posts the alert. */
export function sharesAllDocuments (perms: ScopePermission[]): boolean {
  return (perms ?? []).some(p => (p.streamId === DOCUMENTS_STREAM_ID || p.streamId === '*') && READ_LEVELS.has(p.level ?? 'read'));
}

/**
 * Whether a grant reads this document, as the platform decides: the level of each of its streams is the nearest entry
 * walking up (else `*`), one readable stream is enough, and a stream held at `none` or `create-only` hides it.
 */
export function readsDocument (perms: ScopePermission[], document: { streamIds?: string[] } | null | undefined): boolean {
  const levels = new Map<string, string>();
  for (const p of perms ?? []) if (p.streamId != null) levels.set(p.streamId, p.level ?? 'read');
  let reads = false;
  for (const id of document?.streamIds ?? []) {
    const at = [id, ...ancestorsOf(id), '*'].find(s => levels.has(s));
    const level = at != null ? levels.get(at) as string : null;
    if (level === 'none' || level === 'create-only') return false;
    if (level != null && READ_LEVELS.has(level)) reads = true;
  }
  return reads;
}

/** `documents` or a stream under it in the data model: where a document is filed. */
export function isDocumentsStream (streamId: string): boolean {
  return streamId === DOCUMENTS_STREAM_ID || ancestorsOf(streamId).includes(DOCUMENTS_STREAM_ID);
}

/** A document's `streamIds` once filed under `target`: `target` first, the other documents streams gone, all else kept. */
export function filedStreamIds (streamIds: string[], target: string): string[] {
  return [target, ...(streamIds ?? []).filter(id => id !== target && !isDocumentsStream(id))];
}

/**
 * What an uploader puts in its invite: a `received` child it contributes to, and a `shared` one it reads, the latter
 * used when a document is frozen. Ids are new for each invite: use it on a `single-use` invite (an open link would give
 * every person the same ids, which any reader of their documents could match), with `accessType: 'app'` for a group.
 * `read` comes first: hds-lib before this version takes the first share id it can read as the `shared` child.
 */
export function newUploaderOffer (): { received: string; shared: string; permissions: Array<{ streamId: string; level: string }> } {
  const received = newShareStreamId();
  const shared = newShareStreamId();
  return { received, shared, permissions: [{ streamId: shared, level: 'read' }, { streamId: received, level: 'contribute' }] };
}

export interface OfferedShareIssue {
  streamId: string;
  /**
   * `taken`: already a share child of another relationship; `root`: the whole root; `level`: not a level a share child is
   * granted at; `direction`: not the level of this child (its own `shared` child asked at `contribute` would let the
   * contact change what she shared); `extra`: more than one child for a direction.
   */
  reason: 'taken' | 'root' | 'level' | 'direction' | 'extra';
}

/**
 * Why an offer or a scope request must not be accepted for the share ids it names. Every reader of a document sees the
 * share ids it carries, so a requester could ask for another contact's: `existing` is `listShareStreams` with
 * `includeTrashed`, `rel` the asking relationship when there is one already (its own ids are not `taken`).
 */
export function offeredShareIssues (
  perms: ScopePermission[],
  existing: ShareStream[],
  rel?: Pick<DocumentRelationship, 'accessId' | 'grantedPermissions'>
): OfferedShareIssue[] {
  const own = rel != null ? relationshipIdOf(rel.accessId) : null;
  const out: OfferedShareIssue[] = [];
  // what it is granted now tells the direction of a child not marked yet
  const granted = new Map((rel?.grantedPermissions ?? []).map(p => [p.streamId, directionAt(p.level)]));
  const seen: Record<ShareDirection, Set<string>> = { shared: new Set(), received: new Set() };
  for (const p of perms ?? []) {
    const streamId = p.streamId;
    if (streamId === DOCUMENT_SHARES_ROOT_ID) out.push({ streamId, reason: 'root' });
    if (!isShareStreamId(streamId)) continue;
    const known = existing.find(s => s.id === streamId);
    const direction = directionAt(p.level);
    if (known != null && known.relationship !== own) out.push({ streamId, reason: 'taken' });
    else if (direction == null) out.push({ streamId, reason: 'level' });
    else if ((known?.direction ?? granted.get(streamId) ?? direction) !== direction) out.push({ streamId, reason: 'direction' });
    else if (seen[direction].add(streamId).size > 1) out.push({ streamId, reason: 'extra' });
  }
  return out;
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
    title: cmcText({ [lang]: text.title }),
    body: cmcText({ [lang]: text.body }),
    code: 'hds-' + kind,
    hds: { kind, eventId }
  };
}

/**
 * Pure part of `listDocumentAlerts` (exported for tests): the document alerts, oldest first, one
 * per alert event, so sharing a document again after taking it back is a new alert. A
 * `document-sent` counts once per document (a repeated announcement is the same document). A
 * `document-shared` is `current` while no later `document-shared` or `document-unshared` of the
 * same document follows it: one active share per document.
 */
export function parseDocumentAlerts (events: Array<{ id: string; type: string; time?: number; content?: Record<string, any> | null }>): DocumentAlert[] {
  const kinds = new Set<string>(Object.values(DOCUMENT_ALERT_KINDS));
  const seen = new Set<string>();
  const out: DocumentAlert[] = [];
  const sorted = [...(events ?? [])].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  for (const e of sorted) {
    if (e.type !== ET_ALERT || seen.has(e.id)) continue;
    const c = e.content ?? {};
    const kind = c.hds?.kind;
    const eventId = c.hds?.eventId;
    if (!kinds.has(kind) || typeof eventId !== 'string' || eventId.length === 0) continue;
    const key = kind === DOCUMENT_ALERT_KINDS.SENT ? 'sent:' + eventId : e.id;
    if (seen.has(key)) continue;
    seen.add(e.id);
    seen.add(key);
    const from = c.from && typeof c.from.username === 'string' ? { username: c.from.username, host: String(c.from.host ?? '') } : null;
    out.push({ alertEventId: e.id, kind, eventId, time: e.time ?? 0, direction: from ? 'received' : 'sent', from, current: true });
  }
  const changedLater = new Set<string>();
  for (let i = out.length - 1; i >= 0; i--) {
    const a = out[i];
    if (a.kind === DOCUMENT_ALERT_KINDS.SENT) continue;
    if (a.kind === DOCUMENT_ALERT_KINDS.SHARED) a.current = !changedLater.has(a.eventId);
    changedLater.add(a.eventId);
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
  return (await shareChildren(connection, opts.includeTrashed === true)).marked;
}

/** The `share-…` children of the root: the marked ones, and the ids of those with no valid mark. */
async function shareChildren (connection: pryv.Connection, includeTrashed: boolean): Promise<{ marked: ShareStream[]; unmarked: string[] }> {
  try {
    const params: Record<string, unknown> = { parentId: DOCUMENT_SHARES_ROOT_ID };
    if (includeTrashed) params.state = 'all';
    const streams = await connection.apiOne('streams.get', params, 'streams') as any[];
    const marked = shareStreamsIn(streams);
    const ids = new Set(marked.map(s => s.id));
    return { marked, unmarked: streams.map(s => s.id).filter(id => isShareStreamId(id) && !ids.has(id)) };
  } catch (e) {
    if (pryvErrorCode(e) === 'unknown-referenced-resource') return { marked: [], unmarked: [] };
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

/**
 * The relationship's share child for `direction`, created (with the root) when missing. A `shared` child is reused
 * only while the contact is granted it: an ungranted one (left by a stop whose delete failed) still carries the
 * documents shared before, and granting it again would hand them all back. An ungranted `received` one is reused only
 * when empty, for the same reason.
 */
export async function ensureShareStream (connection: pryv.Connection, rel: DocumentRelationship, direction: ShareDirection): Promise<string> {
  const relationship = relationshipIdOf(requireAccessId(rel, 'ensureShareStream'));
  if (direction === 'shared') {
    const granted = await liveShareChild(connection, rel, 'shared');
    if (granted != null) return granted;
  } else {
    const granted = await liveShareChild(connection, rel, 'received');
    if (granted != null) return granted;
    for (const s of await listShareStreams(connection)) {
      if (s.relationship === relationship && s.direction === direction && !await holdsEvents(connection, s.id)) return s.id;
    }
  }
  return await createShareChild(connection, relationship, direction);
}

async function createShareChild (connection: pryv.Connection, relationship: string, direction: ShareDirection): Promise<string> {
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

/**
 * The share children a grant names and the requester chose (`newUploaderOffer`), created under `document-shares` and
 * marked with their relationship and direction. Idempotent; a child the consent screen created without its mark, or at
 * the root, is repaired. Throws `share-id-taken` when an id is another relationship's child, or trashed: the grant then
 * reaches what it must not, and the caller revokes it.
 */
export async function ensureOfferedShareStreams (connection: pryv.Connection, rel: DocumentRelationship): Promise<{ shared: string | null; received: string | null }> {
  const relationship = relationshipIdOf(requireAccessId(rel, 'ensureOfferedShareStreams'));
  const ids = shareStreamsOf(rel.grantedPermissions);
  const missing = (['received', 'shared'] as const).filter(direction => ids[direction] != null);
  if (missing.length === 0) return ids;
  await ensureDocumentSharesRoot(connection);
  for (const direction of missing) {
    const id = ids[direction] as string;
    const clientData = { hdsDocumentShare: { relationship, direction } };
    try {
      await connection.apiOne('streams.create', { id, name: id, parentId: DOCUMENT_SHARES_ROOT_ID, clientData } as any, 'stream');
      continue;
    } catch (e) {
      if (pryvErrorCode(e) !== 'item-already-exists') throw e;
    }
    const stream = findStream(await connection.apiOne('streams.get', { state: 'all' }, 'streams') as any[], id);
    const mark = stream?.clientData?.hdsDocumentShare;
    if (stream == null || stream.trashed === true || (mark != null && (mark.relationship !== relationship || mark.direction !== direction)) ||
      (mark == null && await namedByAnother(connection, relationship, id))) {
      throw new HDSLibError(`ensureOfferedShareStreams: "${id}" is not free`, { reason: 'share-id-taken', streamId: id });
    }
    if (mark != null && stream.parentId === DOCUMENT_SHARES_ROOT_ID) continue;
    const update: Record<string, unknown> = { name: id, clientData: { ...stream.clientData, ...clientData } };
    if (stream.parentId !== DOCUMENT_SHARES_ROOT_ID) update.parentId = DOCUMENT_SHARES_ROOT_ID;
    await connection.apiOne('streams.update', { id, update } as any, 'stream');
  }
  return ids;
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

/**
 * Take one document back: the relationship's share id removed from it, then the `document-unshared` alert. `stillReads`,
 * with no alert, when the contact reads it anyway: through `documents`, the stream it is filed under, or the contact's
 * own `received` child.
 */
export async function unshareDocument (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  eventId: string,
  opts: { locale?: string } = {}
): Promise<{ alertEventId: string | null; stillReads: boolean }> {
  const collectorStreamId = requireCollectorStream(rel, 'unshareDocument');
  const relationship = relationshipIdOf(requireAccessId(rel, 'unshareDocument'));
  const ids = new Set((await listShareStreams(connection)).filter(s => s.relationship === relationship && s.direction === 'shared').map(s => s.id));
  const granted = shareStreamsOf(rel.grantedPermissions).shared;
  if (granted) ids.add(granted);
  if (ids.size === 0) throw new HDSLibError('unshareDocument: nothing is shared with this relationship', { reason: 'not-shared', eventId });
  let kept: string[] = [];
  await changeEventStreams(connection, eventId, list => { kept = list.filter(id => !ids.has(id)); return kept; }, 'unshareDocument');
  if (readsDocument(rel.grantedPermissions, { streamIds: kept })) return { alertEventId: null, stillReads: true };
  const { alertEventId } = await postDocumentAlert(connection, collectorStreamId, DOCUMENT_ALERT_KINDS.UNSHARED, eventId, opts.locale);
  return { alertEventId, stillReads: false };
}

export type StopSharingDocumentsResult = ScopeChangeResult & {
  /** The share child was deleted, so the documents lost its id. False when not waited for, or the delete failed. */
  shareStreamDeleted: boolean;
};

/**
 * Stop sharing all documents with a contact: its `read` on the share child removed (scope
 * update with `hds.removed`). The conversation goes on: a chat-only remainder is accepted, and
 * when nothing else is shared the `hds-noop` placeholder is granted (and provisioned). Once the
 * change is applied the share child is deleted (best effort; the documents keep `documents`), so a
 * later share starts a new child and never hands the contact back what was shared before. An uploader is granted a new,
 * empty one in its place (a group's members cannot be minted on it: it is not in the original offer). With
 * `waitForCompletion: false` the child is kept (the change may not apply); `ensureShareStream`
 * never reuses an ungranted one.
 */
export async function stopSharingDocuments (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  opts: ScopeChangeOptions = {}
): Promise<StopSharingDocumentsResult> {
  const shared = shareStreamsOf(rel.grantedPermissions).shared;
  if (shared == null) throw new HDSLibError('stopSharingDocuments: no document is shared with this relationship', { reason: 'not-shared' });
  const others = personPermissions(rel.grantedPermissions).filter(p => p.streamId !== shared);
  if (!others.some(p => p.streamId != null && !p.streamId.startsWith(':_'))) await provisionHdsNoop(connection);
  // an uploader keeps an empty `shared` child, listed first: hds-lib before this version would take its `contribute` child
  // for the shared one and add her documents to it
  const uploader = rel.grantedPermissions.some(p => isShareStreamId(p.streamId) && p.level === 'contribute');
  const result = uploader
    ? await replaceSharedStream(connection, rel, shared, { streamId: await createShareChild(connection, relationshipIdOf(rel.accessId), 'shared'), level: 'read' }, opts)
    : await stopSharingStream(connection, rel, shared, { ...opts, parentIds: [DOCUMENT_SHARES_ROOT_ID], allowChatOnly: true });
  let shareStreamDeleted = false;
  if (result.applied) {
    try {
      await deleteShareStream(connection, shared);
      shareStreamDeleted = true;
    } catch (e) {
      logger.warn('stopSharingDocuments: share child not deleted (not reused, deleted with the relationship):', e);
    }
  }
  return { ...result, shareStreamDeleted };
}

/**
 * Let a contact send documents (Route B): `create-only` (default) or `contribute` on the relationship's receive child.
 * A child already granted at the other level changes level; going down is refused while it holds documents
 * (`open-documents`). With `contribute` the `shared` child is granted too, listed before it: hds-lib before this version
 * takes the first share id it can read as the `shared` child, and would add her documents to one the contact changes.
 */
export async function allowDocumentsFrom (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  opts: ScopeChangeOptions & { level?: ReceiveLevel } = {}
): Promise<{ receiveStreamId: string; scopeUpdate: ScopeChangeResult | null }> {
  requireCollectorStream(rel, 'allowDocumentsFrom');
  const level = opts.level ?? 'create-only';
  const granted = shareStreamsOf(rel.grantedPermissions).received;
  if (granted) {
    const held = rel.grantedPermissions.find(p => p.streamId === granted)?.level;
    if (opts.level == null || held === level) return { receiveStreamId: granted, scopeUpdate: null };
    // a document on a `create-only` child is hidden from the contact, whatever else it is shared through
    if (level === 'create-only' && await holdsEvents(connection, granted)) {
      throw new HDSLibError('allowDocumentsFrom: freeze or receive the open documents first', { reason: 'open-documents', streamId: granted });
    }
    const add = level === 'contribute' ? await sharedFirst(connection, rel) : [];
    const scopeUpdate = await changeSharedLevel(connection, rel, granted, level, { ...opts, add, waitForCompletion: true });
    return { receiveStreamId: granted, scopeUpdate };
  }
  const receiveStreamId = await ensureShareStream(connection, rel, 'received');
  const add = level === 'contribute' ? await sharedFirst(connection, rel) : [];
  const levels = Object.fromEntries([...add, { streamId: receiveStreamId, level }].map(p => [p.streamId, p.level]));
  const scopeUpdate = await shareStreamsAgain(connection, rel, Object.keys(levels), { ...opts, levels, waitForCompletion: true });
  return { receiveStreamId, scopeUpdate };
}

export type ReceiveRefusal = 'not-received' | 'not-a-document' | 'no-attachment' | 'too-large';

/**
 * Process a document a contact sent: checked (only on `received` share children, of
 * `opts.relationship` when given; `file/xds-v1`, with an attachment, at most `maxBytes` in all when
 * given), then moved to `streamIds = [opts.streamId]` (default `documents`) in one update so it can later be shared
 * back. With `opts.permissions` (the relationship's grant), a received child it holds at `contribute` stays on the
 * document, so the sender keeps correcting it until `freezeDocument`.
 * An event already on `documents` (received before, or the person's own) is refused, so a repeated
 * or forged `document-sent` never strips its shares. A refused event is left as it is.
 */
export async function receiveDocument (
  connection: pryv.Connection,
  eventId: string,
  opts: { maxBytes?: number; relationship?: string; streamId?: string; permissions?: ScopePermission[] } = {}
): Promise<{ ok: true } | { ok: false; reason: ReceiveRefusal }> {
  const target = opts.streamId ?? DOCUMENTS_STREAM_ID;
  requireDocumentsStream(target, 'receiveDocument');
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
  if (target !== DOCUMENTS_STREAM_ID) await ensureDocumentsStream(connection, target);
  const open = streamIds.filter(id => (opts.permissions ?? []).some(p => p.streamId === id && p.level === 'contribute'));
  await connection.apiOne('events.update', { id: eventId, update: { streamIds: [target, ...open] } }, 'event');
  return { ok: true };
}

/**
 * File a document of hers under another documents stream (`streamId`: `documents` or a model stream under it, created
 * with its ancestors when missing). Every share id stays. It changes who reads the document, so the app says so first
 * (`readsDocument` on each grant, before and after). A document still on a received child only is filed by
 * `receiveDocument`.
 */
export async function fileDocument (connection: pryv.Connection, eventId: string, streamId: string): Promise<void> {
  requireDocumentsStream(streamId, 'fileDocument');
  const event = await getEvent(connection, eventId);
  if (event.type !== ET_DOCUMENT) throw new HDSLibError('fileDocument: not a document', { reason: 'not-a-document', eventId });
  if (!(event.streamIds ?? []).some(isDocumentsStream)) {
    throw new HDSLibError('fileDocument: not received yet (receiveDocument)', { reason: 'not-received', eventId });
  }
  if (streamId !== DOCUMENTS_STREAM_ID) await ensureDocumentsStream(connection, streamId);
  await changeEventStreams(connection, eventId, ids => filedStreamIds(ids, streamId), 'fileDocument');
}

/**
 * Freeze a document an uploader sent: its received id becomes the relationship's `shared` one (`read`, granted by a
 * scope update when missing), so the sender still reads it and can no longer change or remove it. A later correction is
 * a new document listing it in `supersedes`. Refused when it is not open to the sender (`not-open`) or not filed
 * (`not-filed`). What `receiveDocument` checked (type, size) held then: the sender could change both until now.
 */
export async function freezeDocument (
  connection: pryv.Connection,
  rel: DocumentRelationship,
  eventId: string,
  opts: ScopeChangeOptions = {}
): Promise<{ shareStreamId: string; scopeUpdate: ScopeChangeResult | null }> {
  requireAccessId(rel, 'freezeDocument');
  const granted = shareStreamsOf(rel.grantedPermissions);
  const streamIds: string[] = (await getEvent(connection, eventId)).streamIds ?? [];
  const received = granted.received;
  if (received == null || !streamIds.includes(received)) throw new HDSLibError('freezeDocument: the sender cannot change it', { reason: 'not-open', eventId });
  if (!streamIds.some(isDocumentsStream)) throw new HDSLibError('freezeDocument: file it first', { reason: 'not-filed', eventId });
  let shareStreamId = granted.shared;
  let scopeUpdate: ScopeChangeResult | null = null;
  if (shareStreamId == null) {
    requireCollectorStream(rel, 'freezeDocument');
    shareStreamId = await ensureShareStream(connection, rel, 'shared');
    scopeUpdate = await shareStreamsAgain(connection, rel, [shareStreamId], { ...opts, level: 'read', waitForCompletion: true });
  }
  const shared = shareStreamId;
  await changeEventStreams(connection, eventId, ids => [...new Set(ids.map(id => id === received ? shared : id))], 'freezeDocument');
  return { shareStreamId: shared, scopeUpdate };
}

/**
 * When a relationship ends: its share ids taken off every event on its receive child (one left with no other stream,
 * or share ids of other contacts only, goes to `documents`), then both
 * children deleted with `mergeEventsWithParent: false` (shared documents keep their documents stream). `permissions`
 * (the grant that ended) also finds offered children that were never marked (`ensureOfferedShareStreams` not run).
 * Returns the deleted child ids.
 */
export async function cleanupDocumentShares (
  connection: pryv.Connection,
  relationship: string,
  opts: { permissions?: ScopePermission[] } = {}
): Promise<string[]> {
  const base = relationshipIdOf(relationship);
  const { marked } = await shareChildren(connection, true);
  const mine = marked.filter(s => s.relationship === base);
  const unmarked: string[] = [];
  const offered = (opts.permissions ?? []).map(p => p.streamId).filter(isShareStreamId).filter(id => !marked.some(s => s.id === id));
  if (offered.length > 0) {
    // anywhere: an older consent screen creates them at the root
    const streams = await connection.apiOne('streams.get', { state: 'all' }, 'streams') as any[];
    unmarked.push(...offered.filter(id => findStream(streams, id) != null));
  }
  return await removeShareChildren(connection, mine, unmarked);
}

/** Drain the `received` and the unmarked children, then delete all of them. */
async function removeShareChildren (connection: pryv.Connection, marked: ShareStream[], unmarked: string[]): Promise<string[]> {
  const mine = [...marked.map(s => s.id), ...unmarked];
  const own = new Set(mine);
  for (const id of [...marked.filter(s => s.direction === 'received').map(s => s.id), ...unmarked]) {
    // each moved event leaves the child, so reading the first page again until it is empty walks them all;
    // `state: 'all'` for trashed events, and because a trashed child is not expanded otherwise
    for (;;) {
      const events = await connection.apiOne('events.get', { streams: [id], state: 'all', limit: 500 }, 'events') as Array<{ id: string; streamIds?: string[] }>;
      if (events.length === 0) break;
      for (const e of events) {
        const kept = (e.streamIds ?? []).filter(id => !own.has(id));
        const streamIds = kept.some(id => !isShareStreamId(id)) ? kept : [DOCUMENTS_STREAM_ID, ...kept];
        await connection.apiOne('events.update', { id: e.id, update: { streamIds } }, 'event');
      }
    }
  }
  for (const id of mine) await deleteShareStream(connection, id);
  return mine;
}

/**
 * Clean up every share child whose relationship no longer exists: after a restore (accesses are not restored), or a
 * revoke whose `cleanupDocumentShares` failed. Without `liveRelationships` the live ones are read from the account's
 * accesses (expired ones count as live), which needs a personal token: an app token lists only the accesses it
 * created, and would make every relationship look gone. So it can run at any time, contacts loaded or not. Then it also
 * empties and removes the unmarked children that hold events and that no access names any more.
 */
export async function cleanupOrphanDocumentShares (connection: pryv.Connection, liveRelationships?: string[]): Promise<string[]> {
  const { marked: children, unmarked } = await shareChildren(connection, true);
  if (children.length === 0 && (unmarked.length === 0 || liveRelationships != null)) return [];
  const abandoned: string[] = [];
  if (liveRelationships == null) {
    const info = await connection.accessInfo() as { type?: string };
    if (info?.type !== 'personal') throw new HDSLibError('cleanupOrphanDocumentShares: reading the live relationships needs a personal token', { reason: 'not-personal' });
    // an empty one may be an offer she is accepting now; read before the accesses, since what it holds was written by one
    const held: string[] = [];
    for (const id of unmarked) if (await holdsEvents(connection, id)) held.push(id);
    const accesses = await connection.apiOne('accesses.get', { includeExpired: true }, 'accesses') as Array<{ id: string; permissions?: ScopePermission[] }>;
    liveRelationships = accesses.map(a => a.id);
    const named = new Set(accesses.flatMap(a => (a.permissions ?? []).map(p => p.streamId)));
    abandoned.push(...held.filter(id => !named.has(id)));
  }
  const live = new Set(liveRelationships.map(relationshipIdOf));
  const orphans = [...new Set(children.map(s => s.relationship))].filter(r => !live.has(r));
  const deleted: string[] = [];
  for (const r of orphans) deleted.push(...await cleanupDocumentShares(connection, r));
  if (abandoned.length > 0) deleted.push(...await removeShareChildren(connection, [], abandoned));
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
  try {
    const { alertEventId } = await postDocumentAlert(ownConnection, params.collectorStreamId, DOCUMENT_ALERT_KINDS.SENT, eventId, params.locale);
    return { eventId, alertEventId };
  } catch (e) {
    // sent, not announced: the caller posts the alert again (`postDocumentAlert` with this eventId), never the document
    throw new HDSLibError('sendDocument: the document was sent, its alert was not posted', { reason: 'alert-not-posted', eventId, error: e });
  }
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

/**
 * The share child the contact is granted now for a direction: from the live access (a personal token lists it), so a relationship
 * read before another device's first share reuses that device's child instead of ungranting it; else from `rel`.
 */
async function liveShareChild (connection: pryv.Connection, rel: DocumentRelationship, direction: ShareDirection): Promise<string | null> {
  const base = relationshipIdOf(rel.accessId);
  try {
    const accesses = await connection.apiOne('accesses.get', {}, 'accesses') as Array<{ id: string; permissions?: ScopePermission[] }>;
    const live = accesses.find(a => relationshipIdOf(a.id) === base);
    if (live != null) return shareStreamsOf(live.permissions ?? [])[direction];
  } catch (e) {
    logger.warn('ensureShareStream: the live grant was not read, the relationship as given is used:', e);
  }
  return shareStreamsOf(rel.grantedPermissions)[direction];
}

/** The `shared` child to grant beside a `contribute` one: none when the contact has one already. */
async function sharedFirst (connection: pryv.Connection, rel: DocumentRelationship): Promise<Array<{ streamId: string; level: string }>> {
  if (shareStreamsOf(rel.grantedPermissions).shared != null) return [];
  return [{ streamId: await ensureShareStream(connection, rel, 'shared'), level: 'read' }];
}

/** Whether any event, trashed or not, is on this stream. */
async function holdsEvents (connection: pryv.Connection, streamId: string): Promise<boolean> {
  return (await connection.apiOne('events.get', { streams: [streamId], state: 'all', limit: 1 }, 'events') as unknown[]).length > 0;
}

/**
 * Delete a share child with `mergeEventsWithParent: false`: its documents lose its id and keep `documents`. The first
 * call trashes the stream, the second deletes it; the API takes the boolean `mergeEventsWithParent` (pryv's typings
 * say `mergeEventsWithParents`, a string).
 */
async function deleteShareStream (connection: pryv.Connection, streamId: string): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      await connection.apiOne('streams.delete', { id: streamId, mergeEventsWithParent: false } as any);
    } catch (e) {
      if (pryvErrorCode(e) !== 'unknown-resource') throw e;
    }
  }
}

/** The streams above `streamId`, the closest first: `document-shares` for a share child, else the model's (not the account's). */
function ancestorsOf (streamId: string): string[] {
  const isShare: boolean = isShareStreamId(streamId); // annotated: the guard would narrow `streamId` to never below
  if (isShare) return [DOCUMENT_SHARES_ROOT_ID];
  try {
    if (getModel().streams.getDataById(streamId, false) != null) return [...getModel().streams.getParentsIds(streamId, false)].reverse();
  } catch { /* model not loaded */ }
  // a pack older than the document: the streams under `documents` are all named `documents-…`
  if (!streamId.startsWith(DOCUMENTS_STREAM_ID + '-')) return [];
  const parts = streamId.split('-');
  return parts.slice(1).map((_, i) => parts.slice(0, parts.length - 1 - i).join('-'));
}

function requireDocumentsStream (streamId: string, fn: string): void {
  const known = streamId === DOCUMENTS_STREAM_ID || getModel().streams.getDataById(streamId, false) != null;
  if (!known || !isDocumentsStream(streamId)) throw new HDSLibError(`${fn}: "${streamId}" is not a documents stream`, { reason: 'not-a-documents-stream', streamId });
}

/** Create a documents stream and the ones above it, with their model names, where missing. */
async function ensureDocumentsStream (connection: pryv.Connection, streamId: string): Promise<void> {
  const streams = getModel().streams;
  for (const id of [...streams.getParentsIds(streamId, false), streamId]) {
    const { name, parentId } = streams.getDataById(id);
    try {
      await connection.apiOne('streams.create', parentId != null ? { id, name, parentId } : { id, name });
    } catch (e) {
      if (pryvErrorCode(e) !== 'item-already-exists') throw e;
    }
  }
}

/** Whether an access of another relationship names this stream (member accesses, which the grant created, aside: `createdBy` is `<access id>[ <caller id>]`). */
async function namedByAnother (connection: pryv.Connection, relationship: string, streamId: string): Promise<boolean> {
  const info = await connection.accessInfo() as { type?: string };
  if (info?.type !== 'personal') throw new HDSLibError('ensureOfferedShareStreams: needs a personal token', { reason: 'not-personal' });
  const accesses = await connection.apiOne('accesses.get', { includeExpired: true }, 'accesses') as Array<{ id: string; createdBy?: string; permissions?: ScopePermission[] }>;
  return accesses.some(a => relationshipIdOf(a.id) !== relationship && relationshipIdOf((a.createdBy ?? '').split(' ')[0]) !== relationship &&
    (a.permissions ?? []).some(p => p.streamId === streamId));
}

function findStream (list: any[], id: string): any {
  for (const s of list ?? []) {
    const found = s.id === id ? s : findStream(s.children, id);
    if (found != null) return found;
  }
  return null;
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
