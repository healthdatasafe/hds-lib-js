import HDSProfile, { type ProfileValues } from './HDSProfile.ts';
import HDSSettings from './HDSSettings.ts';

/**
 * The preferences that are account-level (shared by every app) rather than per-app.
 * `theme` is deliberately absent — it stays on HDSSettings.
 */
export type AccountPreferenceKey = 'preferredLocales' | 'timezone' | 'dateFormat' | 'unitSystem';

/**
 * Resolution order for a preference that moved from per-app HDSSettings to account-level
 * HDSProfile (plan 78 §C 7.1b):
 *
 *   1. HDSProfile — only when the value is genuinely **stored**. The account app owns these,
 *      so an explicit account-level value wins.
 *   2. HDSSettings — the legacy per-app value, for apps not yet migrated.
 *   3. HDSProfile defaults (incl. browser inference).
 *
 * Step 1 checks `isStored` rather than `isHooked` on purpose: the profile's preferences always
 * read as a non-null default, so hooking alone would let `DD.MM.YYYY` silently override a
 * date format the user really had set per-app. That would be a regression for any app that
 * already hooks HDSProfile (hds-webapp does).
 */
export function resolveAccountPreference<K extends AccountPreferenceKey> (key: K): ProfileValues[K] {
  if (HDSProfile.isHooked && HDSProfile.isStored(key)) return HDSProfile.get(key);
  if (HDSSettings.isHooked) return HDSSettings.get(key) as ProfileValues[K];
  return HDSProfile.get(key);
}

/**
 * Whether *some* source can supply this preference — i.e. it is stored at account level or
 * an app has hooked its settings. Callers use this to keep "nothing hooked" behaviour
 * (e.g. formatEventDate falling back to ISO) instead of silently adopting a default.
 */
export function hasAccountPreference (key: AccountPreferenceKey): boolean {
  return (HDSProfile.isHooked && HDSProfile.isStored(key)) || HDSSettings.isHooked;
}
