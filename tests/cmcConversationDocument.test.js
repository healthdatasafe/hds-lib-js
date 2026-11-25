/**
 * data-model 4.26.0, CONVERSATION.md: a document's date and kind (`proposed-document`, `which-document-kind`,
 * `which-document-date`, `answer.applied`, `basis: not-pending`), her note (`answer.note`), and the document's values
 * (`hdsDocumentValues` on the document, `hdsPrintedIn` on a value she already had). Needs a model ≥ 4.26.0
 * (HDS_TEST_MODEL_BASE until it is published).
 */
import { assert } from './test-utils/deps-node.js';
import { cmcConversation as cv, cmcDocuments } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

const MODEL_BASE = globalThis.process?.env?.HDS_TEST_MODEL_BASE ?? 'https://model.datasafe.dev';
const COLLECTORS = ':_cmc:apps:hds-patient:collectors:reader--api-x';
const CHANNEL = [{ streamId: ':_cmc:inbox', level: 'create-only' }, { streamId: COLLECTORS, level: 'contribute' }];
const ENGINES = cv.vouchedEnginesFor('hds-bridge-reader');
const D = 1773316800; // 2026-03-12T12:00:00Z
const ADDED = 1773900000;

function apiError (id) { const e = new Error(id); e.innerObject = { id }; return e; }

/** Her account in memory: `events.update` merges `clientData` (a null key removed), `events.get` filters on it. */
function account () {
  const state = { streams: [], events: new Map(), grant: null, n: 0, clock: 1000 };
  const tick = () => ++state.clock;
  const atPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
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
        if (!e) throw apiError('unknown-resource');
        const { clientData, ...rest } = structuredClone(params.update);
        Object.assign(e, rest);
        if (clientData != null) {
          e.clientData = { ...(e.clientData ?? {}) };
          for (const [k, v] of Object.entries(clientData)) { if (v === null) delete e.clientData[k]; else e.clientData[k] = v; }
        }
        e.modified = tick();
        return out('event', structuredClone(e));
      }
      case 'events.delete': {
        const e = state.events.get(params.id);
        if (!e) throw apiError('unknown-resource');
        if (e.trashed) state.events.delete(params.id); else e.trashed = true;
        return out('event', {});
      }
      case 'events.get':
        return out('events', [...state.events.values()]
          .filter(e => params.state === 'all' || !e.trashed)
          .filter(e => params.streams == null || e.streamIds.some(id => params.streams.includes(id)))
          .filter(e => !params.types || params.types.includes(e.type))
          .filter(e => params.fromTime == null || e.time >= params.fromTime)
          .filter(e => params.toTime == null || e.time <= params.toTime)
          .filter(e => (params.clientData ?? []).every(f => atPath(e.clientData, f.path) === f.eq))
          .map(e => structuredClone(e)).slice(params.skip ?? 0, (params.skip ?? 0) + (params.limit ?? Infinity)));
      case 'accesses.get':
        return out('accesses', []);
      default:
        throw new Error('unexpected ' + method);
    }
  };
  return state;
}

const extraction = { engine: 'hds-reader', engineVersion: '0.4.0', kbVersion: '0.4.0', backend: 'text-layer' };
const kindOf = (key) => getModel().documentKinds.forKey(key);

/** Her placeholder document (DOCUMENTS.md): kind other, the moment added, both fields pending. */
async function placeholder (person, pending = ['time', 'kind']) {
  const other = kindOf('other');
  return await person.apiOne('events.create', {
    streamIds: ['documents'],
    type: 'file/xds-v1',
    time: ADDED,
    content: { class: other.class, type: [other.type], title: 'IMG_2041.jpg', language: 'und' },
    clientData: { hdsDocumentPending: pending }
  }, 'event');
}

async function setup (pending) {
  const person = account();
  const r = { accessId: 'acc-1:2', localCollectorStreamId: COLLECTORS, grantedPermissions: [{ streamId: 'body-weight', level: 'read' }, ...CHANNEL] };
  await cv.ensureConversationStreams(person, r);
  const streams = cv.conversationStreamsOf(person.grant);
  const rel = { ...r, grantedPermissions: person.grant.concat(CHANNEL) };
  const doc = await placeholder(person, pending);
  const DOC = doc.id;
  const conv = async () => cv.conversationOf(await cv.listConversationItems(person, streams, { about: DOC }), DOC);
  const document = () => person.apiOne('events.getOne', { id: DOC }, 'event');
  const proposed = (candidateId, proposal, over = {}) => ({ kind: 'proposed-document', about: DOC, candidateId, proposal, status: 'clear', extraction, ...over });
  return { person, rel, streams, DOC, conv, document, proposed };
}

describe('[CNVD] a document\'s date and kind, her note, the document\'s values (data-model 4.26.0)', function () {
  before(async function () {
    this.timeout(20000);
    await getModel().load(`${MODEL_BASE}/pack.json`);
  });

  it('[CNVD1] pending fields: the flag, less a stale entry (an older app set the date or the kind)', async () => {
    const { document } = await setup();
    const doc = await document();
    assert.deepStrictEqual(cv.pendingFieldsOf(doc), ['time', 'kind']);
    assert.deepStrictEqual(cv.pendingFieldsOf({ ...doc, clientData: { ...doc.clientData, hdsTimePrecision: 'day' } }), ['kind'], 'time set by an older app');
    const lab = kindOf('laboratory-report');
    assert.deepStrictEqual(cv.pendingFieldsOf({ ...doc, content: { ...doc.content, class: lab.class, type: [lab.type] } }), ['time'], 'kind set by an older app');
    assert.deepStrictEqual(cv.pendingFieldsOf({ ...doc, clientData: {} }), []);
    assert.deepStrictEqual(cv.pendingFieldsOf({ ...doc, type: 'note/txt' }), []);
  });

  it('[CNVD2] the contact proposes; she confirms; her app applies the pending fields only, answers with applied, never written', async () => {
    const { person, rel, streams, DOC, conv, document, proposed } = await setup();
    const w = await cv.writeProposedDocument(person, streams, proposed('d1', { documentKind: 'laboratory-report', time: D, timePrecision: 'day' }));
    assert.strictEqual(w.outcome, 'created');
    assert.strictEqual((await cv.writeProposedDocument(person, streams, proposed('d1', { documentKind: 'laboratory-report', time: D, timePrecision: 'day' }))).outcome, 'updated', 'idempotent per candidate');
    let c = await conv();
    assert.deepStrictEqual(c.proposedDocuments.map(p => [p.candidateId, p.state]), [['d1', 'open']]);
    assert.strictEqual(cv.documentProposalRefusal(c.proposedDocuments[0], await document(), c), null);
    const res = await cv.acceptProposedDocument(person, rel, { about: DOC, candidateId: 'd1', shownAt: person.clock, note: 'The follow-up blood test.' });
    assert.deepStrictEqual(res.applied, ['time', 'kind']);
    const doc = await document();
    assert.strictEqual(doc.time, D);
    assert.strictEqual(doc.clientData.hdsTimePrecision, 'day');
    assert.strictEqual(doc.clientData.hdsDocumentPending, undefined, 'the flag is gone');
    assert.strictEqual(cv.pendingFieldsOf(doc).length, 0);
    assert.strictEqual(getModel().documentKinds.forContent(doc.content).key, 'laboratory-report');
    assert.strictEqual(doc.content.title, 'IMG_2041.jpg', 'the rest of content kept');
    assert.deepStrictEqual(doc.streamIds, ['documents']);
    c = await conv();
    const answer = c.answers.at(-1).content;
    assert.deepStrictEqual([answer.action, answer.applied, answer.written, answer.note], ['confirm', ['time', 'kind'], undefined, 'The follow-up blood test.']);
    assert.strictEqual(c.proposedDocuments[0].state, 'confirmed');
    assert.deepStrictEqual(cv.proposedDocumentItemsToDelete(c), [c.proposedDocuments[0].item.id]);
    assert.strictEqual((await cv.writeProposedDocument(person, streams, proposed('d1', { documentKind: 'other' }))).reason, 'nothing-pending');
  });

  it('[CNVD2b] with `file`, the document goes under the kind\'s stream, shares kept; without it, or for a kind with no stream, it stays', async () => {
    const pack = await (await fetch(`${MODEL_BASE}/pack.json`)).json();
    pack.streams.find(s => s.id === 'documents').children = [{ id: 'documents-clinical', name: 'Clinical documents', parentId: 'documents', children: [] }];
    pack.documentKinds.kinds['laboratory-report'].stream = 'documents-clinical';
    delete pack.documentKinds.kinds['consultation-report'].stream; // a kind with none: the live pack may give it one (4.35.0)
    getModel().loadFromObject(pack);
    getModel().laziliyLoadedMap = {}; // a reload keeps the maps built from the previous pack
    const delayMs = cmcDocuments.streamsCheck.delayMs;
    cmcDocuments.streamsCheck.delayMs = 0;
    try {
      const accept = async (documentKind, file, failing) => {
        const { person, rel, streams, DOC, document, proposed } = await setup(['kind']);
        await person.apiOne('events.update', { id: DOC, update: { streamIds: ['documents', 'share-ssssssssssss'] } }, 'event');
        await cv.writeProposedDocument(person, streams, proposed('d1', { documentKind }));
        if (failing) {
          const apiOne = person.apiOne;
          person.apiOne = async (method, params, key) => {
            if (method === 'streams.create' && params.id === 'documents-clinical') throw apiError('forbidden');
            return apiOne(method, params, key);
          };
        }
        const res = await cv.acceptProposedDocument(person, rel, { about: DOC, candidateId: 'd1', shownAt: person.clock, ...(file ? { file } : {}) });
        return [res.action, res.filed, (await document()).streamIds];
      };
      assert.deepStrictEqual(await accept('laboratory-report', true), ['confirm', 'documents-clinical', ['documents-clinical', 'share-ssssssssssss']]);
      assert.deepStrictEqual(await accept('laboratory-report', false), ['confirm', null, ['documents', 'share-ssssssssssss']]);
      assert.deepStrictEqual(await accept('consultation-report', true), ['confirm', null, ['documents', 'share-ssssssssssss']]);
      assert.deepStrictEqual(await accept('laboratory-report', true, true), ['confirm', null, ['documents', 'share-ssssssssssss']], 'not filed: the confirmation still goes through');
    } finally {
      cmcDocuments.streamsCheck.delayMs = delayMs;
      await getModel().load(`${MODEL_BASE}/pack.json`);
      getModel().laziliyLoadedMap = {};
    }
  });

  it('[CNVD3] her own edit wins; a second contact\'s proposal gets an automatic skip not-pending; a retry after the update writes confirm', async () => {
    const { person, rel, streams, DOC, conv, document, proposed } = await setup(['time']);
    await cv.writeProposedDocument(person, streams, proposed('d1', { time: D, timePrecision: 'day' }));
    // she sets the date herself in her viewer: the field leaves the flag
    await person.apiOne('events.update', { id: DOC, update: { time: D + 86400, clientData: { hdsTimePrecision: 'day', hdsDocumentPending: null } } }, 'event');
    await assert.rejects(cv.acceptProposedDocument(person, rel, { about: DOC, candidateId: 'd1', shownAt: person.clock }), /nothing-pending/);
    const settled = await cv.autoSettleProposedDocuments(person, rel, { about: DOC });
    assert.strictEqual(settled.length, 1);
    let c = await conv();
    assert.deepStrictEqual([c.proposedDocuments[0].state, c.answers.at(-1).content.basis], ['not-pending', 'not-pending']);
    assert.strictEqual((await document()).time, D + 86400, 'never overwritten');
    // a retry: the document already holds the proposal (the update went through, the answer did not)
    const two = await setup(['time']);
    await cv.writeProposedDocument(two.person, two.streams, two.proposed('d2', { time: D, timePrecision: 'day' }));
    await two.person.apiOne('events.update', { id: two.DOC, update: { time: D, clientData: { hdsTimePrecision: 'day', hdsDocumentPending: null } } }, 'event');
    const retry = await cv.acceptProposedDocument(two.person, two.rel, { about: two.DOC, candidateId: 'd2', shownAt: two.person.clock });
    assert.deepStrictEqual([retry.action, retry.applied], ['confirm', ['time']]);
    c = await two.conv();
    assert.strictEqual(c.proposedDocuments[0].state, 'confirmed');
  });

  it('[CNVD4] the two document questions: asked only while the field waits; her answers supply what the proposal lacks', async () => {
    const { person, rel, streams, DOC, conv, document, proposed } = await setup();
    await cv.writeProposedDocument(person, streams, proposed('d1', { documentKind: 'laboratory-report' }, { status: 'check' }));
    const qid = await cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'which-document-date', candidateId: 'd1', context: { dates: [{ day: '2026-03-13', text: '13/03/26', role: 'report' }] } });
    await assert.rejects(cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'which-document-kind', candidateId: 'c-x', options: ['laboratory-report', 'other'] }), /not a proposed document/);
    await assert.rejects(cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'which-document-kind', candidateId: 'd1', options: ['laboratory-report', 'no-such-kind'] }), /not a document kind/);
    await cv.answerQuestion(person, rel, { questionId: qid, action: 'confirm', time: D + 86400, timePrecision: 'day', shownAt: person.clock });
    let c = await conv();
    assert.deepStrictEqual(c.documentAnswers.d1, { date: { time: D + 86400, timePrecision: 'day' } });
    assert.strictEqual(c.proposedDocuments[0].state, 'open', 'a question answer is not an answer to the proposal');
    const res = await cv.acceptProposedDocument(person, rel, { about: DOC, candidateId: 'd1', shownAt: person.clock });
    assert.deepStrictEqual(res.applied, ['time', 'kind']);
    assert.strictEqual((await document()).time, D + 86400);
    c = await conv();
    assert.deepStrictEqual(cv.proposedDocumentItemsToDelete(c).sort(), [c.proposedDocuments[0].item.id, qid].sort(), 'its questions go with it');
    assert.ok(!cv.itemsToDeleteAtDone(c).includes(qid), 'never at done');
    await assert.rejects(cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'which-document-date', candidateId: 'd1' }), /not pending/);
  });

  it('[CNVD5] a correction writes her own fields (correct, applied); one open at a time: a new candidate replaces the stale one', async () => {
    const { person, rel, streams, DOC, conv, document, proposed } = await setup();
    await cv.writeProposedDocument(person, streams, proposed('d1', { documentKind: 'laboratory-report' }));
    const w2 = await cv.writeProposedDocument(person, streams, proposed('d2', { documentKind: 'laboratory-report', time: D, timePrecision: 'day' }));
    assert.strictEqual(w2.deleted.length, 1, 'the stale one deleted at once');
    let c = await conv();
    assert.deepStrictEqual(c.proposedDocuments.map(p => [p.candidateId, p.item.content.replaces ?? null]), [['d2', 'd1']]);
    const res = await cv.acceptProposedDocument(person, rel, { about: DOC, candidateId: 'd2', correction: { documentKind: 'discharge-summary', time: D - 86400, timePrecision: 'day' }, shownAt: person.clock });
    assert.strictEqual(res.action, 'correct');
    assert.strictEqual(getModel().documentKinds.forContent((await document()).content).key, 'discharge-summary');
    c = await conv();
    assert.strictEqual(c.proposedDocuments[0].state, 'corrected');
  });

  it('[CNVD6] writer checks: kind key, 12:00 UTC, applied never with written, not-pending only on a skip', () => {
    const base = { kind: 'proposed-document', about: 'doc1', candidateId: 'd1', status: 'clear' };
    assert.deepStrictEqual(cv.checkConversationItem({ ...base, proposal: { documentKind: 'laboratory-report' } }), []);
    assert.ok(cv.checkConversationItem({ ...base, proposal: { documentKind: 'no-such-kind' } }).length > 0);
    assert.ok(cv.checkConversationItem({ ...base, proposal: { time: D + 3600, timePrecision: 'day' } }).length > 0, 'not 12:00 UTC');
    assert.ok(cv.checkConversationItem({ ...base, proposal: { time: D } }).length > 0, 'a time without precision');
    const answer = { kind: 'answer', inReplyTo: 'ev-1', about: 'doc1', candidateIds: ['d1'] };
    assert.deepStrictEqual(cv.checkConversationItem({ ...answer, action: 'confirm', applied: ['kind'] }), []);
    assert.ok(cv.checkConversationItem({ ...answer, action: 'confirm', applied: ['kind'], written: [{ candidateId: 'd1', eventId: 'doc1' }] }).length > 0);
    assert.ok(cv.checkConversationItem({ ...answer, action: 'skip', applied: ['kind'] }).length > 0);
    assert.deepStrictEqual(cv.checkConversationItem({ ...answer, action: 'skip', basis: 'not-pending' }), []);
    assert.ok(cv.checkConversationItem({ ...answer, action: 'duplicate', basis: 'not-pending' }).length > 0);
    assert.ok(cv.checkConversationItem({ ...answer, action: 'skip', note: 'x'.repeat(1001) }).length > 0, 'a note of at most 1000');
    assert.deepStrictEqual(Object.keys(cv.SPECIMEN_CODES), ['serum-plasma', 'whole-blood', 'citrated-plasma', 'rbc', 'urine', 'urine-24h', 'semen', 'csf', 'stool', 'saliva']);
  });

  it('[CNVD7] her note: on an answer, removed once done is later than it, or 24 h after when the work was already done', () => {
    const items = cv.parseConversationItems([
      { id: 'p1', type: cv.ET_CONVERSATION, streamIds: ['r'], time: 1, created: 1, modified: 1, content: { kind: 'proposed-value', about: 'doc1', candidateId: 'c1', printed: { label: 'X', value: '1' }, status: 'clear', extraction } },
      { id: 'a1', type: cv.ET_CONVERSATION, streamIds: ['s'], time: 100, created: 100, modified: 100, content: { kind: 'answer', inReplyTo: 'p1', about: 'doc1', action: 'skip', candidateIds: ['c1'], note: 'after lunch' } },
      { id: 'a2', type: cv.ET_CONVERSATION, streamIds: ['s'], time: 500, created: 500, modified: 500, content: { kind: 'answer', inReplyTo: 'p1', about: 'doc1', action: 'skip', candidateIds: ['c1'], note: 'later' } }
    ], { received: 'r', sent: 's' });
    const conv = cv.conversationOf(items, 'doc1');
    const done = (time) => ({ alertEventId: 'x', kind: 'task-status', hds: { kind: 'task-status', about: 'doc1', status: 'done', attempt: 1 }, time, direction: 'received', from: null });
    assert.deepStrictEqual(cv.notesToRemove(conv, null, { now: 600 }).map(a => a.id), []);
    assert.deepStrictEqual(cv.notesToRemove(conv, done(300), { now: 600 }).map(a => a.id), ['a1'], 'done after a1, before a2');
    assert.deepStrictEqual(cv.notesToRemove(conv, done(300), { now: 500 + 86400 }).map(a => a.id), ['a1', 'a2'], 'a2 24 h later');
    assert.deepStrictEqual(cv.notesToRemove(conv, null, { now: 500 + 86400, unshared: true }).map(a => a.id), ['a1', 'a2']);
    assert.strictEqual(conv.proposedValues[0].state, 'skipped', 'a comment alone is a skip');
    // the document shared again after `done`, then on hold for days: the notes answered before that `done` still go
    const on = (status, time, attempt) => ({ ...done(time), hds: { kind: 'task-status', about: 'doc1', status, attempt } });
    const alerts = [on('reading', 100, 1), done(300), on('on-hold', 400, 2), { ...done(350), hds: { kind: 'task-status', about: 'doc2', status: 'done', attempt: 1 } }];
    assert.strictEqual(cv.taskStatusOf(alerts, 'doc1').hds.status, 'on-hold');
    assert.strictEqual(cv.latestDoneOf(alerts, 'doc1').time, 300);
    assert.deepStrictEqual(cv.notesToRemove(conv, cv.taskStatusOf(alerts, 'doc1'), { now: 500 + 86400 }), [], 'the latest status alone would keep them');
    const due = (now, list = alerts) => cv.notesToRemove(conv, cv.latestDoneOf(list, 'doc1'), { now, current: cv.taskStatusOf(list, 'doc1') }).map(a => a.id);
    assert.deepStrictEqual(due(600), ['a1']);
    assert.deepStrictEqual(due(500 + 86400), ['a1'], 'answered during the second round: waits for its done');
    assert.deepStrictEqual(due(500 + 86400, alerts.slice(0, 2)), ['a1', 'a2'], 'the work is done now: 24 h');
    assert.deepStrictEqual(due(600, [...alerts, on('done', 550, 2)]), ['a1', 'a2'], 'the second round done');
    assert.strictEqual(cv.latestDoneOf([on('reading', 100, 1)], 'doc1'), null);
  });

  it('[CNVD9] a tapped skip on a proposed document (and a comment alone): settles nothing, she confirms later', async () => {
    const { person, rel, streams, DOC, conv, proposed } = await setup();
    await cv.writeProposedDocument(person, streams, proposed('d1', { documentKind: 'laboratory-report', time: D, timePrecision: 'day' }));
    const res = await cv.skipProposedDocument(person, rel, { about: DOC, candidateId: 'd1', shownAt: person.clock, note: 'I will check the date' });
    assert.strictEqual(res.action, 'skip');
    let c = await conv();
    assert.deepStrictEqual([c.proposedDocuments[0].state, c.answers.at(-1).content.note, c.answers.at(-1).content.basis], ['skipped', 'I will check the date', undefined]);
    assert.deepStrictEqual(cv.proposedDocumentItemsToDelete(c), [], 'a skipped one stays');
    await assert.rejects(cv.skipProposedDocument(person, rel, { about: DOC, candidateId: 'nope' }), /unknown candidate/);
    await cv.acceptProposedDocument(person, rel, { about: DOC, candidateId: 'd1', shownAt: person.clock });
    c = await conv();
    assert.strictEqual(c.proposedDocuments[0].state, 'confirmed');
  });

  it('[CNVD10] her app writes a pending document, and her own edit clears the flag field by field', async () => {
    const all = cv.pendingDocumentEvent({ title: 'IMG_1.jpg', now: ADDED });
    assert.deepStrictEqual([all.time, all.clientData, all.content.language, all.content.creation], [ADDED, { hdsDocumentPending: ['time', 'kind'] }, 'und', undefined]);
    assert.strictEqual(getModel().documentKinds.forContent(all.content).key, 'other');
    const dated = cv.pendingDocumentEvent({ title: 'x', time: D, timePrecision: 'day', now: ADDED });
    assert.deepStrictEqual([dated.time, dated.clientData], [D, { hdsTimePrecision: 'day', hdsDocumentPending: ['kind'] }]);
    const both = cv.pendingDocumentEvent({ title: 'x', documentKind: 'laboratory-report', time: D, timePrecision: 'day' });
    assert.deepStrictEqual(both.clientData, { hdsTimePrecision: 'day' }, 'nothing pending');
    assert.deepStrictEqual(cv.pendingFieldsOf({ ...all, id: 'x' }), ['time', 'kind']);
    // her own edit of the date: written whatever is pending, the field leaves the flag
    const edit = cv.documentEditOf(all, { time: D, timePrecision: 'day' });
    assert.deepStrictEqual(edit, { time: D, clientData: { hdsTimePrecision: 'day', hdsDocumentPending: ['kind'] } });
    const kindEdit = cv.documentEditOf({ ...all, clientData: { hdsDocumentPending: ['kind'] } }, { documentKind: 'laboratory-report' });
    assert.strictEqual(kindEdit.clientData.hdsDocumentPending, null, 'the last field: null');
    assert.strictEqual(getModel().documentKinds.forContent(kindEdit.content).key, 'laboratory-report');
    assert.strictEqual(kindEdit.content.title, 'IMG_1.jpg');
    assert.strictEqual(cv.documentEditOf({ content: {}, clientData: {} }, { documentKind: 'other' }).clientData.hdsDocumentPending, undefined, 'no flag: none written');
    assert.strictEqual(cv.documentEditOf(all, {}), null);
    assert.throws(() => cv.documentEditOf(all, { documentKind: 'no-such-kind' }), /unknown-kind/);
  });

  it('[CNVD8b] a write that fails in the middle: the document lists the values already written, and not-mine removes them', async () => {
    const { person, rel, streams, DOC, document } = await setup([]);
    const value = (candidateId, content) => ({ kind: 'proposed-value', about: DOC, candidateId, printed: { label: 'Ferritine', value: String(content), unit: 'µg/l' }, proposal: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content, time: D, clientData: { hdsTimePrecision: 'day' } }, status: 'clear', extraction });
    await cv.writeProposedValues(person, streams, DOC, [value('c1', 48), value('c2', 84), value('c3', 90)]);
    const apiOne = person.apiOne;
    let creates = 0;
    person.apiOne = async (method, params, key) => {
      if (method === 'events.create' && params.type === 'concentration/ug-l' && ++creates === 3) throw new Error('offline');
      return apiOne(method, params, key);
    };
    const decisions = ['c1', 'c2', 'c3'].map(candidateId => ({ candidateId, action: 'confirm' }));
    const err = await cv.acceptProposedValues(person, rel, { about: DOC, decisions, shownAt: person.clock, engines: ENGINES }).then(() => null, (e) => e);
    person.apiOne = apiOne;
    assert.strictEqual(err.innerObject.reason, 'write-failed');
    const ids = Object.values(err.innerObject.written);
    assert.deepStrictEqual(Object.keys((await document()).clientData.hdsDocumentValues).sort(), [...ids].sort());
    const qid = await cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'is-this-yours' });
    const no = await cv.answerQuestion(person, rel, { questionId: qid, action: 'not-mine', shownAt: person.clock });
    assert.deepStrictEqual([...no.deletedValueIds].sort(), [...ids].sort());
    assert.strictEqual((await document()).clientData.hdsDocumentValues, undefined);
  });

  describe('[CNVDI] the index of a document (hdsDocumentValues) on a long run', () => {
    const value = (DOC, candidateId, content) => ({ kind: 'proposed-value', about: DOC, candidateId, printed: { label: 'Ferritine', value: String(content), unit: 'µg/l' }, proposal: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content, time: D, clientData: { hdsTimePrecision: 'day' } }, status: 'clear', extraction });
    const run = async (n) => {
      const all = await setup([]);
      const ids = Array.from({ length: n }, (_, i) => 'c' + (i + 1));
      await cv.writeProposedValues(all.person, all.streams, all.DOC, ids.map((id, i) => value(all.DOC, id, 40 + i)));
      return { ...all, ids };
    };
    const one = (all, id) => cv.acceptProposedValues(all.person, all.rel, { about: all.DOC, decisions: [{ candidateId: id, action: 'confirm' }], shownAt: all.person.clock, engines: ENGINES });
    const index = async (all) => (await all.document()).clientData.hdsDocumentValues ?? {};

    it('[CNVDI1] twenty confirms at once lose no entry', async () => {
      const all = await run(20);
      const res = await Promise.all(all.ids.map(id => one(all, id)));
      assert.deepStrictEqual(Object.keys(await index(all)).sort(), res.map(r => r.answers[0].written[0].eventId).sort());
    });

    it('[CNVDI2] the cost of a confirm does not grow with the document', async () => {
      const all = await run(62);
      await cv.acceptProposedValues(all.person, all.rel, { about: all.DOC, decisions: all.ids.slice(0, 60).map(candidateId => ({ candidateId, action: 'confirm' })), shownAt: all.person.clock, engines: ENGINES });
      const apiOne = all.person.apiOne;
      let gets = 0;
      all.person.apiOne = async (method, params, key) => { if (method === 'events.getOne') gets++; return apiOne(method, params, key); };
      await one(all, 'c61');
      all.person.apiOne = apiOne;
      assert.ok(gets <= 8, `${gets} events.getOne`);
      assert.strictEqual(Object.keys(await index(all)).length, 61);
    });

    it('[CNVDI3] an entry the index lost comes back from the answers; a value she deleted or trashed does not', async () => {
      const all = await run(4);
      const written = {};
      for (const id of ['c1', 'c2', 'c3']) written[id] = (await one(all, id)).answers[0].written[0].eventId;
      await all.person.apiOne('events.update', { id: all.DOC, update: { clientData: { hdsDocumentValues: null } } });
      await all.person.apiOne('events.delete', { id: written.c2 });
      await all.person.apiOne('events.delete', { id: written.c3 });
      await all.person.apiOne('events.delete', { id: written.c3 });
      const c4 = (await one(all, 'c4')).answers[0].written[0].eventId;
      assert.deepStrictEqual(Object.keys(await index(all)).sort(), [written.c1, c4].sort());
    });

    it('[CNVDI4] on a short document the dangling entries found are dropped, as before', async () => {
      const all = await run(2);
      const c1 = (await one(all, 'c1')).answers[0].written[0].eventId;
      await all.person.apiOne('events.delete', { id: c1 });
      await all.person.apiOne('events.delete', { id: c1 });
      const c2 = (await one(all, 'c2')).answers[0].written[0].eventId;
      assert.deepStrictEqual(Object.keys(await index(all)), [c2]);
    });

    it('[CNVDI6] a failed write of the index before another one, at once: the second still goes and restores the first', async () => {
      const all = await run(3);
      const apiOne = all.person.apiOne;
      let first = true;
      all.person.apiOne = async (method, params, key) => {
        if (first && method === 'events.update' && params.id === all.DOC) { first = false; throw new Error('offline'); }
        return apiOne(method, params, key);
      };
      const [a, b] = await Promise.all([one(all, 'c1'), one(all, 'c2')]);
      all.person.apiOne = apiOne;
      const c3 = (await one(all, 'c3')).answers[0].written[0].eventId;
      assert.deepStrictEqual(Object.keys(await index(all)).sort(), [a, b].map(r => r.answers[0].written[0].eventId).concat(c3).sort());
    });

    it('[CNVDI7] a request that never ends does not hold up the next write', async () => {
      const all = await run(2);
      const apiOne = all.person.apiOne;
      let hung = true;
      all.person.apiOne = async (method, params, key) => {
        if (hung && method === 'events.update' && params.id === all.DOC) { hung = false; return await new Promise(() => {}); }
        return apiOne(method, params, key);
      };
      const values = [];
      for (const content of [1, 2]) values.push((await all.person.apiOne('events.create', { streamIds: ['x'], type: 'concentration/ug-l', content }, 'event')).id);
      const stuck = cv.indexDocumentValues(all.person, all.DOC, [values[0]], { waitMs: 30 });
      const second = await cv.indexDocumentValues(all.person, all.DOC, [values[1]], { waitMs: 30 });
      assert.deepStrictEqual(Object.keys(second), [values[1]]);
      assert.ok(stuck instanceof Promise);
    });

    it('[CNVDI8] on a long document: a dangling entry gets its turn, and lost entries come back over the next writes', async () => {
      const all = await run(64);
      const res = await cv.acceptProposedValues(all.person, all.rel, { about: all.DOC, decisions: all.ids.slice(0, 40).map(candidateId => ({ candidateId, action: 'confirm' })), shownAt: all.person.clock, engines: ENGINES });
      const written = res.answers.flatMap(a => a.written.map(w => w.eventId));
      await all.person.apiOne('events.delete', { id: written[3] });
      await all.person.apiOne('events.delete', { id: written[3] });
      const kept = await index(all);
      const lost = written.slice(5, 11);
      await all.person.apiOne('events.update', { id: all.DOC, update: { clientData: { hdsDocumentValues: Object.fromEntries(Object.entries(kept).filter(([id]) => !lost.includes(id))) } } });
      for (const id of all.ids.slice(40, 64)) await one(all, id);
      const after = await index(all);
      for (const id of lost) assert.strictEqual(after[id], 'source', 'a lost entry is back');
      assert.strictEqual(after[written[3]], undefined, 'the dangling one had its turn');
    });

    it('[CNVDI9] many values she deleted do not keep a lost one out, and never come back', async () => {
      const all = await run(40);
      const res = await cv.acceptProposedValues(all.person, all.rel, { about: all.DOC, decisions: all.ids.slice(0, 26).map(candidateId => ({ candidateId, action: 'confirm' })), shownAt: all.person.clock, engines: ENGINES });
      const written = res.answers.flatMap(a => a.written.map(w => w.eventId));
      const gone = written.slice(0, 22);
      for (const id of gone) { await all.person.apiOne('events.delete', { id }); await all.person.apiOne('events.delete', { id }); }
      await all.person.apiOne('events.update', { id: all.DOC, update: { clientData: { hdsDocumentValues: null } } });
      for (const id of all.ids.slice(26, 40)) await one(all, id);
      const after = await index(all);
      for (const id of gone) assert.strictEqual(after[id], undefined, 'never restored');
      for (const id of written.slice(22)) assert.strictEqual(after[id], 'source', 'a lost one is back');
    });

    it('[CNVDI5] a write of the index that fails does not block the next one', async () => {
      const all = await run(2);
      const apiOne = all.person.apiOne;
      let first = true;
      all.person.apiOne = async (method, params, key) => {
        if (first && method === 'events.update' && params.id === all.DOC) { first = false; throw new Error('offline'); }
        return apiOne(method, params, key);
      };
      const c1 = (await one(all, 'c1')).answers[0].written[0].eventId;
      const c2 = (await one(all, 'c2')).answers[0].written[0].eventId;
      all.person.apiOne = apiOne;
      assert.deepStrictEqual(Object.keys(await index(all)).sort(), [c1, c2].sort(), 'c1 is restored from its answer');
    });
  });

  it('[CNVD8] the document lists the values written from it (source); a value she had gets hdsPrintedIn, nothing on the document; not-mine removes both', async () => {
    const { person, rel, streams, DOC, document } = await setup([]);
    const streamOf = (k) => getModel().itemsDefs.forKey(k).data.streamId;
    const value = (candidateId, content) => ({ kind: 'proposed-value', about: DOC, candidateId, printed: { label: 'Ferritine', value: String(content), unit: 'µg/l' }, proposal: { itemKey: 'body-blood-serum-ferritin', type: 'concentration/ug-l', content, time: D, clientData: { hdsTimePrecision: 'day' } }, status: 'clear', extraction });
    await cv.writeProposedValues(person, streams, DOC, [value('c1', 48), value('c2', 84)]);
    const mine = await person.apiOne('events.create', { streamIds: [streamOf('body-blood-serum-ferritin')], type: 'concentration/ug-l', content: 48, time: D, clientData: { hdsTimePrecision: 'day' } }, 'event');
    const dup = await cv.autoMarkDuplicates(person, rel, { about: DOC, engines: ENGINES });
    assert.deepStrictEqual([dup.candidateIds, dup.matchedEventIds], [['c1'], [mine.id]]);
    const matched = await person.apiOne('events.getOne', { id: mine.id }, 'event');
    assert.deepStrictEqual(matched.clientData.hdsPrintedIn, { [DOC]: true });
    assert.strictEqual(matched.clientData.related, undefined, 'not its source');
    const accepted = await cv.acceptProposedValues(person, rel, { about: DOC, decisions: [{ candidateId: 'c2', action: 'confirm' }], shownAt: person.clock, engines: ENGINES });
    const c2 = accepted.answers[0].written[0].eventId;
    let doc = await document();
    assert.deepStrictEqual(doc.clientData.hdsDocumentValues, { [c2]: 'source' }, 'source only: the matched value is not on the document');
    const found = await person.apiOne('events.get', { clientData: [{ path: `hdsPrintedIn.${DOC}`, eq: true }] }, 'events');
    assert.deepStrictEqual(found.map(e => e.id), [mine.id], 'the document view finds matched values with one query');
    // the reader helper: source (index and related), matched (hdsPrintedIn); no conversation item, no alert
    const listed = await cv.listDocumentValues(person, DOC);
    assert.deepStrictEqual([listed.source.map(e => e.id), listed.matched.map(e => e.id)], [[c2], [mine.id]]);
    // not-mine: the written value deleted, its entry and the hdsPrintedIn link removed
    const qid = await cv.writeQuestion(person, streams, { kind: 'question', about: DOC, code: 'is-this-yours' });
    await cv.answerQuestion(person, rel, { questionId: qid, action: 'not-mine', shownAt: person.clock });
    doc = await document();
    assert.strictEqual(doc.clientData.hdsDocumentValues, undefined);
    assert.strictEqual((await person.apiOne('events.getOne', { id: mine.id }, 'event')).clientData.hdsPrintedIn, undefined);
  });
});
