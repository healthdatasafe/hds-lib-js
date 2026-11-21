import { assert } from './test-utils/deps-node.js';
import { cmcConversation as cv } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { schemaIssues } from '../ts/utils/schemaCheck.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';
const ALERT_SCHEMA_URL = 'https://model.datasafe.dev/json-schemas/hds-conversation-alert.json';
const COLLECTORS = ':_cmc:apps:hds-patient:collectors:reader--api-x';
const CONTACT_COLLECTORS = ':_cmc:apps:hds-bridge-reader:collectors:anna--api-x';
const CHANNEL = [
  { streamId: ':_cmc:inbox', level: 'create-only' },
  { streamId: COLLECTORS, level: 'contribute' }
];
const ENGINES = cv.vouchedEnginesFor('hds-bridge-reader');
const DOC = 'ckdoc0000001';

function apiError (id) {
  const e = new Error(id);
  e.innerObject = { id };
  return e;
}

/** An account as the platform keeps it, with a clock: `created` / `modified` in seconds, scope updates applied. */
function account ({ streams = [], events = [], accesses = [], tokenType = 'personal' } = {}) {
  const state = { streams: [...streams], events: new Map(events.map(e => [e.id, { ...e }])), calls: [], grant: null, n: 0, clock: 1000 };
  const tick = () => ++state.clock;
  state.accessInfo = async () => ({ type: tokenType });
  state.apiOne = async function (method, params, key) {
    state.calls.push({ method, params });
    const out = (k, v) => key ? v : { [k]: v };
    switch (method) {
      case 'streams.get':
        if (params.parentId && !state.streams.find(s => s.id === params.parentId)) throw apiError('unknown-referenced-resource');
        return out('streams', state.streams.filter(s => s.parentId === (params.parentId ?? null)).filter(s => params.state === 'all' || !s.trashed));
      case 'streams.create': {
        if (state.streams.find(s => s.id === params.id)) throw apiError('item-already-exists');
        const s = { parentId: null, ...params };
        state.streams.push(s);
        return out('stream', s);
      }
      case 'streams.delete': {
        const s = state.streams.find(x => x.id === params.id);
        if (!s) throw apiError('unknown-resource');
        if (!s.trashed) { s.trashed = true; return out('stream', s); }
        state.streams = state.streams.filter(x => x.id !== params.id);
        for (const [id, e] of state.events) {
          if (!e.streamIds.includes(params.id)) continue;
          e.streamIds = e.streamIds.filter(x => x !== params.id);
          if (e.streamIds.length === 0) state.events.delete(id);
        }
        return out('streamDeletion', { id: params.id });
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
        if (!e) throw apiError('unknown-resource');
        Object.assign(e, structuredClone(params.update), { modified: tick() });
        return out('event', structuredClone(e));
      }
      case 'events.delete': {
        const e = state.events.get(params.id);
        if (!e) throw apiError('unknown-resource');
        if (!e.trashed) { e.trashed = true; return out('event', e); }
        state.events.delete(params.id);
        return out('eventDeletion', { id: params.id });
      }
      case 'accesses.get':
        return out('accesses', accesses);
      case 'events.get': {
        const inTree = (id) => params.streams.includes(id) || params.streams.some(p => state.streams.find(s => s.id === id)?.parentId === p);
        return out('events', [...state.events.values()]
          .filter(e => params.state === 'all' || !e.trashed)
          .filter(e => e.streamIds.some(inTree))
          .filter(e => !params.types || params.types.includes(e.type))
          .filter(e => params.fromTime == null || e.time >= params.fromTime)
          .filter(e => params.toTime == null || e.time <= params.toTime)
          .map(e => structuredClone(e))
          .slice(params.skip ?? 0, (params.skip ?? 0) + (params.limit ?? Infinity)));
      }
      default:
        throw new Error('unexpected ' + method);
    }
  };
  return state;
}

const rel = (grant = [{ streamId: 'body-weight', level: 'read' }]) => ({ accessId: 'acc-1:2', localCollectorStreamId: COLLECTORS, grantedPermissions: [...grant, ...CHANNEL] });
const alertsOf = (conn) => [...conn.events.values()].filter(e => e.type === 'notification/alert-cmc');
const extraction = { engine: 'hds-reader', engineVersion: '0.3.0', kbVersion: '0.4.0', backend: 'text-layer' };

function pv (candidateId, over = {}) {
  return {
    kind: 'proposed-value',
    about: DOC,
    candidateId,
    printed: { label: 'Ferritine', value: '48', unit: 'ng/mL', refRange: '30 - 400' },
    anchor: { attachmentId: 'att1', page: 1, bbox: [8.5, 41.2, 83, 2.1] },
    proposal: {
      itemKey: 'body-blood-serum-ferritin',
      type: 'concentration/ug-l',
      content: 48,
      time: 1773316800,
      clientData: { hdsTimePrecision: 'day', hdsRefRange: { lowerLimit: 30, upperLimit: 400, text: '30 - 400' } }
    },
    status: 'clear',
    extraction,
    ...over
  };
}
const noProposal = ({ proposal, ...rest }) => rest;
const identityQuestion = { kind: 'question', about: DOC, code: 'is-this-yours', context: { identity: { name: 'DUPONT Marie-Claire', birthDate: '14.03.1985', birthDay: '1985-03-14' } } };
const PROFILE = { name: 'Marie Claire', surname: 'Dupont', dateOfBirth: '1985-03-14' };

/** The person's account with the relationship's two children granted, and the contact's view of them. */
async function setup () {
  const person = account();
  const contact = account();
  const r = rel();
  const ensured = await cv.ensureConversationStreams(person, r);
  const streams = cv.conversationStreamsOf(person.grant);
  return { person, contact, rel: { ...r, grantedPermissions: person.grant.concat(CHANNEL) }, streams, ensured };
}

describe('[CNV] cmcConversation', function () {
  before(async function () {
    this.timeout(20000);
    await getModel().load(modelURL);
  });

  describe('[CNV-S] schemaCheck', () => {
    it('[CNV1] the portable subset: types, required, additionalProperties, patterns, tuples, oneOf by kind', () => {
      const schema = {
        type: 'object',
        required: ['kind'],
        oneOf: [
          { type: 'object', additionalProperties: false, required: ['kind', 'n'], properties: { kind: { type: 'string', enum: ['a'] }, n: { type: 'integer', minimum: 1 } } },
          { type: 'object', additionalProperties: false, required: ['kind', 'b'], properties: { kind: { type: 'string', enum: ['b'] }, b: { type: 'array', items: [{ type: 'number' }, { type: 'number' }], additionalItems: false, minItems: 2 } } }
        ]
      };
      assert.deepStrictEqual(schemaIssues(schema, { kind: 'a', n: 2 }), []);
      assert.deepStrictEqual(schemaIssues(schema, { kind: 'a', n: 0 }), ['n: below 1']);
      assert.deepStrictEqual(schemaIssues(schema, { kind: 'b', b: [1, 2, 3] }), ['b[2]: not allowed']);
      assert.deepStrictEqual(schemaIssues(schema, { kind: 'a', n: 1, x: 1 }), ['x: not allowed']);
      assert.deepStrictEqual(schemaIssues(schema, { kind: 'c' }), ['(root): matches none of the allowed shapes']);
      assert.deepStrictEqual(schemaIssues({ type: 'string', pattern: '^[!-~]{1,4}$' }, 'été'), ['(root): does not match ^[!-~]{1,4}$']);
      assert.deepStrictEqual(schemaIssues({ type: ['number', 'object'] }, 'x'), ['(root): must be number or object']);
    });
  });

  describe('[CNV-A] alerts', () => {
    it('[CNV10] the mirrored hds schema equals the published one (descriptions aside)', async () => {
      const published = await (await fetch(ALERT_SCHEMA_URL)).json();
      const strip = (o) => Array.isArray(o)
        ? o.map(strip)
        : (o && typeof o === 'object')
            ? Object.fromEntries(Object.entries(o).filter(([k]) => !['description', 'title', '$id', '$schema'].includes(k)).map(([k, v]) => [k, strip(v)]))
            : o;
      assert.deepStrictEqual(strip(cv.CONVERSATION_ALERT_HDS_SCHEMA), strip(published));
    });

    it('[CNV11] alert content: fixed words in en and fr, code, checked hds; never a value', () => {
      assert.deepStrictEqual(cv.buildConversationAlertContent({ kind: 'proposed-values', about: DOC, count: 2 }), {
        level: 'info',
        title: { en: 'Proposed values', fr: 'Valeurs proposées' },
        body: { en: 'Your contact proposes values read from a document. Please check them.', fr: 'Votre contact propose des valeurs lues dans un document. Merci de les vérifier.' },
        code: 'hds-proposed-values',
        hds: { kind: 'proposed-values', about: DOC, count: 2 }
      });
      assert.throws(() => cv.buildConversationAlertContent({ kind: 'proposed-values', about: DOC, count: 2, value: 48 }), (e) => e.innerObject?.reason === 'invalid-alert');
      assert.throws(() => cv.buildConversationAlertContent({ kind: 'task-status', about: DOC, status: 'error', attempt: 1 }), /errorCode is required/);
      assert.throws(() => cv.buildConversationAlertContent({ kind: 'notice', code: 'Not A Code' }));
      assert.throws(() => cv.buildConversationAlertContent({ kind: 'job' }));
    });

    it('[CNV12] parse: duplicates kept once per key, direction from `from`; the state is the latest task-status by time', () => {
      const a = (id, time, hds, from) => ({ id, time, type: 'notification/alert-cmc', content: { hds, ...(from ? { from: { username: 'reader', host: 'x' } } : {}) } });
      const parsed = cv.parseConversationAlerts([
        a('t2', 2, { kind: 'task-status', about: DOC, status: 'reading', attempt: 1 }, true),
        a('t1', 1, { kind: 'task-status', about: DOC, status: 'received', attempt: 1 }, true),
        a('t2b', 2, { kind: 'task-status', about: DOC, status: 'reading', attempt: 1 }, true), // second device
        a('p1', 3, { kind: 'proposed-values', about: DOC, count: 2 }, true),
        a('p2', 4, { kind: 'proposed-values', about: DOC, count: 1 }, true),
        a('q1', 5, { kind: 'question', eventId: 'q', about: DOC }, true),
        a('x1', 6, { kind: 'answer', eventId: 'ans', inReplyTo: 'q', about: DOC }),
        a('d1', 7, { kind: 'document-shared', eventId: DOC }, true)
      ]);
      assert.deepStrictEqual(parsed.map(p => [p.alertEventId, p.direction]), [['t1', 'received'], ['t2b', 'received'], ['p1', 'received'], ['q1', 'received'], ['x1', 'sent']]);
      assert.strictEqual(cv.taskStatusOf(parsed, DOC).hds.status, 'reading');
      assert.strictEqual(cv.taskStatusOf(parsed, 'other'), null);
      // a restarted contact reuses attempt 1: its later `reading` is the state, not the earlier `done` (R4)
      const restarted = cv.parseConversationAlerts([
        a('r1', 1, { kind: 'task-status', about: DOC, status: 'reading', attempt: 1 }, true),
        a('r2', 2, { kind: 'task-status', about: DOC, status: 'done', attempt: 1 }, true),
        a('r3', 3, { kind: 'task-status', about: DOC, status: 'reading', attempt: 1 }, true)
      ]);
      assert.strictEqual(cv.taskStatusOf(restarted, DOC).hds.status, 'reading');
    });
  });

  describe('[CNV-R] writer rules', () => {
    it('[CNV20] the pack schema and the conditions on one event', () => {
      assert.deepStrictEqual(cv.checkConversationItem(pv('c1')), []);
      assert.deepStrictEqual(cv.checkConversationItem(identityQuestion), []);
      assert.match(cv.checkConversationItem({ ...pv('c1'), confidence: 0.9 }).join(), /confidence: not allowed/);
      assert.match(cv.checkConversationItem(pv('c1', { status: 'kept-aside' })).join(), /reason is required/);
      const noPrecision = pv('c1');
      delete noPrecision.proposal.clientData.hdsTimePrecision;
      assert.match(cv.checkConversationItem(noPrecision).join(), /hdsTimePrecision/);
      assert.match(cv.checkConversationItem({ kind: 'question', about: DOC, code: 'which-unit', candidateId: 'c1' }).join(), /options are required/);
      assert.match(cv.checkConversationItem({ kind: 'question', about: DOC, code: 'is-fasting', candidateId: 'c1', options: ['yes', 'maybe'] }).join(), /exactly yes, no/);
      assert.match(cv.checkConversationItem({ ...identityQuestion, candidateId: 'c1' }).join(), /no candidateId/);
      assert.match(cv.checkConversationItem({ kind: 'question', about: DOC, code: 'which-date', context: { identity: { name: 'X' } } }).join(), /dates only/);
      assert.match(cv.checkConversationItem({ kind: 'question', about: DOC, code: 'what-colour' }).join(), /unknown code/);
      assert.deepStrictEqual(cv.checkConversationItem({ kind: 'question', about: DOC, code: 'x-acme-consent' }), []);
      assert.match(cv.checkConversationItem({ kind: 'answer', inReplyTo: 'q', about: DOC, action: 'skip', written: [{ candidateId: 'c', eventId: 'e' }], candidateIds: ['c'] }).join(), /no written/);
      assert.match(cv.checkConversationItem({ kind: 'answer', inReplyTo: 'q', about: DOC, action: 'correct', candidateIds: ['a', 'b'], written: [{ candidateId: 'a', eventId: 'e' }] }).join(), /exactly one/);
      assert.match(cv.checkConversationItem({ kind: 'answer', inReplyTo: 'q', about: DOC, action: 'choose' }).join(), /option is required/);
    });

    it('[CNV21] R9: the value alone', () => {
      assert.strictEqual(cv.checkValueProposal({ itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content: 48 }), null);
      assert.strictEqual(cv.checkValueProposal({ itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content: '48' }), 'invalid-content');
      assert.strictEqual(cv.checkValueProposal({ itemKey: 'body-blood-serum-ferritin', type: 'mass/kg', content: 48 }), 'type-not-of-item');
      assert.strictEqual(cv.checkValueProposal({ itemKey: 'no-such-item', type: 'mass/kg', content: 48 }), 'unknown-item');
      assert.strictEqual(cv.checkValueProposal({ itemKey: 'sync-status', type: 'x/y', content: {} }), 'item-not-allowed');
      assert.strictEqual(cv.checkValueProposal({ itemKey: 'document', type: 'file/xds-v1', content: {} }), 'item-not-allowed');
      assert.strictEqual(cv.checkValueProposal({ itemKey: 'genetics-variant', type: 'x/y', content: {} }), 'item-not-allowed');
      assert.strictEqual(cv.checkValueProposal(null), 'no-proposal');
    });

    it('[CNV22] profile match: full names in any order, accents, hyphens; an initial or no birth date never matches', () => {
      const id = { name: 'DUPONT Marie-Claire', birthDay: '1985-03-14' };
      assert.strictEqual(cv.profileMatch(id, PROFILE), true);
      assert.strictEqual(cv.profileMatch({ name: 'Dupônt marie claire', birthDay: '1985-03-14' }, PROFILE), true);
      assert.strictEqual(cv.profileMatch({ name: 'DUPONT M.', birthDay: '1985-03-14' }, PROFILE), false);
      assert.strictEqual(cv.profileMatch({ name: 'DUPONT Marie', birthDay: '1985-03-14' }, PROFILE), false);
      assert.strictEqual(cv.profileMatch({ name: 'DUPONT Marie-Claire' }, PROFILE), false);
      assert.strictEqual(cv.profileMatch(id, { ...PROFILE, dateOfBirth: null }), false);
      assert.strictEqual(cv.profileMatch(id, { ...PROFILE, dateOfBirth: '1985-03-15' }), false);
    });

    it('[CNV23] labels from direction and viewer, never the name; ids conv- and 12 base36', () => {
      assert.strictEqual(cv.conversationStreamLabel('received', 'person', 'fr'), 'Reçu dans les conversations');
      assert.strictEqual(cv.conversationStreamLabel('sent', 'contact', 'de'), 'Answers shared with you');
      const id = cv.newConversationStreamId();
      assert.match(id, /^conv-[a-z0-9]{12}$/);
      assert.ok(cv.isConversationStreamId(id) && !cv.isConversationStreamId('conv-x'));
    });
  });

  describe('[CNV-P] streams and reading', () => {
    it('[CNV30] first time: root and two children created, contribute on received and read on sent in one scope update', async () => {
      const { person, ensured, streams } = await setup();
      assert.deepStrictEqual(person.streams.find(s => s.id === 'conversation-items'), { parentId: null, id: 'conversation-items', name: 'Conversation items' });
      assert.deepStrictEqual(streams, { received: ensured.received, sent: ensured.sent });
      assert.deepStrictEqual(person.streams.find(s => s.id === ensured.received).clientData, { hdsConversationItems: { relationship: 'acc-1', direction: 'received' } });
      assert.deepStrictEqual(person.grant, [{ streamId: 'body-weight', level: 'read' }, { streamId: ensured.received, level: 'contribute' }, { streamId: ensured.sent, level: 'read' }]);
      assert.strictEqual([...person.events.values()].filter(e => e.type === 'consent/scope-update-cmc').length, 1);
      const again = await cv.ensureConversationStreams(person, { ...rel(), grantedPermissions: person.grant.concat(CHANNEL) });
      assert.deepStrictEqual([again.received, again.sent, again.scopeUpdate], [ensured.received, ensured.sent, null]);
    });

    it('[CNV31] R2: a kind on the wrong child, another type, a trashed item or one outside the children is not read', () => {
      const streams = { received: 'conv-rrrrrrrrrrrr', sent: 'conv-ssssssssssss' };
      const e = (id, streamIds, content, extra = {}) => ({ id, streamIds, type: 'message/hds-conversation-v1', content, time: 1, created: 1, modified: 1, ...extra });
      const items = cv.parseConversationItems([
        e('a', [streams.received], pv('c1')),
        e('b', [streams.sent], pv('c2')),
        e('c', [streams.received], { kind: 'answer', about: DOC, inReplyTo: 'a', action: 'skip' }),
        e('d', ['conv-oooooooooooo'], pv('c3')),
        e('f', [streams.received], pv('c4'), { trashed: true }),
        e('g', [streams.received], { kind: 'summary', about: DOC }),
        { ...e('h', [streams.received], pv('c5')), type: 'message/hds-reader-v1' }
      ], streams);
      assert.deepStrictEqual(items.map(i => i.id), ['a']);
    });

    it('[CNV32] R3 void: an answer is void once an event it covers was modified after it', () => {
      const streams = { received: 'conv-rrrrrrrrrrrr', sent: 'conv-ssssssssssss' };
      const e = (id, streamIds, content, t) => ({ id, streamIds, type: 'message/hds-conversation-v1', content, time: t, created: t, modified: t });
      const items = cv.parseConversationItems([
        e('p1', [streams.received], pv('c1'), 1),
        e('a1', [streams.sent], { kind: 'answer', about: DOC, inReplyTo: 'p1', action: 'skip', candidateIds: ['c1'] }, 2)
      ], streams);
      assert.strictEqual(cv.conversationOf(items, DOC).proposedValues[0].state, 'skipped');
      items[0].modified = 3;
      assert.strictEqual(cv.conversationOf(items, DOC).proposedValues[0].state, 'open');
    });

    it('[CNV33] R10 sets hold every received item (a duplicate candidate included); a written entry counts only on confirm or correct', () => {
      const streams = { received: 'conv-rrrrrrrrrrrr', sent: 'conv-ssssssssssss' };
      const e = (id, streamIds, content, t) => ({ id, streamIds, type: 'message/hds-conversation-v1', content, time: t, created: t, modified: t });
      const items = cv.parseConversationItems([
        e('p1', [streams.received], pv('c1'), 1),
        e('p1b', [streams.received], pv('c1'), 2), // a racing retry created it twice
        e('a1', [streams.sent], { kind: 'answer', about: DOC, inReplyTo: 'p1b', action: 'skip', candidateIds: ['c1'], written: [{ candidateId: 'c1', eventId: 'v' }] }, 3)
      ], streams);
      const conv = cv.conversationOf(items, DOC);
      assert.strictEqual(conv.proposedValues[0].state, 'skipped', 'a skip carrying written is not a confirmation');
      assert.deepStrictEqual(conv.writtenCandidates, {});
      assert.deepStrictEqual(cv.itemsOfDocument(conv).sort(), ['p1', 'p1b']);
      assert.deepStrictEqual(cv.itemsToDeleteAtDone(conv).sort(), ['p1', 'p1b']);
    });

    it('[CNV34] R8 on writing: unknown clientData values are dropped; an unknown which-date precision gives no date', () => {
      const item = { id: 'p1', about: DOC, content: pv('c1', { proposal: { ...pv('c1').proposal, clientData: { hdsTimePrecision: 'week', hdsInterpretation: 'Z', hdsFlag: 'H' } } }) };
      const ev = cv.valueEventOf(item);
      assert.deepStrictEqual([ev.clientData.hdsTimePrecision, ev.clientData.hdsInterpretation, ev.clientData.hdsFlag], [undefined, undefined, 'H']);
      const streams = { received: 'conv-rrrrrrrrrrrr', sent: 'conv-ssssssssssss' };
      const e = (id, streamIds, content, t) => ({ id, streamIds, type: 'message/hds-conversation-v1', content, time: t, created: t, modified: t });
      const conv = cv.conversationOf(cv.parseConversationItems([
        e('q', [streams.received], { kind: 'question', about: DOC, code: 'which-date' }, 1),
        e('a', [streams.sent], { kind: 'answer', about: DOC, inReplyTo: 'q', action: 'confirm', time: 5, timePrecision: 'fortnight' }, 2)
      ], streams), DOC);
      assert.strictEqual(conv.documentDate, null);
    });
  });

  describe('[CNV-T] a round trip', () => {
    it('[CNV40] the contact proposes and asks; her app reads, confirms her identity from her profile, confirms one value, corrects one, writes them; the contact reads the answers', async () => {
      const { person, contact, rel: r, streams } = await setup();

      // the contact, through its grant on her children, then its own collectors stream
      const pvs = await cv.writeProposedValues(person, streams, DOC, [pv('c1'), pv('c2', { printed: { label: 'Ferritine', value: '84' }, proposal: { ...pv('c2').proposal, content: 84 }, status: 'check' })]);
      assert.deepStrictEqual(pvs.created.map(c => c.candidateId), ['c1', 'c2']);
      await cv.postConversationAlert(contact, CONTACT_COLLECTORS, { kind: 'proposed-values', about: DOC, count: 2 });
      const qId = await cv.writeQuestion(person, streams, identityQuestion);
      await cv.postConversationAlert(contact, CONTACT_COLLECTORS, { kind: 'question', eventId: qId, about: DOC });
      await cv.postConversationAlert(contact, CONTACT_COLLECTORS, { kind: 'task-status', about: DOC, status: 'awaiting-answers', attempt: 1, counts: { proposed: 2, questions: 1, keptAside: 0, dropped: 4 } });
      for (const a of alertsOf(contact)) assert.ok(!JSON.stringify(a.content).includes('48'), 'R6: no value over CMC');
      for (const id of [...pvs.created.map(c => c.eventId), qId]) assert.deepStrictEqual(person.events.get(id).clientData, { related: { [DOC]: true } });

      // her app shows them
      const shown = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      const shownAt = person.clock;
      assert.deepStrictEqual(shown.proposedValues.map(p => [p.candidateId, p.state, cv.proposalRefusal(p, ENGINES)]), [['c1', 'open', null], ['c2', 'open', null]]);
      assert.strictEqual(cv.proposalRefusal(shown.proposedValues[0], ['other-engine']), 'engine-not-vouched');
      assert.strictEqual(shown.identity, 'open');

      // R3: nothing written before her identity is confirmed
      const early = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt, engines: ENGINES });
      assert.deepStrictEqual(early, { answers: [], refused: [{ candidateId: 'c1', reason: 'identity-not-confirmed' }] });
      const auto = await cv.autoConfirmIdentity(person, r, { about: DOC, profile: PROFILE });
      assert.ok(auto?.answerEventId);
      assert.strictEqual(await cv.autoConfirmIdentity(person, r, { about: DOC, profile: PROFILE }), null, 'at most one automatic answer');

      const res = await cv.acceptProposedValues(person, r, {
        about: DOC,
        shownAt,
        engines: ENGINES,
        decisions: [
          { candidateId: 'c1', action: 'confirm' },
          { candidateId: 'c2', action: 'correct', correction: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content: 48 } },
          { candidateId: 'nope', action: 'confirm' }
        ]
      });
      assert.deepStrictEqual(res.refused, [{ candidateId: 'nope', reason: 'unknown-candidate' }]);
      assert.deepStrictEqual(res.answers.map(a => [a.action, a.written.map(w => w.candidateId)]), [['confirm', ['c1']], ['correct', ['c2']]]);

      // the values: on the item's stream, written by her app, with their provenance
      const v1 = person.events.get(res.answers[0].written[0].eventId);
      assert.deepStrictEqual([v1.streamIds, v1.type, v1.content, v1.time], [['body-blood-serum-ferritin'], 'concentration/ug-l', 48, 1773316800]);
      assert.deepStrictEqual(v1.clientData, {
        hdsRefRange: { lowerLimit: 30, upperLimit: 400, text: '30 - 400' },
        hdsTimePrecision: 'day',
        related: { [DOC]: true },
        sourceKey: 'hds-reader:document:' + DOC + ':c1',
        hdsSourceAnchor: { attachmentId: 'att1', page: 1, bbox: [8.5, 41.2, 83, 2.1] },
        hdsExtraction: { ...extraction, confirmedBy: 'person' }
      });
      assert.strictEqual(person.events.get(res.answers[1].written[0].eventId).clientData.hdsExtraction.corrected, true);
      const answer = person.events.get(res.answers[0].answerEventId);
      assert.deepStrictEqual(answer.streamIds, [streams.sent]);
      assert.deepStrictEqual(Object.keys(answer.clientData.related).sort(), [DOC, answer.content.inReplyTo, v1.id].sort());
      const herAlerts = alertsOf(person).map(a => a.content.hds);
      assert.deepStrictEqual(herAlerts.map(h => h.kind), ['answer', 'answer', 'answer']);
      assert.ok(alertsOf(person).every(a => a.streamIds[0] === COLLECTORS));

      // the contact reads her answers (through its read grant on sent)
      const seen = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      assert.deepStrictEqual(seen.proposedValues.map(p => [p.candidateId, p.state, p.writtenEventId]), [['c1', 'confirmed', v1.id], ['c2', 'corrected', res.answers[1].written[0].eventId]]);
      assert.strictEqual(seen.identity, 'confirmed');
      assert.deepStrictEqual(cv.itemsToDeleteAtDone(seen).sort(), [...pvs.created.map(c => c.eventId), qId].sort());

      // R5: written candidates are never proposed again; R3: nothing written twice
      const again = await cv.writeProposedValues(person, streams, DOC, [pv('c1')]);
      assert.deepStrictEqual(again.skipped, [{ candidateId: 'c1', reason: 'written' }]);
      const twice = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
      assert.deepStrictEqual(twice.refused, [{ candidateId: 'c1', reason: 'answered' }]);
    });

    it('[CNV41] a write that failed half-way is retried without writing a value twice (sourceKey)', async () => {
      const { person, rel: r, streams } = await setup();
      await cv.writeProposedValues(person, streams, DOC, [pv('c1'), pv('c2')]);
      const shownAt = person.clock;
      const apiOne = person.apiOne;
      let creates = 0;
      person.apiOne = async (method, params, key) => {
        if (method === 'events.create' && params.type === 'concentration/ug-l' && ++creates === 2) throw new Error('offline');
        return apiOne(method, params, key);
      };
      const decisions = [{ candidateId: 'c1', action: 'confirm' }, { candidateId: 'c2', action: 'confirm' }];
      await assert.rejects(cv.acceptProposedValues(person, r, { about: DOC, decisions, shownAt, engines: ENGINES }), (e) => e.innerObject?.reason === 'write-failed');
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions, shownAt, engines: ENGINES });
      assert.strictEqual([...person.events.values()].filter(e => e.type === 'concentration/ug-l').length, 2);
      assert.strictEqual(res.answers.length, 1);
    });

    it('[CNV42] which-unit: choose writes no value, the contact re-proposes with replaces, the old one is no longer confirmable', async () => {
      const { person, rel: r, streams } = await setup();
      await cv.writeProposedValues(person, streams, DOC, [noProposal(pv('c1', { status: 'unit-missing' }))]);
      const qId = await cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'which-unit', candidateId: 'c1', options: ['ug/L', 'ng/mL'] });
      await assert.rejects(cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'which-unit', candidateId: 'zz', options: ['ug/L'] }), /not a proposed value/);
      await assert.rejects(cv.answerQuestion(person, r, { questionId: qId, action: 'choose', option: 'mmol/L', shownAt: person.clock }), (e) => e.innerObject?.reason === 'invalid-answer');
      const before = person.events.size;
      await cv.answerQuestion(person, r, { questionId: qId, action: 'choose', option: 'ng/mL', shownAt: person.clock });
      assert.strictEqual(person.events.size, before + 2, 'the answer and its alert, no value');
      await assert.rejects(cv.writeProposedValues(person, streams, DOC, [pv('c9', { replaces: 'c8' })]), /replaces c8/);
      await cv.writeProposedValues(person, streams, DOC, [pv('c1b', { replaces: 'c1' })]);
      const conv = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      assert.deepStrictEqual(conv.proposedValues.map(p => [p.candidateId, p.state, cv.proposalRefusal(p, ENGINES)]), [['c1', 'replaced', 'replaced'], ['c1b', 'open', null]]);
      assert.deepStrictEqual(conv.questions.map(q => q.state), ['answered']);
    });

    it('[CNV43] not-mine: nothing more is written, the values already written are deleted', async () => {
      const { person, rel: r, streams } = await setup();
      await cv.writeProposedValues(person, streams, DOC, [pv('c1'), pv('c2')]);
      const qId = await cv.writeQuestion(person, streams, identityQuestion);
      await cv.answerQuestion(person, r, { questionId: qId, action: 'confirm', shownAt: person.clock });
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
      const valueId = res.answers[0].written[0].eventId;
      const no = await cv.answerQuestion(person, r, { questionId: qId, action: 'not-mine', shownAt: person.clock });
      assert.deepStrictEqual(no.deletedValueIds, [valueId]);
      assert.ok(!person.events.has(valueId));
      const after = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c2', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
      assert.deepStrictEqual(after.refused, [{ candidateId: 'c2', reason: 'not-mine' }]);
    });

    it('[CNV44] dates: no date, no write; a which-date answer dates the value; unknown writes it without time; changed since shown is refused', async () => {
      const { person, rel: r, streams } = await setup();
      const undated = (id) => pv(id, { proposal: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content: 48, clientData: {} } });
      await cv.writeProposedValues(person, streams, DOC, [undated('c1')]);
      const shownAt = person.clock;
      const r1 = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt, engines: ENGINES });
      assert.deepStrictEqual(r1.refused, [{ candidateId: 'c1', reason: 'no-date' }]);
      const qId = await cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'which-date', context: { dates: [{ day: '2026-03-12', text: '12.03.2026', role: 'sampling' }] } });
      await assert.rejects(cv.answerQuestion(person, r, { questionId: qId, action: 'confirm', timePrecision: 'day', shownAt }), (e) => e.innerObject?.reason === 'changed-since-shown');
      await cv.answerQuestion(person, r, { questionId: qId, action: 'confirm', time: 1773316800, timePrecision: 'day', shownAt: person.clock });
      const r2 = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
      const v = person.events.get(r2.answers[0].written[0].eventId);
      assert.deepStrictEqual([v.time, v.clientData.hdsTimePrecision], [1773316800, 'day']);

      const { person: p2, rel: r2b, streams: s2 } = await setup();
      await cv.writeProposedValues(p2, s2, DOC, [undated('c1')]);
      const q2 = await cv.writeQuestion(p2, s2, { kind: 'question', about: DOC, code: 'which-date' });
      await cv.answerQuestion(p2, r2b, { questionId: q2, action: 'confirm', timePrecision: 'unknown', shownAt: p2.clock });
      const r3 = await cv.acceptProposedValues(p2, r2b, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt: p2.clock, engines: ENGINES });
      const v2 = p2.events.get(r3.answers[0].written[0].eventId);
      assert.strictEqual(v2.clientData.hdsTimePrecision, 'unknown');
      assert.strictEqual(p2.calls.find(c => c.method === 'events.create' && c.params.type === 'concentration/ug-l').params.time, undefined);

      await cv.writeProposedValues(p2, s2, DOC, [pv('c3')]);
      const shown = p2.clock;
      await cv.writeProposedValues(p2, s2, DOC, [pv('c3', { printed: { label: 'Ferritine', value: '49' } })]);
      const r4 = await cv.acceptProposedValues(p2, r2b, { about: DOC, decisions: [{ candidateId: 'c3', action: 'confirm' }], shownAt: shown, engines: ENGINES });
      assert.deepStrictEqual(r4.refused, [{ candidateId: 'c3', reason: 'changed-since-shown' }]);
    });

    it('[CNV45] R11: a question id outside the relationship\'s received child is not answered; skip, request-item', async () => {
      const { person, rel: r, streams } = await setup();
      const foreign = await person.apiOne('events.create', { streamIds: ['body-weight'], type: 'message/hds-conversation-v1', content: identityQuestion }, 'event');
      await assert.rejects(cv.answerQuestion(person, r, { questionId: foreign.id, action: 'confirm', shownAt: person.clock }), (e) => e.innerObject?.reason === 'not-in-conversation');
      await cv.writeProposedValues(person, streams, DOC, [noProposal(pv('k1', { status: 'kept-aside', reason: 'no-item', requestKey: 'body-blood-x' })), pv('c2')]);
      await assert.rejects(cv.answerProposedValues(person, r, { about: DOC, candidateIds: ['c2'], action: 'request-item' }), /not kept-aside/);
      await cv.answerProposedValues(person, r, { about: DOC, candidateIds: ['k1'], action: 'request-item' });
      await cv.answerProposedValues(person, r, { about: DOC, candidateIds: ['c2'], action: 'skip' });
      const conv = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      assert.deepStrictEqual(conv.proposedValues.map(p => [p.candidateId, p.state, cv.proposalRefusal(p, ENGINES)]), [['k1', 'requested', 'answered'], ['c2', 'skipped', null]]);
    });
  });

  describe('[CNV-K] after R10 deleted items', () => {
    it('[CNV46] a written candidate is never proposed again once its proposed value is gone; a not-mine holds once its question is gone', async () => {
      const { person, rel: r, streams } = await setup();
      await cv.writeProposedValues(person, streams, DOC, [pv('c1')]);
      await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
      await cv.deleteConversationItems(person, cv.itemsToDeleteAtDone(cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC)));
      const again = await cv.writeProposedValues(person, streams, DOC, [pv('c1')]);
      assert.deepStrictEqual([again.created, again.skipped], [[], [{ candidateId: 'c1', reason: 'written' }]]);

      const DOC2 = 'ckdoc0000002';
      const q = await cv.writeQuestion(person, streams, { ...identityQuestion, about: DOC2 });
      await cv.answerQuestion(person, r, { questionId: q, action: 'not-mine', shownAt: person.clock });
      await cv.deleteConversationItems(person, cv.itemsOfDocument(cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC2 }), DOC2)));
      assert.strictEqual(cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC2 }), DOC2).identity, 'not-mine');
      await assert.rejects(cv.writeProposedValues(person, streams, DOC2, [pv('c1', { about: DOC2 })]), (e) => e.innerObject?.reason === 'not-mine');
      await assert.rejects(cv.writeQuestion(person, streams, { ...identityQuestion, about: DOC2 }), (e) => e.innerObject?.reason === 'not-mine');
    });

    it('[CNV47] not-mine deletes the written values even when its alert fails; answers bind to the candidate shown', async () => {
      const { person, rel: r, streams } = await setup();
      await cv.writeProposedValues(person, streams, DOC, [pv('c1'), pv('c2')]);
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [{ candidateId: 'c1', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
      const valueId = res.answers[0].written[0].eventId;
      const q = await cv.writeQuestion(person, streams, identityQuestion);
      const apiOne = person.apiOne;
      person.apiOne = async (method, params, key) => {
        if (method === 'events.create' && params.type === 'notification/alert-cmc') throw new Error('offline');
        return apiOne(method, params, key);
      };
      await assert.rejects(cv.answerQuestion(person, r, { questionId: q, action: 'not-mine', shownAt: person.clock }), (e) => e.innerObject?.reason === 'alert-not-posted');
      assert.ok(!person.events.has(valueId), 'deleted before the alert');
      person.apiOne = apiOne;

      const D3 = 'ckdoc0000003';
      await cv.writeProposedValues(person, streams, D3, [pv('c2', { about: D3 })]);
      const shown = person.clock;
      await cv.writeProposedValues(person, streams, D3, [pv('c2', { about: D3, printed: { label: 'Ferritine', value: '50' } })]);
      await assert.rejects(cv.answerProposedValues(person, r, { about: D3, candidateIds: ['c2'], action: 'skip', shownAt: shown }), (e) => e.innerObject?.reason === 'changed-since-shown');
      const qu = await cv.writeQuestion(person, streams, { kind: 'question', about: D3, code: 'which-unit', candidateId: 'c2', options: ['ug/L'] });
      const shown2 = person.clock;
      await cv.writeProposedValues(person, streams, D3, [pv('c2', { about: D3, printed: { label: 'Ferritine', value: '51' } })]);
      await assert.rejects(cv.answerQuestion(person, r, { questionId: qu, action: 'choose', option: 'ug/L', shownAt: shown2 }), (e) => e.innerObject?.reason === 'changed-since-shown');
    });

    it('[CNV48] items are read page by page', async () => {
      const { person, streams } = await setup();
      const many = Array.from({ length: 1200 }, (_, i) => pv('c' + i));
      await cv.writeProposedValues(person, streams, DOC, many);
      assert.strictEqual((await cv.listConversationItems(person, streams, { about: DOC })).length, 1200);
      assert.ok(person.calls.filter(c => c.method === 'events.get' && c.params.types?.[0] === 'message/hds-conversation-v1').length >= 3);
    });
  });

  describe('[CNV-C] cleanup', () => {
    it('[CNV50] a relationship ends: both children deleted without merging; orphans after a restore', async () => {
      const { person, streams } = await setup();
      const value = await person.apiOne('events.create', { streamIds: ['body-blood-serum-ferritin'], type: 'concentration/ug-l', content: 48 }, 'event');
      await cv.writeProposedValues(person, streams, DOC, [pv('c1')]);
      assert.deepStrictEqual(await cv.cleanupOrphanConversationStreams(person, ['acc-1:3']), []);
      assert.deepStrictEqual((await cv.cleanupOrphanConversationStreams(person, ['acc-9'])).sort(), [streams.received, streams.sent].sort());
      assert.deepStrictEqual(person.streams.map(s => s.id), ['conversation-items']);
      assert.ok(person.events.has(value.id), 'her values stay');
      for (const c of person.calls.filter(c => c.method === 'streams.delete')) assert.strictEqual(c.params.mergeEventsWithParent, false);
      assert.deepStrictEqual(await cv.listConversationStreams(account()), []);
    });
  });
});
