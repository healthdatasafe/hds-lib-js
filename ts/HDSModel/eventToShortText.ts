import { localizeText, getPreferredLocales } from '../localizeText.ts';
import { getModel } from './HDSModelInitAndSingleton.ts';
// HDSSettings is still the right source for per-app settings (the dynamic
// `preferred-display-*` keys). Account-level preferences go through the resolver.
import HDSSettings from '../settings/HDSSettings.ts';
import { resolveAccountPreference, hasAccountPreference } from '../settings/accountPreferences.ts';
import type { DateFormat } from '../settings/HDSSettings.ts';

/** A calendar day: year, month (1-12), day of month. */
interface DayParts { y: number; m: number; d: number }

const DATE_SEPARATORS: Record<DateFormat, (p: DayParts, year: boolean) => string> = {
  'DD.MM.YYYY': (p, year) => pad(p.d) + '.' + pad(p.m) + '.' + (year ? p.y : ''),
  'DD/MM/YYYY': (p, year) => pad(p.d) + '/' + pad(p.m) + (year ? '/' + p.y : ''),
  'MM/DD/YYYY': (p, year) => pad(p.m) + '/' + pad(p.d) + (year ? '/' + p.y : ''),
  'YYYY-MM-DD': isoDay,
};

function isoDay (p: DayParts, year: boolean): string {
  return (year ? p.y + '-' : '') + pad(p.m) + '-' + pad(p.d);
}

function pad (n: number): string { return n < 10 ? '0' + n : String(n); }

export interface FormatEventDateOptions {
  /** Include the year (default `true`). Without it: `15.01.`, `15/01`, `01/15`, `01-15`. */
  year?: boolean;
  /** Put the short weekday name first, in `locale` (default `false`): `Mon 15.01.2024`. */
  weekday?: boolean;
  /** Locale of the weekday name; defaults to the first preferred locale. */
  locale?: string;
}

/** The format to apply, or null when none is resolved (ISO date then). */
function resolvedDateFormat (): DateFormat | null {
  if (!hasAccountPreference('dateFormat')) return null;
  const fmt = resolveAccountPreference('dateFormat');
  return DATE_SEPARATORS[fmt] ? fmt : null;
}

/** A calendar day in the resolved format (ISO date when none), with the options applied. */
function formatDayParts (p: DayParts, fmt: DateFormat | null, opts: FormatEventDateOptions): string {
  const year = opts.year !== false;
  const text = fmt ? DATE_SEPARATORS[fmt](p, year) : isoDay(p, year);
  if (!opts.weekday) return text;
  const locale = opts.locale ?? getPreferredLocales()[0] ?? 'en';
  let name = '';
  try {
    // Noon UTC of that calendar day, read in UTC: the weekday of the day itself, whatever the host time zone.
    name = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(p.y, p.m - 1, p.d, 12));
  } catch { /* unknown locale: no weekday rather than a throw */ }
  return name ? name + ' ' + text : text;
}

/**
 * Format a Unix timestamp (seconds) as a date string.
 * Uses the resolved account/app dateFormat when available (local calendar day), otherwise the ISO date (UTC).
 * `opts.year: false` leaves the year out, `opts.weekday: true` puts the short weekday name first.
 */
export function formatEventDate (timeSec: number, opts: FormatEventDateOptions = {}): string {
  const d = new Date(timeSec * 1000);
  const fmt = resolvedDateFormat();
  const parts: DayParts = fmt
    ? { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
    : { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  return formatDayParts(parts, fmt, opts);
}

/**
 * Format a calendar date stored as content (`date/iso-8601`, e.g. a date of birth: `"1990-04-12"`) in the
 * resolved date format. The day is read as written: no time-zone shift. Returns null when the string does not
 * start with a valid `YYYY-MM-DD`.
 */
function formatContentDate (content: unknown): string | null {
  if (typeof content !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(content);
  if (!m) return null;
  const parts: DayParts = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (parts.m < 1 || parts.m > 12 || parts.d < 1 || parts.d > 31) return null;
  return formatDayParts(parts, resolvedDateFormat(), {});
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
 *
 * For a convertible item (cervical fluid, mood) the text ends with where the value came from,
 * e.g. `"Creamy (Apple Health <- Mira)"`; read that as fields with `eventToShortTextWithOrigin`
 * rather than parsing the text.
 */
export function eventToShortText (event: any): string | null {
  return eventToShortTextWithOrigin(event).text;
}

/**
 * Where a convertible value shown by `eventToShortText` came from, as fields
 * (B-2026-10-26-17: consumers parsed it back out of the `(X <- Y n%)` text).
 */
export interface ShortTextOrigin {
  /** Method the value was recorded in (`content.source.key`, e.g. `mira`); null for a raw vector. */
  sourceKey: string | null;
  /** That method's localized name (`Mira`); null when there is no source. */
  sourceName: string | null;
  /** The recorded observation, localized from the method (`Creamy`); null when there is no source. */
  sourceLabel: string | null;
  /** Method the text is shown in when it was converted (`appleHealth`, `_raw`); null when shown as recorded. */
  targetKey: string | null;
  /** That method's localized name; null when shown as recorded. */
  targetName: string | null;
  /**
   * How close the conversion is, 0-100 (`round((1 - matchDistance) * 100)`; the text omits it at 100).
   * Null when the value is shown as recorded (no conversion).
   */
  match: number | null;
}

export interface ShortTextResult {
  /** Exactly what `eventToShortText` returns. */
  text: string | null;
  /** Set for convertible items when a source or a conversion is known; null otherwise. */
  origin: ShortTextOrigin | null;
}

/**
 * `eventToShortText` plus the structured origin of a convertible value: the method it was
 * recorded in, the method it is shown in, and the match of the conversion. The text is the
 * same string `eventToShortText` returns.
 */
export function eventToShortTextWithOrigin (event: any): ShortTextResult {
  if (event == null) return { text: null, origin: null };

  const model = getModel();
  const itemDef = model.itemsDefs.forEvent(event, false);
  const content = event.content;

  // Blood pressure has a fixed, self-describing shape ({systolic, diastolic, rate}).
  // Format it eventType-driven so it reads "120/80 ♥72" regardless of whether the
  // itemDef is loaded (its composite fields are numbers, which the generic
  // composite/object formatters would otherwise reduce to a single bare value).
  if (event.type === 'blood-pressure/mmhg-bpm' && content != null && typeof content === 'object') {
    const bp = formatBloodPressure(content);
    if (bp) return { text: bp, origin: null };
  }

  if (itemDef) {
    // For checkbox/date items, content may be null — the event time IS the data
    if (content == null && itemDef.data.type === 'checkbox') {
      return { text: formatEventDateTime(event.time), origin: null };
    }
    if (content == null && itemDef.data.type === 'date') {
      return { text: formatEventDate(event.time), origin: null };
    }
    if (content == null) return { text: null, origin: null };
    if (itemDef.data.type === 'convertible') {
      return formatConvertible(content, itemDef, model);
    }
    return { text: formatWithItemDef(event, content, itemDef, model), origin: null };
  }
  if (content == null) return { text: null, origin: null };
  return { text: formatFallback(event, content, model), origin: null };
}

function formatWithItemDef (event: any, content: any, itemDef: any, model: any): string | null {
  const type = itemDef.data.type;

  if (type === 'checkbox') {
    return event.type === 'activity/plain' ? 'Yes' : String(content);
  }

  if (type === 'select') {
    return formatSelect(event, content, itemDef, model);
  }

  if (type === 'multi-select') {
    return formatMultiSelect(content, itemDef);
  }

  if (type === 'date') {
    // A date stored as the value (`date/iso-8601`, the date of birth) is the data; otherwise the
    // event's own time is (B-2026-10-26-6: the entry time was shown instead of the stored date).
    return formatContentDate(content) ?? formatEventDate(event.time);
  }

  if (type === 'datasource-search') {
    return formatDatasource(content);
  }

  if (type === 'slider') {
    return formatSlider(content, itemDef);
  }

  if (type === 'composite') {
    return formatComposite(content, itemDef);
  }

  // number, text, composite, etc.
  if (typeof content === 'number') {
    const display = itemDef.data?.number?.display;
    const optionUnit = variationUnitLabel(event.type, itemDef);
    if (display) return formatNumberDisplay(event.type, content, display, model, optionUnit);
    return formatNumber(event.type, content, model, optionUnit);
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
    if (event.type === 'date/iso-8601') {
      const date = formatContentDate(content);
      if (date) return date;
    }
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

/**
 * The unit an item names for the event's type in its `variations.eventType` options (B-2026-10-27-4): AMH on
 * `concentration/ug-l` reads `ng/mL` (the option label), not `µg/L` (the eventType symbol); prolactin on
 * `concentration/uiu-ml` reads `mIU/L`. Null when the item has no such option or the option has no label.
 *
 * Only `concentration/*` options count: their labels are the clinical unit notation, the one hds-forms-js shows
 * beside the field. Other variation labels are form words (`body-height` `Feet`, `body-weight` `Lbs`), not
 * symbols, so those items keep the eventType symbol and the unit-system conversion.
 */
function variationUnitLabel (eventType: string, itemDef: any): string | null {
  if (typeof eventType !== 'string' || !eventType.startsWith('concentration/')) return null;
  const options = itemDef?.data?.variations?.eventType?.options;
  if (!Array.isArray(options)) return null;
  const option = options.find((o: any) => o?.value === eventType);
  if (option?.label == null) return null;
  const label = typeof option.label === 'string' ? option.label : localizeText(option.label);
  return label ? label.trim() || null : null;
}

/**
 * A number with its unit. `unitLabel` (the item's variation option label, `variationUnitLabel`) takes the place of
 * the eventType symbol when the value is shown in its own type; a unit-system conversion shows the target type's
 * symbol.
 */
function formatNumber (eventType: string, content: number, model: any, unitLabel: string | null = null): string {
  if (eventType === 'test-result/scale') {
    return formatTestResult(content);
  }
  if (eventType === 'ratio/proportion') {
    // A proportion (0-1) reads as a percentage: 0.057 → "5.7 %" (rounding drops float noise, e.g. 5.700000000000001).
    return `${Math.round(content * 100 * 1e6) / 1e6} %`;
  }
  if (hasAccountPreference('unitSystem')) {
    const system = resolveAccountPreference('unitSystem');
    const result = model.conversions.convert(eventType, content, system);
    if (result) {
      const symbol = getSymbol(result.targetEventType, model);
      return symbol ? `${result.value} ${symbol}` : String(result.value);
    }
  }
  const symbol = unitLabel ?? getSymbol(eventType, model);
  return symbol ? `${content} ${symbol}` : String(content);
}

/** Significant digits that strip binary-float noise (`0.42 * 100` → 42), far beyond any assay's precision. */
const FLOAT_NOISE_PRECISION = 12;

/**
 * Format a number item that declares `number.display` (B-2026-10-26-22), as hds-forms-js
 * `NumberInput` shows it on entry (`toDisplayText`): the raw value times `multiplier` (default 1),
 * `precision` decimals when set, else float noise stripped without truncating real decimals; then
 * `suffix` in place of the eventType symbol (AMH `ng/mL` over `µg/L`, sperm concentration `10⁶/mL`
 * over `G/L`, HbA1c `0.057` → `5.7 %`). No unit-system conversion: the item states how it reads.
 *
 * Unit precedence: `display.suffix`, then (unscaled only) the variation option label `unitLabel`, then the eventType
 * symbol. A scaled value (`multiplier` ≠ 1) without a suffix shows no unit: neither the label nor the symbol names it.
 */
function formatNumberDisplay (eventType: string, content: number, display: any, model: any, unitLabel: string | null = null): string {
  const multiplier: number = typeof display.multiplier === 'number' ? display.multiplier : 1;
  const scaled = content * multiplier;
  const text = typeof display.precision === 'number'
    ? scaled.toFixed(display.precision)
    : String(Number(scaled.toPrecision(FLOAT_NOISE_PRECISION)));
  const suffix = display.suffix ? localizeText(display.suffix) : null;
  const unit = suffix || (multiplier === 1 ? (unitLabel ?? getSymbol(eventType, model)) : null);
  return unit ? `${text} ${unit}` : text;
}

/**
 * Format a slider event: applies the item-def's slider.display block
 * (multiplier / precision / suffix) so the readout matches what the patient
 * saw when entering the value. Storage is the raw number; display rescales.
 */
function formatSlider (content: any, itemDef: any): string {
  if (typeof content !== 'number') return String(content);
  const display = itemDef.data?.slider?.display || {};
  const multiplier: number = typeof display.multiplier === 'number' ? display.multiplier : 1;
  let precision: number;
  if (typeof display.precision === 'number') {
    precision = display.precision;
  } else if (multiplier >= 10) {
    precision = 0;
  } else {
    const stepStr = String(itemDef.data?.step ?? 1);
    const dot = stepStr.indexOf('.');
    precision = dot >= 0 ? Math.min(stepStr.length - dot - 1, 4) : 0;
  }
  const scaled = content * multiplier;
  const text = scaled.toFixed(precision);
  const suffix = display.suffix ? localizeText(display.suffix) : '';
  return suffix ? `${text} ${suffix}` : text;
}

/**
 * Format a composite event by walking the itemDef's `composite` block. Only
 * applies when every field is a `select` with options — emits "Field: Label"
 * for each present field, joined by " · ". The field label uses the
 * composite entry's localised `label`; the value resolves to the option's
 * localised label when a discrete match exists, otherwise falls back to the
 * raw value (e.g. continuous imports stored at non-canonical numeric values).
 *
 * Used e.g. for `body-vulva-cervix-position` so tooltips read
 * "Height: High · Firmness: Soft · Openness: Open" — the dimension is named
 * even when the imported value falls between option stops.
 *
 * Falls through to `formatObject` for free-form composites (e.g.
 * medication/basic with `name`/`doseValue`/`doseUnit`/`route`) so existing
 * shape-specific renderers keep working.
 */
function formatComposite (content: any, itemDef: any): string | null {
  if (!content || typeof content !== 'object') return String(content);
  const composite = itemDef?.data?.composite;
  if (!composite) return formatObject(content);
  const fieldKeys = Object.keys(composite);
  const allSelectsWithOptions = fieldKeys.length > 0 && fieldKeys.every(k =>
    composite[k]?.type === 'select' && Array.isArray(composite[k]?.options)
  );
  if (!allSelectsWithOptions) return formatObject(content);
  const parts: string[] = [];
  for (const field of fieldKeys) {
    const value = content[field];
    if (value === undefined || value === null) continue;
    const fieldDef = composite[field];
    const fieldLabel = typeof fieldDef.label === 'string'
      ? fieldDef.label
      : (localizeText(fieldDef.label) || field);
    // Prefer exact option match; for continuous numeric values that fall
    // between stops (e.g. Mira imports), snap to the nearest option so the
    // tooltip shows a meaningful label instead of a raw number.
    let opt = fieldDef.options.find((o: any) => o.value === value);
    if (!opt && typeof value === 'number') {
      opt = nearestNumericOption(fieldDef.options, value);
    }
    let valueText: string;
    if (opt?.label) {
      valueText = typeof opt.label === 'string' ? opt.label : (localizeText(opt.label) || String(value));
    } else {
      valueText = String(value);
    }
    parts.push(`${fieldLabel}: ${valueText}`);
  }
  return parts.length > 0 ? parts.join(' · ') : formatObject(content);
}

/**
 * Blood pressure (`blood-pressure/mmhg-bpm`) → "120/80", or "120/80 ♥72" when a
 * pulse (`rate`) is present. eventType-driven: the `{systolic, diastolic, rate}`
 * shape is fixed, so it renders correctly even without the itemDef. Returns null
 * when systolic/diastolic are absent so the caller falls back to normal handling.
 */
function formatBloodPressure (content: any): string | null {
  const { systolic, diastolic, rate } = content;
  if (systolic == null || diastolic == null) return null;
  const base = `${systolic}/${diastolic}`;
  return (rate != null) ? `${base} ♥${rate}` : base;
}

/**
 * A `select` whose stored value matches no option still has to render.
 *
 * When the value is a plain number we hand it to `formatNumber` rather than stringifying it,
 * because the eventType may carry meaning the option list does not cover. `test-result/scale`
 * is the case that forced this: data-model 3.12.0 made `fertility-test-opk` and
 * `fertility-test-pregnancy` `type: select` with Negative / Indeterminate / Positive at
 * -1 / 0 / 1, which is right for data entry — but the scale is continuous, and events already
 * stored carry partial values. Those matched no option and came out as a bare `0.56` instead of
 * `Positive 56%`, silently degrading text in every consumer (`[EST17d]`/`[EST17e]`).
 *
 * Scoped to the no-prefix case: the `ratio/generic` object branch has already put the raw
 * numbers in `prefix`, so running them through `formatNumber` would render them twice.
 */
function formatSelect (event: any, content: any, itemDef: any, model?: any): string {
  let valueForSelect = content;
  let prefix = '';
  if (event.type === 'ratio/generic' && typeof content === 'object') {
    prefix = content.value + '/' + content.relativeTo + ' ';
    valueForSelect = content.value;
  }

  const options = itemDef.data.options;
  if (options) {
    let selected = options.find((o: any) => o.value === valueForSelect);
    // A `ratio/proportion` select is a 0-1 scale whose options are hooks on it (bleeding: 0.08 … 0.95). A value
    // imported between hooks (a device's continuous reading) reads as the nearest hook's label, as composites do.
    if (!selected && prefix === '' && event.type === 'ratio/proportion' && typeof valueForSelect === 'number') {
      selected = nearestNumericOption(options, valueForSelect);
    }
    if (selected?.label) {
      const text = typeof selected.label === 'string' ? selected.label : (localizeText(selected.label) || String(valueForSelect));
      const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
      return prefix + truncated;
    }
  }
  if (prefix === '' && typeof valueForSelect === 'number' && model) {
    return formatNumber(event.type, valueForSelect, model);
  }
  return prefix + String(valueForSelect);
}

/** The option whose numeric value is closest to `value` (first one on a tie), or null when none is numeric. */
function nearestNumericOption (options: any[], value: number): any {
  let nearest: any = null;
  let bestDist = Infinity;
  for (const o of options) {
    if (typeof o.value !== 'number') continue;
    const d = Math.abs(o.value - value);
    if (d < bestDist) { bestDist = d; nearest = o; }
  }
  return nearest;
}

/**
 * `multi-select` content is an array of option values — render the localized labels
 * joined, e.g. "White, Hispanic or Latino". Truncates on the joined string so a long
 * selection stays a short text, and tolerates a scalar (an event written before the
 * item became multi-valued) rather than printing "[object Object]".
 */
function formatMultiSelect (content: any, itemDef: any): string {
  const values: any[] = Array.isArray(content) ? content : [content];
  const options = itemDef.data.options;
  const labels = values.map((v) => {
    const selected = options?.find((o: any) => o.value === v);
    if (!selected?.label) return String(v);
    return typeof selected.label === 'string' ? selected.label : (localizeText(selected.label) || String(v));
  });
  const text = labels.join(', ');
  return text.length > 50 ? text.slice(0, 50) + '...' : text;
}

function formatDatasource (content: any): string | null {
  if (!content || typeof content !== 'object') return String(content);

  // Resolve the coded value object across shapes:
  //   medication/coded-v1   → {drug: {label, codes, ...}, intake: {...}}
  //   treatment/coded-v1    → {regimen: {label, codes, ...}, count?, notes?}
  //   procedure/coded-v1    → {procedure: {label, codes, ...}, count?, findings?, notes?}
  //   medication legacy     → {label, codes, doseValue, doseUnit, route}
  //   generic datasource    → any object with a property whose value carries a `label`
  let datasourceObj: any = content.drug ?? content.regimen ?? content.procedure;
  if (!datasourceObj && content.label) datasourceObj = content;  // legacy flat
  if (!datasourceObj) {
    for (const v of Object.values(content)) {
      if (v && typeof v === 'object' && (v as any).label !== undefined) {
        datasourceObj = v;
        break;
      }
    }
  }

  const label = datasourceObj?.label;
  let text: string;
  if (label) {
    text = typeof label === 'string' ? label : (localizeText(label) || JSON.stringify(datasourceObj));
  } else {
    text = JSON.stringify(content);
  }

  const parts: string[] = [];

  // Medication intake (new {drug, intake} OR legacy flat with doseValue at top level)
  const intake = content.intake || (datasourceObj === content ? content : null);
  if (intake?.doseValue) {
    const unitLabel = intake.doseUnit
      ? intake.doseUnit.replace(/^dose\//, '').replace(/^(mass|volume)\//, '')
      : '';
    parts.push(`${intake.doseValue} ${unitLabel}`.trim());
  }
  if (intake?.route) parts.push(intake.route);

  // Treatment / procedure scalars (sibling fields on the event content)
  if (typeof content.count === 'number' && content.count > 1) {
    parts.push(`×${content.count}`);
  }
  if (Array.isArray(content.findings) && content.findings.length > 0) {
    const labels = content.findings.slice(0, 2).map((f: any) => {
      if (typeof f === 'string') return f;
      if (f?.label) return typeof f.label === 'string' ? f.label : (localizeText(f.label) || null);
      return null;
    }).filter(Boolean);
    if (labels.length > 0) parts.push(labels.join(', '));
  }
  if (typeof content.notes === 'string' && content.notes.trim() !== '') {
    const n = content.notes.trim();
    parts.push(n.length > 30 ? n.slice(0, 30) + '...' : n);
  }

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
  // medication/basic composite: { name, intake: { doseValue, doseUnit, route } }
  // (legacy events stored the dose fields flat at the top level — read both).
  if (content.name && typeof content.name === 'string') {
    const intake = content.intake ?? content;
    const parts: string[] = [];
    if (intake.doseValue) {
      parts.push(`${intake.doseValue}${intake.doseUnit ? ' ' + intake.doseUnit : ''}`);
    }
    if (intake.route) parts.push(intake.route);
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
 *
 * Returns the text with its structured origin (`ShortTextOrigin`), null when neither a source
 * nor a conversion is known.
 */
function formatConvertible (content: any, itemDef: any, model: any): ShortTextResult {
  const ce = itemDef.data['converter-engine'];
  if (!ce) return { text: formatObject(content), origin: null };

  const itemKey = ce.models;
  const source = content?.source;
  const vectors = content?.vectors;
  const engine = model.converters?.getEngine(itemKey);

  const sourceLabel = source?.sourceData != null && engine
    ? resolveObservationLabel(engine, source.key, source.sourceData)
    : formatSourceLabel(source);
  const sourceMethodName = getMethodName(engine, source?.key);
  const sourceKey: string | null = typeof source?.key === 'string' ? source.key : null;
  /** The origin of a value shown as recorded (no conversion), or converted into `target`. */
  const origin = (target: { key: string; name: string; match: number } | null): ShortTextOrigin => ({
    sourceKey,
    sourceName: sourceKey ? sourceMethodName : null,
    sourceLabel: sourceLabel ?? null,
    targetKey: target?.key ?? null,
    targetName: target?.name ?? null,
    match: target?.match ?? null
  });
  // A conversion needs every dimension: on a partial vector (e.g. mood with only `valence`)
  // the engine invents the missing ones and the confidence comes out NaN (B-2026-10-06-2).
  const vectorComplete = isCompleteVector(engine, vectors);

  // Check for autoConvert setting
  if (HDSSettings.isHooked && vectors && vectorComplete) {
    try {
      const settingKey = `preferred-display-${itemDef.key}`;
      const targetMethod = HDSSettings.get(settingKey);
      if (targetMethod && typeof targetMethod === 'string') {
        // Skip conversion if target method equals source method
        if (source?.key === targetMethod && sourceLabel) {
          return { text: `${sourceLabel} (${sourceMethodName})`, origin: origin(null) };
        }
        if (engine) {
          const result = engine.fromVector(targetMethod, vectors);
          const resultLabel = resolveObservationLabel(engine, targetMethod, result.data);
          const targetMethodName = getMethodName(engine, targetMethod);
          const confidence = Math.round((1 - result.matchDistance) * 100);
          const confStr = confidence >= 100 ? '' : ` ${confidence}%`;
          const converted = origin({ key: targetMethod, name: targetMethodName, match: confidence });
          if (sourceMethodName && sourceLabel) {
            return { text: `${resultLabel} (${targetMethodName} <- ${sourceMethodName}${confStr})`, origin: converted };
          }
          return { text: `${resultLabel} (${targetMethodName}${confStr})`, origin: converted };
        }
      }
    } catch { /* setting not found or engine not loaded, fall through */ }
  }

  // No autoConvert: show source observation + method name
  if (sourceLabel) {
    return { text: `${sourceLabel} (${sourceMethodName})`, origin: origin(null) };
  }

  // No source — RAW vector input, convert via _raw virtual method
  if (vectors && typeof vectors === 'object' && engine && vectorComplete) {
    try {
      const result = engine.fromVector('_raw', vectors);
      const resultLabel = resolveObservationLabel(engine, '_raw', result.data);
      const confidence = Math.round((1 - result.matchDistance) * 100);
      const confStr = confidence >= 100 ? '' : ` ${confidence}%`;
      return {
        text: `${resultLabel}${confStr}`,
        origin: origin({ key: '_raw', name: getMethodName(engine, '_raw'), match: confidence })
      };
    } catch { /* fall through */ }
  }
  // Partial vector, or no engine loaded: label the dimensions present from the item's own
  // composite options ("Valence: Unpleasant"), never the raw "valence:0.3".
  if (vectors && typeof vectors === 'object' && itemDef.data.composite) {
    const text = formatComposite(vectors, itemDef);
    if (text) return { text, origin: null };
  }
  // Fallback: raw dimension summary
  if (vectors && typeof vectors === 'object') {
    return { text: formatVectorSummary(vectors, itemKey, model), origin: null };
  }

  return { text: formatObject(content), origin: null };
}

/** True when the vector carries a number for every dimension the engine knows. */
function isCompleteVector (engine: any, vectors: any): boolean {
  if (!engine || vectors == null || typeof vectors !== 'object') return false;
  const names: string[] = engine.dimensionNames ?? Object.keys(engine.dimensions ?? {});
  return names.length > 0 && names.every((d) => typeof vectors[d] === 'number');
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
