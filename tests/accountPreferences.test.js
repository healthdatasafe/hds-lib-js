import { assert } from './test-utils/deps-node.js';
import { HDSProfile, HDSSettings, resolveAccountPreference, hasAccountPreference, saveLanguage, pryv } from '../ts/index.ts';
import { getPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';
import { createUser, init as initPryvService } from './test-utils/pryvService.js';

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

/** A connection that answers the calls HDSProfile and saveLanguage make, and records them. */
function profileConnection ({ accountUpdate } = {}) {
  return {
    calls: [],
    async api (calls) {
      this.calls.push(...calls);
      return calls.map(({ method, params }) => {
        if (method === 'events.get') return { events: [] };
        if (method === 'streams.create') return { stream: { id: params.id } };
        if (method === 'events.create') return { event: { id: 'ev-' + this.calls.length, ...params } };
        if (method === 'events.update') return { event: { id: params.id, ...params.update } };
        if (method === 'account.update') return accountUpdate ? accountUpdate(params) : { account: { language: params.update.language } };
        return {};
      });
    },
    async apiOne (method, params, key) {
      const [result] = await this.api([{ method, params }]);
      if (result.error) throw new Error(result.error.id);
      return key ? result[key] : result;
    }
  };
}

describe('[ACCL] saveLanguage', () => {
  afterEach(() => {
    HDSProfile.unhook();
    resetPreferredLocales();
  });

  it('[ACCL1] writes preferredLocales on the profile and the core account.language', async () => {
    const conn = profileConnection();
    await HDSProfile.hookToConnection(conn);
    const result = await saveLanguage('fr');
    assert.deepStrictEqual(result, { profileSaved: true, coreLanguageSaved: true });
    const created = conn.calls.find(c => c.method === 'events.create');
    assert.strictEqual(created.params.type, 'settings/preferred-locales');
    assert.deepStrictEqual(created.params.streamIds, ['profile-preferences']);
    assert.deepStrictEqual(created.params.content, ['fr']);
    const update = conn.calls.find(c => c.method === 'account.update');
    assert.deepStrictEqual(update.params, { update: { language: 'fr' } });
    assert.deepStrictEqual(HDSProfile.get('preferredLocales'), ['fr']);
    assert.strictEqual(getPreferredLocales()[0], 'fr', 'the localizer follows');
  });

  it('[ACCL2] a refused core update does not fail the save', async () => {
    const conn = profileConnection({ accountUpdate: () => ({ error: { id: 'forbidden', message: 'personal token required' } }) });
    await HDSProfile.hookToConnection(conn);
    const result = await saveLanguage('es');
    assert.strictEqual(result.profileSaved, true);
    assert.strictEqual(result.coreLanguageSaved, false);
    assert.strictEqual(result.coreError.id, 'forbidden');
    assert.deepStrictEqual(HDSProfile.get('preferredLocales'), ['es']);
  });

  it('[ACCL3] a thrown core update does not fail the save either', async () => {
    const conn = profileConnection({ accountUpdate: () => { throw new Error('network'); } });
    await HDSProfile.hookToConnection(conn);
    const result = await saveLanguage('fr');
    assert.strictEqual(result.coreLanguageSaved, false);
    assert.match(result.coreError.message, /network/);
  });

  it('[ACCL4] the core update goes through opts.connection when given', async () => {
    const profileConn = profileConnection();
    const other = profileConnection();
    await HDSProfile.hookToConnection(profileConn);
    await saveLanguage('fr', { connection: other });
    assert.strictEqual(profileConn.calls.filter(c => c.method === 'account.update').length, 0);
    assert.strictEqual(other.calls.filter(c => c.method === 'account.update').length, 1);
  });

  it('[ACCL5] rejects without a hooked profile, or without a language', async () => {
    await assert.rejects(() => saveLanguage('fr'), /hookToConnection/);
    await HDSProfile.hookToConnection(profileConnection());
    await assert.rejects(() => saveLanguage(''), /language code is required/);
  });
});

describe('[ACCLL] saveLanguage (dev API)', function () {
  this.timeout(20000);

  afterEach(() => {
    HDSProfile.unhook();
    resetPreferredLocales();
  });

  it('[ACCLL1] the profile and the core account both read the new language', async () => {
    await initPryvService();
    const user = await createUser();
    const connection = new pryv.Connection(user.apiEndpoint);
    await HDSProfile.hookToConnection(connection);
    const result = await saveLanguage('fr');
    assert.strictEqual(result.coreLanguageSaved, true, 'core update: ' + JSON.stringify(result.coreError));
    const account = await connection.apiOne('account.get', {}, 'account');
    assert.strictEqual(account.language, 'fr');
    HDSProfile.unhook();
    await HDSProfile.hookToConnection(connection);
    assert.deepStrictEqual(HDSProfile.get('preferredLocales'), ['fr']);
    assert.strictEqual(HDSProfile.isStored('preferredLocales'), true);
  });
});
