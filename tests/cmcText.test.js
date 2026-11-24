import { assert } from './test-utils/deps-node.js';
import { cmcDataExport, cmcText } from '../ts/index.ts';

describe('[CMTX] CMC texts: language keys the core accepts', () => {
  it('[CMTX1] a regional locale travels under its language, unless the text has that language', () => {
    assert.deepEqual(cmcText({ en: 'a', 'pt-BR': 'b' }), { en: 'a', pt: 'b' });
    assert.deepEqual(cmcText({ 'pt-BR': 'b', pt: 'p', en: 'a' }), { pt: 'p', en: 'a' });
    assert.deepEqual(cmcText({ en: '', 'fr-CH': undefined }), { en: '' });
    assert.deepEqual(cmcText({ '': 'x', 1: 'y', en: 'a' }), { en: 'a' });
  });

  it('[CMTX2] a data-export request in a regional locale has accepted keys', () => {
    const content = cmcDataExport.buildDataExportRequestContent({ locale: 'pt-BR' });
    assert.deepEqual(Object.keys(content.title), ['pt']);
    assert.deepEqual(Object.keys(content.body), ['pt']);
  });
});
