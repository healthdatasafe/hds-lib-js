import { assert } from './test-utils/deps-node.js';
import { pryv, createUser } from './test-utils/pryvService.js';
import HDSLib from '../ts/index.ts';

const { CmcCollector } = HDSLib.appTemplates;

describe('[CMCC] CmcCollector', function () {
  this.timeout(60000);

  let requesterUser, accepterUser, collector;

  before(async () => {
    requesterUser = await createUser();
    accepterUser = await createUser();
    const conn = new pryv.Connection(requesterUser.apiEndpoint);
    collector = new CmcCollector(conn, 'cmcc-test-' + Date.now());
  });

  it('[CMCC-1] computes appScope + collectorStreamId from collectorId', () => {
    assert.equal(collector.appScope, ':_cmc:apps:hds-collector');
    assert.ok(collector.collectorStreamId.startsWith(':_cmc:apps:hds-collector:cmcc-test-'));
  });

  it('[CMCC-2] ensureStreams is idempotent', async () => {
    await collector.ensureStreams('Test cohort');
    await collector.ensureStreams('Test cohort'); // second call must not throw
  });

  it('[CMCC-3] createRequest writes a consent/request-cmc and returns capabilityUrl', async () => {
    const result = await collector.createRequest({
      title: { en: 'Test request' },
      description: { en: 'Phase 4a smoke' },
      consent: { en: 'I consent' },
      permissions: [{ streamId: 'fertility', level: 'read' }]
    });
    assert.ok(typeof result.eventId === 'string', 'eventId should be a string');
    assert.ok(typeof result.capabilityUrl === 'string', 'capabilityUrl should be a string');
    assert.match(result.capabilityUrl, /^https:\/\//, 'capabilityUrl should look like an https URL');
  });

  it('[CMCC-4] getConsentEvents returns the request just created', async () => {
    const events = await collector.getConsentEvents();
    assert.ok(Array.isArray(events));
    const requests = events.filter((e) => e.type === pryv.cmc.ET_REQUEST);
    assert.ok(requests.length >= 1, 'should find at least one consent/request-cmc event');
  });

  // [CMCC-5] revoke is exercised end-to-end in the CmcCollectorClient flow tests
  // (Phase 4b). Plugin schema requires `accessId`, which only exists once the
  // accepter has minted the data-grant access — not testable in isolation here.
});
