import { assert } from './test-utils/deps-node.js';
import { loadTemplate, loadTemplateFromUrl } from '../ts/appTemplates/loader.ts';
import {
  templateScopeHash,
  diffTemplateScope,
  diffFormSpecWithTemplate,
  semverBump,
  templateToFormSpec,
  templateSource
} from '../ts/appTemplates/datasetTemplate.ts';
import { createInviteWithFormSpec } from '../ts/cmc/formSpec.ts';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';

/**
 * Plan 108 — data-set templates: an app publishes `hds-dataset.json` (an AppTemplate with
 * publication fields), a data-collection tool imports it by URL, detects scope changes and
 * builds a FormSpec whose permissions come from the data-model, never from the file.
 */

function datasetTemplate (overrides = {}) {
  return {
    $schema: 'https://hds-lib.datasafe.dev/schemas/appTemplate.json',
    format: 'hds-dataset-template',
    formatVersion: 1,
    id: 'cycle-app',
    version: '1.0.0',
    publishedAt: '2026-10-05',
    app: {
      id: 'cycle-app',
      name: { en: 'Cycle App' },
      publisher: 'Example Clinic',
      url: 'https://example.org/cycle-app/'
    },
    title: { en: 'Cycle chart' },
    description: { en: 'Daily fertility-awareness log' },
    consent: { en: 'I share my chart read-only.' },
    chat: true,
    sections: [
      {
        key: 'landmarks',
        type: 'recurring',
        name: { en: 'Cycle landmarks' },
        itemKeys: ['fertility-cycles-start'],
        itemCustomizations: {
          'fertility-cycles-start': { required: true, reminder: { expectedInterval: { min: 'P21D', max: 'P35D' } } }
        }
      },
      {
        key: 'daily',
        type: 'recurring',
        name: { en: 'Daily observations' },
        itemKeys: ['body-temperature-basal', 'body-vulva-bleeding'],
        itemCustomizations: { 'body-temperature-basal': { repeatable: 'P1D' } }
      }
    ],
    existingStreamRefs: [
      { streamId: 'cycle-notes', permissions: ['read'], purpose: 'app-private', label: { en: 'Daily notes' } }
    ],
    requiredBridges: ['bridge-mira'],
    ...overrides
  };
}

function clone (o) { return JSON.parse(JSON.stringify(o)); }

function fixtureModel () {
  const model = new HDSModel('http://fake/pack.json');
  model.loadFromObject({
    items: {
      'fertility-cycles-start': {
        version: 'v1',
        label: { en: 'Period start' },
        streamId: 'fertility-cycles-start',
        eventType: 'activity/plain',
        type: 'checkbox',
        repeatable: 'P1D'
      },
      'body-temperature-basal': {
        version: 'v1',
        label: { en: 'BBT' },
        streamId: 'body-temperature-basal',
        eventType: 'temperature/c',
        type: 'number',
        repeatable: 'unlimited'
      },
      'body-vulva-bleeding': {
        version: 'v1',
        label: { en: 'Bleeding' },
        streamId: 'body-vulva-bleeding',
        eventType: 'ratio/generic',
        type: 'number',
        repeatable: 'unlimited'
      },
      'old-bleeding': {
        version: 'v1',
        deprecated: true,
        label: { en: 'Bleeding (legacy)' },
        streamId: 'body-vulva-bleeding',
        eventType: 'count/generic',
        type: 'number',
        repeatable: 'unlimited'
      }
    },
    streams: [
      { id: 'fertility-cycles-start', name: 'Period start', parentId: null },
      { id: 'body-temperature-basal', name: 'Basal temperature', parentId: null },
      { id: 'body-vulva-bleeding', name: 'Bleeding', parentId: null }
    ]
  });
  return model;
}

function fakeResponse (body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => body
  };
}

describe('[DSTP] data-set templates (plan 108)', function () {
  describe('[DSTL] loader rules', function () {
    it('[DSTL1] accepts a full data-set template', () => {
      const tpl = loadTemplate(datasetTemplate());
      assert.equal(tpl.version, '1.0.0');
      assert.equal(tpl.app.publisher, 'Example Clinic');
    });

    it('[DSTL2] requires version, formatVersion and app once `format` is set', () => {
      const t = datasetTemplate();
      delete t.version; delete t.formatVersion; delete t.app;
      assert.throws(() => loadTemplate(t), /"formatVersion" is required[\s\S]*"version" is required[\s\S]*"app" is required/);
    });

    it('[DSTL3] rejects a non-https app.url', () => {
      const t = datasetTemplate();
      t.app.url = 'http://example.org/';
      assert.throws(() => loadTemplate(t), /must be an https URL/);
    });

    it('[DSTL4] app-private refs must be read-only', () => {
      const t = datasetTemplate();
      t.existingStreamRefs[0].permissions = ['manage'];
      assert.throws(() => loadTemplate(t), /must request \["read"\] only/);
    });

    it('[DSTL5] repeatable follows the data-model grammar; required is boolean', () => {
      for (const ok of ['once', 'any', 'unlimited', 'P1D', 'P1W', 'PT12H', 'P1DT6H']) {
        const t = datasetTemplate();
        t.sections[1].itemCustomizations['body-temperature-basal'].repeatable = ok;
        loadTemplate(t);
      }
      const bad = datasetTemplate();
      bad.sections[1].itemCustomizations['body-temperature-basal'].repeatable = 'daily';
      assert.throws(() => loadTemplate(bad), /repeatable "daily"/);
      const badReq = datasetTemplate();
      badReq.sections[0].itemCustomizations['fertility-cycles-start'].required = 'yes';
      assert.throws(() => loadTemplate(badReq), /required must be a boolean/);
    });

    it('[DSTL6] rejects a malformed version and an unknown format', () => {
      assert.throws(() => loadTemplate(datasetTemplate({ version: '1.0' })), /schema validation failed/);
      assert.throws(() => loadTemplate(datasetTemplate({ format: 'other' })), /schema validation failed/);
    });

    it('[DSTL7] a plain AppTemplate (no publication fields) still loads', () => {
      loadTemplate({ id: 'plain', title: { en: 'p' }, description: { en: 'p' }, chat: false, sections: [] });
    });
  });

  describe('[DSTU] loadTemplateFromUrl', function () {
    const url = 'https://example.org/cycle-app/hds-dataset.json';

    it('[DSTU1] fetches, validates and returns the template', async () => {
      let seen;
      const tpl = await loadTemplateFromUrl(url, {
        fetch: async (u, init) => { seen = init; return fakeResponse(JSON.stringify(datasetTemplate())); }
      });
      assert.equal(tpl.id, 'cycle-app');
      assert.equal(seen.credentials, 'omit');
      assert.equal(seen.cache, 'no-store');
    });

    it('[DSTU2] refuses non-https and malformed URLs without fetching', async () => {
      const fetch = async () => { throw new Error('must not fetch'); };
      for (const bad of ['http://example.org/x.json', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url']) {
        await assert.rejects(loadTemplateFromUrl(bad, { fetch }), (e) => e.innerObject.reason === 'url');
      }
    });

    it('[DSTU3] maps HTTP errors, oversized bodies and invalid JSON', async () => {
      await assert.rejects(
        loadTemplateFromUrl(url, { fetch: async () => fakeResponse('', { status: 404 }) }),
        (e) => e.innerObject.reason === 'http' && e.innerObject.status === 404
      );
      await assert.rejects(
        loadTemplateFromUrl(url, { fetch: async () => fakeResponse('{}', { headers: { 'content-length': '999999' } }) }),
        (e) => e.innerObject.reason === 'too-large'
      );
      await assert.rejects(
        loadTemplateFromUrl(url, { maxBytes: 10, fetch: async () => fakeResponse('x'.repeat(11)) }),
        (e) => e.innerObject.reason === 'too-large'
      );
      await assert.rejects(
        loadTemplateFromUrl(url, { fetch: async () => fakeResponse('<html>') }),
        (e) => e.innerObject.reason === 'json'
      );
    });

    it('[DSTU4] times out', async () => {
      const fetch = (u, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
      await assert.rejects(loadTemplateFromUrl(url, { fetch, timeoutMs: 20 }), (e) => e.innerObject.reason === 'timeout');
    });

    it('[DSTU5] a valid fetch of an invalid template surfaces the validation error', async () => {
      const bad = datasetTemplate();
      bad.app.url = 'http://x';
      await assert.rejects(
        loadTemplateFromUrl(url, { fetch: async () => fakeResponse(JSON.stringify(bad)) }),
        /must be an https URL/
      );
    });
  });

  describe('[DSTH] templateScopeHash', function () {
    it('[DSTH1] is stable under key order, section reorganisation and text edits', async () => {
      const a = datasetTemplate();
      const b = clone(a);
      b.sections.reverse();
      b.title = { en: 'Renamed' };
      b.sections[0].name = { en: 'Renamed section' };
      // move an item to another section of the same type
      b.sections[0].itemKeys.push(...b.sections[1].itemKeys.splice(0, 1));
      const reordered = Object.fromEntries(Object.entries(a).reverse());
      const h = await templateScopeHash(a);
      assert.match(h, /^sha256:[0-9a-f]{64}$/);
      assert.equal(await templateScopeHash(b), h);
      assert.equal(await templateScopeHash(reordered), h);
    });

    it('[DSTH2] changes when an item, a section type or a ref permission changes', async () => {
      const a = datasetTemplate();
      const h = await templateScopeHash(a);
      const added = clone(a); added.sections[1].itemKeys.push('x-new');
      const typed = clone(a); typed.sections[0].type = 'permanent';
      const perm = clone(a); perm.existingStreamRefs[0].permissions = ['read', 'contribute'];
      for (const t of [added, typed, perm]) assert.notEqual(await templateScopeHash(t), h);
    });
  });

  describe('[DSTD] diffTemplateScope', function () {
    it('[DSTD1] an added item is a minor change', () => {
      const a = datasetTemplate();
      const b = clone(a); b.sections[1].itemKeys.push('x-new'); b.version = '1.1.0';
      const d = diffTemplateScope(a, b);
      assert.deepEqual(d.added, ['x-new']);
      assert.equal(d.breaking, false);
      assert.equal(d.requiredBump, 'minor');
      assert.equal(d.actualBump, 'minor');
      assert.equal(d.underBumped, false);
    });

    it('[DSTD2] a removed item or a section-type change is breaking (major)', () => {
      const a = datasetTemplate();
      const removed = clone(a); removed.sections[1].itemKeys = ['body-temperature-basal'];
      const d1 = diffTemplateScope(a, removed);
      assert.deepEqual(d1.removed, ['body-vulva-bleeding']);
      assert.equal(d1.breaking, true);
      assert.equal(d1.requiredBump, 'major');
      assert.equal(d1.underBumped, true, 'same version → under-bumped');
      const typed = clone(a); typed.sections[0].type = 'permanent';
      assert.deepEqual(diffTemplateScope(a, typed).typeChanged, ['fertility-cycles-start']);
    });

    it('[DSTD3] cadence change is minor; texts or a move only is patch; identical is none', () => {
      const a = datasetTemplate();
      const cad = clone(a); cad.sections[1].itemCustomizations['body-temperature-basal'].repeatable = 'P2D';
      const dc = diffTemplateScope(a, cad);
      assert.deepEqual(dc.cadenceChanged, ['body-temperature-basal']);
      assert.equal(dc.requiredBump, 'minor');
      const txt = clone(a); txt.description = { en: 'Reworded' };
      assert.equal(diffTemplateScope(a, txt).requiredBump, 'patch');
      assert.equal(diffTemplateScope(a, clone(a)).requiredBump, 'none');
    });

    it('[DSTD4] existing-stream-ref changes', () => {
      const a = datasetTemplate();
      const b = clone(a);
      b.existingStreamRefs[0].permissions = ['read', 'contribute'];
      b.existingStreamRefs.push({ streamId: 'other', permissions: ['read'] });
      const d = diffTemplateScope(a, b);
      assert.deepEqual(d.existingStreamRefs, { added: ['other'], removed: [], permissionsChanged: ['cycle-notes'] });
      assert.equal(d.breaking, true);
    });

    it('[DSTD5] semverBump', () => {
      assert.equal(semverBump('1.0.0', '2.0.0'), 'major');
      assert.equal(semverBump('1.0.0', '1.2.0'), 'minor');
      assert.equal(semverBump('1.0.0', '1.0.3'), 'patch');
      assert.equal(semverBump('1.0.0', '1.0.0'), 'none');
      assert.equal(semverBump('2.0.0', '1.9.9'), 'none');
      assert.equal(semverBump(undefined, '1.0.0'), 'none');
    });

    it('[DSTD6] diffFormSpecWithTemplate reads the data set (owner edits included) as the previous version', async () => {
      const tpl = loadTemplate(datasetTemplate());
      const source = await templateSource(tpl, 'https://example.org/cycle-app/hds-dataset.json', 1);
      const { formSpec } = templateToFormSpec(tpl, { model: fixtureModel(), source });
      assert.equal(diffFormSpecWithTemplate(formSpec, tpl).requiredBump, 'none');
      // the owner removed an item after import → re-applying the template would add it back
      formSpec.sections[1].itemKeys = ['body-temperature-basal'];
      const next = clone(tpl);
      next.version = '1.1.0';
      next.sections[1].itemKeys.push('x-new');
      const d = diffFormSpecWithTemplate(formSpec, next);
      assert.deepEqual(d.added, ['body-vulva-bleeding', 'x-new']);
      assert.equal(d.actualBump, 'minor');
      assert.equal(d.underBumped, false);
    });
  });

  describe('[DSTF] templateToFormSpec', function () {
    it('[DSTF1] derives read permissions from the data-model and carries the template fields', () => {
      const { formSpec, itemKeyIssues } = templateToFormSpec(loadTemplate(datasetTemplate()), { model: fixtureModel() });
      assert.deepEqual(itemKeyIssues, []);
      assert.deepEqual(
        formSpec.permissions.map(p => [p.streamId, p.level]).sort(),
        [['body-temperature-basal', 'read'], ['body-vulva-bleeding', 'read'], ['fertility-cycles-start', 'read']]
      );
      assert.equal(formSpec.version, 1);
      assert.deepEqual(formSpec.features, { chat: true });
      assert.deepEqual(formSpec.consent, { en: 'I share my chart read-only.' });
      assert.deepEqual(formSpec.appCustomData, { requiredBridges: ['bridge-mira'] });
      assert.equal(formSpec.sections[0].itemCustomizations['fertility-cycles-start'].required, true);
      assert.deepEqual(formSpec.existingStreamRefs[0].permissions, ['read']);
    });

    it('[DSTF2] unknown keys are reported, kept in sections, and left out of permissions', () => {
      const t = datasetTemplate();
      t.sections[1].itemKeys.push('not-in-model', 'old-bleeding');
      const { formSpec, itemKeyIssues } = templateToFormSpec(loadTemplate(t), { model: fixtureModel() });
      assert.deepEqual(itemKeyIssues.map(i => [i.itemKey, i.reason]), [['not-in-model', 'unknown'], ['old-bleeding', 'deprecated']]);
      assert.ok(formSpec.sections[1].itemKeys.includes('not-in-model'));
      assert.ok(!formSpec.permissions.some(p => p.streamId === 'not-in-model'));
    });

    it('[DSTF3] does not alias the template (edits to the FormSpec leave it intact)', () => {
      const tpl = loadTemplate(datasetTemplate());
      const { formSpec } = templateToFormSpec(tpl, { model: fixtureModel() });
      formSpec.sections[0].itemKeys.push('x');
      formSpec.sections[0].itemCustomizations['fertility-cycles-start'].required = false;
      assert.deepEqual(tpl.sections[0].itemKeys, ['fertility-cycles-start']);
      assert.equal(tpl.sections[0].itemCustomizations['fertility-cycles-start'].required, true);
    });

    it('[DSTF4] templateSource records provenance and the scope hash', async () => {
      const tpl = loadTemplate(datasetTemplate());
      const src = await templateSource(tpl, 'https://example.org/cycle-app/hds-dataset.json', 1000);
      assert.deepEqual(src, {
        url: 'https://example.org/cycle-app/hds-dataset.json',
        templateId: 'cycle-app',
        scopeHash: await templateScopeHash(tpl),
        fetchedAt: 1000,
        version: '1.0.0',
        publisher: 'Example Clinic'
      });
      const { formSpec } = templateToFormSpec(tpl, { model: fixtureModel(), source: src });
      assert.equal(formSpec.source.version, '1.0.0');
    });
  });

  describe('[DSTI] createInviteWithFormSpec open-link without expiry', function () {
    function fakeConnection () {
      const calls = [];
      return {
        calls,
        apiOne: async (method, params) => {
          calls.push({ method, params });
          return { id: 'evt1', content: { ...params.content, capabilityUrl: 'https://cap', capabilityExpiresAt: null } };
        }
      };
    }
    const base = {
      appCode: 'hds-collector',
      scopeStreamId: ':_cmc:apps:hds-collector:c1',
      displayName: 'Dr X',
      requestedPermissions: [{ streamId: 'a', level: 'read' }],
      formSpec: { version: 1, title: { en: 't' }, description: { en: 'd' }, permissions: [], sections: [] }
    };

    it('[DSTI1] sends request.expiresAt null with capability mode open-link and returns null', async () => {
      const conn = fakeConnection();
      const res = await createInviteWithFormSpec(conn, { ...base, mode: 'open-link', expiresAt: null });
      const content = conn.calls[0].params.content;
      assert.strictEqual(content.request.expiresAt, null);
      assert.deepEqual(content.capability, { mode: 'open-link' });
      assert.strictEqual(res.expiresAt, null);
    });

    it('[DSTI2] refuses no-expiry on a single-use invite before writing', async () => {
      const conn = fakeConnection();
      await assert.rejects(createInviteWithFormSpec(conn, { ...base, expiresAt: null }), /requires mode "open-link"/);
      assert.equal(conn.calls.length, 0);
    });

    it('[DSTI3] omits expiresAt when undefined (core default)', async () => {
      const conn = fakeConnection();
      await createInviteWithFormSpec(conn, { ...base });
      assert.ok(!('expiresAt' in conn.calls[0].params.content.request));
    });
  });
});
