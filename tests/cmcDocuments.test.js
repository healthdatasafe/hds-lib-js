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
function account ({ streams = [], events = [] } = {}) {
  const state = { streams: [...streams], events: new Map(events.map(e => [e.id, { ...e }])), calls: [], grant: null, n: 0 };
  const children = (parentId) => state.streams.filter(s => s.parentId === parentId);
  state.apiOne = async function (method, params, key) {
    state.calls.push({ method, params });
    const out = (k, v) => key ? v : { [k]: v };
    switch (method) {
      case 'streams.get':
        if (params.parentId && !state.streams.find(s => s.id === params.parentId)) throw apiError('unknown-referenced-resource');
        return out('streams', children(params.parentId ?? null).filter(s => params.state === 'all' || !s.trashed));
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

    it('[CDOC5] parseDocumentAlerts: one per (kind, eventId), the later of shared / unshared wins, other alerts ignored', () => {
      const a = (id, time, kind, eventId, from) => ({ id, time, type: 'notification/alert-cmc', content: { hds: { kind, eventId }, ...(from ? { from: { username: 'anna', host: 'x' } } : {}) } });
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
        ['a3', K.UNSHARED, 'd1', true, 'sent'],
        ['a4', K.SHARED, 'd2', true, 'received']
      ]);
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

    it('[CDOC12] an existing ungranted child of the relationship is reused; another relationship\'s is not', async () => {
      const streams = [
        { id: 'document-shares', parentId: null, name: 'Shared documents' },
        { id: 'share-other0000000', parentId: 'document-shares', name: 'x', clientData: { hdsDocumentShare: { relationship: 'acc-9', direction: 'shared' } } },
        { id: 'share-mine00000000', parentId: 'document-shares', name: 'x', clientData: { hdsDocumentShare: { relationship: 'acc-1', direction: 'shared' } } }
      ];
      const conn = account({ streams, events: [doc('d1')] });
      const res = await cmcDocuments.shareDocument(conn, relWith([{ streamId: 'body-weight', level: 'read' }]), 'd1');
      assert.strictEqual(res.shareStreamId, 'share-mine00000000');
      assert.ok(!conn.calls.some(c => c.method === 'streams.create'));
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
        if (method === 'events.getOne' && params.id === 'd1' && ++reads === 2) r.streamIds = ['documents', 'share-zzzzzzzzzzzz'];
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
  });
});
