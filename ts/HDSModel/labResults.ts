import { localizeText } from '../localizeText.ts';
import { getModel } from './HDSModelInitAndSingleton.ts';

/**
 * Lab results read the same way everywhere (data-model BLOOD-CHEMISTRY.md, site-agents#22 #28):
 * - a numeric lab event may be a printed limit (`< 1.5`): `clientData.hdsComparator` on an item event,
 *   `content.comparator` on `lab-result/coded-v1`. A reader never uses such a value as exact.
 * - `lab-result/coded-v1` carries results with no item of their own, coded by LOINC in content, stored as printed
 *   (UCUM `unit`, optional `unitText` as printed), never converted.
 */

export const LAB_RESULT_CODED = 'lab-result/coded-v1';
export type LabComparator = '<' | '<=' | '>' | '>=';
export const LAB_COMPARATORS: readonly LabComparator[] = ['<', '<=', '>', '>='];
const LOINC_SYSTEM = 'http://loinc.org';
const UCUM_SYSTEM = 'http://unitsofmeasure.org';

interface LabEventLike { type?: string; streamIds?: string[]; content?: any; clientData?: any }

/**
 * The comparator of a numeric lab result: `content.comparator` on `lab-result/coded-v1` (`clientData.hdsComparator`
 * ignored there), `clientData.hdsComparator` otherwise. `null` = exact; `'unknown'` = a comparator is present but not
 * one of the four, so the value is not exact either.
 */
export function labComparatorOf (event: LabEventLike): LabComparator | 'unknown' | null {
  if (event == null) return null;
  const raw = event.type === LAB_RESULT_CODED ? event.content?.comparator : event.clientData?.hdsComparator;
  if (raw == null) return null;
  return (LAB_COMPARATORS as readonly string[]).includes(raw) ? raw : 'unknown';
}

/** True when the event holds a number that is an exact figure: charts and statistics use only those as exact. */
export function isExactLabValue (event: LabEventLike): boolean {
  if (event == null || labComparatorOf(event) !== null) return false;
  const value = event.type === LAB_RESULT_CODED ? event.content?.value : event.content;
  return typeof value === 'number';
}

/**
 * The unit of a coded result for display: `unitText` (as printed) when present, else the UCUM code made readable
 * (`umol/L` → `µmol/L`, `{copies}/mL` → `copies/mL`, `[IU]/L` → `IU/L`, `10*9/L` → `10^9/L`); null for unitless `1`.
 */
export function labUnitText (content: any): string | null {
  if (typeof content?.unitText === 'string' && content.unitText.trim() !== '') return content.unitText.trim();
  const unit = content?.unit;
  if (typeof unit !== 'string' || unit === '' || unit === '1') return null;
  return unit
    .replace(/(^|[/.])u(?=[a-zA-Z[])/g, '$1µ')
    .replace(/[{}[\]]/g, '')
    .replace(/10\*/g, '10^');
}

function analyteLabel (analyte: any): string | null {
  try {
    const label = localizeText(analyte?.label);
    if (label) return label;
  } catch { /* a label without `en` is invalid content: fall back to the code */ }
  const coding = Array.isArray(analyte?.codes) ? analyte.codes[0] : null;
  return coding?.display || coding?.code || null;
}

/**
 * Short text of a `lab-result/coded-v1` content: `HIV-1 RNA (viral load) < 20 copies/mL`, `HBsAg: negative`,
 * `Rubella IgG 3.2 index (positive)`. An unknown comparator reads `?`.
 */
export function labResultCodedText (content: any): string | null {
  if (content == null || typeof content !== 'object') return null;
  const label = analyteLabel(content.analyte);
  const text = typeof content.valueText === 'string' && content.valueText !== '' ? content.valueText : null;
  let figure: string | null = null;
  if (typeof content.value === 'number') {
    const comparator = labComparatorOf({ type: LAB_RESULT_CODED, content });
    const unit = labUnitText(content);
    figure = (comparator == null ? '' : (comparator === 'unknown' ? '?' : comparator) + ' ') + content.value + (unit ? ' ' + unit : '');
  }
  if (figure != null) {
    const full = text ? `${figure} (${text})` : figure;
    return label ? `${label} ${full}` : full;
  }
  if (text != null) return label ? `${label}: ${text}` : text;
  return label;
}

export interface LabFhirValue {
  valueQuantity?: { value: number; comparator?: LabComparator; unit?: string; system?: string; code?: string };
  valueString?: string;
  valueCodeableConcept?: { coding: Array<{ system: string; code: string; display?: string }>; text?: string };
}

/**
 * FHIR `Observation.value[x]` of a lab event (an item event with a number, or `lab-result/coded-v1`), or null.
 * The comparator is set only when the value is a limit; an unknown comparator gives no value at all (never an exact
 * figure by mistake). UCUM `system` / `code` only on coded results: item eventTypes carry no UCUM code.
 */
export function labValueToFhir (event: LabEventLike, model: any = getModel()): LabFhirValue | null {
  if (event == null) return null;
  const comparator = labComparatorOf(event);
  if (comparator === 'unknown') return null;
  if (event.type === LAB_RESULT_CODED) {
    const c = event.content;
    if (c == null || typeof c !== 'object') return null;
    if (typeof c.value === 'number') {
      const q: LabFhirValue['valueQuantity'] = { value: c.value };
      if (comparator) q.comparator = comparator;
      const unit = labUnitText(c);
      if (unit) q.unit = unit;
      if (typeof c.unit === 'string') { q.system = UCUM_SYSTEM; q.code = c.unit; }
      return { valueQuantity: q };
    }
    if (c.valueCoded != null) {
      const coding = { system: c.valueCoded.system, code: c.valueCoded.code, ...(c.valueCoded.display ? { display: c.valueCoded.display } : {}) };
      return { valueCodeableConcept: { coding: [coding], ...(c.valueText ? { text: c.valueText } : {}) } };
    }
    return typeof c.valueText === 'string' ? { valueString: c.valueText } : null;
  }
  if (typeof event.content !== 'number' || typeof event.type !== 'string') return null;
  const q: LabFhirValue['valueQuantity'] = { value: event.content };
  if (comparator) q.comparator = comparator;
  const unit = itemUnitLabel(event, model);
  if (unit) q.unit = unit;
  return { valueQuantity: q };
}

/** The unit an item event reads in: its variation option label, else the eventType symbol. */
function itemUnitLabel (event: LabEventLike, model: any): string | null {
  const itemDef = model.itemsDefs.forEvent(event, false);
  const option = itemDef?.data?.variations?.eventType?.options?.find((o: any) => o?.value === event.type);
  if (option?.label != null) {
    const label = typeof option.label === 'string' ? option.label : localizeText(option.label);
    if (label) return label;
  }
  try {
    return model.eventTypes.getEventTypeSymbol(event.type) || null;
  } catch {
    return null;
  }
}

function primaryCoding (content: any): { system: string; code: string } | null {
  const codes = Array.isArray(content?.analyte?.codes) ? content.analyte.codes : [];
  return codes.find((c: any) => c?.system === LOINC_SYSTEM) ?? codes[0] ?? null;
}

/**
 * Series identity, so a chart never merges two analytes of one coded stream nor two units of one analyte:
 * `<itemKey>` for an item event, `<itemKey or streamId>|<system>|<code>|<unit>` for `lab-result/coded-v1`
 * (its LOINC code first, else its first code). Null when the event resolves to nothing.
 */
export function labSeriesKey (event: LabEventLike, model: any = getModel()): string | null {
  if (event == null) return null;
  const itemDef = model.itemsDefs.forEvent(event, false);
  if (event.type !== LAB_RESULT_CODED) return itemDef?.key ?? null;
  const coding = primaryCoding(event.content);
  if (coding == null) return null;
  const base = itemDef?.key ?? event.streamIds?.[0] ?? '';
  return `${base}|${coding.system}|${coding.code}|${event.content?.unit ?? ''}`;
}

/** A LOINC code with a valid mod-10 check digit (`8867-4`). */
export function isValidLoincCode (code: string): boolean {
  if (typeof code !== 'string' || !/^\d{1,7}-\d$/.test(code)) return false;
  const digits = code.replace('-', '');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export interface LabResultCodedIssue {
  code: 'owned-by-item' | 'no-loinc' | 'invalid-loinc';
  itemKey?: string;
  loinc?: string;
}

/**
 * Model checks of a `lab-result/coded-v1` event the schema cannot make. All are warnings for the writer:
 * `owned-by-item` (an item asserts this LOINC: the result belongs there, except the interim while the item lacks
 * the printed unit, BLOOD-CHEMISTRY.md), `no-loinc` (no `http://loinc.org` code), `invalid-loinc` (bad check digit).
 */
export function checkLabResultCoded (event: LabEventLike, model: any = getModel()): LabResultCodedIssue[] {
  if (event?.type !== LAB_RESULT_CODED) return [];
  const codes = Array.isArray(event.content?.analyte?.codes) ? event.content.analyte.codes : [];
  const loincs = codes.filter((c: any) => c?.system === LOINC_SYSTEM).map((c: any) => c.code);
  if (loincs.length === 0) return [{ code: 'no-loinc' }];
  const issues: LabResultCodedIssue[] = [];
  for (const loinc of loincs) {
    if (!isValidLoincCode(loinc)) {
      issues.push({ code: 'invalid-loinc', loinc });
      continue;
    }
    const owner = model.itemsDefs.forLoinc(loinc);
    if (owner) issues.push({ code: 'owned-by-item', itemKey: owner.key, loinc });
  }
  return issues;
}
