import { assert } from './test-utils/deps-node.js';
// Import via the package entry point, like every other test file: a default import
// straight from the .ts resolves to the module namespace under webpack (no .unhook),
// which failed the browser suite while Node passed.
import { eventToShortText, eventToShortTextWithOrigin, HDSSettings } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

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
    // 'Kg' is the mass/kg symbol of the published model (it should read 'kg', upstream data-model fix pending);
    // update this assertion when the pack ships the corrected symbol.
    assert.equal(result, '60 Kg');
  });

  describe('[EST27] number.display: multiplier and suffix as on entry (B-2026-10-26-22)', () => {
    afterEach(() => {
      HDSSettings.unhook();
      resetPreferredLocales();
    });

    const ev = (key, content) => {
      const itemDef = model.itemsDefs.forKey(key);
      assert.ok(itemDef?.data?.number?.display, `${key} should declare number.display in the published pack`);
      return { content, streamIds: [itemDef.data.streamId], type: itemDef.eventTypes[0] };
    };

    // AMH and vitamin D dropped their suffix in data-model 3.21.0 (unit variations), C-peptide in 3.30.0;
    // ferritin still declares one. C-peptide reads ng/mL either way (suffix before 3.30.0, option label after).
    it('[EST27a] ng/mL over µg/L: ferritin by its suffix, C-peptide by its suffix or (3.30.0+) its option label', () => {
      assert.equal(eventToShortText(ev('body-blood-serum-ferritin', 2.1)), '2.1 ng/mL');
      assert.equal(eventToShortText({ content: 30, streamIds: ['body-blood-serum-c-peptide'], type: 'concentration/ug-l' }), '30 ng/mL');
    });

    it('[EST27b] sperm concentration reads 10⁶/mL, not the G/L symbol of concentration/megacount-ml', () => {
      assert.equal(eventToShortText(ev('body-semen-concentration', 15)), '15 10⁶/mL');
    });

    it('[EST27c] a multiplier scales the value without float noise (HbA1c, hematocrit)', () => {
      assert.equal(eventToShortText(ev('body-blood-hba1c', 0.057)), '5.7 %');
      assert.equal(eventToShortText(ev('body-blood-cbc-hematocrit', 0.42)), '42 %');
      assert.equal(eventToShortText(ev('body-blood-cbc-hematocrit', 0.29)), '29 %');
    });

    it('[EST27d] the suffix is localized', () => {
      setPreferredLocales(['fr']);
      assert.equal(eventToShortText(ev('body-blood-serum-ferritin', 2.1)), '2.1 ng/mL');
    });

    it('[EST27e] a display item is not converted to another unit system (it states how it reads)', () => {
      HDSSettings._testInject('unitSystem', 'imperial');
      assert.equal(eventToShortText(ev('lifestyle-alcohol-typical-quantity', 14)), '14 g');
    });

    it('[EST27f] items without display are unchanged', () => {
      assert.equal(eventToShortText({ content: 12.5, streamIds: ['fertility-hormone-lh'], type: 'concentration/iu-l' }), '12.5 IU/L');
      assert.equal(eventToShortText({ content: 60, streamIds: ['body-weight'], type: 'mass/kg' }), '60 Kg');
    });

    it('[EST27g] eventToShortTextWithOrigin gives the same text, no origin', () => {
      const event = ev('body-semen-concentration', 15);
      assert.deepEqual(eventToShortTextWithOrigin(event), { text: '15 10⁶/mL', origin: null });
    });
  });

  describe('[EST28] variation option label as the unit (B-2026-10-27-4)', () => {
    afterEach(() => {
      HDSSettings.unhook();
      resetPreferredLocales();
    });

    /** An event of `key` in variation `eventType`, checked against the published pack */
    const ev = (key, eventType, content) => {
      const itemDef = model.itemsDefs.forKey(key);
      const options = itemDef?.data?.variations?.eventType?.options ?? [];
      assert.ok(options.some(o => o.value === eventType), `${key} should offer ${eventType} as a variation in the published pack`);
      return { content, streamIds: [itemDef.data.streamId], type: eventType };
    };

    it('[EST28a] AMH, progesterone on concentration/ug-l read the option label ng/mL, not µg/L', () => {
      assert.equal(eventToShortText(ev('body-blood-serum-amh', 'concentration/ug-l', 2.1)), '2.1 ng/mL');
      assert.equal(eventToShortText(ev('body-blood-serum-progesterone', 'concentration/ug-l', 12)), '12 ng/mL');
      assert.equal(eventToShortText(ev('body-blood-serum-vitamin-d-25oh', 'concentration/ug-l', 30)), '30 ng/mL');
    });

    it('[EST28b] prolactin on concentration/uiu-ml reads mIU/L (option label), on ug-l ng/mL', () => {
      assert.equal(eventToShortText(ev('body-blood-serum-prolactin', 'concentration/uiu-ml', 250)), '250 mIU/L');
      assert.equal(eventToShortText(ev('body-blood-serum-prolactin', 'concentration/ug-l', 12)), '12 ng/mL');
    });

    it('[EST28c] the other variation of the same item reads its own option label', () => {
      assert.equal(eventToShortText(ev('body-blood-serum-amh', 'concentration/pmol-l', 15)), '15 pmol/L');
      assert.equal(eventToShortText(ev('body-blood-serum-progesterone', 'concentration/nmol-l', 38)), '38 nmol/L');
    });

    it('[EST28d] the label is localized', () => {
      setPreferredLocales(['fr']);
      assert.equal(eventToShortText(ev('body-blood-serum-amh', 'concentration/ug-l', 2.1)), '2.1 ng/mL');
    });

    it('[EST28e] non-concentration variations keep the eventType symbol and the unit-system conversion', () => {
      // body-weight / body-height option labels are form words (Lbs, Feet), not symbols
      assert.equal(eventToShortText(ev('body-weight', 'mass/kg', 60)), '60 Kg');
      assert.equal(eventToShortText(ev('body-weight', 'mass/lb', 130)), '130 lb');
      assert.equal(eventToShortText(ev('body-height', 'length/ft', 5.5)), '5.5 ft');
      HDSSettings._testInject('unitSystem', 'imperial');
      assert.match(eventToShortText(ev('body-weight', 'mass/kg', 60)), / lb$/);
    });

    it('[EST28f] items without variations are unchanged (LH, ferritin with number.display)', () => {
      assert.equal(eventToShortText({ content: 12.5, streamIds: ['fertility-hormone-lh'], type: 'concentration/iu-l' }), '12.5 IU/L');
      const ferritin = model.itemsDefs.forKey('body-blood-serum-ferritin');
      assert.equal(ferritin.data.variations, undefined, 'ferritin should have no variations in the published pack');
      assert.equal(eventToShortText({ content: 2.1, streamIds: [ferritin.data.streamId], type: 'concentration/ug-l' }), '2.1 ng/mL');
    });

    it('[EST28g] without an itemDef the eventType symbol is used', () => {
      assert.equal(eventToShortText({ content: 2.1, streamIds: ['not-an-item'], type: 'concentration/ug-l' }), '2.1 µg/L');
    });

    it('[EST28h] eventToShortTextWithOrigin gives the same text, no origin', () => {
      assert.deepEqual(eventToShortTextWithOrigin(ev('body-blood-serum-amh', 'concentration/ug-l', 2.1)), { text: '2.1 ng/mL', origin: null });
    });
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

  describe('[EST7D] date/iso-8601 content is the date shown (B-2026-10-26-6)', () => {
    afterEach(() => {
      HDSSettings.unhook();
    });

    const dobEvent = () => {
      const itemDef = model.itemsDefs.forKey('profile-date-of-birth');
      // entered on 2024-01-15 (local noon, the 15th in every zone), born on 1990-04-12
      return { content: '1990-04-12', streamIds: [itemDef.data.streamId], type: itemDef.eventTypes[0], time: new Date(2024, 0, 15, 12).getTime() / 1000 };
    };

    it('[EST7D1] the stored date, not the entry time', () => {
      assert.equal(eventToShortText(dobEvent()), '1990-04-12');
    });

    it('[EST7D2] the stored date in the resolved date format, without a time-zone shift', () => {
      HDSSettings._testInject('dateFormat', 'DD.MM.YYYY');
      assert.equal(eventToShortText(dobEvent()), '12.04.1990');
      HDSSettings._testInject('dateFormat', 'MM/DD/YYYY');
      assert.equal(eventToShortText({ ...dobEvent(), content: '1990-04-12T23:30:00Z' }), '04/12/1990');
    });

    it('[EST7D3] no stored date: the event time, as before', () => {
      assert.equal(eventToShortText({ ...dobEvent(), content: null }), '2024-01-15');
    });

    it('[EST7D4] an unparseable value falls back to the event time', () => {
      assert.equal(eventToShortText({ ...dobEvent(), content: 'unknown' }), '2024-01-15');
    });

    it('[EST7D5] without an itemDef, a date/iso-8601 string is formatted too', () => {
      HDSSettings._testInject('dateFormat', 'DD/MM/YYYY');
      assert.equal(eventToShortText({ content: '2001-02-03', streamIds: ['not-a-model-stream'], type: 'date/iso-8601', time: 1705320000 }), '03/02/2001');
    });

    it('[EST7D6] no stored date: the event time honours a partial date (site-agents#26)', () => {
      // 1999-03-01T12:00:00Z, known to the month
      const partial = { ...dobEvent(), content: null, time: 920289600, clientData: { hdsTimePrecision: 'month' } };
      assert.equal(eventToShortText(partial), 'March 1999');
    });
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

  it('[EST16a3] checkbox with a partial date has no time of day (site-agents#26)', () => {
    const base = { content: null, streamIds: ['fertility-cycles-start'], type: 'activity/plain', time: 920289600 };
    assert.equal(eventToShortText({ ...base, clientData: { hdsTimePrecision: 'year' } }), '1999');
    assert.equal(eventToShortText({ ...base, clientData: { hdsTimePrecision: 'day' } }), '1999-03-01');
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

  it('[EST15s] slider with display.multiplier+suffix (EQ VAS 0.73 → 73 /100)', () => {
    const itemDef = model.itemsDefs.forKey('wellbeing-self-rated-health');
    if (!itemDef || itemDef.data.type !== 'slider') {
      // Model not yet redeployed with slider — skip rather than fail
      return;
    }
    const event = { content: 0.73, streamIds: ['wellbeing-self-rated-health'], type: 'ratio/proportion' };
    const result = eventToShortText(event);
    // Multiplier 100, precision 0 → "73"; suffix "/100" → "73 /100"
    assert.ok(result === '73 /100' || result === '73', `Expected "73 /100" or "73", got: ${result}`);
  });

  it('[EST15s2] slider edge cases (min/max)', () => {
    const itemDef = model.itemsDefs.forKey('wellbeing-self-rated-health');
    if (!itemDef || itemDef.data.type !== 'slider') return;
    const min = eventToShortText({ content: 0, streamIds: ['wellbeing-self-rated-health'], type: 'ratio/proportion' });
    const max = eventToShortText({ content: 1, streamIds: ['wellbeing-self-rated-health'], type: 'ratio/proportion' });
    assert.ok(min === '0 /100' || min === '0', `min: ${min}`);
    assert.ok(max === '100 /100' || max === '100', `max: ${max}`);
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

  describe('[EST25] ratio/proportion: a select between hooks, a number as %', () => {
    const bleeding = (content) => {
      const itemDef = model.itemsDefs.forKey('body-vulva-bleeding');
      return { content, streamIds: [itemDef.data.streamId], type: itemDef.eventTypes[0] };
    };

    it('[EST25a] a bare select value between hooks reads as the nearest hook label (bleeding)', () => {
      assert.equal(eventToShortText(bleeding(0.5)), 'Moderate');
      assert.equal(eventToShortText(bleeding(0.62)), 'Moderate');
      assert.equal(eventToShortText(bleeding(0.7)), 'Heavy');
      assert.equal(eventToShortText(bleeding(0.1)), 'Spotting');
    });

    it('[EST25b] an exact hook is unchanged, and test-result/scale keeps its percentage', () => {
      assert.equal(eventToShortText(bleeding(0.55)), 'Moderate');
      assert.equal(eventToShortText({ content: 0.56, streamIds: ['fertility-test-opk'], type: 'test-result/scale' }), 'Positive 56%');
    });

    it('[EST25c] a ratio/proportion number reads as a percentage', () => {
      assert.equal(eventToShortText({ content: 0.057, streamIds: ['body-blood-hba1c'], type: 'ratio/proportion' }), '5.7 %');
      assert.equal(eventToShortText({ content: 1, streamIds: ['body-blood-hba1c'], type: 'ratio/proportion' }), '100 %');
    });

    it('[EST25d] without an itemDef, a ratio/proportion number reads as a percentage too', () => {
      assert.equal(eventToShortText({ content: 0.5, streamIds: ['not-a-model-stream'], type: 'ratio/proportion' }), '50 %');
    });
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

  it('[EST18] medication/basic composite (legacy flat) shows name + dose', () => {
    const event = {
      content: { name: 'Ibuprofen', doseValue: 400, doseUnit: 'mg', route: 'oral' },
      streamIds: ['medication-intake'],
      type: 'medication/basic'
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Ibuprofen — 400 mg, oral');
  });

  it('[EST18b] medication/basic composite (nested intake) shows name + dose', () => {
    const event = {
      content: { name: 'Ibuprofen', intake: { doseValue: 400, doseUnit: 'mg', route: 'oral' } },
      streamIds: ['medication-intake'],
      type: 'medication/basic'
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Ibuprofen — 400 mg, oral');
  });

  describe('[EST29] medication regimen: intake.frequency, asNeeded, note (data-model 3.23.0)', () => {
    afterEach(() => { resetPreferredLocales(); });

    it('[EST29a] medication/basic shows the frequency after dose and route', () => {
      const content = { name: 'Ibuprofen', intake: { doseValue: 400, doseUnit: 'mg', route: 'oral', frequency: { times: 3, period: 1, periodUnit: 'd' } } };
      assert.equal(eventToShortText({ content, streamIds: ['medication-intake'], type: 'medication/basic' }), 'Ibuprofen — 400 mg, oral, 3×/d');
    });

    it('[EST29b] a period above one is written out (every 48 h)', () => {
      const content = { name: 'Fentanyl patch', intake: { frequency: { times: 1, period: 48, periodUnit: 'h' } } };
      assert.equal(eventToShortText({ content, streamIds: ['medication-intake'], type: 'medication/basic' }), 'Fentanyl patch — 1×/48 h');
    });

    it('[EST29c] coded intake: frequency and as needed, localized', () => {
      setPreferredLocales(['fr']);
      const event = {
        content: { drug: { label: { en: 'Paracetamol' } }, intake: { doseValue: 1, doseUnit: 'dose/tablet', frequency: { times: 4, period: 1, periodUnit: 'd' }, asNeeded: true } },
        streamIds: ['medication-intake'],
        type: 'medication/coded-v1'
      };
      assert.equal(eventToShortText(event), 'Paracetamol — 1 tablet, 4×/d, si besoin');
    });

    it('[EST29d] the printed note shows only when there is no structured frequency', () => {
      const withNote = { name: 'Levothyroxine', intake: { note: 'one tablet every morning before breakfast' } };
      assert.equal(eventToShortText({ content: withNote, streamIds: ['medication-intake'], type: 'medication/basic' }), 'Levothyroxine — one tablet every morning befor...');
      const both = { name: 'Levothyroxine', intake: { note: 'every morning', frequency: { times: 1, period: 1, periodUnit: 'd' } } };
      assert.equal(eventToShortText({ content: both, streamIds: ['medication-intake'], type: 'medication/basic' }), 'Levothyroxine — 1×/d');
    });

    it('[EST29e] an incomplete frequency is not shown', () => {
      const content = { name: 'Ibuprofen', intake: { frequency: { times: 2 } } };
      assert.equal(eventToShortText({ content, streamIds: ['medication-intake'], type: 'medication/basic' }), 'Ibuprofen');
    });
  });

  it('[EST19] cervix-position composite labels each field', () => {
    const event = {
      content: { height: 1.0, firmness: 0.0, openness: 0.5 },
      streamIds: ['body-vulva-cervix-position'],
      type: 'cervix-position/3d-vectors'
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Height: High · Firmness: Firm · Openness: Medium');
  });

  it('[EST19b] cervix-position composite skips missing fields', () => {
    const event = {
      content: { height: 0.0 },
      streamIds: ['body-vulva-cervix-position'],
      type: 'cervix-position/3d-vectors'
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Height: Low');
  });

  it('[EST19c] cervix-position composite snaps continuous values to nearest stop', () => {
    const event = {
      content: { height: 0.13, firmness: 0.07, openness: 0.02 },
      streamIds: ['body-vulva-cervix-position'],
      type: 'cervix-position/3d-vectors'
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Height: Low · Firmness: Firm · Openness: Closed');
  });

  it('[EST19d] cervix-position composite snaps mid-range to Medium', () => {
    const event = {
      content: { height: 0.45, firmness: 0.6 },
      streamIds: ['body-vulva-cervix-position'],
      type: 'cervix-position/3d-vectors'
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Height: Medium · Firmness: Medium');
  });

  // ─── Blood pressure composite (Plan 77 / #19 §4) ─────────────────

  it('[EST23] blood pressure with pulse → "120/80 ♥72"', () => {
    const event = {
      content: { systolic: 120, diastolic: 80, rate: 72 },
      streamIds: ['body-blood-pressure'],
      type: 'blood-pressure/mmhg-bpm'
    };
    assert.equal(eventToShortText(event), '120/80 ♥72');
  });

  it('[EST23b] blood pressure without pulse → "120/80"', () => {
    const event = {
      content: { systolic: 120, diastolic: 80 },
      streamIds: ['body-blood-pressure'],
      type: 'blood-pressure/mmhg-bpm'
    };
    assert.equal(eventToShortText(event), '120/80');
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

    // B-2026-10-06-2: a partial vector was run through the _raw conversion, which invented the
    // missing dimensions ("Unpleasant, Very calm, Powerless, ... NaN%"), or, with no engine
    // loaded, dumped it raw ("valence:0.3").
    it('[EST20f] mood partial vector — labels only the dimensions present', () => {
      const event = { content: { vectors: { valence: 0.25 } }, streamIds: ['wellbeing-mood'], type: 'mood/5d-vectors' };
      assert.equal(eventToShortText(event), 'Valence: Unpleasant');
    });

    it('[EST20g] mood partial vector — several dimensions, between stops snap to the nearest option', () => {
      const event = { content: { vectors: { valence: 0.7, arousal: 0.25 } }, streamIds: ['wellbeing-mood'], type: 'mood/5d-vectors' };
      const result = eventToShortText(event);
      assert.equal(result, 'Valence: Pleasant · Energy: Calm');
      assert.ok(!result.includes('NaN'), `No NaN confidence, got: ${result}`);
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
      // (method label shortened to bare family name in data-model v1.10.3)
      assert.ok(result.includes('(Creighton)'), `Expected method name, got: ${result}`);
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
      HDSSettings._testInject('preferred-display-wellbeing-mood', 'mira');
      const event = await model.converters.convertMethodToEvent('mood', 'mira', 'Happy');
      event.time = Date.now() / 1000;
      assert.equal(eventToShortText(event), 'Happy (Mira)');
    });

    it('[EST22c] autoConvert mood mira→_raw — shows stop labels with target <- source', async () => {
      HDSSettings._testInject('preferred-display-wellbeing-mood', '_raw');
      const event = await model.converters.convertMethodToEvent('mood', 'mira', 'Happy');
      event.time = Date.now() / 1000;
      const result = eventToShortText(event);
      assert.ok(result.includes('Pleasant'), `Expected stop label, got: ${result}`);
      assert.ok(result.includes('HDS Native <- Mira'), `Expected target <- source, got: ${result}`);
      assert.ok(result.includes('%'), `Expected confidence %, got: ${result}`);
    });

    it('[EST22d] autoConvert cervical fluid mira→appleHealth — localized label + perfect match', async () => {
      HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'appleHealth');
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Creamy');
      event.time = Date.now() / 1000;
      // "creamy" value should resolve to "Creamy" label from appleHealth method
      assert.equal(eventToShortText(event), 'Creamy (Apple Health <- Mira)');
    });

    it('[EST22e] autoConvert cervical fluid mira→billings — localized label + partial match', async () => {
      HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'billings');
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Watery');
      event.time = Date.now() / 1000;
      const result = eventToShortText(event);
      // billings "wetSlippery" value should have a localized label
      assert.ok(!result.includes('wetSlippery'), `Should use label not value, got: ${result}`);
      // method label shortened to bare family name in data-model v1.10.3
      assert.ok(result.includes('Billings <- Mira'), `Expected target <- source, got: ${result}`);
      assert.ok(result.includes('%'), `Expected confidence %, got: ${result}`);
    });

    it('[EST22f] autoConvert raw vector (no source) — shows result + target name', async () => {
      HDSSettings._testInject('preferred-display-wellbeing-mood', 'mira');
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
      HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'appleHealth');
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
      // (method label shortened to bare family name in data-model v1.10.3)
      assert.ok(result.includes('(Creighton)'), `Expected method name, got: ${result}`);
    });
  });

  describe('[EST26] eventToShortTextWithOrigin: the conversion origin as fields (B-2026-10-26-17)', () => {
    before(async () => {
      await model.converters.ensureEngine('mood');
      await model.converters.ensureEngine('cervical-fluid');
    });

    afterEach(() => {
      HDSSettings.unhook();
    });

    it('[EST26a] shown as recorded: source fields, no target, no match; same text as eventToShortText', async () => {
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Creamy');
      const { text, origin } = eventToShortTextWithOrigin(event);
      assert.equal(text, eventToShortText(event));
      assert.equal(text, 'Creamy (Mira)');
      assert.deepEqual(origin, { sourceKey: 'mira', sourceName: 'Mira', sourceLabel: 'Creamy', targetKey: null, targetName: null, match: null });
    });

    it('[EST26b] converted with a perfect match: target fields and match 100 (the text omits it)', async () => {
      HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'appleHealth');
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Creamy');
      const { text, origin } = eventToShortTextWithOrigin(event);
      assert.equal(text, 'Creamy (Apple Health <- Mira)');
      assert.equal(text, eventToShortText(event));
      assert.equal(origin.sourceKey, 'mira');
      assert.equal(origin.sourceName, 'Mira');
      assert.equal(origin.targetKey, 'appleHealth');
      assert.equal(origin.targetName, 'Apple Health');
      assert.equal(origin.match, 100);
    });

    it('[EST26c] converted with a partial match: the match is the percentage in the text', async () => {
      HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'billings');
      const event = await model.converters.convertMethodToEvent('cervical-fluid', 'mira', 'Watery');
      const { text, origin } = eventToShortTextWithOrigin(event);
      assert.equal(origin.targetKey, 'billings');
      assert.ok(origin.match < 100, `expected a partial match, got ${origin.match}`);
      assert.ok(text.endsWith(`<- Mira ${origin.match}%)`), `text and match disagree: ${text} / ${origin.match}`);
    });

    it('[EST26d] same method as the display setting: shown as recorded', async () => {
      HDSSettings._testInject('preferred-display-wellbeing-mood', 'mira');
      const event = await model.converters.convertMethodToEvent('mood', 'mira', 'Happy');
      const { origin } = eventToShortTextWithOrigin(event);
      assert.equal(origin.sourceKey, 'mira');
      assert.equal(origin.targetKey, null);
      assert.equal(origin.match, null);
    });

    it('[EST26e] a raw vector: no source, shown through _raw with its match', () => {
      const event = {
        content: { vectors: { valence: 0.9, arousal: 0.3, dominance: 0.6, socialOrientation: 0, temporalFocus: 0 } },
        streamIds: ['wellbeing-mood'],
        type: 'mood/5d-vectors'
      };
      const { text, origin } = eventToShortTextWithOrigin(event);
      assert.equal(text, eventToShortText(event));
      assert.equal(origin.sourceKey, null);
      assert.equal(origin.sourceName, null);
      assert.equal(origin.targetKey, '_raw');
      assert.equal(typeof origin.match, 'number');
    });

    it('[EST26f] a non-convertible event has no origin', () => {
      assert.deepEqual(eventToShortTextWithOrigin({ content: 60, streamIds: ['body-weight'], type: 'mass/kg' }), { text: '60 Kg', origin: null });
      assert.deepEqual(eventToShortTextWithOrigin(null), { text: null, origin: null });
    });
  });

  describe('[EST24] multi-select (data-model 3.0.0, site-agents#9/#10)', () => {
    it('[EST24a] joins the localized labels of every selected value', () => {
      const event = {
        content: ['white', 'hispanic-latino'],
        streamIds: ['profile-ethnicity'],
        type: 'attributes/ethnicity'
      };
      assert.equal(eventToShortText(event), 'White, Hispanic or Latino');
    });

    it('[EST24b] a single-element array is not decorated', () => {
      const event = {
        content: ['asian'],
        streamIds: ['profile-ethnicity'],
        type: 'attributes/ethnicity'
      };
      assert.equal(eventToShortText(event), 'Asian');
    });

    it('[EST24c] tolerates a scalar written before the item became multi-valued', () => {
      // Backfill has not necessarily run everywhere; a legacy scalar must still
      // render its label rather than raw content.
      const event = {
        content: 'mira',
        streamIds: ['fertility-tracking-method'],
        type: 'fertility/tracking-method-v1'
      };
      assert.equal(eventToShortText(event), 'Mira');
    });

    it('[EST24d] concurrent tracking methods all appear', () => {
      const event = {
        content: ['sympto-thermal', 'mira'],
        streamIds: ['fertility-tracking-method'],
        type: 'fertility/tracking-method-v1'
      };
      const result = eventToShortText(event);
      assert.ok(result.includes('Sympto-Thermal'), `got: ${result}`);
      assert.ok(result.includes('Mira'), `got: ${result}`);
    });

    it('[EST24e] an unknown value falls back to the raw value', () => {
      const event = {
        content: ['white', 'not-a-category'],
        streamIds: ['profile-ethnicity'],
        type: 'attributes/ethnicity'
      };
      assert.equal(eventToShortText(event), 'White, not-a-category');
    });
  });
});
