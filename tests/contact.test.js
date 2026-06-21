import { assert } from './test-utils/deps-node.js';
import { Contact } from '../ts/appTemplates/Contact.ts';

/**
 * Unit tests for the post-plan-61 CMC-only Contact class.
 *
 * Surfaces under test:
 * - constructor + addAccessObject (raw access tracking)
 * - initStreamCache + eventIsAccessible (access-permission-derived stream cache)
 * - eventIsFromContact (modifiedBy attribution including replaced-access chain
 *   and Plan 66 composite ids)
 * - aggregateCmc + cmc* getters (Plan 59 Phase 5a)
 */

describe('[CTCT] Contact class', function () {
  describe('[CTCS] constructor', function () {
    it('[CTA1] should create an empty contact', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      assert.equal(c.remoteUsername, 'dr-alice');
      assert.equal(c.displayName, 'Dr. Alice');
      assert.deepEqual(c.accessObjects, []);
      assert.deepEqual(c.cmcRelationships, []);
      assert.equal(c.counterparty, null);
      assert.equal(c.kind, 'unknown');
    });

    it('[CTA2] isPerson reflects remoteUsername presence', () => {
      assert.equal(new Contact('u', 'U').isPerson, true);
      assert.equal(new Contact(null, 'bridge').isPerson, false);
    });
  });

  describe('[CTAO] addAccessObject', function () {
    it('[CTAB] adds access objects and dedups by id', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [] });
      c.addAccessObject({ id: 'a1', permissions: [] });
      c.addAccessObject({ id: 'a2', permissions: [] });
      assert.equal(c.accessObjects.length, 2);
    });

    it('[CTAC] accessIds is derived from accessObjects', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1' });
      c.addAccessObject({ id: 'a2' });
      assert.deepEqual(c.accessIds.sort(), ['a1', 'a2']);
    });
  });

  describe('[CTSC] initStreamCache & eventIsAccessible', function () {
    const streamsById = {
      health: { id: 'health', children: [{ id: 'health-bp', children: [] }] },
      diary: { id: 'diary', children: [] },
      'health-bp': { id: 'health-bp', children: [] }
    };

    it('[CTAL] eventIsAccessible returns false before initStreamCache', () => {
      const c = new Contact('u', 'U');
      assert.equal(c.eventIsAccessible({ streamIds: ['health'] }), false);
    });

    it('[CTAM] matches events in permitted streams and children', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [{ streamId: 'health', level: 'read' }] });
      c.initStreamCache(streamsById);
      assert.equal(c.eventIsAccessible({ streamIds: ['health'] }), true);
      assert.equal(c.eventIsAccessible({ streamIds: ['health-bp'] }), true);
      assert.equal(c.eventIsAccessible({ streamIds: ['diary'] }), false);
    });

    it('[CTAN] wildcard permission matches everything', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [{ streamId: '*', level: 'manage' }] });
      c.initStreamCache(streamsById);
      assert.equal(c.eventIsAccessible({ streamIds: ['anything'] }), true);
    });

    it('[CTAO2] skips deleted accesses', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', deleted: true, permissions: [{ streamId: 'health', level: 'read' }] });
      c.initStreamCache(streamsById);
      assert.equal(c.eventIsAccessible({ streamIds: ['health'] }), false);
    });

    it('[CTAP2] handles events with no streamIds', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [{ streamId: 'health', level: 'read' }] });
      c.initStreamCache(streamsById);
      assert.equal(c.eventIsAccessible({}), false);
      assert.equal(c.eventIsAccessible({ streamIds: null }), false);
    });
  });

  describe('[CTEF] eventIsFromContact', function () {
    it('[CTAQ] matches events modified by contact access', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1' });
      c.addAccessObject({ id: 'a2' });
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a1' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a2' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'other' }), false);
    });

    it('[CTAQ2] matches events from previous (replaced) accesses via clientData chain', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({
        id: 'a3-new',
        clientData: {
          hdsCollectorClient: {
            version: 0,
            previousAccessIds: ['a1-old', 'a2-older']
          }
        }
      });
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a3-new' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a1-old' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a2-older' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'unknown' }), false);
    });

    it('[CTAQ3] matches across Plan 66 composite ids (base-only equality)', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1:2' });
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a1' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a1:1' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a1:2' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'b1:0' }), false);
    });

    it('[CTAR] matches across legacy bridge-access recreate chain (clientData.previousAccessIds)', () => {
      const c = new Contact(null, 'bridge');
      c.addAccessObject({
        id: 'b2',
        clientData: { previousAccessIds: ['b1', 'b0'] }
      });
      assert.equal(c.eventIsFromContact({ modifiedBy: 'b0' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'b1' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'b2' }), true);
    });
  });

  describe('[CTCM] CMC Contact aggregator', function () {
    const SCOPE = ':_cmc:apps:hds-patient';

    function counterpartyAccess (overrides = {}) {
      const cp = {
        username: 'drandy',
        host: 'demo.datasafe.dev',
        apiEndpoint: 'https://abctoken@drandy.demo.datasafe.dev/',
        remoteChatStreamId: ':_cmc:apps:hds-collector:foo:chats:pthdstest--demo-datasafe-dev',
        remoteCollectorStreamId: ':_cmc:apps:hds-collector:foo:collectors:pthdstest--demo-datasafe-dev',
        ...(overrides.counterpartyOverrides || {})
      };
      const cmc = {
        role: 'counterparty',
        appCode: 'hds-collector',
        features: { chat: true, systemMessaging: true },
        counterparty: cp,
        ...(overrides.cmcOverrides || {})
      };
      return {
        id: overrides.id || 'acc-cp-1',
        apiEndpoint: 'irrelevant',
        permissions: overrides.permissions ?? [{ streamId: 'health', level: 'read' }],
        deleted: overrides.deleted ?? null,
        clientData: { cmc }
      };
    }

    function acceptEvent (overrides = {}) {
      return {
        acceptEventId: overrides.acceptEventId || 'evt-accept-1',
        counterparty: overrides.counterparty || { username: 'drandy', host: 'demo.datasafe.dev' },
        appCode: overrides.appCode || 'hds-collector',
        scopeStreamId: SCOPE,
        acceptedAt: overrides.acceptedAt ?? 1716000000,
        features: overrides.features || { chat: true, systemMessaging: true },
        backChannelAccessId: overrides.backChannelAccessId || 'acc-cp-1'
      };
    }

    it('[CTM1] cmcDetectKind splits person vs service by hds-bridge- prefix', () => {
      assert.equal(Contact.cmcDetectKind('hds-collector'), 'person');
      assert.equal(Contact.cmcDetectKind('hds-patient'), 'person');
      assert.equal(Contact.cmcDetectKind('hds-bridge-mira'), 'service');
      assert.equal(Contact.cmcDetectKind('hds-bridge-athenahealth'), 'service');
      assert.equal(Contact.cmcDetectKind(null), 'unknown');
      assert.equal(Contact.cmcDetectKind(undefined), 'unknown');
      assert.equal(Contact.cmcDetectKind(''), 'unknown');
    });

    it('[CTM2] aggregateCmc returns empty when no counterparty accesses', () => {
      const out = Contact.aggregateCmc([], [], SCOPE);
      assert.deepEqual(out, []);
    });

    it('[CTM3] aggregateCmc skips deleted accesses', () => {
      const a = counterpartyAccess({ deleted: { reason: 'revoked' } });
      const out = Contact.aggregateCmc([a], [acceptEvent()], SCOPE);
      assert.deepEqual(out, []);
    });

    it('[CTM4] aggregateCmc skips accesses without cmc.role === counterparty', () => {
      const a = counterpartyAccess({ cmcOverrides: { role: 'requester' } });
      const out = Contact.aggregateCmc([a], [], SCOPE);
      assert.deepEqual(out, []);
    });

    it('[CTM5] aggregateCmc builds one Contact + one relationship from one access', () => {
      const a = counterpartyAccess();
      const out = Contact.aggregateCmc([a], [acceptEvent()], SCOPE);
      assert.equal(out.length, 1);
      const c = out[0];
      assert.equal(c.counterparty.username, 'drandy');
      assert.equal(c.counterparty.host, 'demo.datasafe.dev');
      assert.equal(c.kind, 'person');
      assert.equal(c.cmcRelationships.length, 1);
      const rel = c.cmcRelationships[0];
      assert.equal(rel.accessId, 'acc-cp-1');
      assert.equal(rel.acceptEventId, 'evt-accept-1');
      assert.equal(rel.counterpartyApiEndpoint, 'https://abctoken@drandy.demo.datasafe.dev/');
      assert.equal(rel.appCode, 'hds-collector');
      assert.deepEqual(rel.features, { chat: true, systemMessaging: true });
      assert.equal(rel.acceptedAt, 1716000000);
      // localChatStreamId derives from the relationship's real scope (the
      // remote chat stream's scope), not the generic patient app scope.
      assert.equal(rel.localChatStreamId, ':_cmc:apps:hds-collector:foo:chats:drandy--demo-datasafe-dev');
      // aggregator populates accessObjects too
      assert.equal(c.accessObjects.length, 1);
      assert.equal(c.accessObjects[0].id, 'acc-cp-1');
    });

    it('[CTM5b] localChatStreamId prefers the server-granted :chats: contribute permission', () => {
      const granted = ':_cmc:apps:hds-collector:app-x:chats:drandy--demo-datasafe-dev';
      const a = counterpartyAccess({
        permissions: [
          { streamId: 'health', level: 'read' },
          { streamId: granted, level: 'contribute' }
        ]
      });
      const out = Contact.aggregateCmc([a], [acceptEvent()], SCOPE);
      assert.equal(out[0].cmcRelationships[0].localChatStreamId, granted);
    });

    it('[CTM5c] chatEventInfos classifies by content.from within the local chat stream', () => {
      const a = counterpartyAccess();
      const c = Contact.aggregateCmc([a], [acceptEvent()], SCOPE)[0];
      const local = c.cmcRelationships[0].localChatStreamId;
      // outgoing trigger: no `from` → me
      assert.deepEqual(c.chatEventInfos({ streamIds: [local], content: { content: 'hi' } }), { source: 'me' });
      // delivered incoming: plugin-stamped `from` → contact
      assert.deepEqual(c.chatEventInfos({ streamIds: [local], content: { from: { username: 'drandy' }, content: 'hi' } }), { source: 'contact' });
      // unrelated stream → unknown
      assert.deepEqual(c.chatEventInfos({ streamIds: ['other'], content: {} }), { source: 'unknown' });
    });

    it('[CTM6] aggregateCmc groups multiple accesses from the same counterparty into one Contact', () => {
      const a1 = counterpartyAccess({ id: 'acc-cp-1' });
      const a2 = counterpartyAccess({ id: 'acc-cp-2', permissions: [{ streamId: 'sleep', level: 'read' }] });
      const out = Contact.aggregateCmc([a1, a2], [acceptEvent()], SCOPE);
      assert.equal(out.length, 1);
      assert.equal(out[0].cmcRelationships.length, 2);
    });

    it('[CTM7] aggregateCmc puts different counterparties into different Contacts', () => {
      const a1 = counterpartyAccess({ id: 'acc-cp-1' });
      const a2 = counterpartyAccess({
        id: 'acc-cp-2',
        counterpartyOverrides: { username: 'drother', host: 'demo.datasafe.dev' }
      });
      const out = Contact.aggregateCmc([a1, a2], [], SCOPE);
      assert.equal(out.length, 2);
    });

    it('[CTM8] aggregateCmc marks bridge contacts as kind=service', () => {
      const a = counterpartyAccess({
        cmcOverrides: { appCode: 'hds-bridge-mira', features: { chat: false } },
        counterpartyOverrides: { username: 'bridgemiratest', host: 'demo.datasafe.dev' }
      });
      const out = Contact.aggregateCmc([a], [], SCOPE);
      assert.equal(out.length, 1);
      assert.equal(out[0].kind, 'service');
      assert.equal(out[0].counterparty.username, 'bridgemiratest');
    });

    it('[CTM9] aggregateCmc tolerates missing accept events (acceptedAt: null)', () => {
      const a = counterpartyAccess();
      const out = Contact.aggregateCmc([a], [], SCOPE);
      assert.equal(out.length, 1);
      assert.equal(out[0].cmcRelationships[0].acceptedAt, null);
      assert.equal(out[0].cmcRelationships[0].acceptEventId, null);
    });

    it('[CTMA] aggregateCmc drops ghost accept events (Q-C2): accepts without matching access', () => {
      const out = Contact.aggregateCmc([], [acceptEvent()], SCOPE);
      assert.deepEqual(out, []);
    });

    it('[CTMB] cmcAllPermissions dedupes across relationships', () => {
      const a1 = counterpartyAccess({
        id: 'a1',
        permissions: [{ streamId: 'health', level: 'read' }, { streamId: 'sleep', level: 'read' }]
      });
      const a2 = counterpartyAccess({
        id: 'a2',
        permissions: [{ streamId: 'sleep', level: 'read' }, { streamId: 'mood', level: 'contribute' }]
      });
      const out = Contact.aggregateCmc([a1, a2], [], SCOPE);
      const perms = out[0].cmcAllPermissions;
      assert.equal(perms.length, 3);
      assert.deepEqual(perms.map(p => p.streamId).sort(), ['health', 'mood', 'sleep']);
    });

    it('[CTMC] cmcChatStreams only includes chat-enabled relationships', () => {
      const a1 = counterpartyAccess({
        id: 'a1',
        cmcOverrides: { role: 'counterparty', appCode: 'hds-collector', features: { chat: true, systemMessaging: false }, counterparty: { username: 'drandy', host: 'demo.datasafe.dev', apiEndpoint: 'https://t@drandy.x/', remoteChatStreamId: 'r1', remoteCollectorStreamId: 'c1' } }
      });
      const a2 = counterpartyAccess({
        id: 'a2',
        cmcOverrides: { role: 'counterparty', appCode: 'hds-collector', features: { chat: false }, counterparty: { username: 'drandy', host: 'demo.datasafe.dev', apiEndpoint: 'https://t@drandy.x/', remoteChatStreamId: null, remoteCollectorStreamId: null } }
      });
      const out = Contact.aggregateCmc([a1, a2], [], SCOPE);
      const streams = out[0].cmcChatStreams;
      assert.equal(streams.length, 1);
      assert.equal(streams[0].read, 'r1');
      assert.equal(streams[0].accessId, 'a1');
    });
  });

  describe('[CTDE] Derived CMC-only getters', function () {
    function bareContact (relsCount = 1, acceptedAt = 1700000000, appCode = 'hds-collector', chat = false) {
      const c = new Contact('u', 'U');
      for (let i = 0; i < relsCount; i++) {
        c.cmcRelationships.push({
          accessId: 'a' + i,
          acceptEventId: 'evt' + i,
          counterparty: { username: 'u', host: 'h' },
          counterpartyApiEndpoint: null,
          remoteChatStreamId: null,
          remoteCollectorStreamId: null,
          localChatStreamId: 'local',
          appCode,
          features: { chat, systemMessaging: false },
          grantedPermissions: [{ streamId: 'health', level: 'read' }],
          acceptedAt,
          hdsFormSpec: null
        });
      }
      return c;
    }

    it('[CTDS] status: Active when any acceptedAt, Incoming when relationships exist without acceptedAt, null otherwise', () => {
      assert.equal(bareContact(1, 1700000000).status, 'Active');
      assert.equal(bareContact(1, null).status, 'Incoming');
      assert.equal(bareContact(0).status, null);
    });

    it('[CTDH] hasChat reflects any chat-enabled relationship', () => {
      assert.equal(bareContact(1, 1700000000, 'hds-collector', true).hasChat, true);
      assert.equal(bareContact(1, 1700000000, 'hds-collector', false).hasChat, false);
    });

    it('[CTDA] appStreamIds returns distinct appCodes', () => {
      const c = new Contact('u', 'U');
      c.cmcRelationships.push({ appCode: 'hds-collector' });
      c.cmcRelationships.push({ appCode: 'hds-collector' });
      c.cmcRelationships.push({ appCode: 'hds-bridge-mira' });
      assert.deepEqual(c.appStreamIds.sort(), ['hds-bridge-mira', 'hds-collector']);
    });

    it('[CTDI] isActive ↔ any relationship has acceptedAt', () => {
      assert.equal(bareContact(1, 1700000000).isActive, true);
      assert.equal(bareContact(1, null).isActive, false);
    });
  });
});
