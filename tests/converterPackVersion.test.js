import { assert } from './test-utils/deps-node.js';
import { HDSModelConverters } from '../ts/index.ts';
import { packVersionFor, SUPPORTED_CONVERTER_VERSIONS } from '../ts/HDSModel/HDSModel-Converters.ts';

/**
 * Which converter pack is fetched (data-model versioned packs, plan 131): `pack-{v}.json`, v the highest of the
 * index's `versions` this hds-lib supports; `pack-latest.json` when the index has no `versions` or that file is
 * missing (404). `source.modelVersion` is the method's own model version in the pack. `fetch` is stubbed: no network.
 */
const BASE = 'https://model.example.test/';
const ITEM = 'cervical-fluid';
const url = (file) => `${BASE}converters/${ITEM}/${file}`;

function packOf (converterVersion, modelVersion) {
  return {
    itemKey: ITEM,
    converterVersion,
    engine: 'euclidian-distance',
    eventType: 'test/vector',
    dimensionNames: ['a'],
    dimensions: { a: { label: { en: 'A' }, shortLabel: { en: 'A' }, description: { en: 'A' }, weight: 1, stops: [{ value: 0, label: { en: 'None' } }, { value: 1, label: { en: 'Full' } }] } },
    methods: [
      { methodId: 'm', name: { en: 'M' }, description: { en: 'M' }, modelVersion, components: [{ field: 'code', label: { en: 'Code' }, options: [{ value: 'x', label: { en: 'X' }, vector: { a: 0.5 } }] }] },
      { methodId: 'old', name: { en: 'Old' }, description: { en: 'Old' }, components: [{ field: 'code', label: { en: 'Code' }, options: [{ value: 'y', label: { en: 'Y' }, vector: { a: 0.2 } }] }] }
    ]
  };
}

function convertersFor (index) {
  return new HDSModelConverters({
    modelUrl: `${BASE}pack.json`,
    modelData: {
      items: { [ITEM]: { key: ITEM, streamId: 'test-stream', eventType: 'test/vector', type: 'convertible', 'converter-engine': { models: ITEM } } },
      converters: { [ITEM]: index }
    }
  });
}

describe('[CPKV] converter pack version', () => {
  const realFetch = globalThis.fetch;
  let served, requested;

  beforeEach(() => {
    requested = [];
    globalThis.fetch = async (u) => {
      requested.push(u);
      const body = served[u];
      if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
      if (body == null) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => body };
    };
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('[CPKV1] fetches the highest published version it supports', async () => {
    served = { [url('pack-v1.json')]: packOf('v1', 'v1'), [url('pack-latest.json')]: packOf('v0', 'v0') };
    const engine = await convertersFor({ latestVersion: 'v1', versions: ['v0', 'v1'] }).ensureEngine(ITEM);
    assert.strictEqual(engine.converterVersion, 'v1');
    assert.deepStrictEqual(requested, [url('pack-v1.json')]);
  });

  it('[CPKV2] a version above what it supports is never fetched', async () => {
    served = { [url('pack-v1.json')]: packOf('v1', 'v1'), [url('pack-v2.json')]: packOf('v2', 'v2') };
    const engine = await convertersFor({ latestVersion: 'v2', versions: ['v0', 'v1', 'v2'] }).ensureEngine(ITEM);
    assert.strictEqual(engine.converterVersion, 'v1');
    assert.deepStrictEqual(requested, [url('pack-v1.json')]);
  });

  it('[CPKV3] an index without versions (data-model before the versioned packs) reads pack-latest.json', async () => {
    served = { [url('pack-latest.json')]: packOf('v0') };
    await convertersFor({ latestVersion: 'v0' }).ensureEngine(ITEM);
    assert.deepStrictEqual(requested, [url('pack-latest.json')]);
  });

  it('[CPKV4] a missing pack file (404) falls back to pack-latest.json (logged)', async () => {
    served = { [url('pack-latest.json')]: packOf('v0') };
    const engine = await convertersFor({ versions: ['v0', 'v1'] }).ensureEngine(ITEM);
    assert.strictEqual(engine.converterVersion, 'v0');
    assert.deepStrictEqual(requested, [url('pack-v1.json'), url('pack-latest.json')]);
  });

  it('[CPKV5] any failure other than 404 throws, without falling back', async () => {
    served = { [url('pack-v1.json')]: 503, [url('pack-latest.json')]: packOf('v0') };
    await assert.rejects(() => convertersFor({ versions: ['v0', 'v1'] }).ensureEngine(ITEM), /pack-v1\.json \(503\)/);
    assert.deepStrictEqual(requested, [url('pack-v1.json')]);
  });

  it('[CPKV6] source.modelVersion is the method\'s model version, else the converter version', async () => {
    const pack = packOf('v1', 'v1');
    served = { [url('pack-v1.json')]: pack };
    const converters = convertersFor({ versions: ['v0', 'v1'] });
    const m = await converters.convertMethodToEvent(ITEM, 'm', 'x');
    assert.deepStrictEqual([m.content.source.engineVersion, m.content.source.modelVersion], ['v1', 'v1']);
    const old = await converters.convertMethodToEvent(ITEM, 'old', 'y');
    assert.deepStrictEqual([old.content.source.engineVersion, old.content.source.modelVersion], ['v1', 'v1']);
    const given = await converters.convertMethodToEvent(ITEM, 'm', 'x', 'v7');
    assert.strictEqual(given.content.source.modelVersion, 'v7');
  });

  it('[CPKV7] a method at an older model version keeps it in source.modelVersion', async () => {
    const pack = packOf('v1', 'v1');
    pack.methods[1].modelVersion = 'v0';
    served = { [url('pack-v1.json')]: pack };
    const event = await convertersFor({ versions: ['v0', 'v1'] }).convertMethodToEvent(ITEM, 'old', 'y');
    assert.deepStrictEqual([event.content.source.engineVersion, event.content.source.modelVersion], ['v1', 'v0']);
  });

  it('[CPKV8] packVersionFor: numeric order, bad names ignored, unknown item keys read v0', () => {
    assert.strictEqual(SUPPORTED_CONVERTER_VERSIONS['cervical-fluid'], 'v1');
    assert.strictEqual(packVersionFor('cervical-fluid', ['v1', 'v0']), 'v1');
    assert.strictEqual(packVersionFor('cervical-fluid', ['v0', 'v10', 'v2']), 'v0');
    assert.strictEqual(packVersionFor('cervical-fluid', ['v0', 'v1-draft', 3]), 'v0');
    assert.strictEqual(packVersionFor('mood', ['v0', 'v1']), 'v0');
    assert.strictEqual(packVersionFor('new-item', ['v0', 'v1']), 'v0');
    assert.strictEqual(packVersionFor('new-item', ['v1']), null);
    assert.strictEqual(packVersionFor('cervical-fluid', undefined), null);
  });
});
