import HDSProfile, { getHookedProfileConnection, type ProfileValues } from './HDSProfile.ts';
import HDSSettings from './HDSSettings.ts';
import { HDSLibError } from '../errors.ts';
import type { pryv } from '../patchedPryv.ts';

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

export interface SaveLanguageResult {
  /** `preferredLocales` was written on the account (HDSProfile, `profile-preferences`). Always true on resolve. */
  profileSaved: true;
  /** The core `account.language` (the platform's own mail language) was updated too. */
  coreLanguageSaved: boolean;
  /** Why the core update did not happen, when it did not (no connection, refused, network). */
  coreError?: unknown;
}

/**
 * Save the person's language for every HDS app, and for the platform's own mail.
 *
 * Writes two places, as the account app's Preferences page does (decision 2026-07-15): the
 * account-level `preferredLocales` (HDSProfile, read by every HDS app; the language becomes the
 * first and only entry, and the localizer switches to it) and the Pryv core `account.language`
 * (password-reset and other platform mail). They are different systems but a person has one
 * language; writing only the first leaves platform mail in the old language.
 *
 * The core write is best effort: it needs a personal token and must not fail the save, so a
 * refusal resolves with `coreLanguageSaved: false` and `coreError` (show a notice, not an
 * error). The profile write is not: it rejects when HDSProfile is not hooked or the write fails.
 *
 * @param locale     language code, e.g. `fr`.
 * @param opts.connection  connection for `account.update`; defaults to the one HDSProfile is hooked to.
 */
export async function saveLanguage (locale: string, opts: { connection?: pryv.Connection } = {}): Promise<SaveLanguageResult> {
  if (typeof locale !== 'string' || locale.trim() === '') {
    throw new HDSLibError('saveLanguage: a language code is required', { locale });
  }
  await HDSProfile.set('preferredLocales', [locale]);

  const connection = opts.connection ?? getHookedProfileConnection();
  if (connection == null) {
    return { profileSaved: true, coreLanguageSaved: false, coreError: new HDSLibError('saveLanguage: no connection for account.update') };
  }
  try {
    const [result] = await connection.api([
      { method: 'account.update', params: { update: { language: locale } } }
    ] as any) as Array<{ error?: { id?: string; message?: string } }>;
    if (result == null || result.error) {
      return { profileSaved: true, coreLanguageSaved: false, coreError: result?.error ?? new HDSLibError('saveLanguage: no answer to account.update') };
    }
    return { profileSaved: true, coreLanguageSaved: true };
  } catch (e) {
    return { profileSaved: true, coreLanguageSaved: false, coreError: e };
  }
}
