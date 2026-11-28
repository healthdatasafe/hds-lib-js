import { assert } from './test-utils/deps-node.js';
import { appTemplates } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

const { dataName, permissionView } = appTemplates;
const modelURL = 'https://model.datasafe.dev/pack.json';

describe('[PLBL] permission labels', function () {
  let model;
  before(async () => {
    model = getModel();
    await model.load(modelURL);
  });

  afterEach(() => {
    resetPreferredLocales();
  });

  it('[PLBL1] dataName names a stream by the item filed there, in the asked or preferred language', () => {
    const def = model.itemsDefs.forKey('body-weight');
    assert.strictEqual(dataName('body-weight', { locale: 'en' }), def.data.label.en);
    assert.strictEqual(dataName('body-weight', { locale: 'fr' }), def.data.label.fr);
    setPreferredLocales(['fr']);
    assert.strictEqual(dataName('body-weight'), def.data.label.fr);
  });

  it('[PLBL2] dataName falls back to the given name, then the stream id', () => {
    assert.strictEqual(dataName('not-a-model-stream', { fallback: 'Their label' }), 'Their label');
    assert.strictEqual(dataName('not-a-model-stream'), 'not-a-model-stream');
  });

  it('[PLBL9] stream ids are read in canonical form', () => {
    const view = (streamId) => permissionView({ streamId, level: 'read', defaultName: 'My notes' }, { locale: 'en' });
    for (const [spelled, id] of [[':local:', '*'], [':local:*', '*'], [':local:body', 'body'], [':local:body-weight', 'body-weight'], [':local::system:email', ':system:email'], [':account::system:email', ':system:email']]) {
      const { streamId, requesterLabel, ...shown } = view(spelled);
      const { streamId: _id, requesterLabel: _label, ...expected } = view(id);
      assert.deepStrictEqual(shown, expected);
      assert.strictEqual(streamId, spelled);
    }
    assert.ok(view(':local:custom-x').label.includes('My notes') && view(':local:custom-x').inModel === false);
  });

  it('[PLBL3] permissionView names a model stream from the model, never from the requester label', () => {
    const view = permissionView({ streamId: 'body-weight', level: 'read', defaultName: 'Cycle length' }, { locale: 'en' });
    assert.strictEqual(view.kind, 'data');
    assert.strictEqual(view.name, model.itemsDefs.forKey('body-weight').data.label.en);
    assert.strictEqual(view.requesterLabel, 'Cycle length');
    assert.strictEqual(view.inModel, true);
    assert.strictEqual(view.beyondRead, false);
  });

  it('[PLBL4] a stream the model does not know: the requester label quoted, flagged', () => {
    const view = permissionView({ streamId: 'custom-x', level: 'contribute', defaultName: 'My notes' });
    assert.strictEqual(view.name, '“My notes”');
    assert.strictEqual(view.inModel, false);
    assert.strictEqual(view.beyondRead, true);
  });

  it('[PLBL5] a parent stream says it covers what is under it', () => {
    const view = permissionView({ streamId: 'body', level: 'read' }, { locale: 'en' });
    assert.strictEqual(view.hasChildren, true);
    assert.ok(view.label.endsWith('and everything under it'), view.label);
    assert.ok(view.label.startsWith(view.name));
  });

  it('[PLBL6] all data and the account e-mail have their own names; all data always warns', () => {
    const all = permissionView({ streamId: '*', level: 'read' }, { locale: 'fr' });
    assert.strictEqual(all.kind, 'all-data');
    assert.strictEqual(all.name, 'Toutes vos données');
    assert.strictEqual(all.beyondRead, true);
    const email = permissionView({ streamId: ':system:email', level: 'read' }, { locale: 'en' });
    assert.strictEqual(email.kind, 'account-email');
    assert.strictEqual(email.name, 'Your e-mail address');
    assert.strictEqual(email.beyondRead, false);
  });

  it('[PLBL7] no level means read', () => {
    assert.strictEqual(permissionView({ streamId: 'body-weight' }).level, 'read');
  });

  it('[PLBL8] a stream no item speaks for is named by its own label (data-model 4.4.0), before the fallback', () => {
    assert.strictEqual(dataName('encounter', { locale: 'fr' }), 'Soins et prestataires');
    assert.strictEqual(dataName('encounter', { locale: 'en' }), 'Care encounters and providers');
    assert.strictEqual(dataName('encounter', { locale: 'fr', fallback: 'Their label' }), 'Soins et prestataires');
    const view = permissionView({ streamId: 'symptom', level: 'read' }, { locale: 'fr' });
    assert.strictEqual(view.name, 'Symptômes');
    assert.strictEqual(view.label, 'Symptômes et tout ce qui en dépend');
  });

  it('[PLBL9] stream ids are read in canonical form', () => {
    assert.strictEqual(permissionView({ streamId: 'symptom-general' }, { locale: 'fr' }).name, 'Symptômes › Généraux');
    assert.strictEqual(permissionView({ streamId: 'treatment-fertility' }, { locale: 'fr' }).name, 'Traitements › Fertilité');
    assert.strictEqual(permissionView({ streamId: 'symptom-general' }, { locale: 'fr' }).label, 'Symptômes › Généraux et tout ce qui en dépend');
    assert.strictEqual(permissionView({ streamId: 'symptom' }, { locale: 'fr' }).name, 'Symptômes');
    assert.strictEqual(permissionView({ streamId: 'body-weight' }, { locale: 'en' }).name, model.itemsDefs.forKey('body-weight').data.label.en);
    assert.strictEqual(dataName('symptom-general', { locale: 'fr' }), 'Généraux');
    assert.strictEqual(dataName('symptom-general', { locale: 'en', qualified: true }), 'Symptoms › General');
  });

  it('[PLBL11] a parent with an item is named by its own stream label in a child\'s name, and a root alone too (data-model 4.55.1)', () => {
    assert.strictEqual(permissionView({ streamId: 'documents-clinical' }, { locale: 'fr' }).name, 'Documents médicaux › Documents cliniques');
    assert.strictEqual(permissionView({ streamId: 'documents-clinical' }, { locale: 'en' }).name, 'Medical documents › Clinical documents');
    assert.strictEqual(permissionView({ streamId: 'documents-admin-insurance' }, { locale: 'en' }).name, 'Administrative documents › Insurance documents');
    // a root on its own: its stream label too (plan 144); unqualified, `dataName` still reads the item
    assert.strictEqual(permissionView({ streamId: 'documents' }, { locale: 'en' }).label, 'Medical documents and everything under it');
    assert.strictEqual(permissionView({ streamId: 'documents' }, { locale: 'fr' }).name, 'Documents médicaux');
    assert.strictEqual(dataName('documents', { locale: 'en' }), model.itemsDefs.forKey('document').data.label.en);
    // a root with an item and no label of its own keeps the item's name
    assert.strictEqual(permissionView({ streamId: 'sync-status' }, { locale: 'en' }).name, model.itemsDefs.forKey('sync-status').data.label.en);
    // a parent with an item and no label of its own: the item's name, as before
    const syncStatus = model.streams.getDataById('sync-status');
    assert.strictEqual(syncStatus.label, undefined);
    const leaf = syncStatus.children[0];
    assert.strictEqual(dataName(leaf.id, { locale: 'en', qualified: true }), `${model.itemsDefs.forKey('sync-status').data.label.en} › ${leaf.label.en}`);
  });

  it('[PLBL10] description: the model stream\'s, in the same language as the name; null when it has none', () => {
    const desc = model.streams.getDataById('documents-admin').description;
    assert.strictEqual(permissionView({ streamId: 'documents-admin', level: 'read' }, { locale: 'fr' }).description, desc.fr);
    assert.strictEqual(permissionView({ streamId: ':local:documents-admin' }, { locale: 'en' }).description, desc.en);
    assert.strictEqual(permissionView({ streamId: 'documents-admin' }, { locale: 'ja' }).description, desc.en, 'English fallback');
    const frName = permissionView({ streamId: 'documents-admin' }, { locale: 'fr' }).name;
    assert.ok(frName.includes('Documents administratifs'), frName);
    const chFr = permissionView({ streamId: 'documents-admin' }, { locale: 'fr-CH' });
    assert.deepStrictEqual([chFr.name, chFr.description], [frName, desc.fr], 'fr-CH reads fr, name and description');
    setPreferredLocales(['fr']);
    assert.strictEqual(permissionView({ streamId: 'documents-admin' }).description, desc.fr, 'no locale: the preferred ones');
    const ja = permissionView({ streamId: 'documents-admin' }, { locale: 'ja' });
    assert.deepStrictEqual([ja.name, ja.description], [frName, desc.fr], 'an unsupported locale: name and description both from the preferred ones');
    assert.ok(permissionView({ streamId: 'documents' }, { locale: 'fr' }).description.startsWith('Tous les documents médicaux'));
    for (const streamId of ['*', ':system:email', 'custom-x', 'share-aaaaaaaaaaaa']) assert.strictEqual(permissionView({ streamId }).description, null, streamId);
  });
});
