import { assert } from './test-utils/deps-node.js';
import { HDSModelConverters, localizeText } from '../ts/index.ts';
import { resetPreferredLocales, setPreferredLocales } from '../ts/localizeText.ts';
import { addPackTexts } from '../ts/converters/packTexts.ts';

/**
 * The texts of a converter in the other languages (plan 138): data-model publishes them beside its frozen packs,
 * `converters/{itemKey}/l10n-{locale}.json`. `fetch` is stubbed: no network.
 */
const ITEM = 'cervical-fluid';
// one per test: the converters of an earlier test still follow the preferred languages
let base = '';
let count = 0;
const url = (file) => `${base}converters/${ITEM}/${file}`;

function packOf () {
  return {
    itemKey: ITEM,
    converterVersion: 'v1',
    engine: 'euclidian-distance',
    eventType: 'test/vector',
    dimensionNames: ['a'],
    dimensions: { a: { label: { en: 'Dim', fr: 'Dimension' }, shortLabel: { en: 'D' }, description: { en: 'A' }, weight: 1, stops: [{ value: 0, label: { en: 'None', fr: 'Rien' } }, { value: 1, label: { en: 'Full' } }] } },
    temperatureRules: { 'three/over~six': { label: { en: 'Three over six' } } },
    methods: [
      { methodId: 'm', name: { en: 'Two days', fr: 'Deux jours' }, description: { en: 'M' }, components: [{ field: 'code', label: { en: 'Code' }, options: [{ value: 'x', label: { en: 'Dry' }, vector: { a: 0.5 } }, { value: null, label: { en: 'Nothing' }, vector: { a: 0 } }] }] }
    ]
  };
}

const TEXTS = {
  'methods[0]/name': 'Dois dias',
  'methods[0]/components[0]/options[value="x"]/label': 'Seco',
  'methods[0]/components[0]/options[value=null]/label': 'Nada',
  'dimensions/a/stops[value=0]/label': 'Nenhum',
  'temperatureRules/three~1over~0six/label': 'Três sobre seis'
};
const sidecar = (locale, texts = TEXTS, file = 'pack-v1.json') => ({ locale, packs: { [file]: texts } });

function convertersFor (versions = ['v0', 'v1']) {
  return new HDSModelConverters({
    modelUrl: `${base}pack.json`,
    modelData: {
      items: { [ITEM]: { key: ITEM, streamId: 'test-stream', eventType: 'test/vector', type: 'convertible', 'converter-engine': { models: ITEM } } },
      converters: { [ITEM]: { versions } }
    }
  });
}

describe('[CVTX] converter texts in the other languages', () => {
  const realFetch = globalThis.fetch;
  let served, requested;

  beforeEach(() => {
    requested = [];
    base = `https://model-${++count}.example.test/`;
    served = { [url('pack-v1.json')]: packOf() };
    resetPreferredLocales();
    setPreferredLocales(['en']);
    globalThis.fetch = async (u) => {
      if (!u.startsWith(base)) return { ok: false, status: 404 };
      requested.push(u.replace(url(''), ''));
      const body = served[u];
      if (body instanceof Error) throw body;
      if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
      if (body == null) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => structuredClone(body) };
    };
  });
  afterEach(() => { setPreferredLocales(['en']); globalThis.fetch = realFetch; });

  const nameOf = (engine) => localizeText(engine.getMethodDef('m').name);

  it('[CVTX1] English and French ask for nothing: the pack has them', async () => {
    await convertersFor().ensureEngine(ITEM);
    setPreferredLocales(['fr']);
    assert.strictEqual(nameOf(await convertersFor().ensureEngine(ITEM)), 'Deux jours');
    assert.deepStrictEqual(requested, ['pack-v1.json', 'pack-v1.json']);
  });

  it('[CVTX2] the texts of the preferred language are there when the engine is', async () => {
    served[url('l10n-pt-BR.json')] = sidecar('pt-BR');
    setPreferredLocales(['pt-BR']);
    const engine = await convertersFor().ensureEngine(ITEM);
    assert.deepStrictEqual(requested, ['pack-v1.json', 'l10n-pt-BR.json', 'l10n-pt.json']);
    const options = engine.getMethodDef('m').components[0].options;
    assert.deepStrictEqual([nameOf(engine), localizeText(options[0].label), localizeText(options[1].label)], ['Dois dias', 'Seco', 'Nada']);
    assert.strictEqual(localizeText(engine.dimensions.a.stops[0].label), 'Nenhum');
    assert.strictEqual(localizeText(engine.temperatureRules['three/over~six'].label), 'Três sobre seis');
    // no text in the file: the next preferred language of the pack
    assert.strictEqual(localizeText(engine.dimensions.a.stops[1].label), 'Full');
    assert.strictEqual(engine.toVector('m', 'x').a, 0.5);
  });

  it('[CVTX3] the texts of the pack file read, pack-latest.json included', async () => {
    served = { [url('pack-latest.json')]: packOf(), [url('l10n-it.json')]: { locale: 'it', packs: { 'pack-v1.json': { 'methods[0]/name': 'no' }, 'pack-latest.json': { 'methods[0]/name': 'Due giorni' } } } };
    setPreferredLocales(['it']);
    assert.strictEqual(nameOf(await convertersFor().ensureEngine(ITEM)), 'Due giorni');
  });

  it('[CVTX4] no file, a failing one, a network error, another shape: the texts of the pack', async () => {
    setPreferredLocales(['es']);
    for (const body of [404, 503, new Error('offline'), null, 'text', [], { packs: null }, { packs: { 'pack-v1.json': 'x' } }, sidecar('es', { 'methods[0]/name': '', 'dimensions/a/label': 3 })]) {
      served[url('l10n-es.json')] = body;
      const engine = await convertersFor().ensureEngine(ITEM);
      assert.deepStrictEqual([nameOf(engine), localizeText(engine.dimensions.a.label)], ['Two days', 'Dim'], JSON.stringify(body));
    }
  });

  it('[CVTX5] a change of language loads its texts, once, into what the engine already handed out', async () => {
    served[url('l10n-it.json')] = sidecar('it', { 'methods[0]/name': 'Due giorni' });
    const converters = convertersFor();
    const name = (await converters.ensureEngine(ITEM)).getMethodDef('m').name;
    setPreferredLocales(['it']);
    await converters.loadTexts();
    assert.strictEqual(localizeText(name), 'Due giorni');
    setPreferredLocales(['en']);
    setPreferredLocales(['it']);
    await converters.loadTexts();
    assert.deepStrictEqual(requested.filter((f) => f === 'l10n-it.json').length, 1);
  });

  it('[CVTX6] a change of language while the pack loads is followed', async () => {
    served[url('l10n-it.json')] = sidecar('it', { 'methods[0]/name': 'Due giorni' });
    const converters = convertersFor();
    const loading = converters.ensureEngine(ITEM);
    setPreferredLocales(['it']);
    assert.strictEqual(nameOf(await loading), 'Due giorni');
  });

  it('[CVTX7] addPackTexts keeps a text the pack has, and adds nothing but text', () => {
    const pack = packOf();
    pack.methods[0].name.it = 'Già qui';
    assert.strictEqual(addPackTexts(pack, 'it', { 'methods[0]/name': 'Due giorni', 'methods[0]/components': 'x', 'dimensions/a/label': 'Dimensione', constructor: 'x' }), 1);
    assert.deepStrictEqual([pack.methods[0].name.it, pack.dimensions.a.label.it], ['Già qui', 'Dimensione']);
  });

  it('[CVTX8] nothing loaded: loadTexts asks for nothing', async () => {
    setPreferredLocales(['it']);
    await convertersFor().loadTexts();
    assert.deepStrictEqual(requested, []);
  });
});
