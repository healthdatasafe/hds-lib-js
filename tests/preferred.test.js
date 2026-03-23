import { assert } from './test-utils/deps-node.js';
import { HDSSettings } from '../ts/index.ts';
import { getModel } from '../ts/HDSModel/HDSModelInitAndSingleton.ts';

const modelURL = 'https://model.datasafe.dev/pack.json';

describe('[PREF] HDSModel.preferred', function () {
  let model;

  before(async () => {
    model = getModel();
    await model.load(modelURL);
    await model.converters.ensureEngine('mood');
    await model.converters.ensureEngine('cervical-fluid');
  });

  afterEach(() => {
    HDSSettings.unhook();
  });

  // ─── Variation items ─────────────────────────────────────────

  describe('[PREF-V] variation items', () => {
    it('[PREF-V1] body-weight returns variation config with default (metric)', () => {
      HDSSettings._testInject('unitSystem', 'metric');
      const pref = model.preferred.getPreferredInput('body-weight');
      assert.equal(pref.type, 'variation');
      assert.equal(pref.eventType, 'mass/kg');
      assert.ok(pref.symbol, 'Should have symbol');
    });

    it('[PREF-V2] body-weight returns imperial when unitSystem=imperial', () => {
      HDSSettings._testInject('unitSystem', 'imperial');
      const pref = model.preferred.getPreferredInput('body-weight');
      assert.equal(pref.type, 'variation');
      assert.equal(pref.eventType, 'mass/lb');
    });

    it('[PREF-V3] per-item override takes precedence over unitSystem', () => {
      HDSSettings._testInject('unitSystem', 'metric');
      HDSSettings._testInject('preferred-input-body-weight', 'mass/lb');
      const pref = model.preferred.getPreferredInput('body-weight');
      assert.equal(pref.eventType, 'mass/lb');
    });

    it('[PREF-V4] body-height respects per-item override (Canada: metric but ft)', () => {
      HDSSettings._testInject('unitSystem', 'metric');
      HDSSettings._testInject('preferred-input-body-height', 'length/ft');
      const weightPref = model.preferred.getPreferredInput('body-weight');
      const heightPref = model.preferred.getPreferredInput('body-height');
      assert.equal(weightPref.eventType, 'mass/kg', 'weight follows unitSystem');
      assert.equal(heightPref.eventType, 'length/ft', 'height uses per-item override');
    });

    it('[PREF-V5] display and input can differ', () => {
      HDSSettings._testInject('unitSystem', 'metric');
      HDSSettings._testInject('preferred-display-body-weight', 'mass/lb');
      const input = model.preferred.getPreferredInput('body-weight');
      const display = model.preferred.getPreferredDisplay('body-weight');
      assert.equal(input.eventType, 'mass/kg', 'input follows unitSystem');
      assert.equal(display.eventType, 'mass/lb', 'display uses per-item override');
    });

    it('[PREF-V6] without settings returns first option as default', () => {
      const pref = model.preferred.getPreferredInput('body-weight');
      assert.equal(pref.type, 'variation');
      assert.ok(pref.eventType, 'Should have an eventType');
    });
  });

  // ─── Converter items ─────────────────────────────────────────

  describe('[PREF-C] converter items', () => {
    it('[PREF-C1] mood with no preference returns method=null', () => {
      const pref = model.preferred.getPreferredInput('wellbeing-mood');
      assert.equal(pref.type, 'converter');
      assert.equal(pref.method, null);
      assert.ok(pref.engine, 'Should have engine');
    });

    it('[PREF-C2] mood with preferred-input returns method + name', () => {
      HDSSettings._testInject('preferred-input-wellbeing-mood', 'mira');
      const pref = model.preferred.getPreferredInput('wellbeing-mood');
      assert.equal(pref.type, 'converter');
      assert.equal(pref.method, 'mira');
      assert.equal(pref.methodName, 'Mira');
    });

    it('[PREF-C3] cervical-fluid preferred-display returns method', () => {
      HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'appleHealth');
      const pref = model.preferred.getPreferredDisplay('body-vulva-mucus-inspect');
      assert.equal(pref.type, 'converter');
      assert.equal(pref.method, 'appleHealth');
      assert.equal(pref.methodName, 'Apple Health');
    });

    it('[PREF-C4] input and display can differ', () => {
      HDSSettings._testInject('preferred-input-body-vulva-mucus-inspect', 'chartneo');
      HDSSettings._testInject('preferred-display-body-vulva-mucus-inspect', 'billings');
      const input = model.preferred.getPreferredInput('body-vulva-mucus-inspect');
      const display = model.preferred.getPreferredDisplay('body-vulva-mucus-inspect');
      assert.equal(input.method, 'chartneo');
      assert.equal(display.method, 'billings');
    });
  });

  // ─── Default items (no variation, no converter) ──────────────

  describe('[PREF-D] default items', () => {
    it('[PREF-D1] simple checkbox returns default', () => {
      const pref = model.preferred.getPreferredInput('activity-yoga');
      assert.equal(pref.type, 'default');
    });

    it('[PREF-D2] unknown item returns default', () => {
      const pref = model.preferred.getPreferredInput('nonexistent-item');
      assert.equal(pref.type, 'default');
    });
  });
});
