import { assert } from './test-utils/deps-node.js';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';

/**
 * Regression tests for the `streamId:eventType` index (site-agents#3).
 *
 * data-model renames an item key by keeping the old key as a **deprecated alias**
 * carrying the *same* streamId + eventType. That is the documented rename procedure
 * (data-model `AGENTS.md`), and it is what keeps consumers pinned to the old key
 * working. `data-model/src/items.js` accepts it; this loader did not, so the whole
 * live pack became unreadable — `initHDSModel()` resolved, then every `itemsDefs`
 * access threw.
 *
 * The guard here used to carry the comment "should be tested with a faulty model".
 * It never was. These are that test.
 */

/** Minimal pack.json-shaped model: one active item + its deprecated rename alias. */
function makeModelWithAlias () {
  return {
    items: {
      'body-urine-hormones-fsh': {
        version: 'v2',
        label: { en: 'FSH (urine)' },
        description: { en: 'Follicle-stimulating hormone in your urine.' },
        streamId: 'body-urine-hormones-fsh',
        eventType: 'concentration/iu-l',
        type: 'number',
        repeatable: 'any'
      },
      'fertility-hormone-fsh': {
        version: 'v1',
        deprecated: true,
        label: { en: 'FSH (urine, legacy key)' },
        description: { en: 'Deprecated — use body-urine-hormones-fsh.' },
        streamId: 'body-urine-hormones-fsh',
        eventType: 'concentration/iu-l',
        type: 'number',
        repeatable: 'any'
      }
    },
    streams: [{ id: 'body-urine-hormones-fsh', name: 'FSH' }]
  };
}

function load (data) {
  const model = new HDSModel('http://fake/pack.json');
  model.loadFromObject(data);
  return model;
}

describe('[ALIX] itemsDefs streamId:eventType index', () => {
  describe('[ALIA] active + deprecated on one pair', () => {
    it('[ALIA1] loads without throwing', () => {
      const model = load(makeModelWithAlias());
      assert.equal(model.itemsDefs.getAll().length, 2);
    });

    it('[ALIA2] the deprecated alias stays resolvable by its old key', () => {
      // This is the entire point of the alias: consumers hardcoding the old key
      // (bridge-mira builds it by string concat) keep working through a rename.
      const model = load(makeModelWithAlias());
      const itemDef = model.itemsDefs.forKey('fertility-hormone-fsh');
      assert.equal(itemDef.key, 'fertility-hormone-fsh');
      assert.ok(itemDef.isDeprecated);
    });

    it('[ALIA3] forEvent returns the ACTIVE item, never the alias', () => {
      const model = load(makeModelWithAlias());
      const itemDef = model.itemsDefs.forEvent({
        streamIds: ['body-urine-hormones-fsh'],
        type: 'concentration/iu-l'
      });
      assert.equal(itemDef.key, 'body-urine-hormones-fsh');
      assert.ok(!itemDef.isDeprecated);
    });

    it('[ALIA4] active wins regardless of load order', () => {
      // The alias is declared *first* here. Object key order decides iteration
      // order, so a naive last-write-wins index would hand the pair to the alias.
      const data = makeModelWithAlias();
      const reordered = {
        items: {
          'fertility-hormone-fsh': data.items['fertility-hormone-fsh'],
          'body-urine-hormones-fsh': data.items['body-urine-hormones-fsh']
        },
        streams: data.streams
      };
      const itemDef = load(reordered).itemsDefs.forEvent({
        streamIds: ['body-urine-hormones-fsh'],
        type: 'concentration/iu-l'
      });
      assert.equal(itemDef.key, 'body-urine-hormones-fsh');
    });

    it('[ALIA5] getAllActive hides the alias, getAll keeps it', () => {
      const model = load(makeModelWithAlias());
      const active = model.itemsDefs.getAllActive().map((i) => i.key);
      assert.deepEqual(active, ['body-urine-hormones-fsh']);
      assert.equal(model.itemsDefs.getAll().length, 2);
    });
  });

  describe('[ALIB] genuinely ambiguous models still throw', () => {
    it('[ALIB1] two ACTIVE items on one pair', () => {
      const data = makeModelWithAlias();
      delete data.items['fertility-hormone-fsh'].deprecated;
      assert.throws(() => load(data).itemsDefs, /Duplicate streamId \+ eventType/);
    });

    it('[ALIB2] two DEPRECATED items on one pair, no active owner', () => {
      // Nothing could own the pair, so forEvent would be ambiguous.
      const data = makeModelWithAlias();
      data.items['body-urine-hormones-fsh'].deprecated = true;
      assert.throws(() => load(data).itemsDefs, /Two deprecated items share/);
    });
  });
});
