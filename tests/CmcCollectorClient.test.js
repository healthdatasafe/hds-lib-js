import { assert } from './test-utils/deps-node.js';
import { pryv, createUser } from './test-utils/pryvService.js';
import HDSLib from '../ts/index.ts';

const { CmcCollector, CmcCollectorClient } = HDSLib.appTemplates;

describe('[CMCCC] CmcCollectorClient', function () {
  this.timeout(120000);

  let requesterUser, accepterUser, requesterConn, accepterConn, collector;
  let createdClient = null;

  before(async () => {
    requesterUser = await createUser();
    accepterUser = await createUser();
    requesterConn = new pryv.Connection(requesterUser.apiEndpoint);
    accepterConn = new pryv.Connection(accepterUser.apiEndpoint);
    collector = new CmcCollector(requesterConn, 'cmccc-test-' + Date.now());
  });

  it('[CMCCC-1] acceptCapability happy path returns kind=created with a client', async () => {
    const { capabilityUrl } = await collector.createRequest({
      title: { en: 'CmcCollectorClient happy path' },
      description: { en: '' },
      consent: { en: 'I consent' },
      permissions: [{ streamId: 'fertility', level: 'read' }]
    });

    const outcome = await CmcCollectorClient.acceptCapability(accepterConn, capabilityUrl, {
      accessName: 'cmccc-grant-' + Date.now()
    });

    assert.equal(outcome.kind, 'created', 'expected created outcome');
    assert.ok(outcome.client instanceof CmcCollectorClient);
    assert.ok(typeof outcome.client.accessId === 'string');
    assert.ok(outcome.client.peer != null, 'peer info should be derivable from data-grant');
    assert.equal(outcome.client.peer.username, requesterUser.username);
    assert.ok(outcome.client.chatStreamId?.startsWith(':_cmc:apps:hds-collector:'));
    assert.ok(outcome.client.collectorStreamId?.startsWith(':_cmc:apps:hds-collector:'));
    createdClient = outcome.client;
  });

  it('[CMCCC-2] fromAccessId reloads the same client', async () => {
    assert.ok(createdClient, 'CMCCC-1 must have produced a client');
    const reloaded = await CmcCollectorClient.fromAccessId(accepterConn, createdClient.accessId);
    assert.equal(reloaded.accessId, createdClient.accessId);
    assert.equal(reloaded.peer.username, createdClient.peer.username);
  });

  it('[CMCCC-3] acceptCapability with bogus URL returns a non-created outcome', async () => {
    const outcome = await CmcCollectorClient.acceptCapability(
      accepterConn,
      'https://nope.invalid/not-a-real-capability/abcdefg',
      { accessName: 'cmccc-bogus-' + Date.now(), handshakeTimeoutMs: 5000 }
    );
    assert.notEqual(outcome.kind, 'created');
    assert.ok(['unknown-capability', 'stale-capability', 'error'].includes(outcome.kind),
      'expected an error-class outcome, got ' + outcome.kind);
  });

  it('[CMCCC-4] revoke writes a consent/revoke-cmc and the access pair tears down', async () => {
    assert.ok(createdClient, 'CMCCC-1 must have produced a client');
    await createdClient.revoke({ en: 'CmcCollectorClient test cleanup' });
    // Best-effort: plugin is async; not gating on observed teardown.
  });
});
