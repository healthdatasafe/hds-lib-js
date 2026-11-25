/**
 * data-model 4.25.0, CONVERSATION.md § A value she already has (`basis: existing-value`), the self-contained
 * `hdsSourceAnchor.eventId`, and the comma in the profile match. Needs a model ≥ 4.25.0 (HDS_TEST_MODEL_BASE until it is
 * published).
 */
import { assert } from './test-utils/deps-node.js';
import { cmcConversation as cv } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

const MODEL_BASE = globalThis.process?.env?.HDS_TEST_MODEL_BASE ?? 'https://model.datasafe.dev';
const COLLECTORS = ':_cmc:apps:hds-patient:collectors:reader--api-x';
const CHANNEL = [{ streamId: ':_cmc:inbox', level: 'create-only' }, { streamId: COLLECTORS, level: 'contribute' }];
const ENGINES = cv.vouchedEnginesFor('hds-bridge-reader');
const DOC = 'ckdoc0000001';
const D = 1773316800; // 2026-03-12T12:00:00Z
const DAY0 = Date.parse('2026-03-12T00:00:00Z') / 1000;
const H = 3600;

function apiError (id) { const e = new Error(id); e.innerObject = { id }; return e; }

/** Her account in memory (the calls these helpers make). */
function account () {
  const state = { streams: [], events: new Map(), grant: null, n: 0, clock: 1000 };
  const tick = () => ++state.clock;
  state.accessInfo = async () => ({ type: 'personal' });
  state.apiOne = async function (method, params, key) {
    const out = (k, v) => key ? v : { [k]: v };
    switch (method) {
      case 'streams.get':
        if (params.parentId && !state.streams.find(s => s.id === params.parentId)) throw apiError('unknown-referenced-resource');
        return out('streams', state.streams.filter(s => s.parentId === (params.parentId ?? null)));
      case 'streams.create': {
        if (state.streams.find(s => s.id === params.id)) throw apiError('item-already-exists');
        state.streams.push({ parentId: null, ...params });
        return out('stream', params);
      }
      case 'events.create': {
        const now = tick();
        const e = { id: 'ev-' + (++state.n), time: now, ...structuredClone(params), created: now, modified: now };
        state.events.set(e.id, e);
        return out('event', structuredClone(e));
      }
      case 'events.getOne': {
        const e = state.events.get(params.id);
        if (!e) throw apiError('unknown-resource');
        if (e.type === 'consent/scope-update-cmc' && e.content.applied == null) {
          e.content = { ...e.content, applied: true, status: 'completed' };
          state.grant = e.content.newPermissions;
        }
        return out('event', structuredClone(e));
      }
      case 'events.update': {
        const e = state.events.get(params.id);
        Object.assign(e, structuredClone(params.update), { modified: tick() });
        return out('event', structuredClone(e));
      }
      case 'events.get':
        return out('events', [...state.events.values()]
          .filter(e => params.state === 'all' || !e.trashed)
          .filter(e => e.streamIds.some(id => params.streams.includes(id)))
          .filter(e => !params.types || params.types.includes(e.type))
          .filter(e => params.fromTime == null || e.time >= params.fromTime)
          .filter(e => params.toTime == null || e.time <= params.toTime)
          .map(e => structuredClone(e)).slice(params.skip ?? 0, (params.skip ?? 0) + (params.limit ?? Infinity)));
      case 'accesses.get':
        return out('accesses', []);
      default:
        throw new Error('unexpected ' + method);
    }
  };
  return state;
}

const extraction = { engine: 'hds-reader', engineVersion: '0.3.0', kbVersion: '0.4.0', backend: 'text-layer' };
const ferritin = (candidateId, content = 48, over = {}) => ({
  kind: 'proposed-value',
  about: DOC,
  candidateId,
  printed: { label: 'Ferritine', value: String(content), unit: 'µg/l' },
  anchor: { attachmentId: 'att1', page: 1, bbox: [8.5, 41.2, 83, 2.1] },
  proposal: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content, time: D, clientData: { hdsTimePrecision: 'day' } },
  status: 'clear',
  extraction,
  ...over
});
const streamOf = (itemKey) => getModel().itemsDefs.forKey(itemKey).data.streamId;

async function setup (values) {
  const person = account();
  const r = { accessId: 'acc-1:2', localCollectorStreamId: COLLECTORS, grantedPermissions: [{ streamId: 'body-weight', level: 'read' }, ...CHANNEL] };
  await cv.ensureConversationStreams(person, r);
  const streams = cv.conversationStreamsOf(person.grant);
  const rel = { ...r, grantedPermissions: person.grant.concat(CHANNEL) };
  if (values.length > 0) await cv.writeProposedValues(person, streams, DOC, values);
  const her = (itemKey, type, content, time, clientData = { hdsTimePrecision: 'day' }) =>
    person.apiOne('events.create', { streamIds: [streamOf(itemKey)], type, content, time, clientData }, 'event');
  const conv = async () => cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
  return { person, rel, streams, her, conv };
}

describe('[CNVX] a value she already has (basis existing-value), the self-contained anchor', function () {
  before(async function () {
    this.timeout(20000);
    await getModel().load(`${MODEL_BASE}/pack.json`);
  });

  it('[CNVX1] the same value on the same day: answered duplicate without a tap, still addable; a different value stays open', async () => {
    const { person, rel, her, conv } = await setup([ferritin('c1', 48), ferritin('c2', 84)]);
    await her('body-blood-serum-ferritin', 'concentration/ug-l', 48, D);
    const res = await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES });
    assert.deepStrictEqual(res?.candidateIds, ['c1']);
    const c = await conv();
    assert.deepStrictEqual(c.proposedValues.map(p => [p.candidateId, p.state, p.answer?.content.basis ?? null]), [['c1', 'duplicate', 'existing-value'], ['c2', 'open', null]]);
    assert.strictEqual(cv.proposalRefusal(c.proposedValues[0], ENGINES), null, 'add anyway');
    assert.strictEqual(await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES }), null, 'nothing more to match');
    // she adds it anyway: a later confirm writes it and settles it for good
    const added = await cv.acceptProposedValues(person, rel, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
    assert.deepStrictEqual(added.refused, []);
    assert.strictEqual((await conv()).proposedValues[0].state, 'confirmed');
  });

  it('[CNVX2] not while is-this-yours is open; never for a proposal she could not confirm', async () => {
    const { person, rel, her, streams } = await setup([ferritin('c1', 48), ferritin('c2', 48, { extraction: { ...extraction, engine: 'other-engine' } })]);
    await her('body-blood-serum-ferritin', 'concentration/ug-l', 48, D);
    await her('body-blood-serum-ferritin', 'concentration/ug-l', 48, D);
    await cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'is-this-yours' });
    assert.strictEqual(await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES }), null);
    const other = await setup([ferritin('c2', 48, { extraction: { ...extraction, engine: 'other-engine' } })]);
    await other.her('body-blood-serum-ferritin', 'concentration/ug-l', 48, D);
    assert.strictEqual(await cv.autoMarkDuplicates(other.person, other.rel, { about: DOC, engines: ENGINES }), null, 'engine not vouched');
  });

  it('[CNVX3] one for one: two equal draws of one day against one value; a value written from this document never counts', async () => {
    const { person, rel, her } = await setup([ferritin('c1', 48), ferritin('c3', 48, { printed: { label: 'Ferritine', value: '48', unit: 'µg/l' } })]);
    await her('body-blood-serum-ferritin', 'concentration/ug-l', 48, D, { hdsTimePrecision: 'day', sourceKey: `hds-reader:document:${DOC}:c9` });
    assert.strictEqual(await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES }), null, 'its own document');
    await her('body-blood-serum-ferritin', 'concentration/ug-l', 48, DAY0 + 8 * H, {});
    assert.deepStrictEqual((await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES }))?.candidateIds, ['c1']);
    // a later run: c1 keeps its event, c3 has none left
    assert.strictEqual(await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES }), null);
  });

  it('[CNVX4] the day: day precision on the UTC day; an exact time while day D runs somewhere, or in its own zone; month never', () => {
    const at = (time, clientData) => ({ time, clientData });
    assert.ok(cv.onComparedDay(at(D, { hdsTimePrecision: 'day' }), '2026-03-12'));
    assert.ok(!cv.onComparedDay(at(D + 24 * H, { hdsTimePrecision: 'day' }), '2026-03-12'));
    assert.ok(cv.onComparedDay(at(DAY0 - 14 * H, {}), '2026-03-12'), 'D 00:00 − 14 h');
    assert.ok(!cv.onComparedDay(at(DAY0 - 14 * H - 1, {}), '2026-03-12'));
    assert.ok(cv.onComparedDay(at(DAY0 + 36 * H - 1, {}), '2026-03-12'));
    assert.ok(!cv.onComparedDay(at(DAY0 + 36 * H, {}), '2026-03-12'), 'D+1 00:00 + 12 h excluded');
    assert.ok(cv.onComparedDay(at(DAY0 - 0.5 * H, { hdsTimeZone: 'Europe/Zurich' }), '2026-03-12'), '23:30 UTC on the 11th is the 12th in Zurich');
    assert.ok(!cv.onComparedDay(at(DAY0 - 2 * H, { hdsTimeZone: 'Europe/Zurich' }), '2026-03-12'), '22:00 UTC is still the 11th there');
    assert.ok(!cv.onComparedDay(at(DAY0 + 23.5 * H, { hdsTimeZone: 'Europe/Zurich' }), '2026-03-12'));
    assert.ok(!cv.onComparedDay(at(D, { hdsTimePrecision: 'month' }), '2026-03-12'));
  });

  it('[CNVX5] the value: same type to 12 digits with its comparator; another type converted within the printed digit; coded by system and code', () => {
    const item = (content) => ({ content });
    assert.ok(cv.holdsProposedValue({ type: 'concentration/ug-l', content: 48.0000000000001 }, item(ferritin('c', 48))));
    assert.ok(!cv.holdsProposedValue({ type: 'concentration/ug-l', content: 48, clientData: { hdsComparator: '<' } }, item(ferritin('c', 48))));
    const weight = { ...ferritin('w', 70.5), printed: { label: 'Poids', value: '70,5', unit: 'kg' }, proposal: { itemKey: 'body-weight', type: 'mass/kg', content: 70.5, time: D, clientData: { hdsTimePrecision: 'day' } } };
    assert.ok(cv.holdsProposedValue({ type: 'mass/lb', content: 155.43 }, item(weight)), '155.43 lb is 70.5 kg');
    assert.ok(!cv.holdsProposedValue({ type: 'mass/lb', content: 156 }, item(weight)));
    assert.ok(!cv.holdsProposedValue({ type: 'mass/lb', content: 155.43 }, item({ ...weight, printed: { ...weight.printed, value: '< 71' } })), 'a limit never across types');
    const coded = (codes, value) => ({ analyte: { label: { en: 'X' }, codes }, value, unit: 'mmol/L' });
    const codedPv = { ...ferritin('k'), proposal: { itemKey: 'body-blood-coded', type: 'lab-result/coded-v1', content: coded([{ system: 'http://loinc.org', code: '2947-0' }], 140), time: D, clientData: { hdsTimePrecision: 'day' } } };
    assert.ok(cv.holdsProposedValue({ type: 'lab-result/coded-v1', content: coded([{ system: 'http://loinc.org', code: '2947-0' }], 140) }, item(codedPv)));
    assert.ok(!cv.holdsProposedValue({ type: 'lab-result/coded-v1', content: coded([{ system: 'http://loinc.org', code: '2951-2' }], 140) }, item(codedPv)));
  });

  it('[CNVX5b] a convertible value (Creighton): method, reading and annotations; vectors, versions and key order do not count', async () => {
    const TYPE = 'vulva-mucus-inspect/9d-vector';
    const KEY = 'body-vulva-mucus-inspect';
    const at = (source, vectors = { threadiness: 1, wetness: 1 }) => ({ vectors, source: { key: 'creighton', sourceData: '10KL', engineVersion: 'v1', modelVersion: 'v1', ...source } });
    const proposed = (content) => ({ content: { ...ferritin('m'), proposal: { itemKey: KEY, type: TYPE, content, time: D, clientData: { hdsTimePrecision: 'day' } } } });
    const holds = (mine, theirs) => cv.holdsProposedValue({ type: TYPE, content: mine }, proposed(theirs));
    const x2 = { annotations: { frequency: 'X2' } };
    assert.ok(holds(at(x2, { wetness: 0.9, threadiness: 0.8 }), at(x2)), 'other vectors');
    assert.ok(holds(at({ ...x2, engineVersion: 'v2', modelVersion: 'v3' }), at(x2)), 'other versions');
    assert.ok(holds({ source: { annotations: { frequency: 'X2' }, sourceData: '10KL', key: 'creighton' }, vectors: {} }, at(x2)), 'other key order, versions absent');
    assert.ok(holds(at({ annotations: {} }), at({})), 'no annotation and an empty one');
    assert.ok(!holds(at(x2), at({ annotations: { frequency: 'X1' } })), 'another frequency');
    assert.ok(!holds(at(x2), at({})), 'a frequency and none');
    assert.ok(!holds(at({ sourceData: '8KL' }), at({})), 'another code');
    assert.ok(!holds(at({ key: 'billings', sourceData: 'peak' }), at({})), 'another method');
    assert.ok(!holds({ vectors: {} }, at({})), 'no method');
    assert.ok(!holds(at({ note: 'peak' }), at({})), 'any other field of the source counts');
    assert.ok(!holds({ ...at({}), extra: 1 }, at({})), 'any other field of the content counts');
    for (const empty of ['', '  ', {}, []]) {
      assert.ok(!holds(at({ sourceData: empty }, { wetness: 1 }), at({ sourceData: empty }, { wetness: 0.2 })), 'no reading: the whole content is compared');
    }
    assert.ok(holds(at({ sourceData: { a: 1, b: 2 } }), at({ sourceData: { b: 2, a: 1 } })), 'an object reading');
    const mood = (vectors) => ({ vectors, source: { key: 'hds', sourceData: 'happy', engineVersion: 'v1', modelVersion: 'v1' } });
    const moodPv = { content: { ...ferritin('m'), proposal: { itemKey: 'wellbeing-mood', type: 'mood/5d-vectors', content: mood({ valence: 1 }), time: D, clientData: { hdsTimePrecision: 'day' } } } };
    assert.ok(cv.holdsProposedValue({ type: 'mood/5d-vectors', content: mood({ valence: 0.9 }) }, moodPv), 'mood, same reading');
    const { person, rel, her, conv } = await setup([{ ...ferritin('c1'), proposal: { itemKey: KEY, type: TYPE, content: at(x2), time: D, clientData: { hdsTimePrecision: 'day' } } }]);
    await her(KEY, TYPE, at({ ...x2, engineVersion: 'v9' }, { wetness: 0.1 }), D);
    assert.deepStrictEqual((await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES }))?.candidateIds, ['c1']);
    assert.strictEqual((await conv()).proposedValues[0].state, 'duplicate');
  });

  it('[CNVX6] basis rules: existing-value only on a duplicate of proposed values, profile-match only on a confirm of is-this-yours', () => {
    const answer = { kind: 'answer', inReplyTo: 'ev-1', about: DOC, candidateIds: ['c1'] };
    assert.deepStrictEqual(cv.checkConversationItem({ ...answer, action: 'duplicate', basis: 'existing-value' }), []);
    assert.ok(cv.checkConversationItem({ ...answer, action: 'confirm', basis: 'existing-value', written: [{ candidateId: 'c1', eventId: 'ev-9' }] }).length > 0);
    assert.ok(cv.checkConversationItem({ ...answer, action: 'duplicate', basis: 'profile-match' }).length > 0);
    // a basis on the wrong target never counts (R8)
    const items = cv.parseConversationItems([
      { id: 'p1', type: cv.ET_CONVERSATION, streamIds: ['r'], time: 1, created: 1, modified: 1, content: ferritin('c1') },
      { id: 'a1', type: cv.ET_CONVERSATION, streamIds: ['s'], time: 2, created: 2, modified: 2, content: { ...answer, inReplyTo: 'p1', action: 'duplicate', basis: 'profile-match' } }
    ], { received: 'r', sent: 's' });
    assert.strictEqual(cv.conversationOf(items, DOC).proposedValues[0].state, 'open');
  });

  it('[CNVX7] the profile match ignores commas ("DUPONT, MARIE-CLAIRE")', () => {
    const profile = { name: 'Marie Claire', surname: 'Dupont', dateOfBirth: '1985-03-14' };
    assert.ok(cv.profileMatch({ name: 'DUPONT, MARIE-CLAIRE', birthDay: '1985-03-14' }, profile));
    assert.ok(cv.profileMatch({ name: 'DUPONT Marie,Claire', birthDay: '1985-03-14' }, profile));
  });

  it('[CNVX8] a written value\'s anchor names its document (eventId = about); one naming another document is dropped', () => {
    const it = (anchor) => ({ id: 'p1', about: DOC, content: { ...ferritin('c1'), anchor } });
    assert.deepStrictEqual(cv.valueEventOf(it({ attachmentId: 'att1', page: 1 })).clientData.hdsSourceAnchor, { attachmentId: 'att1', page: 1, eventId: DOC });
    assert.strictEqual(cv.valueEventOf(it({ eventId: 'other', attachmentId: 'att1', page: 1 })).clientData.hdsSourceAnchor, undefined);
  });
});
