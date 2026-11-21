/**
 * A small JSON Schema checker for the schemas the data model publishes (draft-04 / draft-07, the portable subset the
 * pack uses), interpreted at run time: no generated code, so it runs under a Content-Security-Policy without
 * `unsafe-eval` (see scripts/build-validators.mjs for why hds-lib carries no runtime Ajv).
 *
 * Keywords: type, enum, const, required, properties, additionalProperties, minProperties, maxProperties, items (one
 * schema or a tuple), additionalItems, minItems, maxItems, uniqueItems, minLength, maxLength, pattern, minimum,
 * maximum, exclusiveMinimum, exclusiveMaximum (draft-04 boolean or draft-06 number), multipleOf, oneOf, anyOf,
 * allOf, not. Anything else (format, $ref, ...) is not checked. The cores never validate HDS event types (they load
 * pryv's dictionary, which has none of them, and accept unknown types as they come), so a writer's check is the only
 * one: `_notes/open-pryv.io/event-types-dictionary.md` in the HDS workspace.
 */

export type JsonSchema = Record<string, any> | boolean;

/** The issues of `value` against `schema`, as `path: message` strings; empty when it conforms. */
export function schemaIssues (schema: JsonSchema, value: unknown, path: string = ''): string[] {
  if (schema === true || schema == null) return [];
  if (schema === false) return [`${at(path)}: not allowed`];
  const s = schema;
  const out: string[] = [];
  if (s.type != null && !matchesType(s.type, value)) {
    return [`${at(path)}: must be ${Array.isArray(s.type) ? s.type.join(' or ') : s.type}`];
  }
  if (Array.isArray(s.enum) && !s.enum.some((e: unknown) => sameValue(e, value))) out.push(`${at(path)}: must be one of ${s.enum.map((e: unknown) => JSON.stringify(e)).join(', ')}`);
  if ('const' in s && !sameValue(s.const, value)) out.push(`${at(path)}: must be ${JSON.stringify(s.const)}`);

  if (typeof value === 'string') {
    const length = [...value].length;
    if (s.minLength != null && length < s.minLength) out.push(`${at(path)}: shorter than ${s.minLength}`);
    if (s.maxLength != null && length > s.maxLength) out.push(`${at(path)}: longer than ${s.maxLength}`);
    if (typeof s.pattern === 'string' && !patternOf(s.pattern).test(value)) out.push(`${at(path)}: does not match ${s.pattern}`);
  }
  if (typeof value === 'number') {
    if (s.minimum != null && (value < s.minimum || (s.exclusiveMinimum === true && value === s.minimum))) out.push(`${at(path)}: below ${s.minimum}`);
    if (s.maximum != null && (value > s.maximum || (s.exclusiveMaximum === true && value === s.maximum))) out.push(`${at(path)}: above ${s.maximum}`);
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) out.push(`${at(path)}: not above ${s.exclusiveMinimum}`);
    if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) out.push(`${at(path)}: not below ${s.exclusiveMaximum}`);
    if (typeof s.multipleOf === 'number' && s.multipleOf > 0 && Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-9) out.push(`${at(path)}: not a multiple of ${s.multipleOf}`);
  }
  if (Array.isArray(value)) {
    if (s.minItems != null && value.length < s.minItems) out.push(`${at(path)}: fewer than ${s.minItems} items`);
    if (s.maxItems != null && value.length > s.maxItems) out.push(`${at(path)}: more than ${s.maxItems} items`);
    if (s.uniqueItems === true && value.some((v, i) => value.findIndex(w => sameValue(v, w)) !== i)) out.push(`${at(path)}: items are not unique`);
    if (Array.isArray(s.items)) {
      value.forEach((v, i) => {
        if (i < s.items.length) out.push(...schemaIssues(s.items[i], v, `${path}[${i}]`));
        else if (s.additionalItems === false) out.push(`${at(path)}[${i}]: not allowed`);
        else if (s.additionalItems != null) out.push(...schemaIssues(s.additionalItems, v, `${path}[${i}]`));
      });
    } else if (s.items != null) {
      value.forEach((v, i) => out.push(...schemaIssues(s.items, v, `${path}[${i}]`)));
    }
  }
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (s.minProperties != null && keys.length < s.minProperties) out.push(`${at(path)}: fewer than ${s.minProperties} properties`);
    if (s.maxProperties != null && keys.length > s.maxProperties) out.push(`${at(path)}: more than ${s.maxProperties} properties`);
    for (const r of s.required ?? []) if (!Object.hasOwn(value, r)) out.push(`${at(path)}: ${r} is required`);
    const props = s.properties ?? {};
    for (const k of keys) {
      const child = path === '' ? k : `${path}.${k}`;
      if (Object.hasOwn(props, k)) out.push(...schemaIssues(props[k], value[k], child));
      else if (s.additionalProperties === false) out.push(`${at(child)}: not allowed`);
      else if (s.additionalProperties != null && s.additionalProperties !== true) out.push(...schemaIssues(s.additionalProperties, value[k], child));
    }
  }

  if (Array.isArray(s.allOf)) for (const sub of s.allOf) out.push(...schemaIssues(sub, value, path));
  if (Array.isArray(s.anyOf) && !s.anyOf.some((sub: JsonSchema) => schemaIssues(sub, value, path).length === 0)) out.push(`${at(path)}: matches none of the allowed shapes`);
  if (Array.isArray(s.oneOf)) out.push(...oneOfIssues(s.oneOf, value, path));
  if (s.not != null && schemaIssues(s.not, value, path).length === 0) out.push(`${at(path)}: matches a forbidden shape`);
  return out;
}

/**
 * `oneOf`: exactly one branch. When none matches and the branches are told apart by one property's `enum` (the
 * `kind` of the conversation types), the issues of the branch the value names are returned, which reads better than
 * "matches none".
 */
function oneOfIssues (branches: JsonSchema[], value: unknown, path: string): string[] {
  const results = branches.map(b => schemaIssues(b, value, path));
  const passing = results.filter(r => r.length === 0).length;
  if (passing === 1) return [];
  if (passing > 1) return [`${at(path)}: matches more than one shape`];
  if (isObject(value)) {
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      if (typeof b !== 'object' || b == null) continue;
      const named = Object.entries(b.properties ?? {}).some(([k, p]: [string, any]) =>
        Array.isArray(p?.enum) && p.enum.length === 1 && Object.hasOwn(value, k) && sameValue(p.enum[0], value[k]));
      if (named) return results[i];
    }
  }
  return [`${at(path)}: matches none of the allowed shapes`];
}

function at (path: string): string {
  return path === '' ? '(root)' : path;
}

function isObject (v: unknown): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function matchesType (type: string | string[], value: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some(t => {
    switch (t) {
      case 'object': return isObject(value);
      case 'array': return Array.isArray(value);
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && Number.isFinite(value);
      case 'integer': return typeof value === 'number' && Number.isInteger(value);
      case 'boolean': return typeof value === 'boolean';
      case 'null': return value === null;
      default: return true;
    }
  });
}

function sameValue (a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every(k => Object.hasOwn(b as object, k) && sameValue((a as any)[k], (b as any)[k]));
}

const patterns = new Map<string, RegExp>();
function patternOf (pattern: string): RegExp {
  let re = patterns.get(pattern);
  if (re == null) {
    try { re = new RegExp(pattern, 'u'); } catch { re = new RegExp(pattern); }
    patterns.set(pattern, re);
  }
  return re;
}
