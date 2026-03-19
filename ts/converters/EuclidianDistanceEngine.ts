/**
 * Generic Euclidian Distance Converter Engine.
 *
 * Loads a converter pack (dimensions + methods) and provides:
 * - toVector(methodId, observation) → N-D vector
 * - fromVector(methodId, vector) → { observation, distance }
 * - convertMethodToMethod(fromId, toId, observation) → { data, matchDistance }
 *
 * No domain-specific logic — works with any set of dimensions and methods.
 */

import type {
  ObservationVector, DimensionWeights, MethodDef, ComponentDef,
  MethodConverter, ConverterPack, ConversionResult,
} from './types.ts';

// ─── Vector math ────────────────────────────────────────────────────────────

function zeroVector (dims: readonly string[]): ObservationVector {
  const v: ObservationVector = {};
  for (const d of dims) v[d] = 0;
  return v;
}

function vec (partial: Partial<ObservationVector>, dims: readonly string[]): ObservationVector {
  return { ...zeroVector(dims), ...partial };
}

function clampVector (v: ObservationVector, dims: readonly string[]): ObservationVector {
  const r = { ...v };
  for (const d of dims) r[d] = Math.max(0, Math.min(1, r[d]));
  return r;
}

function weightedDistance (a: ObservationVector, b: ObservationVector, dims: readonly string[], w: DimensionWeights): number {
  let sum = 0;
  for (const d of dims) { const diff = a[d] - b[d]; sum += w[d] * diff * diff; }
  return Math.sqrt(sum);
}

function findClosest<T> (vector: ObservationVector, vocab: ReadonlyArray<{ observation: T; vector: ObservationVector }>, dims: readonly string[], w: DimensionWeights): { observation: T; distance: number } {
  let best = vocab[0];
  let bestDist = Infinity;
  for (const entry of vocab) {
    const d = weightedDistance(vector, entry.vector, dims, w);
    if (d < bestDist) { bestDist = d; best = entry; }
  }
  return { observation: best.observation, distance: bestDist };
}

// ─── Converter factory ──────────────────────────────────────────────────────

type ObsValue = string | number | boolean | null;

function valuesEqual (a: ObsValue, b: ObsValue, ci: boolean): boolean {
  if (a === b) return true;
  if (ci && typeof a === 'string' && typeof b === 'string') return a.toUpperCase() === b.toUpperCase();
  return false;
}

function inferDims (comp: ComponentDef, dims: readonly string[]): string[] {
  const s = new Set<string>();
  for (const opt of comp.options) for (const k of Object.keys(opt.vector)) s.add(k);
  return dims.filter(d => s.has(d));
}

interface VocabEntry { observation: any; vector: ObservationVector }

function buildLookupConverter (def: MethodDef, dims: readonly string[], w: DimensionWeights): MethodConverter {
  const comps = def.components;
  const ci = def.caseInsensitive ?? false;
  const single = comps.length === 1;

  let vocabulary: VocabEntry[];
  if (single && !def.observations) {
    vocabulary = comps[0].options.map(o => ({ observation: o.value, vector: vec(o.vector, dims) }));
  } else if (def.observations) {
    vocabulary = def.observations.map(o => ({ observation: single ? o.select[comps[0].field] : { ...o.select }, vector: vec(o.vector, dims) }));
  } else {
    throw new Error(`lookup method "${def.methodId}" with ${comps.length} components requires observations[]`);
  }

  return {
    methodId: def.methodId,
    toVector (observation: any): ObservationVector {
      let entry: VocabEntry | undefined;
      if (single) {
        entry = vocabulary.find(e => valuesEqual(e.observation, observation, ci));
      } else {
        const obs = observation as Record<string, ObsValue>;
        entry = vocabulary.find(e => {
          const eo = e.observation as Record<string, ObsValue>;
          return comps.every(c => valuesEqual(eo[c.field], obs[c.field], ci));
        });
      }
      if (!entry) throw new Error(`Unknown ${def.methodId} observation: ${JSON.stringify(observation)}`);
      return entry.vector;
    },
    fromVector (vector: ObservationVector): any {
      return findClosest(vector, vocabulary, dims, w).observation;
    },
    allObservations (): any[] {
      return vocabulary.map(e => e.observation);
    },
  };
}

function buildAssemblyConverter (def: MethodDef, dims: readonly string[], w: DimensionWeights): MethodConverter {
  const comps = def.components;
  const single = comps.length === 1;

  function findOption (comp: ComponentDef, value: ObsValue) {
    return comp.options.find(o => {
      if (o.value === value) return true;
      if (typeof o.value === 'string' && typeof value === 'string') return o.value.toLowerCase() === value.trim().toLowerCase();
      return false;
    });
  }

  function toVector (observation: any): ObservationVector {
    const result = zeroVector(dims);
    for (const comp of comps) {
      const obsValue: ObsValue = single ? observation : (observation as Record<string, ObsValue>)[comp.field];
      const value = obsValue !== undefined ? obsValue : (comp.options[0].value ?? null);
      const opt = findOption(comp, value);
      if (!opt && value !== null && value !== undefined) {
        throw new Error(`Unknown ${comp.field} value: "${value}". Valid: ${comp.options.map(o => String(o.value)).join(', ')}`);
      }
      if (!opt) continue;
      for (const dim of dims) {
        const v = (opt.vector as Record<string, number>)[dim];
        if (v === undefined) continue;
        const merge = opt.vectorMerge?.[dim] ?? 'sum';
        if (merge === 'override') result[dim] = v;
        else if (merge === 'max') result[dim] = Math.max(result[dim], v);
        else result[dim] += v;
      }
    }
    return clampVector(result, dims);
  }

  // Check if per-component matching is safe
  const allHaveDims = comps.every(c => inferDims(c, dims).length > 0);
  const hasOverride = comps.some(c => c.options.some(o => o.vectorMerge && Object.values(o.vectorMerge).includes('override')));
  let dimsOverlap = false;
  if (allHaveDims) {
    const seen = new Set<string>();
    for (const c of comps) { for (const d of inferDims(c, dims)) { if (seen.has(d)) { dimsOverlap = true; break; } seen.add(d); } if (dimsOverlap) break; }
  }
  const useDescriptive = allHaveDims && !hasOverride && !dimsOverlap;

  function descriptiveFromVector (vector: ObservationVector): any {
    const result: Record<string, ObsValue> = {};
    for (const comp of comps) {
      const cd = inferDims(comp, dims);
      let bestWord = comp.options[0].value;
      let bestDist = Infinity;
      for (const opt of comp.options) {
        let dist = 0;
        for (const d of cd) { const diff = vector[d] - ((opt.vector as Record<string, number>)[d] ?? 0); dist += diff * diff; }
        if (dist < bestDist) { bestDist = dist; bestWord = opt.value; }
      }
      result[comp.field] = bestWord;
    }
    return single ? result[comps[0].field] : result;
  }

  let _cachedVocab: VocabEntry[] | null = null;
  function getVocabulary (): VocabEntry[] {
    if (_cachedVocab) return _cachedVocab;
    const result: VocabEntry[] = [];
    const indices = comps.map(() => 0);
    while (true) {
      const obs = single ? comps[0].options[indices[0]].value : Object.fromEntries(comps.map((c, i) => [c.field, c.options[indices[i]].value]));
      result.push({ observation: obs, vector: toVector(obs) });
      let carry = true;
      for (let i = comps.length - 1; i >= 0 && carry; i--) { indices[i]++; if (indices[i] < comps[i].options.length) carry = false; else indices[i] = 0; }
      if (carry) break;
    }
    return (_cachedVocab = result);
  }

  return {
    methodId: def.methodId,
    toVector,
    fromVector (vector: ObservationVector): any {
      if (useDescriptive) return descriptiveFromVector(vector);
      return findClosest(vector, getVocabulary(), dims, w).observation;
    },
    allObservations (): any[] {
      if (useDescriptive) {
        const base: Record<string, ObsValue> = {};
        for (const comp of comps) base[comp.field] = comp.options[0].value;
        const result: any[] = [single ? base[comps[0].field] : { ...base }];
        for (const comp of comps) {
          for (const opt of comp.options) {
            if (opt.value !== comp.options[0].value) {
              const variant = { ...base, [comp.field]: opt.value };
              result.push(single ? variant[comps[0].field] : variant);
            }
          }
        }
        return result;
      }
      return getVocabulary().map(e => e.observation);
    },
  };
}

function createConverter (def: MethodDef, dims: readonly string[], w: DimensionWeights): MethodConverter {
  const isAssembly = def.components.length > 1 && !def.observations;
  return isAssembly ? buildAssemblyConverter(def, dims, w) : buildLookupConverter(def, dims, w);
}

// ─── Engine class ───────────────────────────────────────────────────────────

export class EuclidianDistanceEngine {
  readonly itemKey: string;
  readonly eventType: string;
  readonly dimensionNames: string[];
  readonly weights: DimensionWeights;
  readonly converterVersion: string;

  private _converters: Record<string, MethodConverter> = {};
  private _methodDefs: Record<string, MethodDef> = {};
  private _methodIds: string[] = [];

  constructor (pack: ConverterPack) {
    this.itemKey = pack.itemKey;
    this.eventType = pack.eventType;
    this.converterVersion = pack.converterVersion;
    this.dimensionNames = pack.dimensionNames;

    // Build weights from dimensions
    this.weights = {};
    for (const dim of this.dimensionNames) {
      this.weights[dim] = pack.dimensions[dim]?.weight ?? 0;
    }

    // Build converters for each method
    for (const def of pack.methods) {
      this._methodDefs[def.methodId] = def;
      this._converters[def.methodId] = createConverter(def, this.dimensionNames, this.weights);
    }
    this._methodIds = pack.methods
      .slice()
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map(d => d.methodId);
  }

  get methodIds (): string[] { return this._methodIds; }

  getMethodDef (methodId: string): MethodDef | undefined {
    return this._methodDefs[methodId];
  }

  /** Convert an observation from a source method to an N-D vector */
  toVector (methodId: string, observation: any): ObservationVector {
    const c = this._converters[methodId];
    if (!c) throw new Error(`Unknown method: "${methodId}" in converter "${this.itemKey}"`);
    return c.toVector(observation);
  }

  /** Find the closest observation in a target method for a given vector */
  fromVector (methodId: string, vector: ObservationVector): ConversionResult {
    const c = this._converters[methodId];
    if (!c) throw new Error(`Unknown method: "${methodId}" in converter "${this.itemKey}"`);
    const obs = c.fromVector(vector);
    const obsVec = c.toVector(obs);
    const dist = weightedDistance(vector, obsVec, this.dimensionNames, this.weights);
    return { data: obs, matchDistance: dist };
  }

  /** Convert between two methods */
  convertMethodToMethod (fromMethodId: string, toMethodId: string, observation: any): ConversionResult {
    const vector = this.toVector(fromMethodId, observation);
    return this.fromVector(toMethodId, vector);
  }

  /** Weighted Euclidean distance between two vectors */
  distance (a: ObservationVector, b: ObservationVector): number {
    return weightedDistance(a, b, this.dimensionNames, this.weights);
  }

  /** Create a zero vector */
  zeroVector (): ObservationVector {
    return zeroVector(this.dimensionNames);
  }
}
