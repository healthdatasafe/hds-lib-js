/**
 * Test runs only (loaded by `.mocharc.json`): a GET to the HDS services the tests read live (the model site, the demo
 * Pryv service) is retried on a network failure or a 5xx, so a short outage of one of them does not turn CI red.
 * The library's own fetches are left as they are: their failures are for users to see.
 * Tests that stub `globalThis.fetch` replace this wrapper for their duration and restore it after.
 */
const RETRY_DELAYS_MS = [500, 2000];
const realFetch = globalThis.fetch;

function isRetryable (input, init) {
  const method = (init?.method || input?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  const url = typeof input === 'string' ? input : (input?.url || String(input));
  try {
    const { hostname } = new URL(url);
    return hostname === 'datasafe.dev' || hostname.endsWith('.datasafe.dev');
  } catch {
    return false;
  }
}

globalThis.fetch = async function fetchWithTestRetry (input, init) {
  if (!isRetryable(input, init)) return realFetch(input, init);
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length;
    try {
      const response = await realFetch(input, init);
      if (response.status < 500 || last) return response;
    } catch (e) {
      if (last) throw e;
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
};
