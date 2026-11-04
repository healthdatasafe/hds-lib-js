import { assert } from './test-utils/deps-node.js';
import { eventToShortText, geneticVariantText, GENETIC_VARIANT_CODED, appTemplates, cmcScope } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

// Genetic test results (data-model 3.43.0, site-agents#37): the `explicitGrantOnly` marker on the `genetics` root,
// the `level: 'none'` masks a contact's accesses carry (B-2026-11-03-9), and the short text.

const modelURL = 'https://model.datasafe.dev/pack.json';
const { Contact } = appTemplates;

describe('[GENX] genetic test results', function () {
  before(async () => {
    await getModel().load(modelURL);
  });

  describe('[GENX-M] the explicitGrantOnly marker', () => {
    it('[GENX-M1] genetics is the marked root; its child is covered, other streams are not', () => {
      const streams = getModel().streams;
      assert.deepStrictEqual(streams.explicitGrantOnlyRootIds(), ['genetics']);
      assert.strictEqual(streams.isExplicitGrantOnly('genetics'), true);
      assert.strictEqual(streams.isExplicitGrantOnly('genetics-variant'), true);
      assert.strictEqual(streams.isExplicitGrantOnly('body'), false);
      assert.strictEqual(streams.isExplicitGrantOnly('body-weight'), false);
      assert.strictEqual(streams.isExplicitGrantOnly('not-a-model-stream'), false);
    });

    it('[GENX-M2] planStopSharing: * does not share a marked stream, so it can be stopped on its own', () => {
      const perms = [{ streamId: '*', level: 'read' }, { streamId: 'genetics', level: 'read' }];
      const plan = cmcScope.planStopSharing(perms, 'genetics');
      assert.strictEqual(plan.ok, true, JSON.stringify(plan));
      assert.deepStrictEqual(plan.newPermissions, [{ streamId: '*', level: 'read' }]);
      assert.strictEqual(cmcScope.planStopSharing([{ streamId: '*', level: 'read' }, { streamId: 'body', level: 'read' }], 'body').reason, 'shared-through-parent');
    });
  });

  describe('[GENX-C] Contact masks (B-2026-11-03-9)', () => {
    const streamsById = {
      genetics: { id: 'genetics', children: [{ id: 'genetics-variant', children: [] }] },
      'genetics-variant': { id: 'genetics-variant', children: [] },
      body: { id: 'body', children: [] }
    };

    it('[GENX-C1] a none entry is not shared, and masks its subtree under * on the same access', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [{ streamId: '*', level: 'read' }, { streamId: 'genetics', level: 'none' }] });
      c.initStreamCache(streamsById);
      assert.strictEqual(c.eventIsAccessible({ streamIds: ['body'] }), true);
      assert.strictEqual(c.eventIsAccessible({ streamIds: ['genetics'] }), false);
      assert.strictEqual(c.eventIsAccessible({ streamIds: ['genetics-variant'] }), false);
      assert.strictEqual(c.eventIsAccessible({ streamIds: ['body', 'genetics-variant'] }), false, 'a masked stream refuses the event');
    });

    it('[GENX-C2] a none entry alone shares nothing', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [{ streamId: 'genetics', level: 'none' }, { streamId: 'body', level: 'read' }] });
      c.initStreamCache(streamsById);
      assert.strictEqual(c.eventIsAccessible({ streamIds: ['genetics-variant'] }), false);
      assert.strictEqual(c.eventIsAccessible({ streamIds: ['body'] }), true);
    });

    it('[GENX-C3] a mask narrows its own access only: another access naming genetics still reads it', () => {
      const c = new Contact('u', 'U');
      c.addAccessObject({ id: 'a1', permissions: [{ streamId: '*', level: 'read' }, { streamId: 'genetics', level: 'none' }] });
      c.addAccessObject({ id: 'a2', permissions: [{ streamId: 'genetics', level: 'read' }] });
      c.initStreamCache(streamsById);
      assert.strictEqual(c.eventIsAccessible({ streamIds: ['genetics-variant'] }), true);
    });
  });

  describe('[GENX-T] short text', () => {
    const content = (extra) => ({
      gene: { label: 'MTHFR', codes: [{ system: 'http://www.genenames.org/geneId', code: 'HGNC:7436' }] },
      variant: { label: 'C677T' },
      result: 'present',
      ...extra
    });

    it('[GENX-T1] gene and variant, then the result as printed, else the coded result and zygosity', () => {
      assert.strictEqual(geneticVariantText(content({ zygosity: 'heterozygous' })), 'MTHFR C677T: present, heterozygous');
      assert.strictEqual(geneticVariantText(content({ resultText: 'C677T hétérozygote' })), 'MTHFR C677T: C677T hétérozygote');
      assert.strictEqual(geneticVariantText(content({ result: 'absent' })), 'MTHFR C677T: absent');
      assert.strictEqual(geneticVariantText(null), null);
      assert.strictEqual(eventToShortText({ type: GENETIC_VARIANT_CODED, streamIds: ['genetics-variant'], content: content({ zygosity: 'homozygous' }) }), 'MTHFR C677T: present, homozygous');
    });
  });
});
