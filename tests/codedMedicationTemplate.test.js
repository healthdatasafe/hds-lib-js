import { initHDSModel } from '../ts/index.ts';
import { assert } from './test-utils/deps-node.js';
import { CollectorRequest } from '../ts/appTemplates/CollectorRequest.ts';

/**
 * Self-contained integration test for CollectorRequest + Questionnaire parsing
 * of a template that bundles a coded-medication questionnaire.
 *
 * The fixture below is synthetic and lives entirely in this file — no external
 * or workspace files are read, so the suite is hermetic and CI-safe. ATC codes
 * are public WHO classification reference data.
 */

const TRIMESTER_SUBFIELD = {
  type: 'select-segmented',
  label: { en: 'Trimester', fr: 'Trimestre' },
  options: [
    { value: 'T1', label: { en: 'T1' } },
    { value: 'T2', label: { en: 'T2' } },
    { value: 'T3', label: { en: 'T3' } },
    { value: '9', label: { en: 'Unknown', fr: 'Inconnu' } }
  ]
};

// Question key → ATC code (public WHO reference data).
const ATC = {
  progesterone: 'G03DA04',
  metformin: 'A10BA02',
  aspirin: 'B01AC06'
};

function drugQuestion (label, atc) {
  return {
    label: { en: label },
    itemRef: 'medication-intake-coded',
    params: { drug: { codes: [{ system: 'ATC', code: atc }] } },
    scope: { type: 'ever' },
    subField: TRIMESTER_SUBFIELD
  };
}

function makeTemplate () {
  return {
    id: 'sample-coded-meds',
    title: { en: 'Sample Coded Medication Cohort', fr: 'Cohorte médication codée (exemple)' },
    description: { en: 'Synthetic template exercising coded-medication questionnaire parsing.' },
    chat: true,
    sections: [
      { key: 'daily', type: 'recurring', name: { en: 'Daily chart' }, itemKeys: ['fertility-cycles-start'] },
      { key: 'baseline', type: 'permanent', name: { en: 'Baseline' }, itemKeys: ['fertility-cycles-peak-day'] }
    ],
    questionnaires: [
      {
        title: { en: 'Medications taken' },
        description: { en: 'Which of these medications have you taken?' },
        questions: {
          progesterone: drugQuestion('Progesterone', ATC.progesterone),
          metformin: drugQuestion('Metformin', ATC.metformin),
          aspirin: drugQuestion('Aspirin', ATC.aspirin)
        }
      }
    ]
  };
}

describe('[CMQT] coded-medication questionnaire template', function () {
  this.timeout(8000);

  before(async () => {
    await initHDSModel();
  });

  it('[CMQT-1] template loads as a valid CollectorRequest', () => {
    const r = new CollectorRequest(makeTemplate());
    assert.equal(r.title.en, 'Sample Coded Medication Cohort');
    assert.equal(r.sections.length, 2);
  });

  it('[CMQT-2] bundles exactly one questionnaire', () => {
    const r = new CollectorRequest(makeTemplate());
    assert.equal(r.questionnaires.length, 1);
  });

  it('[CMQT-3] questionnaire exposes the expected drug questions with stable keys', () => {
    const r = new CollectorRequest(makeTemplate());
    const q = r.getQuestionnaire(0);
    assert.deepEqual(q.questionKeys.sort(), ['aspirin', 'metformin', 'progesterone']);
  });

  it('[CMQT-4] each question targets medication-intake-coded with an ATC code', () => {
    const r = new CollectorRequest(makeTemplate());
    const q = r.getQuestionnaire(0);
    for (const key of q.questionKeys) {
      const def = q.getQuestion(key);
      assert.equal(def.itemRef, 'medication-intake-coded', `${key} itemRef`);
      const codes = def.params?.drug?.codes;
      assert.ok(Array.isArray(codes) && codes.length === 1, `${key} has one code`);
      assert.equal(codes[0].system, 'ATC', `${key} ATC system`);
      assert.match(codes[0].code, /^[A-Z][0-9A-Z]+$/, `${key} ATC pattern`);
    }
  });

  it('[CMQT-5] each question carries the T1/T2/T3/9 sub-field', () => {
    const r = new CollectorRequest(makeTemplate());
    const q = r.getQuestionnaire(0);
    for (const key of q.questionKeys) {
      const def = q.getQuestion(key);
      assert.equal(def.subField.type, 'select-segmented');
      const vals = def.subField.options.map(o => String(o.value)).sort();
      assert.deepEqual(vals, ['9', 'T1', 'T2', 'T3'], `${key} options`);
    }
  });

  it('[CMQT-6] scope is ever', () => {
    const r = new CollectorRequest(makeTemplate());
    const q = r.getQuestionnaire(0);
    for (const key of q.questionKeys) {
      assert.deepEqual(q.getQuestion(key).scope, { type: 'ever' });
    }
  });

  it('[CMQT-7] full content roundtrip preserves the questionnaire', () => {
    const r1 = new CollectorRequest(makeTemplate());
    const c = r1.content;
    const r2 = new CollectorRequest(c);
    assert.equal(r2.questionnaires.length, 1);
    assert.equal(r2.getQuestionnaire(0).questionKeys.length, 3);
  });

  it('[CMQT-8] ATC codes survive a content roundtrip per question key', () => {
    const r = new CollectorRequest(makeTemplate());
    const q = new CollectorRequest(r.content).getQuestionnaire(0);
    for (const [key, atc] of Object.entries(ATC)) {
      assert.equal(q.getQuestion(key).params.drug.codes[0].code, atc, key);
    }
  });
});
