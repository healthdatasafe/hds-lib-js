import { assert } from './test-utils/deps-node.js';
import { cyclePhaseAt, getHDSModel } from '../ts/index.ts';

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
  const bleeding = (n, flow = 0.55, extra = {}) => ({ streamIds: ['body-vulva-bleeding'], type: 'ratio/proportion', time: day(n, 8), content: flow, ...extra });
  const phases = (from, to, events) => Array.from({ length: to - from + 1 }, (_, i) => phaseOn(from + i, events).phase);

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
    assert.deepEqual(phaseOn(5, [start(10)]), { phase: null, basis: 'unknown', cycleDay: null, cycleStart: null, cycleEnd: null, predictedBy: [] });
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

  describe('[CPHP] period end from bleeding when no -period-end is recorded', () => {
    it('[CPHP0] the threshold anchors (Spotting 0.08, Very light 0.2) are the published bleeding options', async () => {
      const model = getHDSModel();
      await model.load('https://model.datasafe.dev/pack.json');
      const options = model.itemsDefs.forKey('body-vulva-bleeding').data.options;
      const value = (en) => options.find(o => o.label?.en === en)?.value;
      assert.equal(value('Spotting'), 0.08);
      assert.equal(value('Very light'), 0.2);
      // nothing between the two anchors: the midpoint threshold reads a value as the nearest one
      assert.equal(options.filter(o => o.value > 0.08 && o.value < 0.2).length, 0);
    });

    it('[CPHP10] spotting after the last real bleeding day does not extend the period', () => {
      const events = [start(1), bleeding(1, 0.75), bleeding(2, 0.35), bleeding(3, 0.08), bleeding(4, 0.08), window(10, 6)];
      assert.deepEqual(phases(1, 5, events), ['menstrual', 'menstrual', 'follicular', 'follicular', 'follicular']);
      // a device value nearer Spotting than Very light is spotting; nearer Very light counts
      assert.equal(phaseOn(3, [start(1), bleeding(1), bleeding(2), bleeding(3, 0.13), window(10, 6)]).phase, 'follicular');
      assert.equal(phaseOn(3, [start(1), bleeding(1), bleeding(2), bleeding(3, 0.16), window(10, 6)]).phase, 'menstrual');
    });

    it('[CPHP11] a spotting-only day 2 does not start the run either', () => {
      // no flow entry on day 1, spotting on day 2: no period end, as without bleeding
      const events = [start(1), bleeding(2, 0.08), bleeding(3, 0.55), window(10, 6)];
      assert.deepEqual(phases(1, 4, events), ['menstrual', null, null, null]);
      // spotting on both day 1 and day 2: the same
      assert.equal(phaseOn(3, [start(1), bleeding(1, 0.08), bleeding(2, 0.08), window(10, 6)]).phase, null);
      // real flow on day 1 then spotting on day 2: the period is day 1
      assert.equal(phaseOn(2, [start(1), bleeding(1, 0.55), bleeding(2, 0.08), window(10, 6)]).phase, 'follicular');
    });

    it('[CPHP1] the bleeding days in a row from the start are menstrual; follicular until the first fertile day', () => {
      const events = [start(1), bleeding(1, 0.75), bleeding(2, 0.55), bleeding(3, 0.35), bleeding(4, 0.2), window(10, 6)];
      assert.deepEqual(phases(1, 10, events), ['menstrual', 'menstrual', 'menstrual', 'menstrual', 'follicular', 'follicular', 'follicular', 'follicular', 'follicular', 'fertile']);
    });

    it('[CPHP2] the run may begin the day after the start (a start logged before the first flow entry)', () => {
      const events = [start(1), bleeding(2), bleeding(3), ovulation(14)];
      assert.deepEqual(phases(1, 5, events), ['menstrual', 'menstrual', 'menstrual', 'follicular', 'follicular']);
    });

    it('[CPHP3] a day without bleeding ends the run: no entry, or a None (0) entry', () => {
      const gap = [start(1), bleeding(1), bleeding(2), bleeding(4), window(10, 6)];
      assert.deepEqual(phases(2, 4, gap), ['menstrual', 'follicular', 'follicular']);
      const none = [start(1), bleeding(1), bleeding(2), bleeding(3, 0), bleeding(4), window(10, 6)];
      assert.deepEqual(phases(2, 4, none), ['menstrual', 'follicular', 'follicular']);
    });

    it('[CPHP4] no bleeding on the start day or the day after: no period end, as before', () => {
      const events = [start(1), bleeding(3), bleeding(4), window(10, 6)];
      assert.deepEqual(phases(1, 4, events), ['menstrual', null, null, null]);
      // the start alone still decides nothing past day 1 (CPH2)
      assert.equal(phaseOn(3, [start(1), window(10, 6)]).phase, null);
    });

    it('[CPHP5] a recorded period end wins over the bleeding days', () => {
      const events = [start(1), periodEnd(3), bleeding(1), bleeding(2), bleeding(3), bleeding(4), bleeding(5), window(10, 6)];
      assert.deepEqual(phases(3, 5, events), ['menstrual', 'follicular', 'follicular']);
    });

    it('[CPHP6] a run reaching the first fertile day is ignored, as a period end there would be', () => {
      const events = [start(1), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => bleeding(n)), window(10, 6)];
      assert.equal(phaseOn(5, events).phase, null);
      assert.equal(phaseOn(10, events).phase, 'fertile');
    });

    it('[CPHP7] only this cycle\'s bleeding counts; the run stops at the next start', () => {
      const prev = [start(1), ...[25, 26, 27, 28, 29, 30, 31].map(n => bleeding(n)), start(29), ovulation(43)];
      // the bleeding before day 29 is the previous cycle's; from 29 the run is 29-31
      assert.deepEqual(phases(31, 33, prev), ['menstrual', 'follicular', 'follicular']);
      // in the first cycle, bleeding late in the cycle is no period: no period end, no phase
      assert.equal(phaseOn(27, prev).phase, null);
    });

    it('[CPHP8] trashed bleeding, another stream or type, a non-numeric content do not count', () => {
      const events = [start(1), bleeding(1), bleeding(2, 0.55, { trashed: true }), window(10, 6)];
      assert.equal(phaseOn(2, events).phase, 'follicular');
      const other = [start(1), bleeding(2, 0.55, { streamIds: ['body-vulva-bleeding-clots'] }), bleeding(1, 0.55, { type: 'activity/plain' }), window(10, 6)];
      assert.equal(phaseOn(3, other).phase, null);
      assert.equal(phaseOn(3, [start(1), bleeding(1, 'heavy'), window(10, 6)]).phase, null);
    });

    it('[CPHP9] bleeding does not enter the basis: it rests on the start (and the first fertile day)', () => {
      const c = { clientData: { hdsBasis: 'confirmed' } };
      const events = [start(1, c), bleeding(1), bleeding(2), bleeding(3), window(10, 6, c)];
      assert.equal(phaseOn(3, events).basis, 'confirmed');
      assert.equal(phaseOn(6, events).basis, 'confirmed');
      assert.equal(phaseOn(6, [start(1), bleeding(1), bleeding(2), window(10, 6, c)]).basis, 'unknown');
    });
  });

  describe('[CPHQ] predictedBy: who predicted the boundaries a phase rests on', () => {
    const p = (createdBy) => ({ createdBy, clientData: { hdsBasis: 'predicted' } });
    const c = (createdBy) => ({ createdBy, clientData: { hdsBasis: 'confirmed' } });

    it('[CPHQ1] the createdBy of a predicted boundary; empty when not predicted', () => {
      assert.deepEqual(phaseOn(12, [start(1), window(10, 6, p('acc-mira'))]).predictedBy, ['acc-mira']);
      assert.deepEqual(phaseOn(12, [start(1), window(10, 6, c('acc-mira'))]).predictedBy, []);
      assert.deepEqual(phaseOn(12, [start(1), window(10, 6, { createdBy: 'acc-mira' })]).predictedBy, []);
    });

    it('[CPHQ2] every predicting access, once, only the predicted ones', () => {
      const events = [start(1), periodEnd(5, p('acc-a')), window(10, 6, p('acc-b')), ovulation(15, p('acc-b'))];
      const r = phaseOn(7, events);
      assert.equal(r.basis, 'predicted');
      assert.deepEqual(r.predictedBy, ['acc-a', 'acc-b']);
      assert.deepEqual(phaseOn(7, [start(1), periodEnd(5, c('acc-a')), window(10, 6, p('acc-b'))]).predictedBy, ['acc-b']);
    });

    it('[CPHQ3] a predicted boundary without createdBy: predicted, nobody named', () => {
      const r = phaseOn(16, [start(1), ovulation(15, { clientData: { hdsBasis: 'predicted' } })]);
      assert.equal(r.basis, 'predicted');
      assert.deepEqual(r.predictedBy, []);
    });

    it('[CPHQ4] no phase: empty', () => {
      assert.deepEqual(phaseOn(3, [start(1), window(10, 6, p('acc-mira'))]).predictedBy, []);
    });
  });

  it('[CPHR] the boundaries decide on a day with no entry; other entries that day change nothing', () => {
    // nothing is logged on days 6-9 or 17-28 of the full cycle: the phases still follow from the boundaries
    assert.deepEqual(phases(6, 9, full), ['follicular', 'follicular', 'follicular', 'follicular']);
    assert.deepEqual(phases(17, 28, full), Array(12).fill('luteal'));
    const withEntries = [...full, { streamIds: ['body-vulva-mucus-inspect'], type: 'vulva-mucus-inspect/v1', time: day(20), content: {} }, bleeding(20, 0)];
    assert.equal(phaseOn(20, withEntries).phase, 'luteal');
  });
});
