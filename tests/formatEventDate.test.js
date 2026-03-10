const { assert } = require('./test-utils/deps-node');
const { formatEventDate, HDSSettings } = require('../js/');

// Mock connection
function createMockConnection (settingsEvents = []) {
  return {
    async api (calls) {
      return calls.map(call => {
        if (call.method === 'events.get') {
          if (call.params.streams[0] === 'test-stream') {
            return { events: settingsEvents };
          }
          return { events: [] };
        }
        return {};
      });
    },
    async apiOne (method, params, key) {
      const result = await this.api([{ method, params }]);
      return key ? result[0][key] : result[0];
    }
  };
}

describe('[FED] formatEventDate', function () {
  afterEach(() => {
    HDSSettings.unhook();
  });

  // 2024-01-15T12:00:00Z = 1705320000
  const timestamp = 1705320000;

  it('[FED1] returns ISO date when not hooked', () => {
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '2024-01-15');
  });

  it('[FED2] uses DD.MM.YYYY format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'DD.MM.YYYY' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '15.01.2024');
  });

  it('[FED3] uses DD/MM/YYYY format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'DD/MM/YYYY' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '15/01/2024');
  });

  it('[FED4] uses MM/DD/YYYY format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'MM/DD/YYYY' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '01/15/2024');
  });

  it('[FED5] uses YYYY-MM-DD format', async () => {
    const conn = createMockConnection([
      { id: 'ev1', type: 'settings/date-format', content: 'YYYY-MM-DD' }
    ]);
    await HDSSettings.hookToConnection(conn, 'test-stream');
    const result = formatEventDate(timestamp);
    assert.strictEqual(result, '2024-01-15');
  });
});
