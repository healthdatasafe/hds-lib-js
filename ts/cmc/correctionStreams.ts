/**
 * The person's side of the `entry-corrections` children (data-model 4.43.0 `documentation/CORRECTIONS.md` § The child):
 * one `corr-` child per relationship, granted `contribute`, marked `clientData.hdsEntryCorrections = { relationship }`.
 * Her app checks what an offer or a scope request asks before granting it (`checkOfferedCorrections`), accepts a
 * minted ask without the root (`withoutCorrectionsAsk`), then creates, marks and grants the child
 * (`ensureCorrectionStream`); a child named by a single-use offer is marked once the grant exists
 * (`markOfferedCorrectionStreams`). The pure rules are in `correctionIds.ts`.
 */

import * as logger from '../logger.ts';
import { pryv } from '../patchedPryv.ts';
import { HDSLibError } from '../errors.ts';
import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { pryvErrorCode } from './appScope.ts';
import { relationshipIdOf } from './documents.ts';
import { canonicalStreamId } from './shareIds.ts';
import { changeSharedLevel, shareStreamsAgain } from './scope.ts';
import type { ScopeChangeOptions, ScopeChangeResult, ScopePermission, ScopeRelationship } from './scope.ts';
import { CORRECTIONS_ROOT_ID, checkOfferedCorrectionStreams, isCorrectionStreamId, newCorrectionStreamId } from './correctionIds.ts';
import type { CorrectionOfferIssue } from './correctionIds.ts';

/** The mark on a child: `clientData.hdsEntryCorrections = { relationship }`. */
export const CORRECTIONS_MARK_KEY = 'hdsEntryCorrections';

export interface CorrectionStream {
  id: string;
  /** The relationship the child is marked with; null when it carries no mark yet (an interrupted accept). */
  relationship: string | null;
  trashed: boolean;
}

type Perms = Array<{ streamId?: string; level?: string }>;

/** The `corr-` children of `entry-corrections` in a stream tree (`streams.get` output, any depth). */
export function correctionStreamsIn (streams: Array<{ id: string; parentId?: string | null; clientData?: any; trashed?: boolean; children?: any[] }>): CorrectionStream[] {
  const out: CorrectionStream[] = [];
  const walk = (list: any[]): void => {
    for (const s of list ?? []) {
      if (s.parentId === CORRECTIONS_ROOT_ID && isCorrectionStreamId(s.id)) {
        const relationship = s.clientData?.[CORRECTIONS_MARK_KEY]?.relationship;
        out.push({ id: s.id, relationship: typeof relationship === 'string' ? relationship : null, trashed: s.trashed === true });
      }
      if (Array.isArray(s.children)) walk(s.children);
    }
  };
  walk(streams);
  return out;
}

/** The children in the person's account (trashed ones with `includeTrashed`). Empty when the root does not exist yet. */
export async function listCorrectionStreams (connection: pryv.Connection, opts: { includeTrashed?: boolean } = {}): Promise<CorrectionStream[]> {
  try {
    const params: Record<string, unknown> = { parentId: CORRECTIONS_ROOT_ID };
    if (opts.includeTrashed === true) params.state = 'all';
    const streams = await connection.apiOne('streams.get', params, 'streams') as any[];
    return correctionStreamsIn((streams ?? []).map((s: any) => ({ ...s, parentId: s.parentId ?? CORRECTIONS_ROOT_ID })));
  } catch (e) {
    if (pryvErrorCode(e) === 'unknown-referenced-resource') return [];
    throw e;
  }
}

/** The relationship's child (marked for it, not trashed), or null. */
export async function correctionStreamFor (connection: pryv.Connection, relationship: string): Promise<string | null> {
  const base = relationshipIdOf(relationship);
  return (await listCorrectionStreams(connection)).find(s => s.relationship === base && !s.trashed)?.id ?? null;
}

/** Create the `entry-corrections` root (with its model name) if missing. Idempotent. */
export async function ensureCorrectionsRoot (connection: pryv.Connection): Promise<void> {
  let name = 'Corrections from your contacts';
  try { name = getModel().streams.getDataById(CORRECTIONS_ROOT_ID).name ?? name; } catch { /* model not loaded */ }
  try {
    await connection.apiOne('streams.create', { id: CORRECTIONS_ROOT_ID, name });
  } catch (e) {
    if (pryvErrorCode(e) !== 'item-already-exists') throw e;
  }
}

/** Whether permissions name the corrections root or a `corr-` child, in any spelling. */
export function namesCorrectionStreams (perms: Perms): boolean {
  return (perms ?? []).some(p => {
    const id = canonicalStreamId(p?.streamId ?? '');
    return id === CORRECTIONS_ROOT_ID || isCorrectionStreamId(id);
  });
}

/**
 * The permissions without the minted ask (`entry-corrections` at `contribute`, CORRECTIONS.md § Two ways to get one):
 * what her app accepts (`cmc.acceptInvite` `grantedPermissions`) before it creates and grants the child.
 */
export function withoutCorrectionsAsk<P extends { streamId?: string; level?: string }> (perms: P[]): P[] {
  return (perms ?? []).filter(p => !(canonicalStreamId(p?.streamId ?? '') === CORRECTIONS_ROOT_ID && p.level === 'contribute'));
}

/**
 * Why an offer that asks for corrections the minted way cannot be accepted without that ask (`cmc.acceptInvite`
 * `grantedPermissions` takes a subset only when the offer allows a choice, and never without a `mandatory` entry), or
 * null when it can, or does not ask. Also when nothing would be left to grant.
 */
export function correctionsAskRefusal (requested: Array<{ streamId?: string; level?: string; mandatory?: boolean }>, allowUserChoice: boolean): 'no-user-choice' | 'mandatory' | 'nothing-else' | null {
  const ask = (requested ?? []).filter(p => canonicalStreamId(p?.streamId ?? '') === CORRECTIONS_ROOT_ID && p.level === 'contribute');
  if (ask.length === 0) return null;
  if (ask.some(p => p.mandatory === true)) return 'mandatory';
  if (!allowUserChoice) return 'no-user-choice';
  if (withoutCorrectionsAsk(requested).length === 0) return 'nothing-else';
  return null;
}

/**
 * `checkOfferedCorrectionStreams` against the account, for the app about to grant an offer or a scope request.
 * `accessId`: the relationship's grant when it exists (a scope request, or the grant just minted); `singleUse`: whether
 * the contact's invite was single-use (false for a scope request when unknown: a new `corr-` id is then refused). No
 * request unless a `corr-` child is named. Reading the accesses needs a personal token; throws when the account cannot
 * be read: do not grant.
 */
export async function checkOfferedCorrections (
  connection: pryv.Connection,
  perms: Perms,
  opts: { accessId?: string | null; singleUse: boolean }
): Promise<CorrectionOfferIssue[]> {
  const asked = (perms ?? []).map(p => ({ ...p, streamId: canonicalStreamId(p?.streamId ?? '') }));
  const relationship = opts.accessId != null ? relationshipIdOf(opts.accessId) : null;
  if (!asked.some(p => isCorrectionStreamId(p.streamId))) {
    return checkOfferedCorrectionStreams(asked, { relationship, singleUse: opts.singleUse });
  }
  const existing = new Map<string, string | null>();
  for (const s of await listCorrectionStreams(connection, { includeTrashed: true })) existing.set(s.id, s.relationship);
  const info = await connection.accessInfo() as { type?: string };
  if (info?.type !== 'personal') throw new HDSLibError('corrections: checking an offer needs a personal token', { reason: 'not-personal' });
  const accesses = await connection.apiOne('accesses.get', { includeExpired: true }, 'accesses') as Array<{ id: string; createdBy?: string; permissions?: ScopePermission[] }>;
  // member accesses the grant created count as the relationship's (`createdBy` is `<access id>[ <caller id>]`)
  const own = (id: string | undefined): boolean => relationship != null && id != null && relationshipIdOf(id.split(' ')[0]) === relationship;
  const namedByThis: string[] = [];
  const namedByOthers: string[] = [];
  for (const a of accesses ?? []) {
    for (const p of a.permissions ?? []) {
      const id = canonicalStreamId(p?.streamId ?? '');
      if (!isCorrectionStreamId(id)) continue;
      (own(a.id) || own(a.createdBy) ? namedByThis : namedByOthers).push(id);
    }
  }
  return checkOfferedCorrectionStreams(asked, { relationship, existing, namedByThis, namedByOthers, singleUse: opts.singleUse });
}

/**
 * What a grant that exists must not hold (checked on what the platform applied, which may differ from what was shown):
 * `checkOfferedCorrections` as the relationship's own (its access names its child), and the root above `read`, the
 * minted ask included: her app never grants it. `granted` is the grant's permission list read back from the account.
 */
export async function checkGrantedCorrections (
  connection: pryv.Connection,
  granted: Perms,
  opts: { accessId: string }
): Promise<CorrectionOfferIssue[]> {
  const rootAbove = (granted ?? []).filter(p => canonicalStreamId(p?.streamId ?? '') === CORRECTIONS_ROOT_ID && !['read', 'none'].includes(p.level as string));
  const issues: CorrectionOfferIssue[] = rootAbove.map(() => ({ code: 'root-level' as const, streamId: CORRECTIONS_ROOT_ID }));
  // a child the grant names exists by now (created before or at the accept): `singleUse` only matters for a new one
  for (const i of await checkOfferedCorrections(connection, granted, { accessId: opts.accessId, singleUse: true })) {
    if (!issues.some(x => x.code === i.code && x.streamId === i.streamId)) issues.push(i);
  }
  return issues;
}

/**
 * Whether `cmc.acceptInvite` failed for sure: a CMC error other than a timeout (the platform may still finish it) or a
 * link already used (its grant exists). A network error or anything untyped is not sure.
 */
export function isDefiniteAcceptFailure (e: unknown): boolean {
  const id = (e as { id?: unknown })?.id;
  return typeof id === 'string' && id.startsWith('cmc-') &&
    !['cmc-capability-timeout', 'cmc-capability-consumed', 'cmc-capability-already-accepted-by-you'].includes(id);
}

/** The ids of the `corr-` children in the account now (trashed ones included): what an accept about to run did not create. */
export async function existingCorrectionStreamIds (connection: pryv.Connection): Promise<string[]> {
  return (await listCorrectionStreams(connection, { includeTrashed: true })).map(s => s.id);
}

/**
 * After an accept that definitely failed (not a timeout: the platform may still finish it): the `corr-` children among
 * `streamIds` that her app created for this accept (`existingBefore` lists the ones there before it) and that nobody took
 * (no mark, no access naming them, no event on them) are deleted, so a retry of the same offer does not find them
 * "taken". Best-effort; the ids deleted.
 */
export async function releaseUnclaimedCorrectionStreams (connection: pryv.Connection, streamIds: Array<string | undefined>, existingBefore: string[]): Promise<string[]> {
  const before = new Set(existingBefore);
  const ids = [...new Set(streamIds.map(id => canonicalStreamId(id ?? '')).filter(isCorrectionStreamId))].filter(id => !before.has(id));
  if (ids.length === 0) return [];
  const released: string[] = [];
  try {
    const children = await listCorrectionStreams(connection, { includeTrashed: true });
    const accesses = await connection.apiOne('accesses.get', { includeExpired: true }, 'accesses') as Array<{ permissions?: ScopePermission[] }>;
    const named = new Set((accesses ?? []).flatMap(a => (a.permissions ?? []).map(p => canonicalStreamId(p?.streamId ?? ''))));
    for (const id of ids) {
      const child = children.find(s => s.id === id);
      if (child == null || child.relationship != null || named.has(id)) continue;
      const events = await connection.apiOne('events.get', { streams: [id], state: 'all', limit: 1 } as any, 'events') as unknown[];
      if ((events ?? []).length > 0) continue;
      for (let i = 0; i < 2; i++) {
        try {
          // pryv's typings know `streams.delete` by its first answer only
          await (connection.apiOne as any)('streams.delete', { id, mergeEventsWithParent: false });
        } catch (e) {
          if (pryvErrorCode(e) !== 'unknown-resource') throw e;
          break;
        }
      }
      released.push(id);
    }
  } catch (e) {
    logger.warn('corrections: children of a failed accept not released:', (e as Error)?.message ?? e);
  }
  return released;
}

/**
 * The `corr-` children a grant names (a single-use offer's choice), created under `entry-corrections` if missing and
 * marked with the relationship. Idempotent. Throws `correction-id-taken` when an id is trashed, at another parent, or
 * marked for another relationship: the grant then reaches what it must not, and the caller revokes it.
 */
export async function markOfferedCorrectionStreams (connection: pryv.Connection, rel: { accessId: string; grantedPermissions: Perms }): Promise<string[]> {
  if (!rel?.accessId) throw new HDSLibError('markOfferedCorrectionStreams: the relationship\'s accessId is required');
  const relationship = relationshipIdOf(rel.accessId);
  const ids = [...new Set((rel.grantedPermissions ?? []).map(p => canonicalStreamId(p?.streamId ?? '')).filter(isCorrectionStreamId))];
  if (ids.length === 0) return [];
  await ensureCorrectionsRoot(connection);
  const mark = { [CORRECTIONS_MARK_KEY]: { relationship } };
  for (const id of ids) {
    try {
      await connection.apiOne('streams.create', { id, name: id, parentId: CORRECTIONS_ROOT_ID, clientData: mark } as any, 'stream');
      continue;
    } catch (e) {
      if (pryvErrorCode(e) !== 'item-already-exists') throw e;
    }
    const stream = findStream(await connection.apiOne('streams.get', { state: 'all' }, 'streams') as any[], id);
    const marked = stream?.clientData?.[CORRECTIONS_MARK_KEY]?.relationship;
    if (stream == null || stream.trashed === true || stream.parentId !== CORRECTIONS_ROOT_ID || (marked != null && marked !== relationship)) {
      throw new HDSLibError(`markOfferedCorrectionStreams: "${id}" is not free`, { reason: 'correction-id-taken', streamId: id });
    }
    if (marked === relationship && stream.name === id) continue;
    await connection.apiOne('streams.update', { id, update: { name: id, clientData: { ...stream.clientData, ...mark } } } as any, 'stream');
  }
  return ids;
}

/**
 * The relationship's child, created when missing (root first) and marked, and the contact granted `contribute` on it in
 * one scope update waited for (`shareStreamsAgain`), never the root. Call it when she accepts a contact that asks for
 * corrections (`asksForCorrections`). Pass a freshly read relationship: the scope update writes the whole permission set
 * from `rel.grantedPermissions`.
 */
export async function ensureCorrectionStream (
  connection: pryv.Connection,
  rel: ScopeRelationship,
  opts: ScopeChangeOptions = {}
): Promise<{ streamId: string; scopeUpdate: ScopeChangeResult | null }> {
  if (!rel?.accessId) throw new HDSLibError('ensureCorrectionStream: the relationship\'s accessId is required');
  const relationship = relationshipIdOf(rel.accessId);
  const granted = (rel.grantedPermissions ?? []).filter(p => isCorrectionStreamId(canonicalStreamId(p.streamId)));
  const mine = (await listCorrectionStreams(connection)).filter(s => s.relationship === relationship && !s.trashed);
  let streamId = mine.find(s => granted.some(p => canonicalStreamId(p.streamId) === s.id))?.id ?? mine[0]?.id;
  if (streamId == null) {
    await ensureCorrectionsRoot(connection);
    streamId = newCorrectionStreamId();
    await connection.apiOne('streams.create', {
      id: streamId,
      name: streamId,
      parentId: CORRECTIONS_ROOT_ID,
      clientData: { [CORRECTIONS_MARK_KEY]: { relationship } }
    } as any, 'stream');
  }
  const current = granted.find(p => canonicalStreamId(p.streamId) === streamId);
  if (current?.level === 'contribute') return { streamId, scopeUpdate: null };
  const scopeUpdate = current != null
    ? await changeSharedLevel(connection, rel, streamId, 'contribute', { ...opts, waitForCompletion: true })
    : await shareStreamsAgain(connection, rel, [streamId], { ...opts, level: 'contribute', waitForCompletion: true });
  return { streamId, scopeUpdate };
}

function findStream (list: any[], id: string): any {
  for (const s of list ?? []) {
    const found = s.id === id ? s : findStream(s.children, id);
    if (found != null) return found;
  }
  return null;
}
