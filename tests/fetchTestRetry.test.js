import { assert } from './test-utils/deps-node.js';
import { withTestRetry } from './test-utils/fetchRetry.js';

/**
 * The test runs' fetch wrapper (B-2026-11-26-9): a JSON GET to a datasafe.dev service that answers an HTML page is
 * retried like a 5xx, and the last try fails with the URL, the status and the start of the body.
 */
describe('[FTR] test fetch retry', () => {
  const URL_INFO = 'https://demo.datasafe.dev/reg/service/info';
  const asJson = { headers: { Accept: 'application/json' } };
  const json = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  const html = (status) => new Response('<!DOCTYPE html>\n<html>proxy error</html>', { status, headers: { 'content-type': 'text/html' } });

  function stub (answers) {
    const calls = [];
    const fetchImpl = async (input, init) => {
      const next = answers[calls.length];
      calls.push(input);
      if (next instanceof Error) throw next;
      return next;
    };
    return { calls, fetch: withTestRetry(fetchImpl, [0, 0]) };
  }

  it('[FTR1] an HTML page and a 502 are retried for a JSON GET', async () => {
    const s = stub([html(200), html(502), json()]);
    const res = await s.fetch(URL_INFO, asJson);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(s.calls.length, 3);
  });

  it('[FTR2] the last HTML answer fails with the URL, the status and the body start', async () => {
    const s = stub([html(200), html(404), html(404)]);
    await assert.rejects(() => s.fetch(URL_INFO, asJson), (e) => {
      assert.match(e.message, /demo\.datasafe\.dev\/reg\/service\/info/);
      assert.match(e.message, /HTTP 404 text\/html: <!DOCTYPE html> <html>proxy error/);
      return true;
    });
    assert.equal(s.calls.length, 3);
  });

  it('[FTR3] an HTML page is returned as is when JSON was not asked for', async () => {
    const s = stub([html(200)]);
    const res = await s.fetch('https://model.datasafe.dev/index.html');
    assert.equal(res.status, 200);
    assert.equal(s.calls.length, 1);
  });

  it('[FTR4] other hosts and other methods are not retried', async () => {
    const s = stub([html(502), html(502)]);
    assert.equal((await s.fetch('https://example.org/x', asJson)).status, 502);
    assert.equal((await s.fetch(URL_INFO, { ...asJson, method: 'POST' })).status, 502);
    assert.equal(s.calls.length, 2);
  });
});
