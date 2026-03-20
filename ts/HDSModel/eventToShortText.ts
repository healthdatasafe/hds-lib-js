import { localizeText } from '../localizeText.ts';
import { getModel } from './HDSModelInitAndSingleton.ts';
import HDSSettings from '../settings/HDSSettings.ts';
import type { DateFormat } from '../settings/HDSSettings.ts';

const DATE_SEPARATORS: Record<DateFormat, (d: Date) => string> = {
  'DD.MM.YYYY': (d) => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(),
  'DD/MM/YYYY': (d) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(),
  'MM/DD/YYYY': (d) => pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear(),
  'YYYY-MM-DD': (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
};

function pad (n: number): string { return n < 10 ? '0' + n : String(n); }

/**
 * Format a Unix timestamp (seconds) as a date string.
 * Uses HDSSettings dateFormat + timezone when available, otherwise ISO date.
 */
export function formatEventDate (timeSec: number): string {
  const d = new Date(timeSec * 1000);
  if (HDSSettings.isHooked) {
    const fmt = HDSSettings.get('dateFormat');
    const formatter = DATE_SEPARATORS[fmt];
    if (formatter) return formatter(d);
  }
  return d.toISOString().split('T')[0];
}

/**
 * Format a Unix timestamp (seconds) as a date + time string.
 * Used for checkbox events where the event time IS the data.
 */
export function formatEventDateTime (timeSec: number): string {
  const d = new Date(timeSec * 1000);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  // If time is midnight (00:00), show date only — likely no meaningful time
  if (hours === 0 && minutes === 0) return formatEventDate(timeSec);
  return formatEventDate(timeSec) + ' ' + pad(hours) + ':' + pad(minutes);
}

/**
 * Convert an event's content to a short human-readable string.
 * Resolves itemDef from the model (streamId + eventType match).
 *
 * With itemDef: select → localized option label, checkbox → "Yes",
 * number → "60 Kg" (with unit symbol from eventType extras),
 * datasource-search → drug label + intake details, date → ISO date.
 *
 * Without itemDef (fallback): derives unit from eventType symbol if available,
 * for object content produces short textual representation.
 */
export function eventToShortText (event: any): string | null {
  if (event == null) return null;

  const model = getModel();
  const itemDef = model.itemsDefs.forEvent(event, false);
  const content = event.content;

  if (itemDef) {
    // For checkbox/date items, content may be null — the event time IS the data
    if (content == null && itemDef.data.type === 'checkbox') {
      return formatEventDateTime(event.time);
    }
    if (content == null && itemDef.data.type === 'date') {
      return formatEventDate(event.time);
    }
    if (content == null) return null;
    return formatWithItemDef(event, content, itemDef, model);
  }
  if (content == null) return null;
  return formatFallback(event, content, model);
}

function formatWithItemDef (event: any, content: any, itemDef: any, model: any): string | null {
  const type = itemDef.data.type;

  if (type === 'convertible') {
    return formatConvertible(event, content, itemDef, model);
  }

  if (type === 'checkbox') {
    return event.type === 'activity/plain' ? 'Yes' : String(content);
  }

  if (type === 'select') {
    return formatSelect(event, content, itemDef);
  }

  if (type === 'date') {
    // date items store time on the event itself
    return formatEventDate(event.time);
  }

  if (type === 'datasource-search') {
    return formatDatasource(content);
  }

  // number, text, composite, etc.
  if (typeof content === 'number') {
    return formatNumber(event.type, content, model);
  }

  if (typeof content === 'string') {
    return content.length > 60 ? content.slice(0, 60) + '...' : content;
  }

  if (typeof content === 'boolean') {
    return content ? 'Yes' : 'No';
  }

  // Composite / object — try common fields
  return formatObject(content);
}

function formatFallback (event: any, content: any, model: any): string | null {
  if (typeof content === 'number') {
    return formatNumber(event.type, content, model);
  }

  if (typeof content === 'string') {
    return content.length > 60 ? content.slice(0, 60) + '...' : content;
  }

  if (typeof content === 'boolean') {
    return content ? 'Yes' : 'No';
  }

  if (typeof content === 'object') {
    return formatObject(content);
  }

  return String(content);
}

const TEST_RESULT_LABELS = {
  positive: { en: 'Positive', fr: 'Positif', es: 'Positivo' },
  negative: { en: 'Negative', fr: 'Négatif', es: 'Negativo' },
  indeterminate: { en: 'Indeterminate', fr: 'Indéterminé', es: 'Indeterminado' },
};

function formatTestResult (content: number): string {
  if (content === 0) return localizeText(TEST_RESULT_LABELS.indeterminate) || 'Indeterminate';
  const label = content > 0
    ? localizeText(TEST_RESULT_LABELS.positive) || 'Positive'
    : localizeText(TEST_RESULT_LABELS.negative) || 'Negative';
  // Exact -1, 0, 1: label only. Otherwise: label + percentage
  if (content === 1 || content === -1) return label;
  const pct = Math.round(Math.abs(content) * 100);
  return `${label} ${pct}%`;
}

function formatNumber (eventType: string, content: number, model: any): string {
  if (eventType === 'test-result/scale') {
    return formatTestResult(content);
  }
  if (HDSSettings.isHooked) {
    const system = HDSSettings.get('unitSystem');
    const result = model.conversions.convert(eventType, content, system);
    if (result) {
      const symbol = getSymbol(result.targetEventType, model);
      return symbol ? `${result.value} ${symbol}` : String(result.value);
    }
  }
  const symbol = getSymbol(eventType, model);
  return symbol ? `${content} ${symbol}` : String(content);
}

function formatSelect (event: any, content: any, itemDef: any): string {
  let valueForSelect = content;
  let prefix = '';
  if (event.type === 'ratio/generic' && typeof content === 'object') {
    prefix = content.value + '/' + content.relativeTo + ' ';
    valueForSelect = content.value;
  }

  const options = itemDef.data.options;
  if (options) {
    const selected = options.find((o: any) => o.value === valueForSelect);
    if (selected?.label) {
      const text = typeof selected.label === 'string' ? selected.label : (localizeText(selected.label) || String(valueForSelect));
      const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
      return prefix + truncated;
    }
  }
  return prefix + String(valueForSelect);
}

function formatDatasource (content: any): string | null {
  if (!content || typeof content !== 'object') return String(content);

  // medication/coded-v1: {drug: {label}, intake: {doseValue, doseUnit, route}}
  // legacy flat: {label, codes, doseValue, doseUnit, route}
  const label = content.drug?.label || content.label;
  let text: string;
  if (label) {
    text = typeof label === 'string' ? label : (localizeText(label) || JSON.stringify(content));
  } else {
    text = JSON.stringify(content);
  }

  const intake = content.intake || content;
  const parts: string[] = [];
  if (intake.doseValue) {
    const unitLabel = intake.doseUnit
      ? intake.doseUnit.replace(/^dose\//, '').replace(/^(mass|volume)\//, '')
      : '';
    parts.push(`${intake.doseValue} ${unitLabel}`.trim());
  }
  if (intake.route) parts.push(intake.route);
  if (parts.length > 0) text += ' — ' + parts.join(', ');

  return text;
}

function formatObject (content: any): string | null {
  if (content == null) return null;
  // Try common patterns
  if (content.label) {
    const txt = typeof content.label === 'object' ? localizeText(content.label) : content.label;
    if (txt) return String(txt);
  }
  if (content.drug?.label) {
    const dl = content.drug.label;
    return typeof dl === 'string' ? dl : (localizeText(dl) || null);
  }
  // medication/basic composite: { name, doseValue, doseUnit, route }
  if (content.name && typeof content.name === 'string') {
    const parts: string[] = [];
    if (content.doseValue) {
      parts.push(`${content.doseValue}${content.doseUnit ? ' ' + content.doseUnit : ''}`);
    }
    if (content.route) parts.push(content.route);
    return parts.length > 0 ? `${content.name} — ${parts.join(', ')}` : content.name;
  }
  if (content.value != null) return String(content.value);
  // Last resort: count keys
  const keys = Object.keys(content);
  if (keys.length === 0) return null;
  // Try first string/number field
  for (const k of keys) {
    const v = content[k];
    if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '...' : v;
    if (typeof v === 'number') return String(v);
  }
  return `{${keys.length} fields}`;
}

/**
 * Format a convertible event (euclidian-distance converter).
 *
 * Without autoConvert setting: show sourceData from the source method.
 * With autoConvert setting (different from source method): convert vector to target method, show:
 *   "targetResult (sourceData) 85%" — confidence = round((1 - matchDistance) * 100)
 *   When 100%, omit the percentage.
 * No source: show dimension summary using localized stop labels from converter config.
 */
function formatConvertible (_event: any, content: any, itemDef: any, model: any): string | null {
  const ce = itemDef.data['converter-engine'];
  if (!ce) return formatObject(content);

  const itemKey = ce.models;
  const source = content?.source;
  const vectors = content?.vectors;
  const engine = model.converters?.getEngine(itemKey);

  const sourceLabel = source?.sourceData != null && engine
    ? resolveObservationLabel(engine, source.key, source.sourceData)
    : formatSourceLabel(source);
  const sourceMethodName = getMethodName(engine, source?.key);

  // Check for autoConvert setting
  if (HDSSettings.isHooked && vectors) {
    try {
      const settingKey = `autoConvert-${itemDef.key}`;
      const targetMethod = HDSSettings.get(settingKey);
      if (targetMethod && typeof targetMethod === 'string') {
        // Skip conversion if target method equals source method
        if (source?.key === targetMethod && sourceLabel) {
          return `${sourceLabel} (${sourceMethodName})`;
        }
        if (engine) {
          const result = engine.fromVector(targetMethod, vectors);
          const resultLabel = resolveObservationLabel(engine, targetMethod, result.data);
          const targetMethodName = getMethodName(engine, targetMethod);
          const confidence = Math.round((1 - result.matchDistance) * 100);
          const confStr = confidence >= 100 ? '' : ` ${confidence}%`;
          if (sourceMethodName && sourceLabel) {
            return `${resultLabel} (${targetMethodName} <- ${sourceMethodName}${confStr})`;
          }
          return `${resultLabel} (${targetMethodName}${confStr})`;
        }
      }
    } catch { /* setting not found or engine not loaded, fall through */ }
  }

  // No autoConvert: show source observation + method name
  if (sourceLabel) {
    return `${sourceLabel} (${sourceMethodName})`;
  }

  // No source — RAW vector input, convert via _raw virtual method
  if (vectors && typeof vectors === 'object' && engine) {
    try {
      const result = engine.fromVector('_raw', vectors);
      const resultLabel = resolveObservationLabel(engine, '_raw', result.data);
      const confidence = Math.round((1 - result.matchDistance) * 100);
      const confStr = confidence >= 100 ? '' : ` ${confidence}%`;
      return `${resultLabel}${confStr}`;
    } catch { /* fall through */ }
  }
  // Fallback: raw dimension summary
  if (vectors && typeof vectors === 'object') {
    return formatVectorSummary(vectors, itemKey, model);
  }

  return formatObject(content);
}

/** Get the localized method name from the engine, fallback to methodId */
function getMethodName (engine: any, methodId: string | undefined): string {
  if (!methodId) return '?';
  const def = engine?.getMethodDef(methodId);
  if (def?.name) {
    return localizeText(def.name) || methodId;
  }
  return methodId;
}

/**
 * Resolve an observation value to its localized label from the method definition.
 * For single-component methods: looks up the value in the component options.
 * For multi-component methods (assembly): resolves each field's value to its option label.
 * Falls back to String(data) if no label found.
 */
function resolveObservationLabel (engine: any, methodId: string, data: any): string {
  const def = engine?.getMethodDef(methodId);
  if (!def?.components) return typeof data === 'string' ? data : JSON.stringify(data);

  if (typeof data === 'object' && data !== null) {
    // Multi-component: resolve each field
    const parts: string[] = [];
    for (const comp of def.components) {
      const val = data[comp.field];
      if (val === undefined) continue;
      const opt = comp.options.find((o: any) => o.value === val);
      if (opt?.label) {
        parts.push(localizeText(opt.label) || String(val));
      } else {
        parts.push(String(val));
      }
    }
    return parts.join(', ');
  }

  // Single-component: look up in first component's options
  for (const comp of def.components) {
    const opt = comp.options.find((o: any) => o.value === data);
    if (opt?.label) {
      return localizeText(opt.label) || String(data);
    }
  }
  return String(data);
}

/**
 * Format a vector as human-readable summary using dimension stop labels.
 * Used as fallback when _raw method is not available, and for rendering
 * object results from autoConvert (e.g. hds method returns vector objects).
 */
function formatVectorSummary (vectors: any, itemKey: string, model: any): string {
  const engine = model.converters?.getEngine(itemKey);
  const dims = Object.entries(vectors).filter(([_, v]) => typeof v === 'number');
  if (dims.length === 0) return 'empty';

  // Sort by weight (most important first)
  const sorted = dims.sort(([a], [b]) => {
    const wa = engine?.weights[a] ?? 0;
    const wb = engine?.weights[b] ?? 0;
    return wb - wa;
  });

  const parts: string[] = [];
  for (const [dimName, value] of sorted.slice(0, 3)) {
    const dimDef = engine?.dimensions?.[dimName];
    if (dimDef?.stops) {
      const stops = dimDef.stops;
      let nearest = stops[0];
      for (const stop of stops) {
        if (Math.abs(stop.value - (value as number)) < Math.abs(nearest.value - (value as number))) {
          nearest = stop;
        }
      }
      parts.push(localizeText(nearest.label) || dimName);
    } else {
      parts.push(`${dimName}:${(value as number).toFixed(1)}`);
    }
  }
  return parts.join(', ');
}

function formatSourceLabel (source: any): string | null {
  if (!source?.sourceData) return null;
  const raw = source.sourceData;
  const label = typeof raw === 'string'
    ? raw
    : typeof raw === 'number'
      ? String(raw)
      : JSON.stringify(raw);
  return label.length > 40 ? label.slice(0, 40) + '...' : label;
}

function getSymbol (eventType: string, model: any): string | null {
  try {
    return model.eventTypes.getEventTypeSymbol(eventType);
  } catch {
    return null;
  }
}
