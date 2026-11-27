import { assert } from './test-utils/deps-node.js';
import { cmcConversation as cv } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { schemaIssues } from '../ts/utils/schemaCheck.ts';

// HDS_TEST_MODEL_BASE: a data-model build served locally, to test against a model before it is published
const MODEL_BASE = globalThis.process?.env?.HDS_TEST_MODEL_BASE ?? 'https://model.datasafe.dev';
const modelURL = `${MODEL_BASE}/pack.json`;
const ALERT_SCHEMA_URL = `${MODEL_BASE}/json-schemas/hds-conversation-alert.json`;
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

    it('[CNV10c] notRead is a count a contact may post (4.36.0)', () => {
      const hds = { kind: 'task-status', about: DOC, status: 'awaiting-answers', attempt: 1, counts: { proposed: 140, questions: 6, notRead: 11 } };
      assert.deepStrictEqual(cv.buildConversationAlertContent(hds).hds, hds);
    });

    it('[CNV10b] on-hold is a status a contact may post (4.33.0)', () => {
      const hds = { kind: 'task-status', about: DOC, status: 'on-hold', attempt: 2 };
      assert.deepStrictEqual(cv.buildConversationAlertContent(hds).hds, hds);
    });

    it('[CNV11] alert content: fixed words in each language, `pt-BR` sent as `pt`, code, checked hds; never a value', () => {
      assert.deepStrictEqual(cv.buildConversationAlertContent({ kind: 'proposed-values', about: DOC, count: 2 }), {
        level: 'info',
        title: { en: 'Proposed values', fr: 'Valeurs proposées', es: 'Valores propuestos', it: 'Valori proposti', pt: 'Valores propostos' },
        body: { en: 'Your contact proposes values read from a document. Please check them.', fr: 'Votre contact propose des valeurs lues dans un document. Merci de les vérifier.', es: 'Su contacto propone valores leídos en un documento. Compruébelos, por favor.', it: 'Il suo contatto propone valori letti in un documento. Li controlli, per favore.', pt: 'Seu contato propõe valores lidos em um documento. Confira-os.' },
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

    it('[CNV13] parse: a notice speaks of one read (4.45.0): a later read drops the earlier read\'s notices, a repeated one is the latest', () => {
      const a = (id, time, hds, from = true) => ({ id, time, type: 'notification/alert-cmc', content: { hds, ...(from ? { from: { username: 'reader', host: 'x' } } : {}) } });
      const N = cv.NOTICE_CODES;
      const parsed = cv.parseConversationAlerts([
        a('ready', 0, { kind: 'notice', code: N.READY }),
        a('r1', 1, { kind: 'task-status', about: DOC, status: 'received', attempt: 1 }),
        a('n1', 2, { kind: 'notice', code: N.LINES_MAY_BE_MISSING, about: DOC }),
        a('n2', 2, { kind: 'notice', code: N.COLUMNS_NOT_READ, about: DOC }),
        a('o1', 2, { kind: 'notice', code: N.KIND_NOT_READ, about: 'other' }),
        a('r2', 5, { kind: 'task-status', about: DOC, status: 'received', attempt: 1 }),
        a('n3', 6, { kind: 'notice', code: N.LINES_MAY_BE_MISSING, about: DOC }),
        a('n4', 6, { kind: 'notice', code: N.LINES_MAY_BE_MISSING, about: DOC }) // second device
      ]);
      assert.deepStrictEqual(parsed.filter(p => p.kind === 'notice').map(p => p.alertEventId), ['ready', 'o1', 'n4']);
      // the same notice sent by her app (direction sent) is not dropped by the contact's `received`
      const sent = cv.parseConversationAlerts([
        a('s1', 1, { kind: 'notice', code: N.GRID_NOT_LOCATED, about: DOC }, false),
        a('r3', 2, { kind: 'task-status', about: DOC, status: 'received', attempt: 1 })
      ]);
      assert.deepStrictEqual(sent.map(p => p.alertEventId), ['s1', 'r3']);
      assert.deepStrictEqual(Object.values(N).filter(c => !/^[a-z0-9][a-z0-9-]{0,63}$/.test(c)), []);
    });

    it('[CNV13b] pages-not-read (4.47.0): a notice a contact may post about a document', () => {
      assert.strictEqual(cv.NOTICE_CODES.PAGES_NOT_READ, 'pages-not-read');
      const hds = { kind: 'notice', code: cv.NOTICE_CODES.PAGES_NOT_READ, about: DOC };
      assert.deepStrictEqual(cv.buildConversationAlertContent(hds).hds, hds);
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

    it('[CNV20b] a date\'s anchor (4.47.0): with its bbox and eventId = about, and no label; the other anchors name their document', () => {
      const anchor = { eventId: DOC, attachmentId: 'att1', page: 1, bbox: [60.2, 9.1, 18.5, 2.4] };
      const whichDate = (date, code = 'which-date', extra = {}) => ({ kind: 'question', about: DOC, code, context: { dates: [date] }, ...extra });
      const read = { day: '2026-03-12', text: '12.03.2026', role: 'sampling', anchor };
      assert.deepStrictEqual(cv.checkConversationItem(whichDate(read)), []);
      assert.deepStrictEqual(cv.checkConversationItem(whichDate(read, 'which-document-date', { candidateId: 'd1' })), []);
      // a date copied from a text layer: a label, and an anchor or none
      assert.deepStrictEqual(cv.checkConversationItem(whichDate({ day: '2026-03-12', text: '12.03.2026', label: 'Prélevé le', role: 'sampling' })), []);
      const { bbox: _b, ...noBox } = anchor;
      assert.match(cv.checkConversationItem(whichDate({ ...read, anchor: noBox })).join(), /dates\[0\]\.anchor needs its bbox/);
      assert.match(cv.checkConversationItem(whichDate({ ...read, anchor: { ...anchor, eventId: 'other' } })).join(), /dates\[0\]\.anchor\.eventId must be about/);
      const { eventId: _e, ...noEventId } = anchor;
      assert.match(cv.checkConversationItem(whichDate({ ...read, anchor: noEventId })).join(), /dates\[0\]\.anchor\.eventId must be about/);
      assert.match(cv.checkConversationItem(whichDate({ ...read, label: 'Prélevé le' })).join(), /carries no label/);
      assert.match(cv.checkConversationItem(whichDate({ ...read, anchor: { ...anchor, text: '12.03.2026' } })).join(), /not allowed/, 'the anchor shape is closed');
      // the second date of two is checked too
      assert.match(cv.checkConversationItem({ ...whichDate(read), context: { dates: [read, { ...read, day: '2026-03-13', anchor: noBox }] } }).join(), /dates\[1\]/);
      // is-this-yours on a picture: the identity block's box, no identity; its anchor names its document
      assert.deepStrictEqual(cv.checkConversationItem({ kind: 'question', about: DOC, code: 'is-this-yours', context: { anchor } }), []);
      assert.match(cv.checkConversationItem({ kind: 'question', about: DOC, code: 'is-this-yours', context: { anchor: { ...anchor, eventId: 'other' } } }).join(), /context\.anchor\.eventId must be about/);
      assert.match(cv.checkConversationItem(pv('c1', { anchor: { ...anchor, eventId: 'other' } })).join(), /anchor\.eventId must be about/);
      assert.deepStrictEqual(cv.checkConversationItem(pv('c1', { anchor })), []);
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

    it('[CNV22b] profile match with her other names (4.47.0): a missing part is her profile\'s; nickname, an unknown use or a blank part never matches', () => {
      const born = '1985-03-14';
      const maiden = { name: 'MARTIN Marie-Claire', birthDay: born };
      const match = (identity, otherNames, profile = PROFILE) => cv.profileMatch(identity, { ...profile, otherNames });
      // family only: her profile's given name with it; absent use matches
      assert.strictEqual(match(maiden, [{ family: 'Martin', use: 'maiden' }]), true);
      assert.strictEqual(match(maiden, [{ family: 'Martin' }]), true, 'absent use matches');
      assert.strictEqual(match(maiden, [{ family: 'Martin', use: null }]), true, 'null use is absent');
      assert.strictEqual(match(maiden, []), false);
      assert.strictEqual(match(maiden, null), false);
      // given only: with her profile's family name
      assert.strictEqual(match({ name: 'DUPONT Claire', birthDay: born }, [{ given: 'Claire', use: 'usual' }]), true);
      // both parts, the profile's names not needed
      assert.strictEqual(match({ name: 'Martin, Anne', birthDay: born }, [{ given: 'Anne', family: 'MARTIN', use: 'old' }], { dateOfBirth: born }), true);
      assert.strictEqual(match({ name: 'Martin, Anne', birthDay: born }, [{ given: 'Anne', use: 'old' }], { dateOfBirth: born }), false, 'a part missing on both sides never matches');
      // nickname, an unknown use
      assert.strictEqual(match(maiden, [{ family: 'Martin', use: 'nickname' }]), false);
      assert.strictEqual(match(maiden, [{ family: 'Martin', use: 'anonymous' }]), false);
      // a blank part after normalisation never matches, nor falls back to the profile's
      assert.strictEqual(match({ name: 'MARTIN', birthDay: born }, [{ given: ' - ', family: 'Martin', use: 'official' }]), false);
      assert.strictEqual(match({ name: 'Marie Claire', birthDay: born }, [{ family: '', given: 'Marie Claire' }]), false);
      assert.strictEqual(match({ name: 'Marie Claire', birthDay: born }, [{ family: ' ', given: 'Marie Claire' }]), false);
      // whole token-set equality, as for the profile: an initial, a missing or an extra token never matches
      assert.strictEqual(match({ name: 'MARTIN M.', birthDay: born }, [{ family: 'Martin' }]), false);
      assert.strictEqual(match({ name: 'MARTIN Marie-Claire Anne', birthDay: born }, [{ family: 'Martin' }]), false);
      assert.strictEqual(match({ name: 'Märtin marie claire', birthDay: born }, [{ family: 'MARTIN' }]), true);
      // the birth date condition is unchanged; the profile's own names still match beside other names
      assert.strictEqual(match({ ...maiden, birthDay: '1985-03-15' }, [{ family: 'Martin' }]), false);
      assert.strictEqual(match(maiden, [{ family: 'Martin' }], { ...PROFILE, dateOfBirth: null }), false);
      assert.strictEqual(match({ name: 'DUPONT Marie-Claire', birthDay: born }, [{ family: 'Martin', use: 'nickname' }]), true);
      assert.strictEqual(match(maiden, [{ family: 'Durand' }, { family: 'Martin', use: 'nickname' }, { family: 'Martin', use: 'maiden' }]), true, 'any one of them');
    });

    it('[CNV22c] otherNamesOf: her non-trashed other names; none when the root is absent or not granted', async () => {
      const person = account({
        streams: [{ id: 'other-names', name: 'Other names', parentId: null }],
        events: [
          { id: 'o1', streamIds: ['other-names'], type: 'contact/other-name-v1', time: 1, content: { family: 'Martin', use: 'maiden' } },
          { id: 'o2', streamIds: ['other-names'], type: 'contact/other-name-v1', time: 2, content: { given: 'Claire' } },
          { id: 'o3', streamIds: ['other-names'], type: 'contact/other-name-v1', time: 3, content: { family: 'Durand' }, trashed: true },
          { id: 'o4', streamIds: ['other-names'], type: 'note/txt', time: 4, content: 'Martin' }
        ]
      });
      assert.deepStrictEqual(await cv.otherNamesOf(person), [{ family: 'Martin', use: 'maiden' }, { given: 'Claire' }]);
      const call = person.calls.find(c => c.method === 'events.get');
      assert.deepStrictEqual([call.params.streams, call.params.types], [['other-names'], ['contact/other-name-v1']]);
      assert.deepStrictEqual(await cv.otherNamesOf(account()), []);
      for (const id of ['unknown-referenced-resource', 'forbidden', 'unknown-resource']) {
        assert.deepStrictEqual(await cv.otherNamesOf({ apiOne: async () => { throw apiError(id); } }), [], id);
      }
      await assert.rejects(cv.otherNamesOf({ apiOne: async () => { throw apiError('invalid-access-token'); } }));
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
        hdsSourceAnchor: { attachmentId: 'att1', page: 1, bbox: [8.5, 41.2, 83, 2.1], eventId: DOC },
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

    it('[CNV40b] autoConfirmIdentity on her other name (4.47.0): the same profile-match confirm; never on a nickname', async () => {
      const { person, rel: r, streams } = await setup();
      const maidenQuestion = { ...identityQuestion, context: { identity: { ...identityQuestion.context.identity, name: 'MARTIN Marie-Claire' } } };
      const qId = await cv.writeQuestion(person, streams, maidenQuestion);
      assert.strictEqual(await cv.autoConfirmIdentity(person, r, { about: DOC, profile: PROFILE }), null);
      assert.strictEqual(await cv.autoConfirmIdentity(person, r, { about: DOC, profile: { ...PROFILE, otherNames: [{ family: 'Martin', use: 'nickname' }] } }), null);
      const auto = await cv.autoConfirmIdentity(person, r, { about: DOC, profile: { ...PROFILE, otherNames: [{ family: 'Martin', use: 'maiden' }] } });
      assert.ok(auto?.answerEventId);
      const answer = person.events.get(auto.answerEventId).content;
      assert.deepStrictEqual([answer.inReplyTo, answer.action, answer.basis], [qId, 'confirm', 'profile-match']);
      assert.ok(!JSON.stringify(answer).includes('aiden') && !JSON.stringify(alertsOf(person)).toLowerCase().includes('martin'), 'nothing of her other names reaches the contact');
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

    it('[CNV41b] many values: one answer per 20, each listing its own values; the note on the first; every value answered', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = Array.from({ length: 45 }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions: ids.map(candidateId => ({ candidateId, action: 'confirm' })), shownAt: person.clock, engines: ENGINES, note: 'all mine' });
      assert.deepStrictEqual(res.refused, []);
      assert.deepStrictEqual(res.answers.map(a => a.written.length), [20, 20, 5]);
      const sent = [...person.events.values()].filter(e => e.content?.kind === 'answer');
      assert.deepStrictEqual(sent.map(e => e.content.inReplyTo), [0, 20, 40].map(i => {
        const c = [...person.events.values()].find(e => e.content?.kind === 'proposed-value' && e.content.candidateId === ids[i]);
        return c.id;
      }));
      assert.deepStrictEqual(sent.map(e => e.content.note ?? null), ['all mine', null, null]);
      const seen = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      assert.deepStrictEqual(new Set(seen.proposedValues.map(p => p.state)), new Set(['confirmed']));
    });

    it('[CNV41c] a write that fails in the middle: what was written is answered, not-mine deletes it, a retry writes the rest once', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = Array.from({ length: 25 }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      const qId = await cv.writeQuestion(person, streams, identityQuestion);
      await cv.answerQuestion(person, r, { questionId: qId, action: 'confirm', shownAt: person.clock });
      const values = () => [...person.events.values()].filter(e => e.type === 'concentration/ug-l');
      const shownAt = person.clock;
      const apiOne = person.apiOne;
      let creates = 0;
      person.apiOne = async (method, params, key) => {
        if (method === 'events.create' && params.type === 'concentration/ug-l' && ++creates === 23) throw new Error('offline');
        return apiOne(method, params, key);
      };
      const decisions = ids.map(candidateId => ({ candidateId, action: 'confirm' }));
      await assert.rejects(cv.acceptProposedValues(person, r, { about: DOC, decisions, shownAt, engines: ENGINES }),
        (e) => e.innerObject?.reason === 'write-failed' && Object.keys(e.innerObject.written).length === 22);
      person.apiOne = apiOne;
      const seen = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      assert.strictEqual(seen.proposedValues.filter(p => p.state === 'confirmed').length, 22, 'every value written is answered');
      const rest = await cv.acceptProposedValues(person, r, { about: DOC, decisions, shownAt: person.clock, engines: ENGINES });
      assert.strictEqual(rest.refused.length, 22, 'the answered ones are not asked twice');
      assert.deepStrictEqual(rest.answers.map(a => a.written.length), [3]);
      assert.strictEqual(values().length, 25);
      const no = await cv.answerQuestion(person, r, { questionId: qId, action: 'not-mine', shownAt: person.clock });
      assert.strictEqual(no.deletedValueIds.length, 25);
      assert.strictEqual(values().length, 0);
    });

    it('[CNV41d] not-mine before the retry deletes the values of a failed write', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = ['c1', 'c2', 'c3'];
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      const qId = await cv.writeQuestion(person, streams, identityQuestion);
      await cv.answerQuestion(person, r, { questionId: qId, action: 'confirm', shownAt: person.clock });
      const apiOne = person.apiOne;
      let creates = 0;
      person.apiOne = async (method, params, key) => {
        if (method === 'events.create' && params.type === 'concentration/ug-l' && ++creates === 3) throw new Error('offline');
        return apiOne(method, params, key);
      };
      await assert.rejects(cv.acceptProposedValues(person, r, { about: DOC, decisions: ids.map(candidateId => ({ candidateId, action: 'confirm' })), shownAt: person.clock, engines: ENGINES }),
        (e) => e.innerObject?.reason === 'write-failed');
      person.apiOne = apiOne;
      const no = await cv.answerQuestion(person, r, { questionId: qId, action: 'not-mine', shownAt: person.clock });
      assert.strictEqual(no.deletedValueIds.length, 2);
      assert.strictEqual([...person.events.values()].filter(e => e.type === 'concentration/ug-l').length, 0);
    });

    it('[CNV41e] a first batch written, its alert not posted: the next batches still written, then alert-not-posted', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = Array.from({ length: 25 }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      const apiOne = person.apiOne;
      let alerts = 0;
      person.apiOne = async (method, params, key) => {
        if (method === 'events.create' && params.type === 'notification/alert-cmc' && ++alerts === 1) throw new Error('offline');
        return apiOne(method, params, key);
      };
      const err = await cv.acceptProposedValues(person, r, { about: DOC, decisions: [...ids.map(candidateId => ({ candidateId, action: 'confirm' })), { candidateId: 'zz', action: 'confirm' }], shownAt: person.clock, engines: ENGINES })
        .then(() => null, (e) => e);
      person.apiOne = apiOne;
      const sent = [...person.events.values()].filter(e => e.content?.kind === 'answer');
      assert.deepStrictEqual(sent.map(e => e.content.written.length), [20, 5], 'both batches are answered');
      assert.strictEqual(err.innerObject.reason, 'alert-not-posted');
      assert.deepStrictEqual(err.innerObject.notPosted, [sent[0].id]);
      assert.deepStrictEqual(err.innerObject.refused, [{ candidateId: 'zz', reason: 'unknown-candidate' }]);
      assert.strictEqual(alertsOf(person).length, 1, 'the second answer is announced');
      const seen = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      assert.strictEqual(seen.proposedValues.filter(p => p.state === 'confirmed').length, 25);
    });

    it('[CNV41g] the answer itself fails after values were written: write-failed lists them, a retry heals and not-mine then deletes them', async () => {
      const { person, rel: r, streams } = await setup();
      await cv.writeProposedValues(person, streams, DOC, [pv('c1'), pv('c2')]);
      const qId = await cv.writeQuestion(person, streams, identityQuestion);
      await cv.answerQuestion(person, r, { questionId: qId, action: 'confirm', shownAt: person.clock });
      const apiOne = person.apiOne;
      let answers = 0;
      person.apiOne = async (method, params, key) => {
        if (method === 'events.create' && params.content?.kind === 'answer' && ++answers === 1) throw new Error('offline');
        return apiOne(method, params, key);
      };
      const decisions = ['c1', 'c2'].map(candidateId => ({ candidateId, action: 'confirm' }));
      await assert.rejects(cv.acceptProposedValues(person, r, { about: DOC, decisions, shownAt: person.clock, engines: ENGINES }),
        (e) => e.innerObject?.reason === 'write-failed' && Object.keys(e.innerObject.written).length === 2);
      person.apiOne = apiOne;
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions, shownAt: person.clock, engines: ENGINES });
      assert.deepStrictEqual(res.answers.map(a => a.written.length), [2]);
      assert.strictEqual([...person.events.values()].filter(e => e.type === 'concentration/ug-l').length, 2);
      const no = await cv.answerQuestion(person, r, { questionId: qId, action: 'not-mine', shownAt: person.clock });
      assert.strictEqual(no.deletedValueIds.length, 2);
    });

    it('[CNV41h] a conversation that cannot be read between two batches: write-failed, the first batch answered', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = Array.from({ length: 21 }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      const apiOne = person.apiOne;
      let answered = false;
      person.apiOne = async (method, params, key) => {
        if (answered && method === 'events.get') throw new Error('offline');
        const out = await apiOne(method, params, key);
        if (method === 'events.create' && params.content?.kind === 'answer') answered = true;
        return out;
      };
      await assert.rejects(cv.acceptProposedValues(person, r, { about: DOC, decisions: ids.map(candidateId => ({ candidateId, action: 'confirm' })), shownAt: person.clock, engines: ENGINES }),
        (e) => e.innerObject?.reason === 'write-failed' && Object.keys(e.innerObject.written).length === 20);
      person.apiOne = apiOne;
      const seen = cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
      assert.strictEqual(seen.proposedValues.filter(p => p.state === 'confirmed').length, 20);
    });

    it('[CNV41i] corrections keep their own answer across batches; a first batch wholly refused leaves the note for the next', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = Array.from({ length: 21 }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      const correction = { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content: 50 };
      const mixed = [...ids.slice(0, 20).map(candidateId => ({ candidateId, action: 'confirm' })), { candidateId: 'c21', action: 'correct', correction }];
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions: mixed, shownAt: person.clock, engines: ENGINES });
      assert.deepStrictEqual(res.answers.map(a => [a.action, a.written.length]), [['confirm', 20], ['correct', 1]]);
      const D4 = 'ckdoc0000004';
      await cv.writeProposedValues(person, streams, D4, [pv('k1', { about: D4 })]);
      const unknown = Array.from({ length: 20 }, (_, i) => ({ candidateId: 'x' + i, action: 'confirm' }));
      const late = await cv.acceptProposedValues(person, r, { about: D4, decisions: [...unknown, { candidateId: 'k1', action: 'confirm' }], shownAt: person.clock, engines: ENGINES, note: 'mine' });
      assert.strictEqual(late.refused.length, 20);
      const noted = [...person.events.values()].filter(e => e.content?.kind === 'answer' && e.content.about === D4);
      assert.deepStrictEqual(noted.map(e => e.content.note ?? null), ['mine']);
    });

    it('[CNV41j] a run over several batches confirms the skipped and duplicate candidates first', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = Array.from({ length: 22 }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      await cv.answerProposedValues(person, r, { about: DOC, candidateIds: ['c22'], action: 'skip', shownAt: person.clock });
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions: ids.map(candidateId => ({ candidateId, action: 'confirm' })), shownAt: person.clock, engines: ENGINES });
      assert.deepStrictEqual(res.refused, []);
      assert.ok(res.answers[0].written.some(w => w.candidateId === 'c22'), 'the skipped one is in the first batch');
    });

    it('[CNV41f] a candidate that changed between two batches is refused, not written', async () => {
      const { person, rel: r, streams } = await setup();
      const ids = Array.from({ length: 21 }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(person, streams, DOC, ids.map(id => pv(id)));
      const shownAt = person.clock;
      const apiOne = person.apiOne;
      let changed = false;
      person.apiOne = async (method, params, key) => {
        const out = await apiOne(method, params, key);
        if (!changed && method === 'events.create' && params.content?.kind === 'answer') {
          changed = true;
          const last = [...person.events.values()].find(e => e.content?.kind === 'proposed-value' && e.content.candidateId === 'c21');
          last.modified = shownAt + 1000;
        }
        return out;
      };
      const res = await cv.acceptProposedValues(person, r, { about: DOC, decisions: ids.map(candidateId => ({ candidateId, action: 'confirm' })), shownAt, engines: ENGINES });
      assert.deepStrictEqual(res.refused, [{ candidateId: 'c21', reason: 'changed-since-shown' }]);
      assert.strictEqual(res.answers[0].written.length, 20);
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

  describe('[CNV-T] a table read per column on a picture (4.39.0)', () => {
    const X = { engine: 'hds-reader', engineVersion: '0.11.0', kbVersion: '0.4.0', backend: 'bedrock:sonnet' };
    const DAY1 = Date.parse('2026-03-12T12:00:00Z') / 1000;
    const heading = (index) => ({ column: { index }, anchor: { eventId: DOC, attachmentId: 'att1', page: 1, bbox: [30 + index * 10, 18.3, 9, 4.2] } });
    const columnDate = (index = 2) => ({ kind: 'question', about: DOC, code: 'which-column-date', context: heading(index) });
    const value = (index, over = {}) => ({ kind: 'proposed-value', about: DOC, candidateId: 'c-t' + index, printed: { label: 'Ferritine', value: '48', unit: 'ng/mL' }, column: { index }, anchor: { eventId: DOC, attachmentId: 'att1', page: 1 }, proposal: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content: 48, time: DAY1, clientData: { hdsTimePrecision: 'day' } }, status: 'clear', extraction: X, ...over });
    const item = (id, kind, content, created = 10) => ({ id, kind, about: DOC, direction: kind === 'answer' ? 'sent' : 'received', content, created, modified: created, time: created });

    it('[CNVT1] a column question: its column and heading box, no candidate, no date; answered with a day at 12:00 UTC', () => {
      assert.deepStrictEqual(cv.checkConversationItem(columnDate()), []);
      for (const b of [{ ...columnDate(), candidateId: 'c-1' }, { ...columnDate(), context: { column: { index: 2 } } }, { ...columnDate(), context: { anchor: heading(2).anchor } },
        { ...columnDate(), context: { ...heading(2), anchor: { attachmentId: 'att1', page: 1 } } }, { ...columnDate(), context: { ...heading(2), dates: [{ day: '2026-03-12', text: '12.03.26' }] } }]) {
        assert.notDeepEqual(cv.checkConversationItem(JSON.parse(JSON.stringify(b))), [], JSON.stringify(b));
      }
      const q = item('q1', 'question', columnDate());
      const conv = cv.conversationOf([q], DOC);
      assert.strictEqual(conv.questions[0].answerable, true);
      const answer = (over) => ({ kind: 'answer', inReplyTo: 'q1', about: DOC, action: 'confirm', time: DAY1, timePrecision: 'day', ...over });
      assert.deepStrictEqual(cv.checkAnswerFor(answer({}), q, conv), []);
      assert.deepStrictEqual(cv.checkAnswerFor({ kind: 'answer', inReplyTo: 'q1', about: DOC, action: 'skip' }, q, conv), []);
      for (const over of [{ time: DAY1 + 3600 }, { timePrecision: 'month' }, { time: undefined, timePrecision: undefined }]) {
        assert.notDeepEqual(cv.checkAnswerFor(JSON.parse(JSON.stringify(answer(over))), q, conv), [], JSON.stringify(over));
      }
    });

    it('[CNVT2] a value names its column; a which-date answer never dates a value of such a table', () => {
      assert.deepStrictEqual(cv.checkConversationItem(value(2)), []);
      const undated = { ...value(2), proposal: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content: 48 } };
      const whole = [item('q0', 'question', { kind: 'question', about: DOC, code: 'which-date' }), item('a0', 'answer', { kind: 'answer', inReplyTo: 'q0', about: DOC, action: 'confirm', time: DAY1, timePrecision: 'day' }, 20)];
      assert.strictEqual(cv.answeredDateOf(cv.conversationOf([...whole, item('v1', 'proposed-value', undated)], DOC), 'c-t2'), null);
      const { column: _c, ...plain } = undated;
      assert.strictEqual(cv.answeredDateOf(cv.conversationOf([...whole, item('q1', 'question', columnDate()), item('v1', 'proposed-value', plain)], DOC), 'c-t2'), null);
      assert.deepStrictEqual(cv.answeredDateOf(cv.conversationOf([...whole, item('v1', 'proposed-value', plain)], DOC), 'c-t2'), { time: DAY1, timePrecision: 'day' });
    });
  });

  describe('[CNV-G] a dated grid (4.36.0)', () => {
    const X = { engine: 'hds-reader', engineVersion: '0.9.0', kbVersion: '0.4.0', backend: 'bedrock:sonnet' };
    const box = (column, row = 2) => ({ grid: { row, column }, anchor: { eventId: DOC, attachmentId: 'att1', page: 1, bbox: [column * 2.5, 22.4, 2.5, 12.9] } });
    const DAY1 = Date.parse('2026-03-12T12:00:00Z') / 1000;
    const value = (column, over = {}) => ({ kind: 'proposed-value', about: DOC, candidateId: 'c-' + column, printed: { label: String(column), value: 'P' }, ...box(column), proposal: { itemKey: 'fertility-cycles-peak-day', type: 'activity/plain', content: null, time: DAY1, clientData: { hdsTimePrecision: 'day' } }, status: 'check', extraction: X, ...over });
    const notRead = (column) => ({ kind: 'proposed-value', about: DOC, candidateId: 'n-' + column, printed: { label: String(column) }, ...box(column), status: 'unmapped', reason: 'not-read', extraction: X });
    const rowDate = (row = 2) => ({ kind: 'question', about: DOC, code: 'which-row-date', context: box(1, row) });
    const item = (id, kind, content, created = 10) => ({ id, kind, about: DOC, direction: kind === 'answer' ? 'sent' : 'received', content, created, modified: created, time: created });

    it('[CNVG1] a peak mark (null content), a box not read and a row question are valid', () => {
      assert.deepStrictEqual(cv.checkConversationItem(value(14)), []);
      assert.deepStrictEqual(cv.checkConversationItem(notRead(15)), []);
      assert.deepStrictEqual(cv.checkConversationItem(rowDate()), []);
      assert.strictEqual(cv.checkValueProposal(value(14).proposal), null);
    });

    it('[CNVG2] a box not read carries its box and nothing read; a value read carries what is written', () => {
      const bad = [
        { ...notRead(15), printed: { label: '15', value: '10KL' } }, { ...notRead(15), proposal: value(15).proposal }, { ...notRead(15), requestKey: 'x' },
        { ...notRead(15), status: 'check' }, { ...notRead(15), grid: undefined }, { ...notRead(15), anchor: { attachmentId: 'att1', page: 1 } },
        { ...value(14), printed: { label: '14' } }
      ];
      for (const b of bad) assert.notDeepEqual(cv.checkConversationItem(JSON.parse(JSON.stringify(b))), [], JSON.stringify(b));
    });

    it('[CNVG3] a row question: its box and anchor, no candidate, no dates; answered with a day at 12:00 UTC', () => {
      for (const b of [{ ...rowDate(), candidateId: 'c-1' }, { ...rowDate(), context: { grid: box(1).grid } }, { ...rowDate(), context: { anchor: box(1).anchor } }, { ...rowDate(), context: { ...box(1), dates: [{ day: '2026-03-12', text: '12/3' }] } }]) {
        assert.notDeepEqual(cv.checkConversationItem(b), [], JSON.stringify(b));
      }
      const q = item('q1', 'question', rowDate());
      const conv = cv.conversationOf([q], DOC);
      assert.strictEqual(conv.questions[0].answerable, true);
      const answer = (over) => ({ kind: 'answer', inReplyTo: 'q1', about: DOC, action: 'confirm', time: DAY1, timePrecision: 'day', ...over });
      assert.deepStrictEqual(cv.checkAnswerFor(answer({}), q, conv), []);
      assert.deepStrictEqual(cv.checkAnswerFor({ kind: 'answer', inReplyTo: 'q1', about: DOC, action: 'skip' }, q, conv), []);
      for (const over of [{ time: DAY1 + 3600 }, { timePrecision: 'month' }, { timePrecision: 'unknown', time: undefined }, { time: undefined, timePrecision: undefined }]) {
        assert.notDeepEqual(cv.checkAnswerFor(JSON.parse(JSON.stringify(answer(over))), q, conv), [], JSON.stringify(over));
      }
    });

    it('[CNVG4] a which-date answer never dates a value of a dated grid', () => {
      const undated = { ...value(14), proposal: { itemKey: 'fertility-cycles-peak-day', type: 'activity/plain', content: null } };
      const whole = [item('q0', 'question', { kind: 'question', about: DOC, code: 'which-date' }), item('a0', 'answer', { kind: 'answer', inReplyTo: 'q0', about: DOC, action: 'confirm', time: DAY1, timePrecision: 'day' }, 20)];
      const grid = cv.conversationOf([...whole, item('v1', 'proposed-value', undated)], DOC);
      assert.deepStrictEqual(grid.documentDate, { time: DAY1, timePrecision: 'day' });
      assert.strictEqual(cv.answeredDateOf(grid, 'c-14'), null);
      const { grid: _g, ...plain } = undated;
      assert.deepStrictEqual(cv.answeredDateOf(cv.conversationOf([...whole, item('v1', 'proposed-value', plain)], DOC), 'c-14'), { time: DAY1, timePrecision: 'day' });
      assert.strictEqual(cv.answeredDateOf(cv.conversationOf([...whole, item('q1', 'question', rowDate()), item('v1', 'proposed-value', plain)], DOC), 'c-14'), null);
    });

    it('[CNVG6] a value with no content she already has: null equals absent', () => {
      const pv = item('v1', 'proposed-value', value(14));
      for (const e of [{ type: 'activity/plain', content: null }, { type: 'activity/plain' }]) assert.strictEqual(cv.holdsProposedValue(e, pv), true);
    });

    it('[CNVG5] request-item does not answer a box not read; skip does', () => {
      const pv = item('v2', 'proposed-value', notRead(15));
      const conv = cv.conversationOf([pv], DOC);
      const answer = (action) => ({ kind: 'answer', inReplyTo: 'v2', about: DOC, action, candidateIds: ['n-15'] });
      assert.notDeepEqual(cv.checkAnswerFor(answer('request-item'), pv, conv), []);
      assert.deepStrictEqual(cv.checkAnswerFor(answer('skip'), pv, conv), []);
    });
  });
});
