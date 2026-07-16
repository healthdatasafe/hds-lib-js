import { assert } from './test-utils/deps-node.js';
import { HDSProfile } from '../ts/index.ts';
import { resetPreferredLocales, getPreferredLocales, setPreferredLocales } from '../ts/localizeText.ts';

/**
 * L1 regression (plan 78) — HDSProfile must apply its locale to the localizer ONLY when the
 * value is genuinely stored. An unstored profile applying its default `['en']` silently
 * clobbered a legacy per-app language: consumers hook HDSProfile *after* HDSSettings, and
 * `setPreferredLocales` prepends, so the last writer wins the front slot. A user who picked
 * Français in the old per-app selector (stored in HDSSettings; profile empty) flipped to
 * English on next load.
 *
 * These drive the real `load()` side-effect path with a fake connection — no pryv service.
 */
function fakeConnection (events, { throwOnGet = false } = {}) {
  return {
    apiOne: async () => {
      if (throwOnGet) throw new Error('no profile access');
      return events;
    },
  };
}

const localeEvent = (locales) => ({
  type: 'settings/preferred-locales',
  streamIds: ['profile-preferences'],
  content: locales,
});

describe('[HDSPL] HDSProfile locale side effect (L1)', () => {
  afterEach(() => {
    HDSProfile.unhook();
    resetPreferredLocales();
  });

  it('[HDSPL1] an UNstored profile does not clobber a legacy per-app locale', async () => {
    // Simulate the legacy path: HDSSettings applied Français to the localizer.
    resetPreferredLocales();
    setPreferredLocales(['fr']);
    assert.strictEqual(getPreferredLocales()[0], 'fr');

    // Profile has nothing stored (empty events) — it must NOT assert its default.
    await HDSProfile.hookToConnection(fakeConnection([]));
    assert.strictEqual(HDSProfile.isStored('preferredLocales'), false);
    assert.strictEqual(
      getPreferredLocales()[0], 'fr',
      'unstored profile must leave the legacy per-app locale in front'
    );
  });

  it('[HDSPL2] a STORED profile locale is applied (profile is the account source of truth)', async () => {
    resetPreferredLocales();
    assert.notStrictEqual(getPreferredLocales()[0], 'fr'); // starts at the default

    await HDSProfile.hookToConnection(fakeConnection([localeEvent(['fr'])]));
    assert.strictEqual(HDSProfile.isStored('preferredLocales'), true);
    assert.strictEqual(
      getPreferredLocales()[0], 'fr',
      'a stored profile locale must be applied to the localizer'
    );
  });

  it('[HDSPL3] no profile access (load throws) does not clobber a legacy locale', async () => {
    resetPreferredLocales();
    setPreferredLocales(['fr']);

    await HDSProfile.hookToConnection(fakeConnection([], { throwOnGet: true }));
    assert.strictEqual(HDSProfile.isHooked, true);
    assert.strictEqual(
      getPreferredLocales()[0], 'fr',
      'the no-access branch must not assert a default locale either'
    );
  });
});

/**
 * P1 regression (plan 78) — a *failed reload* must not transiently un-store account values.
 * `load()` used to reset `_values`/`_cache` to defaults BEFORE the fetch, so a network blip
 * on `reload()` silently dropped displayName / preferences to defaults (and `isStored` → false).
 */
function flakyConnection (events) {
  let calls = 0;
  return {
    apiOne: async () => {
      calls += 1;
      if (calls > 1) throw new Error('transient network error');
      return events;
    },
  };
}

describe('[HDSPP] HDSProfile.reload robustness (P1)', () => {
  afterEach(() => {
    HDSProfile.unhook();
    resetPreferredLocales();
  });

  it('[HDSPP1] a failed reload preserves the previously-loaded stored values', async () => {
    const events = [
      { type: 'contact/display-name', streamIds: ['profile-display-name'], content: 'Dr. Smith' },
      localeEvent(['fr']),
    ];
    await HDSProfile.hookToConnection(flakyConnection(events)); // first load succeeds
    assert.strictEqual(HDSProfile.get('displayName'), 'Dr. Smith');
    assert.strictEqual(HDSProfile.isStored('displayName'), true);
    assert.deepStrictEqual(HDSProfile.get('preferredLocales'), ['fr']);

    await HDSProfile.reload(); // second load throws — must NOT wipe to defaults
    assert.strictEqual(HDSProfile.get('displayName'), 'Dr. Smith', 'value must survive a failed reload');
    assert.strictEqual(HDSProfile.isStored('displayName'), true, 'isStored must survive a failed reload');
    assert.deepStrictEqual(HDSProfile.get('preferredLocales'), ['fr']);
  });
});
