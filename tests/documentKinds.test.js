import { assert } from './test-utils/deps-node.js';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';
import { cmcConversation as cv } from '../ts/index.ts';
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

/** A kind with `detail`, data-model 4.32.0 (plan 141): the codes of another kind plus a code of an HDS code system. */
describe('[DKDT] document kinds with a detail code', () => {
  const SYSTEM = 'https://hds.ngo/fhir/CodeSystem/document-kind';
  const CLASS = { ...sct('184216000'), display: 'Patient record type' };
  const ARTIFACT = { ...sct('419891008'), display: 'Record artifact' };
  const DETAIL = { system: SYSTEM, code: 'menstrual-cycle-chart', display: 'Menstrual cycle chart' };
  const label = (en) => ({ en, fr: en });
  const plain = { label: label('Other patient record'), description: label('d'), class: CLASS, type: ARTIFACT, timeBasis: 'creation' };
  const chart = { label: label('Menstrual cycle chart'), description: label('d'), class: CLASS, type: ARTIFACT, detail: DETAIL, timeBasis: 'creation' };
  const other = { label: label('Other'), description: label('d'), class: ARTIFACT, type: ARTIFACT, timeBasis: 'creation' };
  const kindsOf = (documentKinds) => {
    const model = new HDSModel('https://example.invalid/pack.json');
    model.loadFromObject({ items: {}, documentKinds });
    return model.documentKinds;
  };
  const packed = { kinds: { 'other-patient-record': plain, other }, detailKinds: { 'menstrual-cycle-chart': chart } };
  const layouts = {
    'in detailKinds, as published': packed,
    'before the kind it shares codes with': { kinds: { 'menstrual-cycle-chart': chart, 'other-patient-record': plain, other } }
  };

  for (const [name, documentKinds] of Object.entries(layouts)) {
    it(`[DKDT1] told apart by the detail code, listed ${name}`, () => {
      const dk = kindsOf(documentKinds);
      assert.ok(dk.getAll().some((k) => k.key === 'menstrual-cycle-chart'));
      assert.equal(dk.forKey('menstrual-cycle-chart').detail.code, 'menstrual-cycle-chart');
      assert.equal(dk.label('menstrual-cycle-chart'), 'Menstrual cycle chart');
      assert.equal(dk.forContent({ class: CLASS, type: [ARTIFACT, DETAIL] }).key, 'menstrual-cycle-chart');
      assert.equal(dk.forContent({ class: CLASS, type: [DETAIL, ARTIFACT] }).key, 'menstrual-cycle-chart');
      assert.equal(dk.forContent({ class: CLASS, type: [ARTIFACT] }).key, 'other-patient-record');
      assert.equal(dk.forContent({ class: CLASS, type: [ARTIFACT, { ...DETAIL, code: 'unknown' }] }).key, 'other-patient-record');
      assert.equal(dk.forContent({ class: CLASS, type: [ARTIFACT, { ...DETAIL, system: 'https://example.org' }] }).key, 'other-patient-record');
    });
  }

  it('[DKDT5] a picker lists it after the kind it shares its codes with', () => {
    assert.deepEqual(kindsOf(packed).getAll().map((k) => k.key), ['other-patient-record', 'menstrual-cycle-chart', 'other']);
  });

  it('[DKDT2] a detail code beside another class or type does not make the kind', () => {
    const dk = kindsOf(packed);
    assert.equal(dk.forContent({ class: ARTIFACT, type: [ARTIFACT, DETAIL] }).key, 'other');
    assert.equal(dk.forContent({ class: CLASS, type: [sct('1'), DETAIL] }), null);
    assert.equal(dk.forContent({ class: CLASS, type: [DETAIL] }), null);
  });

  it('[DKDT3] codingsFor gives what a writer puts, read back as the kind, as copies', () => {
    const dk = kindsOf(packed);
    assert.deepEqual(dk.codingsFor('menstrual-cycle-chart'), { class: CLASS, type: [ARTIFACT, DETAIL] });
    assert.deepEqual(dk.codingsFor('other-patient-record'), { class: CLASS, type: [ARTIFACT] });
    for (const key of ['menstrual-cycle-chart', 'other-patient-record', 'other']) {
      assert.equal(dk.forContent(dk.codingsFor(key)).key, key);
    }
    dk.codingsFor('menstrual-cycle-chart').type[1].code = 'changed';
    assert.equal(dk.codingsFor('menstrual-cycle-chart').type[1].code, 'menstrual-cycle-chart');
    assert.equal(dk.codingsFor('nope'), null);
  });

  it('[DKDT4] the conversation writers write the detail code, and removing it is a change of kind', async () => {
    const model = getModel();
    if (!model.isLoaded) await model.load(modelURL);
    const published = structuredClone(model.modelData);
    const pack = structuredClone(published);
    pack.documentKinds.detailKinds = { 'menstrual-cycle-chart': chart };
    model.loadFromObject(pack);
    try {
      const pending = cv.pendingDocumentEvent({ title: 'chart', documentKind: 'menstrual-cycle-chart' });
      assert.deepEqual(pending.content.type, [ARTIFACT, DETAIL]);
      const asOther = cv.pendingDocumentEvent({ title: 'chart' });
      const { update, applied } = cv.documentUpdateOf(asOther, { documentKind: 'menstrual-cycle-chart' });
      assert.deepEqual(applied, ['kind']);
      assert.deepEqual(update.content.type, [ARTIFACT, DETAIL]);
      assert.equal(update.content.class.code, CLASS.code);
      const back = cv.documentEditOf(pending, { documentKind: 'other-patient-record' });
      assert.equal(back.content.type.length, 1);
      assert.equal(model.documentKinds.forContent(back.content).key, 'other-patient-record');
      const again = cv.documentEditOf(asOther, { documentKind: 'menstrual-cycle-chart' });
      assert.equal(model.documentKinds.forContent(again.content).key, 'menstrual-cycle-chart');
      assert.deepEqual(cv.pendingFieldsOf({ ...asOther, content: update.content }), ['time'], 'the kind is no longer waiting');
    } finally {
      model.loadFromObject(published);
    }
  });
});
