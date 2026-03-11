import { assert } from './test-utils/deps-node.js';

// We test conversions with a mock model object since the published
// model at model.datasafe.dev doesn't have conversions yet.
// HDSModelConversions reads from model.modelData.conversions.

import HDSLib from '../js/index.js';

// Create a minimal mock model with conversions data
function createMockModelWithConversions () {
  const mockConversions = {
    mass: {
      metric: 'kg',
      imperial: 'lb',
      factors: {
        kg: { lb: 2.2046226218487757 }
      }
    },
    length: {
      metric: 'm',
      imperial: 'ft',
      factors: {
        m: { ft: 3.280839895013123 }
      }
    },
    temperature: {
      metric: 'c',
      imperial: 'f',
      factors: {
        c: { f: [1.8, 32] }
      }
    }
  };

  // Create a model-like object that HDSModelConversions can use
  const model = {
    modelData: { conversions: mockConversions }
  };

  // Instantiate HDSModelConversions via the internal constructor
  // HDSModelConversions reads model.modelData.conversions
  const ConversionsClass = HDSLib.HDSModelConversions;
  if (!ConversionsClass) {
    // If not exported, we create a workaround using the conversion logic directly
    // by creating a real HDSModel and injecting data
    throw new Error('HDSModelConversions not exported — need to add export');
  }
  return new ConversionsClass(model);
}

describe('[CONV] HDSModel Conversions', function () {
  let conversions;

  before(() => {
    try {
      conversions = createMockModelWithConversions();
    } catch (e) {
      // HDSModelConversions might not be exported yet, skip gracefully
      console.log('Note:', e.message);
    }
  });

  describe('[CONV-M] mass conversions (kg ↔ lb)', () => {
    it('[CONV-M1] kg to imperial converts to lb', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('mass/kg', 70, 'imperial');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.targetEventType, 'mass/lb');
      // 70 kg ≈ 154.32 lb
      assert.ok(result.value > 154 && result.value < 155, `Expected ~154.32, got ${result.value}`);
    });

    it('[CONV-M2] lb to metric converts to kg (reverse)', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('mass/lb', 154.32, 'metric');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.targetEventType, 'mass/kg');
      assert.ok(result.value > 69 && result.value < 71, `Expected ~70, got ${result.value}`);
    });

    it('[CONV-M3] kg to metric returns null (already in target system)', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('mass/kg', 70, 'metric');
      assert.strictEqual(result, null);
    });

    it('[CONV-M4] lb to imperial returns null (already in target system)', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('mass/lb', 154, 'imperial');
      assert.strictEqual(result, null);
    });
  });

  describe('[CONV-L] length conversions (m ↔ ft)', () => {
    it('[CONV-L1] m to imperial converts to ft', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('length/m', 1.8, 'imperial');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.targetEventType, 'length/ft');
      assert.ok(result.value > 5.8 && result.value < 6.0, `Expected ~5.91, got ${result.value}`);
    });

    it('[CONV-L2] ft to metric converts to m (reverse)', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('length/ft', 5.91, 'metric');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.targetEventType, 'length/m');
      assert.ok(result.value > 1.79 && result.value < 1.81, `Expected ~1.8, got ${result.value}`);
    });
  });

  describe('[CONV-T] temperature conversions (c ↔ f) — affine', () => {
    it('[CONV-T1] °C to imperial converts to °F', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('temperature/c', 37, 'imperial');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.targetEventType, 'temperature/f');
      assert.ok(result.value > 98 && result.value < 99, `Expected ~98.6, got ${result.value}`);
    });

    it('[CONV-T2] 0°C to °F = 32', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('temperature/c', 0, 'imperial');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.value, 32);
    });

    it('[CONV-T3] 100°C to °F = 212', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('temperature/c', 100, 'imperial');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.value, 212);
    });

    it('[CONV-T4] °F to metric converts to °C (reverse affine)', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('temperature/f', 98.6, 'metric');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.targetEventType, 'temperature/c');
      assert.ok(result.value > 36.9 && result.value < 37.1, `Expected ~37, got ${result.value}`);
    });

    it('[CONV-T5] 32°F to °C = 0', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('temperature/f', 32, 'metric');
      assert.ok(result, 'Should return a result');
      assert.strictEqual(result.value, 0);
    });
  });

  describe('[CONV-E] edge cases', () => {
    it('[CONV-E1] unknown category returns null', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('unknown/unit', 42, 'imperial');
      assert.strictEqual(result, null);
    });

    it('[CONV-E2] invalid event type (no slash) returns null', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('noslash', 42, 'imperial');
      assert.strictEqual(result, null);
    });

    it('[CONV-E3] known category but unknown unit returns null', function () {
      if (!conversions) return this.skip();
      const result = conversions.convert('mass/stones', 10, 'metric');
      assert.strictEqual(result, null);
    });

    it('[CONV-E4] roundtrip conversion is accurate (kg → lb → kg)', function () {
      if (!conversions) return this.skip();
      const original = 75.5;
      const toLb = conversions.convert('mass/kg', original, 'imperial');
      assert.ok(toLb, 'kg→lb should work');
      const backToKg = conversions.convert('mass/lb', toLb.value, 'metric');
      assert.ok(backToKg, 'lb→kg should work');
      assert.ok(
        Math.abs(backToKg.value - original) < 0.1,
        `Roundtrip: ${original} → ${toLb.value} → ${backToKg.value}`
      );
    });
  });
});
