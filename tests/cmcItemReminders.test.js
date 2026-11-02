import { assert } from './test-utils/deps-node.js';
import { cmcItemReminders, HDSLibError } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';
const COLLECTORS = ':_cmc:apps:hds-collector:app-dr-x:collectors:anna--api-x';
const SECTIONS = [
  { key: 'profile', type: 'permanent', itemKeys: ['profile-name'] },
  { key: 'daily', type: 'recurring', itemKeys: ['body-weight', 'treatment-basic'], itemCustomizations: { 'treatment-basic': { context: 'treatment-fertility' } } }
];

/** An account that keeps what is created, and answers events.get with it. */
function account (events = []) {
  const state = { events: [...events], n: 0 };
  state.apiOne = async function (method, params) {
    if (method === 'events.create') {
      const e = { id: 'ev-' + (++state.n), time: 100 + state.n, ...params };
      state.events.push(e);
      return e;
    }
    if (method === 'events.get') return state.events.filter(e => params.types.includes(e.type) && e.streamIds?.some(s => params.streams.includes(s)));
    throw new Error('unexpected ' + method);
  };
  return state;
}

const alert = (id, time, hds, from) => ({ id, time, type: 'notification/alert-cmc', streamIds: [COLLECTORS], content: { level: 'info', hds, ...(from ? { from } : {}) } });

describe('[CREM] cmcItemReminders', function () {
  before(async () => {
    await getModel().load(modelURL);
  });

  describe('[CREM-P] pure helpers', () => {
    it('[CREM1] content: fixed localised title and body, code, hds block; unknown locale falls back to en', () => {
      const fr = cmcItemReminders.buildItemReminderContent('body-weight', 'fr');
      assert.deepStrictEqual(fr.hds, { kind: 'item-reminder', itemKey: 'body-weight' });
      assert.strictEqual(fr.code, 'hds-item-reminder');
      assert.strictEqual(fr.level, 'info');
      assert.deepStrictEqual(Object.keys(fr.title), ['fr']);
      assert.ok(!JSON.stringify(fr).includes('Poids'), 'the item is never named in the event');
      assert.deepStrictEqual(Object.keys(cmcItemReminders.buildItemReminderContent('body-weight', 'xx').body), ['en']);
      assert.throws(() => cmcItemReminders.buildItemReminderContent(''), HDSLibError);
    });

    it('[CREM2] writer rule: an enterable item of a section of the request', () => {
      assert.strictEqual(cmcItemReminders.checkItemReminder('body-weight', SECTIONS), null);
      assert.strictEqual(cmcItemReminders.checkItemReminder('body-height', SECTIONS), 'not-in-request');
      assert.strictEqual(cmcItemReminders.checkItemReminder('no-such-item', SECTIONS), 'unknown-item');
      assert.strictEqual(cmcItemReminders.checkItemReminder('sync-status', [{ itemKeys: ['sync-status'] }]), 'not-enterable');
      assert.strictEqual(cmcItemReminders.checkItemReminder('document', [{ itemKeys: ['document'] }]), 'not-enterable');
    });

    it('[CREM3] the entry stream is the section context when set, else the item stream; a context the form cannot write to is null', () => {
      assert.strictEqual(cmcItemReminders.entryStreamOf('treatment-basic', SECTIONS[1]), 'treatment-fertility');
      assert.strictEqual(cmcItemReminders.entryStreamOf('treatment-basic', null), 'treatment');
      assert.strictEqual(cmcItemReminders.entryStreamOf('no-such-item'), null);
      assert.strictEqual(cmcItemReminders.entryStreamOf('treatment-basic', { itemCustomizations: { 'treatment-basic': { context: 'body-weight' } } }), null);
      assert.strictEqual(cmcItemReminders.entryStreamOf('treatment-basic', { itemCustomizations: { 'treatment-basic': { context: 'no-such-stream' } } }), null);
    });

    it('[CREM4] grantCovers: the stream, a model parent, or *, at a read level', () => {
      assert.ok(cmcItemReminders.grantCovers([{ streamId: 'treatment-fertility', level: 'read' }], 'treatment-fertility'));
      assert.ok(cmcItemReminders.grantCovers([{ streamId: 'treatment', level: 'contribute' }], 'treatment-fertility'));
      assert.ok(cmcItemReminders.grantCovers([{ streamId: '*', level: 'read' }], 'body-weight'));
      assert.ok(!cmcItemReminders.grantCovers([{ streamId: 'treatment-fertility', level: 'read' }], 'treatment'));
      assert.ok(!cmcItemReminders.grantCovers([{ streamId: 'body-weight', level: 'create-only' }], 'body-weight'));
      assert.ok(!cmcItemReminders.grantCovers([], 'body-weight'));
    });

    it('[CREM5] reminderAction: the section to open, or why not', () => {
      const ctxOnly = [{ streamId: 'treatment-fertility', level: 'read' }];
      const ok = cmcItemReminders.reminderAction('treatment-basic', SECTIONS, ctxOnly);
      assert.deepStrictEqual({ ok: ok.ok, sectionIndex: ok.sectionIndex, streamId: ok.streamId }, { ok: true, sectionIndex: 1, streamId: 'treatment-fertility' });
      assert.deepStrictEqual(cmcItemReminders.reminderAction('body-weight', SECTIONS, ctxOnly), { ok: false, reason: 'not-covered' });
      assert.deepStrictEqual(cmcItemReminders.reminderAction('body-height', SECTIONS, [{ streamId: '*', level: 'read' }]), { ok: false, reason: 'not-in-request' });
      assert.deepStrictEqual(cmcItemReminders.reminderAction('no-such-item', SECTIONS, ctxOnly), { ok: false, reason: 'unknown-item' });
      assert.deepStrictEqual(cmcItemReminders.reminderAction('body-weight', null, ctxOnly), { ok: false, reason: 'not-in-request' });
    });

    it('[CREM5b] every section listing the item is tried; a context the form cannot write to is skipped', () => {
      const bad = { itemKeys: ['treatment-basic'], itemCustomizations: { 'treatment-basic': { context: 'body-weight' } } };
      const plain = { itemKeys: ['treatment-basic'] };
      const both = [bad, SECTIONS[1], plain];
      const onlyTreatment = [{ streamId: 'treatment', level: 'read' }];
      const ok = cmcItemReminders.reminderAction('treatment-basic', both, onlyTreatment);
      assert.deepStrictEqual({ ok: ok.ok, sectionIndex: ok.sectionIndex, streamId: ok.streamId }, { ok: true, sectionIndex: 1, streamId: 'treatment-fertility' });
      const notFertility = cmcItemReminders.reminderAction('treatment-basic', [bad, plain], onlyTreatment);
      assert.strictEqual(notFertility.sectionIndex, 1);
      assert.deepStrictEqual(cmcItemReminders.reminderAction('treatment-basic', [bad], onlyTreatment), { ok: false, reason: 'not-enterable' });
      assert.deepStrictEqual(cmcItemReminders.reminderAction('treatment-basic', [bad, plain], [{ streamId: 'mood', level: 'read' }]), { ok: false, reason: 'not-covered' });
      assert.strictEqual(cmcItemReminders.buildItemReminderContent('body-weight', 'constructor').title.en, 'Reminder');
    });

    it('[CREM6] parse: every reminder oldest first, direction from content.from; other alerts and bad ones left out', () => {
      const from = { username: 'drx', host: 'api.x' };
      const list = cmcItemReminders.parseItemReminders([
        alert('a3', 30, { kind: 'item-reminder', itemKey: 'body-weight' }, from),
        alert('a1', 10, { kind: 'item-reminder', itemKey: 'body-weight' }),
        alert('a2', 20, { kind: 'document-shared', eventId: 'e1' }, from),
        alert('a4', 40, { kind: 'item-reminder', itemKey: '' }, from),
        alert('a5', 50, { kind: 'item-reminder', itemKey: 'body-weight' }, from),
        { id: 'm1', time: 5, type: 'message/hds-chat-v1', content: { hds: { kind: 'item-reminder', itemKey: 'body-weight' } } }
      ]);
      assert.deepStrictEqual(list.map(r => [r.alertEventId, r.direction]), [['a1', 'sent'], ['a3', 'received'], ['a5', 'received']]);
      assert.deepStrictEqual(list[1].from, from);
      assert.deepStrictEqual(cmcItemReminders.lastRemindedAt([...list, { alertEventId: 'a0', itemKey: 'body-weight', time: 2, direction: 'sent', from: null }]), { 'body-weight': 10 });
    });
  });

  describe('[CREM-W] posting and listing', () => {
    it('[CREM7] postItemReminder writes the alert on the own collectors stream; listItemReminders reads it back as sent', async () => {
      const conn = account();
      const { alertEventId } = await cmcItemReminders.postItemReminder(conn, COLLECTORS, 'body-weight', { sections: SECTIONS, locale: 'fr' });
      const e = conn.events.find(x => x.id === alertEventId);
      assert.deepStrictEqual(e.streamIds, [COLLECTORS]);
      assert.strictEqual(e.type, 'notification/alert-cmc');
      assert.deepStrictEqual(e.content.hds, { kind: 'item-reminder', itemKey: 'body-weight' });
      const list = await cmcItemReminders.listItemReminders(conn, COLLECTORS);
      assert.deepStrictEqual(list.map(r => [r.itemKey, r.direction]), [['body-weight', 'sent']]);
    });

    it('[CREM8] postItemReminder refuses what the writer rule refuses, and a missing stream, without writing', async () => {
      const conn = account();
      for (const [key, reason] of [['body-height', 'not-in-request'], ['no-such-item', 'unknown-item']]) {
        await assert.rejects(cmcItemReminders.postItemReminder(conn, COLLECTORS, key, { sections: SECTIONS }), e => e instanceof HDSLibError && e.innerObject?.reason === reason);
      }
      await assert.rejects(cmcItemReminders.postItemReminder(conn, '', 'body-weight', { sections: SECTIONS }), HDSLibError);
      assert.strictEqual(conn.events.length, 0);
    });
  });
});
