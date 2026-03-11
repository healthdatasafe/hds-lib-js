import { HDSModel } from './HDSModel';
import type { UnitSystem } from '../settings/HDSSettings';
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
export declare class HDSModelConversions {
    #private;
    constructor(model: HDSModel);
    /**
     * Convert a numeric value from one event type to the preferred unit system.
     * Returns null if no conversion is needed or available.
     *
     * @param eventType - e.g. "mass/kg"
     * @param value - the numeric value to convert
     * @param targetSystem - "metric" or "imperial"
     */
    convert(eventType: string, value: number, targetSystem: UnitSystem): ConversionResult | null;
}
