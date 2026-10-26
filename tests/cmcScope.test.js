import { assert } from './test-utils/deps-node.js';
import { cmcScope } from '../ts/index.ts';
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
  });
});
