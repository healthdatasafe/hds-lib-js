"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSSettings = exports.SETTING_TYPES = void 0;
const localizeText_1 = require("../localizeText");
/**
 * Known setting event types — each stored as a separate Pryv event.
 */
exports.SETTING_TYPES = {
    preferredLocales: 'settings/preferred-locales',
    theme: 'settings/theme',
    timezone: 'settings/timezone',
    dateFormat: 'settings/date-format',
    unitSystem: 'settings/unit-system',
    displayName: 'contact/display-name',
};
const DEFAULTS = {
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
function browserDefaults() {
    if (typeof navigator === 'undefined')
        return {};
    const result = {};
    try {
        const lang = navigator.language?.split('-')[0];
        if (lang)
            result.preferredLocales = [lang];
    }
    catch { /* ignore */ }
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz)
            result.timezone = tz;
    }
    catch { /* ignore */ }
    return result;
}
function keyForType(type) {
    for (const [key, t] of Object.entries(exports.SETTING_TYPES)) {
        if (t === type)
            return key;
    }
    return null;
}
function applySideEffects(values, key) {
    if (key === 'preferredLocales') {
        try {
            (0, localizeText_1.setPreferredLocales)(values.preferredLocales);
        }
        catch { /* locale may not be supported — ignore */ }
    }
}
/** @internal */
let _connection = null;
/** @internal */
let _streamId = null;
/** @internal */
let _cache = {};
/** @internal */
let _values = { ...DEFAULTS };
/** @internal */
let _hooked = false;
async function load() {
    if (!_connection || !_streamId)
        return;
    const browser = browserDefaults();
    _values = { ...DEFAULTS, ...browser };
    _cache = {};
    const settingsEvents = await _connection.apiOne('events.get', { streams: [_streamId], types: Object.values(exports.SETTING_TYPES), limit: 100 }, 'events');
    for (const event of settingsEvents) {
        const key = keyForType(event.type);
        if (key && !_cache[key]) {
            _cache[key] = event;
            _values[key] = event.content;
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
    async hookToApplication(app) {
        _connection = app.connection;
        _streamId = app.baseStreamId;
        await load();
    },
    /**
     * Hook to a raw Pryv Connection with a target stream.
     * Used when no Application wrapper is available.
     */
    async hookToConnection(connection, streamId) {
        _connection = connection;
        _streamId = streamId;
        await load();
    },
    /**
     * Get the current value for a setting.
     */
    get(key) {
        return _values[key];
    },
    /**
     * Get all current settings values.
     */
    getAll() {
        return { ..._values };
    },
    /**
     * Set a setting value — persists to HDS server and updates cache.
     */
    async set(key, value) {
        if (!_connection || !_streamId) {
            throw new Error('HDSSettings: call hookToApplication() or hookToConnection() first');
        }
        const eventType = exports.SETTING_TYPES[key];
        const existing = _cache[key];
        if (existing) {
            const updated = await _connection.apiOne('events.update', { id: existing.id, update: { content: value } }, 'event');
            _cache[key] = updated;
        }
        else {
            const created = await _connection.apiOne('events.create', { streamIds: [_streamId], type: eventType, content: value }, 'event');
            _cache[key] = created;
        }
        _values[key] = value;
        applySideEffects(_values, key);
    },
    /**
     * Whether settings have been loaded from the server.
     */
    get isHooked() {
        return _hooked;
    },
    /**
     * Reload settings from the server.
     */
    async reload() {
        await load();
    },
    /**
     * Reset to defaults (in-memory only — does not delete server events).
     */
    unhook() {
        _connection = null;
        _streamId = null;
        _cache = {};
        _values = { ...DEFAULTS };
        _hooked = false;
    },
};
exports.HDSSettings = HDSSettings;
exports.default = HDSSettings;
//# sourceMappingURL=HDSSettings.js.map