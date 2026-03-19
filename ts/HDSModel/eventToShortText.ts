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
      return formatEventDate(event.time);
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

function formatNumber (eventType: string, content: number, model: any): string {
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
 * Shows source observation + source method name.
 * If an autoConvert setting exists, converts to that method instead.
 */
function formatConvertible (_event: any, content: any, itemDef: any, model: any): string | null {
  const ce = itemDef.data['converter-engine'];
  if (!ce) return formatObject(content);

  const itemKey = ce.models;
  const source = content?.source;
  const data = content?.data;

  // If source block exists, show the source observation + method name
  if (source?.sourceData != null && source?.key) {
    const sourceLabel = typeof source.sourceData === 'string'
      ? source.sourceData
      : typeof source.sourceData === 'number'
        ? String(source.sourceData)
        : JSON.stringify(source.sourceData);
    const truncated = sourceLabel.length > 40 ? sourceLabel.slice(0, 40) + '...' : sourceLabel;

    // Check for autoConvert setting
    if (HDSSettings.isHooked && data) {
      const settingKey = `autoConvert-${itemDef.key}`;
      try {
        const targetMethod = HDSSettings.get(settingKey as any);
        if (targetMethod && typeof targetMethod === 'string') {
          const engine = model.converters?.getEngine(itemKey);
          if (engine) {
            const result = engine.fromVector(targetMethod, data);
            const resultLabel = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
            return `${resultLabel} (${targetMethod})`;
          }
        }
      } catch { /* setting not found, use default */ }
    }

    return `${truncated} (${source.key})`;
  }

  // No source — RAW vector input, show dimension summary
  if (data && typeof data === 'object') {
    const dims = Object.entries(data).filter(([_, v]) => typeof v === 'number' && v > 0);
    if (dims.length === 0) return 'empty';
    const top = dims.sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 3);
    return top.map(([k, v]) => `${k}:${(v as number).toFixed(1)}`).join(' ');
  }

  return formatObject(content);
}

function getSymbol (eventType: string, model: any): string | null {
  try {
    return model.eventTypes.getEventTypeSymbol(eventType);
  } catch {
    return null;
  }
}
