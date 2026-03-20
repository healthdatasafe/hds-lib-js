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

/**
 * Dynamic setting prefixes — one event per key, keyed by content.itemKey.
 * Event type is shared for all settings with the same prefix.
 */
const DYNAMIC_PREFIXES: Record<string, { eventType: string; contentKey: string; contentValue: string }> = {
  'converter-auto-': { eventType: 'settings/converter-auto', contentKey: 'itemKey', contentValue: 'method' },
  'converter-default-': { eventType: 'settings/converter-default', contentKey: 'itemKey', contentValue: 'method' },
};

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

/** Find the dynamic prefix config for a key, or null */
function findDynamicPrefix (key: string): { prefix: string; eventType: string; contentKey: string; contentValue: string; suffix: string } | null {
  for (const [prefix, config] of Object.entries(DYNAMIC_PREFIXES)) {
    if (key.startsWith(prefix)) {
      return { prefix, ...config, suffix: key.slice(prefix.length) };
    }
  }
  return null;
}

/** @internal */
let _connection: pryv.Connection | null = null;
/** @internal */
let _streamId: string | null = null;
/** @internal */
let _cache: Partial<Record<SettingKey, any>> = {};
/** @internal */
let _values: SettingsValues = { ...DEFAULTS };
/** @internal — dynamic settings: key → value */
let _dynamicValues: Record<string, any> = {};
/** @internal — dynamic settings: key → cached event */
let _dynamicCache: Record<string, any> = {};
/** @internal */
let _hooked = false;

async function load (): Promise<void> {
  if (!_connection || !_streamId) return;

  const browser = browserDefaults();
  _values = { ...DEFAULTS, ...browser };
  _cache = {};
  _dynamicValues = {};
  _dynamicCache = {};

  // Collect all event types to fetch (typed + dynamic)
  const typedEventTypes = Object.values(SETTING_TYPES) as string[];
  const dynamicEventTypes = Object.values(DYNAMIC_PREFIXES).map(c => c.eventType);
  const allTypes = [...typedEventTypes, ...dynamicEventTypes];

  const settingsEvents: any[] = await _connection.apiOne(
    'events.get',
    { streams: [_streamId], types: allTypes, limit: 200 },
    'events'
  );

  for (const event of settingsEvents) {
    // Try typed settings first
    const key = keyForType(event.type);
    if (key && !_cache[key]) {
      _cache[key] = event;
      (_values as any)[key] = event.content;
      continue;
    }

    // Try dynamic settings
    for (const [prefix, config] of Object.entries(DYNAMIC_PREFIXES)) {
      if (event.type === config.eventType && event.content?.[config.contentKey]) {
        const dynKey = prefix + event.content[config.contentKey];
        if (!_dynamicCache[dynKey]) {
          _dynamicCache[dynKey] = event;
          _dynamicValues[dynKey] = event.content[config.contentValue];
        }
      }
    }
  }

  applySideEffects(_values, 'preferredLocales');
  _hooked = true;
}

/**
 * HDSSettings — singleton managing user settings as individual Pryv events.
 *
 * Supports two kinds of settings:
 * - **Typed settings**: fixed keys (theme, dateFormat, etc.) with specific event types.
 * - **Dynamic settings**: prefix-based keys (converter-auto-{itemKey}) stored as events
 *   with a shared event type and keyed by content field.
 *
 * Usage:
 *   await HDSSettings.hookToApplication(app);
 *   const locale = HDSSettings.get('preferredLocales');
 *   await HDSSettings.set('theme', 'dark');
 *   await HDSSettings.setDynamic('converter-auto-wellbeing-mood', 'billings');
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
   * Get the current value for a typed setting.
   * Also checks dynamic settings for prefix-based keys (e.g. 'converter-auto-wellbeing-mood').
   */
  get (key: string): any {
    if (key in _dynamicValues) return _dynamicValues[key];
    return (_values as any)[key];
  },

  /**
   * Get all current typed settings values.
   */
  getAll (): Readonly<SettingsValues> {
    return { ..._values };
  },

  /**
   * Get all dynamic settings with a given prefix.
   * Returns a map of suffix → value (e.g. { 'wellbeing-mood': 'billings' }).
   */
  getDynamic (prefix: string): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(_dynamicValues)) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }
    return result;
  },

  /**
   * Set a typed setting value — persists to HDS server and updates cache.
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
   * Set a dynamic setting value — persists to HDS server.
   * Key must match a known prefix (e.g. 'converter-auto-wellbeing-mood').
   * Pass null to delete the setting.
   */
  async setDynamic (key: string, value: any): Promise<void> {
    if (!_connection || !_streamId) {
      throw new Error('HDSSettings: call hookToApplication() or hookToConnection() first');
    }

    const dp = findDynamicPrefix(key);
    if (!dp) throw new Error(`Unknown dynamic setting prefix for key: "${key}"`);

    const existing = _dynamicCache[key];

    if (value === null || value === undefined) {
      // Delete
      if (existing) {
        await _connection.apiOne('events.delete', { id: existing.id }, 'eventDeletion');
        delete _dynamicCache[key];
        delete _dynamicValues[key];
      }
      return;
    }

    const content = { [dp.contentKey]: dp.suffix, [dp.contentValue]: value };

    if (existing) {
      const updated = await _connection.apiOne(
        'events.update',
        { id: existing.id, update: { content } },
        'event'
      );
      _dynamicCache[key] = updated;
    } else {
      const created = await _connection.apiOne(
        'events.create',
        { streamIds: [_streamId], type: dp.eventType, content },
        'event'
      );
      _dynamicCache[key] = created;
    }

    _dynamicValues[key] = value;
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
    _dynamicValues = {};
    _dynamicCache = {};
    _hooked = false;
  },

  /**
   * @internal Test-only: inject a setting value and mark as hooked.
   * Works for both typed and dynamic keys.
   */
  _testInject (key: string, value: any): void {
    if (findDynamicPrefix(key)) {
      _dynamicValues[key] = value;
    } else {
      (_values as any)[key] = value;
    }
    _hooked = true;
  },

  /**
   * @internal Test-only: remove an injected setting.
   */
  _testClear (key: string): void {
    if (findDynamicPrefix(key)) {
      delete _dynamicValues[key];
    } else {
      delete (_values as any)[key];
    }
  },
};

export { HDSSettings };
export default HDSSettings;
