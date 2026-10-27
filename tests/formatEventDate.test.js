import { assert } from './test-utils/deps-node.js';
import { formatEventDate, HDSSettings } from '../ts/index.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

// Mock connection
function createMockConnection (settingsEvents = []) {
  return {
    async api (calls) {
      return calls.map(call => {
        if (call.method === 'events.get') {
          if (call.params.streams[0] === 'test-stream') {
            return { events: settingsEvents };
          }
          return { events: [] };
        }
        return {};
      });
    },
    async apiOne (method, params, key) {
      const result = await this.api([{ method, params }]);
      return key ? result[0][key] : result[0];
    }
  };
}

describe('[FED] formatEventDate', function () {
  afterEach(() => {
    HDSSettings.unhook();
  });

  // 2024-01-15T12:00:00Z = 1705320000
  const timestamp = 1705320000;

  it('[FED1] returns ISO date when not hooked', () => {
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '2024-01-15');
  });

  it('[FED2] uses DD.MM.YYYY format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'DD.MM.YYYY' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '15.01.2024');
  });

  it('[FED3] uses DD/MM/YYYY format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'DD/MM/YYYY' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '15/01/2024');
  });

  it('[FED4] uses MM/DD/YYYY format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'MM/DD/YYYY' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '01/15/2024');
  });

  it('[FED5] uses YYYY-MM-DD format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'YYYY-MM-DD' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '2024-01-15');
  });

  describe('[FEDO] options { year, weekday }', () => {
    afterEach(() => {
      resetPreferredLocales();
    });

    const expectedWithoutYear = {
      'DD.MM.YYYY': '15.01.',
      'DD/MM/YYYY': '15/01',
      'MM/DD/YYYY': '01/15',
      'YYYY-MM-DD': '01-15'
    };
    for (const [format, expected] of Object.entries(expectedWithoutYear)) {
      it(`[FEDO1] year: false with ${format} → ${expected}`, async () => {
        await HDSSettings.hookToConnection(createMockConnection([
          { id: 'ev1', type: 'settings/date-format', content: format }
        ]), 'test-stream');
        assert.strictEqual(formatEventDate(timestamp, { year: false }), expected);
      });
    }

    it('[FEDO2] year: false without a date format → MM-DD (the ISO date without its year)', () => {
      assert.strictEqual(formatEventDate(timestamp, { year: false }), '01-15');
    });

    it('[FEDO3] weekday: true puts the short day name first, in the preferred locale', async () => {
      await HDSSettings.hookToConnection(createMockConnection([
        { id: 'ev1', type: 'settings/date-format', content: 'DD.MM.YYYY' }
      ]), 'test-stream');
      setPreferredLocales(['en']);
      assert.strictEqual(formatEventDate(timestamp, { weekday: true }), 'Mon 15.01.2024');
      setPreferredLocales(['fr']);
      assert.strictEqual(formatEventDate(timestamp, { weekday: true, year: false }), 'lun. 15.01.');
      assert.strictEqual(formatEventDate(timestamp, { weekday: true, locale: 'en' }), 'Mon 15.01.2024');
    });

    it('[FEDO4] no options (and an empty object) keep the existing output', async () => {
      await HDSSettings.hookToConnection(createMockConnection([
        { id: 'ev1', type: 'settings/date-format', content: 'DD/MM/YYYY' }
      ]), 'test-stream');
      assert.strictEqual(formatEventDate(timestamp), '15/01/2024');
      assert.strictEqual(formatEventDate(timestamp, {}), '15/01/2024');
      assert.strictEqual(formatEventDate(timestamp, { year: true, weekday: false }), '15/01/2024');
    });
  });
});
