import { assert } from './test-utils/deps-node.js';
import {
  buildStreamMap,
  resolveStreamCustomField,
  resolveStreamCustomFieldDetailed,
  streamCustomFieldToVirtualItem
} from '../ts/appTemplates/resolveStream.ts';

// Compact tree builder — Plan 45 §2.4 inheritance fixtures.
function tree () {
  return [
    {
      id: 'stormm-woman',
      parentId: null,
      clientData: {
        hdsCustomField: {
          'note/txt': {
            version: 'v1',
            templateId: 'stormm-woman',
            key: 'menstrual-flow',
            label: { en: 'Menstrual flow' },
            options: ['light', 'medium', 'heavy']
          }
        }
      },
      children: [
        {
          id: 'stormm-woman-custom',
          parentId: 'stormm-woman',
          clientData: {},
          children: [
            {
              id: 'stormm-woman-custom-flow',
              parentId: 'stormm-woman-custom',
              clientData: {
                hdsCustomField: {
                  // Override label
                  'note/txt': {
                    version: 'v1',
                    templateId: 'stormm-woman',
                    key: 'menstrual-flow-detailed',
                    label: { en: 'Detailed flow' },
                    options: ['light', 'medium', 'heavy', 'flooding']
                  }
                }
              }
            },
            {
              id: 'stormm-woman-custom-optedout',
              parentId: 'stormm-woman-custom',
              clientData: {
                hdsCustomField: { 'note/txt': {} } // explicit opt-out
              }
            },
            {
              id: 'stormm-woman-custom-inherited',
              parentId: 'stormm-woman-custom'
              // No clientData — falls through to grandparent
            }
          ]
        }
      ]
    }
  ];
}

describe('[CFRS] resolveStream', function () {
  describe('[CFRS-MAP] buildStreamMap', function () {
    it('[CFRS-MAP-1] flattens a nested tree by id', function () {
      const map = buildStreamMap(tree());
      assert.equal(map.size, 5);
      assert.ok(map.has('stormm-woman-custom-flow'));
    });
  });

  describe('[CFRS-CF] resolveStreamCustomField', function () {
    it('[CFRS-CF-1] returns the def declared on the stream itself', function () {
      const def = resolveStreamCustomField(tree(), 'stormm-woman-custom-flow', 'note/txt');
      assert.ok(def);
      assert.equal(def.key, 'menstrual-flow-detailed');
      assert.deepEqual(def.options, ['light', 'medium', 'heavy', 'flooding']);
    });

    it('[CFRS-CF-2] inherits from grandparent when stream has no clientData', function () {
      const def = resolveStreamCustomField(tree(), 'stormm-woman-custom-inherited', 'note/txt');
      assert.ok(def);
      assert.equal(def.key, 'menstrual-flow'); // from stormm-woman root
    });

    it('[CFRS-CF-3] empty {} on a descendant is opt-out → returns null', function () {
      const def = resolveStreamCustomField(tree(), 'stormm-woman-custom-optedout', 'note/txt');
      assert.equal(def, null);
    });

    it('[CFRS-CF-4] returns null when no declaration up the chain', function () {
      const def = resolveStreamCustomField(tree(), 'stormm-woman-custom-inherited', 'count/generic');
      assert.equal(def, null);
    });

    it('[CFRS-CF-5] returns null for unknown streamId', function () {
      const def = resolveStreamCustomField(tree(), 'no-such-stream', 'note/txt');
      assert.equal(def, null);
    });

    it('[CFRS-CF-6] detailed variant distinguishes opt-out from none', function () {
      const optOut = resolveStreamCustomFieldDetailed(tree(), 'stormm-woman-custom-optedout', 'note/txt');
      assert.equal(optOut.kind, 'optOut');
      const none = resolveStreamCustomFieldDetailed(tree(), 'stormm-woman-custom-inherited', 'count/generic');
      assert.equal(none.kind, 'none');
      const def = resolveStreamCustomFieldDetailed(tree(), 'stormm-woman-custom-flow', 'note/txt');
      assert.equal(def.kind, 'def');
    });

    it('[CFRS-CF-7] accepts a pre-built StreamMap for repeated lookups', function () {
      const map = buildStreamMap(tree());
      const def = resolveStreamCustomField(map, 'stormm-woman-custom-flow', 'note/txt');
      assert.ok(def);
      assert.equal(def.key, 'menstrual-flow-detailed');
    });
  });

  describe('[CFRS-VI] streamCustomFieldToVirtualItem', function () {
    it('[CFRS-VI-1] converts a note/txt with options to a select-type virtual item', function () {
      const item = streamCustomFieldToVirtualItem(tree(), 'stormm-woman-custom-flow', 'note/txt');
      assert.ok(item);
      assert.equal(item.key, 'stormm-woman::menstrual-flow-detailed');
      assert.equal(item.data.type, 'select');
      assert.equal(item.data.eventType, 'note/txt');
      assert.equal(item.data.streamId, 'stormm-woman-custom-flow');
      assert.equal(item.data.options.length, 4);
      assert.equal(item.data.options[0].value, 'light');
      assert.equal(item.data.options[0].label.en, 'light');
    });

    it('[CFRS-VI-2] note/txt without options stays a text-type', function () {
      const subTree = [{
        id: 't1',
        parentId: null,
        clientData: {
          hdsCustomField: {
            'note/txt': { version: 'v1', templateId: 't', key: 'free', label: { en: 'Free text' } }
          }
        }
      }];
      const item = streamCustomFieldToVirtualItem(subTree, 't1', 'note/txt');
      assert.equal(item.data.type, 'text');
    });

    it('[CFRS-VI-3] count/generic resolves to number type', function () {
      const subTree = [{
        id: 't1',
        parentId: null,
        clientData: {
          hdsCustomField: {
            'count/generic': { version: 'v1', templateId: 't', key: 'cnt', label: { en: 'Count' }, min: 0, max: 10 }
          }
        }
      }];
      const item = streamCustomFieldToVirtualItem(subTree, 't1', 'count/generic');
      assert.equal(item.data.type, 'number');
      assert.equal(item.data.min, 0);
      assert.equal(item.data.max, 10);
    });

    it('[CFRS-VI-4] returns null on opt-out', function () {
      const item = streamCustomFieldToVirtualItem(tree(), 'stormm-woman-custom-optedout', 'note/txt');
      assert.equal(item, null);
    });

    it('[CFRS-VI-5] returns null when no declaration in chain', function () {
      const item = streamCustomFieldToVirtualItem(tree(), 'stormm-woman-custom-inherited', 'count/generic');
      assert.equal(item, null);
    });
  });
});
