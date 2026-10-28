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

  // 2024-01-15 at local noon: the local calendar day is the 15th in every zone
  const timestamp = new Date(2024, 0, 15, 12).getTime() / 1000;
  /** The local calendar day of a timestamp, as an ISO date (the fallback without a date format). */
  const localIso = (sec) => {
    const d = new Date(sec * 1000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  it('[FED1] returns ISO date when not hooked', () => {
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '2024-01-15');
  });

  it('[FED1b] without a date format, the local calendar day, like the time beside it (B-2026-10-28-33)', () => {
    // 00:30 local: the UTC date is the previous day in any zone east of UTC
    const justAfterMidnight = new Date(2024, 0, 15, 0, 30).getTime() / 1000;
    assert.strictEqual(formatEventDate(justAfterMidnight), '2024-01-15');
    const justBeforeMidnight = new Date(2024, 0, 15, 23, 30).getTime() / 1000;
    assert.strictEqual(formatEventDate(justBeforeMidnight), '2024-01-15');
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

  describe('[FEDP] an event with a partial date (data-model PARTIAL-DATES.md)', () => {
    afterEach(() => {
      resetPreferredLocales();
    });

    // 1999-03-01T12:00:00Z: "March 1999" stored at the start of the period, 12:00 UTC
    const march1999 = 920289600;
    const ev = (clientData) => ({ time: march1999, clientData });

    it('[FEDP1] an event without clientData reads as its timestamp', async () => {
      assert.strictEqual(formatEventDate({ time: timestamp }), '2024-01-15');
      await HDSSettings.hookToConnection(createMockConnection([
        { id: 'ev1', type: 'settings/date-format', content: 'DD.MM.YYYY' }
      ]), 'test-stream');
      assert.strictEqual(formatEventDate({ time: timestamp, clientData: null }, { weekday: true, locale: 'en' }), 'Mon 15.01.2024');
    });

    it('[FEDP2] month: "March 1999" in the preferred locale, or the month alone without the year', () => {
      setPreferredLocales(['en']);
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'month' })), 'March 1999');
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'month' }), { year: false }), 'March');
      setPreferredLocales(['fr']);
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'month' })), 'mars 1999');
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'month' }), { locale: 'en' }), 'March 1999');
    });

    it('[FEDP3] year: the year alone, whatever opts.year says', () => {
      const y1997 = { time: 852120000, clientData: { hdsTimePrecision: 'year' } }; // 1997-01-01T12:00:00Z
      assert.strictEqual(formatEventDate(y1997), '1997');
      assert.strictEqual(formatEventDate(y1997, { year: false, weekday: true }), '1997');
    });

    it('[FEDP4] approx: "about" + hdsTimeText, else "about" + the year', () => {
      setPreferredLocales(['en']);
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'approx', hdsTimeText: 'spring 1998' })), 'about spring 1998');
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'approx', hdsTimeText: '  ' })), 'about 1999');
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'approx' })), 'about 1999');
      setPreferredLocales(['fr']);
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'approx', hdsTimeText: 'printemps 1998' })), 'vers printemps 1998');
    });

    it('[FEDP5] day: the date in the resolved format, read in UTC', async () => {
      await HDSSettings.hookToConnection(createMockConnection([
        { id: 'ev1', type: 'settings/date-format', content: 'DD.MM.YYYY' }
      ]), 'test-stream');
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'day' })), '01.03.1999');
      // 23:30 UTC on 1 March: local time would be 2 March east of UTC+0:30, the stored day is still the 1st
      assert.strictEqual(formatEventDate({ time: march1999 + 41400, clientData: { hdsTimePrecision: 'day' } }), '01.03.1999');
    });

    it('[FEDP6] minute with hdsTimeZone: the day in that zone; an unknown zone falls back', () => {
      // 2024-01-15T23:30:00Z is 16 January in Tokyo, 15 January in New York
      const late = 1705361400;
      assert.strictEqual(formatEventDate({ time: late, clientData: { hdsTimePrecision: 'minute', hdsTimeZone: 'Asia/Tokyo' } }), '2024-01-16');
      assert.strictEqual(formatEventDate({ time: late, clientData: { hdsTimePrecision: 'minute', hdsTimeZone: 'America/New_York' } }), '2024-01-15');
      assert.strictEqual(formatEventDate({ time: late, clientData: { hdsTimePrecision: 'minute', hdsTimeZone: 'Not/AZone' } }), localIso(late));
    });

    it('[FEDP7] an unknown precision reads as absent', () => {
      assert.strictEqual(formatEventDate(ev({ hdsTimePrecision: 'week' })), localIso(march1999));
    });
  });
});
