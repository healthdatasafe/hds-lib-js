import { assert } from './test-utils/deps-node.js';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';
const sct = (code) => ({ system: 'http://snomed.info/sct', code });

/** Document kinds, data-model 4.17.0: a `file/xds-v1` document's class and first type by kind. */
describe('[DKND] model.documentKinds (data-model 4.17.0)', () => {
  let model;
  before(async () => {
    model = getModel();
    await model.load(modelURL);
  });
  afterEach(() => { resetPreferredLocales(); });

  it('[DKND1] lists the kinds, and finds one by key', () => {
    const all = model.documentKinds.getAll();
    assert.ok(all.length >= 45, `${all.length} kinds`);
    const lab = model.documentKinds.forKey('laboratory-report');
    assert.equal(lab.key, 'laboratory-report');
    assert.deepEqual(lab.type, { system: 'http://snomed.info/sct', code: '4241000179101', display: 'Laboratory report' });
    assert.equal(lab.class.code, '371525003');
    assert.equal(lab.timeBasis, 'service');
    assert.equal(model.documentKinds.forKey('nope'), null);
  });

  it('[DKND2] finds the kind of a document by its type, or by its class for Record artifact', () => {
    assert.equal(model.documentKinds.forContent({ class: sct('371525003'), type: [sct('4241000179101')] }).key, 'laboratory-report');
    assert.equal(model.documentKinds.forContent({ class: sct('721927009'), type: [sct('419891008')] }).key, 'referral-letter');
    assert.equal(model.documentKinds.forContent({ class: sct('371525003'), type: [sct('419891008')] }).key, 'other-procedure-report');
    assert.equal(model.documentKinds.forContent({ class: sct('419891008'), type: [sct('419891008')] }).key, 'other');
  });

  it('[DKND3] reads the first SNOMED CT type coding, and gives null for codes in no kind', () => {
    const loincFirst = { class: sct('371525003'), type: [{ system: 'http://loinc.org', code: '11502-2' }, sct('4241000179101')] };
    assert.equal(model.documentKinds.forContent(loincFirst).key, 'laboratory-report');
    assert.equal(model.documentKinds.forContent({ class: sct('371525003'), type: [sct('1')] }), null);
    assert.equal(model.documentKinds.forContent({ class: sct('1'), type: [sct('419891008')] }), null);
    assert.equal(model.documentKinds.forContent({ type: [{ system: 'http://loinc.org', code: '11502-2' }] }), null);
    assert.equal(model.documentKinds.forContent(null), null);
  });

  it('[DKND4] labels a kind, localized', () => {
    assert.equal(model.documentKinds.label('discharge-summary'), 'Discharge summary');
    setPreferredLocales(['fr']);
    assert.equal(model.documentKinds.label('discharge-summary'), 'Rapport de sortie');
    assert.equal(model.documentKinds.label('nope'), null);
  });

  it('[DKND5] a pack without the section has no kind', () => {
    const older = new HDSModel('https://example.invalid/pack.json');
    older.loadFromObject({ items: {} });
    assert.deepEqual(older.documentKinds.getAll(), []);
    assert.equal(older.documentKinds.forContent({ class: sct('371525003'), type: [sct('4241000179101')] }), null);
    assert.equal(older.documentKinds.label('laboratory-report'), null);
  });
});
