import { assert } from './test-utils/deps-node.js';
import { cmcScope, cmcFormSpec } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';
const COLLECTORS = ':_cmc:apps:hds-patient:collectors:dr--api-x';

/** A grant as the platform lists it: the person's data plus the plugin's own channel permissions. */
const grant = [
  { streamId: 'body-weight', level: 'read' },
  { streamId: 'body-height', level: 'read' },
  { streamId: ':_cmc:inbox', level: 'create-only' },
  { streamId: COLLECTORS, level: 'contribute' }
];
const rel = { accessId: 'acc-1', localCollectorStreamId: COLLECTORS, grantedPermissions: grant };

/**
 * A connection where the platform settles a scope update: `outcome(content)` returns what the
 * plugin records on the trigger (default: applied and delivered).
 */
function scopeConnection (outcome = (c) => ({ ...c, applied: true, status: 'completed' })) {
  const calls = [];
  const events = new Map();
  return {
    calls,
    async apiOne (method, params, key) {
      calls.push({ method, params });
      if (method === 'events.create') {
        const event = { id: 'ev-' + calls.length, ...params };
        events.set(event.id, event);
        return key ? event : { event };
      }
      if (method === 'events.getOne') {
        const event = events.get(params.id);
        const settled = { ...event, content: outcome(event.content) };
        return key ? settled : { event: settled };
      }
      throw new Error('unexpected ' + method);
    }
  };
}

describe('[CSCP] cmcScope', function () {
  before(async () => {
    await getModel().load(modelURL);
  });

  describe('[CSCP-P] pure helpers', () => {
    it('[CSCP1] personPermissions drops the platform channel permissions', () => {
      assert.deepStrictEqual(cmcScope.personPermissions(grant), [
        { streamId: 'body-weight', level: 'read' },
        { streamId: 'body-height', level: 'read' }
      ]);
    });

    it('[CSCP2] planStopSharing keeps every other stream', () => {
      assert.deepStrictEqual(cmcScope.planStopSharing(grant, 'body-weight'), { ok: true, newPermissions: [{ streamId: 'body-height', level: 'read' }] });
    });

    it('[CSCP3] planStopSharing refuses: not shared, shared through a parent or *, nothing left', () => {
      assert.deepStrictEqual(cmcScope.planStopSharing(grant, 'body-vulva-bleeding'), { ok: false, reason: 'not-shared' });
      const viaParent = [{ streamId: 'body', level: 'read' }, { streamId: 'body-weight', level: 'read' }];
      assert.deepStrictEqual(cmcScope.planStopSharing(viaParent, 'body-weight'), { ok: false, reason: 'shared-through-parent' });
      assert.deepStrictEqual(cmcScope.planStopSharing([{ streamId: '*', level: 'read' }], 'body-weight'), { ok: false, reason: 'shared-through-parent' });
      const single = [{ streamId: 'body-weight', level: 'read' }, { streamId: COLLECTORS, level: 'contribute' }];
      assert.deepStrictEqual(cmcScope.planStopSharing(single, 'body-weight'), { ok: false, reason: 'nothing-left' });
    });

    it('[CSCP4] scopeDiff reports added, removed and level changes, platform streams left out', () => {
      const diff = cmcScope.scopeDiff(grant, [
        { streamId: 'body-weight', level: 'contribute' },
        { streamId: 'body-vulva-bleeding', level: 'read' },
        { streamId: ':_cmc:inbox', level: 'create-only' }
      ]);
      assert.deepStrictEqual(diff, {
        added: ['body-vulva-bleeding'],
        removed: ['body-height'],
        changed: [{ streamId: 'body-weight', from: 'read', to: 'contribute' }]
      });
    });
  });

  describe('[CSCP-W] stopSharingStream / shareStreamsAgain', () => {
    it('[CSCP10] stopSharingStream writes the scope update with the extra fields in content.hds only', async () => {
      const conn = scopeConnection();
      const message = { en: 'Ana stopped sharing Weight', fr: 'Ana a arrêté de partager Poids' };
      const result = await cmcScope.stopSharingStream(conn, rel, 'body-weight', { message, completionPollIntervalMs: 1 });
      const create = conn.calls.find(c => c.method === 'events.create');
      assert.deepStrictEqual(create.params.streamIds, [COLLECTORS]);
      assert.strictEqual(create.params.type, 'consent/scope-update-cmc');
      assert.deepStrictEqual(Object.keys(create.params.content).sort(), ['accessId', 'hds', 'newPermissions'], 'no new top-level field');
      assert.strictEqual(create.params.content.accessId, 'acc-1');
      assert.deepStrictEqual(create.params.content.newPermissions, [{ streamId: 'body-height', level: 'read' }]);
      assert.deepStrictEqual(create.params.content.hds, { removed: ['body-weight'], message });
      assert.strictEqual(result.applied, true);
      assert.strictEqual(result.peerNotified, true);
      assert.strictEqual(result.updateEventId, create.params.id ?? 'ev-1');
    });

    it('[CSCP11] stopSharingStream refuses before writing when the stream cannot be stopped alone', async () => {
      const conn = scopeConnection();
      await assert.rejects(() => cmcScope.stopSharingStream(conn, rel, 'body-vulva-bleeding'), /not-shared/);
      await assert.rejects(() => cmcScope.stopSharingStream(conn, { ...rel, localCollectorStreamId: null }, 'body-weight'), /no collectors stream/);
      assert.strictEqual(conn.calls.length, 0);
    });

    it('[CSCP12] a change the platform did not apply throws with its reason', async () => {
      const conn = scopeConnection((c) => ({ ...c, applied: false, status: 'failed', failure: { reason: 'cmc-scope-update-target-not-counterparty' } }));
      await assert.rejects(() => cmcScope.stopSharingStream(conn, rel, 'body-weight', { completionPollIntervalMs: 1 }), /target-not-counterparty/);
    });

    it('[CSCP13] applied but not delivered: resolves with peerNotified false and the failure', async () => {
      const conn = scopeConnection((c) => ({ ...c, applied: true, status: 'failed', failure: { reason: 'cmc-handler-delivery-failed' } }));
      const result = await cmcScope.stopSharingStream(conn, rel, 'body-weight', { completionPollIntervalMs: 1 });
      assert.strictEqual(result.applied, true);
      assert.strictEqual(result.peerNotified, false);
      assert.deepStrictEqual(result.deliveryFailure, { reason: 'cmc-handler-delivery-failed' });
    });

    it('[CSCP14] shareStreamsAgain adds only what is not shared, at read by default, in content.hds.added', async () => {
      const conn = scopeConnection();
      await cmcScope.shareStreamsAgain(conn, rel, ['body-vulva-bleeding', 'body-weight'], { completionPollIntervalMs: 1 });
      const content = conn.calls.find(c => c.method === 'events.create').params.content;
      assert.deepStrictEqual(Object.keys(content).sort(), ['accessId', 'hds', 'newPermissions']);
      assert.deepStrictEqual(content.newPermissions, [
        { streamId: 'body-weight', level: 'read' },
        { streamId: 'body-height', level: 'read' },
        { streamId: 'body-vulva-bleeding', level: 'read' }
      ]);
      assert.deepStrictEqual(content.hds, { added: ['body-vulva-bleeding'] });
      await assert.rejects(() => cmcScope.shareStreamsAgain(conn, rel, ['body-weight']), /already shared/);
    });

    it('[CSCP15] waitForCompletion false returns right after the write', async () => {
      const conn = scopeConnection();
      const result = await cmcScope.shareStreamsAgain(conn, rel, ['body-vulva-bleeding'], { waitForCompletion: false });
      assert.strictEqual(result.status, 'pending');
      assert.strictEqual(conn.calls.filter(c => c.method === 'events.getOne').length, 0);
    });
  });

  describe('[CSCP-N] parseSharingNotes / listSharingNotes', () => {
    const events = [
      { id: 'u1', type: 'consent/scope-update-cmc', time: 10, content: { accessId: 'acc-1', newPermissions: [], applied: true, status: 'completed', hds: { removed: ['body-weight'], message: { en: 'stopped' } } } },
      { id: 'r1', type: 'consent/scope-request-cmc', time: 20, content: { newPermissions: [{ streamId: 'body-weight', level: 'read' }], message: { en: 'please' }, expires: 1000 } },
      { id: 'a1', type: 'consent/scope-update-cmc', time: 25, content: { scopeRequestEventId: 'r1', accept: true, applied: true, status: 'completed' } },
      { id: 'r2', type: 'consent/scope-request-cmc', time: 30, content: { newPermissions: [{ streamId: 'body-height', level: 'contribute' }], expires: 50 } },
      { id: 'r3', type: 'consent/scope-request-cmc', time: 40, content: { newPermissions: [], status: 'refused' } },
      { id: 'u2', type: 'consent/scope-update-cmc', time: 50, content: { accessId: 'acc-1', newPermissions: [], applied: true, status: 'delivered', hds: { added: ['body-weight'] } } },
      { id: 'u3', type: 'consent/scope-update-cmc', time: 60, content: { accessId: 'acc-1', newPermissions: [], applied: false, status: 'failed', hds: { removed: ['body-height'] } } },
      { id: 'u4', type: 'consent/scope-update-cmc', time: 70, content: { accessId: 'acc-1', newPermissions: [], applied: true, status: 'completed', removed: ['body-height'] } }
    ];

    it('[CSCP20] stops, shares again and requests with their answers, oldest first', () => {
      const notes = cmcScope.parseSharingNotes([...events].reverse(), 100);
      assert.deepStrictEqual(notes.map(n => [n.kind, n.id]), [
        ['stopped', 'u1'], ['request', 'r1'], ['request', 'r2'], ['request', 'r3'], ['shared', 'u2']
      ]);
      const [stopped, r1, r2, r3, shared] = notes;
      assert.deepStrictEqual(stopped.streamIds, ['body-weight']);
      assert.deepStrictEqual(stopped.message, { en: 'stopped' });
      assert.strictEqual(stopped.peerNotified, true);
      assert.strictEqual(r1.answer, 'accepted');
      assert.strictEqual(r1.answerEventId, 'a1');
      assert.strictEqual(r2.answer, 'expired');
      assert.strictEqual(r3.answer, 'refused', 'from the status the platform stamps on the request');
      assert.strictEqual(shared.peerNotified, false);
    });

    it('[CSCP21] a change not applied, or with its fields outside content.hds, is not a note', () => {
      const ids = cmcScope.parseSharingNotes(events, 100).map(n => n.id);
      assert.ok(!ids.includes('u3'));
      assert.ok(!ids.includes('u4'));
    });

    it('[CSCP22] listSharingNotes reads both types from the collectors stream', async () => {
      const calls = [];
      const conn = { async apiOne (method, params, key) { calls.push({ method, params, key }); return events; } };
      const notes = await cmcScope.listSharingNotes(conn, COLLECTORS);
      assert.strictEqual(calls[0].method, 'events.get');
      assert.deepStrictEqual(calls[0].params.streams, [COLLECTORS]);
      assert.deepStrictEqual(calls[0].params.types.sort(), ['consent/scope-request-cmc', 'consent/scope-update-cmc']);
      assert.strictEqual(notes.length, 5);
    });

    it('[CSCP23] a request carrying a data set exposes it; an older unanswered one is superseded', () => {
      const fs = { version: 1, title: { en: 'T' }, description: { en: '' }, permissions: [], sections: [] };
      const notes = cmcScope.parseSharingNotes([
        { id: 'd1', type: 'consent/scope-request-cmc', time: 10, content: { newPermissions: [{ streamId: 'body-weight', level: 'read' }], hds: { formSpec: fs, formSpecHash: 'sha256:a' } } },
        { id: 'd2', type: 'consent/scope-request-cmc', time: 20, content: { newPermissions: [{ streamId: 'body-weight', level: 'read' }], hds: { formSpec: fs, formSpecHash: 'sha256:b' } } },
        { id: 'p1', type: 'consent/scope-request-cmc', time: 30, content: { newPermissions: [{ streamId: 'body-height', level: 'read' }] } }
      ], 100);
      assert.deepStrictEqual(notes.map(n => [n.id, n.formSpec != null, n.superseded]), [['d1', true, true], ['d2', true, false], ['p1', false, false]]);
    });

    it('[CSCP24] the older request stays superseded once the newer one is answered', () => {
      const fs = { version: 1, title: { en: 'T' }, description: { en: '' }, permissions: [], sections: [] };
      const notes = cmcScope.parseSharingNotes([
        { id: 'd1', type: 'consent/scope-request-cmc', time: 10, content: { newPermissions: [{ streamId: 'body-weight', level: 'read' }], hds: { formSpec: fs } } },
        { id: 'd2', type: 'consent/scope-request-cmc', time: 20, content: { newPermissions: [{ streamId: 'body-weight', level: 'read' }], hds: { formSpec: fs }, status: 'accepted' } }
      ], 100);
      assert.deepStrictEqual(notes.map(n => [n.id, n.answer, n.superseded]), [['d1', null, true], ['d2', 'accepted', false]]);
    });
  });

  describe('[CSCP-D] data-set updates (data-model 3.41.0)', () => {
    const DOC = ':_cmc:apps:hds-collector:c1:collectors:patient--api-x';
    const formSpec = {
      version: 1,
      title: { en: 'Follow-up' },
      description: { en: '' },
      permissions: [{ streamId: 'body-weight', level: 'read' }],
      sections: [{ key: 's1', type: 'permanent', name: { en: 'S' }, itemKeys: ['body-weight'] }],
      openLink: { inviteEventId: 'inv', capabilityUrl: 'https://cap@x/', createdAt: 1, expiresAt: null }
    };

    /** A doctor connection: `existing` events on the stream; a created request gets `settle(content)` on read. */
    function doctorConnection (existing = [], settle = (c) => ({ ...c, status: 'completed', remoteEventId: 'remote-1' })) {
      const calls = [];
      const created = new Map();
      return {
        calls,
        async apiOne (method, params, key) {
          calls.push({ method, params });
          if (method === 'events.get') return existing;
          if (method === 'events.create') {
            const event = { id: 'req-' + calls.length, ...params };
            created.set(event.id, event);
            return key ? event : { event };
          }
          if (method === 'events.getOne') {
            const event = created.get(params.id);
            return { ...event, content: settle(event.content) };
          }
          throw new Error('unexpected ' + method);
        }
      };
    }

    it('[CSCP30] proposeDataSetUpdate writes the data set in content.hds, without openLink, with expires', async () => {
      const conn = doctorConnection();
      const message = { en: 'Your data set was updated.' };
      const before = Date.now() / 1000;
      const res = await cmcScope.proposeDataSetUpdate(conn, DOC, formSpec, { message, deliveryPollIntervalMs: 1 });
      const create = conn.calls.find(c => c.method === 'events.create');
      assert.deepStrictEqual(create.params.streamIds, [DOC]);
      assert.strictEqual(create.params.type, 'consent/scope-request-cmc');
      const c = create.params.content;
      assert.deepStrictEqual(Object.keys(c).sort(), ['expires', 'hds', 'message', 'newPermissions']);
      assert.deepStrictEqual(c.newPermissions, [{ streamId: 'body-weight', level: 'read' }], 'defaults to what the data set needs');
      assert.ok(c.expires >= before + cmcScope.DATASET_REQUEST_TTL_SEC - 1);
      assert.strictEqual(c.hds.formSpec.openLink, undefined);
      assert.strictEqual(formSpec.openLink.capabilityUrl, 'https://cap@x/', 'the caller\'s data set is not changed');
      assert.match(c.hds.formSpecHash, /^sha256:[0-9a-f]{64}$/);
      assert.strictEqual(c.hds.formSpecHash, await cmcFormSpec.formSpecFingerprint(formSpec), 'the fingerprint ignores openLink');
      assert.deepStrictEqual(res, { scopeRequestEventId: create.params.id ?? 'req-2', remoteScopeRequestEventId: 'remote-1', status: 'completed', formSpecHash: c.hds.formSpecHash });
    });

    it('[CSCP31] an unchanged or wider permission set is accepted; a narrower one is refused before writing', async () => {
      const wider = [{ streamId: 'body', level: 'read' }, { streamId: 'body-height', level: 'read' }];
      const ok = doctorConnection();
      await cmcScope.proposeDataSetUpdate(ok, DOC, formSpec, { newPermissions: wider, deliveryPollIntervalMs: 1 });
      assert.deepStrictEqual(ok.calls.find(c => c.method === 'events.create').params.content.newPermissions, wider);
      const ko = doctorConnection();
      await assert.rejects(
        () => cmcScope.proposeDataSetUpdate(ko, DOC, formSpec, { newPermissions: [{ streamId: 'body-height', level: 'read' }] }),
        /do not cover/
      );
      assert.ok(!ko.calls.some(c => c.method === 'events.create'));
    });

    it('[CSCP32] a chat-only data set asks for hds-noop', async () => {
      const conn = doctorConnection();
      await cmcScope.proposeDataSetUpdate(conn, DOC, { ...formSpec, permissions: [], sections: [] }, { deliveryPollIntervalMs: 1 });
      assert.deepStrictEqual(conn.calls.find(c => c.method === 'events.create').params.content.newPermissions, [{ streamId: 'hds-noop', level: 'read' }]);
    });

    it('[CSCP33] refuses while the previous request is in flight; a delivered, failed or expired one does not block', async () => {
      const pending = { id: 'old', type: 'consent/scope-request-cmc', time: 1, content: { newPermissions: [{ streamId: 'body-weight', level: 'read' }], status: 'pending' } };
      await assert.rejects(() => cmcScope.proposeDataSetUpdate(doctorConnection([pending]), DOC, formSpec), /previous-request-in-flight|not delivered yet/);
      for (const content of [{ remoteEventId: 'r' }, { status: 'failed' }, { expires: 1 }]) {
        const conn = doctorConnection([{ ...pending, content: { ...pending.content, ...content } }]);
        await cmcScope.proposeDataSetUpdate(conn, DOC, formSpec, { deliveryPollIntervalMs: 1 });
      }
    });

    it('[CSCP34] delivery failure and timeout throw with the request id', async () => {
      const failed = doctorConnection([], (c) => ({ ...c, status: 'failed', failure: { reason: 'cmc-handler-delivery-failed' } }));
      await assert.rejects(() => cmcScope.proposeDataSetUpdate(failed, DOC, formSpec, { deliveryPollIntervalMs: 1 }), (e) => e.innerObject?.reason === 'delivery-failed' && e.innerObject.scopeRequestEventId != null);
      const slow = doctorConnection([], (c) => ({ ...c, status: 'pending' }));
      await assert.rejects(() => cmcScope.proposeDataSetUpdate(slow, DOC, formSpec, { deliveryTimeoutMs: 5, deliveryPollIntervalMs: 1 }), (e) => e.innerObject?.reason === 'delivery-pending');
      const nowait = doctorConnection();
      const res = await cmcScope.proposeDataSetUpdate(nowait, DOC, formSpec, { waitForDelivery: false });
      assert.strictEqual(res.status, 'pending');
      assert.ok(!nowait.calls.some(c => c.method === 'events.getOne'));
    });

    it('[CSCP35] parseScopeRequests joins the delivered answers on remoteEventId, flags superseded and expired', () => {
      const fs = { version: 1, title: { en: 'T' }, description: { en: '' }, permissions: [], sections: [] };
      const req = (id, time, content) => ({ id, type: 'consent/scope-request-cmc', time, content: { newPermissions: [{ streamId: 'body-weight', level: 'read' }], ...content } });
      const records = cmcScope.parseScopeRequests([
        req('q1', 10, { remoteEventId: 'p1', hds: { formSpec: fs, formSpecHash: 'sha256:1' } }),
        { id: 'a1', type: 'consent/scope-update-cmc', time: 15, content: { scopeRequestEventId: 'p1', accept: true, applied: true, from: { username: 'pat' } } },
        req('q2', 20, { remoteEventId: 'p2' }),
        { id: 'a2', type: 'consent/scope-update-cmc', time: 25, content: { scopeRequestEventId: 'p2', accept: false, reason: { en: 'no' }, hds: { asked: ['body-weight'] }, from: { username: 'pat' } } },
        req('q3', 30, { remoteEventId: 'p3', hds: { formSpec: fs, formSpecHash: 'sha256:3' } }),
        req('q4', 40, { remoteEventId: 'p4', hds: { formSpec: fs, formSpecHash: 'sha256:4' } }),
        req('q5', 50, { status: 'failed', hds: { formSpec: fs, formSpecHash: 'sha256:5' } }),
        req('q6', 5, { remoteEventId: 'p6', expires: 50 }),
        // the person's own scope update (self-initiated) and a request copy with `from` are not the connection's
        { id: 'x1', type: 'consent/scope-update-cmc', time: 60, content: { newPermissions: [], hds: { removed: ['body-weight'] }, from: { username: 'pat' } } },
        { id: 'x2', type: 'consent/scope-request-cmc', time: 70, content: { newPermissions: [], from: { username: 'dr' } } }
      ], 100);
      const by = Object.fromEntries(records.map(r => [r.id, r]));
      assert.deepStrictEqual(records.map(r => r.id), ['q6', 'q1', 'q2', 'q3', 'q4', 'q5']);
      assert.deepStrictEqual([by.q1.answer, by.q1.answeredAt, by.q1.answerEventId, by.q1.formSpecHash], ['accepted', 15, 'a1', 'sha256:1']);
      assert.deepStrictEqual([by.q2.answer, by.q2.reason, by.q2.asked, by.q2.formSpec], ['refused', { en: 'no' }, ['body-weight'], null]);
      assert.deepStrictEqual([by.q3.superseded, by.q4.superseded, by.q5.superseded], [true, false, false]);
      assert.deepStrictEqual([by.q5.delivery, by.q4.delivery, by.q6.answer], ['failed', 'delivered', 'expired']);
      assert.strictEqual(cmcScope.acceptedDataSetHash(records), 'sha256:1');
      assert.strictEqual(cmcScope.acceptedDataSetHash([]), null);
    });

    it('[CSCP36] acceptedDataSetHash takes the most recent acceptance, not the most recent request', () => {
      const r = (id, time, answeredAt, hash) => ({ id, time, answer: 'accepted', answeredAt, formSpecHash: hash });
      assert.strictEqual(cmcScope.acceptedDataSetHash([r('new', 20, 30, 'sha256:new'), r('old', 10, 40, 'sha256:old')]), 'sha256:old');
    });

    it('[CSCP37] uncoveredPermissions: parent, * and a higher level cover; a lower level does not', () => {
      const need = [{ streamId: 'body-weight', level: 'contribute' }];
      assert.deepStrictEqual(cmcScope.uncoveredPermissions(need, [{ streamId: 'body', level: 'manage' }]), []);
      assert.deepStrictEqual(cmcScope.uncoveredPermissions(need, [{ streamId: '*', level: 'contribute' }]), []);
      assert.deepStrictEqual(cmcScope.uncoveredPermissions(need, [{ streamId: 'body-weight', level: 'read' }]), need);
    });
  });
});
