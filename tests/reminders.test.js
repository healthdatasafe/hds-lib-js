import { assert } from './test-utils/deps-node.js';
import { durationToSeconds, durationToLabel, computeReminders, cycleDayAt } from '../ts/index.ts';
import { localDayNumber, startOfLocalDay } from '../ts/utils/calendarDay.ts';

describe('[REMX] Reminders', () => {
  // ============ Duration parser ============

  describe('[DURX] Duration parser', () => {
    it('[DUR1] P1D = 86400 seconds', () => {
      assert.equal(durationToSeconds('P1D'), 86400);
    });

    it('[DUR2] P1W = 604800 seconds', () => {
      assert.equal(durationToSeconds('P1W'), 604800);
    });

    it('[DUR3] P1M = 2592000 seconds (30 days)', () => {
      assert.equal(durationToSeconds('P1M'), 2592000);
    });

    it('[DUR4] P1Y = 31536000 seconds (365 days)', () => {
      assert.equal(durationToSeconds('P1Y'), 31536000);
    });

    it('[DUR5] P1Y6M = year + 6 months', () => {
      assert.equal(durationToSeconds('P1Y6M'), 31536000 + 6 * 2592000);
    });

    it('[DUR6] P21D = 21 days', () => {
      assert.equal(durationToSeconds('P21D'), 21 * 86400);
    });

    it('[DUR7] PT8H = 8 hours', () => {
      assert.equal(durationToSeconds('PT8H'), 8 * 3600);
    });

    it('[DUR8] invalid throws', () => {
      assert.throws(() => durationToSeconds('invalid'));
      assert.throws(() => durationToSeconds('P'));
      assert.throws(() => durationToSeconds(''));
    });

    it('[DUR9] durationToLabel readable', () => {
      assert.equal(durationToLabel(86400), '1 day');
      assert.equal(durationToLabel(7 * 86400), '1 week');
      assert.equal(durationToLabel(30 * 86400), '1 month');
      assert.equal(durationToLabel(2 * 86400), '2 days');
    });
  });

  // ============ computeReminders ============

  describe('[CRMX] computeReminders', () => {
    const DAY = 86400;
    const NOW = 1000000;

    // Helper to create a minimal itemDef-like object
    function makeItem (key, streamId, eventType, reminder) {
      return {
        key,
        eventTypes: [eventType],
        reminder: reminder || null,
        data: { streamId }
      };
    }

    // Helper to create a minimal event
    function makeEvent (streamId, type, time) {
      return { streamId, type, time };
    }

    /**
     * Twin-awareness (`B-2026-09-15-5`). A reminder must not fire for a concept
     * a bridge already reported at a lower fidelity — a presence event on the
     * same stream satisfies a graded item. `satisfyingEventTypes` is optional on
     * the itemDef-like input, so hand-built items keep the old strict behaviour.
     */
    function makeTwinItem (key, streamId, ownType, twinType, reminder) {
      return {
        key,
        eventTypes: [ownType],
        satisfyingEventTypes: [ownType, twinType],
        reminder: reminder || null,
        data: { streamId }
      };
    }

    // Assert on `lastEvent` / `lastEntry`, not on `status`: this `frequency`
    // config reports `due` either way, so a status assertion passes vacuously.
    // `lastEvent` is the value the fix actually changes, and the one completion
    // and the ribbon read.
    it('[CRM-TWIN1] a presence event is picked up as the graded item\'s last entry', () => {
      const items = [makeTwinItem('symptom-pain-headache-severity', 'symptom-pain-headache',
        'ratio/proportion', 'activity/plain', { frequency: 'P1D' })];
      const events = [makeEvent('symptom-pain-headache', 'activity/plain', NOW - 60)];
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result.length, 1);
      assert.equal(result[0].lastEntry, NOW - 60);
      assert.equal(result[0].lastEvent.type, 'activity/plain');
    });

    it('[CRM-TWIN2] without satisfyingEventTypes the old strict behaviour stands', () => {
      const items = [makeItem('symptom-pain-headache-severity', 'symptom-pain-headache',
        'ratio/proportion', { frequency: 'P1D' })];
      const events = [makeEvent('symptom-pain-headache', 'activity/plain', NOW - 60)];
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result.length, 1);
      assert.equal(result[0].lastEvent, undefined, 'a presence event must not satisfy a strict itemDef');
    });

    it('[CRM-TWIN3] the item\'s own type still wins when both are present', () => {
      const items = [makeTwinItem('symptom-pain-headache-severity', 'symptom-pain-headache',
        'ratio/proportion', 'activity/plain', { frequency: 'P1D' })];
      const events = [
        makeEvent('symptom-pain-headache', 'activity/plain', NOW - 600),
        makeEvent('symptom-pain-headache', 'ratio/proportion', NOW - 60)
      ];
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result[0].lastEvent.type, 'ratio/proportion', 'latest wins, regardless of fidelity');
    });

    it('[CRM1] no reminder config → not in results', () => {
      const items = [makeItem('body-height', 'body-height', 'length/m', null)];
      const result = computeReminders(items, [], {}, NOW);
      assert.equal(result.length, 0);
    });

    it('[CRM2] cooldown: within → cooldown', () => {
      const items = [makeItem('body-weight', 'body-weight', 'mass/kg', { cooldown: 'P1D', importance: 'may' })];
      const events = [makeEvent('body-weight', 'mass/kg', NOW - 3600)]; // 1 hour ago
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result.length, 1);
      assert.equal(result[0].status, 'cooldown');
      assert.equal(result[0].importance, 'may');
    });

    it('[CRM3] cooldown: past → due', () => {
      const items = [makeItem('body-weight', 'body-weight', 'mass/kg', { cooldown: 'P1D', importance: 'may' })];
      const events = [makeEvent('body-weight', 'mass/kg', NOW - 2 * DAY)]; // 2 days ago
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result[0].status, 'due');
    });

    it('[CRM4] cooldown: no events → due', () => {
      const items = [makeItem('body-weight', 'body-weight', 'mass/kg', { cooldown: 'P1D', importance: 'may' })];
      const result = computeReminders(items, [], {}, NOW);
      assert.equal(result[0].status, 'due');
    });

    it('[CRM5] expectedInterval: before min → ok', () => {
      const items = [makeItem('cycle', 's', 'activity/plain', {
        expectedInterval: { min: 'P21D', max: 'P35D' },
        cooldown: 'P10D',
        importance: 'should'
      })];
      const events = [makeEvent('s', 'activity/plain', NOW - 15 * DAY)]; // 15 days ago
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result[0].status, 'ok');
    });

    it('[CRM6] expectedInterval: between min and 90% max → upcoming', () => {
      const items = [makeItem('cycle', 's', 'activity/plain', {
        expectedInterval: { min: 'P21D', max: 'P35D' },
        importance: 'should'
      })];
      const events = [makeEvent('s', 'activity/plain', NOW - 25 * DAY)]; // 25 days ago
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result[0].status, 'upcoming');
    });

    it('[CRM7] expectedInterval: between 90% max and max → due', () => {
      const items = [makeItem('cycle', 's', 'activity/plain', {
        expectedInterval: { min: 'P21D', max: 'P35D' },
        importance: 'should'
      })];
      const events = [makeEvent('s', 'activity/plain', NOW - 33 * DAY)]; // 33 days ago (>31.5=90%*35)
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result[0].status, 'due');
    });

    it('[CRM8] expectedInterval: past max → overdue', () => {
      const items = [makeItem('cycle', 's', 'activity/plain', {
        expectedInterval: { min: 'P21D', max: 'P35D' },
        importance: 'should'
      })];
      const events = [makeEvent('s', 'activity/plain', NOW - 40 * DAY)]; // 40 days ago
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result[0].status, 'overdue');
    });

    it('[CRM9] expectedInterval: no events → due', () => {
      const items = [makeItem('cycle', 's', 'activity/plain', {
        expectedInterval: { min: 'P21D', max: 'P35D' },
        importance: 'should'
      })];
      const result = computeReminders(items, [], {}, NOW);
      assert.equal(result[0].status, 'due');
    });

    it('[CRMA] relativeTo: on target day → due', () => {
      const cycleItem = makeItem('cycle-start', 's', 'activity/plain', null);
      const lhItem = makeItem('lh', 'lh', 'concentration/mg-l', {
        relativeTo: 'cycle-start',
        relativeDays: [2, 3, 4],
        importance: 'must'
      });
      // Cycle started 2 days ago → today is day 3
      const events = [makeEvent('s', 'activity/plain', NOW - 2 * DAY)];
      const result = computeReminders([cycleItem, lhItem], events, {}, NOW);
      const lhResult = result.find(r => r.itemKey === 'lh');
      assert.equal(lhResult.status, 'due');
      assert.equal(lhResult.importance, 'must');
    });

    it('[CRMB] relativeTo: day before target → upcoming', () => {
      const cycleItem = makeItem('cycle-start', 's', 'activity/plain', null);
      const lhItem = makeItem('lh', 'lh', 'concentration/mg-l', {
        relativeTo: 'cycle-start',
        relativeDays: [2, 3, 4],
        importance: 'must'
      });
      // Cycle started 0 days ago → today is day 1 (day before first target day 2)
      const events = [makeEvent('s', 'activity/plain', NOW)];
      const result = computeReminders([cycleItem, lhItem], events, {}, NOW);
      const lhResult = result.find(r => r.itemKey === 'lh');
      assert.equal(lhResult.status, 'upcoming');
    });

    it('[CRMC] relativeTo: off day → ok', () => {
      const cycleItem = makeItem('cycle-start', 's', 'activity/plain', null);
      const lhItem = makeItem('lh', 'lh', 'concentration/mg-l', {
        relativeTo: 'cycle-start',
        relativeDays: [2, 3, 4],
        importance: 'must'
      });
      // Cycle started 10 days ago → today is day 11 (way past target)
      // But LH was entered during the target window
      const events = [
        makeEvent('s', 'activity/plain', NOW - 10 * DAY),
        makeEvent('lh', 'concentration/mg-l', NOW - 8 * DAY) // entered on day 3
      ];
      const result = computeReminders([cycleItem, lhItem], events, {}, NOW);
      const lhResult = result.find(r => r.itemKey === 'lh');
      assert.equal(lhResult.status, 'ok');
    });

    it('[CRMD] relativeTo: past window, never entered → overdue', () => {
      const cycleItem = makeItem('cycle-start', 's', 'activity/plain', null);
      const lhItem = makeItem('lh', 'lh', 'concentration/mg-l', {
        relativeTo: 'cycle-start',
        relativeDays: [2, 3, 4],
        importance: 'must'
      });
      // Cycle started 10 days ago, LH never entered
      const events = [makeEvent('s', 'activity/plain', NOW - 10 * DAY)];
      const result = computeReminders([cycleItem, lhItem], events, {}, NOW);
      const lhResult = result.find(r => r.itemKey === 'lh');
      assert.equal(lhResult.status, 'overdue');
    });

    it('[CRME] multi-source merge: importance escalation', () => {
      const items = [makeItem('body-weight', 'body-weight', 'mass/kg', { cooldown: 'P1D', importance: 'may' })];
      const overrides = {
        'body-weight': [{ origin: 'collector', collectorId: 'abc', reminder: { importance: 'should' } }]
      };
      const events = [makeEvent('body-weight', 'mass/kg', NOW - 2 * DAY)];
      const result = computeReminders(items, events, overrides, NOW);
      assert.equal(result[0].importance, 'should');
    });

    it('[CRMF] sorting: overdue before due before cooldown', () => {
      const items = [
        makeItem('a', 'a', 't', { cooldown: 'P1D', importance: 'may' }),
        makeItem('b', 'b', 't', { expectedInterval: { min: 'P1D', max: 'P2D' }, importance: 'should' }),
        makeItem('c', 'c', 't', { cooldown: 'P1D', importance: 'must' })
      ];
      const events = [
        makeEvent('a', 't', NOW - 3600), // within cooldown → cooldown
        makeEvent('b', 't', NOW - 5 * DAY), // past max → overdue
        makeEvent('c', 't', NOW - 2 * DAY) // past cooldown → due
      ];
      const result = computeReminders(items, events, {}, NOW);
      assert.equal(result[0].itemKey, 'b'); // overdue
      assert.equal(result[1].itemKey, 'c'); // due
      assert.equal(result[2].itemKey, 'a'); // cooldown
    });

    it('[CRMG] relativeTo: already entered today → cooldown', () => {
      const cycleItem = makeItem('cycle-start', 's', 'activity/plain', null);
      const lhItem = makeItem('lh', 'lh', 'concentration/mg-l', {
        relativeTo: 'cycle-start',
        relativeDays: [2, 3, 4],
        importance: 'must'
      });
      // Cycle started 2 days ago (day 3), LH entered 1 hour ago
      const events = [
        makeEvent('s', 'activity/plain', NOW - 2 * DAY),
        makeEvent('lh', 'concentration/mg-l', NOW - 3600)
      ];
      const result = computeReminders([cycleItem, lhItem], events, {}, NOW);
      const lhResult = result.find(r => r.itemKey === 'lh');
      assert.equal(lhResult.status, 'cooldown');
    });
  });

  // Cycle days are calendar days in the patient's time zone, not 24-hour steps (B-2026-10-15-3)
  describe('[CDAX] calendar cycle days', () => {
    const at = (iso) => Date.parse(iso) / 1000;
    const ZRH = 'Europe/Zurich';

    it('[CDA1] a start logged in the evening makes the next morning day 2', () => {
      // 21:00 and 08:00 Zurich (CET, UTC+1): 11 hours apart, but two calendar days
      assert.equal(cycleDayAt(at('2026-01-06T07:00:00Z'), at('2026-01-05T20:00:00Z'), ZRH), 2);
    });

    it('[CDA2] a DST change does not move the count', () => {
      // 2026-03-28 00:30 CET → 2026-04-02 00:15 CEST: 4 d 22 h 45 min, five calendar days later
      assert.equal(cycleDayAt(at('2026-04-01T22:15:00Z'), at('2026-03-27T23:30:00Z'), ZRH), 6);
    });

    it('[CDA3] the same instants count in the given time zone', () => {
      const start = at('2026-01-10T23:30:00Z');
      const now = at('2026-01-11T00:30:00Z');
      assert.equal(cycleDayAt(now, start, 'UTC'), 2);
      assert.equal(cycleDayAt(now, start, 'America/New_York'), 1);
    });

    it('[CDA4] startOfLocalDay is local midnight, also on a DST day', () => {
      assert.equal(startOfLocalDay(localDayNumber(at('2026-01-06T07:00:00Z'), ZRH), ZRH), at('2026-01-05T23:00:00Z'));
      assert.equal(startOfLocalDay(localDayNumber(at('2026-03-29T12:00:00Z'), ZRH), ZRH), at('2026-03-28T23:00:00Z'));
      assert.equal(startOfLocalDay(localDayNumber(at('2026-03-30T12:00:00Z'), ZRH), ZRH), at('2026-03-29T22:00:00Z'));
    });

    function lhSetup () {
      const cycleItem = { key: 'cycle-start', eventTypes: ['activity/plain'], reminder: null, data: { streamId: 's' } };
      const lhItem = {
        key: 'lh',
        eventTypes: ['concentration/mg-l'],
        reminder: { relativeTo: 'cycle-start', relativeDays: [3, 4], importance: 'must' },
        data: { streamId: 'lh' }
      };
      return [cycleItem, lhItem];
    }

    it('[CDA5] computeReminders: due on calendar day 3 after an evening start', () => {
      // Start 2026-01-05 21:00 Zurich; now 2026-01-07 08:00 is day 3 (only 35 h later)
      const events = [{ streamId: 's', type: 'activity/plain', time: at('2026-01-05T20:00:00Z') }];
      const lh = computeReminders(lhSetup(), events, {}, at('2026-01-07T07:00:00Z'), ZRH).find(r => r.itemKey === 'lh');
      assert.equal(lh.status, 'due');
      assert.equal(lh.dueDate, at('2026-01-06T23:00:00Z'));
    });

    it('[CDA6] computeReminders: an entry late yesterday does not count as today', () => {
      // Day 3 and 4 are targets; LH entered at 23:00 on day 3, now 08:00 on day 4 (9 h later)
      const events = [
        { streamId: 's', type: 'activity/plain', time: at('2026-01-05T08:00:00Z') },
        { streamId: 'lh', type: 'concentration/mg-l', time: at('2026-01-07T22:00:00Z') }
      ];
      const lh = computeReminders(lhSetup(), events, {}, at('2026-01-08T07:00:00Z'), ZRH).find(r => r.itemKey === 'lh');
      assert.equal(lh.status, 'due');
    });
  });
});
