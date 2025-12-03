/* eslint-env mocha */
const { assert } = require('./test-utils/deps-node');

const HDSLib = require('../js');

describe('[LISX] Lib settings', () => {
  before(async () => {

  });

  it('[LISL] settings.setPreferredLocales default Local', async () => {
    const text = {
      en: 'Hello',
      fr: 'Bonjour'
    };
    HDSLib.settings.setPreferredLocales(['en']);
    assert.equal(HDSLib.l(text), text.en);
    HDSLib.settings.setPreferredLocales(['fr']);
    assert.equal(HDSLib.l(text), text.fr);
  });
});
