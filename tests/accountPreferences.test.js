import { assert } from './test-utils/deps-node.js';
import { HDSProfile, HDSSettings, resolveAccountPreference, hasAccountPreference } from '../ts/index.ts';

/**
 * Precedence for preferences that moved from per-app HDSSettings to account-level
 * HDSProfile (plan 78 §C 7.1b): stored profile value > per-app value > default.
 */
describe('[ACCP] resolveAccountPreference', () => {
  afterEach(() => {
    HDSProfile.unhook();
    HDSSettings._testClear('dateFormat');
    HDSSettings._testClear('unitSystem');
    HDSSettings.unhook();
  });

  it('[ACCP1] falls back to the default when nothing is hooked', () => {
    assert.strictEqual(hasAccountPreference('dateFormat'), false);
    assert.strictEqual(resolveAccountPreference('dateFormat'), 'DD.MM.YYYY');
    assert.strictEqual(resolveAccountPreference('unitSystem'), 'metric');
  });

  it('[ACCP2] uses the per-app HDSSettings value when only that is hooked', () => {
    HDSSettings._testInject('dateFormat', 'MM/DD/YYYY');
    assert.strictEqual(hasAccountPreference('dateFormat'), true);
    assert.strictEqual(resolveAccountPreference('dateFormat'), 'MM/DD/YYYY');
  });

  it('[ACCP3] an unstored profile default does NOT mask a real per-app value', () => {
    // The regression guard. HDSProfile always reads a non-null default, so a naive
    // "profile wins when hooked" would override a date format the user really set.
    HDSSettings._testInject('dateFormat', 'MM/DD/YYYY');
    HDSProfile._testHook(); // hooked, but nothing stored for dateFormat
    assert.strictEqual(HDSProfile.isHooked, true);
    assert.strictEqual(HDSProfile.isStored('dateFormat'), false);
    assert.strictEqual(resolveAccountPreference('dateFormat'), 'MM/DD/YYYY');
  });

  it('[ACCP4] a stored account value wins over the per-app value', () => {
    HDSSettings._testInject('dateFormat', 'MM/DD/YYYY');
    HDSProfile._testHook({ dateFormat: 'YYYY-MM-DD' });
    assert.strictEqual(HDSProfile.isStored('dateFormat'), true);
    assert.strictEqual(resolveAccountPreference('dateFormat'), 'YYYY-MM-DD');
  });

  it('[ACCP5] a stored account value is used when no app has hooked settings', () => {
    HDSProfile._testHook({ unitSystem: 'imperial' });
    assert.strictEqual(hasAccountPreference('unitSystem'), true);
    assert.strictEqual(resolveAccountPreference('unitSystem'), 'imperial');
  });
});
