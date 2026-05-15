import { assert } from './test-utils/deps-node.js';
import { pryv, createUser } from './test-utils/pryvService.js';
import HDSLib, { cmcSystem } from '../ts/index.ts';

const { CmcCollector, CmcCollectorClient } = HDSLib.appTemplates;

describe('[CMCSY] cmcSystem alerts + acks', function () {
  this.timeout(120000);

  let requesterUser, accepterUser, requesterConn, accepterConn;
  let requesterScope, requesterPeerSlug, accepterScope, accepterPeerSlug;

  before(async () => {
    requesterUser = await createUser();
    accepterUser = await createUser();
    requesterConn = new pryv.Connection(requesterUser.apiEndpoint);
    accepterConn = new pryv.Connection(accepterUser.apiEndpoint);

    const collector = new CmcCollector(requesterConn, 'cmcsy-test-' + Date.now());
    const { capabilityUrl } = await collector.createRequest({
      title: { en: 'CMCSY' },
      description: { en: '' },
      consent: { en: 'consent' },
      permissions: [{ streamId: 'fertility', level: 'read' }]
    });
    const outcome = await CmcCollectorClient.acceptCapability(accepterConn, capabilityUrl, {
      accessName: 'cmcsy-grant-' + Date.now()
    });
    assert.equal(outcome.kind, 'created');
    const client = outcome.client;

    // Patient-side scope + peer slug.
    accepterScope = client.collectorScopeStreamId;
    accepterPeerSlug = client.peerSlug;
    // Requester-side scope + peer slug (mirror).
    requesterScope = collector.collectorStreamId;
    requesterPeerSlug = pryv.cmc.counterpartySlug({
      username: accepterUser.username, host: 'demo.datasafe.dev'
    });
  });

  it('[CMCSY-1] sendSystemAlert from requester delivers to accepter', async () => {
    const code = 'cmcsy-alert-' + Date.now();
    const sent = await cmcSystem.sendSystemAlert({
      connection: requesterConn,
      scopeStreamId: requesterScope,
      peerSlug: requesterPeerSlug,
      content: { code, title: { en: 'Test' }, body: { en: 'CMCSY-1 alert body' }, level: 'info' }
    });
    assert.ok(sent?.id, 'sent event should have an id');

    // Poll on accepter side until the alert lands.
    let received = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const events = await cmcSystem.getSystemEvents({
        connection: accepterConn,
        scopeStreamId: accepterScope,
        peerSlug: accepterPeerSlug,
        types: ['alert']
      });
      received = events.find((e) => e.content?.code === code);
      if (received) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(received, 'expected alert delivered to accepter side');
  });

  it('[CMCSY-2] sendSystemAck from accepter writes ack pointing to alert', async () => {
    // Get the alert id we just delivered (last alert received on accepter).
    const alerts = await cmcSystem.getSystemEvents({
      connection: accepterConn,
      scopeStreamId: accepterScope,
      peerSlug: accepterPeerSlug,
      types: ['alert']
    });
    assert.ok(alerts.length >= 1, 'must have at least one alert from CMCSY-1');
    const alertEventId = alerts[0].id;

    const ack = await cmcSystem.sendSystemAck({
      connection: accepterConn,
      scopeStreamId: accepterScope,
      peerSlug: accepterPeerSlug,
      content: {
        ackId: 'cmcsy-ack-' + Date.now(),
        alertEventId,
        note: { en: 'ack from CMCSY-2' }
      }
    });
    assert.ok(ack?.id);
  });
});
