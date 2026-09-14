import { assert } from './test-utils/deps-node.js';
import * as cmcFormSpec from '../ts/cmc/formSpec.ts';
import { Contact } from '../ts/appTemplates/Contact.ts';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';

/**
 * Unit tests for the Plan 59 Phase 5a FormSpec helpers + the
 * `hdsFormSpec` pass-through on Contact.aggregateCmc.
 *
 * I/O paths (saveFormSpec / loadFormSpec / mirror) are integration-tested
 * against a live api-server in the Phase 6 demo iteration loop.
 */

describe('[CFSP] cmcFormSpec helpers', function () {
  function basicSpec (overrides = {}) {
    return {
      version: 1,
      title: { en: 'Hello World' },
      description: { en: 'desc' },
      consent: { en: 'I consent' },
      permissions: [{ streamId: 'health', level: 'read' }],
      sections: [{ key: 'sleep-section', type: 'recurring', name: { en: 'Sleep' }, itemKeys: ['sleep-duration'] }],
      ...overrides
    };
  }

  describe('[CFSC] constants', function () {
    it('[CFS01] FORM_SPEC_EVENT_TYPE is `hds-form-spec/v1` (slash-form per Pryv events.get regex)', () => {
      assert.equal(cmcFormSpec.FORM_SPEC_EVENT_TYPE, 'hds-form-spec/v1');
    });

    it('[CFS02] HDS_NOOP_STREAM_ID + permission match the brief', () => {
      assert.equal(cmcFormSpec.HDS_NOOP_STREAM_ID, 'hds-noop');
      assert.deepEqual(cmcFormSpec.HDS_NOOP_PERMISSION, { streamId: 'hds-noop', level: 'read' });
    });
  });

  describe('[CFSD] deriveCmcPermissions', function () {
    it('[CFS10] returns the FormSpec permissions when non-empty', () => {
      const spec = basicSpec();
      const out = cmcFormSpec.deriveCmcPermissions(spec);
      assert.deepEqual(out, [{ streamId: 'health', level: 'read' }]);
    });

    it('[CFS11] injects :hds:noop placeholder when permissions empty', () => {
      const spec = basicSpec({ permissions: [] });
      const out = cmcFormSpec.deriveCmcPermissions(spec);
      assert.equal(out.length, 1);
      assert.equal(out[0].streamId, 'hds-noop');
      assert.equal(out[0].level, 'read');
    });

    it('[CFS12] filters out malformed permission entries before deciding empty', () => {
      const spec = basicSpec({ permissions: [{ streamId: '', level: 'read' }, null, { streamId: 'x' /* no level */ }] });
      const out = cmcFormSpec.deriveCmcPermissions(spec);
      // All filtered → placeholder injected
      assert.equal(out.length, 1);
      assert.equal(out[0].streamId, 'hds-noop');
    });
  });

  describe('[CFSI] isChatOnlyFormSpec', function () {
    it('[CFS20] true on empty / placeholder-only specs', () => {
      assert.equal(cmcFormSpec.isChatOnlyFormSpec(basicSpec({ permissions: [] })), true);
    });
    it('[CFS21] false when real permissions present', () => {
      assert.equal(cmcFormSpec.isChatOnlyFormSpec(basicSpec()), false);
    });
    it('[CFS22] false for null / undefined input', () => {
      assert.equal(cmcFormSpec.isChatOnlyFormSpec(null), false);
      assert.equal(cmcFormSpec.isChatOnlyFormSpec(undefined), false);
    });
  });

  describe('[CFSR] eventToFormSpecRecord (pure helper)', function () {
    function eventOn (streamId, content = basicSpec()) {
      return { id: 'evt-' + streamId, streamIds: [streamId], content };
    }

    it('[CFS30] extracts collectorId from a hds-collector sub-scope', () => {
      const rec = cmcFormSpec.eventToFormSpecRecord(eventOn(':_cmc:apps:hds-collector:abc123'));
      assert.equal(rec.collectorId, 'abc123');
      assert.equal(rec.formSpec.title.en, 'Hello World');
      assert.equal(rec.event.id, 'evt-:_cmc:apps:hds-collector:abc123');
    });

    it('[CFS31] honors a custom appCode parameter', () => {
      const rec = cmcFormSpec.eventToFormSpecRecord(
        eventOn(':_cmc:apps:hds-patient:xyz'),
        'hds-patient'
      );
      assert.equal(rec.collectorId, 'xyz');
    });

    it('[CFS32] picks the matching stream when an event has multiple streamIds', () => {
      const ev = { id: 'evt', streamIds: ['other-stream', ':_cmc:apps:hds-collector:formA'], content: basicSpec() };
      const rec = cmcFormSpec.eventToFormSpecRecord(ev);
      assert.equal(rec.collectorId, 'formA');
    });

    it('[CFS33] returns the raw streamId when no matching scope marker is found (fallback)', () => {
      const ev = { id: 'evt', streamIds: ['orphan'], content: basicSpec() };
      const rec = cmcFormSpec.eventToFormSpecRecord(ev);
      // extractAppSubScopeSuffix returns the input unchanged when the prefix is missing.
      assert.equal(rec.collectorId, 'orphan');
    });

    it('[CFS34] tolerates a missing streamIds array', () => {
      const ev = { id: 'evt', content: basicSpec() };
      const rec = cmcFormSpec.eventToFormSpecRecord(ev);
      assert.equal(rec.collectorId, '');
    });
  });

  describe('[CFSL] listFormSpecs', function () {
    function fakeConnection (events) {
      const calls = [];
      const conn = {
        apiOne (method, params, resultKey) {
          calls.push({ method, params, resultKey });
          if (method === 'events.get') return events;
          throw new Error('unexpected apiOne method ' + method);
        }
      };
      return { conn, calls };
    }

    it('[CFS40] queries the :_cmc:apps:hds-collector parent stream filtered to hds-form-spec/v1', async () => {
      const { conn, calls } = fakeConnection([]);
      await cmcFormSpec.listFormSpecs(conn);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'events.get');
      assert.deepEqual(calls[0].params.streams, [':_cmc:apps:hds-collector']);
      assert.deepEqual(calls[0].params.types, ['hds-form-spec/v1']);
      assert.equal(calls[0].params.limit, 1000);
      assert.equal(calls[0].resultKey, 'events');
    });

    it('[CFS41] maps every returned event to a FormSpecRecord with collectorId set', async () => {
      const events = [
        { id: 'e1', streamIds: [':_cmc:apps:hds-collector:form-a'], content: basicSpec({ title: { en: 'Form A' } }) },
        { id: 'e2', streamIds: [':_cmc:apps:hds-collector:form-b'], content: basicSpec({ title: { en: 'Form B' } }) }
      ];
      const { conn } = fakeConnection(events);
      const records = await cmcFormSpec.listFormSpecs(conn);
      assert.equal(records.length, 2);
      assert.deepEqual(records.map(r => r.collectorId), ['form-a', 'form-b']);
      assert.equal(records[0].formSpec.title.en, 'Form A');
      assert.equal(records[1].event.id, 'e2');
    });

    it('[CFS42] returns [] when the api returns null/undefined', async () => {
      const { conn } = fakeConnection(null);
      const records = await cmcFormSpec.listFormSpecs(conn);
      assert.deepEqual(records, []);
    });

    it('[CFS43] honors a custom appCode opt', async () => {
      const { conn, calls } = fakeConnection([]);
      await cmcFormSpec.listFormSpecs(conn, { appCode: 'hds-patient' });
      assert.deepEqual(calls[0].params.streams, [':_cmc:apps:hds-patient']);
    });

    it('[CFS44] honors a custom limit opt', async () => {
      const { conn, calls } = fakeConnection([]);
      await cmcFormSpec.listFormSpecs(conn, { limit: 50 });
      assert.equal(calls[0].params.limit, 50);
    });
  });

  describe('[CFSG] getFormSpecById', function () {
    it('[CFS50] returns null when loadFormSpec finds nothing', async () => {
      const conn = { apiOne: async () => [] };
      const rec = await cmcFormSpec.getFormSpecById(conn, 'missing');
      assert.equal(rec, null);
    });

    it('[CFS51] returns a FormSpecRecord with the requested collectorId when found', async () => {
      const event = { id: 'evt-xyz', streamIds: [':_cmc:apps:hds-collector:xyz'], content: basicSpec({ title: { en: 'XYZ' } }) };
      const calls = [];
      const conn = {
        apiOne (method, params, resultKey) {
          calls.push({ method, params, resultKey });
          return [event];
        }
      };
      const rec = await cmcFormSpec.getFormSpecById(conn, 'xyz');
      assert.ok(rec);
      assert.equal(rec.collectorId, 'xyz');
      assert.equal(rec.formSpec.title.en, 'XYZ');
      // Verify the underlying loadFormSpec was scoped to the exact sub-scope stream
      assert.deepEqual(calls[0].params.streams, [':_cmc:apps:hds-collector:xyz']);
    });

    it('[CFS52] honors a custom appCode opt', async () => {
      const calls = [];
      const conn = {
        apiOne (method, params) {
          calls.push(params);
          return [];
        }
      };
      await cmcFormSpec.getFormSpecById(conn, 'foo', { appCode: 'hds-patient' });
      assert.deepEqual(calls[0].streams, [':_cmc:apps:hds-patient:foo']);
    });
  });

  describe('[CFSN] createInviteWithFormSpec request building', function () {
    function inviteParams (overrides = {}) {
      return {
        appCode: 'hds-collector',
        scopeStreamId: ':_cmc:apps:hds-collector:abc',
        displayName: 'Dr Demo',
        requestedPermissions: [{ streamId: 'health', level: 'read' }],
        formSpec: basicSpec(),
        ...overrides
      };
    }

    function captureConn (calls) {
      return {
        apiOne (method, params, resultKey) {
          calls.push({ method, params, resultKey });
          return { id: 'evt-invite', content: { capabilityUrl: 'https://cap' } };
        }
      };
    }

    it('[CFS60] forwards accessType to the CMC request (issue #11)', async () => {
      const calls = [];
      await cmcFormSpec.createInviteWithFormSpec(captureConn(calls), inviteParams({ accessType: 'app' }));
      assert.equal(calls[0].method, 'events.create');
      assert.equal(calls[0].params.content.request.accessType, 'app');
    });

    it('[CFS61] omits accessType from the request when not given (plugin default: shared)', async () => {
      const calls = [];
      await cmcFormSpec.createInviteWithFormSpec(captureConn(calls), inviteParams());
      assert.ok(!('accessType' in calls[0].params.content.request));
    });
  });
});

describe('[CTFS] Contact.aggregateCmc hdsFormSpec pass-through', function () {
  const SCOPE = ':_cmc:apps:hds-patient';

  function counterpartyAccess (overrides = {}) {
    const cp = {
      username: 'drandy',
      host: 'demo.datasafe.dev',
      apiEndpoint: 'https://abctoken@drandy.demo.datasafe.dev/',
      remoteChatStreamId: 'r1',
      remoteCollectorStreamId: 'c1'
    };
    return {
      id: overrides.id || 'acc-1',
      permissions: [{ streamId: 'health', level: 'read' }],
      clientData: {
        cmc: {
          role: 'counterparty',
          appCode: 'hds-collector',
          features: { chat: true, systemMessaging: true },
          counterparty: cp
        }
      },
      ...overrides
    };
  }

  function acceptEvent (overrides = {}) {
    return {
      acceptEventId: overrides.acceptEventId || 'evt-1',
      counterparty: { username: 'drandy', host: 'demo.datasafe.dev' },
      appCode: 'hds-collector',
      scopeStreamId: SCOPE,
      acceptedAt: 1716000000,
      features: { chat: true, systemMessaging: true },
      ...overrides
    };
  }

  it('[CTFS1] surfaces hdsFormSpec from the matching accept event', () => {
    const spec = {
      version: 1,
      title: { en: 'Hello World' },
      description: { en: '' },
      permissions: [{ streamId: 'health', level: 'read' }],
      sections: []
    };
    const out = Contact.aggregateCmc(
      [counterpartyAccess()],
      [acceptEvent({ hdsFormSpec: spec })],
      SCOPE
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].cmcRelationships[0].hdsFormSpec, spec);
  });

  it('[CTFS2] hdsFormSpec defaults to null when accept event has none', () => {
    const out = Contact.aggregateCmc(
      [counterpartyAccess()],
      [acceptEvent()],
      SCOPE
    );
    assert.equal(out[0].cmcRelationships[0].hdsFormSpec, null);
  });

  it('[CTFS3] cmcFormSpecs getter returns specs from all chat-enabled relationships', () => {
    const spec = { version: 1, title: { en: 'A' }, description: { en: '' }, permissions: [], sections: [{ key: 's', type: 'recurring', name: { en: 'S' }, itemKeys: [] }] };
    const out = Contact.aggregateCmc(
      [counterpartyAccess()],
      [acceptEvent({ hdsFormSpec: spec })],
      SCOPE
    );
    assert.deepEqual(out[0].cmcFormSpecs, [spec]);
  });

  it('[CTFS4] cmcFormSections aggregates sections across relationships', () => {
    const spec1 = { version: 1, title: { en: 'A' }, description: { en: '' }, permissions: [], sections: [{ key: 's1', type: 'recurring', name: { en: 'S1' }, itemKeys: ['a'] }] };
    const spec2 = { version: 1, title: { en: 'B' }, description: { en: '' }, permissions: [], sections: [{ key: 's2', type: 'recurring', name: { en: 'S2' }, itemKeys: ['b'] }] };
    const a1 = counterpartyAccess({ id: 'a1' });
    const a2 = counterpartyAccess({ id: 'a2' });
    const out = Contact.aggregateCmc(
      [a1, a2],
      [
        acceptEvent({ acceptEventId: 'e1', hdsFormSpec: spec1 }),
        acceptEvent({ acceptEventId: 'e2', hdsFormSpec: spec2 })
      ],
      SCOPE
    );
    // Both relationships share the same counterparty → one Contact, two relationships.
    // Both accept events match the same (counterparty, appCode) pair so both
    // relationships get the FIRST matching spec. That's the documented
    // behaviour — `matchingAccept` is `accepts.find(...)` (first match).
    assert.equal(out.length, 1);
    assert.equal(out[0].cmcRelationships.length, 2);
    assert.equal(out[0].cmcFormSections.length, 2);
    assert.deepEqual(out[0].cmcFormSections.map(s => s.key), ['s1', 's1']);
  });
});

/**
 * [CFSV] validateFormSpecItemKeys — the guard for the failure mode behind
 * `B-2026-09-03-4`.
 *
 * A FormSpec names item keys directly, while events resolve through
 * `forEvent(streamId + eventType)`. So a rename that preserves streamId and
 * eventType orphans no stored event and reads as safe, while silently
 * stranding every spec that named the old key. data-model 2.3.0 withdrew the
 * `fertility-hormone-{fsh,hcg,pdg,e3g}` aliases on exactly that reasoning.
 *
 * The model fixtures below mirror the real published pack, so the expectations
 * are the real ones: `fertility-hormone-lh` resolves but is deprecated onto the
 * legacy `concentration/mg-l` unit, and its active twin
 * `body-urine-hormones-lh` is on `concentration/iu-l`.
 */
describe('[CFSV] validateFormSpecItemKeys', function () {
  function load (data) {
    const model = new HDSModel('http://fake/pack.json');
    model.loadFromObject(data);
    return model;
  }

  function basicSpec (overrides = {}) {
    return {
      version: 1,
      title: { en: 'Fertility Tracking' },
      description: { en: 'desc' },
      permissions: [],
      sections: [],
      ...overrides
    };
  }

  function urineHormoneModel () {
    return load({
      items: {
        'body-urine-hormones-e3g': {
          version: 'v2',
          label: { en: 'E3G (urine)' },
          streamId: 'body-urine-hormones-e3g',
          eventType: 'concentration/ug-l',
          type: 'number',
          repeatable: 'any'
        },
        'body-urine-hormones-lh': {
          version: 'v2',
          label: { en: 'LH (urine)' },
          streamId: 'body-urine-hormones-lh',
          eventType: 'concentration/iu-l',
          type: 'number',
          repeatable: 'any'
        },
        // Permanently kept: the rename also changed the unit, so historical
        // mg-l events still resolve here. Shares a streamId with the active
        // item above but NOT its eventType.
        'fertility-hormone-lh': {
          version: 'v1',
          deprecated: true,
          label: { en: 'LH (urine, legacy)' },
          streamId: 'body-urine-hormones-lh',
          eventType: 'concentration/mg-l',
          type: 'number',
          repeatable: 'any'
        }
      },
      streams: [
        { id: 'body-urine-hormones-e3g', name: 'E3G' },
        { id: 'body-urine-hormones-lh', name: 'LH' }
      ]
    });
  }

  function specWithKeys (itemKeys, sectionKey = 'fertility-recurring') {
    return basicSpec({
      sections: [{ key: sectionKey, type: 'recurring', name: { en: 'Fertility' }, itemKeys }]
    });
  }

  it('[CFSV1] returns [] for a spec whose keys all resolve to active items', () => {
    const out = cmcFormSpec.validateFormSpecItemKeys(
      specWithKeys(['body-urine-hormones-e3g', 'body-urine-hormones-lh']),
      urineHormoneModel()
    );
    assert.deepEqual(out, []);
  });

  it('[CFSV2] flags a withdrawn key as `unknown` and offers no replacement', () => {
    // The real B-2026-09-03-4 case: the pack defines nothing under this key, so
    // there is no streamId to trace a replacement from.
    const out = cmcFormSpec.validateFormSpecItemKeys(
      specWithKeys(['fertility-hormone-e3g']),
      urineHormoneModel()
    );
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], { sectionKey: 'fertility-recurring', itemKey: 'fertility-hormone-e3g', reason: 'unknown' });
    assert.equal(out[0].replacement, undefined);
  });

  it('[CFSV3] flags a deprecated key that still resolves, and names its replacement', () => {
    // `fertility-hormone-lh` is NOT missing — it resolves, which is why an
    // unknown-key check alone would pass this spec while the subject records
    // LH in mg/L instead of IU/L.
    const out = cmcFormSpec.validateFormSpecItemKeys(
      specWithKeys(['fertility-hormone-lh']),
      urineHormoneModel()
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].reason, 'deprecated');
    assert.equal(out[0].itemKey, 'fertility-hormone-lh');
    assert.equal(out[0].replacement, 'body-urine-hormones-lh');
  });

  it('[CFSV4] withholds a replacement when several active items share the streamId', () => {
    // Picking one would be a guess that silently changes the unit data lands in.
    const model = load({
      items: {
        'urine-lh-iu': { version: 'v2', label: { en: 'a' }, streamId: 's', eventType: 'concentration/iu-l', type: 'number', repeatable: 'any' },
        'urine-lh-ug': { version: 'v2', label: { en: 'b' }, streamId: 's', eventType: 'concentration/ug-l', type: 'number', repeatable: 'any' },
        'legacy-lh': { version: 'v1', deprecated: true, label: { en: 'c' }, streamId: 's', eventType: 'concentration/mg-l', type: 'number', repeatable: 'any' }
      },
      streams: [{ id: 's', name: 'S' }]
    });
    const out = cmcFormSpec.validateFormSpecItemKeys(specWithKeys(['legacy-lh']), model);
    assert.equal(out.length, 1);
    assert.equal(out[0].reason, 'deprecated');
    assert.equal(out[0].replacement, undefined);
  });

  it('[CFSV5] reports every offending key, across every section, with its section key', () => {
    // The prod spec behind B-2026-09-03-4 carried four dead keys in one
    // section, not the single one the bug was originally filed for.
    const spec = basicSpec({
      sections: [
        { key: 'fertility-recurring', type: 'recurring', name: { en: 'F' }, itemKeys: ['fertility-hormone-e3g', 'body-urine-hormones-e3g', 'fertility-hormone-lh'] },
        { key: 'body-recurring', type: 'recurring', name: { en: 'B' }, itemKeys: ['fertility-hormone-pdg'] }
      ]
    });
    const out = cmcFormSpec.validateFormSpecItemKeys(spec, urineHormoneModel());
    assert.deepEqual(out.map(i => `${i.sectionKey}/${i.itemKey}:${i.reason}`), [
      'fertility-recurring/fertility-hormone-e3g:unknown',
      'fertility-recurring/fertility-hormone-lh:deprecated',
      'body-recurring/fertility-hormone-pdg:unknown'
    ]);
  });

  it('[CFSV6] tolerates a spec with no sections and a section with no itemKeys', () => {
    const model = urineHormoneModel();
    assert.deepEqual(cmcFormSpec.validateFormSpecItemKeys(basicSpec({ sections: [] }), model), []);
    assert.deepEqual(cmcFormSpec.validateFormSpecItemKeys(
      basicSpec({ sections: [{ key: 's', type: 'recurring', name: { en: 'S' } }] }), model), []);
  });
});
