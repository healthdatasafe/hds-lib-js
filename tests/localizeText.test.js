const { assert } = require('./test-utils/deps-node');
const { resetPreferredLocales, getPreferredLocales, getSupportedLocales, localizeText, setPreferredLocales, validateLocalizableText } = require('../js/localizeText');

describe('[LOCX] Localization', () => {
  afterEach(() => {
    // make sure locales are set back to default after each test
    resetPreferredLocales();
  });

  describe('[LOVX] validateLocalizableText', () => {
    it('[LOVA] should validate correct localizable text', () => {
      const text = { en: 'Hello', fr: 'Bonjour' };
      const result = validateLocalizableText('testKey', text);
      assert.deepEqual(result, text);
    });

    it('[LOVB] should throw error if en is missing', () => {
      try {
        validateLocalizableText('testKey', { fr: 'Bonjour' });
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Missing or invalid localizable text for testKey');
      }
    });

    it('[LOVC] should throw error if en is not a string', () => {
      try {
        validateLocalizableText('testKey', { en: 123 });
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Missing or invalid localizable text for testKey');
      }
    });

    it('[LOVD] should throw error if optional language is not a string', () => {
      try {
        validateLocalizableText('testKey', { en: 'Hello', fr: 123 });
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Missing or invalid localizable text for testKey languagecode: fr');
      }
    });

    it('[LOVE] should throw error if es is not a string', () => {
      try {
        validateLocalizableText('testKey', { en: 'Hello', es: { nested: 'object' } });
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Missing or invalid localizable text for testKey languagecode: es');
      }
    });
  });

  describe('[LOSX] Localization settings', () => {
    it('[LOSG] getSupportedLocales', () => {
      const defaultLocales = getSupportedLocales();
      assert.deepEqual(defaultLocales, ['en', 'fr', 'es']);
    });

    it('[LOSS] setPreferredLocales, resetPrefferedLocales', () => {
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

    it('[LOSE] setPreferredLocales throws error if language code unsuported', () => {
      try {
        setPreferredLocales(['ex', 'en', 'fr', 'ut']);
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'locales "ex, ut" are not supported');
      }
    });

    it('[LOSA] setPreferredLocales throws error if not array', () => {
      try {
        setPreferredLocales('en');
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'setPreferredLocales takes an array of language codes');
      }
    });
  });

  // --- item localization

  describe('[LOLX] item localization', () => {
    it('[LOLN] localizable null items return null', () => {
      const nullRes = localizeText(null);
      assert.equal(nullRes, null);
    });

    it('[LOLE] localizable should return english translation if none other found', () => {
      setPreferredLocales(['fr', 'es']);
      const text = {
        en: 'Hello'
      };
      const res = localizeText(text);
      assert.equal(res, 'Hello');
    });

    it('[LOLT] localizable items must have an english translation, even if default language is not english', () => {
      try {
        const text = {
          es: 'Ola',
          fr: 'Bonjour'
        };
        setPreferredLocales(['fr']);
        localizeText(text);
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'textItems must have an english translation');
      }
    });
  });
});
