import { assert } from './test-utils/deps-node.js';
import * as cmcFormSpec from '../ts/cmc/formSpec.ts';
import { Contact } from '../ts/appTemplates/Contact.ts';

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
    it('[CFS01] FORM_SPEC_EVENT_TYPE matches the locked Q-F5 name', () => {
      assert.equal(cmcFormSpec.FORM_SPEC_EVENT_TYPE, 'hds:form-spec-v1');
    });

    it('[CFS02] HDS_NOOP_STREAM_ID + permission match the brief', () => {
      assert.equal(cmcFormSpec.HDS_NOOP_STREAM_ID, ':hds:noop');
      assert.deepEqual(cmcFormSpec.HDS_NOOP_PERMISSION, { streamId: ':hds:noop', level: 'read' });
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
      assert.equal(out[0].streamId, ':hds:noop');
      assert.equal(out[0].level, 'read');
    });

    it('[CFS12] filters out malformed permission entries before deciding empty', () => {
      const spec = basicSpec({ permissions: [{ streamId: '', level: 'read' }, null, { streamId: 'x' /* no level */ }] });
      const out = cmcFormSpec.deriveCmcPermissions(spec);
      // All filtered → placeholder injected
      assert.equal(out.length, 1);
      assert.equal(out[0].streamId, ':hds:noop');
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
