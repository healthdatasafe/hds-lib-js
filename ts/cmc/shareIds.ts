/**
 * The ids of the `document-shares` children (data-model `documentation/DOCUMENTS.md`), apart from `documents.ts` so
 * that `appTemplates/offerStreams.ts` can read them without the CMC helpers.
 */

export const DOCUMENT_SHARES_ROOT_ID = 'document-shares';
export const SHARE_STREAM_PREFIX = 'share-';

/** The platform reads `:local:<id>` as `<id>` (and stores it so): compare what a requester sends by this id. */
export function canonicalStreamId (streamId: string): string {
  return streamId.replace(/^(?::local:)+/, '');
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
