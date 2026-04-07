import type { HDSModelOverload } from './HDSModel-Overload.ts';

/**
 * Convert an {@link HDSModelOverload} into a `{ filepath: content }` map
 * matching the layout of `data-model/data-model/definitions/`. The result can
 * be written to disk by the app developer to open a PR upstream.
 *
 * Browser-safe: no `fs`, no external deps. The YAML emitter is a small
 * hand-rolled one tuned for the shapes used by hds data-model definitions.
 *
 * Output paths (only emitted for sections present in the overload):
 *   - `items/<group>.yaml`             — items grouped by streamId prefix
 *   - `streams/<group>.yaml`           — one file per overload top-level stream
 *   - `eventTypes/eventTypes-overload.json`
 *   - `settings/settings.yaml`
 *   - `datasources/<key>.yaml`
 *   - `appStreams.yaml`
 */
export function extractOverloadAsDefinitions (overload: HDSModelOverload): { [path: string]: string } {
  const out: { [path: string]: string } = {};

  // ---- items: group by streamId prefix (first segment before '-') ----
  if (overload.items && Object.keys(overload.items).length > 0) {
    const groups: { [group: string]: { [key: string]: any } } = {};
    for (const [key, item] of Object.entries(overload.items)) {
      const streamId: string = (item as any).streamId || key;
      const group = streamId.split('-')[0];
      if (!groups[group]) groups[group] = {};
      groups[group][key] = item;
    }
    for (const [group, dict] of Object.entries(groups)) {
      out[`items/${group}.yaml`] = toYaml(dict);
    }
  }

  // ---- streams: one file per top-level overload node, named after its id ----
  if (overload.streams && overload.streams.length > 0) {
    for (const node of overload.streams) {
      out[`streams/${node.id}.yaml`] = toYaml(node);
    }
  }

  // ---- eventTypes: single JSON file (matches existing eventTypes-hds.json shape) ----
  if (overload.eventTypes && (overload.eventTypes.types || overload.eventTypes.extras)) {
    out['eventTypes/eventTypes-overload.json'] = JSON.stringify(overload.eventTypes, null, 2) + '\n';
  }

  // ---- settings: single YAML file ----
  if (overload.settings && Object.keys(overload.settings).length > 0) {
    out['settings/settings.yaml'] = toYaml(overload.settings);
  }

  // ---- datasources: one file per key ----
  if (overload.datasources) {
    for (const [key, def] of Object.entries(overload.datasources)) {
      out[`datasources/${key}.yaml`] = toYaml({ [key]: def });
    }
  }

  // ---- appStreams: single YAML file ----
  if (overload.appStreams && Object.keys(overload.appStreams).length > 0) {
    out['appStreams.yaml'] = toYaml(overload.appStreams);
  }

  return out;
}

// ---------- tiny YAML emitter ----------

/**
 * Serialize a JS value to YAML. Handles the subset used by hds data-model
 * definitions: dicts, lists, strings, numbers, booleans, null.
 * Indentation is 2 spaces. Strings are single-quoted only when they contain
 * characters that would otherwise be ambiguous.
 */
export function toYaml (value: any): string {
  return emit(value, 0, false) + '\n';
}

function emit (value: any, indent: number, inArray: boolean): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return formatString(value);

  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const lines: string[] = [];
    for (const item of value) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        // dict item — first key on the same line as the dash
        const entries = Object.entries(item);
        if (entries.length === 0) {
          lines.push(`${pad}- {}`);
          continue;
        }
        const [firstKey, firstVal] = entries[0];
        lines.push(`${pad}- ${formatKeyValue(firstKey, firstVal, indent + 1, true)}`);
        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i];
          lines.push(`${pad}  ${formatKeyValue(k, v, indent + 1, false)}`);
        }
      } else {
        lines.push(`${pad}- ${emit(item, indent + 1, true)}`);
      }
    }
    return (inArray ? '\n' : '') + lines.join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines: string[] = [];
    for (const [k, v] of entries) {
      lines.push(`${pad}${formatKeyValue(k, v, indent, false)}`);
    }
    // when nested, we want a leading newline so the parent "key:" is on its own line
    return (indent > 0 || inArray ? '\n' : '') + lines.join('\n');
  }

  return String(value);
}

function formatKeyValue (key: string, value: any, indent: number, firstInArrayItem: boolean): string {
  const safeKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : `'${key.replace(/'/g, "''")}'`;
  if (value === null || value === undefined) return `${safeKey}: null`;
  if (typeof value === 'boolean' || typeof value === 'number') return `${safeKey}: ${emit(value, indent, false)}`;
  if (typeof value === 'string') return `${safeKey}: ${formatString(value)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${safeKey}: []`;
    return `${safeKey}:\n${emit(value, indent, false)}`;
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return `${safeKey}: {}`;
    const inner = emit(value, indent + 1, firstInArrayItem);
    // emit() returns leading "\n" for nested dicts when indent>0 — strip & re-add
    return `${safeKey}:${inner.startsWith('\n') ? inner : '\n' + inner}`;
  }
  return `${safeKey}: ${String(value)}`;
}

/** Quote a string only when needed (contains YAML special chars or is empty/numeric-looking). */
function formatString (s: string): string {
  if (s === '') return "''";
  // Always quote if it could be misread as null/boolean/number/special
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/^-?\d+(\.\d+)?$/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/[:#&*!|>'"%@`{}[\],?\n]/.test(s) || s.startsWith('-') || s.startsWith(' ') || s.endsWith(' ')) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}
