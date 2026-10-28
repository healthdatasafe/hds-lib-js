import { assert } from './test-utils/deps-node.js';
import { eventToShortText } from '../ts/index.ts';
import { getModel, resetModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

/**
 * Document items (`type: attachments`, data-model 3.25.0): files carried as Pryv attachments, metadata as content
 * (`file/xds-v1`). Resolvable and shown like any item, never offered in pickers.
 */

const modelURL = 'https://model.datasafe.dev/pack.json';

/** Minimal pack.json-shaped model: one regular item and one document item */
function makeModel () {
  return {
    items: {
      'body-weight': {
        version: 'v1',
        label: { en: 'Body weight' },
        description: { en: 'Your weight.' },
        streamId: 'body-weight',
        eventType: 'mass/kg',
        type: 'number',
        repeatable: 'any'
      },
      document: {
        version: 'v1',
        label: { en: 'Medical document' },
        description: { en: 'A medical document you keep.' },
        streamId: 'documents',
        eventType: 'file/xds-v1',
        type: 'attachments',
        repeatable: 'any'
      }
    },
    streams: [
      { id: 'body-weight', name: 'Body weight', parentId: null },
      { id: 'documents', name: 'Documents', parentId: null }
    ]
  };
}

describe('[ATTX] document items', () => {
  let model;
  before(() => {
    // eventToShortText reads the singleton: give it this small model, and the published one back after
    resetModel();
    model = getModel();
    model.loadFromObject(makeModel());
  });
  after(async () => {
    resetModel();
    await getModel().load(modelURL);
  });

  it('[ATT1] isAttachments is true for type: attachments only', () => {
    assert.equal(model.itemsDefs.forKey('document').isAttachments, true);
    assert.equal(model.itemsDefs.forKey('document').isSystem, false);
    assert.equal(model.itemsDefs.forKey('body-weight').isAttachments, false);
  });

  it('[ATT2] getAllActive leaves document items out, getAll and forEvent keep them', () => {
    assert.deepEqual(model.itemsDefs.getAllActive().map((i) => i.key), ['body-weight']);
    assert.equal(model.itemsDefs.getAll().length, 2);
    assert.equal(model.itemsDefs.forEvent({ streamIds: ['documents'], type: 'file/xds-v1' }).key, 'document');
  });

  it('[ATT3] a document reads as its title, else its first file\'s name', () => {
    const base = { streamIds: ['documents'], type: 'file/xds-v1' };
    assert.equal(eventToShortText({ ...base, content: { title: 'Bilan sanguin', language: 'fr' }, attachments: [{ fileName: 'scan.pdf' }] }), 'Bilan sanguin');
    assert.equal(eventToShortText({ ...base, content: { language: 'fr' }, attachments: [{ fileName: 'scan.pdf' }] }), 'scan.pdf');
    assert.equal(eventToShortText({ ...base, content: null, attachments: [{ fileName: 'letter.jpg' }] }), 'letter.jpg');
    assert.equal(eventToShortText({ ...base, content: null }), null);
  });
});
