import { assert } from './test-utils/deps-node.js';
import { corrections } from '../ts/index.ts';

const COLLECTORS = ':_cmc:apps:hds-patient:collectors:monitor--api-x';
const CHANNEL = [
  { streamId: ':_cmc:inbox', level: 'create-only' },
  { streamId: COLLECTORS, level: 'contribute' }
];

function apiError (id) {
  const e = new Error(id);
  e.innerObject = { id };
  return e;
}

/** An account as the platform keeps it: a stream tree, accesses, and scope updates applied on read. */
function account ({ streams = [], accesses = [], tokenType = 'personal' } = {}) {
  const state = { streams: structuredClone(streams), accesses, events: new Map(), calls: [], grant: null, n: 0 };
  const tree = (parentId, all) => state.streams
    .filter(s => (s.parentId ?? null) === parentId && (all || !s.trashed))
    .map(s => ({ ...s, children: tree(s.id, all) }));
  state.accessInfo = async () => ({ type: tokenType });
  state.apiOne = async function (method, params, key) {
    state.calls.push({ method, params });
    const out = (k, v) => key ? v : { [k]: v };
    switch (method) {
      case 'streams.get':
        if (params.parentId && !state.streams.find(s => s.id === params.parentId)) throw apiError('unknown-referenced-resource');
        return out('streams', tree(params.parentId ?? null, params.state === 'all'));
      case 'streams.create': {
        if (state.streams.find(s => s.id === params.id)) throw apiError('item-already-exists');
        const s = { parentId: null, ...structuredClone(params) };
        state.streams.push(s);
        return out('stream', s);
      }
      case 'streams.update': {
        const s = state.streams.find(x => x.id === params.id);
        if (!s) throw apiError('unknown-resource');
        Object.assign(s, structuredClone(params.update));
        return out('stream', s);
      }
      case 'streams.delete': {
        const s = state.streams.find(x => x.id === params.id);
        if (!s) throw apiError('unknown-resource');
        if (!s.trashed) { s.trashed = true; return out('stream', s); }
        state.streams = state.streams.filter(x => x.id !== params.id);
        return out('streamDeletion', { id: params.id });
      }
      case 'accesses.get':
        return out('accesses', state.accesses);
      case 'events.create': {
        const e = { id: 'ev-' + (++state.n), ...structuredClone(params) };
        state.events.set(e.id, e);
        return out('event', structuredClone(e));
      }
      case 'events.get':
        return out('events', [...state.events.values()].filter(e => (e.streamIds ?? []).some(s => params.streams.includes(s))).slice(0, params.limit ?? Infinity));
      case 'events.getOne': {
        const e = state.events.get(params.id);
        if (!e) throw apiError('unknown-resource');
        if (e.type === 'consent/scope-update-cmc' && e.content.applied == null) {
          e.content = { ...e.content, applied: true, status: 'completed' };
          state.grant = e.content.newPermissions;
        }
        return out('event', structuredClone(e));
      }
      default:
        throw new Error('unexpected ' + method);
    }
  };
  return state;
}

const ROOT = { id: 'entry-corrections', name: 'Corrections from your contacts', parentId: null };
const child = (id, relationship, over = {}) => ({ id, name: id, parentId: 'entry-corrections', clientData: relationship ? { hdsEntryCorrections: { relationship } } : {}, ...over });
const rel = (grant = [{ streamId: 'body-vulva-mucus-inspect', level: 'read' }], accessId = 'acc-1') =>
  ({ accessId, localCollectorStreamId: COLLECTORS, grantedPermissions: [...grant, ...CHANNEL] });
const ID_A = 'corr-aaaaaaaaaaaa';
const ID_B = 'corr-bbbbbbbbbbbb';

describe('[CORS] corrections: the person\'s children', function () {
  it('[CORS1] withoutCorrectionsAsk drops the minted ask only, in any spelling', () => {
    const perms = [
      { streamId: 'body-vulva-mucus-inspect', level: 'read' },
      { streamId: ':local:entry-corrections', level: 'contribute' },
      { streamId: 'entry-corrections', level: 'read' }
    ];
    assert.deepEqual(corrections.withoutCorrectionsAsk(perms).map(p => p.level), ['read', 'read']);
    assert.equal(corrections.asksForCorrections(perms), true);
    assert.equal(corrections.namesCorrectionStreams([{ streamId: 'body-weight' }]), false);
    assert.equal(corrections.namesCorrectionStreams([{ streamId: ID_A }]), true);
  });

  it('[CORS2] ensureCorrectionStream mints the root, a marked child, and grants it contribute by scope update', async () => {
    const person = account();
    const r = rel();
    const { streamId, scopeUpdate } = await corrections.ensureCorrectionStream(person, r);
    assert.ok(corrections.isCorrectionStreamId(streamId));
    const root = person.streams.find(s => s.id === 'entry-corrections');
    assert.equal(root.parentId, null);
    const made = person.streams.find(s => s.id === streamId);
    assert.deepEqual([made.parentId, made.name, made.clientData], ['entry-corrections', streamId, { hdsEntryCorrections: { relationship: 'acc-1' } }]);
    assert.ok(scopeUpdate != null);
    assert.ok(person.grant.some(p => p.streamId === streamId && p.level === 'contribute'));
    assert.ok(!person.grant.some(p => p.streamId === 'entry-corrections'), 'never the root');
    assert.equal(await corrections.correctionStreamFor(person, 'acc-1'), streamId);
  });

  it('[CORS3] ensureCorrectionStream is idempotent, and raises a child granted at another level', async () => {
    const person = account({ streams: [ROOT, child(ID_A, 'acc-1')] });
    const done = await corrections.ensureCorrectionStream(person, rel([{ streamId: ID_A, level: 'contribute' }]));
    assert.deepEqual([done.streamId, done.scopeUpdate], [ID_A, null]);
    const raised = await corrections.ensureCorrectionStream(person, rel([{ streamId: ID_A, level: 'read' }]));
    assert.equal(raised.streamId, ID_A);
    assert.ok(person.grant.some(p => p.streamId === ID_A && p.level === 'contribute'));
    assert.equal(person.streams.filter(s => s.parentId === 'entry-corrections').length, 1, 'no second child');
  });

  it('[CORS4] another relationship\'s child is never reused', async () => {
    const person = account({ streams: [ROOT, child(ID_A, 'acc-9')] });
    const { streamId } = await corrections.ensureCorrectionStream(person, rel());
    assert.notEqual(streamId, ID_A);
  });

  it('[CORS5] checkOfferedCorrections: a free new id from a single-use invite passes; from an open link it is refused', async () => {
    const person = account();
    const asked = [{ streamId: ID_A, level: 'contribute' }];
    assert.deepEqual(await corrections.checkOfferedCorrections(person, asked, { singleUse: true }), []);
    assert.deepEqual((await corrections.checkOfferedCorrections(person, asked, { singleUse: false })).map(i => i.code), ['not-single-use']);
  });

  it('[CORS6] checkOfferedCorrections refuses another contact\'s child, one named by another access, the root at manage', async () => {
    const person = account({
      streams: [ROOT, child(ID_A, 'acc-9'), child(ID_B, null)],
      accesses: [{ id: 'acc-9', permissions: [{ streamId: ID_B, level: 'contribute' }] }]
    });
    const codes = async (perms, opts = { singleUse: true }) => (await corrections.checkOfferedCorrections(person, perms, opts)).map(i => i.code);
    assert.deepEqual(await codes([{ streamId: ID_A, level: 'contribute' }]), ['child-taken']);
    assert.deepEqual(await codes([{ streamId: ID_B, level: 'contribute' }]), ['child-taken']);
    assert.deepEqual(await codes([{ streamId: 'entry-corrections', level: 'manage' }]), ['root-level']);
    assert.deepEqual(await codes([{ streamId: ID_A, level: 'read' }], { accessId: 'acc-9', singleUse: false }), ['child-not-contribute']);
    // its own, marked or named by its access (an interrupted accept), on a scope request
    assert.deepEqual(await codes([{ streamId: ID_A, level: 'contribute' }], { accessId: 'acc-9', singleUse: false }), []);
    assert.deepEqual(await codes([{ streamId: ID_B, level: 'contribute' }], { accessId: 'acc-9', singleUse: false }), []);
  });

  it('[CORS7] checkOfferedCorrections reads nothing when no corr- child is named', async () => {
    const person = account();
    assert.deepEqual(await corrections.checkOfferedCorrections(person, [{ streamId: 'entry-corrections', level: 'contribute' }], { singleUse: false }), []);
    assert.equal(person.calls.length, 0);
  });

  it('[CORS8] markOfferedCorrectionStreams creates or marks the named child; refuses one that is not free', async () => {
    const person = account({ streams: [ROOT, child(ID_B, null)] });
    assert.deepEqual(await corrections.markOfferedCorrectionStreams(person, { accessId: 'acc-1', grantedPermissions: [{ streamId: ID_A, level: 'contribute' }] }), [ID_A]);
    assert.deepEqual(person.streams.find(s => s.id === ID_A).clientData, { hdsEntryCorrections: { relationship: 'acc-1' } });
    await corrections.markOfferedCorrectionStreams(person, { accessId: 'acc-2', grantedPermissions: [{ streamId: ID_B, level: 'contribute' }] });
    assert.deepEqual(person.streams.find(s => s.id === ID_B).clientData, { hdsEntryCorrections: { relationship: 'acc-2' } });
    await assert.rejects(
      () => corrections.markOfferedCorrectionStreams(person, { accessId: 'acc-3', grantedPermissions: [{ streamId: ID_A, level: 'contribute' }] }),
      (e) => e.innerObject?.reason === 'correction-id-taken'
    );
    assert.deepEqual(await corrections.markOfferedCorrectionStreams(person, { accessId: 'acc-1', grantedPermissions: [{ streamId: 'body-weight' }] }), []);
  });

  it('[CORS10] checkGrantedCorrections: the root above read (the minted ask too) and another\'s child; its own child passes', async () => {
    const person = account({ streams: [ROOT, child(ID_A, 'acc-9'), child(ID_B, null)], accesses: [{ id: 'acc-1', permissions: [{ streamId: ID_B, level: 'contribute' }] }] });
    const codes = async (perms) => (await corrections.checkGrantedCorrections(person, perms, { accessId: 'acc-1' })).map(i => i.code);
    assert.deepEqual(await codes([{ streamId: 'entry-corrections', level: 'contribute' }]), ['root-level']);
    assert.deepEqual(await codes([{ streamId: ':local:entry-corrections', level: 'manage' }]), ['root-level']);
    assert.deepEqual(await codes([{ streamId: 'entry-corrections', level: 'read' }]), []);
    assert.deepEqual(await codes([{ streamId: ID_A, level: 'contribute' }]), ['child-taken']);
    // unmarked, named by this relationship's own access: an interrupted accept, its own
    assert.deepEqual(await codes([{ streamId: ID_B, level: 'contribute' }]), []);
  });

  it('[CORS11] releaseUnclaimedCorrectionStreams deletes only a child this accept created and nobody took', async () => {
    const ID_C = 'corr-cccccccccccc';
    const ID_D = 'corr-dddddddddddd';
    const ID_E = 'corr-eeeeeeeeeeee';
    const person = account({
      streams: [ROOT, child(ID_A, null), child(ID_B, 'acc-1'), child(ID_C, null), child(ID_D, null), child(ID_E, null)],
      accesses: [{ id: 'acc-2', permissions: [{ streamId: ID_C, level: 'contribute' }] }]
    });
    person.events.set('ev-x', { id: 'ev-x', streamIds: [ID_E] });
    // ID_D was there before the accept; ID_E holds an event; ID_B is marked; ID_C is named by an access
    assert.deepEqual(await corrections.releaseUnclaimedCorrectionStreams(person, [ID_A, ID_B, ID_C, ID_D, ID_E, 'body-weight'], [ID_D]), [ID_A]);
    assert.deepEqual(person.streams.map(s => s.id), ['entry-corrections', ID_B, ID_C, ID_D, ID_E]);
  });

  it('[CORS14] isDefiniteAcceptFailure: a typed CMC refusal only, never a timeout, a used link or a network error', () => {
    const err = (id) => Object.assign(new Error(id), { id });
    assert.equal(corrections.isDefiniteAcceptFailure(err('cmc-granted-permissions-not-subset')), true);
    for (const id of ['cmc-capability-timeout', 'cmc-capability-consumed', 'cmc-capability-already-accepted-by-you']) {
      assert.equal(corrections.isDefiniteAcceptFailure(err(id)), false, id);
    }
    assert.equal(corrections.isDefiniteAcceptFailure(new TypeError('fetch failed')), false);
  });

  it('[CORS12] correctionsAskRefusal: a minted ask is narrowable only with a choice, not mandatory, and something else', () => {
    const other = { streamId: 'easy-monitor', level: 'manage' };
    const ask = { streamId: 'entry-corrections', level: 'contribute' };
    assert.equal(corrections.correctionsAskRefusal([other, ask], true), null);
    assert.equal(corrections.correctionsAskRefusal([other, ask], false), 'no-user-choice');
    assert.equal(corrections.correctionsAskRefusal([other, { ...ask, mandatory: true }], true), 'mandatory');
    assert.equal(corrections.correctionsAskRefusal([ask], true), 'nothing-else');
    assert.equal(corrections.correctionsAskRefusal([other], false), null);
  });

  it('[CORS13] a child granted under another spelling is raised by its id', async () => {
    const person = account({ streams: [ROOT, child(ID_A, 'acc-1')] });
    await corrections.ensureCorrectionStream(person, rel([{ streamId: ':local:' + ID_A, level: 'read' }]));
    assert.ok(person.grant.some(p => p.streamId === ID_A && p.level === 'contribute'));
  });

  it('[CORS9] a trashed child is listed with includeTrashed only, and is never a relationship\'s live child', async () => {
    const person = account({ streams: [ROOT, child(ID_A, 'acc-1', { trashed: true })] });
    assert.deepEqual(await corrections.listCorrectionStreams(person), []);
    assert.deepEqual((await corrections.listCorrectionStreams(person, { includeTrashed: true })).map(s => [s.id, s.trashed]), [[ID_A, true]]);
    assert.equal(await corrections.correctionStreamFor(person, 'acc-1'), null);
    await assert.rejects(
      () => corrections.markOfferedCorrectionStreams(person, { accessId: 'acc-1', grantedPermissions: [{ streamId: ID_A, level: 'contribute' }] }),
      (e) => e.innerObject?.reason === 'correction-id-taken'
    );
  });
});
