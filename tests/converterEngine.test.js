import { assert } from './test-utils/deps-node.js';
import { EuclidianDistanceEngine, HDSModelConverters } from '../ts/index.ts';

const MODEL_BASE_URL = 'https://model.datasafe.dev';

async function fetchPack (itemKey) {
  const url = `${MODEL_BASE_URL}/converters/${itemKey}/pack-latest.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

// Module-level packs — loaded once, shared across describes
let cervicalFluidPack;
let moodPack;

before(async () => {
  cervicalFluidPack = await fetchPack('cervical-fluid');
  moodPack = await fetchPack('mood');
});

describe('[EDEX] EuclidianDistanceEngine', function () {
  let cfEngine;
  let moodEngine;

  before(() => {
    cfEngine = new EuclidianDistanceEngine(cervicalFluidPack);
    moodEngine = new EuclidianDistanceEngine(moodPack);
  });

  describe('[EDEI] Engine initialization', () => {
    it('[EDEI1] cervical-fluid engine loads 11 methods', () => {
      assert.strictEqual(cfEngine.methodIds.length, 11);
    });

    it('[EDEI2] mood engine loads methods from pack (excludes _raw)', () => {
      assert.ok(moodEngine.methodIds.length >= 2, `expected at least 2 methods, got ${moodEngine.methodIds.length}`);
      assert.ok(moodEngine.methodIds.includes('mira'), 'should include mira');
      assert.ok(!moodEngine.methodIds.includes('_raw'), '_raw should not be in methodIds (auto-generated)');
    });

    it('[EDEI3] cervical-fluid has 9 dimensions', () => {
      assert.strictEqual(cfEngine.dimensionNames.length, 9);
    });

    it('[EDEI4] mood has 5 dimensions', () => {
      assert.strictEqual(moodEngine.dimensionNames.length, 5);
    });

    it('[EDEI5] weights sum to 1.0', () => {
      let cfSum = 0;
      for (const d of cfEngine.dimensionNames) cfSum += cfEngine.weights[d];
      assert.ok(Math.abs(cfSum - 1.0) < 0.01);

      let moodSum = 0;
      for (const d of moodEngine.dimensionNames) moodSum += moodEngine.weights[d];
      assert.ok(Math.abs(moodSum - 1.0) < 0.01);
    });
  });

  describe('[EDEV] toVector / fromVector', () => {
    it('[EDEV1] appleHealth eggWhite → vector with high values', () => {
      const vec = cfEngine.toVector('appleHealth', 'eggWhite');
      assert.strictEqual(vec.threadiness, 1);
      assert.strictEqual(vec.stretchability, 1);
      assert.strictEqual(vec.lubricative, 1);
    });

    it('[EDEV2] appleHealth dry → zero vector', () => {
      const vec = cfEngine.toVector('appleHealth', 'dry');
      let sum = 0;
      for (const d of cfEngine.dimensionNames) sum += vec[d];
      assert.strictEqual(sum, 0);
    });

    it('[EDEV3] fromVector round-trips appleHealth observations', () => {
      for (const obs of ['dry', 'sticky', 'creamy', 'watery', 'eggWhite']) {
        const vec = cfEngine.toVector('appleHealth', obs);
        const result = cfEngine.fromVector('appleHealth', vec);
        assert.strictEqual(result.data, obs, `round-trip failed for ${obs}`);
        assert.strictEqual(result.matchDistance, 0, `distance should be 0 for exact match: ${obs}`);
      }
    });

    it('[EDEV4] mira mood observations round-trip', () => {
      for (const obs of ['Happy', 'Sad', 'Normal', 'Excited']) {
        const vec = moodEngine.toVector('mira', obs);
        const result = moodEngine.fromVector('mira', vec);
        assert.strictEqual(result.data, obs, `round-trip failed for ${obs}`);
      }
    });

    it('[EDEV5] case-insensitive matching for mira cervical-fluid', () => {
      const vec = cfEngine.toVector('mira', 'raw egg white');
      assert.strictEqual(vec.threadiness, 1);
    });

    it('[EDEV6] unknown observation throws', () => {
      assert.throws(() => cfEngine.toVector('appleHealth', 'unknown'), /Unknown/);
    });

    it('[EDEV7] unknown method throws', () => {
      assert.throws(() => cfEngine.toVector('nonexistent', 'dry'), /Unknown method/);
    });
  });

  describe('[EDEC] Cross-method conversion', () => {
    it('[EDEC1] mira Raw Egg White → appleHealth eggWhite', () => {
      const result = cfEngine.convertMethodToMethod('mira', 'appleHealth', 'Raw Egg White');
      assert.strictEqual(result.data, 'eggWhite');
      assert.strictEqual(result.matchDistance, 0);
    });

    it('[EDEC2] mira Creamy → appleHealth creamy', () => {
      const result = cfEngine.convertMethodToMethod('mira', 'appleHealth', 'Creamy');
      assert.strictEqual(result.data, 'creamy');
    });

    it('[EDEC3] mira Dry → appleHealth dry', () => {
      const result = cfEngine.convertMethodToMethod('mira', 'appleHealth', 'Dry');
      assert.strictEqual(result.data, 'dry');
    });

    it('[EDEC4] creighton 10KL → appleHealth eggWhite', () => {
      const result = cfEngine.convertMethodToMethod('creighton', 'appleHealth', '10KL');
      assert.strictEqual(result.data, 'eggWhite');
    });

    it('[EDEC5] creighton 0 → appleHealth dry', () => {
      const result = cfEngine.convertMethodToMethod('creighton', 'appleHealth', '0');
      assert.strictEqual(result.data, 'dry');
    });

    it('[EDEC6] mira Clumpy white → appleHealth sticky (pathological)', () => {
      const result = cfEngine.convertMethodToMethod('mira', 'appleHealth', 'Clumpy white');
      assert.ok(['dry', 'sticky'].includes(result.data), `expected dry or sticky, got ${result.data}`);
    });

    it('[EDEC7] mood mira Happy → _raw produces valid 5D vector', () => {
      const vec = moodEngine.toVector('mira', 'Happy');
      assert.strictEqual(vec.valence, 0.80);
      assert.strictEqual(vec.arousal, 0.60);
      const result = moodEngine.fromVector('_raw', vec);
      // _raw is assembly — result should be an object with 5 fields
      assert.ok(result.data, 'should have result data');
    });
  });

  describe('[EDED] Distance calculations', () => {
    it('[EDED1] distance between identical vectors is 0', () => {
      const vec = cfEngine.toVector('appleHealth', 'creamy');
      assert.strictEqual(cfEngine.distance(vec, vec), 0);
    });

    it('[EDED2] distance between dry and eggWhite is large', () => {
      const dry = cfEngine.toVector('appleHealth', 'dry');
      const egg = cfEngine.toVector('appleHealth', 'eggWhite');
      const d = cfEngine.distance(dry, egg);
      assert.ok(d > 0.5, `expected large distance, got ${d}`);
    });

    it('[EDED3] distance between sticky and creamy is small', () => {
      const sticky = cfEngine.toVector('appleHealth', 'sticky');
      const creamy = cfEngine.toVector('appleHealth', 'creamy');
      const d = cfEngine.distance(sticky, creamy);
      assert.ok(d < 0.2, `expected small distance, got ${d}`);
    });

    it('[EDED4] zeroVector has all zeros', () => {
      const z = cfEngine.zeroVector();
      for (const dim of cfEngine.dimensionNames) {
        assert.strictEqual(z[dim], 0);
      }
    });
  });
});

describe('[MCVX] HDSModelConverters with loadPack', function () {
  let converters;

  before(() => {
    // Create a minimal mock model
    const mockModel = {
      modelUrl: 'https://model.datasafe.dev/pack.json',
      modelData: {
        items: {
          'body-vulva-mucus-inspect': {
            key: 'body-vulva-mucus-inspect',
            streamId: 'body-vulva-mucus-inspect',
            eventType: 'vulva-mucus-inspect/9d-vector',
            type: 'convertible',
            'converter-engine': { key: 'euclidian-distance', version: 'v0', models: 'cervical-fluid' }
          },
          'wellbeing-mood': {
            key: 'wellbeing-mood',
            streamId: 'wellbeing-mood',
            eventType: 'mood/5d-vectors',
            type: 'convertible',
            'converter-engine': { key: 'euclidian-distance', version: 'v0', models: 'mood' }
          }
        },
        converters: {
          'cervical-fluid': { latestVersion: 'v0' },
          mood: { latestVersion: 'v0' }
        }
      }
    };

    converters = new HDSModelConverters(mockModel);
    converters.loadPack(cervicalFluidPack);
    converters.loadPack(moodPack);
  });

  it('[MCVX1] lists loaded item keys', () => {
    const keys = converters.loadedItemKeys.sort();
    assert.deepStrictEqual(keys, ['cervical-fluid', 'mood']);
  });

  it('[MCVX2] getEngine returns loaded engines', () => {
    assert.ok(converters.getEngine('cervical-fluid'));
    assert.ok(converters.getEngine('mood'));
    assert.strictEqual(converters.getEngine('unknown'), undefined);
  });

  it('[MCVX3] convertMethodToEvent produces valid event structure', async () => {
    const event = await converters.convertMethodToEvent('cervical-fluid', 'mira', 'Creamy');
    assert.strictEqual(event.type, 'vulva-mucus-inspect/9d-vector');
    assert.deepStrictEqual(event.streamIds, ['body-vulva-mucus-inspect']);
    assert.ok(event.content.vectors, 'should have vectors');
    assert.strictEqual(event.content.vectors.threadiness, 0.4);
    assert.ok(event.content.source, 'should have source');
    assert.strictEqual(event.content.source.key, 'mira');
    assert.strictEqual(event.content.source.sourceData, 'Creamy');
    assert.strictEqual(event.content.source.engineVersion, 'v0');
  });

  it('[MCVX4] convertEventToMethod recovers source observation', async () => {
    const event = await converters.convertMethodToEvent('cervical-fluid', 'appleHealth', 'eggWhite');
    const result = await converters.convertEventToMethod(event, 'appleHealth');
    assert.strictEqual(result.data, 'eggWhite');
    assert.strictEqual(result.matchDistance, 0);
  });

  it('[MCVX5] convertEventToMethod cross-method', async () => {
    const event = await converters.convertMethodToEvent('cervical-fluid', 'mira', 'Raw Egg White');
    const result = await converters.convertEventToMethod(event, 'appleHealth');
    assert.strictEqual(result.data, 'eggWhite');
  });

  it('[MCVX6] convertMethodToMethod works', async () => {
    const result = await converters.convertMethodToMethod('mood', 'mira', '_raw', 'Happy');
    assert.ok(result.data, 'should have result');
    assert.ok(result.matchDistance >= 0, 'should have matchDistance');
  });

  it('[MCVX7] convertMethodToEvent for mood produces valid event', async () => {
    const event = await converters.convertMethodToEvent('mood', 'mira', 'Sad');
    assert.strictEqual(event.type, 'mood/5d-vectors');
    assert.deepStrictEqual(event.streamIds, ['wellbeing-mood']);
    assert.strictEqual(event.content.vectors.valence, 0.15);
    assert.strictEqual(event.content.source.key, 'mira');
    assert.strictEqual(event.content.source.sourceData, 'Sad');
  });

  it('[MCVX8] throws for unknown item key', async () => {
    try {
      await converters.convertMethodToEvent('unknown', 'mira', 'test');
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('Unknown converter item key'));
    }
  });

  it('[MCVX9] loadPack rejects unknown engine', () => {
    assert.throws(() => {
      converters.loadPack({ engine: 'neural-network', itemKey: 'test', methods: [] });
    }, /Unknown converter engine/);
  });

  it('[MCVX10] creighton→mira round-trip conversions', async () => {
    const pairs = [
      ['0', 'No discharge'], ['6', 'Sticky'], ['8P', 'Creamy'], ['10KL', 'Raw Egg White'],
    ];
    const engine = converters.getEngine('cervical-fluid');
    for (const [cr, mira] of pairs) {
      const event = await converters.convertMethodToEvent('cervical-fluid', 'creighton', cr);
      const result = engine.fromVector('mira', event.content.vectors);
      assert.strictEqual(result.data, mira, `Creighton ${cr} → expected ${mira}, got ${result.data}`);
    }
  });

  it('[MCVX11] _raw virtual method is auto-generated', async () => {
    const moodEngine = converters.getEngine('mood');
    const cfEngine = converters.getEngine('cervical-fluid');
    assert.ok(moodEngine.getMethodDef('_raw'), '_raw should exist for mood');
    assert.ok(cfEngine.getMethodDef('_raw'), '_raw should exist for cervical-fluid');
    assert.strictEqual(moodEngine.getMethodDef('_raw').name.en, 'HDS Native');
  });

  it('[MCVX12] _raw fromVector returns object with stop labels', async () => {
    const engine = converters.getEngine('mood');
    const result = engine.fromVector('_raw', { valence: 0.5, arousal: 0.5, dominance: 0.5, socialOrientation: 0.5, temporalFocus: 0.5 });
    // Exact stops → distance 0
    assert.strictEqual(result.matchDistance, 0);
    assert.strictEqual(typeof result.data, 'object');
    assert.strictEqual(result.data.valence, 0.5);
  });

  it('[MCVX13] _raw fromVector with non-exact values has non-zero distance', async () => {
    const engine = converters.getEngine('mood');
    const result = engine.fromVector('_raw', { valence: 0.8, arousal: 0.2, dominance: 0.7, socialOrientation: 0.5, temporalFocus: 0.3 });
    assert.ok(result.matchDistance > 0, `Expected non-zero distance, got ${result.matchDistance}`);
    const confidence = Math.round((1 - result.matchDistance) * 100);
    assert.ok(confidence > 80 && confidence < 100, `Expected partial confidence, got ${confidence}%`);
  });
});
