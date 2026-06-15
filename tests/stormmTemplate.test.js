import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initHDSModel } from '../ts/index.ts';
import { assert } from './test-utils/deps-node.js';
import { CollectorRequest } from '../ts/appTemplates/CollectorRequest.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORMM_PATH = path.resolve(__dirname, '../../../_plans/47-STORMM-forms-paused/templates/stormm-woman.json');

describe('[STMX] STORMM woman template (Plan 71 Phase F)', function () {
  this.timeout(8000);

  let stormm;

  before(async () => {
    await initHDSModel();
    stormm = JSON.parse(fs.readFileSync(STORMM_PATH, 'utf-8'));
  });

  it('[STMX-1] template loads as a valid CollectorRequest', () => {
    const r = new CollectorRequest(stormm);
    assert.equal(r.title.en, "STORMM — Women's RRM Cohort");
    assert.equal(r.sections.length, 5);
  });

  it('[STMX-2] bundles exactly one questionnaire', () => {
    const r = new CollectorRequest(stormm);
    assert.equal(r.questionnaires.length, 1);
  });

  it('[STMX-3] questionnaire has 11 STORMM drug questions with stable keys', () => {
    const r = new CollectorRequest(stormm);
    const q = r.getQuestionnaire(0);
    assert.deepEqual(q.questionKeys.sort(), [
      'aspirin', 'dhea', 'enoxaparin', 'estradiol', 'hcg', 'levothyroxine',
      'metformin', 'naltrexone', 'prednisone', 'progesterone', 'terbutaline'
    ]);
  });

  it('[STMX-4] each question targets medication-intake-coded with an ATC code', () => {
    const r = new CollectorRequest(stormm);
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

  it('[STMX-5] each question carries the T1/T2/T3/9 trimester sub-field', () => {
    const r = new CollectorRequest(stormm);
    const q = r.getQuestionnaire(0);
    for (const key of q.questionKeys) {
      const def = q.getQuestion(key);
      assert.equal(def.subField.type, 'select-segmented');
      const vals = def.subField.options.map(o => String(o.value)).sort();
      assert.deepEqual(vals, ['9', 'T1', 'T2', 'T3'], `${key} options`);
    }
  });

  it('[STMX-6] scope is ever (per-pregnancy isolation via D3 substream, not scope)', () => {
    const r = new CollectorRequest(stormm);
    const q = r.getQuestionnaire(0);
    for (const key of q.questionKeys) {
      assert.deepEqual(q.getQuestion(key).scope, { type: 'ever' });
    }
  });

  it('[STMX-7] full content roundtrip preserves the questionnaire', () => {
    const r1 = new CollectorRequest(stormm);
    const c = r1.content;
    const r2 = new CollectorRequest(c);
    assert.equal(r2.questionnaires.length, 1);
    assert.equal(r2.getQuestionnaire(0).questionKeys.length, 11);
  });

  it('[STMX-8] CONVERT mapping anchors match the questionnaire ATC codes', () => {
    const r = new CollectorRequest(stormm);
    const q = r.getQuestionnaire(0);
    const expected = {
      progesterone: 'G03DA04', levothyroxine: 'H03AA01', metformin: 'A10BA02',
      dhea: 'G03XX01', hcg: 'G03GA01', estradiol: 'G03CA03', aspirin: 'B01AC06',
      enoxaparin: 'B01AB05', prednisone: 'H02AB07', terbutaline: 'R03CC03',
      naltrexone: 'N07BB04'
    };
    for (const [key, atc] of Object.entries(expected)) {
      assert.equal(q.getQuestion(key).params.drug.codes[0].code, atc, key);
    }
  });
});
