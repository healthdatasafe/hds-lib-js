const { assert } = require('./test-utils/deps-node');
const { HDSSettings, SETTING_TYPES } = require('../js/');

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
            { id: 'ev2', type: 'settings/preferredLocales', content: ['fr'] },
            { id: 'ev3', type: 'settings/unitSystem', content: 'imperial' },
            { id: 'ev4', type: 'settings/displayName', content: 'Dr. Smith' }
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
        c.method === 'events.create' && c.params.type === 'settings/displayName'
      );
      assert.ok(createCall, 'Should have created a settings/displayName event');
      assert.strictEqual(createCall.params.content, 'Alice');
    });

    it('[HDSS-S5] displayName updates existing event', async () => {
      const conn = createMockConnection({
        'events.get': (params) => ({
          events: [{ id: 'ev-dn', type: 'settings/displayName', content: 'Old Name' }]
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
    assert.strictEqual(SETTING_TYPES.preferredLocales, 'settings/preferredLocales');
    assert.strictEqual(SETTING_TYPES.theme, 'settings/theme');
    assert.strictEqual(SETTING_TYPES.timezone, 'settings/timezone');
    assert.strictEqual(SETTING_TYPES.dateFormat, 'settings/dateFormat');
    assert.strictEqual(SETTING_TYPES.unitSystem, 'settings/unitSystem');
    assert.strictEqual(SETTING_TYPES.displayName, 'settings/displayName');
  });
});
