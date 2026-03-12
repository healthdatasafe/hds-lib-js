import { pryv } from '../patchedPryv.ts';
import { getAttachmentUrl } from '../toolkit/getAttachmentUrl.ts';

type Connection = InstanceType<typeof pryv.Connection>;

/**
 * Profile field definitions — each maps to a Pryv event in the profile/ stream tree.
 * These are account-level, shared across all connections (unlike HDSSettings which is per-app).
 */
export const PROFILE_FIELDS = {
  displayName: { streamId: 'profile-display-name', eventType: 'contact/display-name' },
  avatar: { streamId: 'profile-avatar', eventType: 'picture/*' },
  name: { streamId: 'profile-name', eventType: 'contact/name' },
  surname: { streamId: 'profile-name', eventType: 'contact/surname' },
  dateOfBirth: { streamId: 'profile-date-of-birth', eventType: 'date/iso-8601' },
  sex: { streamId: 'profile-sex', eventType: 'attributes/biological-sex' },
  country: { streamId: 'profile-address', eventType: 'contact/country' },
} as const;

export type ProfileKey = keyof typeof PROFILE_FIELDS;

export interface ProfileValues {
  displayName: string | null;
  avatar: string | null;
  name: string | null;
  surname: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  country: string | null;
}

const DEFAULTS: ProfileValues = {
  displayName: null,
  avatar: null,
  name: null,
  surname: null,
  dateOfBirth: null,
  sex: null,
  country: null,
};

/** @internal */
let _connection: Connection | null = null;
/** @internal */
let _cache: Partial<Record<ProfileKey, any>> = {};
/** @internal */
let _values: ProfileValues = { ...DEFAULTS };
/** @internal */
let _hooked = false;
/** @internal — tracks which streams have been verified/created */
let _ensuredStreams: Set<string> = new Set();

/**
 * Check if event type matches a field's eventType (supports `picture/*` wildcard).
 */
function typeMatches (eventType: string, fieldType: string): boolean {
  if (fieldType.endsWith('/*')) {
    return eventType.startsWith(fieldType.slice(0, -1));
  }
  return eventType === fieldType;
}

/**
 * Match an event to a profile field by eventType + streamId.
 */
function matchField (event: any): ProfileKey | null {
  for (const [key, field] of Object.entries(PROFILE_FIELDS)) {
    if (typeMatches(event.type, field.eventType) &&
        event.streamIds?.includes(field.streamId)) {
      return key as ProfileKey;
    }
  }
  return null;
}

/**
 * Resolve avatar URL from a picture event.
 * Handles: attachment (construct API URL), data URL in content, plain URL in content.
 */
function resolveAvatarUrl (event: any, conn: Connection | null = _connection): string | null {
  // Attachment — use shared getAttachmentUrl utility
  if (event.attachments?.length > 0 && conn) {
    return getAttachmentUrl(conn, event);
  }
  // Content is a string (data URL or plain URL)
  if (typeof event.content === 'string' && event.content.length > 0) {
    return event.content;
  }
  return null;
}

/**
 * Read profile from any connection (read-only, does not affect the singleton).
 * Use this to read someone else's profile via a shared connection.
 * Returns null values for fields the connection cannot access.
 */
async function readProfileFromConnection (conn: Connection): Promise<ProfileValues> {
  const values: ProfileValues = { ...DEFAULTS };
  let events: any[];
  try {
    events = await conn.apiOne(
      'events.get',
      { streams: ['profile'], limit: 100 },
      'events'
    );
  } catch {
    // Connection may not have access to profile/ streams
    return values;
  }

  for (const event of events) {
    const key = matchField(event);
    if (key && (values as any)[key] === null) {
      if (key === 'avatar') {
        values.avatar = resolveAvatarUrl(event, conn);
      } else {
        (values as any)[key] = event.content;
      }
    }
  }
  return values;
}

async function trashExistingAvatar (): Promise<void> {
  const existing = _cache.avatar;
  if (existing && _connection) {
    await _connection.apiOne(
      'events.update',
      { id: existing.id, update: { trashed: true } },
      'event'
    );
    delete _cache.avatar;
    _values.avatar = null;
  }
}

/**
 * Ensure a profile child stream exists, creating the parent `profile` stream and the child if needed.
 */
async function ensureStream (streamId: string): Promise<void> {
  if (_ensuredStreams.has(streamId) || !_connection) return;
  try {
    // Create parent 'profile' stream (idempotent — ignores "already exists" error)
    await _connection.apiOne(
      'streams.create',
      { id: 'profile', name: 'Profile' },
      'stream'
    ).catch(() => { /* already exists — ok */ });
    // Create child stream
    await _connection.apiOne(
      'streams.create',
      { id: streamId, name: streamId, parentId: 'profile' },
      'stream'
    ).catch(() => { /* already exists — ok */ });
    _ensuredStreams.add(streamId);
  } catch {
    // best effort — the subsequent events.create will fail with a clear error if stream is truly missing
  }
}

async function load (): Promise<void> {
  if (!_connection) return;

  _values = { ...DEFAULTS };
  _cache = {};

  const events: any[] = await _connection.apiOne(
    'events.get',
    { streams: ['profile'], limit: 100 },
    'events'
  );

  for (const event of events) {
    const key = matchField(event);
    if (key && !_cache[key]) {
      _cache[key] = event;
      if (key === 'avatar') {
        (_values as any).avatar = resolveAvatarUrl(event);
      } else {
        (_values as any)[key] = event.content;
      }
    }
  }

  _hooked = true;
}

/**
 * HDSProfile — singleton for account-level profile data stored in profile/ streams.
 *
 * Unlike HDSSettings (per-app preferences), profile data is shared across all connections.
 *
 * Usage:
 *   await HDSProfile.hookToConnection(connection);
 *   const name = HDSProfile.get('displayName');
 *   await HDSProfile.set('displayName', 'Alice');
 *
 * Fallback chain for displayName:
 *   HDSSettings.get('displayName') ?? HDSProfile.get('displayName') ?? null
 */
const HDSProfile = {

  /**
   * Read profile from any connection (read-only, does not affect the singleton).
   * Use this to read a contact's profile via a shared connection.
   *
   * Example:
   *   const contactProfile = await HDSProfile.readFromConnection(invite.connection);
   *   const name = contactProfile.displayName;
   *   const avatarUrl = contactProfile.avatar; // resolved URL ready for <img src>
   */
  async readFromConnection (connection: Connection): Promise<Readonly<ProfileValues>> {
    return readProfileFromConnection(connection);
  },

  /**
   * Hook to a Pryv Connection — loads profile from profile/ streams.
   */
  async hookToConnection (connection: Connection): Promise<void> {
    _connection = connection;
    await load();
  },

  /**
   * Get the current value for a profile field.
   */
  get<K extends ProfileKey> (key: K): ProfileValues[K] {
    return _values[key];
  },

  /**
   * Get all current profile values.
   */
  getAll (): Readonly<ProfileValues> {
    return { ..._values };
  },

  /**
   * Set a profile value — persists to HDS server and updates cache.
   */
  async set<K extends ProfileKey> (key: K, value: ProfileValues[K]): Promise<void> {
    if (!_connection) {
      throw new Error('HDSProfile: call hookToConnection() first');
    }

    const field = PROFILE_FIELDS[key];
    const existing = _cache[key];

    if (existing) {
      const updated = await _connection.apiOne(
        'events.update',
        { id: existing.id, update: { content: value } },
        'event'
      );
      _cache[key] = updated;
    } else {
      await ensureStream(field.streamId);
      const created = await _connection.apiOne(
        'events.create',
        { streamIds: [field.streamId], type: field.eventType, content: value },
        'event'
      );
      _cache[key] = created;
    }

    _values[key] = value;
  },

  /**
   * Get avatar URL — resolves from attachment, data URL, or plain URL.
   * Returns null if no avatar event exists.
   */
  getAvatarUrl (): string | null {
    const event = _cache.avatar;
    if (!event) return null;
    return resolveAvatarUrl(event);
  },

  /**
   * Set avatar from a file (Blob/Buffer) — creates a picture/attached event with attachment.
   * If an avatar event already exists, it is trashed and a new one is created.
   *
   * @param fileData - Blob (browser) or Buffer (Node.js)
   * @param filename - e.g. 'avatar.png'
   */
  async setAvatarFromFile (fileData: Blob | Buffer, filename: string): Promise<void> {
    if (!_connection) {
      throw new Error('HDSProfile: call hookToConnection() first');
    }
    await trashExistingAvatar();
    await ensureStream(PROFILE_FIELDS.avatar.streamId);
    const result = await (_connection as any).createEventWithFileFromBuffer(
      { type: 'picture/attached', streamIds: [PROFILE_FIELDS.avatar.streamId] },
      fileData,
      filename
    );
    _cache.avatar = result.event;
    _values.avatar = resolveAvatarUrl(result.event);
  },

  /**
   * Set avatar from a base64 data URL string — creates a picture/base64 event.
   * If an avatar event already exists, it is trashed and a new one is created.
   *
   * @param dataUrl - e.g. 'data:image/png;base64,iVBOR...'
   */
  async setAvatarFromDataUrl (dataUrl: string): Promise<void> {
    if (!_connection) {
      throw new Error('HDSProfile: call hookToConnection() first');
    }
    await trashExistingAvatar();
    await ensureStream(PROFILE_FIELDS.avatar.streamId);
    const created = await _connection.apiOne(
      'events.create',
      { streamIds: [PROFILE_FIELDS.avatar.streamId], type: 'picture/base64', content: dataUrl },
      'event'
    );
    _cache.avatar = created;
    _values.avatar = dataUrl;
  },

  /**
   * Whether profile has been loaded from the server.
   */
  get isHooked (): boolean {
    return _hooked;
  },

  /**
   * Reload profile from the server.
   */
  async reload (): Promise<void> {
    await load();
  },

  /**
   * Reset to defaults (in-memory only — does not delete server events).
   */
  unhook (): void {
    _connection = null;
    _cache = {};
    _values = { ...DEFAULTS };
    _hooked = false;
    _ensuredStreams = new Set();
  },
};

export { HDSProfile };
export default HDSProfile;
