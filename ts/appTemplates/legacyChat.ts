/**
 * Chat written before the June 2026 switch to CMC: `message/hds-chat-v1` events (data-model `appStreams` `chat`) in
 * a pair of streams named after the contact's account, as the collector client created them:
 * - `chat-<remoteUsername>`: what the person wrote (outgoing; the contact could read it);
 * - `chat-<remoteUsername>-in`: what the contact wrote (incoming; a child of the first).
 *
 * The CMC migration moved the relationships, not these messages, so they are still in the accounts and
 * `Contact.chatEventInfos` (CMC streams only) does not recognise them. These helpers only read: nothing is written,
 * moved or migrated. Apps show the result read-only (e.g. "Earlier messages" above the CMC thread).
 */

/** eventType of a pre-CMC chat message; its `content` is the text itself. */
export const LEGACY_CHAT_TYPE = 'message/hds-chat-v1';

/** Who wrote a legacy chat event: the person, the contact, or not a legacy message of this contact. */
export type LegacyChatSource = 'me' | 'contact' | 'unknown';

/** The fields these helpers read; a `pryv.Event` fits. */
export interface LegacyChatEventLike {
  id: string;
  type: string;
  time: number;
  streamIds?: string[] | null;
  content?: unknown;
  trashed?: boolean;
}

/** One pre-CMC message, read-only. */
export interface LegacyChatMessage {
  /** The event id. */
  id: string;
  /** The message text (trimmed). */
  text: string;
  /** The event time, unix seconds. */
  time: number;
  /** Direction: true when the contact wrote it (`chat-<username>-in`), false when the person did. */
  fromContact: boolean;
}

/**
 * The contact's two legacy chat stream ids, or null when the contact has no account name (a bridge or service
 * access never had a legacy chat).
 */
export function legacyChatStreams (remoteUsername: string | null | undefined): { outgoing: string; incoming: string } | null {
  if (remoteUsername == null || remoteUsername === '') return null;
  return { outgoing: `chat-${remoteUsername}`, incoming: `chat-${remoteUsername}-in` };
}

/**
 * Who wrote a legacy chat event of this contact. The stream says the direction (each side could only write its own
 * stream): `chat-<username>-in` is the contact's, `chat-<username>` the person's. Any other stream or type, or a
 * contact without account name, is `'unknown'`.
 */
export function legacyChatSource (event: LegacyChatEventLike, remoteUsername: string | null | undefined): LegacyChatSource {
  const streams = legacyChatStreams(remoteUsername);
  if (streams == null || event == null || event.type !== LEGACY_CHAT_TYPE || event.streamIds == null) return 'unknown';
  if (event.streamIds.includes(streams.incoming)) return 'contact';
  if (event.streamIds.includes(streams.outgoing)) return 'me';
  return 'unknown';
}

/**
 * The contact's legacy messages among `events`, oldest first. Trashed events, empty texts and non-text contents
 * are left out; the events themselves are not changed.
 */
export function legacyChatMessages (remoteUsername: string | null | undefined, events: LegacyChatEventLike[]): LegacyChatMessage[] {
  const messages: LegacyChatMessage[] = [];
  for (const event of events) {
    if (event == null || event.trashed) continue;
    const source = legacyChatSource(event, remoteUsername);
    if (source === 'unknown') continue;
    const text = typeof event.content === 'string' ? event.content.trim() : '';
    if (text === '') continue;
    messages.push({ id: event.id, text, time: event.time, fromContact: source === 'contact' });
  }
  return messages.sort((a, b) => a.time - b.time);
}
