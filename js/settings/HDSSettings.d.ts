import { pryv } from '../patchedPryv';
import type { Application } from '../appTemplates/Application';
/**
 * Known setting event types — each stored as a separate Pryv event.
 */
export declare const SETTING_TYPES: {
    readonly preferredLocales: "settings/preferredLocales";
    readonly theme: "settings/theme";
    readonly timezone: "settings/timezone";
    readonly dateFormat: "settings/dateFormat";
    readonly unitSystem: "settings/unitSystem";
    readonly displayName: "settings/displayName";
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
declare const HDSSettings: {
    /**
     * Hook to an Application instance — loads settings from the app's baseStream.
     */
    hookToApplication(app: Application): Promise<void>;
    /**
     * Hook to a raw Pryv Connection with a target stream.
     * Used when no Application wrapper is available.
     */
    hookToConnection(connection: pryv.Connection, streamId: string): Promise<void>;
    /**
     * Get the current value for a setting.
     */
    get<K extends SettingKey>(key: K): SettingsValues[K];
    /**
     * Get all current settings values.
     */
    getAll(): Readonly<SettingsValues>;
    /**
     * Set a setting value — persists to HDS server and updates cache.
     */
    set<K extends SettingKey>(key: K, value: SettingsValues[K]): Promise<void>;
    /**
     * Whether settings have been loaded from the server.
     */
    readonly isHooked: boolean;
    /**
     * Reload settings from the server.
     */
    reload(): Promise<void>;
    /**
     * Reset to defaults (in-memory only — does not delete server events).
     */
    unhook(): void;
};
export { HDSSettings };
export default HDSSettings;
//# sourceMappingURL=HDSSettings.d.ts.map