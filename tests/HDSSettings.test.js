import { assert } from './test-utils/deps-node.js';
import { HDSSettings, SETTING_TYPES, pryv } from '../ts/index.ts';
import { createUser, init as initPryvService } from './test-utils/pryvService.js';

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

    it('[HDSS-S3] set without hook is memory-only (no Pryv write, value cached)', async () => {
      // Reset singleton state — no connection means memory-only mode.
      // The call must not throw and a subsequent get() must return the value.
      await HDSSettings.set('theme', 'dark');
      assert.strictEqual(HDSSettings.get('theme'), 'dark');
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

  /** events.delete as Pryv answers it: a live event is trashed first, a trashed one is deleted. */
  function deletingConnection (events) {
    const trashed = new Set(events.filter(e => e.trashed).map(e => e.id));
    const deleted = new Set();
    return createMockConnection({
      'events.get': () => ({ events: events.filter(e => !trashed.has(e.id) && !deleted.has(e.id)) }),
      'events.delete': ({ id }) => {
        if (trashed.has(id)) {
          trashed.delete(id);
          deleted.add(id);
          return { eventDeletion: { id } };
        }
        trashed.add(id);
        return { event: { ...events.find(e => e.id === id), trashed: true } };
      }
    });
  }

  it('[HDSD8] setDynamic with null deletes the setting for good: trash, then delete (B-2026-10-26-7)', async () => {
    const conn = deletingConnection([
      { id: 'ev-ac-mood', type: 'settings/preferred-display', content: { itemKey: 'wellbeing-mood', value: 'billings' } }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');

    await HDSSettings.setDynamic('preferred-display-wellbeing-mood', null);
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), undefined);

    const deleteCalls = conn.apiCalls.filter(c => c.method === 'events.delete');
    assert.deepStrictEqual(deleteCalls.map(c => c.params.id), ['ev-ac-mood', 'ev-ac-mood'], 'trash, then delete');

    await HDSSettings.reload();
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), undefined, 'gone after a reload');
  });

  it('[HDSD8b] setDynamic with null on an event trashed meanwhile deletes it in one call', async () => {
    // loaded while live, trashed by another client since: the first events.delete already deletes it
    const conn = createMockConnection({
      'events.get': () => ({
        events: [{ id: 'ev-w', type: 'settings/preferred-input', content: { itemKey: 'body-weight', value: 'mass/lb' } }]
      }),
      'events.delete': ({ id }) => ({ eventDeletion: { id } })
    });
    await HDSSettings.hookToConnection(conn, 'test-stream');
    await HDSSettings.setDynamic('preferred-input-body-weight', null);
    assert.strictEqual(conn.apiCalls.filter(c => c.method === 'events.delete').length, 1);
    assert.strictEqual(HDSSettings.get('preferred-input-body-weight'), undefined);
  });

  it('[HDSD8d] a failing delete is reported and the setting is kept', async () => {
    const conn = createMockConnection({
      'events.get': () => ({
        events: [{ id: 'ev-w', type: 'settings/preferred-input', content: { itemKey: 'body-weight', value: 'mass/lb' } }]
      }),
      'events.delete': () => ({ error: { id: 'forbidden', message: 'no' } })
    });
    // throw on an error answer, as pryv's apiOne does
    conn.apiOne = async (method, params, key) => {
      const [result] = await conn.api([{ method, params }]);
      if (result.error) throw new Error(result.error.id);
      return key ? result[key] : result;
    };
    await HDSSettings.hookToConnection(conn, 'test-stream');
    await assert.rejects(() => HDSSettings.setDynamic('preferred-input-body-weight', null), /forbidden/);
    assert.strictEqual(HDSSettings.get('preferred-input-body-weight'), 'mass/lb');
  });

  it('[HDSD8c] setDynamic with null when nothing is stored makes no call', async () => {
    const conn = deletingConnection([]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    await HDSSettings.setDynamic('preferred-display-wellbeing-mood', null);
    assert.strictEqual(conn.apiCalls.filter(c => c.method === 'events.delete').length, 0);
  });

  it('[HDSD9] setDynamic throws for unknown prefix', async () => {
    const conn = createMockConnection();
    await HDSSettings.hookToConnection(conn, 'test-stream');
    await assert.rejects(
      () => HDSSettings.setDynamic('unknownPrefix-foo', 'bar'),
      /Unknown dynamic setting prefix/
    );
  });

  it('[HDSD10] setDynamic without hook is memory-only (no Pryv write, value cached)', async () => {
    // Memory-only mode: no connection, no error, get() reads back the value.
    await HDSSettings.setDynamic('preferred-display-wellbeing-mood', 'billings');
    assert.strictEqual(HDSSettings.get('preferred-display-wellbeing-mood'), 'billings');
    // Unknown prefix still throws.
    await assert.rejects(
      () => HDSSettings.setDynamic('not-a-known-prefix', 'foo'),
      /Unknown dynamic setting prefix/
    );
  });
});

describe('[HDSDL] HDSSettings dynamic settings (dev API)', function () {
  this.timeout(20000);

  let connection;
  const streamId = 'hdsd-settings-test';

  before(async () => {
    await initPryvService();
    const user = await createUser();
    connection = new pryv.Connection(user.apiEndpoint);
    await connection.apiOne('streams.create', { id: streamId, name: 'Settings test' }, 'stream');
  });

  afterEach(() => {
    HDSSettings.unhook();
  });

  it('[HDSDL1] setDynamic(key, null) deletes the event for good (B-2026-10-26-7)', async () => {
    await HDSSettings.hookToConnection(connection, streamId);
    await HDSSettings.setDynamic('preferred-input-body-vulva-mucus-inspect', 'creighton');
    const [stored] = await connection.apiOne('events.get', { streams: [streamId], types: ['settings/preferred-input'] }, 'events');
    assert.strictEqual(stored.content.value, 'creighton');

    await HDSSettings.setDynamic('preferred-input-body-vulva-mucus-inspect', null);
    assert.strictEqual(HDSSettings.get('preferred-input-body-vulva-mucus-inspect'), undefined);

    // neither live nor in the trash
    const all = await connection.apiOne('events.get', { streams: [streamId], state: 'all' }, 'events');
    assert.strictEqual(all.find(e => e.id === stored.id), undefined, 'the event must not survive, trashed or not');
    await HDSSettings.reload();
    assert.strictEqual(HDSSettings.get('preferred-input-body-vulva-mucus-inspect'), undefined);
  });
});
