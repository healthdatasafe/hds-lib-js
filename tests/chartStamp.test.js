import { assert } from './test-utils/deps-node.js';
import { eventToShortText } from '../ts/index.ts';
import { chartStampText } from '../ts/HDSModel/chartStamp.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';
import { setPreferredLocales, resetPreferredLocales } from '../ts/localizeText.ts';

/** A charted stamp, data-model 4.32.0 (plan 141, site-agents#67): its short text is the stamp, not the method. */
describe('[CSTX] charted stamp', () => {
  const KEY = 'fertility-cycles-chart-stamp';
  let published;
  before(async () => {
    const model = getModel();
    if (!model.isLoaded) await model.load('https://model.datasafe.dev/pack.json');
    published = structuredClone(model.modelData);
    const pack = structuredClone(published);
    pack.items[KEY] = {
      version: 'v1', label: { en: 'Cycle chart stamp' }, description: { en: 'd' }, streamId: KEY, eventType: 'fertility/chart-stamp-v1', type: 'imported', repeatable: 'P1D'
    };
    model.loadFromObject(pack);
  });
  after(() => { getModel().loadFromObject(published); });
  afterEach(() => { resetPreferredLocales(); });

  const text = (content) => eventToShortText({ streamIds: [KEY], type: 'fertility/chart-stamp-v1', time: 1, content });

  it('[CSTX1] reads as the stamp, localized', () => {
    assert.equal(text({ method: 'creighton', stamp: 'yellow' }), 'Yellow');
    assert.equal(text({ method: 'billings', stamp: 'white-baby' }), 'White with a baby');
    setPreferredLocales(['fr']);
    assert.equal(text({ method: 'creighton', stamp: 'yellow-baby' }), 'Jaune avec un bébé');
  });

  it('[CSTX2] an unknown stamp reads as stored; inherited names are not labels', () => {
    assert.equal(text({ method: 'creighton', stamp: 'brown' }), 'brown');
    assert.equal(text({ method: 'creighton', stamp: 'constructor' }), 'constructor');
  });

  it('[CSTX3] without the item in the model, the same text', () => {
    const without = structuredClone(published);
    delete without.items[KEY];
    getModel().loadFromObject(without);
    assert.equal(getModel().modelData.items[KEY], undefined);
    assert.equal(text({ method: 'creighton', stamp: 'red' }), 'Red');
  });

  it('[CSTX4] no stamp, no text of its own', () => {
    for (const content of [null, 'yellow', {}, { method: 'creighton' }, { stamp: '' }, { stamp: 3 }]) {
      assert.equal(chartStampText(content), null, JSON.stringify(content));
    }
  });
});
