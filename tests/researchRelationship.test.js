import { assert } from './test-utils/deps-node.js';
import { HDSModel, cmcConstants, researchRelationship as res } from '../ts/index.ts';

/** The HDS research relationship (data-model documentation/RESEARCH.md). */

const MODEL_BASE = 'https://model.datasafe.dev';
const NOW = Date.UTC(2026, 10, 25, 12) / 1000;
const t = (en) => ({ en, fr: 'fr ' + en });
const TOPICS = ['cardiovascular', 'metabolic', 'sleep', 'nutrition'];

function makeModel () {
  const model = new HDSModel('');
  model.loadFromObject({
    items: {},
    streams: [
      { id: 'body', name: 'Body', parentId: null },
      {
        id: 'hds-research',
        name: 'Health Data Safe research',
        parentId: null,
        explicitGrantOnly: true,
        children: [
          { id: 'hds-research-eligibility', name: 'Eligibility test results sent', parentId: 'hds-research' },
          { id: 'hds-research-topics', name: 'Research topics', parentId: 'hds-research' }
        ]
      }
    ],
    eventTypes: { types: { 'research/topics-v1': { type: 'object' }, 'research/eligibility-band-v1': { type: 'object' } }, extras: {} },
    vocabularies: {
      'research-topic': {
        binds: [{ eventType: 'research/topics-v1', path: 'topics' }],
        values: Object.fromEntries(TOPICS.map((k) => [k, { label: t(k) }]))
      }
    },
    conversions: {},
    datasources: [],
    authorizations: {}
  });
  return model;
}
const model = makeModel();

/** A connection that records every call and only knows the given events and streams. */
function fakeConnection (events = [], { streamsExist = true, streamErrors = {} } = {}) {
  const calls = [];
  return {
    calls,
    events,
    async api (batch) {
      calls.push(...batch);
      return batch.map((c) => {
        if (c.method === 'events.delete') { const e = events.find((x) => x.id === c.params.id); if (e.trashed) e.deleted = true; else e.trashed = true; return { event: e }; }
        return streamErrors[c.params.id] ? { error: { id: streamErrors[c.params.id] } } : { stream: c.params };
      });
    },
    async apiOne (method, params, key) {
      calls.push({ method, params });
      if (method === 'events.get') {
        if (!streamsExist) { const e = new Error('unknown'); e.innerObject = { id: 'unknown-referenced-resource' }; throw e; }
        const found = events.filter((e) => !e.deleted && params.types.includes(e.type) && e.streamIds.includes(params.streams[0]));
        return found.slice(params.skip, params.skip + params.limit);
      }
      if (method === 'events.create') { const e = { id: 'new' + events.length, ...params }; events.push(e); return e; }
      if (method === 'events.update') { const e = events.find((x) => x.id === params.id); Object.assign(e, params.update); return e; }
      if (method === 'events.delete') { const e = events.find((x) => x.id === params.id); if (e.trashed) e.deleted = true; else e.trashed = true; return e; }
      throw new Error('unexpected ' + method);
    }
  };
}
const topicsEvent = (id, topics, modified) => ({ id, streamIds: ['hds-research-topics'], type: 'research/topics-v1', content: { topics }, time: modified, modified });
const band = (id, requestId) => ({ id, streamIds: ['hds-research-eligibility'], type: 'research/eligibility-band-v1', content: { requestId, band: '50-100' }, time: NOW });

describe('[RESR] research relationship', function () {
  describe('[RESR-S] streams, invite, marker', function () {
    it('[RESR-S1] the CMC app code and the invite: one read permission, on the root', () => {
      assert.strictEqual(cmcConstants.CMC_APP_CODES.RESEARCH, 'hds-research');
      assert.deepStrictEqual(res.researchInvitePermissions(), [{ streamId: 'hds-research', level: 'read' }]);
    });

    it('[RESR-S2] the root and both children are explicit-grant-only: `*` never reaches them', () => {
      for (const id of ['hds-research', 'hds-research-eligibility', 'hds-research-topics']) {
        assert.strictEqual(model.streams.isExplicitGrantOnly(id), true, id);
      }
      assert.strictEqual(model.streams.isExplicitGrantOnly('body'), false);
      assert.ok(model.streams.explicitGrantOnlyRootIds().includes('hds-research'));
    });

    it('[RESR-S3] ensureResearchStreams creates the tree with the model names; item-already-exists is fine', async () => {
      const conn = fakeConnection([], { streamErrors: { 'hds-research': 'item-already-exists' } });
      await res.ensureResearchStreams(conn, { model });
      assert.deepStrictEqual(conn.calls.map((c) => [c.method, c.params.id, c.params.parentId]), [
        ['streams.create', 'hds-research', undefined],
        ['streams.create', 'hds-research-eligibility', 'hds-research'],
        ['streams.create', 'hds-research-topics', 'hds-research']
      ]);
      assert.strictEqual(conn.calls[1].params.name, 'Eligibility test results sent');
    });

    it('[RESR-S4] any other stream error throws', async () => {
      const conn = fakeConnection([], { streamErrors: { 'hds-research-topics': 'forbidden' } });
      await assert.rejects(() => res.ensureResearchStreams(conn, { model }), /forbidden/);
    });
  });

  describe('[RESR-T] topics', function () {
    it('[RESR-T1] the keys come from the model vocabulary, in order', () => {
      assert.deepStrictEqual(res.researchTopicKeys(model), TOPICS);
      const bare = new HDSModel('');
      bare.loadFromObject({ items: {}, streams: [], eventTypes: { types: {}, extras: {} }, conversions: {}, datasources: [], authorizations: {} });
      assert.throws(() => res.researchTopicKeys(bare), /no research-topic vocabulary/);
    });

    it('[RESR-T2] no event or no stream: null (none chosen, every study may be offered)', async () => {
      assert.strictEqual(await res.readResearchTopics(fakeConnection([]), { model }), null);
      assert.strictEqual(await res.readResearchTopics(fakeConnection([], { streamsExist: false }), { model }), null);
    });

    it('[RESR-T3] the latest event by modified wins; unknown keys are dropped', async () => {
      const conn = fakeConnection([topicsEvent('a', ['sleep'], NOW - 10), topicsEvent('b', ['metabolic', 'astrology'], NOW)]);
      assert.deepStrictEqual(await res.readResearchTopics(conn, { model }), ['metabolic']);
    });

    it('[RESR-T4] save creates one event, then updates it; vocabulary order, no duplicate', async () => {
      const conn = fakeConnection([]);
      const id = await res.saveResearchTopics(conn, ['sleep', 'cardiovascular', 'sleep'], { model, now: NOW });
      assert.deepStrictEqual(conn.events[0].content, { topics: ['cardiovascular', 'sleep'] });
      assert.deepStrictEqual(conn.events[0].streamIds, ['hds-research-topics']);
      const again = await res.saveResearchTopics(conn, [], { model, now: NOW + 1 });
      assert.strictEqual(again, id);
      assert.strictEqual(conn.events.length, 1);
      assert.deepStrictEqual(conn.events[0].content, { topics: [] });
    });

    it('[RESR-T5] an unknown topic is refused before any write', async () => {
      const conn = fakeConnection([]);
      await assert.rejects(() => res.saveResearchTopics(conn, ['astrology'], { model }), /Unknown research topic: astrology/);
      assert.strictEqual(conn.calls.length, 0);
    });
  });

  describe('[RESR-B] band retention', function () {
    it('[RESR-B1] deletes the bands of the given requests only, trash then delete', async () => {
      const conn = fakeConnection([band('x', 'req-1'), band('y', 'req-2')]);
      assert.strictEqual(await res.deleteEligibilityBands(conn, { requestIds: ['req-1'] }), 1);
      assert.strictEqual(conn.events.find((e) => e.id === 'x').deleted, true);
      assert.ok(!conn.events.find((e) => e.id === 'y').trashed);
    });

    it('[RESR-B2] on opt-out deletes them all; no stream is not an error', async () => {
      const conn = fakeConnection([band('x', 'req-1'), band('y', 'req-2')]);
      assert.strictEqual(await res.deleteEligibilityBands(conn), 2);
      assert.ok(conn.events.every((e) => e.deleted));
      assert.strictEqual(await res.deleteEligibilityBands(fakeConnection([], { streamsExist: false })), 0);
    });
  });

  describe('[RESR-A] alerts', function () {
    it('[RESR-A1] builds each kind: fixed texts, code, ids only', () => {
      const c = res.buildResearchAlertContent({ kind: 'research-eligibility-request', requestId: 'req-2026-001' });
      assert.deepStrictEqual(Object.keys(c).sort(), ['body', 'code', 'hds', 'level', 'title']);
      assert.strictEqual(c.code, 'hds-research-eligibility-request');
      assert.strictEqual(c.level, 'info');
      assert.ok(c.title.en && c.title.fr && c.body.en && c.body.fr);
      assert.deepStrictEqual(c.hds, { kind: 'research-eligibility-request', requestId: 'req-2026-001' });
      assert.strictEqual(res.buildResearchAlertContent({ kind: 'research-invitation', studyId: 's-1' }).code, 'hds-research-invitation');
    });

    it('[RESR-A2] refuses a wrong id, an extra field or a foreign kind', () => {
      for (const hds of [
        { kind: 'research-invitation' },
        { kind: 'research-invitation', studyId: 'a b' },
        { kind: 'research-invitation', studyId: 's', expiresAt: 1 },
        { kind: 'research-eligibility-request', studyId: 's' },
        { kind: 'eligibility-request', requestId: 'r' }
      ]) {
        assert.throws(() => res.buildResearchAlertContent(hds), /invalid hds block/, JSON.stringify(hds));
      }
    });

    it('[RESR-A3] reads only delivered, valid research alerts; dedup key is (kind, id)', () => {
      const delivered = { ...res.buildResearchAlertContent({ kind: 'research-invitation', studyId: 's-1' }), from: { username: 'hds-research' } };
      const alert = res.readResearchAlert(delivered);
      assert.deepStrictEqual(alert, { kind: 'research-invitation', studyId: 's-1' });
      assert.strictEqual(res.researchAlertKey(alert), 'research-invitation:s-1');
      assert.strictEqual(res.readResearchAlert({ ...delivered, from: undefined }), null, 'the writer\'s own copy');
      assert.strictEqual(res.readResearchAlert({ ...delivered, hds: { kind: 'document-shared', eventId: 'x' } }), null);
      assert.strictEqual(res.readResearchAlert({ ...delivered, hds: { kind: 'research-invitation', studyId: 's', title: 'XYZ' } }), null);
      assert.strictEqual(res.readResearchAlert(null), null);
    });

    it('[RESR-A4] the mirrored schema equals the published one (skipped until data-model publishes it)', async function () {
      this.timeout(20000);
      let published;
      try {
        const r = await fetch(`${MODEL_BASE}/json-schemas/hds-research-alert.json`);
        if (!r.ok) return this.skip();
        published = await r.json();
      } catch { return this.skip(); }
      const strip = (s) => JSON.parse(JSON.stringify(s, (k, v) => (['description', 'title', '$id'].includes(k) ? undefined : v)));
      assert.deepStrictEqual(strip(published), strip(res.RESEARCH_ALERT_HDS_SCHEMA));
    });
  });
});
