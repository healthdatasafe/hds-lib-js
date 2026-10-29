import { assert } from './test-utils/deps-node.js';
import { eventToShortText, labComparatorOf, isExactLabValue, labNumberOf, labUnitText, labValueToFhir, labLoincOf, labSeriesKey, isValidLoincCode, checkLabResultCoded, cmcFormSpec } from '../ts/index.ts';
import { getModel, resetModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

/**
 * Lab results (site-agents#22 #28, data-model 3.27.0): a printed limit (`hdsComparator` / `comparator`), coded
 * results with no item of their own (`lab-result/coded-v1`), and `type: imported` items.
 */

const modelURL = 'https://model.datasafe.dev/pack.json';

function makeModel () {
  return {
    items: {
      'body-blood-serum-ferritin': {
        version: 'v1',
        label: { en: 'Ferritin' },
        description: { en: 'Ferritin in serum.' },
        streamId: 'body-blood-serum-ferritin',
        type: 'number',
        variations: { eventType: { options: [{ value: 'concentration/ug-l', label: { en: 'ng/mL' } }, { value: 'concentration/pmol-l', label: { en: 'pmol/L' } }] } },
        references: { loinc: ['2276-4', '24373-3'] }
      },
      'body-blood-hba1c': {
        version: 'v1',
        label: { en: 'HbA1c' },
        description: { en: 'Glycated hemoglobin.' },
        streamId: 'body-blood-hba1c',
        eventType: 'ratio/proportion',
        type: 'number',
        number: { display: { multiplier: 100, suffix: { en: '%' } } }
      },
      'body-blood-coded': {
        version: 'v1',
        label: { en: 'Other blood results' },
        description: { en: 'Blood test results that have no field of their own.' },
        streamId: 'body-blood-coded',
        eventType: 'lab-result/coded-v1',
        type: 'imported',
        repeatable: 'unlimited'
      },
      'sync-status': {
        version: 'v1',
        label: { en: 'Sync status' },
        description: { en: 'A connector status.' },
        streamId: 'sync-status',
        eventType: 'sync-status/v1',
        type: 'system'
      },
      'future-thing': {
        version: 'v1',
        label: { en: 'Future thing' },
        description: { en: 'A type this version does not know.' },
        streamId: 'future-thing',
        eventType: 'note/txt',
        type: 'hologram'
      },
      'old-ferritin': {
        version: 'v1',
        label: { en: 'Old ferritin' },
        description: { en: 'Deprecated.' },
        streamId: 'old-ferritin',
        eventType: 'concentration/ug-l',
        type: 'number',
        deprecated: true,
        references: { loinc: '2947-0' }
      },
      'body-blood-serum-glucose-random': {
        version: 'v1',
        label: { en: 'Glucose (random)' },
        description: { en: 'Blood sugar.' },
        streamId: 'body-blood-serum-glucose-random',
        type: 'number',
        variations: {
          eventType: {
            options: [
              { value: 'concentration/mg-dl', label: { en: 'mg/dL' }, loinc: '2345-7' },
              { value: 'concentration/mmol-l', label: { en: 'mmol/L' }, loinc: '14749-6' },
              { value: 'concentration/umol-l', label: { en: 'μmol/L' }, loinc: null }
            ]
          }
        },
        references: { loinc: ['2345-7', '14749-6'], loincMethod: ['41653-7'] }
      },
      'body-blood-coagulation-inr': {
        version: 'v1',
        label: { en: 'INR' },
        description: { en: 'International normalized ratio.' },
        streamId: 'body-blood-coagulation-inr',
        eventType: 'ratio/generic',
        type: 'number',
        ratioRelativeTo: 1,
        references: { loinc: ['6301-6'] }
      },
      'body-ratio-other': {
        version: 'v1',
        label: { en: 'Another ratio' },
        description: { en: 'A number ratio without a UCUM code of its own.' },
        streamId: 'body-ratio-other',
        eventType: 'ratio/generic',
        type: 'number',
        ratioRelativeTo: 1
      },
      'fertility-ratio-scale': {
        version: 'v1',
        label: { en: 'A scale' },
        description: { en: 'A select on ratio/generic.' },
        streamId: 'fertility-ratio-scale',
        eventType: 'ratio/generic',
        type: 'select',
        options: [{ value: 0, label: { en: 'none' } }, { value: 8, label: { en: 'max' } }],
        ratioRelativeTo: 8
      }
    },
    streams: [
      { id: 'body', name: 'Body', parentId: null },
      { id: 'body-blood', name: 'Blood', parentId: 'body' },
      { id: 'body-blood-serum-ferritin', name: 'Ferritin', parentId: 'body-blood' },
      { id: 'body-blood-hba1c', name: 'HbA1c', parentId: 'body-blood' },
      { id: 'body-blood-coded', name: 'Other blood results', parentId: 'body-blood' },
      { id: 'sync-status', name: 'Sync', parentId: null },
      { id: 'future-thing', name: 'Future', parentId: null },
      { id: 'old-ferritin', name: 'Old', parentId: null },
      { id: 'body-blood-serum-glucose-random', name: 'Glucose (random)', parentId: 'body-blood' },
      { id: 'body-blood-coagulation', name: 'Coagulation', parentId: 'body-blood' },
      { id: 'body-blood-coagulation-inr', name: 'INR', parentId: 'body-blood-coagulation' },
      { id: 'body-ratio-other', name: 'Another ratio', parentId: 'body' },
      { id: 'fertility-ratio-scale', name: 'A scale', parentId: null }
    ]
  };
}

const hiv = {
  label: { en: 'HIV-1 RNA (viral load)' },
  codes: [{ system: 'http://loinc.org', code: '20447-9' }]
};
const coded = (content) => ({ streamIds: ['body-blood-coded'], type: 'lab-result/coded-v1', content });
const ferritin = (content, clientData) => ({ streamIds: ['body-blood-serum-ferritin'], type: 'concentration/ug-l', content, clientData });

describe('[LABR] lab results', () => {
  let model;
  before(() => {
    resetModel();
    model = getModel();
    model.loadFromObject(makeModel());
  });
  after(async () => {
    resetModel();
    await getModel().load(modelURL);
  });

  it('[LABR-1] labComparatorOf reads clientData on items, content on coded results', () => {
    assert.equal(labComparatorOf(ferritin(1.5, { hdsComparator: '<' })), '<');
    assert.equal(labComparatorOf(ferritin(1.5)), null);
    for (const bad of ['=', '≤', ' <']) assert.equal(labComparatorOf(ferritin(1.5, { hdsComparator: bad })), 'unknown');
    const c = coded({ analyte: hiv, value: 20, comparator: '<', unit: '{copies}/mL' });
    assert.equal(labComparatorOf(c), '<');
    assert.equal(labComparatorOf({ ...coded({ analyte: hiv, value: 20, unit: '{copies}/mL' }), clientData: { hdsComparator: '>' } }), null);
  });

  it('[LABR-1b] isExactLabValue: false when censored, unknown or not a number', () => {
    assert.equal(isExactLabValue(ferritin(30)), true);
    assert.equal(isExactLabValue(ferritin(1.5, { hdsComparator: '<' })), false);
    assert.equal(isExactLabValue(ferritin(1.5, { hdsComparator: '=' })), false);
    assert.equal(isExactLabValue(coded({ analyte: hiv, value: 20, unit: '{copies}/mL' })), true);
    assert.equal(isExactLabValue(coded({ analyte: hiv, valueText: 'not detected' })), false);
  });

  it('[LABR-2] eventToShortText shows the comparator and the coded result', () => {
    assert.equal(eventToShortText(ferritin(1.5, { hdsComparator: '<' })), '< 1.5 ng/mL');
    assert.equal(eventToShortText(ferritin(1.5, { hdsComparator: '≤' })), '? 1.5 ng/mL');
    assert.equal(eventToShortText(ferritin(30)), '30 ng/mL');
    assert.equal(eventToShortText(coded({ analyte: hiv, value: 20, comparator: '<', unit: '{copies}/mL' })), 'HIV-1 RNA (viral load) < 20 copies/mL');
    assert.equal(eventToShortText(coded({ analyte: { label: { en: 'HBsAg' }, codes: [{ system: 'http://loinc.org', code: '5196-1' }] }, valueText: 'negative' })), 'HBsAg: negative');
    assert.equal(eventToShortText(coded({ analyte: { label: { en: 'Rubella IgG' }, codes: [{ system: 'urn:oid:1.2.3', code: 'RUB' }] }, value: 3.2, unit: '{index}', valueText: 'positive' })), 'Rubella IgG 3.2 index (positive)');
    // shown the same on a stream with no item (the items ship one data-model release later)
    assert.equal(eventToShortText({ ...coded({ analyte: hiv, value: 20, unit: '{copies}/mL' }), streamIds: ['body-blood'] }), 'HIV-1 RNA (viral load) 20 copies/mL');
  });

  // data-model 3.33.0: INR is a number item on ratio/generic, its content `{ value, relativeTo: 1 }`
  const inr = (value, clientData) => ({ streamIds: ['body-blood-coagulation-inr'], type: 'ratio/generic', content: { value, relativeTo: 1 }, clientData });

  it('[LABR-RGEN-1] a number item on ratio/generic reads content.value', () => {
    assert.equal(labNumberOf(inr(2.5)), 2.5);
    assert.equal(labNumberOf(ferritin(30)), 30);
    assert.equal(labNumberOf(coded({ analyte: hiv, value: 20, unit: '{copies}/mL' })), 20);
    assert.equal(labNumberOf(coded({ analyte: hiv, valueText: 'not detected' })), null);
    assert.equal(labNumberOf({ ...inr(2.5), content: 2.5 }), null);
    // a select's scale is a numerator over its denominator, not a lab figure
    assert.equal(labNumberOf({ streamIds: ['fertility-ratio-scale'], type: 'ratio/generic', content: { value: 4, relativeTo: 8 } }), null);
    assert.equal(isExactLabValue({ streamIds: ['fertility-ratio-scale'], type: 'ratio/generic', content: { value: 4, relativeTo: 8 } }), false);
    assert.equal(labNumberOf({ ...inr(2.5), content: { value: 2.5, relativeTo: 2 } }), null);
    assert.equal(isExactLabValue(inr(2.5)), true);
    assert.equal(isExactLabValue(inr(8, { hdsComparator: '>' })), false);
  });

  it('[LABR-RGEN-2] eventToShortText: the value with its comparator, never [object Object]', () => {
    assert.equal(eventToShortText(inr(2.5)), '2.5');
    assert.equal(eventToShortText(inr(8, { hdsComparator: '>' })), '> 8');
    // a select on ratio/generic keeps its "value/relativeTo label" text
    assert.equal(eventToShortText({ streamIds: ['fertility-ratio-scale'], type: 'ratio/generic', content: { value: 8, relativeTo: 8 } }), '8/8 max');
  });

  it('[LABR-RGEN-3] labValueToFhir: INR as UCUM {INR}, a select scale gives nothing', () => {
    assert.deepEqual(labValueToFhir(inr(2.5)), { valueQuantity: { value: 2.5, unit: 'INR', system: 'http://unitsofmeasure.org', code: '{INR}' } });
    assert.deepEqual(labValueToFhir(inr(8, { hdsComparator: '>' })),
      { valueQuantity: { value: 8, comparator: '>', unit: 'INR', system: 'http://unitsofmeasure.org', code: '{INR}' } });
    assert.equal(labValueToFhir(inr(8, { hdsComparator: '=' })), null);
    assert.deepEqual(labValueToFhir({ streamIds: ['body-ratio-other'], type: 'ratio/generic', content: { value: 1.4, relativeTo: 1 } }),
      { valueQuantity: { value: 1.4, system: 'http://unitsofmeasure.org', code: '1' } });
    assert.equal(labValueToFhir({ streamIds: ['fertility-ratio-scale'], type: 'ratio/generic', content: { value: 8, relativeTo: 8 } }), null);
    assert.equal(labValueToFhir({ ...inr(2.5), content: { value: 2.5, relativeTo: 2 } }), null);
    assert.equal(labLoincOf(inr(2.5)), '6301-6');
    assert.equal(labSeriesKey(inr(2.5)), 'body-blood-coagulation-inr');
  });

  it('[LABR-2b] labUnitText prefers unitText, else a readable UCUM code', () => {
    assert.equal(labUnitText({ unit: 'umol/L', unitText: 'µmol/l' }), 'µmol/l');
    assert.equal(labUnitText({ unit: 'umol/L' }), 'µmol/L');
    assert.equal(labUnitText({ unit: 'u[IU]/mL' }), 'µIU/mL');
    assert.equal(labUnitText({ unit: '[IU]/L' }), 'IU/L');
    assert.equal(labUnitText({ unit: '10*9/L' }), '10^9/L');
    assert.equal(labUnitText({ unit: 'U/L' }), 'U/L');
    assert.equal(labUnitText({ unit: '/uL' }), '/µL');
    assert.equal(labUnitText({ unit: 'mmol/mol{creat}' }), 'mmol/mol');
    assert.equal(labUnitText({ unit: '10*3{cells}/uL' }), '10^3/µL');
    assert.equal(labUnitText({ unit: 'mL/min/{1.73_m2}' }), 'mL/min/1.73 m2');
    assert.equal(labUnitText({ unit: 'Cel' }), '°C');
    assert.equal(labUnitText({ unit: '%' }), '%');
    assert.equal(labUnitText({ unit: '1' }), null);
  });

  it('[LABR-3] labValueToFhir: comparator only when censored, UCUM only on coded', () => {
    assert.deepEqual(labValueToFhir(ferritin(1.5, { hdsComparator: '<' })), { valueQuantity: { value: 1.5, comparator: '<', unit: 'ng/mL' } });
    assert.deepEqual(labValueToFhir(ferritin(30)), { valueQuantity: { value: 30, unit: 'ng/mL' } });
    assert.equal(labValueToFhir(ferritin(1.5, { hdsComparator: '=' })), null);
    assert.deepEqual(labValueToFhir(coded({ analyte: hiv, value: 20, comparator: '<', unit: '{copies}/mL' })),
      { valueQuantity: { value: 20, comparator: '<', unit: 'copies/mL', system: 'http://unitsofmeasure.org', code: '{copies}/mL' } });
    const negative = { system: 'http://snomed.info/sct', version: 'http://snomed.info/sct/900000000000207008', code: '260385009', display: 'Negative' };
    const labCode = { system: 'urn:oid:1.2.3', code: 'NEG' };
    assert.deepEqual(labValueToFhir(coded({ analyte: hiv, valueText: 'négatif', valueCodes: [negative, labCode] })),
      { valueCodeableConcept: { coding: [negative, labCode], text: 'négatif' } });
    assert.deepEqual(labValueToFhir(coded({ analyte: hiv, valueText: '1:160' })), { valueString: '1:160' });
    assert.deepEqual(labValueToFhir(coded({ analyte: hiv, value: 3.2, unit: '{index}', valueText: 'positive' })),
      { valueQuantity: { value: 3.2, unit: 'index', system: 'http://unitsofmeasure.org', code: '{index}' }, note: 'positive' });
    // an item event reads as it displays: a fraction stored 0..1 exports as a percentage
    assert.deepEqual(labValueToFhir({ streamIds: ['body-blood-hba1c'], type: 'ratio/proportion', content: 0.057, clientData: { hdsComparator: '<' } }),
      { valueQuantity: { value: 5.7, comparator: '<', unit: '%' } });
    assert.equal(labValueToFhir({ streamIds: ['x'], type: 'note/txt', content: 'hello' }), null);
  });

  it('[LABR-4] labSeriesKey never merges analytes or units', () => {
    // an item with several units: one series per unit
    assert.equal(labSeriesKey(ferritin(30)), 'body-blood-serum-ferritin|concentration/ug-l');
    assert.equal(labSeriesKey({ ...ferritin(67), type: 'concentration/pmol-l' }), 'body-blood-serum-ferritin|concentration/pmol-l');
    assert.equal(labSeriesKey({ streamIds: ['body-blood-hba1c'], type: 'ratio/proportion', content: 0.057 }), 'body-blood-hba1c');
    const a = labSeriesKey(coded({ analyte: hiv, value: 20, unit: '{copies}/mL' }));
    const b = labSeriesKey(coded({ analyte: { label: { en: 'Vancomycin' }, codes: [{ system: 'http://loinc.org', code: '20578-1' }] }, value: 12, unit: 'mg/L' }));
    const c = labSeriesKey(coded({ analyte: hiv, value: 1.3, unit: '{log_copies}/mL' }));
    assert.equal(a, 'body-blood-coded|http://loinc.org|20447-9|{copies}/mL');
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  it('[LABR-5] forLoinc / checkLabResultCoded', () => {
    assert.equal(model.itemsDefs.forLoinc('24373-3').key, 'body-blood-serum-ferritin');
    assert.equal(model.itemsDefs.forLoinc('2947-0'), null, 'deprecated items own nothing');
    assert.equal(model.itemsDefs.forLoinc('20447-9'), null);
    assert.deepEqual(checkLabResultCoded(coded({ analyte: { label: { en: 'Ferritin' }, codes: [{ system: 'http://loinc.org', code: '2276-4' }] }, value: 30, unit: 'ug/L' })),
      [{ code: 'owned-by-item', itemKey: 'body-blood-serum-ferritin', loinc: '2276-4' }]);
    assert.deepEqual(checkLabResultCoded(coded({ analyte: { label: { en: 'X' }, codes: [{ system: 'urn:oid:1.2.3', code: 'X' }] }, valueText: 'x' })), [{ code: 'no-loinc' }]);
    assert.deepEqual(checkLabResultCoded(coded({ analyte: { label: { en: 'X' }, codes: [{ system: 'http://loinc.org', code: '20447-8' }] }, valueText: 'x' })), [{ code: 'invalid-loinc', loinc: '20447-8' }]);
    assert.deepEqual(checkLabResultCoded(coded({ analyte: hiv, value: 20, unit: '{copies}/mL' })), []);
    assert.deepEqual(checkLabResultCoded(ferritin(30)), []);
  });

  it('[LABR-5c] forLoinc reads method codes; labLoincOf gives the code an event stores (data-model 3.32.0)', () => {
    const glucose = (type) => ({ streamIds: ['body-blood-serum-glucose-random'], type, content: 5 });
    assert.equal(model.itemsDefs.forLoinc('41653-7').key, 'body-blood-serum-glucose-random', 'a method code owns');
    assert.equal(model.itemsDefs.forLoinc('14749-6').key, 'body-blood-serum-glucose-random');
    assert.deepEqual(checkLabResultCoded(coded({ analyte: { label: { en: 'Glucose' }, codes: [{ system: 'http://loinc.org', code: '41653-7' }] }, value: 5, unit: 'mmol/L' })),
      [{ code: 'owned-by-item', itemKey: 'body-blood-serum-glucose-random', loinc: '41653-7' }]);
    assert.equal(labLoincOf(glucose('concentration/mg-dl')), '2345-7');
    assert.equal(labLoincOf(glucose('concentration/mmol-l')), '14749-6');
    assert.equal(labLoincOf(glucose('concentration/umol-l')), null, 'an option without a code');
    assert.equal(labLoincOf(ferritin(30)), null, 'unit options without a stated code: never inherited');
    assert.equal(labLoincOf({ streamIds: ['old-ferritin'], type: 'concentration/ug-l', content: 30 }), '2947-0', 'one unit, one code');
    assert.equal(labLoincOf(coded({ analyte: hiv, value: 20, unit: '{copies}/mL' })), '20447-9');
    assert.equal(labLoincOf(coded({ analyte: { label: { en: 'X' }, codes: [{ system: 'urn:oid:1.2.3', code: 'X' }] }, valueText: 'x' })), null);
    assert.equal(labLoincOf({ streamIds: ['body-blood-hba1c'], type: 'ratio/proportion', content: 0.05 }), null, 'no code asserted');
  });

  it('[LABR-5b] isValidLoincCode checks the mod-10 digit', () => {
    for (const ok of ['8867-4', '2947-0', '20447-9', '5196-1', '2880-3']) assert.equal(isValidLoincCode(ok), true, ok);
    for (const bad of ['8867-5', '2947', 'LP1234-5', '12345678-9', '']) assert.equal(isValidLoincCode(bad), false, bad);
  });

  it('[LABR-6] imported items: resolvable, never in getAllActive; unknown types left out too', () => {
    const coded = model.itemsDefs.forKey('body-blood-coded');
    assert.equal(coded.isImported, true);
    assert.equal(coded.isEnterable, false);
    assert.equal(model.itemsDefs.forKey('body-blood-serum-ferritin').isImported, false);
    assert.deepEqual(model.itemsDefs.getAllActive().map((i) => i.key), ['body-blood-serum-ferritin', 'body-blood-hba1c', 'body-blood-serum-glucose-random', 'body-blood-coagulation-inr', 'body-ratio-other', 'fertility-ratio-scale']);
    assert.equal(model.itemsDefs.forEvent({ streamIds: ['body-blood-coded'], type: 'lab-result/coded-v1' }).key, 'body-blood-coded');
    assert.equal(model.itemsDefs.forEvent({ streamIds: ['body-blood'], type: 'lab-result/coded-v1' }, false), null);
    assert.deepEqual(cmcFormSpec.validateFormSpecItemKeys({ sections: [{ key: 's', itemKeys: ['body-blood-coded'] }] }, model), []);
  });
});
