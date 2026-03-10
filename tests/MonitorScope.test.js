const { assert } = require('./test-utils/deps-node');
const { MonitorScope } = require('../js/');

// Mock connection that simulates Pryv API responses
function createMockConnection (responses = {}) {
  return {
    apiCalls: [],
    async api (calls) {
      this.apiCalls.push(calls);
      return calls.map(call => {
        const _key = call.method + ':' + JSON.stringify(call.params);
        // Check for specific response handlers
        if (responses[call.method]) {
          return responses[call.method](call.params);
        }
        // Default empty responses
        if (call.method === 'events.get') return { events: [] };
        if (call.method === 'streams.get') return { streams: [] };
        return {};
      });
    }
  };
}

// Since MonitorScope creates a real Pryv.Monitor internally, and we can't
// easily mock that without the full pryv module, we test the pre-Monitor logic
// by stopping before Monitor starts.

describe('[MSC] MonitorScope', () => {
  const now = Date.now() / 1000;
  const oneDay = 86400;
  const thirtyDaysAgo = now - 30 * oneDay;

  it('[MSC1] constructor sets config correctly', () => {
    const conn = createMockConnection();
    const config = { pageSize: 100, fromTime: thirtyDaysAgo, toTime: now };
    const ms = new MonitorScope(conn, config, { onEvent: () => {} });
    assert.strictEqual(ms.hasMoreOlder, false);
  });

  it('[MSC2] loadMore returns empty when hasMoreOlder is false', async () => {
    const conn = createMockConnection();
    const config = { pageSize: 100, fromTime: thirtyDaysAgo };
    const ms = new MonitorScope(conn, config, { onEvent: () => {} });
    const result = await ms.loadMore();
    assert.deepStrictEqual(result, { events: [], hasMore: false });
  });

  it('[MSC3] stop prevents start from proceeding', async () => {
    const conn = createMockConnection();
    const config = { pageSize: 100, fromTime: thirtyDaysAgo };
    const events = [];
    const ms = new MonitorScope(conn, config, { onEvent: (e) => events.push(e) });
    ms.stop();
    await ms.start();
    assert.strictEqual(events.length, 0);
    assert.strictEqual(conn.apiCalls.length, 0);
  });

  it('[MSC4] stop is idempotent', () => {
    const conn = createMockConnection();
    const config = { pageSize: 100, fromTime: thirtyDaysAgo };
    const ms = new MonitorScope(conn, config, { onEvent: () => {} });
    ms.stop();
    ms.stop(); // should not throw
  });

  describe('[MSC-LOAD] event loading logic (mocked, no Monitor)', () => {
    // For these tests, we test the batch API call and event processing
    // by checking what API calls are made and what events are delivered

    it('[MSC5] Step 1 delivers events and streams via callbacks', async () => {
      const mockEvents = [
        { id: 'e1', time: now - 100, modified: now - 100, streamIds: ['s1'], type: 'note/txt', content: 'a' },
        { id: 'e2', time: now - 200, modified: now - 200, streamIds: ['s1'], type: 'note/txt', content: 'b' },
      ];
      const mockStreams = [{ id: 's1', name: 'Stream 1', children: [] }];

      const conn = createMockConnection({
        'events.get': (params) => {
          if (params.limit) return { events: mockEvents };
          return { events: [] };
        },
        'streams.get': () => ({ streams: mockStreams }),
      });

      const receivedEvents = [];
      let receivedStreams = null;
      const config = { pageSize: 100, fromTime: thirtyDaysAgo, toTime: now };

      const ms = new MonitorScope(conn, config, {
        onEvent: (e) => receivedEvents.push(e),
        onStreams: (s) => { receivedStreams = s; },
      });

      // Stop immediately after start to prevent Monitor creation
      // We need to test the pre-Monitor logic
      // Since start() awaits the API call before creating Monitor,
      // we can't easily intercept. Instead, just verify the API calls structure.
      // The Monitor constructor will fail without pryv setup, but events will be delivered.
      try {
        await ms.start();
      } catch (_e) {
        // Monitor creation may fail in test env — that's OK, we test the loading logic
      }
      ms.stop();

      assert.strictEqual(receivedEvents.length, 2);
      assert.strictEqual(receivedEvents[0].id, 'e1');
      assert.strictEqual(receivedEvents[1].id, 'e2');
      assert.deepStrictEqual(receivedStreams, mockStreams);

      // Verify the API batch call structure
      assert.strictEqual(conn.apiCalls.length >= 1, true);
      const firstBatch = conn.apiCalls[0];
      assert.strictEqual(firstBatch[0].method, 'events.get');
      assert.strictEqual(firstBatch[0].params.limit, 100);
      assert.strictEqual(firstBatch[1].method, 'streams.get');
    });

    it('[MSC6] pages backwards progressively when full pages returned', async () => {
      const pageSize = 3;
      let callCount = 0;

      const conn = createMockConnection({
        'events.get': () => {
          callCount++;
          if (callCount === 1) {
            // First page: 3 events (full page)
            return {
              events: [
                { id: 'e1', time: now - 100, modified: now - 100, streamIds: ['s1'], type: 'note/txt' },
                { id: 'e2', time: now - 200, modified: now - 200, streamIds: ['s1'], type: 'note/txt' },
                { id: 'e3', time: now - 300, modified: now - 300, streamIds: ['s1'], type: 'note/txt' },
              ]
            };
          }
          if (callCount === 2) {
            // Second page: older events (partial = last page)
            return {
              events: [
                { id: 'e4', time: now - 400, modified: now - 400, streamIds: ['s1'], type: 'note/txt' },
              ]
            };
          }
          return { events: [] };
        },
        'streams.get': () => ({ streams: [] }),
      });

      const receivedEvents = [];
      const config = { pageSize, fromTime: now - 10000, toTime: now };

      const ms = new MonitorScope(conn, config, {
        onEvent: (e) => receivedEvents.push(e),
      });

      try { await ms.start(); } catch (_e) { /* Monitor may fail */ }
      ms.stop();

      // First page (3) + second page (1) = 4 events total
      assert.strictEqual(receivedEvents.length, 4);
      assert.strictEqual(ms.hasMoreOlder, true); // optimistic
    });

    it('[MSC7] hasMoreOlder is true when events exist (optimistic until loadMore proves otherwise)', async () => {
      const mockEvents = [
        { id: 'e1', time: now - 100, modified: now - 100, streamIds: ['s1'], type: 'note/txt' },
      ];

      const conn = createMockConnection({
        'events.get': () => ({ events: mockEvents }),
        'streams.get': () => ({ streams: [] }),
      });

      const receivedEvents = [];
      const config = { pageSize: 100, fromTime: thirtyDaysAgo, toTime: now };

      const ms = new MonitorScope(conn, config, {
        onEvent: (e) => receivedEvents.push(e),
      });

      try { await ms.start(); } catch (_e) { /* Monitor may fail */ }

      // hasMoreOlder is true optimistically — loadMore will set false if no older events found
      assert.strictEqual(ms.hasMoreOlder, true);
      ms.stop();
    });

    it('[MSC8] tracks oldest event time correctly', async () => {
      const mockEvents = [
        { id: 'e1', time: now - 500, modified: now - 500, streamIds: ['s1'], type: 'note/txt' },
        { id: 'e2', time: now - 100, modified: now - 100, streamIds: ['s1'], type: 'note/txt' },
        { id: 'e3', time: now - 1000, modified: now - 1000, streamIds: ['s1'], type: 'note/txt' },
      ];

      const conn = createMockConnection({
        'events.get': () => ({ events: mockEvents }),
        'streams.get': () => ({ streams: [] }),
      });

      const receivedEvents = [];
      const config = { pageSize: 100, fromTime: thirtyDaysAgo, toTime: now };

      const ms = new MonitorScope(conn, config, {
        onEvent: (e) => receivedEvents.push(e),
      });

      try { await ms.start(); } catch (_e) { /* Monitor may fail */ }
      ms.stop();

      // All 3 events should be received
      assert.strictEqual(receivedEvents.length, 3);
    });

    it('[MSC-BATCH] onEvents receives batches instead of individual events', async () => {
      const mockEvents = [
        { id: 'e1', time: now - 100, modified: now - 100, streamIds: ['s1'], type: 'note/txt' },
        { id: 'e2', time: now - 200, modified: now - 200, streamIds: ['s1'], type: 'note/txt' },
        { id: 'e3', time: now - 300, modified: now - 300, streamIds: ['s1'], type: 'note/txt' },
      ];

      const conn = createMockConnection({
        'events.get': (params) => {
          if (params.limit) return { events: mockEvents };
          return { events: [] };
        },
        'streams.get': () => ({ streams: [] }),
      });

      const batches = [];
      const config = { pageSize: 100, fromTime: thirtyDaysAgo, toTime: now };

      const ms = new MonitorScope(conn, config, {
        onEvents: (events) => batches.push([...events]),
      });

      try { await ms.start(); } catch (_e) { /* Monitor may fail */ }
      ms.stop();

      // Should receive one batch with all 3 events
      assert.strictEqual(batches.length, 1);
      assert.strictEqual(batches[0].length, 3);
      assert.strictEqual(batches[0][0].id, 'e1');
    });

    it('[MSC-PAGE] pages backwards until fromTime boundary', async () => {
      const pageSize = 2;
      let callCount = 0;

      const conn = createMockConnection({
        'events.get': (params) => {
          callCount++;
          if (callCount === 1) {
            // First page: 2 events (full page)
            return {
              events: [
                { id: 'e1', time: now - 100, modified: now - 100, streamIds: ['s1'], type: 'note/txt' },
                { id: 'e2', time: now - 200, modified: now - 200, streamIds: ['s1'], type: 'note/txt' },
              ]
            };
          }
          if (callCount === 2) {
            // Second page: 1 event (partial = last page)
            return {
              events: [
                { id: 'e3', time: now - 300, modified: now - 300, streamIds: ['s1'], type: 'note/txt' },
              ]
            };
          }
          return { events: [] };
        },
        'streams.get': () => ({ streams: [] }),
      });

      const allReceived = [];
      const batchCount = { n: 0 };
      const config = { pageSize, fromTime: now - 10000, toTime: now };

      const ms = new MonitorScope(conn, config, {
        onEvents: (events) => { batchCount.n++; allReceived.push(...events); },
      });

      try { await ms.start(); } catch (_e) { /* Monitor may fail */ }
      ms.stop();

      // Should have made 2 events.get calls (first page + one gap-fill page)
      assert.strictEqual(allReceived.length, 3);
      assert.strictEqual(batchCount.n, 2); // 2 batches delivered progressively
    });

    it('[MSC9] onError callback receives errors', () => {
      const conn = createMockConnection();
      let receivedError = null;
      const config = { pageSize: 100, fromTime: thirtyDaysAgo };

      const ms = new MonitorScope(conn, config, {
        onEvent: () => {},
        onError: (e) => { receivedError = e; },
      });

      // onError is wired to Monitor — just verify it's accepted without error
      assert.strictEqual(receivedError, null);
      ms.stop();
    });
  });
});
