import { assert } from './test-utils/deps-node.js';
import { Contact } from '../ts/appTemplates/Contact.ts';
import { CollectorClient } from '../ts/appTemplates/CollectorClient.ts';

/**
 * Unit tests for access update request functionality.
 * Tests the data structures and Contact-level getters.
 * Integration tests (actual API calls) are in apptemplates.test.js.
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

function makeMockCollectorClient (overrides = {}) {
  return {
    status: 'Active',
    pendingUpdate: null,
    key: 'dr-alice:a-form1',
    requesterUsername: 'dr-alice',
    hasChatFeature: false,
    ...overrides
  };
}

describe('[AUPD] Access Update Requests', function () {
  // ---- Contact.hasPendingUpdate ---- //

  describe('[AUCT] Contact.hasPendingUpdate', function () {
    it('[AU01] should return false when no collectorClients', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      c.addSource(makeSource());
      assert.equal(c.hasPendingUpdate, false);
    });

    it('[AU02] should return false when no pending updates', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      c.addSource(makeSource());
      c.addCollectorClient(makeMockCollectorClient());
      assert.equal(c.hasPendingUpdate, false);
    });

    it('[AU03] should return true when a collectorClient has pendingUpdate', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      c.addSource(makeSource());
      c.addCollectorClient(makeMockCollectorClient({
        pendingUpdate: {
          eventId: 'evt-1',
          content: {
            version: 0,
            targetAccessName: 'dr-alice:a-form1',
            action: 'update-permissions',
            permissions: [{ streamId: 'diary', level: 'read' }]
          }
        }
      }));
      assert.equal(c.hasPendingUpdate, true);
    });
  });

  // ---- Contact.pendingUpdateClients ---- //

  describe('[AUPC] Contact.pendingUpdateClients', function () {
    it('[AU04] should return empty array when no pending updates', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      c.addCollectorClient(makeMockCollectorClient());
      c.addCollectorClient(makeMockCollectorClient({ key: 'dr-alice:a-form2' }));
      assert.equal(c.pendingUpdateClients.length, 0);
    });

    it('[AU05] should return only clients with pending updates', () => {
      const c = new Contact('dr-alice', 'Dr. Alice');
      c.addCollectorClient(makeMockCollectorClient());
      c.addCollectorClient(makeMockCollectorClient({
        key: 'dr-alice:a-form2',
        pendingUpdate: {
          eventId: 'evt-2',
          content: {
            version: 0,
            targetAccessName: 'dr-alice:a-form2',
            action: 'update-permissions',
            permissions: [{ streamId: 'diary', level: 'contribute' }]
          }
        }
      }));
      assert.equal(c.pendingUpdateClients.length, 1);
      assert.equal(c.pendingUpdateClients[0].key, 'dr-alice:a-form2');
    });
  });

  // ---- CollectorClient.pendingUpdate field ---- //

  describe('[AUCC] CollectorClient.pendingUpdate', function () {
    it('[AU06] should default to null', () => {
      // pendingUpdate is a plain field, tested via mock
      const cc = makeMockCollectorClient();
      assert.equal(cc.pendingUpdate, null);
    });

    it('[AU07] should hold update request data when set', () => {
      const updateReq = {
        eventId: 'evt-1',
        content: {
          version: 0,
          targetAccessName: 'dr-alice:a-form1',
          action: 'update-permissions',
          permissions: [
            { streamId: 'health', level: 'read' },
            { streamId: 'diary', level: 'contribute' }
          ],
          features: { chat: { type: 'user' } },
          message: 'I\'d like to also access your diary entries.'
        }
      };
      const cc = makeMockCollectorClient({ pendingUpdate: updateReq });
      assert.equal(cc.pendingUpdate.eventId, 'evt-1');
      assert.equal(cc.pendingUpdate.content.action, 'update-permissions');
      assert.equal(cc.pendingUpdate.content.permissions.length, 2);
      assert.equal(cc.pendingUpdate.content.message, 'I\'d like to also access your diary entries.');
      assert.deepEqual(cc.pendingUpdate.content.features, { chat: { type: 'user' } });
    });
  });

  // ---- AccessUpdateRequestContent structure ---- //

  describe('[AURC] AccessUpdateRequestContent schema', function () {
    it('[AU08] should validate minimal update request content', () => {
      const content = {
        version: 0,
        targetAccessName: 'dr-alice:a-form1',
        action: 'update-permissions',
        permissions: [{ streamId: 'health', level: 'manage' }]
      };
      assert.equal(content.version, 0);
      assert.equal(content.targetAccessName, 'dr-alice:a-form1');
      assert.equal(content.action, 'update-permissions');
      assert.equal(content.permissions.length, 1);
      assert.equal(content.permissions[0].streamId, 'health');
    });

    it('[AU09] should support add-feature action', () => {
      const content = {
        version: 0,
        targetAccessName: 'dr-alice:a-form1',
        action: 'add-feature',
        permissions: [{ streamId: 'health', level: 'read' }],
        features: { chat: { type: 'user' } },
        message: 'Adding chat capability'
      };
      assert.equal(content.action, 'add-feature');
      assert.ok(content.features.chat);
    });
  });

  // ---- Multiple contacts with mixed update states ---- //

  describe('[AUMX] Mixed contacts with updates', function () {
    it('[AU10] should correctly report updates across multiple contacts', () => {
      const alice = new Contact('dr-alice', 'Dr. Alice');
      alice.addSource(makeSource());
      alice.addCollectorClient(makeMockCollectorClient({
        pendingUpdate: {
          eventId: 'evt-1',
          content: { version: 0, targetAccessName: 'dr-alice:a-form1', action: 'update-permissions', permissions: [] }
        }
      }));

      const bob = new Contact('dr-bob', 'Dr. Bob');
      bob.addSource(makeSource({ remoteUsername: 'dr-bob', displayName: 'Dr. Bob' }));
      bob.addCollectorClient(makeMockCollectorClient({ key: 'dr-bob:a-form1', pendingUpdate: null }));

      assert.equal(alice.hasPendingUpdate, true);
      assert.equal(bob.hasPendingUpdate, false);
    });
  });
});
