import assert from 'node:assert/strict';
import { cmcDataExport } from '../js/index.js';

function fakeConnection (getResult = []) {
  const calls = [];
  return {
    calls,
    async apiOne (method, params, resultKey) {
      calls.push({ method, params, resultKey });
      if (method === 'events.create') return { id: 'ev-' + calls.length, ...params };
      if (method === 'events.get') return getResult;
      throw new Error('unexpected ' + method);
    }
  };
}

describe('[CDE] cmcDataExport', function () {
  describe('[CDE-BUILD] buildDataExportRequestContent', function () {
    it('[CDE01] carries the typed hds block and a plugin-valid alert envelope', () => {
      const c = cmcDataExport.buildDataExportRequestContent({ requestedAt: 1000, dueAt: 2000, note: 'PDF please', locale: 'fr' });
      assert.equal(c.level, 'info');
      assert.equal(c.ackRequired, true);
      assert.ok(c.ackId.startsWith(cmcDataExport.DATA_EXPORT_ACK_PREFIX));
      assert.equal(typeof c.title.fr, 'string');
      assert.ok(c.body.fr.includes('PDF please'));
      assert.deepEqual(c.hds, { kind: 'data-export-request', requestedAt: 1000, dueAt: 2000, note: 'PDF please' });
    });

    it('[CDE02] falls back to English and omits absent optionals', () => {
      const c = cmcDataExport.buildDataExportRequestContent({ requestedAt: 5, locale: 'de' });
      assert.equal(typeof c.title.de, 'string');
      assert.deepEqual(c.hds, { kind: 'data-export-request', requestedAt: 5 });
    });
  });

  describe('[CDE-SEND] requestDataExport / fulfillDataExportRequest', function () {
    it('[CDE10] posts the alert on the given collectors stream', async () => {
      const conn = fakeConnection();
      const r = await cmcDataExport.requestDataExport(conn, { collectorStreamId: ':_cmc:apps:hds-collector:f1:collectors:dr--api-x', note: 'n' });
      assert.equal(conn.calls.length, 1);
      assert.equal(conn.calls[0].method, 'events.create');
      assert.deepEqual(conn.calls[0].params.streamIds, [':_cmc:apps:hds-collector:f1:collectors:dr--api-x']);
      assert.equal(conn.calls[0].params.type, 'notification/alert-cmc');
      assert.equal(r.ackId, conn.calls[0].params.content.ackId);
      assert.equal(r.alertEventId, 'ev-1');
    });

    it('[CDE11] posts the ack with alertEventId + ackId and refuses incomplete params', async () => {
      const conn = fakeConnection();
      await cmcDataExport.fulfillDataExportRequest(conn, { collectorStreamId: 's', alertEventId: 'a1', ackId: 'k1' });
      assert.equal(conn.calls[0].params.type, 'notification/ack-cmc');
      assert.deepEqual(conn.calls[0].params.content, { alertEventId: 'a1', ackId: 'k1' });
      await assert.rejects(() => cmcDataExport.fulfillDataExportRequest(conn, { collectorStreamId: 's', alertEventId: 'a1' }));
      await assert.rejects(() => cmcDataExport.requestDataExport(conn, {}));
    });
  });

  describe('[CDE-LIST] parseDataExportEvents / listDataExportRequests', function () {
    const alertA = { id: 'a1', type: 'notification/alert-cmc', time: 100, content: { level: 'info', title: { en: 't' }, body: { en: 'b' }, ackRequired: true, ackId: 'hds-data-export:x1', hds: { kind: 'data-export-request', requestedAt: 100, dueAt: 900, note: 'soon' }, from: { username: 'pat', host: 'api.x' } } };
    const alertB = { id: 'a2', type: 'notification/alert-cmc', time: 200, content: { level: 'info', title: { en: 't' }, body: { en: 'b' }, ackRequired: true, ackId: 'hds-data-export:x2', hds: { kind: 'data-export-request', requestedAt: 200 } } };
    const otherAlert = { id: 'a3', type: 'notification/alert-cmc', time: 300, content: { level: 'warning', title: { en: 'peer down' }, body: { en: '...' } } };
    const ackA = { id: 'k1', type: 'notification/ack-cmc', time: 150, content: { alertEventId: 'a1', ackId: 'hds-data-export:x1', from: { username: 'dr', host: 'api.x' } } };

    it('[CDE20] joins acks to their requests, ignores unrelated alerts, newest first', () => {
      const out = cmcDataExport.parseDataExportEvents([ackA, otherAlert, alertB, alertA]);
      assert.deepEqual(out.map(r => r.alertEventId), ['a2', 'a1']);
      const a = out[1];
      assert.equal(a.status, 'fulfilled');
      assert.equal(a.fulfilledAt, 150);
      assert.equal(a.ackEventId, 'k1');
      assert.equal(a.direction, 'received');
      assert.deepEqual(a.from, { username: 'pat', host: 'api.x' });
      assert.equal(a.dueAt, 900);
      assert.equal(a.note, 'soon');
      const b = out[0];
      assert.equal(b.status, 'pending');
      assert.equal(b.direction, 'sent');
      assert.equal(b.from, null);
      assert.equal(b.dueAt, null);
    });

    it('[CDE21] matches an ack by alertEventId when the ackId was not echoed', () => {
      const ackByEvent = { id: 'k2', type: 'notification/ack-cmc', time: 250, content: { alertEventId: 'a2', ackId: 'something-else' } };
      const out = cmcDataExport.parseDataExportEvents([alertB, ackByEvent]);
      assert.equal(out[0].status, 'fulfilled');
      assert.equal(out[0].ackEventId, 'k2');
    });

    it('[CDE22] listDataExportRequests reads alerts + acks from the stream', async () => {
      const conn = fakeConnection([alertA, ackA]);
      const out = await cmcDataExport.listDataExportRequests(conn, 'stream-x');
      assert.deepEqual(conn.calls[0].params.streams, ['stream-x']);
      assert.deepEqual(conn.calls[0].params.types, ['notification/alert-cmc', 'notification/ack-cmc']);
      assert.equal(out.length, 1);
      assert.equal(out[0].status, 'fulfilled');
    });
  });
});
