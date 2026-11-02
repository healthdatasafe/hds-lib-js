/**
 * Sharing one type of data at a time with a connection, over the CMC scope-update path.
 *
 * The person (patient side, personal token) changes what a relationship's data grant shares by
 * writing a `consent/scope-update-cmc` trigger on the relationship's own collectors stream
 * (`CmcRelationship.localCollectorStreamId`). The platform's CMC plugin applies the new
 * permission set to the grant (keeping its own `:_cmc:*` channel permissions), records the
 * outcome on the trigger (`accessId`, `newPermissions`, `applied`, `status`) and delivers the
 * content to the connection. What the connection already read stays with it: only what comes
 * next is stopped.
 *
 * HDS adds what the connection should be told, inside the HDS-owned sub-envelope
 * `content.hds` (the same convention as the data-export alerts, data-model
 * `documentation/CUSTOM-FIELDS-AND-SYSTEM.md`), never as new top-level content fields:
 *
 *   content.hds = { removed?: string[], added?: string[], asked?: string[], message?: localizable text }
 *
 * - `removed`: the streams the person stopped sharing (`stopSharingStream`);
 * - `added`: the streams the person shared again (`shareStreamsAgain`);
 * - `asked`: on an answer to a connection's request, the streams it asked for that were not
 *   shared (read only here: `cmc.acceptScopeUpdate` / `refuseScopeUpdate` write a fixed content);
 * - `message`: the notice for the connection, per language.
 *
 * A connection asking for data again sends a `consent/scope-request-cmc` (`cmc.proposeScopeUpdate`);
 * the person answers it with `cmc.acceptScopeUpdate` / `cmc.refuseScopeUpdate`, not with these
 * helpers. `listSharingNotes` reads all of it back as one list for the conversation.
 *
 * A connection's updated data set travels in a scope request too (data-model 3.41.0):
 *
 *   content.hds = { formSpec: FormSpec (never `openLink`), formSpecHash: 'sha256:…' }
 *
 * `proposeDataSetUpdate` writes it (connection side) and `listScopeRequests` reads the requests
 * back with their answers; `acceptDataSetUpdate` accepts one and replaces the person's copy of the
 * data set on her `consent/accept-cmc` event (person side).
 */

import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { HDSLibError } from '../errors.ts';
import { cmc } from '../patchedPryv.ts';
import type { pryv } from '../patchedPryv.ts';
import { deriveCmcPermissions, formSpecFingerprint, formSpecForPerson, mirrorFormSpecOnAcceptEvent } from './formSpec.ts';
import type { FormSpec } from './formSpec.ts';

export const ET_SCOPE_UPDATE = 'consent/scope-update-cmc';
export const ET_SCOPE_REQUEST = 'consent/scope-request-cmc';

/** A permission as grants and scope requests carry it: a stream with a level, or a feature with a setting. */
export interface ScopePermission {
  streamId?: string;
  level?: string;
  defaultName?: string;
  feature?: string;
  setting?: string;
}

/** A per-language text: `{ en: '…', fr: '…' }`. */
export type ScopeMessage = Record<string, string>;

/** What the helpers need of a relationship (a `CmcRelationship` from `Contact.aggregateCmc` fits). */
export interface ScopeRelationship {
  /** The person's counterparty grant (the access whose permissions change). */
  accessId: string;
  /** The person's own `<scope>:collectors:<peerSlug>` stream; null when the grant has no system channel. */
  localCollectorStreamId: string | null;
  /** What the grant shares now. */
  grantedPermissions: ScopePermission[];
}

/** The HDS sub-envelope of a `consent/scope-update-cmc` content. */
export interface ScopeUpdateHds {
  removed?: string[];
  added?: string[];
  asked?: string[];
  message?: ScopeMessage;
}

export interface ScopeChangeOptions {
  /** The notice the connection receives, per language. */
  message?: ScopeMessage;
  /** Default true: resolve once the platform recorded the outcome. False: return right after the write. */
  waitForCompletion?: boolean;
  /** Default 20000 ms: longer than the platform's single delivery attempt (15 s). */
  completionTimeoutMs?: number;
  /** Default 400 ms. */
  completionPollIntervalMs?: number;
}

export interface ScopeChangeResult {
  /** The `consent/scope-update-cmc` trigger written. */
  updateEventId: string;
  /** `pending` when not waiting; else the trigger's status (`completed`, `delivered`, `failed`). */
  status: string;
  /** The grant changed (always true once waited for: a change that was not applied throws). */
  applied: boolean;
  /** The user-facing permission set now in force, as the platform recorded it. */
  newPermissions: ScopePermission[];
  /** The connection was told (`status === 'completed'`). The grant changed even when false. */
  peerNotified: boolean;
  /** The platform's delivery failure, when the grant changed but the connection was not told. */
  deliveryFailure?: unknown;
}

/** Why a stream cannot be stopped on its own. */
export type StopSharingRefusal =
  /** The grant does not list this stream. */
  | 'not-shared'
  /** The grant shares it through a parent stream or `*`: removing it alone would change nothing. */
  | 'shared-through-parent'
  /** Nothing else would be shared: that is ending the relationship (revoke it instead). */
  | 'nothing-left';

export type StopSharingPlan =
  | { ok: true; newPermissions: ScopePermission[] }
  | { ok: false; reason: StopSharingRefusal };

/** How to plan stopping one stream, for streams the data model does not know. */
export interface PlanStopSharingOptions {
  /** The stream's parents in the account's own stream tree (e.g. `document-shares` for a share child). */
  parentIds?: string[];
  /**
   * The conversation goes on, chat-only: a remainder of `hds-noop` only is accepted, and when nothing would remain
   * the `hds-noop` placeholder is granted instead (the stream must exist: `cmcFormSpec.provisionHdsNoop`).
   */
  allowChatOnly?: boolean;
}

/** A data stream the person would recognise as shared data (not a platform stream, not the chat-only placeholder). */
function isDataStream (streamId: string | undefined): streamId is string {
  return streamId != null && !streamId.startsWith(':_') && streamId !== 'hds-noop';
}

/** The stream ids above `streamId` in the data model and in `parentIds`, plus `*`. */
function streamsAbove (streamId: string, parentIds: string[] = []): Set<string> {
  const above = new Set<string>(['*', ...parentIds]);
  try {
    for (const id of getModel().streams.getParentsIds(streamId, false)) {
      if (id !== streamId) above.add(id);
    }
  } catch { /* model not loaded or stream unknown: only `*` */ }
  return above;
}

/**
 * The permissions the person decides on: every permission but the platform's own `:_cmc:*`
 * channel ones, in the shape `consent/scope-update-cmc` takes (`{ streamId, level }` or
 * `{ feature, setting }`).
 */
export function personPermissions (perms: ScopePermission[]): ScopePermission[] {
  return (perms ?? [])
    .filter(p => !(typeof p.streamId === 'string' && p.streamId.startsWith(':_cmc:')))
    .map(p => p.streamId != null
      ? { streamId: p.streamId, level: p.level ?? 'read' }
      : { feature: p.feature, setting: p.setting });
}

/**
 * Whether one stream can stop being shared on its own, and the permission set that would
 * remain. Pure: the model is only read to find the stream's parents; `opts.parentIds` adds the
 * parents of a stream the model does not know.
 */
export function planStopSharing (perms: ScopePermission[], streamId: string, opts: PlanStopSharingOptions = {}): StopSharingPlan {
  const own = personPermissions(perms);
  const above = streamsAbove(streamId, opts.parentIds);
  if (own.some(p => p.streamId != null && above.has(p.streamId))) return { ok: false, reason: 'shared-through-parent' };
  if (!own.some(p => p.streamId === streamId)) return { ok: false, reason: 'not-shared' };
  const kept = own.filter(p => p.streamId !== streamId);
  if (!kept.some(p => isDataStream(p.streamId))) {
    if (opts.allowChatOnly !== true) return { ok: false, reason: 'nothing-left' };
    if (!kept.some(p => p.streamId === 'hds-noop')) return { ok: true, newPermissions: [...kept, { streamId: 'hds-noop', level: 'read' }] };
  }
  return { ok: true, newPermissions: kept };
}

/**
 * What a requested permission set adds, takes away and changes the level of, compared with what
 * is shared now (the relationship's own channel and platform streams left out). For the request
 * card: a request for data already shared but at a higher level is a `changed` entry, not nothing.
 */
export function scopeDiff (current: ScopePermission[], requested: ScopePermission[]): {
  added: string[];
  removed: string[];
  changed: Array<{ streamId: string; from: string; to: string }>;
} {
  const levels = (perms: ScopePermission[]): Map<string, string> => new Map(
    (perms ?? []).filter(p => isDataStream(p.streamId)).map(p => [p.streamId as string, p.level ?? 'read'])
  );
  const now = levels(current);
  const asked = levels(requested);
  return {
    added: [...asked.keys()].filter(s => !now.has(s)),
    removed: [...now.keys()].filter(s => !asked.has(s)),
    changed: [...asked]
      .filter(([s, level]) => now.has(s) && now.get(s) !== level)
      .map(([s, level]) => ({ streamId: s, from: now.get(s) ?? 'read', to: level }))
  };
}

/**
 * Stop sharing one stream with a connection. Writes the scope update with
 * `content.hds = { removed: [streamId], message? }` and, by default, resolves once the grant
 * changed. Throws `HDSLibError` (`innerObject.reason`) when the stream cannot be stopped on its
 * own (`StopSharingRefusal`), when the relationship has no collectors stream, or when the
 * platform did not apply the change.
 */
export async function stopSharingStream (
  connection: pryv.Connection,
  rel: ScopeRelationship,
  streamId: string,
  opts: ScopeChangeOptions & PlanStopSharingOptions = {}
): Promise<ScopeChangeResult> {
  const collectorStreamId = requireCollectorStream(rel, 'stopSharingStream');
  const plan = planStopSharing(rel.grantedPermissions, streamId, opts);
  if ('reason' in plan) {
    throw new HDSLibError(`stopSharingStream: cannot stop sharing "${streamId}" on its own (${plan.reason})`, { reason: plan.reason, streamId });
  }
  const hds: ScopeUpdateHds = { removed: [streamId], ...(opts.message ? { message: opts.message } : {}) };
  return writeScopeUpdate(connection, collectorStreamId, { accessId: rel.accessId, newPermissions: plan.newPermissions, hds }, opts);
}

/**
 * Share streams with a connection again (the person's own decision). Adds each stream not
 * shared now, at `opts.level` (default `read`), and writes `content.hds = { added, message? }`.
 * Throws `HDSLibError` when every stream is already shared, when the relationship has no
 * collectors stream, or when the platform did not apply the change.
 */
export async function shareStreamsAgain (
  connection: pryv.Connection,
  rel: ScopeRelationship,
  streamIds: string[],
  opts: ScopeChangeOptions & { level?: string } = {}
): Promise<ScopeChangeResult> {
  const collectorStreamId = requireCollectorStream(rel, 'shareStreamsAgain');
  const now = personPermissions(rel.grantedPermissions);
  const back = [...new Set(streamIds)].filter(id => isDataStream(id) && !now.some(p => p.streamId === id));
  if (back.length === 0) {
    throw new HDSLibError('shareStreamsAgain: every stream is already shared', { reason: 'already-shared', streamIds });
  }
  const level = opts.level ?? 'read';
  const newPermissions = [...now, ...back.map(streamId => ({ streamId, level }))];
  const hds: ScopeUpdateHds = { added: back, ...(opts.message ? { message: opts.message } : {}) };
  return writeScopeUpdate(connection, collectorStreamId, { accessId: rel.accessId, newPermissions, hds }, opts);
}

/** A change of what a relationship shares, as a conversation shows it. */
export type SharingNote =
  | {
    kind: 'stopped' | 'shared';
    /** The scope-update event. */
    id: string;
    time: number;
    /** The streams stopped (`hds.removed`) or shared again (`hds.added`). */
    streamIds: string[];
    message: ScopeMessage | null;
    /** The connection was told (`status === 'completed'`). */
    peerNotified: boolean;
  }
  | {
    kind: 'request';
    /** The `consent/scope-request-cmc` event (answer it with `cmc.acceptScopeUpdate(conn, id)`). */
    id: string;
    time: number;
    /** The permission set the connection asks for. */
    permissions: ScopePermission[];
    message: ScopeMessage | null;
    /** Unix seconds, when the request expires. */
    expires: number | null;
    answer: 'accepted' | 'refused' | 'expired' | null;
    /** The person's answer event, when found on the stream. */
    answerEventId: string | null;
    /** `hds.asked` recorded on the answer, when its writer recorded it. */
    asked: string[] | null;
    /** The updated data set the request carries (`hds.formSpec`), else null. */
    formSpec: FormSpec | null;
    /** A newer unanswered data-set request of the same stream replaces this one: do not offer to answer it. */
    superseded: boolean;
  };

interface ScopeEvent { id: string; type: string; time?: number; content?: Record<string, any> | null }

/**
 * The relationship's sharing changes, oldest first: what the person stopped or shared again
 * (applied scope updates carrying `hds.removed` / `hds.added`) and what the connection asked
 * for (scope requests, with their answer). Read from the person's collectors stream.
 */
export async function listSharingNotes (
  connection: pryv.Connection,
  collectorStreamId: string,
  opts: { limit?: number } = {}
): Promise<SharingNote[]> {
  const events = await connection.apiOne('events.get', {
    streams: [collectorStreamId],
    types: [ET_SCOPE_UPDATE, ET_SCOPE_REQUEST],
    limit: opts.limit ?? 200
  }, 'events') as ScopeEvent[];
  return parseSharingNotes(events);
}

/** Pure part of `listSharingNotes` (exported for tests). `nowSec` decides expiry. */
export function parseSharingNotes (events: ScopeEvent[], nowSec: number = Date.now() / 1000): SharingNote[] {
  const answers = new Map<string, { accepted: boolean; id: string; asked: string[] | null }>();
  for (const e of events ?? []) {
    const c = e.content ?? {};
    if (e.type !== ET_SCOPE_UPDATE || typeof c.scopeRequestEventId !== 'string') continue;
    if (typeof c.applied !== 'boolean') continue;
    answers.set(c.scopeRequestEventId, { accepted: c.applied, id: e.id, asked: stringList(c.hds?.asked) });
  }
  const out: SharingNote[] = [];
  for (const e of events ?? []) {
    const c = e.content ?? {};
    const time = e.time ?? 0;
    if (e.type === ET_SCOPE_UPDATE) {
      // answers are shown on their request; a change that was not applied is not a change
      if (typeof c.scopeRequestEventId === 'string' || c.applied !== true) continue;
      const removed = stringList(c.hds?.removed);
      const added = stringList(c.hds?.added);
      const base = { id: e.id, time, message: messageOf(c.hds?.message), peerNotified: c.status === 'completed' };
      if (removed && removed.length > 0) out.push({ kind: 'stopped', streamIds: removed, ...base });
      else if (added && added.length > 0) out.push({ kind: 'shared', streamIds: added, ...base });
    } else if (e.type === ET_SCOPE_REQUEST && Array.isArray(c.newPermissions)) {
      const answered = answers.get(e.id);
      const expires = typeof c.expires === 'number' ? c.expires : null;
      let answer: 'accepted' | 'refused' | 'expired' | null = null;
      if (answered) answer = answered.accepted ? 'accepted' : 'refused';
      else if (c.status === 'accepted' || c.status === 'refused') answer = c.status;
      else if (expires != null && expires < nowSec) answer = 'expired';
      out.push({
        kind: 'request',
        id: e.id,
        time,
        permissions: c.newPermissions as ScopePermission[],
        message: messageOf(c.message),
        expires,
        answer,
        answerEventId: answered?.id ?? null,
        asked: answered?.asked ?? null,
        formSpec: formSpecOf(c.hds),
        superseded: false
      });
    }
  }
  out.sort((a, b) => a.time - b.time);
  markSuperseded(out.filter((n): n is Extract<SharingNote, { kind: 'request' }> => n.kind === 'request'));
  return out;
}

// ---- data-set updates (data-model 3.41.0) ---- //

/** Default lifetime of a data-set update request, in seconds (30 days). */
export const DATASET_REQUEST_TTL_SEC = 30 * 24 * 3600;

/** The HDS sub-envelope of a `consent/scope-request-cmc` content. */
export interface ScopeRequestHds {
  formSpec?: FormSpec;
  formSpecHash?: string;
}

export interface ProposeDataSetUpdateOptions {
  /** The full permission set the grant will hold. Default: what the data set needs (`deriveCmcPermissions`). */
  newPermissions?: ScopePermission[];
  /** The notice for the person, per language. */
  message?: ScopeMessage;
  /** Unix seconds; default now + {@link DATASET_REQUEST_TTL_SEC}. */
  expires?: number;
  /** Default true: resolve once delivered (`remoteEventId` recorded). False: return right after the write. */
  waitForDelivery?: boolean;
  /** Default 20000 ms. */
  deliveryTimeoutMs?: number;
  /** Default 400 ms. */
  deliveryPollIntervalMs?: number;
}

export interface ProposeDataSetUpdateResult {
  /** The connection's `consent/scope-request-cmc` trigger. */
  scopeRequestEventId: string;
  /** The person's copy, once delivered; the person's answer names it. */
  remoteScopeRequestEventId: string | null;
  /** `pending` when not waiting; else the trigger's status. */
  status: string;
  /** `formSpecFingerprint` of the data set sent. */
  formSpecHash: string;
}

/** A connection's scope request with the person's answer, as {@link listScopeRequests} returns it. */
export interface ScopeRequestRecord {
  id: string;
  time: number;
  permissions: ScopePermission[];
  message: ScopeMessage | null;
  expires: number | null;
  /** The person's copy (set by the platform on delivery). */
  remoteEventId: string | null;
  delivery: 'pending' | 'delivered' | 'failed';
  /** The data set the request carries, else null. */
  formSpec: FormSpec | null;
  formSpecHash: string | null;
  answer: 'accepted' | 'refused' | 'expired' | null;
  /** `time` of the delivered answer. */
  answeredAt: number | null;
  answerEventId: string | null;
  /** On a refusal: the person's words (pryv's `reason`). */
  reason: ScopeMessage | null;
  /** `hds.asked` on the answer. */
  asked: string[] | null;
  /** A newer unanswered data-set request replaces this one: not pending any more. */
  superseded: boolean;
}

/**
 * Connection side: send an updated data set to one person, inside a scope request on the
 * relationship's own collectors stream. Every change goes this way, one within the current grant
 * included (`newPermissions` then equal to the grant). `openLink` is removed from the copy sent.
 *
 * Throws `HDSLibError` (`innerObject.reason`): `permissions-do-not-cover` when `newPermissions`
 * misses a permission the data set needs; `previous-request-in-flight` while an earlier request
 * of this stream is neither delivered nor failed nor expired (requests go out in order);
 * `delivery-failed` / `delivery-pending` (with `scopeRequestEventId`) after the write.
 */
export async function proposeDataSetUpdate (
  connection: pryv.Connection,
  collectorStreamId: string,
  formSpec: FormSpec,
  opts: ProposeDataSetUpdateOptions = {}
): Promise<ProposeDataSetUpdateResult> {
  if (!collectorStreamId) throw new HDSLibError('proposeDataSetUpdate: collectorStreamId is required');
  const sent = formSpecForPerson(formSpec);
  const needed = deriveCmcPermissions(sent) as ScopePermission[];
  const newPermissions = opts.newPermissions ?? needed;
  const missing = uncoveredPermissions(needed, newPermissions);
  if (missing.length > 0) {
    throw new HDSLibError('proposeDataSetUpdate: newPermissions do not cover the data set', { reason: 'permissions-do-not-cover', missing });
  }
  const nowSec = Date.now() / 1000;
  const previous = await listScopeRequests(connection, collectorStreamId);
  const inFlight = previous.find(r => r.delivery === 'pending' && r.answer !== 'expired');
  if (inFlight) {
    throw new HDSLibError('proposeDataSetUpdate: the previous request is not delivered yet', { reason: 'previous-request-in-flight', scopeRequestEventId: inFlight.id });
  }
  const formSpecHash = await formSpecFingerprint(sent);
  const hds: ScopeRequestHds = { formSpec: sent, formSpecHash };
  const content: Record<string, any> = {
    newPermissions,
    expires: opts.expires ?? Math.round(nowSec + DATASET_REQUEST_TTL_SEC),
    hds
  };
  if (opts.message) content.message = opts.message;
  const event = await connection.apiOne('events.create', {
    streamIds: [collectorStreamId],
    type: ET_SCOPE_REQUEST,
    content
  }, 'event') as { id: string };
  if (opts.waitForDelivery === false) {
    return { scopeRequestEventId: event.id, remoteScopeRequestEventId: null, status: 'pending', formSpecHash };
  }
  const until = Date.now() + (opts.deliveryTimeoutMs ?? 20000);
  const interval = opts.deliveryPollIntervalMs ?? 400;
  for (;;) {
    const ev = await connection.apiOne('events.getOne', { id: event.id }, 'event') as { content?: Record<string, any> };
    const c = ev?.content ?? {};
    if (c.status === 'failed') {
      const reason = c.failure?.reason ?? 'delivery-failed';
      throw new HDSLibError(`proposeDataSetUpdate: request not delivered: ${reason}`, { reason: 'delivery-failed', failure: c.failure, scopeRequestEventId: event.id });
    }
    if (typeof c.remoteEventId === 'string') {
      return { scopeRequestEventId: event.id, remoteScopeRequestEventId: c.remoteEventId, status: c.status ?? 'delivered', formSpecHash };
    }
    if (Date.now() >= until) break;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new HDSLibError('proposeDataSetUpdate: request not delivered yet', { reason: 'delivery-pending', scopeRequestEventId: event.id });
}

/**
 * Connection side: its scope requests on one collectors stream, oldest first, each joined with the
 * person's answer (the delivered `consent/scope-update-cmc` names the person's copy, which is the
 * request's `remoteEventId`).
 */
export async function listScopeRequests (
  connection: pryv.Connection,
  collectorStreamId: string,
  opts: { limit?: number } = {}
): Promise<ScopeRequestRecord[]> {
  const events = await connection.apiOne('events.get', {
    streams: [collectorStreamId],
    types: [ET_SCOPE_UPDATE, ET_SCOPE_REQUEST],
    limit: opts.limit ?? 200
  }, 'events') as ScopeEvent[];
  return parseScopeRequests(events);
}

/** Pure part of `listScopeRequests` (exported for tests). `nowSec` decides expiry. */
export function parseScopeRequests (events: ScopeEvent[], nowSec: number = Date.now() / 1000): ScopeRequestRecord[] {
  const answers = new Map<string, { accepted: boolean; id: string; time: number; reason: ScopeMessage | null; asked: string[] | null }>();
  for (const e of events ?? []) {
    const c = e.content ?? {};
    // the person's answers only: delivered here, so stamped with `from`
    if (e.type !== ET_SCOPE_UPDATE || c.from == null || typeof c.scopeRequestEventId !== 'string' || typeof c.accept !== 'boolean') continue;
    answers.set(c.scopeRequestEventId, { accepted: c.accept, id: e.id, time: e.time ?? 0, reason: messageOf(c.reason), asked: stringList(c.hds?.asked) });
  }
  const out: ScopeRequestRecord[] = [];
  for (const e of events ?? []) {
    const c = e.content ?? {};
    // the connection's own requests: no `from`
    if (e.type !== ET_SCOPE_REQUEST || c.from != null || !Array.isArray(c.newPermissions)) continue;
    const remoteEventId = typeof c.remoteEventId === 'string' ? c.remoteEventId : null;
    const answered = remoteEventId != null ? answers.get(remoteEventId) : undefined;
    const expires = typeof c.expires === 'number' ? c.expires : null;
    const formSpec = formSpecOf(c.hds);
    let answer: ScopeRequestRecord['answer'] = null;
    if (answered) answer = answered.accepted ? 'accepted' : 'refused';
    else if (expires != null && expires < nowSec) answer = 'expired';
    out.push({
      id: e.id,
      time: e.time ?? 0,
      permissions: c.newPermissions as ScopePermission[],
      message: messageOf(c.message),
      expires,
      remoteEventId,
      delivery: remoteEventId != null ? 'delivered' : c.status === 'failed' ? 'failed' : 'pending',
      formSpec,
      formSpecHash: formSpec != null && typeof c.hds?.formSpecHash === 'string' ? c.hds.formSpecHash : null,
      answer,
      answeredAt: answered?.time ?? null,
      answerEventId: answered?.id ?? null,
      reason: answered?.reason ?? null,
      asked: answered?.asked ?? null,
      superseded: false
    });
  }
  out.sort((a, b) => a.time - b.time);
  markSuperseded(out.filter(r => r.delivery !== 'failed'));
  return out;
}

/**
 * Connection side: the `formSpecHash` of the data set a person holds through scope requests: the
 * one of the request carrying a data set whose acceptance is the most recent. Null when she never
 * accepted one: she then holds the invite's snapshot.
 */
export function acceptedDataSetHash (requests: ScopeRequestRecord[]): string | null {
  let best: ScopeRequestRecord | null = null;
  for (const r of requests ?? []) {
    if (r.answer !== 'accepted' || r.formSpecHash == null) continue;
    if (best == null || (r.answeredAt ?? 0) > (best.answeredAt ?? 0)) best = r;
  }
  return best?.formSpecHash ?? null;
}

/**
 * Person side: accept a connection's scope request and, when it carries a data set, replace her
 * copy (`hdsFormSpec` on her `consent/accept-cmc` event `acceptEventId`) once the grant changed.
 * Throws as `cmc.acceptScopeUpdate` does when nothing was applied; the copy is then untouched.
 */
export async function acceptDataSetUpdate (
  connection: pryv.Connection,
  request: { id: string; formSpec: FormSpec | null },
  acceptEventId: string | null,
  opts: { scopeStreamId?: string; completionTimeoutMs?: number } = {}
): Promise<{ updateAcceptEventId: string; newPermissions: ScopePermission[]; peerNotified: boolean; dataSetUpdated: boolean }> {
  const res = await cmc.acceptScopeUpdate(connection, request.id, opts) as Record<string, any>;
  let dataSetUpdated = false;
  if (request.formSpec != null && acceptEventId != null) {
    await mirrorFormSpecOnAcceptEvent(connection, acceptEventId, formSpecForPerson(request.formSpec));
    dataSetUpdated = true;
  }
  return {
    updateAcceptEventId: res.updateAcceptEventId,
    newPermissions: Array.isArray(res.newPermissions) ? res.newPermissions : [],
    peerNotified: res.peerNotified !== false,
    dataSetUpdated
  };
}

/**
 * The permissions of `needed` that `granted` does not cover: a stream is covered by itself, a
 * parent in the data model or `*`, at a level that includes the needed one.
 */
export function uncoveredPermissions (needed: ScopePermission[], granted: ScopePermission[]): ScopePermission[] {
  return (needed ?? []).filter(n => {
    if (n.streamId == null) return !(granted ?? []).some(g => g.feature === n.feature && g.setting === n.setting);
    const above = streamsAbove(n.streamId);
    return !(granted ?? []).some(g => g.streamId != null &&
      (g.streamId === n.streamId || above.has(g.streamId)) &&
      levelIncludes(g.level ?? 'read', n.level ?? 'read'));
  });
}

// ---- internals ---- //

function requireCollectorStream (rel: ScopeRelationship, fn: string): string {
  if (!rel?.accessId) throw new HDSLibError(`${fn}: the relationship's accessId is required`);
  if (!rel.localCollectorStreamId) {
    throw new HDSLibError(`${fn}: the relationship has no collectors stream (no system channel)`, { reason: 'no-collector-stream', accessId: rel.accessId });
  }
  return rel.localCollectorStreamId;
}

function stringList (v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : null;
}

function messageOf (v: unknown): ScopeMessage | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as ScopeMessage;
}

function formSpecOf (hds: unknown): FormSpec | null {
  const f = (hds as ScopeRequestHds | null | undefined)?.formSpec;
  return f != null && typeof f === 'object' && Array.isArray(f.sections) ? f : null;
}

/**
 * An unanswered request carrying a data set is superseded once a later one (`time`) carries a data
 * set, answered or not: accepting it would bring back an older version (data-model 3.41.1).
 * `requests` is sorted oldest first.
 */
function markSuperseded (requests: Array<{ answer: string | null; formSpec: FormSpec | null; superseded: boolean }>): void {
  const withDataSet = requests.filter(r => r.formSpec != null);
  for (const r of withDataSet.slice(0, -1)) {
    if (r.answer == null) r.superseded = true;
  }
}

const LEVEL_INCLUDES: Record<string, string[]> = {
  manage: ['manage', 'contribute', 'read', 'create-only'],
  contribute: ['contribute', 'read', 'create-only'],
  read: ['read'],
  'create-only': ['create-only']
};

function levelIncludes (have: string, need: string): boolean {
  return (LEVEL_INCLUDES[have] ?? [have]).includes(need);
}

async function writeScopeUpdate (
  connection: pryv.Connection,
  collectorStreamId: string,
  content: { accessId: string; newPermissions: ScopePermission[]; hds: ScopeUpdateHds },
  opts: ScopeChangeOptions
): Promise<ScopeChangeResult> {
  const event = await connection.apiOne('events.create', {
    streamIds: [collectorStreamId],
    type: ET_SCOPE_UPDATE,
    content
  }, 'event') as { id: string };
  if (opts.waitForCompletion === false) {
    return { updateEventId: event.id, status: 'pending', applied: false, newPermissions: content.newPermissions, peerNotified: false };
  }
  const outcome = await waitForOutcome(connection, event.id, opts);
  if (outcome.applied !== true) {
    const reason = outcome.failure?.reason ?? 'not-applied';
    throw new HDSLibError(`scope update not applied: ${reason}`, { reason, updateEventId: event.id, failure: outcome.failure });
  }
  const result: ScopeChangeResult = {
    updateEventId: event.id,
    status: outcome.status ?? 'unknown',
    applied: true,
    newPermissions: Array.isArray(outcome.newPermissions) ? outcome.newPermissions : content.newPermissions,
    peerNotified: outcome.status === 'completed'
  };
  if (outcome.status === 'failed') result.deliveryFailure = outcome.failure;
  return result;
}

/**
 * Poll the trigger until the platform settled it (`completed` / `failed`). On timeout, an outcome
 * already recorded (`applied` true or false) is returned as is; otherwise throw: the change may
 * still happen, so it is not reported as failed.
 */
async function waitForOutcome (connection: pryv.Connection, eventId: string, opts: ScopeChangeOptions): Promise<Record<string, any>> {
  const until = Date.now() + (opts.completionTimeoutMs ?? 20000);
  const interval = opts.completionPollIntervalMs ?? 400;
  let content: Record<string, any> = {};
  for (;;) {
    const ev = await connection.apiOne('events.getOne', { id: eventId }, 'event') as { content?: Record<string, any> };
    content = ev?.content ?? {};
    if (content.status === 'completed' || content.status === 'failed') return content;
    if (Date.now() >= until) break;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  if (typeof content.applied === 'boolean') return content;
  throw new HDSLibError('scope update outcome not known yet', { reason: 'outcome-unknown', updateEventId: eventId, lastStatus: content.status });
}
