import { assert } from './test-utils/deps-node.js';
import { cyclePhaseAt } from '../ts/index.ts';
import { eventDayNumber } from '../ts/utils/calendarDay.ts';

// A date-only event (hdsTimePrecision 'day', time 12:00 UTC) is read on its UTC date, in any zone
// (data-model PARTIAL-DATES.md; B-2026-11-27-56)
describe('[CPDP] date-only cycle events in a zone at UTC+12 or beyond', () => {
  const AKL = 'Pacific/Auckland'; // UTC+13 in January
  const DAY = 86400;
  const noonUtc = (iso) => Date.parse(`${iso}T12:00:00Z`) / 1000;
  const dayOnly = { hdsTimePrecision: 'day' };

  it('[CPDP1] eventDayNumber reads a day-precision event in UTC, a timed one in the zone', () => {
    const t = noonUtc('2026-01-05'); // 2026-01-06 01:00 in Auckland
    const jan5 = Date.parse('2026-01-05T00:00:00Z') / 1000 / DAY;
    assert.equal(eventDayNumber({ time: t, clientData: dayOnly }, AKL), jan5);
    assert.equal(eventDayNumber({ time: t }, AKL), jan5 + 1);
    assert.equal(eventDayNumber({ time: t, clientData: { hdsTimePrecision: 'minute' } }, AKL), jan5 + 1);
  });

  it('[CPDP2] cycle day 1 is the date the importer wrote, not the next one', () => {
    const events = [
      { streamId: 'fertility-cycles-start', type: 'activity/plain', time: noonUtc('2026-01-05'), clientData: dayOnly },
      { streamId: 'fertility-cycles-period', type: 'activity/plain', time: noonUtc('2026-01-09'), clientData: dayOnly }
    ];
    // 2026-01-05 15:00 in Auckland
    const r = cyclePhaseAt(Date.parse('2026-01-05T02:00:00Z') / 1000, events, AKL);
    assert.equal(r.cycleDay, 1);
    assert.equal(r.phase, 'menstrual');
    // 2026-01-09 15:00 in Auckland: the period end's date, still menstrual
    const end = cyclePhaseAt(Date.parse('2026-01-09T02:00:00Z') / 1000, events, AKL);
    assert.equal(end.cycleDay, 5);
    assert.equal(end.phase, 'menstrual');
  });
});
