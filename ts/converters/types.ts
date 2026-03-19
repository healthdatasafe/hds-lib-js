/**
 * Types for the euclidian-distance converter engine.
 * Generic — no domain-specific references.
 */

/** A vector in the N-dimensional space. Each key is a dimension name, each value is 0.0–1.0. */
export type ObservationVector = Record<string, number>;

/** Weight configuration for weighted distance calculations */
export type DimensionWeights = Record<string, number>;

/** Translatable string — at minimum has `en`, may have other language codes */
export interface I18nString {
  en: string;
  [lang: string]: string;
}

/** A single option within a component */
export interface ComponentOption {
  value: string | number | boolean | null;
  label: I18nString;
  vector: Partial<ObservationVector>;
  vectorMerge?: Partial<Record<string, 'max' | 'override'>>;
}

/** A component within a method definition (e.g. mucus type, bleeding level) */
export interface ComponentDef {
  field: string;
  label: I18nString;
  options: ComponentOption[];
}

/** An explicit observation entry (for multi-component methods with cross-product) */
export interface ObservationEntry {
  select: Record<string, string | number | boolean | null>;
  label?: I18nString;
  vector: Partial<ObservationVector>;
}

/** A method definition — one source vocabulary mapped to the vector space */
export interface MethodDef {
  methodId: string;
  order?: number;
  name: I18nString;
  description: I18nString;
  referenceUrl?: string;
  caseInsensitive?: boolean;
  components: ComponentDef[];
  observations?: ObservationEntry[];
}

/** Dimension stop for human-readable labels */
export interface DimensionStop {
  value: number;
  label: I18nString;
}

/** Dimension definition */
export interface DimensionDef {
  label: I18nString;
  shortLabel: I18nString;
  description: I18nString;
  weight: number;
  renderHint?: string;
  stops: DimensionStop[];
}

/** Converter configuration (from converter/v0.yaml) */
export interface ConverterConfig {
  engine: string;
  version: string;
  itemKey: string;
  eventType: string;
  dimensionNames: string[];
  dimensions: Record<string, DimensionDef>;
  colorToRGB?: Record<string, string>;
}

/** A converter pack — config + all methods bundled together */
export interface ConverterPack {
  itemKey: string;
  converterVersion: string;
  engine: string;
  eventType: string;
  dimensionNames: string[];
  dimensions: Record<string, DimensionDef>;
  colorToRGB?: Record<string, string>;
  methods: MethodDef[];
}

/** Converter interface — each method implements this */
export interface MethodConverter {
  methodId: string;
  toVector (observation: any): ObservationVector;
  fromVector (vector: ObservationVector): any;
  allObservations (): any[];
}

/** Result of a conversion with match quality */
export interface ConversionResult {
  data: any;
  matchDistance: number;
}

/** Source provenance block for events */
export interface SourceBlock {
  key: string;
  sourceData: any;
  engineVersion: string;
  modelVersion: string;
}
