import { assert } from './test-utils/deps-node.js';
import { applyOverload, validateOverload } from '../ts/HDSModel/HDSModel-Overload.ts';
import { HDSLibError } from '../ts/errors.ts';
import { HDSModel } from '../ts/HDSModel/HDSModel.ts';
import { extractOverloadAsDefinitions } from '../ts/HDSModel/overloadExtract.ts';
import yaml from 'js-yaml';

/** Build a tiny base model that mirrors the real pack.json shape. */
function makeBaseModel () {
  return {
    items: {
      'body-weight': {
        version: 'v1',
        label: { en: 'Body weight' },
        description: { en: 'Measured body weight' },
        streamId: 'body-weight',
        type: 'number',
        eventType: 'mass/kg',
        repeatable: 'unlimited'
      },
      'activity-yoga': {
        version: 'v1',
        label: { en: 'Yoga' },
        description: { en: 'Yoga session.' },
        streamId: 'activity-yoga',
        eventType: 'activity/plain',
        type: 'checkbox',
        repeatable: 'unlimited'
      }
    },
    streams: [
      {
        id: 'body',
        name: 'Body',
        parentId: null,
        children: [
          { id: 'body-weight', name: 'Body Weight', parentId: 'body' }
        ]
      },
      {
        id: 'activity',
        name: 'Activity',
        parentId: null,
        children: [
          { id: 'activity-yoga', name: 'Yoga', parentId: 'activity' }
        ]
      }
    ],
    eventTypes: {
      types: {
        'mass/kg': { type: 'number', minimum: 0 },
        'activity/plain': { type: 'string' }
      },
      extras: {
        'mass/kg': { symbol: 'kg' }
      }
    },
    settings: {
      theme: { eventType: 'settings/theme', default: 'light', type: 'enum', options: ['light', 'dark'] }
    },
    datasources: {
      medication: { endpoint: 'datasets://medication', queryParam: 'search', resultKey: 'medications', label: { en: 'Medications' } }
    },
    appStreams: {}
  };
}

describe('[OVRX] HDSModel overload', () => {
  // ---------- validateOverload ----------
  describe('[OVRA] validateOverload — allowed', () => {
    it('[OVAA] accepts a brand new item', () => {
      const m = makeBaseModel();
      validateOverload(m, { items: { 'symptom-headache': { version: 'v1', label: { en: 'Headache' }, description: { en: 'Head pain' }, streamId: 'symptom', eventType: 'activity/plain', type: 'checkbox', repeatable: 'unlimited' } } });
    });
    it('[OVAB] accepts overloading translations + repeatable on existing item', () => {
      const m = makeBaseModel();
      validateOverload(m, { items: { 'body-weight': { label: { fr: 'Poids', en: 'Weight' }, repeatable: 'P1D' } } });
    });
    it('[OVAC] accepts a new stream under an existing parent', () => {
      const m = makeBaseModel();
      validateOverload(m, { streams: [{ id: 'body', children: [{ id: 'body-bmi', name: 'BMI', parentId: 'body' }] }] });
    });
    it('[OVAD] accepts a new eventType', () => {
      const m = makeBaseModel();
      validateOverload(m, { eventTypes: { types: { 'mass/lb': { type: 'number' } } } });
    });
    it('[OVAE] accepts updating eventType extras', () => {
      const m = makeBaseModel();
      validateOverload(m, { eventTypes: { extras: { 'mass/kg': { color: '#fff' } } } });
    });
    it('[OVAF] accepts adding a new setting', () => {
      const m = makeBaseModel();
      validateOverload(m, { settings: { fontSize: { eventType: 'settings/font-size', type: 'number', default: 14 } } });
    });
    it('[OVAG] accepts changing default of an existing setting', () => {
      const m = makeBaseModel();
      validateOverload(m, { settings: { theme: { default: 'dark' } } });
    });
  });

  describe('[OVRB] validateOverload — forbidden', () => {
    it('[OVBA] rejects changing existing item type', () => {
      const m = makeBaseModel();
      assert.throws(() => validateOverload(m, { items: { 'body-weight': { type: 'text' } } }), HDSLibError);
    });
    it('[OVBB] rejects changing existing item streamId', () => {
      const m = makeBaseModel();
      assert.throws(() => validateOverload(m, { items: { 'body-weight': { streamId: 'something-else' } } }), HDSLibError);
    });
    it('[OVBC] rejects changing existing item eventType', () => {
      const m = makeBaseModel();
      assert.throws(() => validateOverload(m, { items: { 'body-weight': { eventType: 'mass/lb' } } }), HDSLibError);
    });
    it('[OVBD] rejects changing existing stream parentId', () => {
      const m = makeBaseModel();
      assert.throws(
        () => validateOverload(m, { streams: [{ id: 'body-weight', parentId: 'activity' }] }),
        HDSLibError
      );
    });
    it('[OVBE] rejects overriding an existing eventType schema', () => {
      const m = makeBaseModel();
      assert.throws(
        () => validateOverload(m, { eventTypes: { types: { 'mass/kg': { type: 'string' } } } }),
        HDSLibError
      );
    });
    it('[OVBF] rejects changing existing setting type', () => {
      const m = makeBaseModel();
      assert.throws(() => validateOverload(m, { settings: { theme: { type: 'string' } } }), HDSLibError);
    });
    it('[OVBG] rejects changing existing datasource endpoint', () => {
      const m = makeBaseModel();
      assert.throws(() => validateOverload(m, { datasources: { medication: { endpoint: 'http://other' } } }), HDSLibError);
    });
    it('[OVBH] aggregates multiple errors in one throw', () => {
      const m = makeBaseModel();
      try {
        validateOverload(m, {
          items: { 'body-weight': { type: 'text', streamId: 'x' } },
          settings: { theme: { type: 'string' } }
        });
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof HDSLibError);
        assert.equal(err.innerObject.errors.length, 3);
      }
    });
  });

  // ---------- applyOverload ----------
  describe('[OVRC] applyOverload', () => {
    it('[OVCA] adds a brand new item', () => {
      const m = makeBaseModel();
      applyOverload(m, { items: { 'symptom-headache': { version: 'v1', label: { en: 'Headache' }, streamId: 'symptom', eventType: 'activity/plain', type: 'checkbox', repeatable: 'unlimited' } } });
      assert.equal(m.items['symptom-headache'].label.en, 'Headache');
    });
    it('[OVCB] deep-merges localized labels (overload wins per language, base preserved)', () => {
      const m = makeBaseModel();
      applyOverload(m, { items: { 'body-weight': { label: { fr: 'Poids', en: 'Weight' } } } });
      assert.equal(m.items['body-weight'].label.en, 'Weight');
      assert.equal(m.items['body-weight'].label.fr, 'Poids');
    });
    it('[OVCC] adds a new fr translation while preserving the base en', () => {
      const m = makeBaseModel();
      applyOverload(m, { items: { 'activity-yoga': { description: { fr: 'Séance de yoga.' } } } });
      assert.equal(m.items['activity-yoga'].description.en, 'Yoga session.');
      assert.equal(m.items['activity-yoga'].description.fr, 'Séance de yoga.');
    });
    it('[OVCD] overrides repeatable on an existing item', () => {
      const m = makeBaseModel();
      applyOverload(m, { items: { 'body-weight': { repeatable: 'P1D' } } });
      assert.equal(m.items['body-weight'].repeatable, 'P1D');
    });
    it('[OVCE] adds a new child stream under an existing parent (via tree position)', () => {
      const m = makeBaseModel();
      applyOverload(m, { streams: [{ id: 'body', children: [{ id: 'body-bmi', name: 'BMI' }] }] });
      const body = m.streams.find(s => s.id === 'body');
      const bmi = body.children.find(s => s.id === 'body-bmi');
      assert.ok(bmi);
      assert.equal(bmi.parentId, 'body');
      assert.equal(bmi.name, 'BMI');
    });
    it('[OVCF] adds a new child stream via explicit parentId at root level', () => {
      const m = makeBaseModel();
      applyOverload(m, { streams: [{ id: 'body-bmi', name: 'BMI', parentId: 'body' }] });
      const bmi = m.streams.find(s => s.id === 'body').children.find(s => s.id === 'body-bmi');
      assert.ok(bmi);
    });
    it('[OVCG] adds a new root stream when parentId is null', () => {
      const m = makeBaseModel();
      applyOverload(m, { streams: [{ id: 'mood', name: 'Mood', parentId: null }] });
      const mood = m.streams.find(s => s.id === 'mood');
      assert.ok(mood);
      assert.equal(mood.parentId, null);
    });
    it('[OVCH] throws when adding a stream under an unknown parent', () => {
      const m = makeBaseModel();
      assert.throws(
        () => applyOverload(m, { streams: [{ id: 'orphan', name: 'Orphan', parentId: 'no-such-parent' }] }),
        HDSLibError
      );
    });
    it('[OVCI] adds a new eventType but does not overwrite existing one', () => {
      const m = makeBaseModel();
      applyOverload(m, { eventTypes: { types: { 'mass/lb': { type: 'number' } } } });
      assert.equal(m.eventTypes.types['mass/lb'].type, 'number');
      assert.equal(m.eventTypes.types['mass/kg'].minimum, 0); // untouched
    });
    it('[OVCJ] merges eventType extras', () => {
      const m = makeBaseModel();
      applyOverload(m, { eventTypes: { extras: { 'mass/kg': { color: '#fff' } } } });
      assert.equal(m.eventTypes.extras['mass/kg'].symbol, 'kg');
      assert.equal(m.eventTypes.extras['mass/kg'].color, '#fff');
    });
    it('[OVCK] changes setting default while preserving other fields', () => {
      const m = makeBaseModel();
      applyOverload(m, { settings: { theme: { default: 'dark' } } });
      assert.equal(m.settings.theme.default, 'dark');
      assert.equal(m.settings.theme.type, 'enum');
      assert.deepEqual(m.settings.theme.options, ['light', 'dark']);
    });
  });

  // ---------- HDSModel.load() integration ----------
  describe('[OVRD] HDSModel.load() with overload', () => {
    let originalFetch;
    beforeEach(() => {
      originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        text: async () => JSON.stringify(makeBaseModel())
      });
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('[OVDA] loads + freezes a model with overload applied', async () => {
      const model = new HDSModel('http://fake/pack.json');
      await model.load(null, {
        items: { 'body-weight': { label: { fr: 'Poids' }, repeatable: 'P1D' } },
        streams: [{ id: 'body', children: [{ id: 'body-bmi', name: 'BMI' }] }]
      });
      assert.equal(model.itemsDefs.forKey('body-weight').repeatable, 'P1D');
      assert.equal(model.modelData.items['body-weight'].label.fr, 'Poids');
      assert.equal(model.modelData.items['body-weight'].label.en, 'Body weight');
      const bmi = model.streams.getDataById('body-bmi');
      assert.equal(bmi.parentId, 'body');
      // model is frozen
      assert.throws(() => { model.modelData.items['body-weight'].repeatable = 'unlimited'; }, TypeError);
    });

    it('[OVDB] surfaces validation errors before merging', async () => {
      const model = new HDSModel('http://fake/pack.json');
      await assert.rejects(
        () => model.load(null, { items: { 'body-weight': { type: 'text' } } }),
        HDSLibError
      );
    });

    it('[OVDC] adding a stream with unknown parent throws during load()', async () => {
      const model = new HDSModel('http://fake/pack.json');
      await assert.rejects(
        () => model.load(null, { streams: [{ id: 'orphan', name: 'Orphan', parentId: 'no-such' }] }),
        HDSLibError
      );
    });
  });

  // ---------- extractOverloadAsDefinitions ----------
  describe('[OVRE] extractOverloadAsDefinitions', () => {
    it('[OVEA] groups items by streamId prefix into items/<group>.yaml', () => {
      const out = extractOverloadAsDefinitions({
        items: {
          'symptom-headache': { version: 'v1', label: { en: 'Headache' }, streamId: 'symptom-headache', eventType: 'activity/plain', type: 'checkbox', repeatable: 'unlimited' },
          'symptom-nausea': { version: 'v1', label: { en: 'Nausea' }, streamId: 'symptom-nausea', eventType: 'activity/plain', type: 'checkbox', repeatable: 'unlimited' },
          'mood-happy': { version: 'v1', label: { en: 'Happy' }, streamId: 'mood-happy', eventType: 'activity/plain', type: 'checkbox', repeatable: 'unlimited' }
        }
      });
      assert.ok(out['items/symptom.yaml']);
      assert.ok(out['items/mood.yaml']);
      const parsed = yaml.load(out['items/symptom.yaml']);
      assert.equal(parsed['symptom-headache'].label.en, 'Headache');
      assert.equal(parsed['symptom-nausea'].streamId, 'symptom-nausea');
    });

    it('[OVEB] emits one stream file per top-level overload node and round-trips via yaml', () => {
      const overload = {
        streams: [
          { id: 'mood', name: 'Mood', parentId: null, children: [{ id: 'mood-happy', name: 'Happy', parentId: 'mood' }] }
        ]
      };
      const out = extractOverloadAsDefinitions(overload);
      assert.ok(out['streams/mood.yaml']);
      const parsed = yaml.load(out['streams/mood.yaml']);
      assert.deepEqual(parsed, overload.streams[0]);
    });

    it('[OVEC] emits eventTypes as JSON', () => {
      const out = extractOverloadAsDefinitions({ eventTypes: { types: { 'mass/lb': { type: 'number' } } } });
      assert.ok(out['eventTypes/eventTypes-overload.json']);
      const parsed = JSON.parse(out['eventTypes/eventTypes-overload.json']);
      assert.equal(parsed.types['mass/lb'].type, 'number');
    });

    it('[OVED] emits settings.yaml and round-trips', () => {
      const overload = { settings: { fontSize: { eventType: 'settings/font-size', type: 'number', default: 14 } } };
      const out = extractOverloadAsDefinitions(overload);
      const parsed = yaml.load(out['settings/settings.yaml']);
      assert.deepEqual(parsed, overload.settings);
    });

    it('[OVEE] emits one datasource file per key', () => {
      const out = extractOverloadAsDefinitions({
        datasources: {
          foods: { endpoint: 'datasets://foods', queryParam: 'q', resultKey: 'foods', label: { en: 'Foods' } }
        }
      });
      assert.ok(out['datasources/foods.yaml']);
      const parsed = yaml.load(out['datasources/foods.yaml']);
      assert.equal(parsed.foods.endpoint, 'datasets://foods');
    });

    it('[OVEF] omits sections that are empty / undefined', () => {
      const out = extractOverloadAsDefinitions({ items: {} });
      assert.deepEqual(Object.keys(out), []);
    });
  });
});
