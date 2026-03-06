const { assert } = require('./test-utils/deps-node');
const { durationToSeconds, durationToLabel, computeReminders } = require('../js/');

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
});
