import { assert } from './test-utils/deps-node.js';
import { cmcDocuments } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';
const COLLECTORS = ':_cmc:apps:hds-patient:collectors:dr--api-x';
const CHANNEL = [
  { streamId: ':_cmc:inbox', level: 'create-only' },
  { streamId: COLLECTORS, level: 'contribute' }
];
const { DOCUMENT_ALERT_KINDS: K } = cmcDocuments;

function apiError (id) {
  const e = new Error(id);
  e.innerObject = { id };
  return e;
}

/**
 * An account as the platform keeps it: streams, events, and scope updates settled as applied
 * (the grant changes to `newPermissions`, kept on `grant`).
 */
function account ({ streams = [], events = [], accesses = [], tokenType = 'personal' } = {}) {
  const state = { streams: [...streams], events: new Map(events.map(e => [e.id, { ...e }])), calls: [], grant: null, n: 0 };
  state.accessInfo = async () => {
    state.calls.push({ method: 'accessInfo' });
    return { type: tokenType };
  };
  const children = (parentId) => state.streams.filter(s => s.parentId === parentId);
  state.apiOne = async function (method, params, key) {
    state.calls.push({ method, params });
    const out = (k, v) => key ? v : { [k]: v };
    switch (method) {
      case 'streams.get':
        if (params.parentId && !state.streams.find(s => s.id === params.parentId)) throw apiError('unknown-referenced-resource');
        if (params.parentId == null) {
          const nest = (list) => list.filter(s => params.state === 'all' || !s.trashed).map(s => ({ ...s, children: nest(children(s.id)) }));
          return out('streams', nest(children(null)));
        }
        return out('streams', children(params.parentId).filter(s => params.state === 'all' || !s.trashed));
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
        const e = { id: 'ev-' + (++state.n), time: state.n, ...params };
        state.events.set(e.id, e);
        return out('event', e);
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
        Object.assign(e, params.update);
        return out('event', e);
      }
      case 'accesses.get':
        return out('accesses', accesses);
      case 'events.get':
        return out('events', [...state.events.values()].filter(e =>
          (params.state === 'all' || (!e.trashed && params.streams.every(id => !state.streams.find(s => s.id === id)?.trashed))) &&
          e.streamIds.some(s => params.streams.includes(s)) && (!params.types || params.types.includes(e.type))).slice(0, params.limit ?? Infinity));
      default:
        throw new Error('unexpected ' + method);
    }
  };
  state.createEventWithFileFromBuffer = async function (event, file, filename) {
    state.calls.push({ method: 'createEventWithFileFromBuffer', params: { event, filename } });
    const e = { id: 'ev-' + (++state.n), time: state.n, ...event, attachments: [{ id: 'att-1', fileName: filename, size: 1200 }] };
    state.events.set(e.id, e);
    return { event: e };
  };
  return state;
}

const tree = () => [
  { id: 'document-shares', parentId: null, name: 'Shared documents' },
  { id: 'share-ssssssssssss', parentId: 'document-shares', name: 'share-ssssssssssss', clientData: { hdsDocumentShare: { relationship: 'acc-1', direction: 'shared' } } },
  { id: 'share-rrrrrrrrrrrr', parentId: 'document-shares', name: 'share-rrrrrrrrrrrr', clientData: { hdsDocumentShare: { relationship: 'acc-1', direction: 'received' } } },
  { id: 'share-oooooooooooo', parentId: 'document-shares', name: 'share-oooooooooooo', clientData: { hdsDocumentShare: { relationship: 'acc-2', direction: 'shared' } } }
];
const doc = (id, streamIds = ['documents']) => ({ id, type: 'file/xds-v1', streamIds, content: { title: 'Bilan' }, attachments: [{ id: 'a', size: 100 }] });
const relWith = (perms) => ({ accessId: 'acc-1:2', localCollectorStreamId: COLLECTORS, grantedPermissions: [...perms, ...CHANNEL] });
const alerts = (conn) => [...conn.events.values()].filter(e => e.type === 'notification/alert-cmc');

describe('[CDOC] cmcDocuments', function () {
  before(async () => {
    await getModel().load(modelURL);
    cmcDocuments.streamsCheck.delayMs = 0;
  });

  describe('[CDOC-P] pure helpers', () => {
    it('[CDOC1] share ids are share- and 12 lowercase base36, random', () => {
      const a = cmcDocuments.newShareStreamId();
      assert.match(a, /^share-[a-z0-9]{12}$/);
      assert.notStrictEqual(a, cmcDocuments.newShareStreamId());
      assert.ok(cmcDocuments.isShareStreamId(a));
      assert.ok(!cmcDocuments.isShareStreamId('share-dr-x'));
    });

    it('[CDOC2] the relationship is the base of the access id', () => {
      assert.strictEqual(cmcDocuments.relationshipIdOf('acc-1:3'), 'acc-1');
      assert.strictEqual(cmcDocuments.relationshipIdOf('acc-1'), 'acc-1');
    });

    it('[CDOC3] shareStreamsOf reads the share children of a grant; sharesAllDocuments sees documents or *', () => {
      const perms = [{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }, { streamId: 'share-bbbbbbbbbbbb', level: 'create-only' }, { streamId: 'body-weight', level: 'read' }];
      assert.deepStrictEqual(cmcDocuments.shareStreamsOf(perms), { shared: 'share-aaaaaaaaaaaa', received: 'share-bbbbbbbbbbbb' });
      assert.strictEqual(cmcDocuments.sharesAllDocuments(perms), false);
      assert.strictEqual(cmcDocuments.sharesAllDocuments([{ streamId: 'documents', level: 'read' }]), true);
      assert.strictEqual(cmcDocuments.sharesAllDocuments([{ streamId: '*', level: 'contribute' }]), true);
      assert.strictEqual(cmcDocuments.sharesAllDocuments([{ streamId: 'documents', level: 'create-only' }]), false);
    });

    it('[CDOC4] alert content: fixed localised text, code, hds block; unknown locale falls back to English', () => {
      assert.deepStrictEqual(cmcDocuments.buildDocumentAlertContent(K.SHARED, 'ev-9', 'fr'), {
        level: 'info',
        title: { fr: 'Document partagé' },
        body: { fr: 'Un document a été partagé avec vous dans cette conversation.' },
        code: 'hds-document-shared',
        hds: { kind: 'document-shared', eventId: 'ev-9' }
      });
      assert.deepStrictEqual(cmcDocuments.buildDocumentAlertContent(K.SENT, 'ev-9', 'de').title, { en: 'Document received' });
      assert.throws(() => cmcDocuments.buildDocumentAlertContent('document-other', 'ev-9'));
      assert.throws(() => cmcDocuments.buildDocumentAlertContent(K.SHARED, ''));
    });

    const a = (id, time, kind, eventId, from) => ({ id, time, type: 'notification/alert-cmc', content: { hds: { kind, eventId }, ...(from ? { from: { username: 'anna', host: 'x' } } : {}) } });

    it('[CDOC5] parseDocumentAlerts: every alert, oldest first; a share taken back later is not current; other alerts ignored', () => {
      const parsed = cmcDocuments.parseDocumentAlerts([
        a('a3', 3, K.UNSHARED, 'd1'),
        a('a1', 1, K.SHARED, 'd1'),
        a('a2', 2, K.SHARED, 'd1'), // second device
        a('a4', 4, K.SHARED, 'd2', true),
        a('a5', 5, 'data-export-request', 'd3'),
        { id: 'c1', time: 6, type: 'message/hds-chat-v1', content: { hds: { kind: K.SHARED, eventId: 'd4' } } }
      ]);
      assert.deepStrictEqual(parsed.map(p => [p.alertEventId, p.kind, p.eventId, p.current, p.direction]), [
        ['a1', K.SHARED, 'd1', false, 'sent'],
        ['a2', K.SHARED, 'd1', false, 'sent'],
        ['a3', K.UNSHARED, 'd1', true, 'sent'],
        ['a4', K.SHARED, 'd2', true, 'received']
      ]);
    });

    it('[CDOC6] shared again after being taken back: a new current alert after the "taken back" one; an alert listed twice counts once', () => {
      const parsed = cmcDocuments.parseDocumentAlerts([
        a('a1', 1, K.SHARED, 'd1'),
        a('a2', 2, K.UNSHARED, 'd1'),
        a('a3', 3, K.SHARED, 'd1'),
        a('a3', 3, K.SHARED, 'd1')
      ]);
      assert.deepStrictEqual(parsed.map(p => [p.alertEventId, p.kind, p.current]), [
        ['a1', K.SHARED, false],
        ['a2', K.UNSHARED, true],
        ['a3', K.SHARED, true]
      ]);
    });

    it('[CDOC7] one active share per document; a document sent and announced again counts once', () => {
      const parsed = cmcDocuments.parseDocumentAlerts([
        a('a1', 1, K.SHARED, 'd1'),
        a('a2', 2, K.SHARED, 'd1'),
        a('s1', 3, K.SENT, 'r1', true),
        a('s2', 4, K.SENT, 'r1', true)
      ]);
      assert.deepStrictEqual(parsed.map(p => [p.alertEventId, p.current]), [['a1', false], ['a2', true], ['s1', true]]);
    });
  });

  describe('[CDOC-S] the person shares one document', () => {
    it('[CDOC10] first share: root and child created, read granted, id added to the document, then the alert', async () => {
      const conn = account({ events: [doc('d1')] });
      const rel = relWith([{ streamId: 'body-weight', level: 'read' }]);
      const res = await cmcDocuments.shareDocument(conn, rel, 'd1', { locale: 'en' });
      assert.strictEqual(res.mode, 'shared');
      assert.match(res.shareStreamId, /^share-[a-z0-9]{12}$/);
      const child = conn.streams.find(s => s.id === res.shareStreamId);
      assert.deepStrictEqual(child, { parentId: 'document-shares', id: res.shareStreamId, name: res.shareStreamId, clientData: { hdsDocumentShare: { relationship: 'acc-1', direction: 'shared' } } });
      assert.deepStrictEqual(conn.streams.find(s => s.id === 'document-shares'), { parentId: null, id: 'document-shares', name: 'Shared documents' });
      assert.deepStrictEqual(conn.grant, [{ streamId: 'body-weight', level: 'read' }, { streamId: res.shareStreamId, level: 'read' }]);
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents', res.shareStreamId]);
      const order = conn.calls.map(c => c.method + (c.params?.type ? ' ' + c.params.type : ''));
      assert.ok(order.indexOf('events.create consent/scope-update-cmc') < order.indexOf('events.update'), 'grant before the document');
      assert.strictEqual(order.at(-1), 'events.create notification/alert-cmc', 'alert last');
      assert.deepStrictEqual(alerts(conn)[0].content.hds, { kind: 'document-shared', eventId: 'd1' });
      assert.deepStrictEqual(alerts(conn)[0].streamIds, [COLLECTORS]);
    });

    it('[CDOC11] child already granted: no scope update, no new stream', async () => {
      const conn = account({ events: [doc('d1')] });
      const res = await cmcDocuments.shareDocument(conn, relWith([{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }]), 'd1');
      assert.strictEqual(res.shareStreamId, 'share-aaaaaaaaaaaa');
      assert.strictEqual(res.scopeUpdate, null);
      assert.ok(!conn.calls.some(c => c.method === 'streams.create'));
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents', 'share-aaaaaaaaaaaa']);
    });

    it('[CDOC12] an ungranted child of the relationship is never reused: it still lists what was shared before', async () => {
      const streams = [
        { id: 'document-shares', parentId: null, name: 'Shared documents' },
        { id: 'share-other0000000', parentId: 'document-shares', name: 'x', clientData: { hdsDocumentShare: { relationship: 'acc-9', direction: 'shared' } } },
        { id: 'share-mine00000000', parentId: 'document-shares', name: 'x', clientData: { hdsDocumentShare: { relationship: 'acc-1', direction: 'shared' } } }
      ];
      const conn = account({ streams, events: [doc('d1'), doc('old', ['documents', 'share-mine00000000'])] });
      const res = await cmcDocuments.shareDocument(conn, relWith([{ streamId: 'body-weight', level: 'read' }]), 'd1');
      assert.ok(!['share-mine00000000', 'share-other0000000'].includes(res.shareStreamId));
      assert.ok(conn.streams.find(s => s.id === res.shareStreamId), 'a new child');
      assert.ok(!conn.grant.some(p => p.streamId === 'share-mine00000000'), 'the old child is not granted');
    });

    it('[CDOC16] a relationship read before another device\'s first share reuses that device\'s child, never ungrants it', async () => {
      const streams = [tree()[0], { id: 'share-xxxxxxxxxxxx', parentId: 'document-shares', name: 'x', clientData: { hdsDocumentShare: { relationship: 'acc-1', direction: 'shared' } } }];
      const live = [{ streamId: 'body-weight', level: 'read' }, { streamId: 'share-xxxxxxxxxxxx', level: 'read' }, ...CHANNEL];
      const conn = account({ streams, events: [doc('d1')], accesses: [{ id: 'acc-1:3', permissions: live }] });
      const res = await cmcDocuments.shareDocument(conn, relWith([{ streamId: 'body-weight', level: 'read' }]), 'd1');
      assert.strictEqual(res.shareStreamId, 'share-xxxxxxxxxxxx');
      assert.ok(!conn.calls.some(c => c.method === 'streams.create'));
      assert.ok(conn.grant.some(p => p.streamId === 'share-xxxxxxxxxxxx'), 'still granted');
    });

    it('[CDOC13] the contact already reads every document: only the alert', async () => {
      const conn = account({ events: [doc('d1')] });
      const res = await cmcDocuments.shareDocument(conn, relWith([{ streamId: 'documents', level: 'read' }]), 'd1');
      assert.deepStrictEqual([res.mode, res.shareStreamId, res.scopeUpdate], ['all', null, null]);
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents']);
      assert.strictEqual(alerts(conn).length, 1);
    });

    it('[CDOC14] another device changed the streams meanwhile: concurrent-update, no alert', async () => {
      const conn = account({ events: [doc('d1')] });
      const apiOne = conn.apiOne;
      let reads = 0;
      conn.apiOne = async (method, params, key) => {
        const r = await apiOne(method, params, key);
        if (method === 'events.getOne' && params.id === 'd1' && ++reads === 3) r.streamIds = ['documents', 'share-zzzzzzzzzzzz'];
        return r;
      };
      await assert.rejects(cmcDocuments.shareDocument(conn, relWith([{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }]), 'd1'),
        (e) => e.innerObject?.reason === 'concurrent-update');
      assert.strictEqual(alerts(conn).length, 0);
    });

    it('[CDOC15] no collectors stream: refused before anything is written', async () => {
      const conn = account({ events: [doc('d1')] });
      await assert.rejects(cmcDocuments.shareDocument(conn, { ...relWith([]), localCollectorStreamId: null }, 'd1'),
        (e) => e.innerObject?.reason === 'no-collector-stream');
      assert.strictEqual(conn.calls.length, 0);
    });
  });

  describe('[CDOC-U] taking back, stopping all', () => {
    it('[CDOC20] unshareDocument removes the relationship\'s share id only, then posts the alert', async () => {
      const conn = account({ events: [doc('d1', ['documents', 'share-aaaaaaaaaaaa', 'share-bbbbbbbbbbbb'])] });
      await cmcDocuments.unshareDocument(conn, relWith([{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }]), 'd1', { locale: 'es' });
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents', 'share-bbbbbbbbbbbb']);
      assert.deepStrictEqual(alerts(conn)[0].content.hds, { kind: 'document-unshared', eventId: 'd1' });
      assert.deepStrictEqual(alerts(conn)[0].content.title, { es: 'Documento retirado' });
    });

    it('[CDOC21] stopSharingDocuments removes the share child, a chat-only remainder accepted', async () => {
      const conn = account();
      const res = await cmcDocuments.stopSharingDocuments(conn, relWith([{ streamId: 'hds-noop', level: 'read' }, { streamId: 'share-aaaaaaaaaaaa', level: 'read' }]));
      assert.strictEqual(res.applied, true);
      assert.deepStrictEqual(conn.grant, [{ streamId: 'hds-noop', level: 'read' }]);
      const update = [...conn.events.values()].find(e => e.type === 'consent/scope-update-cmc');
      assert.deepStrictEqual(update.content.hds, { removed: ['share-aaaaaaaaaaaa'] });
      assert.ok(!conn.calls.some(c => c.method === 'streams.create'), 'hds-noop already granted: nothing provisioned');
      await assert.rejects(cmcDocuments.stopSharingDocuments(conn, relWith([{ streamId: 'body-weight', level: 'read' }])),
        (e) => e.innerObject?.reason === 'not-shared');
    });

    it('[CDOC22] nothing else shared: hds-noop provisioned and granted, the conversation goes on', async () => {
      const conn = account();
      await cmcDocuments.stopSharingDocuments(conn, relWith([{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }]));
      assert.ok(conn.streams.find(s => s.id === 'hds-noop'), 'hds-noop provisioned');
      assert.deepStrictEqual(conn.grant, [{ streamId: 'hds-noop', level: 'read' }]);
    });

    it('[CDOC24] once stopped the share child is deleted: documents keep `documents`, a later share never hands them back', async () => {
      const streams = [tree()[0], { id: 'share-aaaaaaaaaaaa', parentId: 'document-shares', name: 'share-aaaaaaaaaaaa', clientData: { hdsDocumentShare: { relationship: 'acc-1', direction: 'shared' } } }];
      const conn = account({ streams, events: [doc('d1', ['documents', 'share-aaaaaaaaaaaa']), doc('d2')] });
      const res = await cmcDocuments.stopSharingDocuments(conn, relWith([{ streamId: 'body-weight', level: 'read' }, { streamId: 'share-aaaaaaaaaaaa', level: 'read' }]));
      assert.strictEqual(res.shareStreamDeleted, true);
      assert.ok(!conn.streams.some(s => s.id === 'share-aaaaaaaaaaaa'));
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents']);
      for (const c of conn.calls.filter(c => c.method === 'streams.delete')) assert.strictEqual(c.params.mergeEventsWithParent, false);
      const again = await cmcDocuments.shareDocument(conn, relWith(conn.grant), 'd2');
      assert.notStrictEqual(again.shareStreamId, 'share-aaaaaaaaaaaa');
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents'], 'the earlier document stays unshared');
    });

    it('[CDOC25] the delete failing does not fail the stop; not waited for, the child is kept', async () => {
      const failing = account();
      const apiOne = failing.apiOne;
      failing.apiOne = async (method, params, key) => {
        if (method === 'streams.delete') throw apiError('forbidden');
        return apiOne(method, params, key);
      };
      const res = await cmcDocuments.stopSharingDocuments(failing, relWith([{ streamId: 'hds-noop', level: 'read' }, { streamId: 'share-aaaaaaaaaaaa', level: 'read' }]));
      assert.deepStrictEqual([res.applied, res.shareStreamDeleted], [true, false]);
      const pending = account();
      const res2 = await cmcDocuments.stopSharingDocuments(pending, relWith([{ streamId: 'hds-noop', level: 'read' }, { streamId: 'share-aaaaaaaaaaaa', level: 'read' }]), { waitForCompletion: false });
      assert.deepStrictEqual([res2.status, res2.shareStreamDeleted], ['pending', false]);
      assert.ok(!pending.calls.some(c => c.method === 'streams.delete'));
    });

    it('[CDOC23] other streams keep their meaning: without allowChatOnly the last one is still refused', async () => {
      const { cmcScope } = await import('../ts/index.ts');
      assert.deepStrictEqual(cmcScope.planStopSharing([{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }], 'share-aaaaaaaaaaaa'), { ok: false, reason: 'nothing-left' });
      assert.deepStrictEqual(cmcScope.planStopSharing([{ streamId: 'document-shares', level: 'read' }, { streamId: 'body-weight', level: 'read' }], 'share-aaaaaaaaaaaa', { parentIds: ['document-shares'] }),
        { ok: false, reason: 'shared-through-parent' });
    });
  });

  describe('[CDOC-R] receiving (Route B)', () => {
    it('[CDOC30] allowDocumentsFrom grants create-only on a received child, once', async () => {
      const conn = account();
      const { receiveStreamId, scopeUpdate } = await cmcDocuments.allowDocumentsFrom(conn, relWith([{ streamId: 'body-weight', level: 'read' }]));
      assert.ok(scopeUpdate.applied);
      assert.deepStrictEqual(conn.streams.find(s => s.id === receiveStreamId).clientData, { hdsDocumentShare: { relationship: 'acc-1', direction: 'received' } });
      assert.deepStrictEqual(conn.grant.at(-1), { streamId: receiveStreamId, level: 'create-only' });
      const again = await cmcDocuments.allowDocumentsFrom(conn, relWith([{ streamId: receiveStreamId, level: 'create-only' }]));
      assert.deepStrictEqual(again, { receiveStreamId, scopeUpdate: null });
    });

    it('[CDOC31] the contact sends: one multipart create on the receive child, then the alert on its own stream', async () => {
      const person = account();
      const own = account();
      const res = await cmcDocuments.sendDocument(person, own, {
        receiveStreamId: 'share-rrrrrrrrrrrr',
        collectorStreamId: ':_cmc:apps:hds-collector:collectors:anna',
        content: { title: 'Ordonnance' },
        file: new Uint8Array([1, 2, 3]),
        filename: 'ordonnance.pdf'
      });
      const created = person.events.get(res.eventId);
      assert.deepStrictEqual([created.type, created.streamIds], ['file/xds-v1', ['share-rrrrrrrrrrrr']]);
      assert.deepStrictEqual(own.events.get(res.alertEventId).content.hds, { kind: 'document-sent', eventId: res.eventId });
      await assert.rejects(cmcDocuments.sendDocument(person, own, { receiveStreamId: 'documents', collectorStreamId: 'x', content: {}, file: new Uint8Array(), filename: 'a' }),
        (e) => e.innerObject?.reason === 'not-a-share-stream');
    });

    it('[CDOC34] sent but not announced: alert-not-posted with the created eventId, so only the alert is posted again', async () => {
      const person = account();
      const own = account();
      own.apiOne = async () => { throw new Error('offline'); };
      let eventId;
      await assert.rejects(cmcDocuments.sendDocument(person, own, {
        receiveStreamId: 'share-rrrrrrrrrrrr', collectorStreamId: ':_cmc:apps:hds-collector:collectors:anna', content: {}, file: new Uint8Array([1]), filename: 'a.pdf'
      }), (e) => { eventId = e.innerObject?.eventId; return e.innerObject?.reason === 'alert-not-posted'; });
      assert.ok(person.events.has(eventId), 'the document is there');
    });

    it('[CDOC32] receiveDocument moves a valid document to documents, refuses the rest unchanged', async () => {
      const conn = account({
        streams: tree(),
        events: [
          doc('ok', ['share-rrrrrrrrrrrr']),
          { ...doc('note', ['share-rrrrrrrrrrrr']), type: 'note/txt' },
          { ...doc('empty', ['share-rrrrrrrrrrrr']), attachments: [] },
          { ...doc('big', ['share-rrrrrrrrrrrr']), attachments: [{ size: 5000 }] },
          doc('mine')
        ]
      });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'ok', { maxBytes: 1000 }), { ok: true });
      assert.deepStrictEqual(conn.events.get('ok').streamIds, ['documents']);
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'note'), { ok: false, reason: 'not-a-document' });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'empty'), { ok: false, reason: 'no-attachment' });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'big', { maxBytes: 1000 }), { ok: false, reason: 'too-large' });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'mine'), { ok: false, reason: 'not-received' });
      assert.deepStrictEqual(conn.events.get('note').streamIds, ['share-rrrrrrrrrrrr']);
    });

    it('[CDOC33] a shared document, or one sent through another relationship, is never "received": its shares stay', async () => {
      const conn = account({
        streams: tree(),
        events: [doc('shared', ['documents', 'share-ssssssssssss']), doc('onShared', ['share-ssssssssssss']), doc('sent', ['share-rrrrrrrrrrrr'])]
      });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'shared'), { ok: false, reason: 'not-received' });
      assert.deepStrictEqual(conn.events.get('shared').streamIds, ['documents', 'share-ssssssssssss']);
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'onShared'), { ok: false, reason: 'not-received' });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'sent', { relationship: 'acc-2' }), { ok: false, reason: 'not-received' });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'sent', { relationship: 'acc-1:4' }), { ok: true });
    });
  });

  describe('[CDOC-C] cleanup', () => {
    it('[CDOC40] full revoke: the receive child processed first, both children deleted, documents kept', async () => {
      const conn = account({ streams: tree(), events: [doc('d1', ['documents', 'share-ssssssssssss']), doc('r1', ['share-rrrrrrrrrrrr'])] });
      const deleted = await cmcDocuments.cleanupDocumentShares(conn, 'acc-1');
      assert.deepStrictEqual(deleted.sort(), ['share-rrrrrrrrrrrr', 'share-ssssssssssss']);
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents']);
      assert.deepStrictEqual(conn.events.get('r1').streamIds, ['documents'], 'the received document survives');
      assert.deepStrictEqual(conn.streams.map(s => s.id), ['document-shares', 'share-oooooooooooo']);
      for (const c of conn.calls.filter(c => c.method === 'streams.delete')) assert.strictEqual(c.params.mergeEventsWithParent, false);
    });

    it('[CDOC42] children trashed by an interrupted cleanup are still found and drained (trashed events too), then deleted; several pages', async () => {
      const streams = tree();
      streams[1].trashed = true;
      streams[2].trashed = true;
      const received = Array.from({ length: 1200 }, (_, i) => doc('r' + i, ['share-rrrrrrrrrrrr']));
      received[0].trashed = true;
      const conn = account({ streams, events: received });
      const deleted = await cmcDocuments.cleanupDocumentShares(conn, 'acc-1:3');
      assert.deepStrictEqual(deleted.sort(), ['share-rrrrrrrrrrrr', 'share-ssssssssssss']);
      assert.strictEqual(conn.events.size, 1200, 'every received document survives');
      assert.ok([...conn.events.values()].every(e => e.streamIds.length === 1 && e.streamIds[0] === 'documents'));
    });

    it('[CDOC41] after a restore: children of relationships that no longer exist are cleaned up', async () => {
      const conn = account({ streams: tree() });
      assert.deepStrictEqual(await cmcDocuments.cleanupOrphanDocumentShares(conn, ['acc-1:2']), ['share-oooooooooooo']);
      assert.deepStrictEqual(await cmcDocuments.listShareStreams(account()), [], 'no root yet: no share child');
    });

    it('[CDOC43] without a list, the live relationships are the accesses (expired too), read only with a personal token', async () => {
      const conn = account({ streams: tree(), accesses: [{ id: 'acc-1:5' }, { id: 'app-x' }] });
      assert.deepStrictEqual(await cmcDocuments.cleanupOrphanDocumentShares(conn), ['share-oooooooooooo']);
      assert.deepStrictEqual(conn.calls.find(c => c.method === 'accesses.get').params, { includeExpired: true });
      assert.deepStrictEqual(conn.streams.map(s => s.id).sort(), ['document-shares', 'share-rrrrrrrrrrrr', 'share-ssssssssssss']);
      const app = account({ streams: tree(), accesses: [], tokenType: 'app' });
      await assert.rejects(cmcDocuments.cleanupOrphanDocumentShares(app), (e) => e.innerObject?.reason === 'not-personal');
      assert.strictEqual(app.streams.length, 4, 'nothing deleted');
      const down = account({ streams: tree() });
      const apiOne = down.apiOne;
      down.apiOne = async (method, params, key) => {
        if (method === 'accesses.get') throw new Error('offline');
        return apiOne(method, params, key);
      };
      await assert.rejects(cmcDocuments.cleanupOrphanDocumentShares(down), /offline/);
      assert.strictEqual(down.streams.length, 4, 'accesses not read: nothing deleted');
      const empty = account();
      assert.deepStrictEqual(await cmcDocuments.cleanupOrphanDocumentShares(empty), []);
      assert.ok(!empty.calls.some(c => c.method === 'accessInfo' || c.method === 'accesses.get'), 'no share child: accesses not read');
    });
  });

  describe('[CDOC-F] filing and uploaders (plan 140)', () => {
    const R = 'share-rrrrrrrrrrrr';
    const S = 'share-ssssssssssss';
    const O = 'share-oooooooooooo';
    const CLINICAL = 'documents-clinical';
    const uploader = () => relWith([{ streamId: R, level: 'contribute' }, { streamId: S, level: 'read' }]);

    // the published pack plus the class streams of plan 140, until a data-model release carries them
    before(async () => {
      const pack = await (await fetch(modelURL)).json();
      const root = pack.streams.find(s => s.id === 'documents');
      root.children = [
        { id: CLINICAL, name: 'Clinical documents', parentId: 'documents', children: [] },
        { id: 'documents-admin', name: 'Administrative documents', parentId: 'documents', children: [{ id: 'documents-admin-insurance', name: 'Insurance documents', parentId: 'documents-admin', children: [] }] }
      ];
      pack.documentKinds.kinds['laboratory-report'].stream = CLINICAL;
      pack.documentKinds.kinds['referral-letter'].stream = 'documents-not-in-the-model';
      getModel().loadFromObject(pack);
      getModel().laziliyLoadedMap = {}; // a reload keeps the maps built from the previous pack
    });
    after(async () => {
      await getModel().load(modelURL);
      getModel().laziliyLoadedMap = {};
    });

    it('[CDOC50] a contribute child is never the shared one, even alone', () => {
      assert.deepStrictEqual(cmcDocuments.shareStreamsOf([{ streamId: R, level: 'contribute' }]), { shared: null, received: R });
      assert.deepStrictEqual(cmcDocuments.shareStreamsOf([{ streamId: R, level: 'contribute' }, { streamId: S, level: 'read' }]), { shared: S, received: R });
      assert.deepStrictEqual(cmcDocuments.shareStreamsOf([{ streamId: R, level: 'manage' }, { streamId: O, level: 'none' }]), { shared: null, received: null });
    });

    it('[CDOC69] grants are read with canonical stream ids', () => {
      const at = (streamId, level = 'read') => [{ streamId, level }];
      assert.strictEqual(cmcDocuments.canonicalStreamId(':local:'), '*');
      assert.strictEqual(cmcDocuments.canonicalStreamId(''), '');
      for (const [id, to] of [[':account::local:', '*'], [':account::local:body', 'body'], [':account::account::system:email', ':system:email'], [':account:email', ':account:email'], [':_audit:access-a', ':_audit:access-a']]) assert.strictEqual(cmcDocuments.canonicalStreamId(id), to);
      const own = at(':_audit:access-acc-1');
      assert.deepStrictEqual([undefined, 'acc-1', 'acc-1:4', 'acc-2'].map(id => cmcDocuments.namesAliasedStreams(own, id)), [true, false, false, true]);
      for (const id of [':local:', ':local:*', ':local:documents']) {
        assert.strictEqual(cmcDocuments.readsDocument(at(id), doc('d')), true, id);
        assert.strictEqual(cmcDocuments.sharesAllDocuments(at(id)), true, id);
      }
      assert.strictEqual(cmcDocuments.readsDocument([...at('documents'), ...at(':local:documents', 'none')].reverse(), doc('d', ['documents'])), true);
      assert.deepStrictEqual(cmcDocuments.shareStreamsOf([...at(':local:' + S), ...at(':local:share-rrrrrrrrrrrr', 'contribute')]), { shared: S, received: 'share-rrrrrrrrrrrr' });
      assert.strictEqual(cmcDocuments.namesAliasedStreams([{ streamId: 'body' }, { feature: 'selfRevoke' }, { streamId: ':_cmc:inbox' }, { streamId: ':system:email' }]), false);
      for (const id of [':local:body', ':local:', ':account::system:email', ':account:email', ':_audit:', ':LOCAL:', ':x']) assert.strictEqual(cmcDocuments.namesAliasedStreams(at(id)), true, id);
      for (const id of [':_system:account', ':_cmc:apps:a:b', ':_emails:x', 'a:local:b', '*']) assert.strictEqual(cmcDocuments.namesAliasedStreams(at(id)), false, id);
      assert.strictEqual(cmcDocuments.namesAliasedStreams(undefined), false);
      const feature = { feature: 'selfRevoke', setting: 'forbidden' };
      assert.deepStrictEqual(cmcDocuments.canonicalPermissions([feature, ...at(':local:body')]), [feature, { streamId: 'body', level: 'read' }]);
    });

    it('[CDOC51] readsDocument: nearest entry wins, one readable stream is enough, none and create-only hide', () => {
      const reads = (perms, ...streamIds) => cmcDocuments.readsDocument(perms.map(([streamId, level]) => ({ streamId, level })), { streamIds });
      assert.strictEqual(reads([['documents', 'read']], CLINICAL), true);
      assert.strictEqual(reads([['documents', 'read']], 'documents-admin-insurance', S), true);
      assert.strictEqual(reads([['*', 'read']], CLINICAL), true);
      assert.strictEqual(reads([[CLINICAL, 'read']], CLINICAL, S), true);
      assert.strictEqual(reads([[CLINICAL, 'read']], 'documents'), false);
      assert.strictEqual(reads([[CLINICAL, 'read']], 'documents-admin'), false);
      assert.strictEqual(reads([['documents-admin', 'read']], 'documents-admin-insurance'), true);
      assert.strictEqual(reads([['documents', 'read'], [CLINICAL, 'none']], CLINICAL), false);
      assert.strictEqual(reads([[S, 'read'], [CLINICAL, 'create-only']], CLINICAL, S), false);
      assert.strictEqual(reads([['documents', 'none'], [CLINICAL, 'read']], CLINICAL), true);
      assert.strictEqual(reads([['documents', 'create-only']], 'documents'), false);
      assert.strictEqual(reads([['body', 'read']], CLINICAL), false);
      assert.strictEqual(cmcDocuments.readsDocument([{ streamId: 'documents', level: 'read' }], { streamIds: [] }), false);
      assert.strictEqual(reads([['documents', 'no-such-level']], 'documents'), false);
      assert.strictEqual(reads([['documents', 'read']], 'documents-newer-than-the-pack'), true, 'a pack older than the document');
      assert.ok(!cmcDocuments.isDocumentsStream('document-shares'));
      assert.strictEqual(reads([['documents-x', 'read']], 'documents-x-y'), true);
      assert.strictEqual(reads([['documents', 'read'], ['documents-x', 'none']], 'documents-x-y'), false);
    });

    it('[CDOC52] a kind files under the pack stream the model knows, else documents; a class document resolves to its item', () => {
      const kinds = getModel().documentKinds;
      assert.strictEqual(kinds.streamFor('laboratory-report'), CLINICAL);
      assert.strictEqual(kinds.streamFor('referral-letter'), 'documents');
      assert.strictEqual(kinds.streamFor('other'), 'documents');
      assert.strictEqual(kinds.streamFor('nope'), 'documents');
      const item = (...streamIds) => getModel().itemsDefs.forEvent({ streamIds, type: 'file/xds-v1' }, false)?.key;
      assert.strictEqual(item(CLINICAL, S), 'document');
      assert.strictEqual(item(S, 'documents-admin-insurance'), 'document');
      assert.strictEqual(item(S), undefined);
      const first = getModel().itemsDefs.forEvent({ streamIds: [CLINICAL, 'documents-admin'], type: 'file/xds-v1' }, false);
      assert.strictEqual(first?.key, 'document', 'two class streams resolve once');
    });

    it('[CDOC53] filedStreamIds: one documents stream, first, every other id kept in order', () => {
      assert.deepStrictEqual(cmcDocuments.filedStreamIds(['documents', S, O], CLINICAL), [CLINICAL, S, O]);
      assert.deepStrictEqual(cmcDocuments.filedStreamIds([S, CLINICAL, O], 'documents-admin-insurance'), ['documents-admin-insurance', S, O]);
      assert.deepStrictEqual(cmcDocuments.filedStreamIds([CLINICAL, S], 'documents'), ['documents', S]);
    });

    it('[CDOC54] fileDocument keeps every share id and creates the class stream with its parents', async () => {
      const conn = account({ streams: tree(), events: [doc('d1', ['documents', S, O])] });
      await cmcDocuments.fileDocument(conn, 'd1', 'documents-admin-insurance');
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents-admin-insurance', S, O]);
      assert.deepStrictEqual(conn.streams.slice(4).map(s => [s.id, s.parentId]), [['documents', null], ['documents-admin', 'documents'], ['documents-admin-insurance', 'documents-admin']]);
      await cmcDocuments.fileDocument(conn, 'd1', CLINICAL);
      assert.deepStrictEqual(conn.events.get('d1').streamIds, [CLINICAL, S, O]);
    });

    it('[CDOC55] fileDocument refuses another stream, another type, and a document still on a received child only', async () => {
      const conn = account({ streams: tree(), events: [doc('d1'), { ...doc('n1'), type: 'note/txt' }, doc('r1', [R])] });
      const refused = async (id, stream, reason) => assert.rejects(cmcDocuments.fileDocument(conn, id, stream), (e) => e.innerObject?.reason === reason);
      await refused('d1', 'body-weight', 'not-a-documents-stream');
      await refused('d1', S, 'not-a-documents-stream');
      await refused('d1', 'documents-newer-than-the-pack', 'not-a-documents-stream');
      await refused('n1', CLINICAL, 'not-a-document');
      await refused('r1', CLINICAL, 'not-received');
      assert.ok(!conn.calls.some(c => c.method === 'events.update' || c.method === 'streams.create'));
    });

    it('[CDOC56] receiveDocument: an uploader keeps its received id; without its grant, or at create-only, it does not', async () => {
      const conn = account({ streams: tree(), events: [doc('a', [R]), doc('b', [R]), doc('c', [R])] });
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'a', { relationship: 'acc-1', streamId: CLINICAL, permissions: uploader().grantedPermissions }), { ok: true });
      assert.deepStrictEqual(conn.events.get('a').streamIds, [CLINICAL, R]);
      await cmcDocuments.receiveDocument(conn, 'b', { permissions: [{ streamId: R, level: 'create-only' }] });
      assert.deepStrictEqual(conn.events.get('b').streamIds, ['documents']);
      await cmcDocuments.receiveDocument(conn, 'c', { streamId: CLINICAL });
      assert.deepStrictEqual(conn.events.get('c').streamIds, [CLINICAL]);
      assert.deepStrictEqual(await cmcDocuments.receiveDocument(conn, 'a', { permissions: uploader().grantedPermissions }), { ok: false, reason: 'not-received' });
      await assert.rejects(cmcDocuments.receiveDocument(conn, 'a', { streamId: 'body' }), (e) => e.innerObject?.reason === 'not-a-documents-stream');
    });

    it('[CDOC57] freezeDocument swaps the received id for the shared one, other shares kept', async () => {
      const conn = account({ streams: tree(), events: [doc('d1', [CLINICAL, R, O])] });
      const res = await cmcDocuments.freezeDocument(conn, uploader(), 'd1');
      assert.deepStrictEqual(res, { shareStreamId: S, scopeUpdate: null });
      assert.deepStrictEqual(conn.events.get('d1').streamIds, [CLINICAL, S, O]);
      await assert.rejects(cmcDocuments.freezeDocument(conn, uploader(), 'd1'), (e) => e.innerObject?.reason === 'not-open');
    });

    it('[CDOC58] freezeDocument grants a shared child when there is none, and refuses a document not filed', async () => {
      const conn = account({ streams: [tree()[0], tree()[2]], events: [doc('d1', [CLINICAL, R]), doc('r1', [R])] });
      const rel = relWith([{ streamId: R, level: 'contribute' }]);
      await assert.rejects(cmcDocuments.freezeDocument(conn, rel, 'r1'), (e) => e.innerObject?.reason === 'not-filed');
      const res = await cmcDocuments.freezeDocument(conn, rel, 'd1');
      assert.ok(res.scopeUpdate.applied);
      assert.deepStrictEqual(conn.grant, [{ streamId: R, level: 'contribute' }, { streamId: res.shareStreamId, level: 'read' }]);
      assert.deepStrictEqual(conn.events.get('d1').streamIds, [CLINICAL, res.shareStreamId]);
    });

    it('[CDOC59] allowDocumentsFrom at contribute; a child granted at the other level changes level', async () => {
      const conn = account();
      const { receiveStreamId } = await cmcDocuments.allowDocumentsFrom(conn, relWith([{ streamId: 'body-weight', level: 'read' }]), { level: 'contribute' });
      const marks = (id) => conn.streams.find(s => s.id === id)?.clientData?.hdsDocumentShare;
      const readFirst = (received) => {
        assert.deepStrictEqual(conn.grant.map(p => p.level), ['read', 'read', 'contribute'], 'the shared child is granted, before the received one');
        assert.strictEqual(conn.grant[2].streamId, received);
        assert.strictEqual(marks(conn.grant[1].streamId).direction, 'shared');
      };
      readFirst(receiveStreamId);
      assert.strictEqual(marks(receiveStreamId).direction, 'received');
      const up = await cmcDocuments.allowDocumentsFrom(conn, relWith([{ streamId: 'body-weight', level: 'read' }, { streamId: R, level: 'create-only' }]), { level: 'contribute' });
      assert.strictEqual(up.receiveStreamId, R);
      readFirst(R);
      await cmcDocuments.allowDocumentsFrom(conn, relWith([{ streamId: R, level: 'create-only' }, { streamId: S, level: 'read' }]), { level: 'contribute' });
      assert.deepStrictEqual(conn.grant, [{ streamId: S, level: 'read' }, { streamId: R, level: 'contribute' }]);
      assert.deepStrictEqual(await cmcDocuments.allowDocumentsFrom(conn, uploader()), { receiveStreamId: R, scopeUpdate: null });
      assert.deepStrictEqual(await cmcDocuments.allowDocumentsFrom(conn, uploader(), { level: 'contribute' }), { receiveStreamId: R, scopeUpdate: null });
    });

    it('[CDOC59b] back to create-only is refused while the child holds documents', async () => {
      const held = account({ streams: tree(), events: [doc('d1', [CLINICAL, R])] });
      await assert.rejects(cmcDocuments.allowDocumentsFrom(held, uploader(), { level: 'create-only' }), (e) => e.innerObject?.reason === 'open-documents');
      assert.strictEqual(held.grant, null);
      const empty = account({ streams: tree() });
      await cmcDocuments.allowDocumentsFrom(empty, uploader(), { level: 'create-only' });
      assert.deepStrictEqual(empty.grant, [{ streamId: S, level: 'read' }, { streamId: R, level: 'create-only' }]);
      const { cmcScope } = await import('../ts/index.ts');
      const refused = (streamId, level, reason) => assert.rejects(cmcScope.changeSharedLevel(empty, uploader(), streamId, level), (e) => e.innerObject?.reason === reason);
      await refused('body', 'read', 'not-shared');
      await refused(R, 'contribute', 'same-level');
    });

    it('[CDOC59c] an ungranted received child is reused only when empty; a granted one always', async () => {
      const none = relWith([{ streamId: 'body-weight', level: 'read' }]);
      const held = account({ streams: tree(), events: [doc('d1', [CLINICAL, R])] });
      assert.notStrictEqual(await cmcDocuments.ensureShareStream(held, none, 'received'), R);
      const empty = account({ streams: tree() });
      assert.strictEqual(await cmcDocuments.ensureShareStream(empty, none, 'received'), R);
      const live = account({ streams: tree(), events: [doc('d1', [CLINICAL, R])], accesses: [{ id: 'acc-1:9', permissions: uploader().grantedPermissions }] });
      assert.strictEqual(await cmcDocuments.ensureShareStream(live, none, 'received'), R);
    });

    it('[CDOC60] newUploaderOffer: two new ids each time, contribute and read', () => {
      const a = cmcDocuments.newUploaderOffer();
      assert.deepStrictEqual(cmcDocuments.shareStreamsOf(a.permissions), { shared: a.shared, received: a.received });
      const b = cmcDocuments.newUploaderOffer();
      assert.strictEqual(new Set([a.shared, a.received, b.shared, b.received]).size, 4);
      assert.deepStrictEqual(a.permissions.map(p => p.level), ['read', 'contribute'], 'read first: an older hds-lib takes the first one');
    });

    it('[CDOC68] checkOfferedShares: nothing read without a share child; another access names an unmarked one', async () => {
      const calls = [];
      const account = (accesses) => ({
        accessInfo: async () => ({ type: 'personal' }),
        apiOne: async (method) => { calls.push(method); return method === 'accesses.get' ? accesses : tree(); }
      });
      const N = 'share-nnnnnnnnnnnn';
      assert.deepStrictEqual(await cmcDocuments.checkOfferedShares(account([]), [{ streamId: 'body', level: 'read' }]), []);
      assert.deepStrictEqual(calls, []);
      const named = [{ id: 'acc-9', permissions: [{ streamId: N, level: 'read' }] }];
      assert.deepStrictEqual(await cmcDocuments.checkOfferedShares(account(named), [{ streamId: ':local:' + N, level: 'read' }]), [{ streamId: N, reason: 'taken' }]);
      assert.deepStrictEqual(await cmcDocuments.checkOfferedShares(account([]), [{ streamId: N, level: 'read' }]), []);
      // a marked one is judged by its mark; a permission without a stream (a feature) is left out
      assert.deepStrictEqual(await cmcDocuments.checkOfferedShares(account([]), [{ streamId: S, level: 'read' }, { feature: 'selfRevoke' }, { streamId: N, level: 'read' }]),
        [{ streamId: S, reason: 'taken' }]);
      assert.deepStrictEqual(await cmcDocuments.checkOfferedShares(account(named), [{ streamId: S, level: 'read' }], { accessId: 'acc-1:3', grantedPermissions: [] }), []);
      assert.deepStrictEqual(await cmcDocuments.checkOfferedShares(account([{ id: 'acc-9', createdBy: 'acc-1 x', permissions: [{ streamId: N }] }, { id: 'acc-8' }]),
        [{ streamId: N, level: 'read' }], { accessId: 'acc-1', grantedPermissions: [] }), []);
      assert.strictEqual(cmcDocuments.namesShareStreams(undefined), false);
      // the asking relationship's own grant naming it is not another access
      assert.deepStrictEqual(await cmcDocuments.checkOfferedShares(account(named), [{ streamId: N, level: 'read' }], { accessId: 'acc-9:2', grantedPermissions: [] }), []);
    });

    it('[CDOC61] offeredShareIssues: another relationship\'s id, the root, a level no share child has', () => {
      const existing = cmcDocuments.shareStreamsIn(tree());
      const issues = (perms, accessId, grantedPermissions = []) => cmcDocuments.offeredShareIssues(perms, existing, accessId ? { accessId, grantedPermissions } : undefined);
      assert.deepStrictEqual(issues([{ streamId: S, level: 'read' }, { streamId: 'body', level: 'read' }]), [{ streamId: S, reason: 'taken' }]);
      assert.deepStrictEqual(issues([{ streamId: S, level: 'read' }], 'acc-1:7'), []);
      assert.deepStrictEqual(issues([{ streamId: O, level: 'read' }], 'acc-1'), [{ streamId: O, reason: 'taken' }]);
      assert.deepStrictEqual(issues([{ streamId: 'document-shares', level: 'read' }, { streamId: 'share-nnnnnnnnnnnn', level: 'manage' }]),
        [{ streamId: 'document-shares', reason: 'root' }, { streamId: 'share-nnnnnnnnnnnn', reason: 'level' }]);
      assert.deepStrictEqual(issues(cmcDocuments.newUploaderOffer().permissions), []);
      // the platform reads `:local:<id>` as `<id>`
      assert.deepStrictEqual(issues([{ streamId: ':local:' + S, level: 'read' }, { streamId: ':local::local:document-shares', level: 'read' }]),
        [{ streamId: S, reason: 'taken' }, { streamId: 'document-shares', reason: 'root' }]);
      assert.deepStrictEqual(issues([{ streamId: ':local:' + S, level: 'read' }], 'acc-1:7'), []);
      assert.strictEqual(cmcDocuments.namesShareStreams([{ streamId: ':local:' + S }]), true);
      assert.strictEqual(cmcDocuments.namesShareStreams([{ streamId: 'body' }, { streamId: '*' }, {}]), false);
      assert.deepStrictEqual(issues([{ streamId: S, level: 'contribute' }], 'acc-1'), [{ streamId: S, reason: 'direction' }], 'never write access to what she shared');
      assert.deepStrictEqual(issues([{ streamId: R, level: 'read' }], 'acc-1'), [{ streamId: R, reason: 'direction' }]);
      assert.deepStrictEqual(issues([{ streamId: S, level: 'read' }, { streamId: R, level: 'contribute' }], 'acc-1'), []);
      assert.deepStrictEqual(issues([...cmcDocuments.newUploaderOffer().permissions, { streamId: 'share-eeeeeeeeeeee', level: 'create-only' }]), [{ streamId: 'share-eeeeeeeeeeee', reason: 'extra' }]);
      const offer = cmcDocuments.newUploaderOffer();
      assert.deepStrictEqual(issues([{ streamId: offer.shared, level: 'contribute' }, { streamId: offer.received, level: 'read' }], 'acc-3', offer.permissions).map(i => i.reason), ['direction', 'direction'], 'swapped before they are marked');
      assert.deepStrictEqual(issues(offer.permissions, 'acc-3', offer.permissions), []);
    });

    it('[CDOC62] ensureOfferedShareStreams creates and marks both, repairs an unmarked or misplaced one, is idempotent', async () => {
      const conn = account({ streams: [{ id: R, parentId: null, name: 'Clinic X' }] });
      const apiOne = conn.apiOne;
      conn.apiOne = async (method, params, key) => {
        if (method === 'streams.get' && params.parentId == null) return conn.streams.map(s => ({ ...s }));
        if (method === 'streams.update') return Object.assign(conn.streams.find(s => s.id === params.id), params.update);
        return apiOne(method, params, key);
      };
      const mark = (direction) => ({ hdsDocumentShare: { relationship: 'acc-1', direction } });
      for (let i = 0; i < 2; i++) {
        assert.deepStrictEqual(await cmcDocuments.ensureOfferedShareStreams(conn, uploader()), { shared: S, received: R });
        assert.deepStrictEqual(conn.streams.find(s => s.id === R), { id: R, parentId: 'document-shares', name: R, clientData: mark('received') });
        assert.deepStrictEqual(conn.streams.find(s => s.id === S), { id: S, parentId: 'document-shares', name: S, clientData: mark('shared') });
      }
      conn.streams.find(s => s.id === S).parentId = null;
      await cmcDocuments.ensureOfferedShareStreams(conn, uploader());
      assert.strictEqual(conn.streams.find(s => s.id === S).parentId, 'document-shares', 'a marked one at the root is moved');
      await assert.rejects(cmcDocuments.ensureOfferedShareStreams(conn, { ...uploader(), accessId: 'acc-2' }), (e) => e.innerObject?.reason === 'share-id-taken');
      conn.streams.find(s => s.id === R).clientData = mark('shared');
      await assert.rejects(cmcDocuments.ensureOfferedShareStreams(conn, uploader()), (e) => e.innerObject?.reason === 'share-id-taken');
      conn.streams.find(s => s.id === R).clientData = mark('received');
      conn.streams.find(s => s.id === R).trashed = true;
      await assert.rejects(cmcDocuments.ensureOfferedShareStreams(conn, uploader()), (e) => e.innerObject?.reason === 'share-id-taken');
    });

    it('[CDOC62b] an unmarked stream another access names is not adopted; the group\'s own member accesses do not count', async () => {
      const withAccess = (access) => {
        const conn = account({ streams: [{ id: 'document-shares', parentId: null }, { id: R, parentId: 'document-shares', name: R, clientData: { other: 1 } }], accesses: [{ id: 'acc-1:2', permissions: uploader().grantedPermissions }, access] });
        const apiOne = conn.apiOne;
        conn.apiOne = async (method, params, key) => {
          if (method === 'streams.get' && params.parentId == null) return conn.streams.map(s => ({ ...s }));
          if (method === 'streams.update') return Object.assign(conn.streams.find(s => s.id === params.id), params.update);
          return apiOne(method, params, key);
        };
        return conn;
      };
      const permissions = [{ streamId: R, level: 'contribute' }];
      await assert.rejects(cmcDocuments.ensureOfferedShareStreams(withAccess({ id: 'acc-7', createdBy: 'personal', permissions }), uploader()), (e) => e.innerObject?.reason === 'share-id-taken');
      const member = withAccess({ id: 'acc-8', createdBy: 'acc-1:2 member-7', permissions });
      await cmcDocuments.ensureOfferedShareStreams(member, uploader());
      assert.deepStrictEqual(member.streams.find(s => s.id === R).clientData, { other: 1, hdsDocumentShare: { relationship: 'acc-1', direction: 'received' } });
    });

    it('[CDOC63] unshareDocument takes the id off, and says when the contact still reads it (no alert)', async () => {
      const conn = account({ streams: tree(), events: [doc('d1', [CLINICAL, S]), doc('d2', [CLINICAL, R, S])] });
      const still = async (rel, id, left) => {
        assert.deepStrictEqual(await cmcDocuments.unshareDocument(conn, rel, id), { alertEventId: null, stillReads: true });
        assert.deepStrictEqual(conn.events.get(id).streamIds, left);
      };
      await still(relWith([{ streamId: CLINICAL, level: 'read' }, { streamId: S, level: 'read' }]), 'd1', [CLINICAL]);
      await still(uploader(), 'd2', [CLINICAL, R]);
      assert.strictEqual(alerts(conn).length, 0);
      conn.events.set('d3', doc('d3', [CLINICAL, S]));
      const res = await cmcDocuments.unshareDocument(conn, uploader(), 'd3');
      assert.deepStrictEqual([res.stillReads, conn.events.get('d3').streamIds, alerts(conn).length], [false, [CLINICAL], 1]);
    });

    it('[CDOC64] cleanup keeps where a document is filed, other contacts\' shares and a value\'s own stream', async () => {
      const value = { id: 'v1', type: 'mass/kg', streamIds: ['body-weight', R] };
      const conn = account({ streams: tree(), events: [doc('filed', [CLINICAL, R, O]), doc('open', [R]), doc('odd', [R, O]), value] });
      await cmcDocuments.cleanupDocumentShares(conn, 'acc-1');
      const ids = (id) => conn.events.get(id).streamIds;
      assert.deepStrictEqual([ids('filed'), ids('open'), ids('odd'), ids('v1')], [[CLINICAL, O], ['documents'], ['documents', O], ['body-weight']]);
    });

    it('[CDOC66] stopping all sharing with an uploader grants a new empty shared child first, never leaving contribute alone', async () => {
      const conn = account({ streams: tree(), events: [doc('d1', [CLINICAL, S])] });
      const res = await cmcDocuments.stopSharingDocuments(conn, uploader());
      assert.strictEqual(res.shareStreamDeleted, true);
      assert.deepStrictEqual(conn.grant.map(p => p.level), ['read', 'contribute']);
      assert.ok(![S, R].includes(conn.grant[0].streamId));
      assert.deepStrictEqual(conn.events.get('d1').streamIds, [CLINICAL]);
      const update = [...conn.events.values()].find(e => e.type === 'consent/scope-update-cmc');
      assert.deepStrictEqual(update.content.hds, { removed: [S] });
    });

    it('[CDOC67] ensureOfferedShareStreams does not adopt a stream it cannot check: personal token only', async () => {
      const conn = account({ streams: [{ id: 'document-shares', parentId: null }, { id: R, parentId: null, name: R }], tokenType: 'app' });
      await assert.rejects(cmcDocuments.ensureOfferedShareStreams(conn, uploader()), (e) => e.innerObject?.reason === 'not-personal');
    });

    it('[CDOC65] offered children never marked: found by the ended grant, or by the orphan sweep once no access names them', async () => {
      const unmarked = () => [{ id: 'document-shares', parentId: null }, { id: R, parentId: 'document-shares', name: R }, { id: S, parentId: 'document-shares', name: S }];
      const ended = account({ streams: unmarked(), events: [doc('up', [R])] });
      assert.deepStrictEqual((await cmcDocuments.cleanupDocumentShares(ended, 'acc-1', { permissions: uploader().grantedPermissions })).sort(), [R, S]);
      assert.deepStrictEqual(ended.events.get('up').streamIds, ['documents']);
      const atRoot = account({ streams: [{ id: 'document-shares', parentId: null }, { id: R, parentId: null, name: R }], events: [doc('up', [R])] });
      assert.deepStrictEqual(await cmcDocuments.cleanupDocumentShares(atRoot, 'acc-1', { permissions: uploader().grantedPermissions }), [R]);
      assert.deepStrictEqual(atRoot.events.get('up').streamIds, ['documents']);
      const named = account({ streams: unmarked(), events: [doc('up', [R])], accesses: [{ id: 'acc-1', permissions: uploader().grantedPermissions }] });
      assert.deepStrictEqual(await cmcDocuments.cleanupOrphanDocumentShares(named), []);
      const gone = account({ streams: unmarked(), events: [doc('up', [R])] });
      assert.deepStrictEqual(await cmcDocuments.cleanupOrphanDocumentShares(gone), [R], 'the empty one may be an offer being accepted');
      assert.deepStrictEqual(gone.events.get('up').streamIds, ['documents']);
      assert.deepStrictEqual(await cmcDocuments.cleanupOrphanDocumentShares(account({ streams: unmarked(), events: [doc('up', [R])] }), ['acc-1']), [], 'a list of relationships says nothing of unmarked ones');
    });
  });

  describe('[CDOC-O] open documents, the documents relationship, the grant note (plan 144)', () => {
    const Q = 'share-qqqqqqqqqqqq';
    const openTree = () => [...tree(), { id: Q, parentId: 'document-shares', name: Q, clientData: { hdsDocumentShare: { relationship: 'acc-2', direction: 'received' } } }];
    const writes = (conn) => conn.calls.filter(c => !['events.getOne', 'streams.get', 'accesses.get', 'accessInfo'].includes(c.method));

    it('[CDOC70] MAX_DOCUMENT_BYTES: 50 MB, all files of one document', () => {
      assert.strictEqual(cmcDocuments.MAX_DOCUMENT_BYTES, 50 * 1024 * 1024);
    });

    it('[CDOC71] openRelationshipsOf: one per received child the document carries, by its mark, in order, no repeat', () => {
      const marks = cmcDocuments.shareStreamsIn(openTree());
      assert.deepStrictEqual(cmcDocuments.openRelationshipsOf(['documents', 'share-rrrrrrrrrrrr', 'share-ssssssssssss', Q, 'share-rrrrrrrrrrrr'], marks), ['acc-1', 'acc-2']);
      assert.deepStrictEqual(cmcDocuments.openRelationshipsOf(['documents-clinical', 'share-ssssssssssss', 'share-oooooooooooo'], marks), [], 'shared children close nothing');
      assert.deepStrictEqual(cmcDocuments.openRelationshipsOf(['documents', 'share-unmarked0000'], marks), [], 'an unmarked id says nothing');
      assert.deepStrictEqual(cmcDocuments.openRelationshipsOf(null, marks), []);
      assert.deepStrictEqual(cmcDocuments.openRelationshipsOf([Q], marks), [], 'not received yet: not hers, not open');
    });

    it('[CDOC72b] shareDocument refuses a document not received yet (not-received), before anything is written', async () => {
      const conn = account({ streams: openTree(), events: [doc('d1', [Q])] });
      await assert.rejects(cmcDocuments.shareDocument(conn, relWith([{ streamId: 'body-weight', level: 'read' }]), 'd1'),
        (e) => e.innerObject?.reason === 'not-received' && e.innerObject.eventId === 'd1');
      assert.deepStrictEqual(writes(conn), []);
      assert.deepStrictEqual(conn.events.get('d1').streamIds, [Q]);
    });

    it('[CDOC72] shareDocument refuses a document open to another contact, and writes nothing', async () => {
      const conn = account({ streams: openTree(), events: [doc('d1', ['documents', Q])] });
      await assert.rejects(cmcDocuments.shareDocument(conn, relWith([{ streamId: 'body-weight', level: 'read' }]), 'd1'),
        (e) => e.innerObject?.reason === 'open-document' && JSON.stringify(e.innerObject.relationships) === '["acc-2"]' && e.innerObject.eventId === 'd1');
      assert.deepStrictEqual(writes(conn), [], 'no stream, no scope update, no event change, no alert');
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents', Q]);
      const granted = account({ streams: openTree(), events: [doc('d2', ['documents-clinical', 'share-ssssssssssss', Q])] });
      await assert.rejects(cmcDocuments.shareDocument(granted, relWith([{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }]), 'd2'),
        (e) => e.innerObject?.reason === 'open-document');
      assert.deepStrictEqual(writes(granted), []);
    });

    it('[CDOC73] shareDocument: open to the same contact it is shared with, allowed; already frozen, allowed', async () => {
      const conn = account({ streams: openTree(), events: [doc('d1', ['documents', 'share-rrrrrrrrrrrr']), doc('d2', ['documents', 'share-oooooooooooo'])] });
      const rel = relWith([{ streamId: 'share-ssssssssssss', level: 'read' }, { streamId: 'share-rrrrrrrrrrrr', level: 'contribute' }]);
      const res = await cmcDocuments.shareDocument(conn, rel, 'd1');
      assert.strictEqual(res.mode, 'shared');
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents', 'share-rrrrrrrrrrrr', 'share-ssssssssssss']);
      await cmcDocuments.shareDocument(conn, rel, 'd2');
      assert.deepStrictEqual(conn.events.get('d2').streamIds, ['documents', 'share-oooooooooooo', 'share-ssssssssssss'], 'another contact\'s shared child: not open');
    });

    it('[CDOC74] shareDocument in mode all is unchanged: only the alert, even for an open document', async () => {
      const conn = account({ streams: openTree(), events: [doc('d1', ['documents', Q])] });
      const res = await cmcDocuments.shareDocument(conn, relWith([{ streamId: 'documents', level: 'read' }]), 'd1');
      assert.deepStrictEqual([res.mode, res.shareStreamId, res.scopeUpdate], ['all', null, null]);
      assert.deepStrictEqual(conn.events.get('d1').streamIds, ['documents', Q]);
      assert.deepStrictEqual(writes(conn).map(c => c.method + ' ' + c.params.type), ['events.create notification/alert-cmc']);
    });

    it('[CDOC75] documentsRelationshipOf: reads every document, else holds a share child, else reads a class, else the newest', () => {
      const r = (name, perms, createdAt, hasChannel = true) => ({ name, grantedPermissions: perms, hasChannel, createdAt });
      const pick = (rels) => cmcDocuments.documentsRelationshipOf(rels)?.name ?? null;
      const weight = [{ streamId: 'body-weight', level: 'read' }];
      assert.strictEqual(pick([]), null);
      assert.strictEqual(pick([r('a', [{ streamId: 'documents', level: 'read' }], 1, false)]), null, 'no channel, no documents');
      assert.strictEqual(pick([r('a', weight, 1), r('b', [{ streamId: 'documents', level: 'read' }], 3), r('c', [{ streamId: 'share-aaaaaaaaaaaa', level: 'read' }], 2)]), 'b');
      assert.strictEqual(pick([r('a', [{ streamId: '*', level: 'read' }], 5), r('b', [{ streamId: 'documents', level: 'read' }], 3)]), 'b', 'the oldest that reads every document');
      assert.strictEqual(pick([r('a', [{ streamId: 'documents-clinical', level: 'read' }], 1), r('b', [{ streamId: 'share-aaaaaaaaaaaa', level: 'create-only' }], 2), r('c', weight, 3)]), 'b');
      assert.strictEqual(pick([r('c', weight, 3), r('a', [{ streamId: 'documents-admin-insurance', level: 'read' }], 1), r('b', weight, 2)]), 'a', 'a class grant over the newest');
      assert.strictEqual(pick([r('a', [{ streamId: 'documents-clinical', level: 'create-only' }], 1), r('b', weight, 2)]), 'b', 'a class it cannot read does not count');
      assert.strictEqual(pick([r('n', weight, 5), r('o', weight, 1)]), 'n', 'the newest, whatever the order given');
      assert.strictEqual(pick([r('n', weight, new Date(5000)), r('o', weight, new Date(1000))]), 'n', 'dates too');
      assert.strictEqual(pick([r('x', [{ streamId: 'documents', level: 'read' }], 9, false), r('y', weight, 1)]), 'y', 'one without the channel is never picked');
      assert.strictEqual(pick([r('a', [{ streamId: ':local:documents-clinical', level: 'read' }], 1), r('b', weight, 2)]), 'a', 'canonical ids');
      assert.strictEqual(pick([r('u', weight, null), r('k', weight, 5)]), 'u', 'an unknown accept time counts as the newest');
      assert.strictEqual(pick([r('u', weight, undefined), r('v', weight, null), r('k', weight, 5)]), 'v', 'unknown ones keep the order given, after the known ones');
      const all = [{ streamId: 'documents', level: 'read' }];
      assert.strictEqual(pick([r('u', all, null), r('k', all, 5)]), 'k', 'an unknown accept time is never taken for the oldest');
      const shares = [{ streamId: 'share-ssssssssssss', level: 'read' }];
      const sends = [{ streamId: 'share-rrrrrrrrrrrr', level: 'create-only' }];
      assert.strictEqual(pick([r('old', shares, 1), r('new', sends, 2)]), 'new', 'a contact allowed to send stays on that data set, not an older one that only shares');
      assert.strictEqual(pick([r('old', shares, 1), r('new', [{ streamId: 'share-rrrrrrrrrrrr', level: 'contribute' }, ...shares], 2)]), 'new', 'an uploader too');
      assert.strictEqual(pick([r('a', sends, 1), r('b', sends, 2)]), 'a', 'the oldest of those that receive');
      assert.strictEqual(pick([r('a', [{ streamId: 'documents-clinical', level: 'read' }], 1), r('b', shares, 2)]), 'b', 'only shared: still before a class grant');
    });

    it('[CDOC76] documentsGrantNote: what a documents grant leaves out, from the model tree, in en, fr, es', () => {
      const note = cmcDocuments.documentsGrantNote;
      assert.deepStrictEqual(['en', 'fr', 'es'].map(l => note('documents', l)), [null, null, null], 'the model description already says it covers every document');
      assert.deepStrictEqual(['en', 'fr', 'es'].map(l => note('documents-clinical', l)), [
        'Not included: documents not filed yet, administrative documents.',
        'Non inclus : documents pas encore classés, documents administratifs.',
        'No incluidos: documentos aún sin archivar, documentos administrativos.'
      ]);
      assert.deepStrictEqual(['en', 'fr', 'es'].map(l => note('documents-admin', l)), [
        'Not included: documents not filed yet, clinical documents.',
        'Non inclus : documents pas encore classés, documents cliniques.',
        'No incluidos: documentos aún sin archivar, documentos clínicos.'
      ]);
      assert.deepStrictEqual(['en', 'fr', 'es'].map(l => note('documents-admin-insurance', l)), [
        'Not included: documents not filed yet, clinical documents, other administrative documents.',
        'Non inclus : documents pas encore classés, documents cliniques, autres documents administratifs.',
        'No incluidos: documentos aún sin archivar, documentos clínicos, otros documentos administrativos.'
      ]);
      assert.strictEqual(note('documents-clinical', 'de'), note('documents-clinical', 'en'), 'another locale reads English');
      assert.strictEqual(note('documents-clinical', 'it'), note('documents-clinical', 'en'), 'no reviewed it / pt-BR wording yet');
      assert.strictEqual(note('documents-clinical', 'fr-CH'), note('documents-clinical', 'fr'));
      assert.strictEqual(note(':local:documents-admin', 'en'), note('documents-admin', 'en'));
      for (const other of ['body-weight', 'document-shares', 'share-aaaaaaaaaaaa', 'documents-unknown', '*']) assert.strictEqual(note(other, 'en'), null, other);
    });

    it('[CDOC77] documentsGrantNote: one language for the whole note; a label missing in it makes it all English', () => {
      const note = cmcDocuments.documentsGrantNote;
      // the loaded model is frozen: the stream is read through a stub that leaves out one language of its label
      const without = (sid, lang, check) => {
        const streams = getModel().streams;
        const read = streams.getDataById.bind(streams);
        streams.getDataById = (id, ...rest) => {
          const data = read(id, ...rest);
          if (id !== sid || data == null) return data;
          const { [lang]: _gone, ...label } = data.label;
          return { ...data, label };
        };
        try { check(); } finally { delete streams.getDataById; }
      };
      without('documents-admin', 'es', () => {
        assert.strictEqual(note('documents-clinical', 'es'), 'Not included: documents not filed yet, administrative documents.');
        assert.strictEqual(note('documents-admin-insurance', 'es'), 'Not included: documents not filed yet, clinical documents, other administrative documents.');
        assert.strictEqual(note('documents-admin', 'es'), 'No incluidos: documentos aún sin archivar, documentos clínicos.', 'only the labels it uses count');
      });
      without('documents-clinical', 'fr', () => {
        assert.strictEqual(note('documents-admin', 'fr'), 'Not included: documents not filed yet, clinical documents.');
        assert.strictEqual(note('documents-admin-insurance', 'fr'), 'Not included: documents not filed yet, clinical documents, other administrative documents.');
        assert.strictEqual(note('documents-clinical', 'fr'), 'Non inclus : documents pas encore classés, documents administratifs.');
      });
      assert.strictEqual(note('documents-admin', 'fr'), 'Non inclus : documents pas encore classés, documents cliniques.', 'labels restored');
    });
  });
});
