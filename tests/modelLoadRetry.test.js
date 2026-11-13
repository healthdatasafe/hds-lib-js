import { assert } from './test-utils/deps-node.js';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';

/**
 * HDSModel.load retries a transient failure (B-2026-11-02-25): the network, a 5xx, a page that is not JSON (a host's
 * HTML error page, seen from model.datasafe.dev in CI). A 4xx throws at once.
 */
describe('[MLR] HDSModel.load retries a transient failure', () => {
  const pack = { items: { 'body-weight': { label: { en: 'Body weight' } } }, streams: [], eventTypes: { types: {}, extras: {} } };
  const realFetch = globalThis.fetch;
  const realDelays = HDSModel.loadRetryDelaysMs;
  let answers;
  let calls;

  const json = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  const html = (status) => ({ ok: status < 400, status, text: async () => '<!DOCTYPE html><html>error</html>' });

  beforeEach(() => {
    calls = 0;
    HDSModel.loadRetryDelaysMs = [0, 0];
    globalThis.fetch = async () => {
      const next = answers[calls++];
      if (next instanceof Error) throw next;
      return next;
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    HDSModel.loadRetryDelaysMs = realDelays;
  });

  it('[MLR1] a network error, a 502 and an HTML page are retried', async () => {
    answers = [new TypeError('fetch failed'), html(502), html(200), json(pack)];
    HDSModel.loadRetryDelaysMs = [0, 0, 0];
    const model = new HDSModel('https://model.example/pack.json');
    await model.load();
    assert.equal(calls, 4);
    assert.equal(model.modelData.items['body-weight'].key, 'body-weight');
  });

  it('[MLR2] gives up after the last retry, saying why', async () => {
    answers = [html(503), html(503), html(503)];
    const model = new HDSModel('https://model.example/pack.json');
    await assert.rejects(() => model.load(), /Cannot load the data model from https:\/\/model.example\/pack.json/);
    assert.equal(calls, 3);
  });

  it('[MLR3] a 4xx throws at once', async () => {
    answers = [html(404), json(pack)];
    const model = new HDSModel('https://model.example/pack.json');
    await assert.rejects(() => model.load(), /HTTP 404/);
    assert.equal(calls, 1);
  });
});
