/* eslint-env mocha */
const assert = require('node:assert/strict');
const { setPreferredLocales, localizeText } = require('../src');
const { resetPreferredLocales, getPreferredLocales, getSupportedLocales } = require('../src/localizeText');

describe('[LOCX] Lib settings', () => {
  beforeEach(() => {
    resetPreferredLocales();
  });

  it('[LOCD] getSupportedLocales', () => {
    const defaultLocales = getSupportedLocales();
    assert.deepEqual(defaultLocales, ['en', 'fr', 'es']);
  });

  it('[LOCL] setPreferredLocales, resetPrefferedLocales', () => {
    const defaultLocales = getSupportedLocales();
    const text = {
      en: 'Hello',
      fr: 'Bonjour'
    };
    setPreferredLocales(['en']);
    assert.equal(localizeText(text), text.en);
    setPreferredLocales(['fr', 'es']);
    assert.equal(localizeText(text), text.fr);
    const prefferedLocales = getPreferredLocales();
    assert.deepEqual(prefferedLocales, ['fr', 'es', 'en']);
    resetPreferredLocales();
    assert.deepEqual(getPreferredLocales(), defaultLocales);
  });

  it('[LOCE] setPreferredLocales throws error if language code unssuported', () => {
    try {
      setPreferredLocales(['ex', 'en', 'fr', 'ut']);
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'locales "ex, ut" are not supported');
    }
  });

  it('[LOCE] setPreferredLocales throws error if not array', () => {
    try {
      setPreferredLocales('en');
      throw new Error('Should throw error');
    } catch (e) {
      assert.equal(e.message, 'setPreferredLocales takes an array of language codes');
    }
  });
});
