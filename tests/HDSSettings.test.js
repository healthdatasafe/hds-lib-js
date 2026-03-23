import { assert } from './test-utils/deps-node.js';
import { HDSSettings, SETTING_TYPES } from '../ts/index.ts';

// Mock connection that captures API calls
function createMockConnection (responses = {}) {
  return {
    apiCalls: [],
    async api (calls) {
      this.apiCalls.push(...calls);
      return calls.map(call => {
        if (responses[call.method]) {
          return responses[call.method](call.params);
        }
        if (call.method === 'events.get') return { events: [] };
        if (call.method === 'events.create') return { event: { id: 'ev-' + Date.now(), ...call.params } };
        if (call.method === 'events.update') return { event: { id: call.params.id, ...call.params.update } };
        return {};
      });
    },
    async apiOne (method, params, key) {
      const result = await this.api([{ method, params }]);
      return key ? result[0][key] : result[0];
    }
  };
}

describe('[HDSS] HDSSettings', function () {
  afterEach(() => {
    HDSSettings.unhook();
  });

  describe('[HDSS-U] unhook / defaults', () => {
    it('[HDSS-U1] isHooked is false by default', () => {
      assert.strictEqual(HDSSettings.isHooked, false);
    });

    it('[HDSS-U2] get returns defaults when not hooked', () => {
      assert.deepStrictEqual(HDSSettings.get('preferredLocales'), ['en']);
      assert.strictEqual(HDSSettings.get('theme'), 'light');
      assert.strictEqual(HDSSettings.get('unitSystem'), 'metric');
      assert.strictEqual(HDSSettings.get('dateFormat'), 'DD.MM.YYYY');
      assert.strictEqual(HDSSettings.get('displayName'), null);
    });

    it('[HDSS-U3] getAll returns all defaults', () => {
      const all = HDSSettings.getAll();
      assert.ok(all.preferredLocales);
      assert.ok(all.theme);
      assert.ok(all.timezone);
      assert.ok(all.dateFormat);
      assert.ok(all.unitSystem);
      assert.strictEqual(all.displayName, null);
    });

    it('[HDSS-U4] unhook resets to defaults', async () => {
      const conn = createMockConnection();
      await HDSSettings.hookToConnection(conn, 'test-stream');
      assert.strictEqual(HDSSettings.isHooked, true);
      HDSSettings.unhook();
      assert.strictEqual(HDSSettings.isHooked, false);
      assert.strictEqual(HDSSettings.get('theme'), 'light');
      assert.strictEqual(HDSSettings.get('displayName'), null);
    });
  });

  describe('[HDSS-H] hookToConnection', () => {
    it('[HDSS-H1] loads settings from server events', async () => {
      const conn = createMockConnection({
        'events.get': (params) => ({
          events: [
            { id: 'ev1', type: 'settings/theme', content: 'dark' },
            { id: 'ev2', type: 'settings/preferred-locales', content: ['fr'] },
            { id: 'ev3', type: 'settings/unit-system', content: 'imperial' },
            { id: 'ev4', type: 'contact/display-name', content: 'Dr. Smith' }
          ]
        })
      });

      await HDSSettings.hookToConnection(conn, 'test-stream');
      assert.strictEqual(HDSSettings.isHooked, true);
      assert.strictEqual(HDSSettings.get('theme'), 'dark');
      assert.deepStrictEqual(HDSSettings.get('preferredLocales'), ['fr']);
      assert.strictEqual(HDSSettings.get('unitSystem'), 'imperial');
      assert.strictEqual(HDSSettings.get('displayName'), 'Dr. Smith');
      // dateFormat not in server events → stays default
      assert.strictEqual(HDSSettings.get('dateFormat'), 'DD.MM.YYYY');
    });

    it('[HDSS-H2] handles empty server (no events)', async () => {
      const conn = createMockConnection();
      await HDSSettings.hookToConnection(conn, 'test-stream');
      assert.strictEqual(HDSSettings.isHooked, true);
      assert.strictEqual(HDSSettings.get('theme'), 'light');
      assert.strictEqual(HDSSettings.get('unitSystem'), 'metric');
      assert.strictEqual(HDSSettings.get('displayName'), null);
    });
  });

  describe('[HDSS-S] set', () => {
    it('[HDSS-S1] creates new event when no cache exists', async () => {
      const conn = createMockConnection();
      await HDSSettings.hookToConnection(conn, 'test-stream');

      await HDSSettings.set('theme', 'dark');
      assert.strictEqual(HDSSettings.get('theme'), 'dark');

      // Verify the API call was events.create
      const createCall = conn.apiCalls.find(c => c.method === 'events.create');
      assert.ok(createCall, 'Should have called events.create');
      assert.strictEqual(createCall.params.type, 'settings/theme');
      assert.strictEqual(createCall.params.content, 'dark');
    });

    it('[HDSS-S2] updates existing event when cached', async () => {
      const conn = createMockConnection({
        'events.get': (params) => ({
          events: [{ id: 'ev-theme', type: 'settings/theme', content: 'light' }]
        })
      });

      await HDSSettings.hookToConnection(conn, 'test-stream');
      assert.strictEqual(HDSSettings.get('theme'), 'light');

      await HDSSettings.set('theme', 'dark');
      assert.strictEqual(HDSSettings.get('theme'), 'dark');

      const updateCall = conn.apiCalls.find(c => c.method === 'events.update');
      assert.ok(updateCall, 'Should have called events.update');
      assert.strictEqual(updateCall.params.id, 'ev-theme');
      assert.deepStrictEqual(updateCall.params.update, { content: 'dark' });
    });

    it('[HDSS-S3] throws when not hooked', async () => {
      await assert.rejects(
        () => HDSSettings.set('theme', 'dark'),
        /hookToApplication|hookToConnection/
      );
    });

    it('[HDSS-S4] displayName uses same set/get as other settings', async () => {
      const conn = createMockConnection();
      await HDSSettings.hookToConnection(conn, 'test-stream');

      await HDSSettings.set('displayName', 'Alice');
      assert.strictEqual(HDSSettings.get('displayName'), 'Alice');

      const createCall = conn.apiCalls.find(c =>
        c.method === 'events.create' && c.params.type === 'contact/display-name'
      );
      assert.ok(createCall, 'Should have created a settings/displayName event');
      assert.strictEqual(createCall.params.content, 'Alice');
    });

    it('[HDSS-S5] displayName updates existing event', async () => {
      const conn = createMockConnection({
        'events.get': (params) => ({
          events: [{ id: 'ev-dn', type: 'contact/display-name', content: 'Old Name' }]
        })
      });

      await HDSSettings.hookToConnection(conn, 'test-stream');
      assert.strictEqual(HDSSettings.get('displayName'), 'Old Name');

      await HDSSettings.set('displayName', 'New Name');
      assert.strictEqual(HDSSettings.get('displayName'), 'New Name');

      const updateCall = conn.apiCalls.find(c => c.method === 'events.update');
      assert.ok(updateCall, 'Should have called events.update');
      assert.strictEqual(updateCall.params.id, 'ev-dn');
    });
  });

  describe('[HDSS-R] reload', () => {
    it('[HDSS-R1] reloads settings from server', async () => {
      let callCount = 0;
      const conn = createMockConnection({
        'events.get': (params) => {
          callCount++;
          if (callCount === 1) {
            return { events: [{ id: 'ev1', type: 'settings/theme', content: 'light' }] };
          }
          return { events: [{ id: 'ev1', type: 'settings/theme', content: 'dark' }] };
        }
      });

      await HDSSettings.hookToConnection(conn, 'test-stream');
      assert.strictEqual(HDSSettings.get('theme'), 'light');

      await HDSSettings.reload();
      assert.strictEqual(HDSSettings.get('theme'), 'dark');
    });
  });
});

describe('[STPS] SETTING_TYPES', () => {
  it('[STPS1] has expected keys', () => {
    assert.strictEqual(SETTING_TYPES.preferredLocales, 'settings/preferred-locales');
    assert.strictEqual(SETTING_TYPES.theme, 'settings/theme');
    assert.strictEqual(SETTING_TYPES.timezone, 'settings/timezone');
    assert.strictEqual(SETTING_TYPES.dateFormat, 'settings/date-format');
    assert.strictEqual(SETTING_TYPES.unitSystem, 'settings/unit-system');
    assert.strictEqual(SETTING_TYPES.displayName, 'contact/display-name');
  });
});

describe('[HDSD] HDSSettings dynamic settings', function () {
  afterEach(() => {
    HDSSettings.unhook();
  });

  it('[HDSD1] _testInject and get work for dynamic keys', () => {
    HDSSettings._testInject('preferred-display-wellbeing-mood', 'billings');
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), 'billings');
    assert.strictEqual(HDSSettings.isHooked, true);
  });

  it('[HDSD2] _testClear removes dynamic key', () => {
    HDSSettings._testInject('preferred-display-wellbeing-mood', 'mira');
    HDSSettings._testClear('preferred-display-wellbeing-mood');
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), undefined);
  });

  it('[HDSD3] getDynamic returns all settings with prefix', () => {
    HDSSettings._testInject('preferred-display-wellbeing-mood', 'billings');
    HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'appleHealth');
    const all = HDSSettings.getDynamic('preferred-display-');
    assert.strictEqual(all['wellbeing-mood'], 'billings');
    assert.strictEqual(all['body-vulva-mucus-inspect'], 'appleHealth');
  });

  it('[HDSD4] unhook clears dynamic settings', () => {
    HDSSettings._testInject('preferred-display-wellbeing-mood', 'billings');
    HDSSettings.unhook();
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), undefined);
    assert.deepStrictEqual(HDSSettings.getDynamic('preferred-display-'), {});
  });

  it('[HDSD5] load reads dynamic settings from server events', async () => {
    const conn = createMockConnection({
      'events.get': () => ({
        events: [
          { id: 'ev-ac1', type: 'settings/preferred-display', content: { itemKey: 'wellbeing-mood', value: 'billings' } },
          { id: 'ev-ac2', type: 'settings/preferred-display', content: { itemKey: 'body-vulva-mucus-inspect', value: 'appleHealth' } },
          { id: 'ev-t', type: 'settings/theme', content: 'dark' },
        ]
      })
    });
    await HDSSettings.hookToConnection(conn, 'test-stream');
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), 'billings');
    assert.strictEqual(HDSSettings.get('preferred-display-body-vulva-mucus-inspect'), 'appleHealth');
    assert.strictEqual(HDSSettings.get('theme'), 'dark');
  });

  it('[HDSD6] setDynamic creates new event', async () => {
    const conn = createMockConnection();
    await HDSSettings.hookToConnection(conn, 'test-stream');

    await HDSSettings.setDynamic('preferred-display-wellbeing-mood', 'billings');
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), 'billings');

    const createCall = conn.apiCalls.find(c =>
      c.method === 'events.create' && c.params.type === 'settings/preferred-display'
    );
    assert.ok(createCall, 'Should have called events.create');
    assert.strictEqual(createCall.params.content.itemKey, 'wellbeing-mood');
    assert.strictEqual(createCall.params.content.value, 'billings');
  });

  it('[HDSD7] setDynamic updates existing event', async () => {
    const conn = createMockConnection({
      'events.get': () => ({
        events: [
          { id: 'ev-ac-mood', type: 'settings/preferred-display', content: { itemKey: 'wellbeing-mood', value: 'billings' } }
        ]
      })
    });
    await HDSSettings.hookToConnection(conn, 'test-stream');
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), 'billings');

    await HDSSettings.setDynamic('preferred-display-wellbeing-mood', 'mira');
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), 'mira');

    const updateCall = conn.apiCalls.find(c => c.method === 'events.update');
    assert.ok(updateCall, 'Should have called events.update');
    assert.strictEqual(updateCall.params.id, 'ev-ac-mood');
    assert.strictEqual(updateCall.params.update.content.value, 'mira');
  });

  it('[HDSD8] setDynamic with null deletes setting', async () => {
    const conn = createMockConnection({
      'events.get': () => ({
        events: [
          { id: 'ev-ac-mood', type: 'settings/preferred-display', content: { itemKey: 'wellbeing-mood', value: 'billings' } }
        ]
      })
    });
    await HDSSettings.hookToConnection(conn, 'test-stream');

    await HDSSettings.setDynamic('preferred-display-wellbeing-mood', null);
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), undefined);

    const deleteCall = conn.apiCalls.find(c => c.method === 'events.delete');
    assert.ok(deleteCall, 'Should have called events.delete');
    assert.strictEqual(deleteCall.params.id, 'ev-ac-mood');
  });

  it('[HDSD9] setDynamic throws for unknown prefix', async () => {
    const conn = createMockConnection();
    await HDSSettings.hookToConnection(conn, 'test-stream');
    await assert.rejects(
      () => HDSSettings.setDynamic('unknownPrefix-foo', 'bar'),
      /Unknown dynamic setting prefix/
    );
  });

  it('[HDSD10] setDynamic throws when not hooked', async () => {
    await assert.rejects(
      () => HDSSettings.setDynamic('preferred-display-wellbeing-mood', 'billings'),
      /hookToApplication|hookToConnection/
    );
  });
});
