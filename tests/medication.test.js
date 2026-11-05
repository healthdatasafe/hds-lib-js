import { assert } from './test-utils/deps-node.js';
import { eventToShortText, medicationIntakeKind, isSkipped, isCodedDrug, MEDICATION_INTAKE_TYPES, MEDICATION_PRESCRIPTION_TYPES } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';

/**
 * Medications, data-model 3.46.0: one intake vs a period of use, skipped doses, stops, the regimen's timing and
 * course, the vocabularies that label them.
 */
describe('[MEDX] medications (data-model 3.46.0)', () => {
  let model;
  before(async () => {
    model = getModel();
    await model.load(modelURL);
  });
  afterEach(() => { resetPreferredLocales(); });

  const intake = (content, extra = {}) => ({ content, streamIds: ['medication-intake'], type: 'medication/basic', ...extra });
  const coded = (content, extra = {}) => ({ content, streamIds: ['medication-intake'], type: 'medication/coded-v1', ...extra });
  const prescription = (content) => ({ content, streamIds: ['medication-prescription'], type: 'medication/prescription-v1' });
  const IBU = { label: { en: 'Ibuprofen' }, codes: [{ system: 'ATC', code: 'M01AE01' }] };

  describe('[MEDK] medicationIntakeKind', () => {
    it('[MEDK1] a point event is one intake', () => {
      assert.equal(medicationIntakeKind({}), 'intake');
      assert.equal(medicationIntakeKind({ duration: 0 }), 'intake');
    });
    it('[MEDK2] a duration, or null (ongoing), is a period', () => {
      assert.equal(medicationIntakeKind({ duration: 86400 }), 'period');
      assert.equal(medicationIntakeKind({ duration: null }), 'period');
    });
  });

  describe('[MEDS] isSkipped', () => {
    it('[MEDS1] a skipped dose', () => {
      assert.equal(isSkipped(intake({ name: 'Ibuprofen', status: 'skipped' })), true);
      assert.equal(isSkipped(coded({ drug: IBU, status: 'skipped', skipReason: 'forgot' })), true);
    });
    it('[MEDS2] taken, absent status, or a period are not skipped', () => {
      assert.equal(isSkipped(intake({ name: 'Ibuprofen', status: 'taken' })), false);
      assert.equal(isSkipped(intake({ name: 'Ibuprofen' })), false);
      assert.equal(isSkipped(intake({ name: 'Ibuprofen', status: 'skipped' }, { duration: null })), false);
    });
    it('[MEDS3] only on the intake types', () => {
      assert.equal(isSkipped({ type: 'activity/plain', content: { status: 'skipped' } }), false);
      assert.deepEqual([...MEDICATION_INTAKE_TYPES], ['medication/basic', 'medication/coded-v1']);
      assert.deepEqual([...MEDICATION_PRESCRIPTION_TYPES], ['medication/prescription-v1', 'medication/prescription-basic-v1']);
    });
  });

  it('[MEDC1] isCodedDrug needs one code', () => {
    assert.equal(isCodedDrug(IBU), true);
    assert.equal(isCodedDrug({ label: { en: 'x' }, codes: [] }), false);
    assert.equal(isCodedDrug({ label: { en: 'x' }, codes: [{ system: 'ATC', code: '' }] }), false);
    assert.equal(isCodedDrug(null), false);
  });

  describe('[MEDV] model.vocabularies', () => {
    it('[MEDV1] labels a value, localized', () => {
      assert.equal(model.vocabularies.label('medication-skip-reason', 'forgot'), 'Forgot');
      setPreferredLocales(['fr']);
      assert.equal(model.vocabularies.label('medication-skip-reason', 'forgot'), 'Oubli');
    });
    it('[MEDV2] finds the vocabulary of a field', () => {
      const v = model.vocabularies.forField('medication/prescription-v1', 'posology.when');
      assert.equal(v.key, 'medication-when');
      assert.equal(v.values.morning.fhir, 'MORN');
      assert.equal(model.vocabularies.forField('medication/coded-v1', 'drug'), null);
    });
    it('[MEDV3] unknown vocabulary or value', () => {
      assert.equal(model.vocabularies.label('nope', 'x'), null);
      assert.equal(model.vocabularies.label('medication-skip-reason', 'nope'), null);
      assert.equal(model.vocabularies.forKey('nope'), null);
      assert.equal(model.vocabularies.forKey('medication-intake-status').values.skipped.snomed, '1269470004');
    });
  });

  describe('[MEDT] short text', () => {
    it('[MEDT1] a skipped dose with its reason', () => {
      assert.equal(eventToShortText(coded({ drug: IBU, intake: { doseValue: 400, doseUnit: 'mass/mg' }, status: 'skipped', skipReason: 'side-effects' })), 'Ibuprofen — 400 mg, skipped (side effects)');
      assert.equal(eventToShortText(intake({ name: 'Ibuprofen', status: 'skipped' })), 'Ibuprofen — skipped');
      setPreferredLocales(['fr']);
      assert.equal(eventToShortText(intake({ name: 'Ibuprofène', status: 'skipped', skipReason: 'forgot' })), 'Ibuprofène — non pris (oubli)');
    });
    it('[MEDT2] status on a period is ignored; an ended period shows its stop reason', () => {
      assert.equal(eventToShortText(intake({ name: 'Ibuprofen', status: 'skipped' }, { duration: null })), 'Ibuprofen');
      assert.equal(eventToShortText(intake({ name: 'Ibuprofen', stopReason: 'side-effects' }, { duration: 864000 })), 'Ibuprofen — stopped (side effects)');
      assert.equal(eventToShortText(intake({ name: 'Ibuprofen', stopReason: 'side-effects' }, { duration: null })), 'Ibuprofen');
      assert.equal(eventToShortText(intake({ name: 'Ibuprofen', stopReason: 'side-effects' })), 'Ibuprofen');
    });
    it('[MEDT3] a prescription: posology, stopped with reason, completed', () => {
      assert.equal(eventToShortText(prescription({ drug: IBU, posology: { doseValue: 400, doseUnit: 'mass/mg', frequency: { times: 3, period: 1, periodUnit: 'd' } } })), 'Ibuprofen — 400 mg, 3×/d');
      assert.equal(eventToShortText(prescription({ drug: IBU, status: 'stopped', statusChanged: '2026-11-01', stopReason: 'ineffective' })), 'Ibuprofen — stopped (not working)');
      assert.equal(eventToShortText(prescription({ drug: IBU, status: 'completed' })), 'Ibuprofen — completed');
      assert.equal(eventToShortText(prescription({ drug: IBU, status: 'active' })), 'Ibuprofen');
    });
    it('[MEDT4] a typed-name prescription reads like medication/basic', () => {
      const event = { content: { name: 'Grandma tea', posology: { doseValue: 1, doseUnit: 'dose/cup', asNeeded: true } }, streamIds: ['medication-prescription'], type: 'medication/prescription-basic-v1' };
      assert.equal(eventToShortText(event), 'Grandma tea — 1 cup, as needed');
    });
    it('[MEDT7] medication/basic shows the unit without its kind, as coded intakes do', () => {
      assert.equal(eventToShortText(intake({ name: 'Ibuprofen', intake: { doseValue: 400, doseUnit: 'mass/mg', route: 'oral' } })), 'Ibuprofen — 400 mg, oral');
      assert.equal(eventToShortText(intake({ name: 'Ventolin', intake: { doseValue: 2, doseUnit: 'dose/puff' } })), 'Ventolin — 2 puff');
    });
    it('[MEDT5] timing: clock times, else the when slots', () => {
      assert.equal(eventToShortText(intake({ name: 'Levothyroxine', intake: { frequency: { times: 2, period: 1, periodUnit: 'd' }, timeOfDay: ['08:00', '20:00'] } }, { duration: null })), 'Levothyroxine — 2×/d, 08:00, 20:00');
      assert.equal(eventToShortText(intake({ name: 'Levothyroxine', intake: { when: ['before-breakfast'] } }, { duration: null })), 'Levothyroxine — before breakfast');
      setPreferredLocales(['fr']);
      assert.equal(eventToShortText(intake({ name: 'Lévothyroxine', intake: { when: ['before-breakfast', 'bedtime'] } }, { duration: null })), 'Lévothyroxine — avant le petit-déjeuner, au coucher');
    });
    it('[MEDT6] course: a length, else an end date', () => {
      assert.equal(eventToShortText(intake({ name: 'Amoxicillin', intake: { frequency: { times: 3, period: 1, periodUnit: 'd' }, bounds: { duration: 7, durationUnit: 'd' } } }, { duration: null })), 'Amoxicillin — 3×/d, for 7 d');
      const until = eventToShortText(intake({ name: 'Amoxicillin', intake: { bounds: { end: '2026-12-12' } } }, { duration: null }));
      assert.ok(/^Amoxicillin — until .*12/.test(until), until);
    });
  });
});
