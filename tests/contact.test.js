import { assert } from './test-utils/deps-node.js';
import { Contact } from '../ts/appTemplates/Contact.ts';

/**
 * Unit tests for Contact class — pure logic, no Pryv connection needed.
 */

// ---- Test helpers ---- //

function makeSource (overrides = {}) {
  return {
    remoteUsername: 'dr-alice',
    displayName: 'Dr. Alice',
    chatStreams: null,
    appStreamId: null,
    permissions: [{ streamId: 'health', level: 'read' }],
    status: 'Active',
    type: 'collector',
    accessId: 'acc-1',
    ...overrides
  };
}

function makeBridgeSource (overrides = {}) {
  return makeSource({
    remoteUsername: null,
    displayName: 'bridge-mira',
    chatStreams: null,
    appStreamId: 'bridge-mira-app',
    permissions: [{ streamId: '*', level: 'manage' }],
    status: 'active',
    type: 'bridge',
    accessId: 'acc-bridge-1',
    ...overrides
  });
}

describe('[CTCT] Contact class', function () {
  // ---- constructor & addSource ---- //

  describe('[CTCS] constructor & addSource', function () {
    it('[CTA1] should create empty contact', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      assert.equal(c.remoteUsername, 'dr-alice');
      assert.equal(c.displayName, 'Dr. Alice');
      assert.deepEqual(c.sources, []);
      assert.deepEqual(c.collectorClients, []);
      assert.deepEqual(c.invites, []);
      assert.deepEqual(c.accessObjects, []);
    });

    it('[CTA2] should add source and keep displayName when already better', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      const src = makeSource({ displayName: 'dr-alice' });
      c.addSource(src);
      assert.equal(c.sources.length, 1);
      assert.equal(c.displayName, 'Dr. Alice'); // kept — was already better
    });

    it('[CTA3] should upgrade displayName from username to real name', () => {
      const c = new Contact('dr-alice', 'dr-alice');
      c.addSource(makeSource({ displayName: 'Dr. Alice Martin' }));
      assert.equal(c.displayName, 'Dr. Alice Martin');
    });
  });

  // ---- addAccessObject ---- //

  describe('[CTAO] addAccessObject', function () {
    it('[CTA4] should add access objects and dedup by id', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      const a1 = { id: 'a1', permissions: [] };
      const a2 = { id: 'a2', permissions: [] };
      c.addAccessObject(a1);
      c.addAccessObject(a2);
      c.addAccessObject(a1); // duplicate
      assert.equal(c.accessObjects.length, 2);
    });
  });

  // ---- status getter ---- //

  describe('[CTST] status', function () {
    it('[CTA5] should return Active when any source is active', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ status: 'Incoming' }));
      c.addSource(makeSource({ status: 'Active', accessId: 'acc-2' }));
      assert.equal(c.status, 'Active');
    });

    it('[CTA6] should return Incoming when no active but has incoming', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ status: 'Incoming' }));
      c.addSource(makeSource({ status: 'Deactivated', accessId: 'acc-2' }));
      assert.equal(c.status, 'Incoming');
    });

    it('[CTA7] should return first source status as fallback', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ status: 'Refused' }));
      assert.equal(c.status, 'Refused');
    });

    it('[CTA8] should return null for empty contact', () => {
      const c = new Contact('u', 'U');
      assert.equal(c.status, null);
    });
  });

  // ---- chatStreams & hasChat ---- //

  describe('[CTCH] chatStreams & hasChat', function () {
    it('[CTA9] should return null when no source has chat', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource());
      assert.equal(c.chatStreams, null);
      assert.equal(c.hasChat, false);
    });

    it('[CTAA] should return chat from first source that has it', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource());
      c.addSource(makeSource({
        accessId: 'acc-2',
        chatStreams: { main: 'chat-dr', incoming: 'chat-dr-in' }
      }));
      assert.deepEqual(c.chatStreams, { main: 'chat-dr', incoming: 'chat-dr-in' });
      assert.equal(c.hasChat, true);
    });
  });

  // ---- appStreamIds ---- //

  describe('[CTAP] appStreamIds', function () {
    it('[CTAB] should return empty for collector-only contact', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource());
      assert.deepEqual(c.appStreamIds, []);
    });

    it('[CTAC] should collect unique appStreamIds', () => {
      const c = new Contact(null, 'bridge');
      c.addSource(makeBridgeSource({ appStreamId: 'app-1' }));
      c.addSource(makeBridgeSource({ appStreamId: 'app-1', accessId: 'acc-b2' })); // dup
      c.addSource(makeBridgeSource({ appStreamId: 'app-2', accessId: 'acc-b3' }));
      assert.deepEqual(c.appStreamIds, ['app-1', 'app-2']);
    });
  });

  // ---- allPermissions ---- //

  describe('[CTPM] allPermissions', function () {
    it('[CTAD] should aggregate permissions and dedup', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ permissions: [{ streamId: 'health', level: 'read' }] }));
      c.addSource(makeSource({
        accessId: 'acc-2',
        permissions: [
          { streamId: 'health', level: 'read' }, // dup
          { streamId: 'diary', level: 'contribute' }
        ]
      }));
      const perms = c.allPermissions;
      assert.equal(perms.length, 2);
      assert.deepEqual(perms[0], { streamId: 'health', level: 'read' });
      assert.deepEqual(perms[1], { streamId: 'diary', level: 'contribute' });
    });

    it('[CTAE] should skip Deactivated and Refused sources', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ status: 'Deactivated', permissions: [{ streamId: 'a', level: 'read' }] }));
      c.addSource(makeSource({ status: 'Refused', accessId: 'acc-2', permissions: [{ streamId: 'b', level: 'read' }] }));
      c.addSource(makeSource({ status: 'Active', accessId: 'acc-3', permissions: [{ streamId: 'c', level: 'read' }] }));
      assert.equal(c.allPermissions.length, 1);
      assert.equal(c.allPermissions[0].streamId, 'c');
    });
  });

  // ---- isActive, isPerson ---- //

  describe('[CTIA] isActive & isPerson', function () {
    it('[CTAF] isActive true when any source is Active', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ status: 'Deactivated' }));
      c.addSource(makeSource({ status: 'Active', accessId: 'acc-2' }));
      assert.equal(c.isActive, true);
    });

    it('[CTAG] isActive true for lowercase "active" (bridges)', () => {
      const c = new Contact(null, 'bridge');
      c.addSource(makeBridgeSource({ status: 'active' }));
      assert.equal(c.isActive, true);
    });

    it('[CTAH] isActive false when no active source', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ status: 'Deactivated' }));
      assert.equal(c.isActive, false);
    });

    it('[CTAI] isPerson true for username contacts, false for bridges', () => {
      const person = new Contact('dr-alice', 'Dr. Alice');
      const bridge = new Contact(null, 'bridge-mira');
      assert.equal(person.isPerson, true);
      assert.equal(bridge.isPerson, false);
    });
  });

  // ---- collectorSources / bridgeSources / accessIds ---- //

  describe('[CTFN] source filters & accessIds', function () {
    it('[CTAJ] should filter collector and bridge sources', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ type: 'collector', accessId: 'c1' }));
      c.addSource(makeSource({ type: 'bridge', accessId: 'b1' }));
      c.addSource(makeSource({ type: 'other', accessId: 'o1' }));
      assert.equal(c.collectorSources.length, 1);
      assert.equal(c.bridgeSources.length, 1);
    });

    it('[CTAK] should collect non-null accessIds', () => {
      const c = new Contact('u', 'U');
      c.addSource(makeSource({ accessId: 'a1' }));
      c.addSource(makeSource({ accessId: null }));
      c.addSource(makeSource({ accessId: 'a3' }));
      assert.deepEqual(c.accessIds, ['a1', 'a3']);
    });
  });

  // ---- stream cache & event filtering ---- //

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

    it('[CTAM] should match events in permitted streams and children', () => {
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

    it('[CTAO2] should skip deleted accesses', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', deleted: true, permissions: [{ streamId: 'health', level: 'read' }] });
      c.initStreamCache(streamsById);
      assert.equal(c.eventIsAccessible({ streamIds: ['health'] }), false);
    });

    it('[CTAP2] should handle events with no streamIds', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [{ streamId: 'health', level: 'read' }] });
      c.initStreamCache(streamsById);
      assert.equal(c.eventIsAccessible({}), false);
      assert.equal(c.eventIsAccessible({ streamIds: null }), false);
    });
  });

  // ---- eventIsFromContact ---- //

  describe('[CTEF] eventIsFromContact', function () {
    it('[CTAQ] should match events modified by contact access', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1' });
      c.addAccessObject({ id: 'a2' });
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a1' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'a2' }), true);
      assert.equal(c.eventIsFromContact({ modifiedBy: 'other' }), false);
    });
  });

  // ---- sourceFromAccess (static) ---- //

  describe('[CTSF] sourceFromAccess', function () {
    it('[CTAR] should create bridge source from access with appStreamId', () => {
      const access = {
        id: 'acc-1',
        name: 'bridge-mira',
        permissions: [{ streamId: '*', level: 'manage' }],
        clientData: { appStreamId: 'bridge-mira-app' }
      };
      const src = Contact.sourceFromAccess(access);
      assert.equal(src.type, 'bridge');
      assert.equal(src.appStreamId, 'bridge-mira-app');
      assert.equal(src.displayName, 'bridge-mira');
      assert.equal(src.remoteUsername, null);
      assert.equal(src.status, 'active');
      assert.equal(src.accessId, 'acc-1');
    });

    it('[CTAS] should create "other" source for plain access', () => {
      const access = { id: 'acc-2', name: 'some-app', permissions: [] };
      const src = Contact.sourceFromAccess(access);
      assert.equal(src.type, 'other');
      assert.equal(src.appStreamId, null);
    });

    it('[CTAT] should handle deleted access', () => {
      const access = { id: 'acc-3', name: 'old', deleted: true, permissions: [] };
      const src = Contact.sourceFromAccess(access);
      assert.equal(src.status, 'Deleted');
    });

    it('[CTAU] should default displayName to Unknown', () => {
      const access = { id: 'acc-4', permissions: [] };
      const src = Contact.sourceFromAccess(access);
      assert.equal(src.displayName, 'Unknown');
    });
  });

  // ---- groupByContact (static) ---- //

  describe('[CTGR] groupByContact', function () {
    it('[CTAV] should group sources by username', () => {
      const sources = [
        makeSource({ remoteUsername: 'dr-alice', accessId: 'a1', displayName: 'dr-alice' }),
        makeSource({ remoteUsername: 'dr-bob', accessId: 'a2', displayName: 'Dr. Bob' }),
        makeSource({ remoteUsername: 'dr-alice', accessId: 'a3', displayName: 'Dr. Alice Martin' })
      ];
      const contacts = Contact.groupByContact(sources);
      assert.equal(contacts.length, 2);
      const alice = contacts.find(c => c.remoteUsername === 'dr-alice');
      assert.equal(alice.sources.length, 2);
      // displayName upgrades from username to real name via addSource logic
      assert.equal(alice.displayName, 'Dr. Alice Martin');
    });

    it('[CTAW] should create standalone contacts for null username (bridges)', () => {
      const sources = [
        makeBridgeSource({ displayName: 'bridge-mira', accessId: 'b1' }),
        makeBridgeSource({ displayName: 'bridge-redcap', accessId: 'b2' })
      ];
      const contacts = Contact.groupByContact(sources);
      assert.equal(contacts.length, 2);
      contacts.forEach(c => assert.equal(c.remoteUsername, null));
    });

    it('[CTAX] should mix person and bridge contacts', () => {
      const sources = [
        makeSource({ remoteUsername: 'dr-alice', accessId: 'a1' }),
        makeBridgeSource({ accessId: 'b1' }),
        makeSource({ remoteUsername: 'dr-alice', accessId: 'a2' })
      ];
      const contacts = Contact.groupByContact(sources);
      assert.equal(contacts.length, 2); // 1 alice + 1 bridge
      const alice = contacts.find(c => c.remoteUsername === 'dr-alice');
      assert.equal(alice.sources.length, 2);
    });

    it('[CTAY] should return empty array for empty input', () => {
      assert.deepEqual(Contact.groupByContact([]), []);
    });
  });

  // ---- addInvite (doctor side) ---- //

  describe('[CTIV] addInvite', function () {
    it('[CTAZ] should add invite and dedup by key', () => {
      const c = new Contact('patient1', 'Patient 1');
      const collector1 = { id: 'col1' };
      const invite1 = { key: 'inv1' };
      const invite2 = { key: 'inv2' };
      c.addInvite(collector1, invite1);
      c.addInvite(collector1, invite1); // dup
      c.addInvite(collector1, invite2);
      assert.equal(c.invites.length, 2);
    });
  });

  // ---- addCollectorClient ---- //

  describe('[CTCC] addCollectorClient', function () {
    it('[CTB1] should dedup by reference', () => {
      const c = new Contact('u', 'U');
      const cc = { status: 'Active' };
      c.addCollectorClient(cc);
      c.addCollectorClient(cc); // same ref
      assert.equal(c.collectorClients.length, 1);
    });
  });
});
