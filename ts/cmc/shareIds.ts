/**
 * The ids of the `document-shares` children (data-model `documentation/DOCUMENTS.md`), apart from `documents.ts` so
 * that `appTemplates/offerStreams.ts` can read them without the CMC helpers.
 */

export const DOCUMENT_SHARES_ROOT_ID = 'document-shares';
export const SHARE_STREAM_PREFIX = 'share-';

export function isShareStreamId (streamId: unknown): streamId is string {
  return typeof streamId === 'string' && /^share-[a-z0-9]{12}$/.test(streamId);
}
