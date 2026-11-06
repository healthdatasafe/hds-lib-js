import { assert } from './test-utils/deps-node.js';
import {
  manifestPointerOf,
  parseAppManifest,
  loadAppManifest,
  clearAppManifests,
  vouchingEntry,
  needsManifest,
  describeApp,
  appIdentityOfAccess,
  manifestPointerOfAccess,
  mirrorAppPointerOnAcceptEvent
} from '../ts/appDescription.ts';

// The rule every HDS app names an app by (data-model APP-DESCRIPTION.md).

const URL_DYSNET = 'https://dysnet.org/hds/app-manifest.json';
const manifestBody = (over = {}) => ({
  format: 'hds-app-manifest',
  formatVersion: 1,
  appCode: 'dysnet-registry',
  name: { en: 'DysNet', fr: 'DysNet' },
  description: { en: 'The online dysmelia community' },
  icon: 'https://dysnet.org/hds/icon.png',
  provider: { name: { en: 'DysNet (dysnet.org)' }, url: 'https://dysnet.org/' },
  open: { web: 'https://dev.dysnet.org/', ios: 'http://insecure.example/app' },
  privacy: { en: 'https://dysnet.org/privacy', fr: 'javascript:alert(1)' },
  support: 'https://dysnet.org/contact',
  ...over
});
const entry = (over = {}) => ({
  id: 'dysnet-registry',
  appCode: 'dysnet-registry',
  manifest: URL_DYSNET,
  counterparty: { host: 'dysnet.hds.ngo' },
  name: 'DysNet',
  description: { en: 'Registry', fr: 'Registre' },
  icon: { type: 'base64', value: 'data:image/png;base64,AAAA' },
  urls: { web: 'https://dev.dysnet.org/' },
  provider: 'DysNet (dysnet.org)',
  ...over
});
const CMC = { appCode: 'dysnet-registry', counterparty: { username: 'dysnet', host: 'dysnet.hds.ngo' } };

describe('[APPD] appDescription', () => {
  describe('[APPD-P] pointer and manifest', () => {
    it('[APPD-P1] reads hdsApp.manifest: https only, normalized, no credentials or fragment', () => {
      assert.equal(manifestPointerOf({ hdsApp: { manifest: 'https://DysNet.org/hds/app-manifest.json' } }), URL_DYSNET);
      assert.equal(manifestPointerOf({ hdsApp: { manifest: 'http://dysnet.org/m.json' } }), null);
      assert.equal(manifestPointerOf({ hdsApp: { manifest: 'https://u:p@dysnet.org/m.json' } }), null);
      assert.equal(manifestPointerOf({ hdsApp: { manifest: 'https://dysnet.org/m.json#x' } }), null);
      assert.equal(manifestPointerOf({ hdsApp: 'https://dysnet.org/m.json' }), null);
      assert.equal(manifestPointerOf(null), null);
    });

    it('[APPD-P2] parses a manifest, dropping bad optional fields, never the whole manifest', () => {
      const m = parseAppManifest(manifestBody());
      assert.deepEqual(m.open, { web: 'https://dev.dysnet.org/' });
      assert.deepEqual(m.privacy, { en: 'https://dysnet.org/privacy' });
      assert.equal(m.icon, 'https://dysnet.org/hds/icon.png');
      assert.deepEqual(m.provider, { name: { en: 'DysNet (dysnet.org)' }, url: 'https://dysnet.org/' });
      assert.equal(parseAppManifest(manifestBody({ icon: 'http://x/i.png' })).icon, undefined);
    });

    it('[APPD-P3] format, formatVersion 1, appCode and an English name are required', () => {
      assert.equal(parseAppManifest(manifestBody({ format: 'hds-legal-manifest' })), null);
      assert.equal(parseAppManifest(manifestBody({ formatVersion: 2 })), null);
      assert.equal(parseAppManifest(manifestBody({ appCode: '' })), null);
      assert.equal(parseAppManifest(manifestBody({ name: { fr: 'DysNet' } })), null);
      assert.equal(parseAppManifest('{}'), null);
    });
  });

  describe('[APPD-L] loading', () => {
    const response = (body, headers = { 'content-type': 'application/json' }, ok = true) => ({
      ok,
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    });
    beforeEach(() => clearAppManifests());

    it('[APPD-L1] fetches once, without credentials, referrer or redirect', async () => {
      const calls = [];
      const fetchImpl = async (url, opts) => { calls.push([url, opts]); return response(manifestBody()); };
      const a = await loadAppManifest(URL_DYSNET, fetchImpl);
      const b = await loadAppManifest(URL_DYSNET, fetchImpl);
      assert.equal(a.appCode, 'dysnet-registry');
      assert.equal(a, b);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][1].credentials, 'omit');
      assert.equal(calls[0][1].referrerPolicy, 'no-referrer');
      assert.equal(calls[0][1].redirect, 'error');
    });

    it('[APPD-L2] never throws; a failure is retried on the next call', async () => {
      let n = 0;
      const failing = async () => { n++; throw new Error('cors'); };
      assert.equal(await loadAppManifest(URL_DYSNET, failing), null);
      assert.equal(await loadAppManifest(URL_DYSNET, failing), null);
      assert.equal(n, 2);
      assert.equal(await loadAppManifest(URL_DYSNET, async () => response(manifestBody(), { 'content-type': 'text/html' })), null);
      assert.equal(await loadAppManifest(URL_DYSNET, async () => response('x'.repeat(70 * 1024))), null);
      assert.equal(await loadAppManifest(URL_DYSNET, async () => response('not json')), null);
    });
  });

  describe('[APPD-R] the rule', () => {
    const manifest = parseAppManifest(manifestBody());

    it('[APPD-R1] vouched: the catalogue entry\'s words; no fetch needed when it has name, description and icon', () => {
      const input = { ...CMC, pointer: URL_DYSNET, catalogue: [entry()] };
      assert.equal(needsManifest(input), false);
      const d = describeApp(input);
      assert.equal(d.trust, 'vouched');
      assert.deepEqual(d.name, { en: 'DysNet' });
      assert.deepEqual(d.description, { en: 'Registry', fr: 'Registre' });
      assert.equal(d.icon.type, 'base64');
      assert.deepEqual(d.open, { web: 'https://dev.dysnet.org/' });
    });

    it('[APPD-R2] vouched whatever the pointer: a listed app never falls to unvouched', () => {
      assert.equal(describeApp({ ...CMC, pointer: 'https://elsewhere.example/m.json', catalogue: [entry()] }).trust, 'vouched');
      assert.equal(describeApp({ ...CMC, catalogue: [entry()] }).trust, 'vouched');
    });

    it('[APPD-R3] gaps are taken from the manifest only when the pointer is the vouched one', () => {
      const bare = entry({ name: undefined, description: undefined, icon: undefined, urls: undefined, provider: undefined });
      assert.equal(needsManifest({ ...CMC, pointer: URL_DYSNET, catalogue: [bare] }), true);
      const d = describeApp({ ...CMC, pointer: URL_DYSNET, manifest, catalogue: [bare] });
      assert.deepEqual(d.name, manifest.name);
      assert.deepEqual(d.icon, { type: 'url', value: 'https://dysnet.org/hds/icon.png' });
      assert.equal(d.host, 'dysnet.org');
      const other = describeApp({ ...CMC, pointer: 'https://elsewhere.example/m.json', manifest, catalogue: [bare] });
      assert.equal(other.trust, 'vouched');
      assert.equal(other.name, null);
    });

    it('[APPD-R4] CMC vouching is bound to the counterparty', () => {
      const elsewhere = { appCode: 'dysnet-registry', counterparty: { username: 'mallory', host: 'evil.example' }, pointer: URL_DYSNET, manifest, catalogue: [entry()] };
      assert.equal(vouchingEntry(elsewhere), null);
      const d = describeApp(elsewhere);
      assert.equal(d.trust, 'unvouched');
      assert.equal(d.icon, undefined);
      assert.equal(describeApp({ appCode: 'dysnet-registry', pointer: URL_DYSNET, catalogue: [entry()] }).trust, 'none');
      assert.equal(vouchingEntry({ ...CMC, catalogue: [entry({ counterparty: { host: 'dysnet.hds.ngo', username: 'other' } })] }), null);
    });

    it('[APPD-R4b] an entry without counterparty never vouches for a CMC relationship: its app code is a claim', () => {
      const plain = entry({ id: 'cycle-intelligence', appCode: 'cycle-intelligence', counterparty: undefined });
      // a plain access (requestingAppId) is vouched by the entry, as before
      assert.equal(vouchingEntry({ appCode: 'cycle-intelligence', catalogue: [plain] }), plain);
      // any account sending a CMC invite under that app code is not
      const claimed = { appCode: 'cycle-intelligence', counterparty: { username: 'mallory', host: 'evil.example' }, catalogue: [plain] };
      assert.equal(vouchingEntry(claimed), null);
      assert.equal(describeApp(claimed).trust, 'none');
      assert.equal(vouchingEntry({ appCode: 'cycle-intelligence', cmc: true, catalogue: [plain] }), null);
      assert.equal(vouchingEntry({ ...appIdentityOfAccess({ clientData: { cmc: { appCode: 'cycle-intelligence' } } }), catalogue: [plain] }), null);
    });

    it('[APPD-R4c] a practitioner app used by many accounts is unvouched, named from its own manifest', () => {
      const plain = entry({ id: 'cycle-intelligence-monitor', appCode: 'cycle-intelligence-monitor', counterparty: undefined });
      const pointer = 'https://healthdatasafe.github.io/ci/hds-app-manifest-monitor.json';
      const own = parseAppManifest(manifestBody({ appCode: 'cycle-intelligence-monitor', name: { en: 'Cycle Intelligence Monitor' } }));
      const input = { appCode: 'cycle-intelligence-monitor', counterparty: { username: 'dr-a', host: 'api.datasafe.dev' }, cmc: true, pointer, catalogue: [plain] };
      assert.equal(needsManifest(input), true);
      const d = describeApp({ ...input, manifest: own });
      assert.equal(d.trust, 'unvouched');
      assert.deepEqual(d.name, { en: 'Cycle Intelligence Monitor' });
      assert.equal(d.icon, undefined);
      assert.equal(d.host, 'healthdatasafe.github.io');
    });

    it('[APPD-R5] registered: an OAuth client\'s registration, before any manifest', () => {
      const d = describeApp({ appCode: 'some-client', oauthClient: { clientName: 'Some Client', logoUri: 'https://c.example/l.png', clientUri: 'https://c.example/' } });
      assert.equal(d.trust, 'registered');
      assert.deepEqual(d.name, { en: 'Some Client' });
      assert.deepEqual(d.open, { web: 'https://c.example/' });
      assert.equal(needsManifest({ appCode: 'some-client', pointer: URL_DYSNET, oauthClient: { clientName: 'Some Client' } }), false);
    });

    it('[APPD-R6] unvouched: the manifest\'s name and host, no icon; a manifest for another app is ignored', () => {
      const d = describeApp({ appCode: 'dysnet-registry', pointer: URL_DYSNET, manifest });
      assert.equal(d.trust, 'unvouched');
      assert.deepEqual(d.name, manifest.name);
      assert.equal(d.host, 'dysnet.org');
      assert.equal(d.icon, undefined);
      assert.deepEqual(d.provider, { en: 'DysNet (dysnet.org)' });
      assert.equal(describeApp({ appCode: 'cycle-intelligence', pointer: URL_DYSNET, manifest }).trust, 'none');
    });

    it('[APPD-R7] none: nothing readable', () => {
      assert.deepEqual(describeApp({ appCode: 'x' }), { trust: 'none', appCode: 'x', name: null, open: {} });
    });
  });

  describe('[APPD-A] accesses', () => {
    it('[APPD-A1] identity: cmc.appCode, else the access name (requestingAppId)', () => {
      assert.deepEqual(appIdentityOfAccess({ name: 'cmc:dysnet-registry:dysnet@dysnet.hds.ngo', clientData: { cmc: CMC } }), { ...CMC, cmc: true });
      assert.deepEqual(appIdentityOfAccess({ name: 'cycle-intelligence', clientData: {} }), { appCode: 'cycle-intelligence', counterparty: null, cmc: false });
      // a CMC grant without a stamped counterparty is still a CMC relationship
      assert.deepEqual(appIdentityOfAccess({ name: 'x', clientData: { cmc: { appCode: 'cycle-intelligence' } } }), { appCode: 'cycle-intelligence', counterparty: null, cmc: true });
    });

    it('[APPD-A2] the pointer: on the access, else on the CMC accept event', async () => {
      const connection = {
        apiOne: async (method, params) => {
          assert.equal(method, 'events.getOne');
          return params.id === 'accept1' ? { content: { hdsFormSpec: {}, hdsApp: { manifest: URL_DYSNET } } } : null;
        }
      };
      assert.equal(await manifestPointerOfAccess(connection, { clientData: { hdsApp: { manifest: 'https://ci.example/m.json' } } }), 'https://ci.example/m.json');
      assert.equal(await manifestPointerOfAccess(connection, { clientData: { cmc: { acceptEventId: 'accept1', offerEventId: 'offer-on-their-core' } } }), URL_DYSNET);
      assert.equal(await manifestPointerOfAccess(connection, { clientData: { cmc: { acceptEventId: 'gone' } } }), null);
      assert.equal(await manifestPointerOfAccess({ apiOne: async () => { throw new Error('forbidden'); } }, { clientData: { cmc: { acceptEventId: 'accept1' } } }), null);
    });

    it('[APPD-A3] at accept, the invite\'s pointer is mirrored onto her accept event, keeping its content', async () => {
      const calls = [];
      const connection = {
        apiOne: async (method, params) => {
          calls.push([method, params]);
          return method === 'events.getOne' ? { content: { hdsFormSpec: { title: 'x' } } } : {};
        }
      };
      assert.equal(await mirrorAppPointerOnAcceptEvent(connection, 'accept1', { appId: 'dysnet-registry', hdsApp: { manifest: URL_DYSNET } }), true);
      assert.deepEqual(calls[1], ['events.update', { id: 'accept1', update: { content: { hdsFormSpec: { title: 'x' }, hdsApp: { manifest: URL_DYSNET } } } }]);
      calls.length = 0;
      assert.equal(await mirrorAppPointerOnAcceptEvent(connection, 'accept1', { appId: 'x', hdsApp: { manifest: 'http://bad' } }), false);
      assert.equal(calls.length, 0);
    });
  });
});
