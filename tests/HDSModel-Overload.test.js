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

/**
 * `fertility-monitor-lh-marquette` as data-model ships it once it is canonical (definitions/items/fertility.yaml).
 * Cycle Intelligence wrote it first as an overlay item; its overlay restates the same key, streamId, eventType,
 * type and options.
 */
function marquetteItem () {
  return {
    version: 'v1',
    label: { en: 'Fertility monitor reading', fr: 'Lecture du moniteur de fertilité' },
    description: { en: 'Low, High or Peak, as your fertility monitor shows it.' },
    streamId: 'fertility-monitor-lh-marquette',
    eventType: 'ratio/generic',
    type: 'select',
    options: [
      { value: 0, label: { en: 'Low', fr: 'Bas' } },
      { value: 1, label: { en: 'High', fr: 'Haut' } },
      { value: 2, label: { en: 'Peak', fr: 'Pic' } }
    ],
    repeatable: 'P1D'
  };
}

/** Base model in which the Marquette item is canonical. */
function makeBaseModelWithMarquette () {
  const m = makeBaseModel();
  m.items['fertility-monitor-lh-marquette'] = marquetteItem();
  m.streams.push({
    id: 'fertility',
    name: 'Fertility',
    parentId: null,
    children: [{
      id: 'fertility-monitor',
      name: 'Fertility monitor',
      parentId: 'fertility',
      children: [{ id: 'fertility-monitor-lh-marquette', name: 'Fertility monitor reading', parentId: 'fertility-monitor' }]
    }]
  });
  m.eventTypes.types['ratio/generic'] = { type: 'object' };
  return m;
}

/** The app overlay that still carries the item as its own, restating every field with the canonical values. */
function marquetteRestatementOverlay () {
  return {
    items: {
      'fertility-monitor-lh-marquette': {
        ...marquetteItem(),
        label: { en: 'LH monitor reading', fr: 'Lecture du moniteur LH', es: 'Lectura del monitor LH' },
        repeatable: 'unlimited'
      }
    },
    streams: [{
      id: 'fertility',
      children: [{ id: 'fertility-monitor', children: [{ id: 'fertility-monitor-lh-marquette', name: 'LH monitor reading' }] }]
    }]
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
    it('[OVAH] accepts a new stream carrying role and clientData', () => {
      const m = makeBaseModel();
      validateOverload(m, { streams: [{ id: 'body-weight-scale', name: 'Scale', parentId: 'body-weight', role: 'context', clientData: { app: 'x' } }] });
    });
    it('[OVAI] accepts restating the base role / clientData of an existing stream', () => {
      const m = makeBaseModel();
      m.streams[0].children[0].role = 'context';
      m.streams[0].children[0].clientData = { a: 1 };
      validateOverload(m, { streams: [{ id: 'body-weight', name: 'Weight', role: 'context', clientData: { a: 1 } }] });
    });
    it('[OVAJ] accepts an overlay that restates a canonical item\'s immutable fields identically (B-2026-10-28-4)', () => {
      const m = makeBaseModelWithMarquette();
      validateOverload(m, marquetteRestatementOverlay());
    });
    it('[OVAK] accepts an identical restatement of each immutable item field on its own', () => {
      const m = makeBaseModel();
      m.items['body-weight'].unitConversions = [{ unit: 'lb', factor: 2.20462 }];
      for (const field of ['type', 'streamId', 'eventType', 'unitConversions']) {
        validateOverload(m, { items: { 'body-weight': { [field]: structuredClone(m.items['body-weight'][field]) } } });
      }
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
    it('[OVBI] rejects changing existing item unitConversions as an immutable field (B-2026-10-27-8)', () => {
      const m = makeBaseModel();
      assert.throws(
        () => validateOverload(m, { items: { 'body-weight': { unitConversions: [] } } }),
        /cannot override immutable field "unitConversions"/
      );
    });
    it('[OVBJ] rejects setting or changing role on an existing stream (site-agents#34)', () => {
      const m = makeBaseModel();
      assert.throws(
        () => validateOverload(m, { streams: [{ id: 'body-weight', role: 'context' }] }),
        /streams\["body-weight"\]: cannot override immutable field "role"/
      );
    });
    it('[OVBK] rejects changing clientData on an existing stream', () => {
      const m = makeBaseModel();
      m.streams[0].children[0].clientData = { a: 1 };
      assert.throws(
        () => validateOverload(m, { streams: [{ id: 'body', children: [{ id: 'body-weight', clientData: { a: 2 } }] }] }),
        /streams\["body-weight"\]: cannot override immutable field "clientData"/
      );
    });
    it('[OVBL] rejects a divergent restatement of a canonical item\'s options (B-2026-10-28-4)', () => {
      const m = makeBaseModelWithMarquette();
      const overlay = marquetteRestatementOverlay();
      overlay.items['fertility-monitor-lh-marquette'].options[2].label = { en: 'Peak', fr: 'Pic', es: 'Pico' };
      assert.throws(
        () => validateOverload(m, overlay),
        /item "fertility-monitor-lh-marquette": cannot override immutable field "options"/
      );
    });
    it('[OVBM] rejects a restatement whose only difference is one immutable field, naming that field only', () => {
      const m = makeBaseModelWithMarquette();
      const overlay = marquetteRestatementOverlay();
      overlay.items['fertility-monitor-lh-marquette'].eventType = 'ratio/proportion';
      try {
        validateOverload(m, overlay);
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof HDSLibError);
        assert.deepEqual(err.innerObject.errors, ['item "fertility-monitor-lh-marquette": cannot override immutable field "eventType"']);
      }
    });
    it('[OVBN] a key-order difference counts as divergent, for items as for streams', () => {
      const m = makeBaseModelWithMarquette();
      const overlay = marquetteRestatementOverlay();
      overlay.items['fertility-monitor-lh-marquette'].options[0] = { label: { en: 'Low', fr: 'Bas' }, value: 0 };
      assert.throws(() => validateOverload(m, overlay), /cannot override immutable field "options"/);
      m.streams[0].children[0].clientData = { a: 1, b: 2 };
      assert.throws(
        () => validateOverload(m, { streams: [{ id: 'body-weight', clientData: { b: 2, a: 1 } }] }),
        /cannot override immutable field "clientData"/
      );
    });
    it('[OVBO] rejects an immutable item field stated as undefined', () => {
      const m = makeBaseModel();
      assert.throws(() => validateOverload(m, { items: { 'body-weight': { type: undefined } } }), /immutable field "type"/);
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
    it('[OVCL] a new stream keeps its role and clientData (site-agents#34)', () => {
      const m = makeBaseModel();
      applyOverload(m, {
        streams: [
          { id: 'body-weight', children: [{ id: 'body-weight-scale', name: 'Scale', role: 'context', clientData: { app: 'x' } }] },
          { id: 'plain', name: 'Plain', parentId: null }
        ]
      });
      const scale = m.streams[0].children[0].children.find(s => s.id === 'body-weight-scale');
      assert.equal(scale.role, 'context');
      assert.deepEqual(scale.clientData, { app: 'x' });
      const plain = m.streams.find(s => s.id === 'plain');
      assert.ok(!('role' in plain));
      assert.ok(!('clientData' in plain));
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

    it('[OVDD] a context stream declared in an overload reports isContext() (site-agents#34)', async () => {
      const model = new HDSModel('http://fake/pack.json');
      await model.load(null, {
        streams: [{ id: 'body-weight', children: [{ id: 'body-weight-scale', name: 'Scale', role: 'context' }] }]
      });
      assert.equal(model.streams.isContext('body-weight-scale'), true);
      assert.equal(model.streams.isContext('body-weight'), false);
    });

    it('[OVDE] loads a model whose overlay restates a now-canonical item identically (B-2026-10-28-4)', async () => {
      const model = new HDSModel('http://fake/pack.json');
      model.loadFromObject(makeBaseModelWithMarquette(), marquetteRestatementOverlay());
      const item = model.itemsDefs.forKey('fertility-monitor-lh-marquette');
      assert.deepEqual(item.eventTypes, ['ratio/generic']);
      assert.deepEqual(model.modelData.items['fertility-monitor-lh-marquette'].options, marquetteItem().options);
      assert.equal(model.modelData.items['fertility-monitor-lh-marquette'].label.es, 'Lectura del monitor LH');
      assert.equal(model.modelData.items['fertility-monitor-lh-marquette'].repeatable, 'unlimited');
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
