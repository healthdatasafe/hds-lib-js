import { HDSModel } from './HDSModel.ts';
import type { UnitSystem } from '../settings/HDSSettings.ts';

export interface ConversionResult {
  value: number;
  targetEventType: string;
}

/**
 * Conversions — Extension of HDSModel
 *
 * Reads conversion definitions from the model (pack.json → conversions).
 * Each category (mass, length, temperature) defines:
 *   - metric/imperial unit names
 *   - factors: { from: { to: number | [factor, offset] } }
 */
export class HDSModelConversions {
  #model: HDSModel;

  constructor (model: HDSModel) {
    this.#model = model;
  }

  /**
   * Convert a numeric value from one event type to the preferred unit system.
   * Returns null if no conversion is needed or available.
   *
   * @param eventType - e.g. "mass/kg"
   * @param value - the numeric value to convert
   * @param targetSystem - "metric" or "imperial"
   */
  convert (eventType: string, value: number, targetSystem: UnitSystem): ConversionResult | null {
    const conversions = this.#model.modelData.conversions;
    if (!conversions) return null;

    const slash = eventType.indexOf('/');
    if (slash < 0) return null;
    const category = eventType.substring(0, slash);
    const unit = eventType.substring(slash + 1);

    const catDef = conversions[category];
    if (!catDef) return null;

    // Already in the target system?
    if (catDef[targetSystem] === unit) return null;

    const targetUnit = catDef[targetSystem];
    if (!targetUnit) return null;

    // Look up conversion factor: from current unit to target unit
    const factor = catDef.factors?.[unit]?.[targetUnit];
    if (factor != null) {
      return {
        value: applyFactor(value, factor),
        targetEventType: category + '/' + targetUnit,
      };
    }

    // Try reverse: target → current, then invert
    const reverseFactor = catDef.factors?.[targetUnit]?.[unit];
    if (reverseFactor != null) {
      return {
        value: applyReverseFactor(value, reverseFactor),
        targetEventType: category + '/' + targetUnit,
      };
    }

    return null;
  }
}

/** Apply a conversion factor: number = multiply, [factor, offset] = affine */
function applyFactor (value: number, factor: number | [number, number]): number {
  if (typeof factor === 'number') return Math.round(value * factor * 100) / 100;
  return Math.round((value * factor[0] + factor[1]) * 100) / 100;
}

/** Invert a conversion factor */
function applyReverseFactor (value: number, factor: number | [number, number]): number {
  if (typeof factor === 'number') return Math.round((value / factor) * 100) / 100;
  return Math.round(((value - factor[1]) / factor[0]) * 100) / 100;
}
