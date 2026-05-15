import { assert } from './test-utils/deps-node.js';
import { pryv, createUser } from './test-utils/pryvService.js';
import HDSLib from '../ts/index.ts';

const { CmcCollector, CmcCollectorClient, Contact } = HDSLib.appTemplates;

describe('[CMCCT] Contact CMC reader (Phase 4e)', function () {
  this.timeout(120000);

  let requesterUser, accepterUser, requesterConn, accepterConn;
  let createdAccessId = null;

  before(async () => {
    requesterUser = await createUser();
    accepterUser = await createUser();
    requesterConn = new pryv.Connection(requesterUser.apiEndpoint);
    accepterConn = new pryv.Connection(accepterUser.apiEndpoint);

    const collector = new CmcCollector(requesterConn, 'cmcct-test-' + Date.now());
    const { capabilityUrl } = await collector.createRequest({
      title: { en: 'Phase 4e' },
      description: { en: 'Contact reader smoke' },
      consent: { en: 'consent' },
      permissions: [{ streamId: 'fertility', level: 'read' }]
    });
    const outcome = await CmcCollectorClient.acceptCapability(accepterConn, capabilityUrl, {
      accessName: 'cmcct-grant-' + Date.now()
    });
    assert.equal(outcome.kind, 'created');
    createdAccessId = outcome.client.accessId;
  });

  it('[CMCCT-1] sourceFromCmcAccess returns a ContactSource for a CMC data-grant', async () => {
    const res = await accepterConn.api([{ method: 'accesses.get', params: {} }]);
    const accesses = res?.[0]?.accesses ?? [];
    const cmcAccess = accesses.find((a) => a.id === createdAccessId);
    assert.ok(cmcAccess, 'CMC access should be present');
    const source = Contact.sourceFromCmcAccess(cmcAccess);
    assert.ok(source, 'source should be built');
    assert.equal(source.remoteUsername, requesterUser.username);
    assert.equal(source.type, 'collector');
    assert.equal(source.status, 'Active');
    assert.ok(Array.isArray(source.permissions));
  });

  it('[CMCCT-2] sourceFromCmcAccess returns null for non-CMC accesses', () => {
    const fakeApp = { id: 'x1', name: 'app-x', permissions: [], clientData: {} };
    assert.equal(Contact.sourceFromCmcAccess(fakeApp), null);
  });

  it('[CMCCT-3] fromCmcAccesses builds Contact[] grouped by remote username', async () => {
    const res = await accepterConn.api([{ method: 'accesses.get', params: {} }]);
    const accesses = res?.[0]?.accesses ?? [];
    const contacts = Contact.fromCmcAccesses(accesses);
    assert.ok(contacts.length >= 1, 'should have at least one CMC contact');
    const c = contacts.find((x) => x.remoteUsername === requesterUser.username);
    assert.ok(c, 'contact for requester should exist');
    assert.equal(c.isPerson, true);
    assert.equal(c.isActive, true);
    assert.ok(c.accessIds.includes(createdAccessId));
  });

  it('[CMCCT-4] fromCmcAccesses skips non-CMC accesses', async () => {
    // Create a plain (non-CMC) app access on the accepter side.
    await accepterConn.api([{
      method: 'accesses.create',
      params: {
        name: 'cmcct-non-cmc-' + Date.now(),
        type: 'app',
        permissions: [{ streamId: 'fertility', level: 'read' }]
      }
    }]);
    const res = await accepterConn.api([{ method: 'accesses.get', params: {} }]);
    const accesses = res?.[0]?.accesses ?? [];
    const contacts = Contact.fromCmcAccesses(accesses);
    // The non-CMC app access should not produce a contact (its clientData has no cmc.role).
    const matchedNonCmc = contacts.find((c) => c.accessIds.some((id) => {
      const acc = accesses.find((a) => a.id === id);
      return acc?.clientData?.cmc?.role !== 'counterparty';
    }));
    assert.equal(matchedNonCmc, undefined, 'no contact built from non-CMC access');
  });
});
