import { pryv } from '../patchedPryv.ts';

type Connection = InstanceType<typeof pryv.Connection>;

/**
 * Build a browser-safe URL for an event attachment.
 * Uses the attachment's `readToken` for auth (no embedded credentials in the URL).
 *
 * @param connection - Pryv Connection (uses `.endpoint` for the clean base URL)
 * @param event - Pryv event with attachments
 * @param attachmentIndex - index of the attachment (default 0)
 * @returns URL string or null if no attachment at the given index
 */
export function getAttachmentUrl (
  connection: Connection,
  event: any,
  attachmentIndex: number = 0
): string | null {
  if (!event.attachments?.[attachmentIndex]) return null;
  const attachment = event.attachments[attachmentIndex];
  const baseUrl = ((connection as any).endpoint || '').replace(/\/$/, '');
  return `${baseUrl}/events/${event.id}/${attachment.id}?readToken=${attachment.readToken}`;
}
