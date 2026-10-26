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
});
