import { assert } from './test-utils/deps-node.js';
import { shiftOf, shiftInCycle, coverlinesOf, temperatureRuleOf, isManualTemperatureRule, TEMPERATURE_RULES, EuclidianDistanceEngine } from '../ts/index.ts';

// Coverline and temperature shift by the method's rule (data-model 3.24.0 temperatureRule; model-cervical-fluid
// references/rules/coverline-rules.json, version 2026-10-28)
describe('[TSHX] temperatureShift', () => {
  const ZRH = 'Europe/Zurich';
  const DAY = 86400;
  // 2026-09-01 07:00 Zurich (CEST, UTC+2) = day 1 of the cycle below
  const D1 = Date.parse('2026-09-01T05:00:00Z') / 1000;
  const day = (n, hour = 7) => D1 + (n - 1) * DAY + (hour - 7) * 3600;
  const { sensiplan, manual } = TEMPERATURE_RULES;
  const tcoyf = TEMPERATURE_RULES['sympto-thermal'];
  // six low temperatures (highest 36.5), then the rise
  const lows = [36.4, 36.5, 36.3, 36.4, 36.45, 36.35];
  const series = (source, values, from = 1) => ({ source, points: values.map((value, i) => ({ time: day(from + i), value })) });
  const start = (n, extra = {}) => ({ streamIds: ['fertility-cycles-start'], type: 'activity/plain', time: day(n, 10), ...extra });
  const coverline = (n, value, basis, extra = {}) => {
    const clientData = basis != null ? { clientData: { hdsBasis: basis } } : {};
    return { streamIds: ['fertility-cycles-coverline'], type: 'temperature/c', time: day(n, 0), content: value, ...clientData, ...extra };
  };
  const disturbance = (n, extra = {}) => ({ streamIds: ['body-temperature-basal-disturbance'], type: 'temperature/disturbance-v1', time: day(n), content: 'illness-fever', ...extra });
  const RULES = { sensiplan, 'sympto-thermal': tcoyf };

  // coverline-rules.json `examples` (version 2026-10-28), the prototype's coverline.test.ts cases as data
  const CASES = [
    { method: 'sensiplan', after: [36.6, 36.65, 36.75], highestLow: 36.5, line: 36.5, note: 'the 3rd 0.2 °C above the line' },
    { method: 'sensiplan', after: [36.6, 36.62, 36.65], highestLow: null, note: 'the 3rd too low, no 4th yet' },
    { method: 'sensiplan', after: [36.6, 36.62, 36.65, 36.6], highestLow: 36.5, line: 36.5, note: 'first exception: a 4th above the line' },
    { method: 'sensiplan', after: [36.6, 36.5, 36.65, 36.75], highestLow: 36.5, line: 36.5, note: 'second exception: the 2nd on the line left out, the next counts' },
    { method: 'sensiplan', after: [36.6, 36.5, 36.65, 36.6], highestLow: null, note: 'the one counted instead is not 0.2 °C above the line' },
    { method: 'sensiplan', after: [36.6, 36.5, 36.65, 36.6, 36.7], highestLow: null, note: 'the two exceptions are never combined' },
    { method: 'sensiplan', after: [36.6, 36.5, 36.45, 36.75], highestLow: null, note: 'two temperatures on or under the line break the series' },
    { method: 'sensiplan', after: [36.6, 36.5, 36.45, 36.4], highestLow: null, note: 'a temperature on or under the line breaks the series' },
    { method: 'sympto-thermal', after: [36.6, 36.65, 36.7], highestLow: 36.5, line: 36.55, note: 'first high 0.1 °C above the 6 lows, the 3rd 0.15 °C above the line' },
    { method: 'sympto-thermal', after: [36.55, 36.65, 36.7], highestLow: null, note: 'a first rise of only 0.05 °C does not start the count' },
    { method: 'sympto-thermal', after: [36.6, 36.65, 36.65], highestLow: null, note: 'the 3rd under 0.15 °C above the line, no 4th yet' },
    { method: 'sympto-thermal', after: [36.6, 36.65, 36.65, 36.6], highestLow: 36.5, line: 36.55, note: 'a 4th above the line' },
    { method: 'sympto-thermal', after: [36.6, 36.5, 36.75, 36.8], highestLow: null, note: 'a temperature on or under the line breaks the series' }
  ];

  describe('[TSHC] coverline-rules.json examples', () => {
    CASES.forEach((c, k) => {
      it(`[TSHC${k + 1}] ${c.method}: ${c.note}`, () => {
        const shift = shiftOf([...lows, ...c.after], RULES[c.method]);
        assert.equal(shift?.low ?? null, c.highestLow);
        if (c.line != null) assert.equal(shift.line, c.line);
      });
    });
  });

  describe('[TSHR] one rule at a time', () => {
    it('[TSHR1] Sensiplan: the line on the highest of 6 lows, 3 highs, the 3rd 0.2 °C above it', () => {
      assert.deepEqual(shiftOf([...lows, 36.6, 36.65, 36.75], sensiplan), { low: 36.5, line: 36.5, first: 6, confirmed: 8, highs: [6, 7, 8] });
      // any higher temperature starts the count (no minimum first rise)
      assert.equal(shiftOf([...lows, 36.51, 36.6, 36.7], sensiplan)?.first, 6);
      // a temperature equal to the highest low is not high
      assert.equal(shiftOf([...lows, 36.5, 36.6, 36.7], sensiplan), null);
    });

    it('[TSHR2] Sensiplan, first exception: the 3rd not 0.2 °C above, a 4th above the line confirms', () => {
      assert.equal(shiftOf([...lows, 36.6, 36.62, 36.65], sensiplan), null);
      assert.deepEqual(shiftOf([...lows, 36.6, 36.62, 36.65, 36.55], sensiplan), { low: 36.5, line: 36.5, first: 6, confirmed: 9, highs: [6, 7, 8, 9] });
      // the 4th on the line does not
      assert.equal(shiftOf([...lows, 36.6, 36.62, 36.65, 36.5], sensiplan), null);
    });

    it('[TSHR3] Sensiplan, second exception: the 2nd or 3rd on or under the line is left out, the next counts', () => {
      // the 2nd left out
      assert.deepEqual(shiftOf([...lows, 36.6, 36.5, 36.65, 36.75], sensiplan), { low: 36.5, line: 36.5, first: 6, confirmed: 9, highs: [6, 8, 9] });
      // the 3rd left out (under the line)
      assert.deepEqual(shiftOf([...lows, 36.6, 36.65, 36.4, 36.7], sensiplan), { low: 36.5, line: 36.5, first: 6, confirmed: 9, highs: [6, 7, 9] });
      // the one counted instead must itself be 0.2 °C above: no 4th day then (never combined with the first)
      assert.equal(shiftOf([...lows, 36.6, 36.5, 36.65, 36.6], sensiplan), null);
      assert.equal(shiftOf([...lows, 36.6, 36.5, 36.65, 36.6, 36.7], sensiplan), null);
      // two on or under the line: no exception
      assert.equal(shiftOf([...lows, 36.6, 36.5, 36.45, 36.75], sensiplan), null);
    });

    it('[TSHR4] sympto-thermal (STM / TCOYF): the line 0.05 °C above, first high 0.1 above the lows, 3rd 0.15 above the line', () => {
      assert.deepEqual(shiftOf([...lows, 36.6, 36.65, 36.7], tcoyf), { low: 36.5, line: 36.55, first: 6, confirmed: 8, highs: [6, 7, 8] });
      assert.equal(shiftOf([...lows, 36.55, 36.65, 36.7], tcoyf), null);
      // a 4th above the line when the 3rd is not high enough
      assert.deepEqual(shiftOf([...lows, 36.6, 36.65, 36.65, 36.6], tcoyf)?.highs, [6, 7, 8, 9]);
      // no second exception: what Sensiplan confirms by leaving the 2nd out, this rule does not
      assert.equal(shiftOf([...lows, 36.6, 36.5, 36.75, 36.8], tcoyf), null);
      assert.notEqual(shiftOf([...lows, 36.6, 36.5, 36.75, 36.8], sensiplan), null);
    });

    it('[TSHR5] manual (Justisse): no calculation', () => {
      assert.ok(isManualTemperatureRule(manual));
      assert.ok(!isManualTemperatureRule(sensiplan));
      assert.equal(shiftOf([...lows, 36.6, 36.65, 36.75, 36.8], manual), null);
      assert.equal(shiftInCycle([series('T', [...lows, 36.6, 36.65, 36.75])], day(1, 0), day(20, 0), manual), null);
    });

    it('[TSHR6] fewer than 6 lows, or the highs not all there yet: no shift', () => {
      // five lows before the rise: the 6 before 36.65 hold 36.6, and there are not 3 highs after it
      assert.equal(shiftOf([36.4, 36.5, 36.3, 36.4, 36.45, 36.6, 36.65, 36.75], sensiplan), null);
      assert.equal(shiftOf([36.4, 36.5, 36.6, 36.65, 36.75], sensiplan), null);
      assert.equal(shiftOf([...lows, 36.6, 36.65], sensiplan), null);
      assert.equal(shiftOf([], sensiplan), null);
    });
  });

  describe('[TSHM] the rule of a method', () => {
    it('[TSHM1] temperatureRuleOf reads the method definition', () => {
      assert.equal(temperatureRuleOf({ temperatureRule: 'sensiplan' }), sensiplan);
      assert.equal(temperatureRuleOf({ temperatureRule: 'sympto-thermal' }), tcoyf);
      assert.equal(temperatureRuleOf({ temperatureRule: 'manual' }), manual);
      assert.equal(temperatureRuleOf({ temperatureRule: 'none' }), null);
      assert.equal(temperatureRuleOf({}), null);
      assert.equal(temperatureRuleOf(undefined), null);
      assert.equal(temperatureRuleOf({ temperatureRule: 'a-future-rule' }), null);
      assert.equal(temperatureRuleOf({ temperatureRule: 'toString' }), null);
    });

    it('[TSHM2] the parameters are the method specification (coverline-rules.json 2026-10-28)', () => {
      assert.deepEqual({ ...tcoyf }, { lowCount: 6, offset: 0.05, firstRise: 0.1, highCount: 3, lastMin: 0.15, extraDay: true, dropOne: false });
      assert.deepEqual({ ...sensiplan }, { lowCount: 6, offset: 0, firstRise: 0, highCount: 3, lastMin: 0.2, extraDay: true, dropOne: true });
      assert.deepEqual({ ...manual }, { manual: true });
      assert.ok(Object.isFrozen(TEMPERATURE_RULES) && Object.isFrozen(sensiplan));
    });

    it('[TSHM3] every rule of the published cervical-fluid pack is known, per method', async () => {
      const res = await fetch('https://model.datasafe.dev/converters/cervical-fluid/pack-latest.json');
      const pack = await res.json();
      const engine = new EuclidianDistanceEngine(pack);
      for (const id of Object.keys(pack.temperatureRules)) assert.ok(id in TEMPERATURE_RULES, `unknown rule ${id}`);
      for (const m of pack.methods) {
        assert.ok(m.temperatureRule === 'none' || m.temperatureRule in pack.temperatureRules, `${m.methodId}: ${m.temperatureRule}`);
      }
      const ruleOf = (id) => temperatureRuleOf(engine.getMethodDef(id));
      assert.equal(ruleOf('sensiplan'), sensiplan);
      assert.equal(ruleOf('chartneo'), sensiplan);
      assert.equal(ruleOf('sympto-thermal'), tcoyf);
      assert.equal(ruleOf('justisse'), manual);
      assert.equal(ruleOf('billings'), null);
      assert.equal(ruleOf('marquette'), null);
      assert.ok(engine.temperatureRules.sensiplan.label.en.length > 0);
    });
  });

  describe('[TSHI] shiftInCycle', () => {
    it('[TSHI1] times of the first, confirming and counted high temperatures', () => {
      const r = shiftInCycle([series('Thermometer', [...lows, 36.6, 36.5, 36.65, 36.75])], day(1, 0), day(20, 0), sensiplan, { timeZone: ZRH });
      assert.deepEqual(r, { source: 'Thermometer', low: 36.5, line: 36.5, first: day(7), confirmed: day(10), highs: [day(7), day(9), day(10)] });
    });

    it('[TSHI2] one temperature a calendar day, the first; readings outside [from, to) left out', () => {
      const s = series('T', [...lows, 36.6, 36.65, 36.75]);
      // a later reading the same day (higher) does not count: the 3rd stays 36.75
      s.points.push({ time: day(9, 9), value: 36.4 });
      assert.equal(shiftInCycle([s], day(1, 0), day(20, 0), sensiplan, { timeZone: ZRH })?.confirmed, day(9));
      assert.equal(shiftInCycle([s], day(2, 0), day(20, 0), sensiplan, { timeZone: ZRH }), null);
    });

    it('[TSHI3] disturbed days are left out, from body-temperature-basal-disturbance events', () => {
      // a disturbed 39.0 °C among the lows
      const fever = series('T', [...lows.slice(0, 3), 39, ...lows.slice(3), 36.4, 36.6, 36.65, 36.75]);
      assert.equal(shiftInCycle([fever], day(1, 0), day(20, 0), sensiplan, { timeZone: ZRH }), null);
      assert.equal(shiftInCycle([fever], day(1, 0), day(20, 0), sensiplan, { timeZone: ZRH, events: [disturbance(4)] })?.line, 36.5);
      // trashed or another stream: not a disturbance
      assert.equal(shiftInCycle([fever], day(1, 0), day(20, 0), sensiplan, { timeZone: ZRH, events: [disturbance(4, { trashed: true })] }), null);
      assert.equal(shiftInCycle([fever], day(1, 0), day(20, 0), sensiplan, { timeZone: ZRH, events: [{ ...disturbance(4), streamIds: ['body-temperature-basal'] }] }), null);
    });

    it('[TSHI4] never mixes devices: the one with the most readings', () => {
      const ring = series('Ring', [36.9, 36.95, 36.8]);
      const thermometer = series('Thermometer', [...lows, 36.6, 36.65, 36.75]);
      assert.equal(shiftInCycle([ring, thermometer], day(1, 0), day(20, 0), sensiplan, { timeZone: ZRH })?.source, 'Thermometer');
      assert.equal(shiftInCycle([], day(1, 0), day(20, 0), sensiplan), null);
    });
  });

  describe('[TSHL] coverlinesOf', () => {
    const rise = series('Thermometer', [...lows, 36.6, 36.65, 36.75, 36.8]);

    it('[TSHL1] one line per cycle, by the rule', () => {
      const [c, ...rest] = coverlinesOf([rise], [start(1)], sensiplan, ZRH);
      assert.equal(rest.length, 0);
      assert.equal(c.value, 36.5);
      assert.equal(c.origin, 'computed');
      assert.equal(c.computed, 36.5);
      assert.equal(c.event, null);
      assert.equal(c.cycleStart, Date.parse('2026-08-31T22:00:00Z') / 1000);
      assert.equal(c.cycleEnd, null);
      assert.deepEqual(c.shift.highs, [day(7), day(8), day(9)]);
      assert.equal(coverlinesOf([rise], [start(1)], tcoyf, ZRH)[0].value, 36.55);
    });

    it('[TSHL2] the cycle bounds the temperatures; a cycle before its rise has no line', () => {
      const two = series('T', [...lows, 36.6, 36.65, 36.75, ...lows, 36.6]);
      const lines = coverlinesOf([two], [start(1), start(10)], sensiplan, ZRH);
      assert.equal(lines.length, 1);
      assert.equal(lines[0].cycleEnd, Date.parse('2026-09-09T22:00:00Z') / 1000);
      // without the second start, the same readings are one cycle
      assert.equal(coverlinesOf([two], [start(1)], sensiplan, ZRH).length, 1);
      assert.deepEqual(coverlinesOf([rise], [], sensiplan, ZRH), []);
    });

    it('[TSHL3] a manual coverline event wins over the rule', () => {
      const [c] = coverlinesOf([rise], [start(1), coverline(1, 36.6, 'manual')], sensiplan, ZRH);
      assert.equal(c.value, 36.6);
      assert.equal(c.origin, 'event');
      assert.equal(c.computed, 36.5);
      assert.equal(c.event.content, 36.6);
      // the counted highs stay the rule's
      assert.deepEqual(c.shift.highs, [day(7), day(8), day(9)]);
      // shown before the rise too
      const early = coverlinesOf([series('T', lows)], [start(1), coverline(1, 36.55, 'manual')], sensiplan, ZRH);
      assert.equal(early[0].value, 36.55);
      assert.equal(early[0].computed, null);
    });

    it('[TSHL4] a computing reader never shows a stored auto or unstated line', () => {
      assert.equal(coverlinesOf([rise], [start(1), coverline(1, 36.7, 'auto')], sensiplan, ZRH)[0].value, 36.5);
      assert.equal(coverlinesOf([rise], [start(1), coverline(1, 36.7)], sensiplan, ZRH)[0].origin, 'computed');
      assert.deepEqual(coverlinesOf([series('T', lows)], [start(1), coverline(1, 36.7, 'auto')], sensiplan, ZRH), []);
    });

    it('[TSHL5] the latest modified manual event of the cycle; trashed, other cycles and non-numbers ignored', () => {
      const events = [start(1), start(20),
        coverline(1, 36.6, 'manual', { modified: 10 }), coverline(2, 36.65, 'manual', { modified: 20 }),
        coverline(1, 36.9, 'manual', { modified: 30, trashed: true }), coverline(1, 'x', 'manual', { modified: 40 }),
        coverline(20, 36.3, 'manual')];
      const lines = coverlinesOf([rise], events, sensiplan, ZRH);
      assert.deepEqual(lines.map(c => c.value), [36.65, 36.3]);
      assert.equal(lines[1].computed, null);
    });

    it('[TSHL6] manual rule (Justisse): no line until one is drawn, then whichever event exists', () => {
      assert.deepEqual(coverlinesOf([rise], [start(1)], manual, ZRH), []);
      for (const basis of ['manual', 'auto', undefined]) {
        const [c] = coverlinesOf([rise], [start(1), coverline(1, 36.55, basis)], manual, ZRH);
        assert.equal(c.value, 36.55);
        assert.equal(c.origin, 'event');
        assert.equal(c.computed, null);
        assert.equal(c.shift, null);
      }
    });

    it('[TSHL7] a method without a coverline rule: none', () => {
      assert.deepEqual(coverlinesOf([rise], [start(1), coverline(1, 36.55, 'manual')], null, ZRH), []);
    });

    it('[TSHL8] disturbed days left out, from the same events', () => {
      const fever = series('T', [...lows.slice(0, 3), 39, ...lows.slice(3), 36.4, 36.6, 36.65, 36.75]);
      assert.equal(coverlinesOf([fever], [start(1), disturbance(4)], sensiplan, ZRH)[0].value, 36.5);
      assert.deepEqual(coverlinesOf([fever], [start(1)], sensiplan, ZRH), []);
    });

    it('[TSHL9] never mixes devices', () => {
      const ring = series('Ring', [36.9, 36.95, 36.8]);
      assert.equal(coverlinesOf([ring, rise], [start(1)], sensiplan, ZRH)[0].shift.source, 'Thermometer');
    });
  });
});
