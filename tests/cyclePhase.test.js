import { assert } from './test-utils/deps-node.js';
import { cyclePhaseAt } from '../ts/index.ts';

// Phase derivation from the fertility-cycles-* boundary items (data-model MENSTRUAL-CYCLE.md)
describe('[CPHX] cyclePhaseAt', () => {
  const ZRH = 'Europe/Zurich';
  const DAY = 86400;
  // 2026-01-05 10:00 Zurich (CET, UTC+1) = day 1 of the cycle below
  const D1 = Date.parse('2026-01-05T09:00:00Z') / 1000;
  const day = (n, hour = 10) => D1 + (n - 1) * DAY + (hour - 10) * 3600;

  const ev = (streamId, time, extra = {}) => ({ streamId, type: 'activity/plain', time, ...extra });
  const start = (n, extra) => ev('fertility-cycles-start', day(n), extra);
  const periodEnd = (n, extra) => ev('fertility-cycles-period', day(n), extra);
  const window = (n, days, extra) => ev('fertility-cycles-fertile-window', day(n), { duration: days * DAY, ...extra });
  const ovulation = (n, extra) => ev('fertility-cycles-ovulation', day(n), extra);
  const phaseOn = (n, events) => cyclePhaseAt(day(n), events, ZRH);

  // A full cycle: start day 1, period end day 5, window days 10-16, ovulation day 15, next start day 29
  const full = [start(1), periodEnd(5), window(10, 6), ovulation(15), start(29)];

  it('[CPH1] each phase over a full cycle', () => {
    const phases = [1, 5, 6, 9, 10, 16, 17, 28].map(n => phaseOn(n, full).phase);
    assert.deepEqual(phases, ['menstrual', 'menstrual', 'follicular', 'follicular', 'fertile', 'fertile', 'luteal', 'luteal']);
    assert.equal(phaseOn(29, full).cycleDay, 1);
    const r = phaseOn(12, full);
    assert.equal(r.cycleDay, 12);
    assert.equal(r.cycleStart, Date.parse('2026-01-04T23:00:00Z') / 1000);
    assert.equal(r.cycleEnd, Date.parse('2026-02-01T23:00:00Z') / 1000);
  });

  it('[CPH2] never guesses: no period end, no ovulation', () => {
    const events = [start(1), window(10, 6)];
    assert.equal(phaseOn(3, events).phase, null); // menstrual or follicular: unknown
    assert.equal(phaseOn(3, events).basis, 'unknown');
    assert.equal(phaseOn(12, events).phase, 'fertile');
    assert.equal(phaseOn(20, events).phase, null); // no luteal without ovulation
  });

  it('[CPH3] the ovulation day is fertile without a window; days after it are luteal', () => {
    const events = [start(1), periodEnd(5), ovulation(14)];
    assert.equal(phaseOn(10, events).phase, 'follicular');
    assert.equal(phaseOn(14, events).phase, 'fertile');
    assert.equal(phaseOn(15, events).phase, 'luteal');
  });

  it('[CPH4] days between a window and a later ovulation have no phase', () => {
    const events = [start(1), periodEnd(5), window(8, 3), ovulation(14)];
    assert.equal(phaseOn(12, events).phase, null);
    assert.equal(phaseOn(14, events).phase, 'fertile');
  });

  it('[CPH5] calendar days: an evening start makes the next morning day 2', () => {
    const events = [ev('fertility-cycles-start', day(1, 21))];
    const r = cyclePhaseAt(day(2, 8), events, ZRH);
    assert.equal(r.cycleDay, 2);
  });

  it('[CPH6] only the next start ends a cycle; an open cycle stops after 90 days', () => {
    const open = [start(1, { duration: 20 * DAY }), periodEnd(5), ovulation(15)];
    assert.equal(phaseOn(40, open).phase, 'luteal'); // duration does not end the cycle
    assert.equal(phaseOn(90, open).cycleDay, 90);
    assert.equal(phaseOn(91, open).phase, null);
    assert.equal(phaseOn(91, open).cycleDay, null);
    assert.equal(phaseOn(1, open).cycleEnd, null);
  });

  it('[CPH7] no start before the time: no cycle', () => {
    assert.deepEqual(phaseOn(5, [start(10)]), { phase: null, basis: 'unknown', cycleDay: null, cycleStart: null, cycleEnd: null });
  });

  it('[CPH8] basis: predicted wins, confirmed only when all are confirmed, absent is unknown', () => {
    const c = { clientData: { hdsBasis: 'confirmed' } };
    const p = { clientData: { hdsBasis: 'predicted' } };
    assert.equal(phaseOn(16, [start(1), ovulation(15, c)]).basis, 'confirmed');
    assert.equal(phaseOn(16, [start(1), ovulation(15, p)]).basis, 'predicted');
    assert.equal(phaseOn(16, [start(1), ovulation(15)]).basis, 'unknown');
    // follicular rests on the period end and the first fertile day
    assert.equal(phaseOn(7, [start(1), periodEnd(5, c), window(10, 6, p)]).basis, 'predicted');
    assert.equal(phaseOn(7, [start(1), periodEnd(5, c), window(10, 6, c)]).basis, 'confirmed');
    assert.equal(phaseOn(7, [start(1), periodEnd(5), window(10, 6, c)]).basis, 'unknown');
  });

  it('[CPH9] boundaries: own cycle only, earliest kept, a period end at or after the first fertile day ignored', () => {
    // An ovulation in the previous cycle does not make this one luteal
    assert.equal(phaseOn(29, [start(1), ovulation(15), start(29)]).phase, 'menstrual');
    assert.equal(phaseOn(31, [start(1), ovulation(15), start(29)]).phase, null);
    // Two ovulations in one cycle: the earliest counts
    assert.equal(phaseOn(16, [start(1), ovulation(15), ovulation(18)]).phase, 'luteal');
    // A window spilling past the next start is clipped there
    assert.equal(phaseOn(29, [start(1), window(25, 6), start(29)]).phase, 'menstrual');
    // A period end on the first fertile day is ignored: days before the window have no phase
    assert.equal(phaseOn(4, [start(1), periodEnd(10), window(10, 6)]).phase, null);
  });

  it('[CPHA] ignores other streams, other types and trashed events', () => {
    const events = [start(1), periodEnd(5), ovulation(15, { trashed: true }), ev('fertility-cycles-ovulation', day(14), { type: 'note/txt' }), ev('other', day(14))];
    assert.equal(phaseOn(16, events).phase, null);
  });

  it('[CPHB] the same instants count in the given time zone', () => {
    // 2026-01-05 23:30Z: 6 Jan in Zurich, 5 Jan in New York
    const events = [ev('fertility-cycles-start', Date.parse('2026-01-05T23:30:00Z') / 1000)];
    const t = Date.parse('2026-01-06T12:00:00Z') / 1000;
    assert.equal(cyclePhaseAt(t, events, ZRH).cycleDay, 1);
    assert.equal(cyclePhaseAt(t, events, 'America/New_York').cycleDay, 2);
  });

  it('[CPHC] a boundary event counts in any of its streams', () => {
    const events = [start(1), periodEnd(5), { streamIds: ['other', 'fertility-cycles-ovulation'], type: 'activity/plain', time: day(15) }];
    assert.equal(phaseOn(16, events).phase, 'luteal');
  });

  it('[CPHD] an ovulation before the window: the days in between have no phase', () => {
    const events = [start(1), periodEnd(5), ovulation(12), window(14, 5)];
    assert.equal(phaseOn(10, events).phase, 'follicular');
    assert.equal(phaseOn(12, events).phase, 'fertile');
    assert.equal(phaseOn(13, events).phase, null);
    assert.equal(phaseOn(16, events).phase, 'fertile');
    assert.equal(phaseOn(20, events).phase, 'luteal');
  });
});
