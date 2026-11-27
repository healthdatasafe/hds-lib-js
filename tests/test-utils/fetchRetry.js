/**
 * Test runs only (loaded by `.mocharc.json`): a GET to the HDS services the tests read live (the model site, the demo
 * Pryv service) is retried on a network failure, a 5xx, or a body that is not JSON when JSON was asked for (a proxy or
 * error page, B-2026-11-26-9), so a short outage of one of them does not turn CI red. When the last try still gets a
 * page that is not JSON, it fails with the URL, the status and the start of the body instead of a bare SyntaxError.
 * The library's own fetches are left as they are: their failures are for users to see.
 * Tests that stub `globalThis.fetch` replace this wrapper for their duration and restore it after.
 */
const RETRY_DELAYS_MS = [500, 2000];

function isRetryable (input, init) {
  const method = (init?.method || input?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  try {
    const { hostname } = new URL(urlOf(input));
    return hostname === 'datasafe.dev' || hostname.endsWith('.datasafe.dev');
  } catch {
    return false;
  }
}

function urlOf (input) {
  return typeof input === 'string' ? input : (input?.url || String(input));
}

function wantsJson (input, init) {
  const accept = new Headers(init?.headers || input?.headers).get('accept') || '';
  return accept.includes('json');
}

function isNotJson (response) {
  if (response.status === 204 || response.status === 304) return false;
  return !(response.headers.get('content-type') || '').includes('json');
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {number[]} [delaysMs]
 * @returns {typeof fetch}
 */
export function withTestRetry (fetchImpl, delaysMs = RETRY_DELAYS_MS) {
  return async function fetchWithTestRetry (input, init) {
    if (!isRetryable(input, init)) return fetchImpl(input, init);
    const json = wantsJson(input, init);
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= delaysMs.length;
      try {
        const response = await fetchImpl(input, init);
        const notJson = json && isNotJson(response);
        if (notJson && last) {
          const start = (await response.text()).slice(0, 120).replace(/\s+/g, ' ');
          throw new Error(`GET ${urlOf(input)}: expected JSON, got HTTP ${response.status} ${response.headers.get('content-type') || '(no content-type)'}: ${start}`);
        }
        if ((response.status < 500 && !notJson) || last) return response;
      } catch (e) {
        if (last) throw e;
      }
      await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
    }
  };
}

globalThis.fetch = withTestRetry(globalThis.fetch);
