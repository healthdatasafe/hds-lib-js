import { HDSModel } from './HDSModel.ts';
import { getModel } from './HDSModelInitAndSingleton.ts';
import HDSSettings from '../settings/HDSSettings.ts';
import { localizeText } from '../localizeText.ts';
import type { UnitSystem } from '../settings/HDSSettings.ts';

/**
 * Unified preferred representation config.
 * Apps call getPreferredInput/getPreferredDisplay and get back
 * a config they can use without knowing if it's a variation or converter.
 */
export interface PreferredConfig {
  type: 'variation' | 'converter' | 'default';

  /** For variations: the preferred eventType (e.g. 'mass/lb') */
  eventType?: string;
  /** For variations: the unit symbol (e.g. 'lb', 'Kg') */
  symbol?: string;

  /** For converters: the preferred method ID (null = show method selector) */
  method?: string | null;
  /** For converters: localized method name (e.g. 'Mira', 'Billings (BOM)') */
  methodName?: string;
  /** For converters: the loaded engine instance */
  engine?: any;
}

/**
 * HDSModel-Preferred — Unified API for preferred representations.
 *
 * Resolves per-item settings (preferred-input-*, preferred-display-*)
 * with fallback to global unitSystem for variation items.
 *
 * Works for both:
 * - Variation items (body-weight kg/lb, body-height m/ft)
 * - Converter items (mood, cervical-fluid)
 */
export class HDSModelPreferred {
  #model: HDSModel;

  constructor (model: HDSModel) {
    this.#model = model;
  }

  /**
   * Get the preferred input config for an item.
   * Used by form components to determine what input UI to show.
   */
  getPreferredInput (itemKey: string): PreferredConfig {
    return this.#resolve(itemKey, 'preferred-input-');
  }

  /**
   * Get the preferred display config for an item.
   * Used by eventToShortText and display components.
   */
  getPreferredDisplay (itemKey: string): PreferredConfig {
    return this.#resolve(itemKey, 'preferred-display-');
  }

  #resolve (itemKey: string, settingPrefix: string): PreferredConfig {
    const itemDef = this.#model.itemsDefs.forKey(itemKey, false);
    if (!itemDef) return { type: 'default' };

    const data = itemDef.data;
    const perItemSetting = HDSSettings.isHooked
      ? HDSSettings.get(`${settingPrefix}${itemKey}`)
      : undefined;

    // ── Variation items ──
    if (data.variations?.eventType) {
      const options = data.variations.eventType.options || [];
      let selectedEventType: string | undefined;

      // 1. Per-item override
      if (perItemSetting && typeof perItemSetting === 'string') {
        const match = options.find((o: any) => o.value === perItemSetting);
        if (match) selectedEventType = perItemSetting;
      }

      // 2. Fallback to unitSystem
      if (!selectedEventType && HDSSettings.isHooked) {
        const system: UnitSystem = HDSSettings.get('unitSystem');
        selectedEventType = this.#resolveVariationFromUnitSystem(data.variations.eventType, system);
      }

      // 3. Default: first option
      if (!selectedEventType) {
        selectedEventType = options[0]?.value;
      }

      const opt = options.find((o: any) => o.value === selectedEventType);
      const symbol = this.#getSymbol(selectedEventType);
      const optLabel = opt?.label ? (localizeText(opt.label) || undefined) : undefined;

      return {
        type: 'variation',
        eventType: selectedEventType,
        symbol: symbol || optLabel,
      };
    }

    // ── Converter items ──
    if (data['converter-engine']) {
      const ce = data['converter-engine'];
      const converterItemKey = ce.models;
      const engine = this.#model.converters.getEngine(converterItemKey);

      if (perItemSetting && typeof perItemSetting === 'string') {
        const methodDef = engine?.getMethodDef(perItemSetting);
        return {
          type: 'converter',
          method: perItemSetting,
          methodName: methodDef?.name ? (localizeText(methodDef.name) || perItemSetting) : perItemSetting,
          engine,
        };
      }

      return {
        type: 'converter',
        method: null,
        engine,
      };
    }

    return { type: 'default' };
  }

  /**
   * Resolve variation eventType from unitSystem setting.
   * Uses the model's conversions data to find which eventType belongs to which unit system.
   */
  #resolveVariationFromUnitSystem (variationDef: any, system: UnitSystem): string | undefined {
    const options = variationDef.options || [];
    const conversions = this.#model.modelData.conversions;
    if (!conversions) return undefined;

    for (const opt of options) {
      const eventType: string = opt.value;
      const slash = eventType.indexOf('/');
      if (slash < 0) continue;
      const category = eventType.substring(0, slash);
      const unit = eventType.substring(slash + 1);
      const catDef = conversions[category];
      if (catDef && catDef[system] === unit) {
        return eventType;
      }
    }
    return undefined;
  }

  #getSymbol (eventType: string | undefined): string | undefined {
    if (!eventType) return undefined;
    try {
      return this.#model.eventTypes.getEventTypeSymbol(eventType) || undefined;
    } catch {
      return undefined;
    }
  }
}

// ─── Standalone functions using the model singleton ────────────────────────

let _preferred: HDSModelPreferred | null = null;

function getPreferred (): HDSModelPreferred {
  const model = getModel();
  if (!model.isLoaded) throw new Error('Model not loaded');
  if (!_preferred) _preferred = new HDSModelPreferred(model);
  return _preferred;
}

/** Get the preferred input config for an item (standalone, uses singleton model) */
export function getPreferredInput (itemKey: string): PreferredConfig {
  return getPreferred().getPreferredInput(itemKey);
}

/** Get the preferred display config for an item (standalone, uses singleton model) */
export function getPreferredDisplay (itemKey: string): PreferredConfig {
  return getPreferred().getPreferredDisplay(itemKey);
}
