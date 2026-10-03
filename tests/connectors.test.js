/* eslint-disable no-template-curly-in-string */
import { assert } from './test-utils/deps-node.js';
import {
  connectorCmcAppCode,
  connectorIdFromCmcAppCode,
  findConnectorAccesses,
  connectorAccessName,
  syncStatusLeafFor,
  connectorAccessRefusal,
  getOrCreateConnectorAccess,
  disconnectedStatusContent,
  markConnectorDisconnected,
  CONNECTOR_STATUS_TYPE
} from '../ts/appTemplates/connectors.ts';
import {
  expand,
  executeHook,
  executeDisconnect,
  UnresolvedVariableError,
  HookInitiateError
} from '../ts/appTemplates/hookExecutor.ts';
import { offerStreamsToCreate, offerStreamsToApiCalls } from '../ts/appTemplates/offerStreams.ts';

const NOW = 1_800_000_000;

/** Connection stub: answers each call with `handler(method, params)`, records the calls. */
function fakeConnection (handler) {
  const calls = [];
  return {
    calls,
    endpoint: 'https://alice.core.test/',
    async api (batch) {
      return batch.map(({ method, params }) => {
        calls.push({ method, params });
        return handler(method, params);
      });
    }
  };
}

describe('[CONN] connectors: matching rule', function () {
  it('[CN01] maps catalogue ids and CMC app codes both ways', () => {
    assert.equal(connectorCmcAppCode('bridge-mira'), 'hds-bridge-mira');
    assert.equal(connectorCmcAppCode('hds-webapp'), null);
    assert.equal(connectorIdFromCmcAppCode('hds-bridge-mira'), 'bridge-mira');
    assert.equal(connectorIdFromCmcAppCode('hds-collector'), null);
    assert.equal(connectorIdFromCmcAppCode(null), null);
    assert.equal(connectorAccessName('bridge-mira'), 'bridge-mira-connect');
    assert.equal(syncStatusLeafFor('bridge-mira'), 'sync-status-mira');
  });

  it('[CN02] finds CMC and legacy connections, newest first, skipping deleted, expired and others', () => {
    const cmc = (id, appCode, extra = {}) => ({ id, type: 'shared', name: 'hds-webapp-' + id, created: extra.created ?? 1, clientData: { cmc: { role: 'counterparty', appCode } }, ...extra });
    const accesses = [
      cmc('a1', 'hds-bridge-mira', { created: 10 }),
      cmc('a2', 'hds-bridge-mira', { created: 20 }),
      cmc('a3', 'hds-bridge-mira', { deleted: 5 }),
      cmc('a4', 'hds-bridge-mira', { expires: NOW - 1 }),
      cmc('a5', 'hds-collector'),
      cmc('a6', null),
      { id: 'l1', type: 'app', name: 'bridge-mira', created: 15 },
      { id: 'l2', type: 'shared', name: 'bridge-mira' },
      { id: 'l3', type: 'app', name: 'bridge-mira-connect' },
      // a counterparty access is never a legacy match, whatever its name
      { id: 'l4', type: 'app', name: 'bridge-mira', clientData: { cmc: { role: 'counterparty', appCode: 'hds-collector' } } }
    ];
    const found = findConnectorAccesses(accesses, 'bridge-mira', NOW);
    assert.deepEqual(found.map(f => [f.access.id, f.kind]), [['a2', 'cmc'], ['l1', 'legacy'], ['a1', 'cmc']]);
    assert.deepEqual(findConnectorAccesses(accesses, 'bridge-tempdrop', NOW), []);
  });
});

describe('[CONA] connectors: connector access', function () {
  const LEAF = 'sync-status-mira';

  it('[CA01] refuses anything but exactly read on the leaf (core-injected entries ignored)', () => {
    const ok = { id: 'x', type: 'app', permissions: [{ streamId: LEAF, level: 'read' }, { streamId: ':_system:account', level: 'none' }, { streamId: ':_audit:access-x', level: 'read' }, { feature: 'selfRevoke', setting: 'forbidden' }] };
    assert.equal(connectorAccessRefusal(ok, LEAF, NOW), null);
    assert.match(connectorAccessRefusal({ ...ok, type: 'shared' }, LEAF, NOW), /type is shared/);
    assert.equal(connectorAccessRefusal({ ...ok, expires: NOW - 1 }, LEAF, NOW), 'expired');
    assert.match(connectorAccessRefusal({ ...ok, permissions: [{ streamId: LEAF, level: 'manage' }] }, LEAF, NOW), /not exactly read/);
  });

  it('[CA02] reuses an exact access, never a broader one, and creates beside a refused one', async () => {
    const accesses = [
      { id: 'b', type: 'app', name: 'bridge-mira-connect', token: 'broad', permissions: [{ streamId: '*', level: 'manage' }] }
    ];
    const conn = fakeConnection((method, params) => {
      if (method === 'accesses.get') return { accesses };
      if (method === 'accesses.create') return { access: { id: 'n', name: params.name, token: 'fresh' } };
      throw new Error('unexpected ' + method);
    });
    const endpoint = await getOrCreateConnectorAccess(conn, 'bridge-mira', LEAF);
    assert.equal(endpoint, 'https://fresh@alice.core.test/');
    const create = conn.calls.find(c => c.method === 'accesses.create');
    assert.match(create.params.name, /^bridge-mira-connect-[0-9a-f]{4}$/);
    assert.deepEqual(create.params.permissions, [{ streamId: LEAF, level: 'read' }]);

    accesses.push({ id: 'e', type: 'app', name: 'bridge-mira-connect-00ff', apiEndpoint: 'https://exact@alice.core.test/', permissions: [{ streamId: LEAF, level: 'read' }] });
    assert.equal(await getOrCreateConnectorAccess(conn, 'bridge-mira', LEAF), 'https://exact@alice.core.test/');
  });
});

describe('[CONS] connectors: disconnected status', function () {
  const LEAF = 'sync-status-mira';

  it('[CS01] carries the schema fields only', () => {
    assert.deepEqual(disconnectedStatusContent(null), { status: 'disconnected' });
    assert.deepEqual(disconnectedStatusContent({ status: 'bogus', connectedAt: 1 }), { status: 'disconnected' });
    assert.deepEqual(disconnectedStatusContent({
      status: 'active',
      connectedAt: 1.5,
      lastRunAt: 2,
      lastSuccessAt: 3,
      syncedUntil: 4,
      stray: 'x',
      lastError: { class: 'upstream', code: 'Bad Code', at: 5 }
    }), { status: 'disconnected', connectedAt: 1, lastRunAt: 2, lastSuccessAt: 3, syncedUntil: 4, lastError: { class: 'upstream', at: 5 } });
  });

  it('[CS02] updates the latest event in place and trashes duplicates', async () => {
    const conn = fakeConnection((method) => {
      if (method === 'events.get') return { events: [{ id: 'e2', content: { status: 'active', connectedAt: 7 } }, { id: 'e1', content: {} }] };
      return {};
    });
    const content = await markConnectorDisconnected(conn, LEAF);
    assert.deepEqual(content, { status: 'disconnected', connectedAt: 7 });
    assert.deepEqual(conn.calls[0].params, { streams: [LEAF], types: [CONNECTOR_STATUS_TYPE], limit: 10 });
    assert.deepEqual(conn.calls[1], { method: 'events.update', params: { id: 'e2', update: { content } } });
    assert.deepEqual(conn.calls[2], { method: 'events.delete', params: { id: 'e1' } });
  });

  it('[CS03] creates the event when there is none, and throws on an API error', async () => {
    const conn = fakeConnection((method) => (method === 'events.get' ? { events: [] } : { event: { id: 'n' } }));
    await markConnectorDisconnected(conn, LEAF);
    assert.deepEqual(conn.calls[1], { method: 'events.create', params: { streamIds: [LEAF], type: CONNECTOR_STATUS_TYPE, content: { status: 'disconnected' } } });

    const failing = fakeConnection(() => ({ error: { id: 'forbidden' } }));
    await assert.rejects(markConnectorDisconnected(failing, LEAF), (e) => e.id === 'forbidden');
  });
});

describe('[CONH] connectors: hook executor', function () {
  const API_ENDPOINT = 'https://token-abc@alice.core.test/';
  const RETURN_URL = 'https://account.test/connect/return?nonce=abc';
  const miraHook = {
    initiate: { method: 'POST', url: 'https://bridge.test/mira/initiate', auth: 'ApiEndpoint ${apiEndpoint}', body: { returnUrl: '${returnUrl}', fixed: 1 }, openUrlField: 'openUrl' },
    open: { url: '${openUrl}', embed: false },
    resync: { initiate: { method: 'POST', url: 'https://bridge.test/mira/resync', auth: 'ApiEndpoint ${apiEndpoint}', body: { returnUrl: '${returnUrl}' } }, url: '${openUrl}', embed: false },
    disconnect: { method: 'POST', url: 'https://bridge.test/mira/revoke', auth: 'ApiEndpoint ${apiEndpoint}' }
  };
  const embedHook = { open: { url: 'https://files.test/cyclefem', embed: true, params: { apiEndpoint: '${apiEndpoint}', return: '${returnUrl}' } } };
  const ctx = (o = {}) => ({ apiEndpoint: API_ENDPOINT, returnUrl: RETURN_URL, mode: 'connect', embeddable: true, ...o });

  let realFetch;
  let fetched;
  function stubFetch (respond) {
    fetched = [];
    globalThis.fetch = async (url, init) => {
      fetched.push({ url, init });
      return respond(url, init);
    };
  }
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('[CH01] expand substitutes variables and names an unknown one', () => {
    assert.equal(expand('${a}/${b}', { a: 'x', b: 'y' }), 'x/y');
    assert.throws(() => expand('${nope}', {}), (e) => e instanceof UnresolvedVariableError && e.variable === 'nope');
  });

  it('[CH02] embeds with expanded params, or redirects when not embeddable', async () => {
    const embedded = await executeHook(embedHook, ctx());
    assert.equal(embedded.mode, 'iframe');
    assert.equal(embedded.allowedOrigin, 'https://files.test');
    assert.equal(new URL(embedded.finalUrl).searchParams.get('apiEndpoint'), API_ENDPOINT);
    assert.equal((await executeHook(embedHook, ctx({ embeddable: false }))).mode, 'redirect');
  });

  it('[CH03] runs initiate (auth + expanded body) and opens the returned URL', async () => {
    stubFetch(() => new Response(JSON.stringify({ openUrl: 'https://partner.test/oauth?x=1' }), { status: 200 }));
    const res = await executeHook(miraHook, ctx());
    assert.equal(fetched[0].url, 'https://bridge.test/mira/initiate');
    assert.equal(fetched[0].init.headers.Authorization, 'ApiEndpoint ' + API_ENDPOINT);
    assert.deepEqual(JSON.parse(fetched[0].init.body), { returnUrl: RETURN_URL, fixed: 1 });
    assert.equal(res.finalUrl, 'https://partner.test/oauth?x=1');
    assert.equal(res.mode, 'redirect');
  });

  it('[CH04] resync mode runs the resync initiate', async () => {
    stubFetch(() => new Response(JSON.stringify({ openUrl: 'https://partner.test/re' }), { status: 200 }));
    const res = await executeHook(miraHook, ctx({ mode: 'resync' }));
    assert.equal(fetched[0].url, 'https://bridge.test/mira/resync');
    assert.equal(res.finalUrl, 'https://partner.test/re');
  });

  it('[CH05] initiate failures are HookInitiateError', async () => {
    stubFetch(() => new Response('boom', { status: 500 }));
    await assert.rejects(executeHook(miraHook, ctx()), HookInitiateError);
    stubFetch(() => { throw new Error('connect refused'); });
    await assert.rejects(executeHook(miraHook, ctx()), (e) => e instanceof HookInitiateError && /connect refused/.test(e.reason));
    stubFetch(() => new Response(JSON.stringify({ other: 1 }), { status: 200 }));
    await assert.rejects(executeHook(miraHook, ctx()), /openUrl missing/);
  });

  it('[CH06] disconnect is best-effort: posts with auth, swallows HTTP and network errors, no-op without a step', async () => {
    stubFetch(() => new Response('', { status: 503 }));
    await executeDisconnect(miraHook, ctx());
    assert.equal(fetched[0].url, 'https://bridge.test/mira/revoke');
    assert.equal(fetched[0].init.method, 'POST');
    assert.equal(fetched[0].init.headers.Authorization, 'ApiEndpoint ' + API_ENDPOINT);
    stubFetch(() => { throw new Error('down'); });
    await executeDisconnect(miraHook, ctx());
    stubFetch(() => { throw new Error('must not be called'); });
    await executeDisconnect(embedHook, ctx());
    assert.equal(fetched.length, 0);
  });
});

describe('[CONO] connectors: offer streams', function () {
  const model = {
    data: {
      body: { name: 'Body', parentId: null },
      'body-temperature': { name: 'Temperature', parentId: 'body' },
      'body-temperature-basal': { name: 'Basal', parentId: 'body-temperature' },
      'sync-status': { name: 'Sync status', parentId: null },
      'sync-status-mira': { name: 'Mira', parentId: 'sync-status' }
    },
    getDataById (id) { return this.data[id] ?? null; },
    getParentsIds (id) {
      const out = [];
      let p = this.data[id]?.parentId;
      while (p != null) { out.unshift(p); p = this.data[p]?.parentId; }
      return out;
    }
  };

  it('[CO01] creates ancestors first, keeps granted unknown roots, skips system streams', () => {
    const streams = offerStreamsToCreate([
      { streamId: 'body-temperature-basal' },
      { streamId: 'sync-status-mira' },
      { streamId: 'bridge-mira' },
      { streamId: ':_cmc:apps:hds-patient' }
    ], model);
    assert.deepEqual(streams.map(s => s.id), ['body', 'body-temperature', 'body-temperature-basal', 'sync-status', 'sync-status-mira', 'bridge-mira']);
    const calls = offerStreamsToApiCalls(streams);
    assert.deepEqual(calls[0], { method: 'streams.create', params: { id: 'body', name: 'Body' } });
    assert.deepEqual(calls[1].params, { id: 'body-temperature', name: 'Temperature', parentId: 'body' });
  });
});
