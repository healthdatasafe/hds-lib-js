/**
 * The ids of the `entry-corrections` children (data-model 4.43.0, `documentation/CORRECTIONS.md`), apart from
 * `HDSModel/corrections.ts` so that `appTemplates/offerStreams.ts` and `HDSModel-ItemsDefs.ts` can read them without
 * the helpers.
 */

import { canonicalStreamId } from './shareIds.ts';

export const CORRECTIONS_ROOT_ID = 'entry-corrections';
export const CORRECTION_STREAM_PREFIX = 'corr-';

/** A child of `entry-corrections`: `corr-` + 12 lowercase base36 characters. */
export function isCorrectionStreamId (streamId: unknown): streamId is string {
  return typeof streamId === 'string' && /^corr-[a-z0-9]{12}$/.test(streamId);
}

/** A new random child id, never derived from a name (`corr-` + 12 lowercase base36). */
export function newCorrectionStreamId (): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const length = CORRECTION_STREAM_PREFIX.length + 12;
  const bytes = new Uint8Array(16);
  let id = CORRECTION_STREAM_PREFIX;
  while (id.length < length) {
    globalThis.crypto.getRandomValues(bytes);
    // 252 = 7 × 36: higher bytes are dropped so every character is equally likely
    for (const b of bytes) if (b < 252 && id.length < length) id += alphabet[b % 36];
  }
  return id;
}

export interface CorrectionOfferIssue {
  code: 'root-level' | 'child-not-contribute' | 'child-taken' | 'several-children' | 'not-single-use';
  streamId: string;
}

/**
 * Whether permissions ask for corrections the minted way (data-model CORRECTIONS.md § The child): the item
 * `entry-correction` at `contribute`, that is `entry-corrections` at `contribute`. Her app never grants that permission:
 * it accepts without it, then creates a child for the relationship and grants it by scope update.
 */
export function asksForCorrections (permissions: Array<{ streamId?: string; level?: string }>): boolean {
  return (permissions ?? []).some((p) => canonicalStreamId(p?.streamId ?? '') === CORRECTIONS_ROOT_ID && p.level === 'contribute');
}

/**
 * What her app refuses in an offer or a scope request before granting it (data-model CORRECTIONS.md § The child):
 * - `root-level`: `entry-corrections` at `manage` or `create-only` (`read` is a reader's grant; `contribute` is the ask
 *   of `asksForCorrections`, never granted as such);
 * - `child-not-contribute`: a `corr-` child at any level but `contribute`;
 * - `child-taken`: a `corr-` child that exists and is not this relationship's: marked for another (`existing` maps the
 *   ids on her account to the relationship each is marked with, `null` when unmarked), unmarked and not named by this
 *   relationship's access (`namedByThis`: an accept interrupted before the mark), or named by another access
 *   (`namedByOthers`);
 * - `several-children`: a second `corr-` id;
 * - `not-single-use`: a `corr-` id that does not exist yet, from a contact whose invite was not single-use
 *   (`singleUse: false`), on a scope request as well: an open link would give every person the same id.
 * Pure. Empty when nothing is refused.
 */
export function checkOfferedCorrectionStreams (
  permissions: Array<{ streamId?: string; level?: string }>,
  context: {
    relationship?: string | null;
    existing?: Map<string, string | null> | Record<string, string | null>;
    namedByThis?: Iterable<string>;
    namedByOthers?: Iterable<string>;
    singleUse: boolean;
  }
): CorrectionOfferIssue[] {
  const issues: CorrectionOfferIssue[] = [];
  const existingOf = (id: string): string | null | undefined => {
    const e = context.existing;
    if (e instanceof Map) return e.has(id) ? e.get(id) : undefined;
    return e != null && Object.prototype.hasOwnProperty.call(e, id) ? e[id] : undefined;
  };
  const others = new Set(context.namedByOthers ?? []);
  const own = new Set(context.namedByThis ?? []);
  const children: string[] = [];
  for (const perm of permissions ?? []) {
    const id = canonicalStreamId(perm?.streamId ?? '');
    if (id === CORRECTIONS_ROOT_ID && !['read', 'none', 'contribute'].includes(perm.level as string)) issues.push({ code: 'root-level', streamId: id });
    if (!isCorrectionStreamId(id)) continue;
    if (perm.level !== 'contribute') issues.push({ code: 'child-not-contribute', streamId: id });
    const marked = existingOf(id);
    const mine = (context.relationship != null && marked === context.relationship) || (marked === null && own.has(id));
    if ((marked !== undefined && !mine) || others.has(id)) issues.push({ code: 'child-taken', streamId: id });
    if (!children.includes(id)) children.push(id);
    if (!context.singleUse && marked === undefined) issues.push({ code: 'not-single-use', streamId: id });
  }
  for (const id of children.slice(1)) issues.push({ code: 'several-children', streamId: id });
  return issues;
}
