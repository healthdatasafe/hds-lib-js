/**
 * The ids of the `document-shares` children (data-model `documentation/DOCUMENTS.md`), apart from `documents.ts` so
 * that `appTemplates/offerStreams.ts` can read them without the CMC helpers.
 */

export const DOCUMENT_SHARES_ROOT_ID = 'document-shares';
export const SHARE_STREAM_PREFIX = 'share-';

const LOCAL_PREFIX = ':local:';
const ACCOUNT_PREFIX = ':account:';
// the namespaces whose `:…` ids are their own spelling (open-pryv.io `storeDataUtils`)
const OWN_SPELLING = /^:(_?system|_cmc|_shared-secrets|_delegation|_emails):/;

/** A stream id in its canonical form, as the platform's `canonicalStreamId`. */
export function canonicalStreamId (streamId: string): string {
  let id = streamId;
  for (let i = 0; i < 8; i++) {
    if (id.startsWith(LOCAL_PREFIX)) {
      id = id.slice(LOCAL_PREFIX.length);
      if (id === '') return '*';
    } else if (id.startsWith(ACCOUNT_PREFIX + ':')) id = id.slice(ACCOUNT_PREFIX.length);
    else break;
  }
  return id;
}

const isPrefixed = (id: unknown): id is string => typeof id === 'string' && id.startsWith(':') && !OWN_SPELLING.test(id);

/** Permissions with their stream ids in canonical form; feature permissions as they are. */
export function canonicalPermissions<P extends { streamId?: string }> (perms: P[] | null | undefined): P[] {
  return (perms ?? []).map(p => isPrefixed(p.streamId) ? { ...p, streamId: canonicalStreamId(p.streamId) } : p);
}

/**
 * Whether permissions name a stream with a store prefix. HDS requesters use canonical ids only, and an app takes nothing
 * else. `accessId`: the access that holds them, whose own audit stream the platform may list in its permissions.
 */
export function namesAliasedStreams (perms: Array<{ streamId?: string }> | null | undefined, accessId?: string): boolean {
  const audit = accessId != null ? ':_audit:access-' + accessId.split(':')[0] : null;
  return (perms ?? []).some(p => isPrefixed(p.streamId) && !(audit != null && p.streamId.split(':').slice(0, 3).join(':') === audit));
}

/** Whether permissions name a share child or their root, under any spelling. */
export function namesShareStreams (perms: Array<{ streamId?: string }>): boolean {
  return (perms ?? []).some(p => {
    const id = canonicalStreamId(p.streamId ?? '');
    return id === DOCUMENT_SHARES_ROOT_ID || isShareStreamId(id);
  });
}

export function isShareStreamId (streamId: unknown): streamId is string {
  return typeof streamId === 'string' && /^share-[a-z0-9]{12}$/.test(streamId);
}
