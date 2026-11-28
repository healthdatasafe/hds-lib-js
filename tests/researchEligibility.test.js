import { assert } from './test-utils/deps-node.js';
import { HDSModel, researchEligibility as elig } from '../ts/index.ts';

/** Eligibility test of a study (data-model documentation/ELIGIBILITY.md). */

const NOW = Date.UTC(2026, 10, 25, 12) / 1000;
const DAY = 86400;
const t = (en) => ({ en, fr: 'fr ' + en });

function makeModel () {
  const item = (streamId, eventType, type) => ({ version: 'v1', label: t(streamId), description: t(streamId), streamId, eventType, type });
  const model = new HDSModel('');
  model.loadFromObject({
    items: {
      weight: {
        version: 'v1',
        label: t('weight'),
        description: t('weight'),
        streamId: 'weight',
        type: 'number',
        variations: { eventType: { options: [{ value: 'mass/kg', label: t('kg') }, { value: 'mass/lb', label: t('lb') }] } }
      },
      headache: item('headache', 'activity/plain', 'checkbox'),
      smoker: { ...item('smoker', 'lifestyle/use-status-v1', 'select'), options: ['never', 'former', 'current'].map((value) => ({ value, label: t(value) })) },
      'profile-sex': { ...item('profile-sex', 'attributes/biological-sex', 'select'), options: ['male', 'female', 'other'].map((value) => ({ value, label: t(value) })) },
      birth: item('birth', 'date/iso-8601', 'date'),
      variant: item('genetics-variant', 'genetic-variant/coded-v1', 'imported'),
      sync: item('sync', 'sync-status/connector-v1', 'system'),
      other: item('other', 'mass/kg', 'number'),
      'old-other': { ...item('other', 'mass/kg', 'number'), deprecated: true },
      lipid: {
        version: 'v1',
        label: t('lipid'),
        description: t('lipid'),
        streamId: 'lipid',
        type: 'number',
        variations: { eventType: { options: ['mg-dl', 'mmol-l', 'iu-l'].map((u) => ({ value: 'concentration/' + u, label: t(u) })) } },
        unitConversions: { factors: [{ from: 'concentration/mg-dl', to: 'concentration/mmol-l', factor: 0.02586 }] }
      }
    },
    streams: [
      ...['weight', 'headache', 'smoker', 'profile-sex', 'birth', 'sync', 'other', 'lipid'].map((id) => ({ id, name: id, parentId: null })),
      { id: 'headache-child', name: 'child', parentId: 'headache' },
      { id: 'genetics', name: 'Genetics', parentId: null, explicitGrantOnly: true },
      { id: 'genetics-variant', name: 'Variant', parentId: 'genetics' }
    ],
    eventTypes: {
      types: {
        'mass/kg': { type: 'number' },
        'mass/lb': { type: 'number' },
        'concentration/mg-dl': { type: 'number' },
        'concentration/mmol-l': { type: 'number' },
        'concentration/iu-l': { type: 'number' },
        'activity/plain': { type: 'null' },
        'lifestyle/use-status-v1': { type: 'string' },
        'attributes/biological-sex': { type: 'string' },
        'date/iso-8601': { type: 'string' },
        'genetic-variant/coded-v1': { type: 'object' },
        'sync-status/connector-v1': { type: 'object' }
      },
      extras: {}
    },
    conversions: { mass: { metric: 'kg', imperial: 'lb', factors: { kg: { lb: 2.20462 }, lb: { kg: 0.453592 } } } },
    datasources: [],
    authorizations: {}
  });
  return model;
}

const model = makeModel();

const criterion = (id, rule, more = {}) => ({ id, label: t(id), weight: 1, ...(rule ? { rule } : {}), ...more });
const request = (criteria, more = {}) => ({
  version: 1,
  requestId: 'req-1',
  studyId: 'study-1',
  studyName: t('XYZ'),
  title: t('Test if you\'re eligible for XYZ'),
  description: t('A study'),
  ethicsRef: 'CER-2026-1',
  expiresAt: NOW + 30 * DAY,
  criteria,
  ...more
});
const three = (rule) => request([criterion('a', rule), criterion('b', { op: 'exists', itemKey: 'headache' }), criterion('c', { op: 'exists', itemKey: 'smoker' })]);
const codes = (r) => elig.checkEligibilityRequest(r, { model, now: NOW }).map((i) => `${i.path} ${i.code}`);

/** A connection that records every call and only knows the given events. */
function fakeConnection (events = [], { known } = {}) {
  const calls = [];
  return {
    calls,
    events,
    async apiOne (method, params, key) {
      calls.push({ method, params });
      if (method === 'events.get') {
        const [streamId] = params.streams;
        if (known && !known.includes(streamId)) { const e = new Error('unknown'); e.innerObject = { id: 'unknown-referenced-resource' }; throw e; }
        const found = events
          .filter((e) => params.types.includes(e.type) && e.streamIds.some((s) => s === streamId || s.startsWith(streamId + '-')))
          .sort((a, b) => b.time - a.time);
        return found.slice(params.skip, params.skip + params.limit);
      }
      if (method === 'events.create') { const e = { id: 'new' + events.length, ...params }; events.push(e); return e; }
      if (method === 'events.update') { const e = events.find((x) => x.id === params.id); Object.assign(e, params.update); return e; }
      throw new Error('unexpected ' + method);
    }
  };
}
const ev = (streamId, type, content, daysAgo = 1, more = {}) => ({ id: streamId + daysAgo, streamIds: [streamId], type, content, time: NOW - daysAgo * DAY, ...more });
const outcomeOf = async (rule, events) => (await elig.readEligibilityOutcomes(fakeConnection(events), three(rule), { model, now: NOW })).a;

describe('[ELIG] eligibility test of a study', function () {
  describe('[ELIG-P] publish check', function () {
    const ok = { op: 'exists', itemKey: 'weight' };

    it('[ELIG-P1] a valid request has no issue', () => {
      assert.deepEqual(codes(three(ok)), []);
    });

    it('[ELIG-P2] fewer than 3 criteria, and too many', () => {
      assert.ok(codes(request([criterion('a', ok), criterion('b', ok)])).includes('criteria too-few-criteria'));
      assert.ok(codes(request(Array.from({ length: 17 }, (_, i) => criterion('c' + i, ok)))).includes('criteria too-many-criteria'));
    });

    it('[ELIG-P3] unknown item, operator and field', () => {
      assert.ok(codes(three({ op: 'exists', itemKey: 'nope' })).includes('criteria[0].rule.itemKey unknown-item'));
      assert.ok(codes(three({ op: 'script', itemKey: 'weight' })).includes('criteria[0].rule.op unknown-operator'));
      assert.ok(codes(three({ op: 'toString', itemKey: 'weight' })).includes('criteria[0].rule.op unknown-operator'));
      assert.ok(codes(three({ ...ok, code: 'x' })).includes('criteria[0].rule.code unknown-field'));
    });

    it('[ELIG-P4] missing or invalid weights', () => {
      for (const weight of [undefined, 0, -1, 1.5, 101, '1', null]) {
        const r = three(ok);
        r.criteria[0].weight = weight;
        assert.ok(codes(r).includes('criteria[0].weight invalid-weight'), String(weight));
      }
    });

    it('[ELIG-P5] EN and FR are required on every text', () => {
      const r = three(ok);
      r.criteria[0].label = { en: 'only' };
      r.criteria[1].question = { text: { en: 'q', fr: 'q' }, answer: { type: 'choice', options: [{ value: 'x', label: { fr: 'x' } }, { value: 'y', label: t('y') }], met: ['x'] } };
      const c = codes(r);
      assert.ok(c.includes('criteria[0].label missing-text:fr'));
      assert.ok(c.includes('criteria[1].question.answer.options[0].label missing-text:en'));
    });

    it('[ELIG-P6] items not allowed: system, and roots granted by name only', () => {
      for (const item of ['sync', 'variant']) assert.ok(codes(three({ op: 'exists', itemKey: item })).includes('criteria[0].rule.itemKey item-not-allowed'), item);
    });

    it('[ELIG-P7] an operator that does not fit its item', () => {
      assert.ok(codes(three({ op: 'range', itemKey: 'weight', eventType: 'mass/st', min: 1 })).includes('criteria[0].rule.eventType not-a-type-of-the-item'));
      assert.ok(codes(three({ op: 'range', itemKey: 'weight', eventType: 'mass/kg' })).includes('criteria[0].rule missing-range'));
      assert.ok(codes(three({ op: 'range', itemKey: 'weight', eventType: 'mass/kg', min: 5, max: 1 })).includes('criteria[0].rule invalid-range'));
      assert.ok(codes(three({ op: 'in', itemKey: 'weight', values: ['x'] })).includes('criteria[0].rule.itemKey not-a-select-item'));
      for (const values of [undefined, [], ['nope'], ['never', 'never'], ['never', 'former', 'current']]) {
        assert.ok(codes(three({ op: 'in', itemKey: 'smoker', values })).includes('criteria[0].rule.values invalid-options'), String(values));
      }
      assert.ok(codes(three({ op: 'boolean', itemKey: 'headache', value: true })).includes('criteria[0].rule.op unknown-operator'));
      assert.ok(codes(three({ op: 'age', itemKey: 'weight', min: 18 })).includes('criteria[0].rule.itemKey not-a-date-item'));
    });

    it('[ELIG-P8] a question alone is allowed, neither rule nor question is not, free text is not', () => {
      const r = three(ok);
      r.criteria[0] = criterion('a', null, { question: { text: t('q'), answer: { type: 'boolean', met: true } } });
      assert.deepEqual(codes(r), []);
      r.criteria[0] = criterion('a', null);
      assert.ok(codes(r).includes('criteria[0] no-rule-and-no-question'));
      r.criteria[0] = criterion('a', null, { question: { text: t('q'), answer: { type: 'text' } } });
      assert.ok(codes(r).includes('criteria[0].question.answer.type unknown-answer-type'));
    });

    it('[ELIG-P9] expired, duplicate ids, ids with other characters', () => {
      const r = three(ok);
      r.expiresAt = NOW;
      r.criteria[1].id = 'a';
      r.requestId = 'a b';
      const c = codes(r);
      for (const x of ['expiresAt expired', 'criteria[1].id duplicate-id', 'requestId invalid-id']) assert.ok(c.includes(x), x);
    });

    it('[ELIG-P10] a weight of half or more of the total reveals its criterion, and is refused', () => {
      for (const good of [[1, 1, 1], [40, 30, 30], [40, 35, 25], [40, 20, 20, 20], [30, 30, 20, 20]]) assert.deepEqual(elig.revealedCriteria(good), [], String(good));
      for (const bad of [[90, 5, 5], [50, 25, 25], [50, 30, 20], [100, 1, 1]]) assert.deepEqual(elig.revealedCriteria(bad), [0], String(bad));
      const r = three(ok);
      r.criteria[0].weight = 2;
      assert.deepEqual(codes(r), ['criteria[0].weight weight-half-or-more']);
    });

    it('[ELIG-P12] a deprecated item is refused at publish only', () => {
      const r = three({ op: 'exists', itemKey: 'old-other' });
      assert.deepEqual(codes(r), []);
      assert.deepEqual(elig.checkEligibilityRequest(r, { model, now: NOW, publish: true }).map((i) => i.code), ['deprecated-item']);
    });

    it('[ELIG-P13] every text is a string, in any language', () => {
      const r = three(ok);
      r.title.de = 5;
      assert.ok(codes(r).includes('title text-not-a-string'));
    });

    it('[ELIG-P11] against a direct enumeration, for every weights up to 8 on 3 criteria and 5 on 4', () => {
      const combos = (n, max) => n === 0 ? [[]] : combos(n - 1, max).flatMap((c) => Array.from({ length: max }, (_, i) => [...c, i + 1]));
      for (const w of [...combos(3, 8), ...combos(4, 5)]) {
        const total = w.reduce((a, b) => a + b, 0);
        const groups = {};
        for (const c of combos(w.length, 2).map((x) => x.map((v) => v - 1))) {
          const band = elig.eligibilityBandOf(c.reduce((s, v, i) => s + v * w[i], 0), total);
          (groups[band] ??= []).push(c);
        }
        const expected = w.flatMap((_, i) => Object.values(groups).some((g) => new Set(g.map((c) => c[i])).size === 1) ? [i] : []);
        assert.deepEqual(elig.revealedCriteria(w), expected, String(w));
      }
    });
  });

  describe('[ELIG-R] rules', function () {
    it('[ELIG-R1] exists, with and without a window', async () => {
      assert.equal(await outcomeOf({ op: 'exists', itemKey: 'weight' }, []), 'no-data');
      assert.equal(await outcomeOf({ op: 'exists', itemKey: 'weight' }, [ev('weight', 'mass/kg', 70, 900)]), 'met');
      assert.equal(await outcomeOf({ op: 'exists', itemKey: 'weight', withinDays: 30 }, [ev('weight', 'mass/kg', 70, 900)]), 'not-met');
    });

    it('[ELIG-R2] a future event is not data', async () => {
      assert.equal(await outcomeOf({ op: 'exists', itemKey: 'weight' }, [ev('weight', 'mass/kg', 70, -2)]), 'no-data');
    });

    it('[ELIG-R3] range reads the latest value, converts units, ignores a type it cannot convert', async () => {
      const rule = { op: 'range', itemKey: 'weight', eventType: 'mass/kg', min: 60, max: 80 };
      assert.equal(await outcomeOf(rule, [ev('weight', 'mass/kg', 70, 1), ev('weight', 'mass/kg', 100, 2)]), 'met');
      assert.equal(await outcomeOf(rule, [ev('weight', 'mass/kg', 100, 1), ev('weight', 'mass/kg', 70, 2)]), 'not-met');
      assert.equal(await outcomeOf(rule, [ev('weight', 'mass/lb', 154, 1)]), 'met');
      assert.equal(await outcomeOf(rule, [ev('weight', 'mass/lb', 70, 1)]), 'not-met');
      assert.equal(await outcomeOf({ ...rule, withinDays: 30 }, [ev('weight', 'mass/kg', 70, 90)]), 'not-met');
    });

    it('[ELIG-R4] a printed limit is not an exact value', async () => {
      const rule = { op: 'range', itemKey: 'weight', eventType: 'mass/kg', min: 60 };
      assert.equal(await outcomeOf(rule, [ev('weight', 'mass/kg', 70, 1, { clientData: { hdsComparator: '<' } })]), 'no-data');
    });

    it('[ELIG-R5] count', async () => {
      const rule = { op: 'count', itemKey: 'headache', min: 2, withinDays: 30 };
      const one = ev('headache', 'activity/plain', null, 1);
      assert.equal(await outcomeOf(rule, []), 'no-data');
      assert.equal(await outcomeOf(rule, [one, ev('headache', 'activity/plain', null, 90)]), 'not-met');
      assert.equal(await outcomeOf(rule, [one, ev('headache-child', 'activity/plain', null, 2)]), 'met');
    });

    it('[ELIG-R6] in: the latest value is one of the list', async () => {
      const rule = { op: 'in', itemKey: 'smoker', values: ['never', 'former'] };
      const at = (content, daysAgo) => ev('smoker', 'lifestyle/use-status-v1', content, daysAgo);
      assert.equal(await outcomeOf(rule, [at('former', 1), at('current', 9)]), 'met');
      assert.equal(await outcomeOf(rule, [at('current', 1), at('never', 9)]), 'not-met');
      assert.equal(await outcomeOf({ ...rule, withinDays: 30 }, [at('never', 90)]), 'not-met');
      assert.equal(await outcomeOf(rule, [at('notSet', 1)]), 'no-data');
      assert.equal(await outcomeOf(rule, []), 'no-data');
    });

    it('[ELIG-R12] in on profile-sex: other is an option like the others (data-model 4.57.0)', async () => {
      const at = (content) => [ev('profile-sex', 'attributes/biological-sex', content)];
      assert.equal(await outcomeOf({ op: 'in', itemKey: 'profile-sex', values: ['female'] }, at('other')), 'not-met');
      const other = { op: 'in', itemKey: 'profile-sex', values: ['other'] };
      assert.deepEqual(codes(three(other)), []);
      assert.equal(await outcomeOf(other, at('other')), 'met');
      assert.equal(await outcomeOf(other, at('female')), 'not-met');
      assert.equal(await outcomeOf({ op: 'in', itemKey: 'profile-sex', values: ['female'] }, at('notSet')), 'no-data');
    });

    it('[ELIG-R7] age, around the birthday', async () => {
      const rule = { op: 'age', itemKey: 'birth', min: 18, max: 40 };
      assert.equal(await outcomeOf(rule, [ev('birth', 'date/iso-8601', '2008-11-25')]), 'met');
      assert.equal(await outcomeOf(rule, [ev('birth', 'date/iso-8601', '2008-11-26')]), 'not-met');
      assert.equal(await outcomeOf(rule, [ev('birth', 'date/iso-8601', '1986-11-25')]), 'met');
      assert.equal(await outcomeOf(rule, [ev('birth', 'date/iso-8601', '1985-11-25')]), 'not-met');
      for (const bad of ['1990', '1990-02-31', 'x']) assert.equal(await outcomeOf(rule, [ev('birth', 'date/iso-8601', bad)]), 'no-data', bad);
    });

    it('[ELIG-R8] partial dates: no claim beyond what is known; a span counts up to its end', async () => {
      const rule = { op: 'exists', itemKey: 'headache', withinDays: 30 };
      const at = (date, clientData, more = {}) => [{ id: 'x', streamIds: ['headache'], type: 'activity/plain', content: null, time: Date.parse(date + 'T12:00:00Z') / 1000, clientData, ...more }];
      assert.equal(await outcomeOf(rule, at('2026-01-01', { hdsTimePrecision: 'year' })), 'no-data');
      assert.equal(await outcomeOf(rule, at('2025-01-01', { hdsTimePrecision: 'year' })), 'not-met');
      assert.equal(await outcomeOf(rule, at('2026-10-01', { hdsTimePrecision: 'month' })), 'no-data');
      assert.equal(await outcomeOf(rule, at('2026-09-01', { hdsTimePrecision: 'month' })), 'not-met');
      assert.equal(await outcomeOf(rule, at('2026-11-24', { hdsTimePrecision: 'unknown' })), 'no-data');
      assert.equal(await outcomeOf(rule, at('2024-01-01', {}, { duration: null })), 'met');
      assert.equal(await outcomeOf(rule, at('2024-01-01', {}, { duration: 60 * DAY })), 'not-met');
      assert.equal(await outcomeOf({ op: 'exists', itemKey: 'headache' }, at('2026-11-24', { hdsTimePrecision: 'unknown' })), 'met');
    });

    it('[ELIG-R10] lab units: the factors of the item, both ways; no factor, no comparison', async () => {
      const rule = { op: 'range', itemKey: 'lipid', eventType: 'concentration/mg-dl', max: 200 };
      assert.equal(await outcomeOf(rule, [ev('lipid', 'concentration/mmol-l', 4.8)]), 'met');
      assert.equal(await outcomeOf(rule, [ev('lipid', 'concentration/mmol-l', 6)]), 'not-met');
      assert.equal(await outcomeOf({ ...rule, eventType: 'concentration/mmol-l', max: 5 }, [ev('lipid', 'concentration/mg-dl', 190)]), 'met');
      assert.equal(await outcomeOf(rule, [ev('lipid', 'concentration/iu-l', 1)]), 'no-data');
    });

    it('[ELIG-R11] a live request survives a renamed item', async () => {
      assert.equal(await outcomeOf({ op: 'exists', itemKey: 'old-other' }, [ev('other', 'mass/kg', 1)]), 'met');
    });

    it('[ELIG-R9] more than one page', async () => {
      const events = Array.from({ length: 450 }, (_, i) => ev('headache', 'activity/plain', null, i + 1));
      assert.equal(await outcomeOf({ op: 'count', itemKey: 'headache', min: 450 }, events), 'met');
      assert.equal(await outcomeOf({ op: 'count', itemKey: 'headache', min: 451 }, events), 'not-met');
    });
  });

  describe('[ELIG-D] what is read and written', function () {
    it('[ELIG-D1] only the items of the rules are read, and nothing is written', async () => {
      const c = fakeConnection([ev('other', 'mass/kg', 1)]);
      await elig.readEligibilityOutcomes(c, three({ op: 'exists', itemKey: 'weight' }), { model, now: NOW });
      assert.ok(c.calls.every((x) => x.method === 'events.get'));
      assert.deepEqual([...new Set(c.calls.flatMap((x) => x.params.streams))].sort(), ['headache', 'smoker', 'weight']);
      assert.deepEqual(elig.eligibilityItemKeys(three({ op: 'exists', itemKey: 'weight' })).sort(), ['headache', 'smoker', 'weight']);
    });

    it('[ELIG-D2] an expired or invalid request is refused before any read', async () => {
      for (const r of [three({ op: 'exists', itemKey: 'weight' }), three({ op: 'exists', itemKey: 'nope' })]) {
        const c = fakeConnection();
        if (r.criteria[0].rule.itemKey === 'weight') r.expiresAt = NOW - 1;
        await assert.rejects(() => elig.readEligibilityOutcomes(c, r, { model, now: NOW }));
        assert.equal(c.calls.length, 0);
      }
    });

    it('[ELIG-D3] a stream missing from the account is no data; any other error is thrown', async () => {
      const r = three({ op: 'exists', itemKey: 'weight' });
      const o = await elig.readEligibilityOutcomes(fakeConnection([], { known: ['smoker'] }), r, { model, now: NOW });
      assert.deepEqual(o, { a: 'no-data', b: 'no-data', c: 'no-data' });
      const broken = { apiOne: async () => { const e = new Error('no'); e.innerObject = { id: 'forbidden' }; throw e; } };
      await assert.rejects(() => elig.readEligibilityOutcomes(broken, r, { model, now: NOW }));
    });

    it('[ELIG-D4] only the request id and the band are written, and sending again replaces', async () => {
      const r = three({ op: 'exists', itemKey: 'weight' });
      const c = fakeConnection([]);
      const id = await elig.sendEligibilityBand(c, 'hds-research', r, '0-49', NOW);
      assert.equal(await elig.sendEligibilityBand(c, 'hds-research', r, '50-100', NOW), id);
      await elig.sendEligibilityBand(c, 'hds-research', { ...r, requestId: 'req-2' }, '0-49', NOW);
      assert.deepEqual(c.events.map((e) => [e.type, e.content]), [
        ['research/eligibility-band-v1', { requestId: 'req-1', band: '50-100' }],
        ['research/eligibility-band-v1', { requestId: 'req-2', band: '0-49' }]
      ]);
      await assert.rejects(() => elig.sendEligibilityBand(c, 'hds-research', { ...r, expiresAt: NOW }, '0-49', NOW));
      assert.throws(() => elig.eligibilityBandContent('req-1', '33'));
    });
  });

  describe('[ELIG-S] score, questions and answers', function () {
    const yes = { text: t('q'), answer: { type: 'boolean', met: true } };
    const r = request([
      criterion('a', { op: 'exists', itemKey: 'weight' }, { weight: 40, question: yes }),
      criterion('b', { op: 'exists', itemKey: 'headache' }, { weight: 30, question: yes }),
      criterion('c', { op: 'exists', itemKey: 'smoker' }, { weight: 30 })
    ]);

    it('[ELIG-S1] weights given by the requester, no data counts as not met', () => {
      const res = elig.eligibilityResult(r, { a: 'met', b: 'not-met', c: 'no-data' }, {}, NOW);
      assert.equal(res.score, 40);
      assert.equal(res.band, '0-49');
      assert.deepEqual(res.criteria.map((c) => [c.outcome, c.from, c.share]), [['met', 'account', 40], ['not-met', 'account', 30], ['no-data', null, 30]]);
    });

    it('[ELIG-S2] questions only where there is no data', () => {
      assert.deepEqual(elig.eligibilityQuestionsToAsk(r, { a: 'no-data', b: 'not-met', c: 'no-data' }).map((c) => c.id), ['a']);
    });

    it('[ELIG-S3] an answer fills no data, never overrules the account, and can be skipped', () => {
      const o = { a: 'no-data', b: 'not-met', c: 'no-data' };
      const res = elig.eligibilityResult(r, o, { a: true, b: true, c: true }, NOW);
      assert.deepEqual(res.criteria.map((c) => [c.outcome, c.from]), [['met', 'answer'], ['not-met', 'account'], ['no-data', null]]);
      assert.equal(elig.eligibilityResult(r, o, { a: null }, NOW).score, 0);
      assert.equal(elig.eligibilityResult(r, o, { a: false }, NOW).criteria[0].outcome, 'not-met');
    });

    it('[ELIG-S4] answer types', () => {
      const of = (answer, value) => elig.eligibilityResult(request([criterion('a', null, { question: { text: t('q'), answer } })]), {}, { a: value }, NOW).criteria[0].outcome;
      const num = { type: 'number', min: 2, max: 5 };
      assert.deepEqual([2, 5, 6, NaN, '3'].map((v) => of(num, v)), ['met', 'met', 'not-met', 'no-data', 'no-data']);
      const choice = { type: 'choice', options: [{ value: 'x', label: t('x') }, { value: 'y', label: t('y') }], met: ['x'] };
      assert.deepEqual(['x', 'y', 'z'].map((v) => of(choice, v)), ['met', 'not-met', 'no-data']);
      assert.deepEqual(['2026-11-20', '2026-01-01', '2027-01-01', 'x'].map((v) => of({ type: 'date', withinDays: 30 }, v)), ['met', 'not-met', 'no-data', 'no-data']);
      assert.deepEqual(['2000-01-01', '2020-01-01'].map((v) => of({ type: 'date', minYears: 18 }, v)), ['met', 'not-met']);
    });

    it('[ELIG-S6] ids that are names of Object.prototype', () => {
      const p = request(['constructor', 'toString', 'valueOf'].map((id) => criterion(id, null, { question: yes })));
      assert.deepEqual(codes(p), []);
      assert.equal(elig.eligibilityQuestionsToAsk(p, {}).length, 3);
      assert.ok(elig.eligibilityResult(p, {}, {}, NOW).criteria.every((c) => c.outcome === 'no-data' && c.from === null));
      p.criteria[0].id = '__proto__';
      assert.ok(codes(p).includes('criteria[0].id invalid-id'));
    });

    it('[ELIG-S5] the band and the shown score agree around 50', () => {
      assert.equal(elig.eligibilityBandOf(0, 100), '0-49');
      assert.equal(elig.eligibilityBandOf(499, 1000), '0-49');
      assert.equal(elig.eligibilityBandOf(50, 100), '50-100');
      assert.equal(elig.eligibilityBandOf(100, 100), '50-100');
      const near = request([criterion('a', null, { weight: 68, question: yes }), criterion('b', null, { weight: 69 }), criterion('c', null, { weight: 1 })]);
      const res = elig.eligibilityResult(near, {}, { a: true }, NOW); // 68 / 138 = 49.3
      assert.deepEqual([res.score, res.band], [49, '0-49']);
      near.criteria[1].weight = 68; near.criteria[2].weight = 1; // 68 / 137 = 49.6, not 50
      const up = elig.eligibilityResult(near, {}, { a: true }, NOW);
      assert.deepEqual([up.score, up.band], [49, '0-49']);
    });
  });
});
