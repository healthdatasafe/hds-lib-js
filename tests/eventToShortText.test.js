import { assert } from './test-utils/deps-node.js';
import { eventToShortText } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import HDSSettings from '../ts/settings/HDSSettings.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';

describe('[ESTX] eventToShortText', () => {
  let model;
  before(async () => {
    // Use the singleton so eventToShortText picks up the same model instance
    model = getModel();
    await model.load(modelURL);
  });

  it('[EST1] returns null for null event', () => {
    assert.equal(eventToShortText(null), null);
  });

  it('[EST2] returns null for event with null content', () => {
    assert.equal(eventToShortText({ content: null, streamIds: ['x'], type: 'x' }), null);
  });

  it('[EST3] number with unit symbol (mass/kg)', () => {
    const event = { content: 60, streamIds: ['body-weight'], type: 'mass/kg' };
    const result = eventToShortText(event);
    assert.equal(result, '60 Kg');
  });

  it('[EST4] number with unit symbol (concentration/iu-l)', () => {
    const event = { content: 12.5, streamIds: ['fertility-hormone-lh'], type: 'concentration/iu-l' };
    const result = eventToShortText(event);
    assert.equal(result, '12.5 IU/L');
  });

  it('[EST5] checkbox (activity/plain) returns Yes', () => {
    const event = { content: true, streamIds: ['fertility-cycles-start'], type: 'activity/plain' };
    const result = eventToShortText(event);
    assert.equal(result, 'Yes');
  });

  it('[EST6] select with localized option label', () => {
    const itemDef = model.itemsDefs.forKey('body-vulva-bleeding');
    assert.ok(itemDef, 'itemDef should exist');
    const event = {
      content: 0.55,
      streamIds: [itemDef.data.streamId],
      type: itemDef.eventTypes[0]
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Moderate');
  });

  it('[EST6b] convertible with source block shows source data (no autoConvert)', async () => {
    await model.converters.ensureEngine('cervical-fluid');
    const itemDef = model.itemsDefs.forKey('body-vulva-mucus-inspect');
    assert.ok(itemDef, 'itemDef should exist');
    const event = {
      content: {
        vectors: { threadiness: 0.4, stretchability: 0.3 },
        source: { key: 'mira', sourceData: 'Creamy', engineVersion: 'v0', modelVersion: 'v0' }
      },
      streamIds: [itemDef.data.streamId],
      type: itemDef.eventTypes[0]
    };
    const result = eventToShortText(event);
    // Without autoConvert setting, shows sourceData + localized method name
    assert.equal(result, 'Creamy (Mira)');
  });

  it('[EST6c] convertible without source shows dimension stop labels', async () => {
    // Load converter engine to get dimension labels
    await model.converters.ensureEngine('mood');
    const event = {
      content: {
        vectors: { valence: 0.9, arousal: 0.3, dominance: 0.6, socialOrientation: 0, temporalFocus: 0 }
      },
      streamIds: ['wellbeing-mood'],
      type: 'mood/5d-vectors'
    };
    const result = eventToShortText(event);
    // Top 3 dimensions by weight (valence=0.30, arousal=0.25, dominance=0.20)
    // nearest stop labels: valence 0.9→"Very pleasant", arousal 0.3→"Calm", dominance 0.6→"Neutral"
    // _raw method computes confidence from weighted distance to nearest stops
    assert.ok(result.startsWith('Very pleasant, Calm, Neutral'), `Expected start, got: ${result}`);
    assert.ok(result.includes('%'), `Expected confidence %, got: ${result}`);
  });

  it('[EST7] date item returns ISO date string', () => {
    const itemDef = model.itemsDefs.forKey('profile-date-of-birth');
    assert.ok(itemDef, 'itemDef should exist');
    // Use a known timestamp: 2024-01-15T00:00:00Z = 1705276800
    const event = {
      content: '2024-01-15',
      streamIds: [itemDef.data.streamId],
      type: itemDef.eventTypes[0],
      time: 1705276800
    };
    const result = eventToShortText(event);
    assert.equal(result, '2024-01-15');
  });

  it('[EST8] datasource-search (medication) returns drug label + intake', () => {
    const event = {
      content: {
        drug: { label: { en: 'Aspirin', fr: 'Aspirine' } },
        intake: { doseValue: 325, doseUnit: 'mass/mg', route: 'oral' }
      },
      streamIds: ['medication-intake'],
      type: 'medication/coded-v1'
    };
    const result = eventToShortText(event);
    assert.ok(result.includes('Aspirin'), `Expected Aspirin in: ${result}`);
    assert.ok(result.includes('325'), `Expected 325 in: ${result}`);
    assert.ok(result.includes('oral'), `Expected oral in: ${result}`);
  });

  it('[EST9] string content returned as-is', () => {
    const event = { content: 'John', streamIds: ['profile-name'], type: 'contact/name' };
    const result = eventToShortText(event);
    assert.equal(result, 'John');
  });

  it('[EST10] long string content is truncated', () => {
    const long = 'a'.repeat(100);
    const event = { content: long, streamIds: ['profile-name'], type: 'contact/name' };
    const result = eventToShortText(event);
    assert.ok(result.length < 100, 'Should be truncated');
    assert.ok(result.endsWith('...'), 'Should end with ...');
  });

  it('[EST11] fallback: number without itemDef but with symbol', () => {
    const event = { content: 36.6, streamIds: ['unknown-stream'], type: 'temperature/c' };
    const result = eventToShortText(event);
    assert.ok(result.includes('36.6'), `Expected 36.6 in: ${result}`);
    assert.ok(result.includes('°C'), `Expected °C in: ${result}`);
  });

  it('[EST12] fallback: object with label field', () => {
    const event = { content: { label: 'Something' }, streamIds: ['x'], type: 'x/y' };
    const result = eventToShortText(event);
    assert.equal(result, 'Something');
  });

  it('[EST13] boolean true returns Yes', () => {
    const event = { content: true, streamIds: ['x'], type: 'x/y' };
    const result = eventToShortText(event);
    assert.equal(result, 'Yes');
  });

  it('[EST14] boolean false returns No', () => {
    const event = { content: false, streamIds: ['x'], type: 'x/y' };
    const result = eventToShortText(event);
    assert.equal(result, 'No');
  });

  it('[EST15] medication legacy flat format', () => {
    const event = {
      content: {
        label: { en: 'Ibuprofen' },
        codes: [],
        doseValue: 200,
        doseUnit: 'mass/mg',
        route: 'oral'
      },
      streamIds: ['medication-intake'],
      type: 'medication/coded-v1'
    };
    const result = eventToShortText(event);
    assert.ok(result.includes('Ibuprofen'), `Expected Ibuprofen in: ${result}`);
    assert.ok(result.includes('200'), `Expected 200 in: ${result}`);
  });

  it('[EST16a] checkbox with null content returns date+time', () => {
    const event = { content: null, streamIds: ['fertility-cycles-start'], type: 'activity/plain', time: 1720000000 };
    const result = eventToShortText(event);
    assert.ok(result, 'Should return a date+time string');
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(result), `Expected date+time, got: ${result}`);
  });

  it('[EST16a2] checkbox at midnight local returns date only', () => {
    // Midnight local time
    const d = new Date(2024, 6, 3, 0, 0, 0); // July 3, 2024 00:00 local
    const midnight = d.getTime() / 1000;
    const event = { content: null, streamIds: ['fertility-cycles-start'], type: 'activity/plain', time: midnight };
    const result = eventToShortText(event);
    assert.ok(result, 'Should return a date string');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result), `Expected date only, got: ${result}`);
  });

  it('[EST16b] medication with plain string label (not i18n object)', () => {
    const event = {
      content: {
        drug: { label: 'Paracetamol' },
        intake: { doseValue: 500, doseUnit: 'mass/mg' }
      },
      streamIds: ['medication-intake'],
      type: 'medication/coded-v1'
    };
    const result = eventToShortText(event);
    assert.ok(result.includes('Paracetamol'), `Expected Paracetamol in: ${result}`);
    assert.ok(result.includes('500'), `Expected 500 in: ${result}`);
  });

  it('[EST16c] unknown event with nested object extracts first string value', () => {
    const event = {
      content: {
        measurement: {
          systolic: 120,
          diastolic: 80,
          unit: 'mmHg'
        },
        device: 'Omron M3',
        notes: 'Morning reading'
      },
      streamIds: ['unknown-stream'],
      type: 'unknown/type'
    };
    const result = eventToShortText(event);
    // formatObject tries first string/number field at top level
    // 'measurement' is an object, 'device' is the first string → 'Omron M3'
    assert.equal(result, 'Omron M3');
  });

  it('[EST16d] unknown event with deeply nested object and no string at top level', () => {
    const event = {
      content: {
        data: { values: [1, 2, 3] },
        meta: { source: { name: 'Sensor' } }
      },
      streamIds: ['unknown-stream'],
      type: 'unknown/type'
    };
    const result = eventToShortText(event);
    // No string/number at top level → falls through to '{2 fields}'
    assert.equal(result, '{2 fields}');
  });

  it('[EST16e] unknown event with value field returns value', () => {
    const event = {
      content: {
        value: 42,
        metadata: { unit: 'bpm', device: 'watch' }
      },
      streamIds: ['unknown-stream'],
      type: 'unknown/type'
    };
    const result = eventToShortText(event);
    assert.equal(result, '42');
  });

  it('[EST16] ratio/generic select', () => {
    const itemDef = model.itemsDefs.forKey('body-vulva-wetness-feeling');
    assert.ok(itemDef, 'itemDef should exist');
    const event = {
      content: { value: 1, relativeTo: 3 },
      streamIds: [itemDef.data.streamId],
      type: 'ratio/generic'
    };
    const result = eventToShortText(event);
    assert.ok(result, 'Should return a result');
    // Should contain the option label for value 1
    const opt = itemDef.data.options.find(o => o.value === 1);
    if (opt) {
      assert.ok(result.includes('1/3'), `Expected ratio prefix in: ${result}`);
    }
  });

  it('[EST17a] test-result/scale positive (1)', () => {
    const event = { content: 1, streamIds: ['fertility-test-opk'], type: 'test-result/scale' };
    assert.equal(eventToShortText(event), 'Positive');
  });

  it('[EST17b] test-result/scale negative (-1)', () => {
    const event = { content: -1, streamIds: ['fertility-test-opk'], type: 'test-result/scale' };
    assert.equal(eventToShortText(event), 'Negative');
  });

  it('[EST17c] test-result/scale indeterminate (0)', () => {
    const event = { content: 0, streamIds: ['fertility-test-pregnancy'], type: 'test-result/scale' };
    assert.equal(eventToShortText(event), 'Indeterminate');
  });

  it('[EST17d] test-result/scale partial positive (0.56)', () => {
    const event = { content: 0.56, streamIds: ['fertility-test-opk'], type: 'test-result/scale' };
    assert.equal(eventToShortText(event), 'Positive 56%');
  });

  it('[EST17e] test-result/scale partial negative (-0.3)', () => {
    const event = { content: -0.3, streamIds: ['fertility-test-opk'], type: 'test-result/scale' };
    assert.equal(eventToShortText(event), 'Negative 30%');
  });

  it('[EST18] medication/basic composite shows name + dose', () => {
    const event = {
      content: { name: 'Ibuprofen', doseValue: 400, doseUnit: 'mg', route: 'oral' },
      streamIds: ['medication-intake'],
      type: 'medication/basic'
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Ibuprofen — 400 mg, oral');
  });

  // ─── Convertible: mood ───────────────────────────────────────────

  describe('[EST20] convertible mood', () => {
    before(async () => {
      await model.converters.ensureEngine('mood');
    });

    it('[EST20a] mood from mira source — no autoConvert', async () => {
      const event = await model.converters.convertMethodToEvent('mood', 'mira', 'Happy');
      event.time = Date.now() / 1000;
      assert.equal(eventToShortText(event), 'Happy (Mira)');
    });

    it('[EST20b] mood from mira source — various labels', async () => {
      const expected = {
        Sad: 'Sad (Mira)',
        Excited: 'Excited (Mira)',
        Normal: 'Normal (Mira)',
        'Anxiety or panic attacks': 'Anxiety or panic attacks (Mira)',
      };
      for (const [label, exp] of Object.entries(expected)) {
        const event = await model.converters.convertMethodToEvent('mood', 'mira', label);
        event.time = Date.now() / 1000;
        assert.equal(eventToShortText(event), exp, `Failed for: ${label}`);
      }
    });

    it('[EST20c] mood raw vector — uses stop labels sorted by weight + confidence', () => {
      const event = {
        content: { vectors: { valence: 1.0, arousal: 0.9, dominance: 0.8, socialOrientation: 0.7, temporalFocus: 0.6 } },
        streamIds: ['wellbeing-mood'],
        type: 'mood/5d-vectors'
      };
      const result = eventToShortText(event);
      // valence(w=0.30)→Very pleasant, arousal(w=0.25)→Very energized, dominance(w=0.20)→In control
      assert.ok(result.startsWith('Very pleasant, Very energized, In control'), `Expected start, got: ${result}`);
    });

    it('[EST20d] mood raw vector — neutral baseline is 100% (exact stops)', () => {
      const event = {
        content: { vectors: { valence: 0.5, arousal: 0.5, dominance: 0.5, socialOrientation: 0.5, temporalFocus: 0.5 } },
        streamIds: ['wellbeing-mood'],
        type: 'mood/5d-vectors'
      };
      // All values match exact stops → 100% → no % shown. All 5 dimensions resolved.
      assert.equal(eventToShortText(event), 'Neutral, Moderate, Neutral, Balanced, Present');
    });

    it('[EST20e] mood raw vector — depressed shows confidence', () => {
      const event = {
        content: { vectors: { valence: 0.1, arousal: 0.1, dominance: 0.1, socialOrientation: 0.2, temporalFocus: 0.1 } },
        streamIds: ['wellbeing-mood'],
        type: 'mood/5d-vectors'
      };
      const result = eventToShortText(event);
      assert.ok(result.startsWith('Very unpleasant, Very calm, Powerless'), `Expected start, got: ${result}`);
      assert.ok(result.includes('%'), `Expected confidence %, got: ${result}`);
    });
  });

  // ─── Convertible: cervical fluid ─────────────────────────────────

  describe('[EST21] convertible cervical fluid', () => {
    before(async () => {
      await model.converters.ensureEngine('cervical-fluid');
    });

    it('[EST21a] mucus from mira source — no autoConvert', async () => {
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Creamy');
      event.time = Date.now() / 1000;
      assert.equal(eventToShortText(event), 'Creamy (Mira)');
    });

    it('[EST21b] mucus from mira source — various labels', async () => {
      const labels = ['No discharge', 'Dry', 'Sticky', 'Watery', 'Raw Egg White'];
      for (const label of labels) {
        const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', label);
        event.time = Date.now() / 1000;
        assert.equal(eventToShortText(event), `${label} (Mira)`, `Failed for: ${label}`);
      }
    });

    it('[EST21c] mucus from appleHealth source — label localized', async () => {
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'appleHealth', 'eggWhite');
      event.time = Date.now() / 1000;
      // "eggWhite" value resolves to "Egg White" label
      assert.equal(eventToShortText(event), 'Egg White (Apple Health)');
    });

    it('[EST21d] mucus from creighton source — label localized', async () => {
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'creighton', '10KL');
      event.time = Date.now() / 1000;
      const result = eventToShortText(event);
      // Creighton 10KL has a descriptive label in its method definition
      assert.ok(result.includes('Creighton Model'), `Expected method name, got: ${result}`);
      assert.ok(result.includes('10KL'), `Expected observation value, got: ${result}`);
    });
  });

  // ─── Convertible: autoConvert via eventToShortText ──

  describe('[EST22] convertible autoConvert in eventToShortText', () => {
    before(async () => {
      await model.converters.ensureEngine('mood');
      await model.converters.ensureEngine('cervical-fluid');
    });

    afterEach(() => {
      HDSSettings.unhook();
    });

    it('[EST22a] no autoConvert — shows sourceData + method name', async () => {
      const event = await model.converters.convertMethodToEvent('mood', 'mira', 'Excited');
      event.time = Date.now() / 1000;
      assert.equal(eventToShortText(event), 'Excited (Mira)');
    });

    it('[EST22b] autoConvert same method — shows sourceData + method name (no conversion)', async () => {
      HDSSettings._testInject('converter-auto-wellbeing-mood', 'mira');
      const event = await model.converters.convertMethodToEvent('mood', 'mira', 'Happy');
      event.time = Date.now() / 1000;
      assert.equal(eventToShortText(event), 'Happy (Mira)');
    });

    it('[EST22c] autoConvert mood mira→hds — shows stop labels with target <- source', async () => {
      HDSSettings._testInject('converter-auto-wellbeing-mood', 'hds');
      const event = await model.converters.convertMethodToEvent('mood', 'mira', 'Happy');
      event.time = Date.now() / 1000;
      const result = eventToShortText(event);
      assert.ok(result.includes('Pleasant'), `Expected stop label, got: ${result}`);
      assert.ok(result.includes('HDS Native <- Mira'), `Expected target <- source, got: ${result}`);
      assert.ok(result.includes('%'), `Expected confidence %, got: ${result}`);
    });

    it('[EST22d] autoConvert cervical fluid mira→appleHealth — localized label + perfect match', async () => {
      HDSSettings._testInject('converter-auto-body-vulva-mucus-inspect', 'appleHealth');
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Creamy');
      event.time = Date.now() / 1000;
      // "creamy" value should resolve to "Creamy" label from appleHealth method
      assert.equal(eventToShortText(event), 'Creamy (Apple Health <- Mira)');
    });

    it('[EST22e] autoConvert cervical fluid mira→billings — localized label + partial match', async () => {
      HDSSettings._testInject('converter-auto-body-vulva-mucus-inspect', 'billings');
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Watery');
      event.time = Date.now() / 1000;
      const result = eventToShortText(event);
      // billings "wetSlippery" value should have a localized label
      assert.ok(!result.includes('wetSlippery'), `Should use label not value, got: ${result}`);
      assert.ok(result.includes('Billings (BOM) <- Mira'), `Expected target <- source, got: ${result}`);
      assert.ok(result.includes('%'), `Expected confidence %, got: ${result}`);
    });

    it('[EST22f] autoConvert raw vector (no source) — shows result + target name', async () => {
      HDSSettings._testInject('converter-auto-wellbeing-mood', 'mira');
      const event = {
        content: { vectors: { valence: 0.8, arousal: 0.2, dominance: 0.7, socialOrientation: 0.5, temporalFocus: 0.3 } },
        streamIds: ['wellbeing-mood'],
        type: 'mood/5d-vectors',
        time: Date.now() / 1000
      };
      const result = eventToShortText(event);
      assert.ok(result.includes('Mira'), `Expected target method name, got: ${result}`);
      assert.ok(result.includes('%'), `Expected confidence %, got: ${result}`);
    });

    it('[EST22g] all cervical fluid mira→appleHealth labels are capitalized', async () => {
      HDSSettings._testInject('converter-auto-body-vulva-mucus-inspect', 'appleHealth');
      const pairs = [
        ['No discharge', 'Dry'], ['Dry', 'Dry'], ['Sticky', 'Sticky'],
        ['Creamy', 'Creamy'], ['Watery', 'Watery'], ['Raw Egg White', 'Egg White'],
      ];
      for (const [mira, expectedLabel] of pairs) {
        const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', mira);
        event.time = Date.now() / 1000;
        const result = eventToShortText(event);
        assert.ok(result.startsWith(expectedLabel), `${mira} → expected "${expectedLabel}...", got: "${result}"`);
      }
    });

    it('[EST22h] cervical fluid source labels are localized from method definition', async () => {
      // appleHealth source "eggWhite" should show as "Egg White" (label), not "eggWhite" (value)
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'appleHealth', 'eggWhite');
      event.time = Date.now() / 1000;
      const result = eventToShortText(event);
      assert.equal(result, 'Egg White (Apple Health)');
    });

    it('[EST22i] cervical fluid creighton source shows localized label', async () => {
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'creighton', '10KL');
      event.time = Date.now() / 1000;
      const result = eventToShortText(event);
      // creighton "10KL" has a label in its method definition
      assert.ok(result.includes('Creighton Model'), `Expected method name, got: ${result}`);
    });
  });
});
