import { assert } from './test-utils/deps-node.js';
import { eventToShortText, labComparatorOf, isExactLabValue, labUnitText, labValueToFhir, labSeriesKey, isValidLoincCode, checkLabResultCoded, cmcFormSpec } from '../ts/index.ts';
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
        variations: { eventType: { options: [{ value: 'concentration/ug-l', label: { en: 'ng/mL' } }] } },
        references: { loinc: ['2276-4', '24373-3'] }
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
      }
    },
    streams: [
      { id: 'body', name: 'Body', parentId: null },
      { id: 'body-blood', name: 'Blood', parentId: 'body' },
      { id: 'body-blood-serum-ferritin', name: 'Ferritin', parentId: 'body-blood' },
      { id: 'body-blood-coded', name: 'Other blood results', parentId: 'body-blood' },
      { id: 'sync-status', name: 'Sync', parentId: null },
      { id: 'future-thing', name: 'Future', parentId: null },
      { id: 'old-ferritin', name: 'Old', parentId: null }
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

  it('[LABR-2b] labUnitText prefers unitText, else a readable UCUM code', () => {
    assert.equal(labUnitText({ unit: 'umol/L', unitText: 'µmol/l' }), 'µmol/l');
    assert.equal(labUnitText({ unit: 'umol/L' }), 'µmol/L');
    assert.equal(labUnitText({ unit: 'u[IU]/mL' }), 'µIU/mL');
    assert.equal(labUnitText({ unit: '[IU]/L' }), 'IU/L');
    assert.equal(labUnitText({ unit: '10*9/L' }), '10^9/L');
    assert.equal(labUnitText({ unit: 'U/L' }), 'U/L');
    assert.equal(labUnitText({ unit: '1' }), null);
  });

  it('[LABR-3] labValueToFhir: comparator only when censored, UCUM only on coded', () => {
    assert.deepEqual(labValueToFhir(ferritin(1.5, { hdsComparator: '<' })), { valueQuantity: { value: 1.5, comparator: '<', unit: 'ng/mL' } });
    assert.deepEqual(labValueToFhir(ferritin(30)), { valueQuantity: { value: 30, unit: 'ng/mL' } });
    assert.equal(labValueToFhir(ferritin(1.5, { hdsComparator: '=' })), null);
    assert.deepEqual(labValueToFhir(coded({ analyte: hiv, value: 20, comparator: '<', unit: '{copies}/mL' })),
      { valueQuantity: { value: 20, comparator: '<', unit: 'copies/mL', system: 'http://unitsofmeasure.org', code: '{copies}/mL' } });
    const negative = { system: 'http://snomed.info/sct', code: '260385009', display: 'Negative' };
    assert.deepEqual(labValueToFhir(coded({ analyte: hiv, valueText: 'négatif', valueCoded: negative })),
      { valueCodeableConcept: { coding: [negative], text: 'négatif' } });
    assert.deepEqual(labValueToFhir(coded({ analyte: hiv, valueText: '1:160' })), { valueString: '1:160' });
    assert.equal(labValueToFhir({ streamIds: ['x'], type: 'note/txt', content: 'hello' }), null);
  });

  it('[LABR-4] labSeriesKey never merges analytes or units', () => {
    assert.equal(labSeriesKey(ferritin(30)), 'body-blood-serum-ferritin');
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

  it('[LABR-5b] isValidLoincCode checks the mod-10 digit', () => {
    for (const ok of ['8867-4', '2947-0', '20447-9', '5196-1', '2880-3']) assert.equal(isValidLoincCode(ok), true, ok);
    for (const bad of ['8867-5', '2947', 'LP1234-5', '12345678-9', '']) assert.equal(isValidLoincCode(bad), false, bad);
  });

  it('[LABR-6] imported items: resolvable, never in getAllActive; unknown types left out too', () => {
    const coded = model.itemsDefs.forKey('body-blood-coded');
    assert.equal(coded.isImported, true);
    assert.equal(coded.isEnterable, false);
    assert.equal(model.itemsDefs.forKey('body-blood-serum-ferritin').isImported, false);
    assert.deepEqual(model.itemsDefs.getAllActive().map((i) => i.key), ['body-blood-serum-ferritin']);
    assert.equal(model.itemsDefs.forEvent({ streamIds: ['body-blood-coded'], type: 'lab-result/coded-v1' }).key, 'body-blood-coded');
    assert.equal(model.itemsDefs.forEvent({ streamIds: ['body-blood'], type: 'lab-result/coded-v1' }, false), null);
    assert.deepEqual(cmcFormSpec.validateFormSpecItemKeys({ sections: [{ key: 's', itemKeys: ['body-blood-coded'] }] }, model), []);
  });
});
