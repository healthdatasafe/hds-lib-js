import { assert } from './test-utils/deps-node.js';
import { pryv, createUser } from './test-utils/pryvService.js';
import HDSLib from '../ts/index.ts';

const { CmcBridgeAccess, CmcCollectorClient } = HDSLib.appTemplates;

describe('[CMCBA] CmcBridgeAccess', function () {
  this.timeout(120000);

  let bridgeUser, patientUser, bridgeConn, patientConn, bridge;
  let acceptedClient = null;

  before(async () => {
    bridgeUser = await createUser();
    patientUser = await createUser();
    bridgeConn = new pryv.Connection(bridgeUser.apiEndpoint);
    patientConn = new pryv.Connection(patientUser.apiEndpoint);
    bridge = new CmcBridgeAccess(bridgeConn, 'cmcba-bridge-' + Date.now());
  });

  it('[CMCBA-1] createPatientRequest returns capabilityUrl', async () => {
    const result = await bridge.createPatientRequest({
      title: { en: 'Bridge consent' },
      description: { en: 'Plan 59 Phase 4c smoke' },
      consent: { en: 'I consent to the bridge reading my fertility stream' },
      permissions: [{ streamId: 'fertility', level: 'read' }]
    });
    assert.ok(typeof result.capabilityUrl === 'string');
    assert.match(result.capabilityUrl, /^https:\/\//);

    // Patient accepts so we can exercise getPendingAccepts + scope-change.
    const outcome = await CmcCollectorClient.acceptCapability(patientConn, result.capabilityUrl, {
      accessName: 'cmcba-grant-' + Date.now()
    });
    assert.equal(outcome.kind, 'created');
    acceptedClient = outcome.client;
  });

  it('[CMCBA-2] getPendingAccepts surfaces the accept with data-grant apiEndpoint', async () => {
    assert.ok(acceptedClient, 'CMCBA-1 must have produced an accept');
    // Allow plugin propagation time — bridge inbox may not have it instantly.
    let entries = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      entries = await bridge.getPendingAccepts();
      if (entries.length >= 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(entries.length >= 1, 'expected at least one inbox accept');
    const entry = entries[0];
    assert.equal(entry.peer.username, patientUser.username);
    assert.match(entry.dataGrantApiEndpoint, /^https:\/\//);
  });

  it('[CMCBA-3] requestScopeChange writes consent/scope-request-cmc', async () => {
    assert.ok(acceptedClient, 'CMCBA-1 must have produced an accept');
    await bridge.requestScopeChange({
      accessId: acceptedClient.accessId,
      counterparty: { username: patientUser.username, host: 'demo.datasafe.dev' },
      newPermissions: [
        { streamId: 'fertility', level: 'read' },
        { streamId: 'steps', level: 'read' }
      ],
      rationale: { en: 'Bridge would also like steps data' }
    });
    // Best-effort: plugin propagates to patient's collectors stream;
    // not gating on patient-side observation here (covered in scenario 05 already).
  });

  it('[CMCBA-4] revokePatient writes consent/revoke-cmc', async () => {
    assert.ok(acceptedClient, 'CMCBA-1 must have produced an accept');
    await bridge.revokePatient({
      accessId: acceptedClient.accessId,
      counterparty: { username: patientUser.username, host: 'demo.datasafe.dev' },
      reason: { en: 'CMCBA test cleanup' }
    });
  });
});
