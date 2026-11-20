import { assert } from './test-utils/deps-node.js';
import { EuclidianDistanceEngine } from '../ts/index.ts';

/**
 * Option flags of single-component methods (data-model cervical-fluid Creighton, plan 131): `produce: false`
 * options convert to a vector but are never returned by fromVector; a `{ <field>: value }` observation (the
 * shape bridges store) converts like the bare value. Self-contained pack, no network.
 */
const pack = {
  itemKey: 'test-flags',
  converterVersion: 'v0',
  engine: 'euclidian-distance',
  eventType: 'test/vector',
  dimensionNames: ['a', 'b'],
  dimensions: {
    a: { label: { en: 'A' }, shortLabel: { en: 'A' }, description: { en: 'A' }, weight: 0.5, stops: [{ value: 0, label: { en: 'None' } }, { value: 1, label: { en: 'Full' } }] },
    b: { label: { en: 'B' }, shortLabel: { en: 'B' }, description: { en: 'B' }, weight: 0.5, stops: [{ value: 0, label: { en: 'None' } }, { value: 1, label: { en: 'Full' } }] }
  },
  methods: [{
    methodId: 'notation',
    name: { en: 'Notation' },
    description: { en: 'Notation' },
    caseInsensitive: true,
    components: [{
      field: 'code',
      label: { en: 'Code' },
      options: [
        { value: 'low', label: { en: 'Low' }, vector: { a: 0.1 } },
        { value: 'high', label: { en: 'High' }, vector: { a: 0.9, b: 0.9 } },
        { value: 'highX', label: { en: 'High, new' }, vector: { a: 0.95, b: 0.95 }, produce: false, parts: { base: 'high', extra: 'X' } },
        { value: 'old', label: { en: 'Old' }, vector: { a: 0.5 }, offer: false }
      ]
    }]
  }]
};

describe('[EDFL] EuclidianDistanceEngine option flags', () => {
  const engine = new EuclidianDistanceEngine(pack);

  it('[EDFL1] a produce:false option still converts to its vector', () => {
    assert.deepStrictEqual(engine.toVector('notation', 'highX'), { a: 0.95, b: 0.95 });
  });

  it('[EDFL2] fromVector never returns a produce:false option, even on its own vector', () => {
    assert.strictEqual(engine.fromVector('notation', { a: 0.95, b: 0.95 }).data, 'high');
  });

  it('[EDFL3] an offer:false option is still produced (offer is for pickers)', () => {
    assert.strictEqual(engine.fromVector('notation', { a: 0.5, b: 0 }).data, 'old');
  });

  it('[EDFL4] allObservations lists every option, flags included', () => {
    assert.deepStrictEqual(engine.getMethodDef('notation').components[0].options.map(o => o.value), ['low', 'high', 'highX', 'old']);
  });

  it('[EDFL5] a { <field>: value } observation converts like the bare value', () => {
    assert.deepStrictEqual(engine.toVector('notation', { code: 'HIGH' }), engine.toVector('notation', 'high'));
  });

  it('[EDFL6] an unknown value inside the object still throws', () => {
    assert.throws(() => engine.toVector('notation', { code: 'nope' }), /Unknown notation observation/);
  });
});
