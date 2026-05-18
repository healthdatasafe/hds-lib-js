import { assert } from './test-utils/deps-node.js';
import HDSLib, { initHDSModel } from '../ts/index.ts';
import { helperNewAppAndUsers, helperNewInvite } from './test-utils/helpersAppTemplate.js';
const { CollectorClient } = HDSLib.appTemplates;

/**
 * Plan 56 — exercise every IncomingRequestOutcome.kind that handleIncomingRequest
 * can produce. The original bug (silent dedupe on second invite under one
 * collector — see plan 56 "Concrete reproduction") is covered by [APCC-3].
 */
describe('[APCC] AppClientAccount.handleIncomingRequest outcomes (Plan 56)', function () {
  this.timeout(60000);

  let env;
  before(async () => {
    env = await helperNewAppAndUsers('apcc-mgr', 'APCC Mgr', 'apcc-cli', 'APCC Cli');
    await initHDSModel();
  });

  it('[APCC-1] kind=created on first invite', async () => {
    const inv = await helperNewInvite(env.appManaging, env.appClient, 'APCC-1');
    assert.ok(inv.collectorClient, 'created path returns a CollectorClient');
    assert.equal(inv.collectorClient.status, 'Incoming');
  });

  it('[APCC-2] kind=in-incoming on re-click before accept', async () => {
    const inv = await helperNewInvite(env.appManaging, env.appClient, 'APCC-2');
    // Re-click same URL — same eventId — CC still Incoming.
    const out = await env.appClient.handleIncomingRequest(inv.inviteSharingData.apiEndpoint, inv.inviteSharingData.eventId);
    assert.equal(out.kind, 'in-incoming');
    assert.equal(out.collectorClient.key, inv.collectorClient.key);
  });

  it('[APCC-3] kind=event-mismatch on second invite under same collector (plan 56 reproduction)', async () => {
    const inv = await helperNewInvite(env.appManaging, env.appClient, 'APCC-3');
    // Doctor creates a SECOND invite under the same collector — second URL
    // carries the SAME apiEndpoint (shared probe access) but a DIFFERENT eventId.
    const invite2 = await inv.collector.createInvite('APCC-3 second invite', {});
    const share2 = await invite2.getSharingData();
    assert.equal(share2.apiEndpoint, inv.inviteSharingData.apiEndpoint, 'precondition: shared probe access');
    assert.notEqual(share2.eventId, inv.inviteSharingData.eventId, 'precondition: distinct eventIds');

    const out = await env.appClient.handleIncomingRequest(share2.apiEndpoint, share2.eventId);
    assert.equal(out.kind, 'event-mismatch');
    assert.equal(out.incomingEventId, share2.eventId);
    assert.equal(out.collectorClient.key, inv.collectorClient.key, 'returns the EXISTING CC');
    assert.equal(out.collectorClient.requesterEventId, inv.inviteSharingData.eventId, 'existing CC keeps its original eventId');
  });

  it('[APCC-4] kind=already-active on re-click after accept', async () => {
    const inv = await helperNewInvite(env.appManaging, env.appClient, 'APCC-4');
    await inv.collectorClient.accept();
    assert.equal(inv.collectorClient.status, 'Active', 'precondition: CC accepted');

    const out = await env.appClient.handleIncomingRequest(inv.inviteSharingData.apiEndpoint, inv.inviteSharingData.eventId);
    assert.equal(out.kind, 'already-active');
    assert.equal(out.collectorClient.key, inv.collectorClient.key);
  });

  it('[APCC-5] kind=in-terminal-state on re-click after refuse', async () => {
    const inv = await helperNewInvite(env.appManaging, env.appClient, 'APCC-5');
    await inv.collectorClient.refuse();
    assert.equal(inv.collectorClient.status, 'Refused', 'precondition: CC refused');

    const out = await env.appClient.handleIncomingRequest(inv.inviteSharingData.apiEndpoint, inv.inviteSharingData.eventId);
    assert.equal(out.kind, 'in-terminal-state');
    assert.equal(out.status, 'Refused');
    assert.equal(out.collectorClient.key, inv.collectorClient.key);
  });

  // [APCC-6] kind=key-collision-different-endpoint — defensive outcome only
  // reachable if the same access id maps to two different apiEndpoints across
  // invocations, which can't happen by construction with id-based keys.
  // Skipped intentionally: covered by the branch existing in source; no
  // reachable test path. Documented to avoid future "why no test?" confusion.

  it('[APCC-F1] CollectorClient.assertMatchesEventId throws on mismatch, no-op on match or undefined', async () => {
    const inv = await helperNewInvite(env.appManaging, env.appClient, 'APCC-F1');
    // No-op when undefined
    inv.collectorClient.assertMatchesEventId(undefined);
    // No-op when matching
    inv.collectorClient.assertMatchesEventId(inv.collectorClient.requesterEventId);
    // Throws on mismatch
    assert.throws(() => inv.collectorClient.assertMatchesEventId('bogusEventId'),
      /assertMatchesEventId/);
  });
});
