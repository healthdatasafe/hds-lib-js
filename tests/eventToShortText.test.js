import { assert } from './test-utils/deps-node.js';

const modelURL = 'https://model.datasafe.dev/pack.json';
import { HDSModel, eventToShortText } from '../js/index.js';

describe('[ESTX] eventToShortText', () => {
  let model;
  before(async () => {
    model = new HDSModel(modelURL);
    await model.load();
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
    const itemDef = model.itemsDefs.forKey('body-vulva-mucus-inspect');
    assert.ok(itemDef, 'itemDef should exist');
    const event = {
      content: 'clear',
      streamIds: [itemDef.data.streamId],
      type: itemDef.eventTypes[0]
    };
    const result = eventToShortText(event);
    assert.equal(result, 'Clear');
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

  it('[EST16a] checkbox with null content returns date', () => {
    const event = { content: null, streamIds: ['fertility-cycles-start'], type: 'activity/plain', time: 1720000000 };
    const result = eventToShortText(event);
    assert.ok(result, 'Should return a date string');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result), `Expected ISO date, got: ${result}`);
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
});
