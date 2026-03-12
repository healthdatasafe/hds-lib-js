import { pryv } from '../patchedPryv.ts';
import { setPreferredLocales } from '../localizeText.ts';
import type { Application } from '../appTemplates/Application.ts';

/**
 * Known setting event types — each stored as a separate Pryv event.
 */
export const SETTING_TYPES = {
  preferredLocales: 'settings/preferred-locales',
  theme: 'settings/theme',
  timezone: 'settings/timezone',
  dateFormat: 'settings/date-format',
  unitSystem: 'settings/unit-system',
  displayName: 'contact/display-name',
} as const;

export type SettingKey = keyof typeof SETTING_TYPES;

export type DateFormat = 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type UnitSystem = 'metric' | 'imperial';
export type Theme = 'light' | 'dark';

export interface SettingsValues {
  preferredLocales: string[];
  theme: Theme;
  timezone: string;
  dateFormat: DateFormat;
  unitSystem: UnitSystem;
  displayName: string | null;
}

const DEFAULTS: SettingsValues = {
  preferredLocales: ['en'],
  theme: 'light',
  timezone: 'Europe/Zurich',
  dateFormat: 'DD.MM.YYYY',
  unitSystem: 'metric',
  displayName: null,
};

/**
 * Detect browser defaults for settings that can be inferred.
 */
function browserDefaults (): Partial<SettingsValues> {
  if (typeof navigator === 'undefined') return {};
  const result: Partial<SettingsValues> = {};
  try {
    const lang = navigator.language?.split('-')[0];
    if (lang) result.preferredLocales = [lang];
  } catch { /* ignore */ }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) result.timezone = tz;
  } catch { /* ignore */ }
  return result;
}

function keyForType (type: string): SettingKey | null {
  for (const [key, t] of Object.entries(SETTING_TYPES)) {
    if (t === type) return key as SettingKey;
  }
  return null;
}

function applySideEffects (values: SettingsValues, key: SettingKey): void {
  if (key === 'preferredLocales') {
    try {
      setPreferredLocales(values.preferredLocales);
    } catch { /* locale may not be supported — ignore */ }
  }
}

/** @internal */
let _connection: pryv.Connection | null = null;
/** @internal */
let _streamId: string | null = null;
/** @internal */
let _cache: Partial<Record<SettingKey, any>> = {};
/** @internal */
let _values: SettingsValues = { ...DEFAULTS };
/** @internal */
let _hooked = false;

async function load (): Promise<void> {
  if (!_connection || !_streamId) return;

  const browser = browserDefaults();
  _values = { ...DEFAULTS, ...browser };
  _cache = {};

  const settingsEvents: any[] = await _connection.apiOne(
    'events.get',
    { streams: [_streamId], types: Object.values(SETTING_TYPES), limit: 100 },
    'events'
  );

  for (const event of settingsEvents) {
    const key = keyForType(event.type);
    if (key && !_cache[key]) {
      _cache[key] = event;
      (_values as any)[key] = event.content;
    }
  }

  applySideEffects(_values, 'preferredLocales');
  _hooked = true;
}

/**
 * HDSSettings — singleton managing user settings as individual Pryv events.
 *
 * Each setting is stored as its own event with a specific type
 * (e.g. `settings/preferredLocales`) in the application's baseStream.
 *
 * Usage:
 *   await HDSSettings.hookToApplication(app);
 *   const locale = HDSSettings.get('preferredLocales');
 *   await HDSSettings.set('theme', 'dark');
 */
const HDSSettings = {

  /**
   * Hook to an Application instance — loads settings from the app's baseStream.
   */
  async hookToApplication (app: Application): Promise<void> {
    _connection = app.connection;
    _streamId = app.baseStreamId;
    await load();
  },

  /**
   * Hook to a raw Pryv Connection with a target stream.
   * Used when no Application wrapper is available.
   */
  async hookToConnection (connection: pryv.Connection, streamId: string): Promise<void> {
    _connection = connection;
    _streamId = streamId;
    await load();
  },

  /**
   * Get the current value for a setting.
   */
  get<K extends SettingKey> (key: K): SettingsValues[K] {
    return _values[key];
  },

  /**
   * Get all current settings values.
   */
  getAll (): Readonly<SettingsValues> {
    return { ..._values };
  },

  /**
   * Set a setting value — persists to HDS server and updates cache.
   */
  async set<K extends SettingKey> (key: K, value: SettingsValues[K]): Promise<void> {
    if (!_connection || !_streamId) {
      throw new Error('HDSSettings: call hookToApplication() or hookToConnection() first');
    }

    const eventType = SETTING_TYPES[key];
    const existing = _cache[key];

    if (existing) {
      const updated = await _connection.apiOne(
        'events.update',
        { id: existing.id, update: { content: value } },
        'event'
      );
      _cache[key] = updated;
    } else {
      const created = await _connection.apiOne(
        'events.create',
        { streamIds: [_streamId], type: eventType, content: value },
        'event'
      );
      _cache[key] = created;
    }

    _values[key] = value;
    applySideEffects(_values, key);
  },

  /**
   * Whether settings have been loaded from the server.
   */
  get isHooked (): boolean {
    return _hooked;
  },

  /**
   * Reload settings from the server.
   */
  async reload (): Promise<void> {
    await load();
  },

  /**
   * Reset to defaults (in-memory only — does not delete server events).
   */
  unhook (): void {
    _connection = null;
    _streamId = null;
    _cache = {};
    _values = { ...DEFAULTS };
    _hooked = false;
  },
};

export { HDSSettings };
export default HDSSettings;
