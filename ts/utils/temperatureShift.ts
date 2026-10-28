/**
 * Basal-temperature shift and coverline, by the coverline rule a method charts the temperature by.
 *
 * Chart notation only: the line and the high temperatures it counts, as a paper chart shows them. Nothing here says
 * a day is fertile or infertile (data-model `documentation/MENSTRUAL-CYCLE.md`, "Coverline").
 *
 * Which rule a method uses is data-model data: each method of the `cervical-fluid` converter pack carries
 * `temperatureRule`, a key of the pack's `temperatureRules` or `none` (3.24.0). The parameters of each rule are the
 * method specification of model-cervical-fluid, `references/rules/coverline-rules.json` (version 2026-10-28), copied
 * in `TEMPERATURE_RULES` below. Days are calendar days of the patient's time zone, as in `cyclePhaseAt`.
 */
import { localDayNumber, startOfLocalDay } from './calendarDay.ts';
import type { CycleEventLike } from './cyclePhase.ts';
import type { MethodDef } from '../converters/types.ts';

/** A rule that computes the line (°C). */
export interface CalculatedTemperatureRule {
  /** The low temperatures the line rests on, before the first high one. */
  lowCount: number;
  /** The line, this much above the highest of the low temperatures (0: on it). */
  offset: number;
  /** The first high temperature, at least this much above the highest low (0: any amount higher). */
  firstRise: number;
  /** The high temperatures above the line that confirm the shift. */
  highCount: number;
  /** The last of them, at least this much above the line. */
  lastMin: number;
  /** When the last is not high enough, one more temperature above the line confirms the shift. */
  extraDay: boolean;
  /**
   * One high temperature after the first (the 2nd or 3rd of 3) may fall on or under the line: it is left out and the
   * next one counts instead, and must itself be `lastMin` above the line. Never combined with `extraDay`.
   */
  dropOne: boolean;
}

/** A method that publishes no calculation: the person draws the line. */
export interface ManualTemperatureRule {
  manual: true;
}

export type TemperatureRule = CalculatedTemperatureRule | ManualTemperatureRule;

/** The rule ids of the data model's `temperatureRules` (cervical-fluid converter, 3.24.0). */
export type TemperatureRuleId = 'sympto-thermal' | 'sensiplan' | 'manual';

/**
 * The parameters of each rule, from model-cervical-fluid `references/rules/coverline-rules.json` (version
 * 2026-10-28). Not modelled (as there): TCOYF's slow-rise variant, and the double check with the mucus, which
 * confirms the phase after ovulation but does not move the line.
 */
export const TEMPERATURE_RULES: Readonly<Record<TemperatureRuleId, Readonly<TemperatureRule>>> = Object.freeze({
  // STM / TCOYF (Weschler, Taking Charge of Your Fertility, 2015, pp. 93-94, 174, 435-439; tcoyf.com Celsius)
  'sympto-thermal': Object.freeze({ lowCount: 6, offset: 0.05, firstRise: 0.1, highCount: 3, lastMin: 0.15, extraDay: true, dropOne: false }),
  // Sensiplan, "3 over 6", with its two exceptions (Arbeitsgruppe NFP; Frank-Herrmann et al. 2007)
  sensiplan: Object.freeze({ lowCount: 6, offset: 0, firstRise: 0, highCount: 3, lastMin: 0.2, extraDay: true, dropOne: true }),
  // Justisse: no numeric rule published
  manual: Object.freeze({ manual: true as const })
});

export function isManualTemperatureRule (rule: TemperatureRule): rule is ManualTemperatureRule {
  return (rule as ManualTemperatureRule).manual === true;
}

/**
 * The rule a method charts the temperature by, from its converter-pack definition (`temperatureRule`). Null when the
 * method draws no coverline (`none`), when the pack predates 3.24.0, or for a rule id this version does not know.
 */
export function temperatureRuleOf (method: Pick<MethodDef, 'temperatureRule'> | null | undefined): TemperatureRule | null {
  const id = method?.temperatureRule;
  if (id == null || !Object.prototype.hasOwnProperty.call(TEMPERATURE_RULES, id)) return null;
  return TEMPERATURE_RULES[id as TemperatureRuleId];
}

/** A temperature shift found in a series of daily temperatures (indexes into it). */
export interface TemperatureShift {
  /** The highest of the low temperatures before the first high one. */
  low: number;
  /** The coverline: `low` plus the rule's offset, rounded to 0.01 °C. */
  line: number;
  /** Index of the first high temperature. */
  first: number;
  /** Index of the temperature that confirms the shift. */
  confirmed: number;
  /** Indexes of the counted high temperatures, in order (a temperature left out by Sensiplan's second exception is not one). */
  highs: number[];
}

const EPS = 1e-9;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * The first temperature shift in `values` (one temperature a day, in order, disturbed ones already left out), by
 * the rule; null before the shift, and always for a manual rule. A temperature on or under the line during the count
 * starts the count again, unless the rule's `dropOne` exception applies.
 */
export function shiftOf (values: number[], rule: TemperatureRule): TemperatureShift | null {
  if (isManualTemperatureRule(rule)) return null;
  const above = (v: number, line: number): boolean => v > line + EPS;
  const range = (from: number, n: number): number[] => Array.from({ length: n }, (_, k) => from + k);
  for (let i = rule.lowCount; i + rule.highCount <= values.length; i++) {
    const low = Math.max(...values.slice(i - rule.lowCount, i));
    const line = low + rule.offset;
    if (values[i] <= low || values[i] < low + rule.firstRise - EPS) continue;
    const shift = (confirmed: number, highs: number[]): TemperatureShift => ({ low, line: round2(line), first: i, confirmed, highs });
    const highs = values.slice(i, i + rule.highCount);
    if (highs.every(v => above(v, line))) {
      if (highs[highs.length - 1] >= line + rule.lastMin - EPS) return shift(i + rule.highCount - 1, range(i, rule.highCount));
      const next = values[i + rule.highCount];
      if (rule.extraDay && next != null && above(next, line)) return shift(i + rule.highCount, range(i, rule.highCount + 1));
      continue;
    }
    // One high temperature after the first on or under the line: left out, the next one counts, and must be high enough itself
    if (!rule.dropOne) continue;
    const span = values.slice(i, i + rule.highCount + 1);
    const under = span.map((v, k) => (above(v, line) ? -1 : k)).filter(k => k >= 0);
    if (span.length <= rule.highCount || under.length !== 1 || under[0] === 0 || under[0] === rule.highCount) continue;
    if (span[span.length - 1] >= line + rule.lastMin - EPS) {
      return shift(i + rule.highCount, range(i, rule.highCount + 1).filter(k => k !== i + under[0]));
    }
  }
  return null;
}

/** A temperature reading (unix seconds, °C). */
export interface TemperaturePoint {
  time: number;
  value: number;
}

/**
 * The readings of one device (a thermometer, a ring…). One line per cycle comes from one device, the one with the
 * most daily temperatures in the cycle: devices are never mixed. Grouping readings by device is the caller's.
 */
export interface TemperatureSeries {
  source: string;
  points: TemperaturePoint[];
}

export interface TemperatureShiftOptions {
  /**
   * Events that may hold `body-temperature-basal-disturbance` (`temperature/disturbance-v1`): every reading on the
   * calendar day of a disturbance is left out. Other and trashed events are ignored.
   */
  events?: CycleEventLike[];
  /** IANA time zone of the patient (defaults to the runtime's). */
  timeZone?: string;
}

/** A cycle's temperature shift, in times. */
export interface TemperatureShiftInCycle {
  /** The `source` of the series it comes from. */
  source: string;
  low: number;
  line: number;
  /** Time of the first high temperature. */
  first: number;
  /** Time of the temperature that confirms the shift. */
  confirmed: number;
  /** Times of the counted high temperatures, in order. */
  highs: number[];
}

const STREAM = {
  start: 'fertility-cycles-start',
  coverline: 'fertility-cycles-coverline',
  disturbance: 'body-temperature-basal-disturbance'
} as const;
/** `fertility-cycles-start` duration limit, as in `cyclePhaseAt`: an open cycle stops after this many days. */
const OPEN_CYCLE_MAX_DAYS = 90;

function inStream (e: CycleEventLike, stream: string): boolean {
  return e.streamId === stream || (e.streamIds?.includes(stream) ?? false);
}

function disturbedDays (events: CycleEventLike[] | undefined, timeZone?: string): Set<number> {
  const days = new Set<number>();
  for (const e of events ?? []) {
    if (e != null && !e.trashed && inStream(e, STREAM.disturbance)) days.add(localDayNumber(e.time, timeZone));
  }
  return days;
}

/** The first reading of each calendar day within [from, to), disturbed days left out, in order. */
function dailyPoints (points: TemperaturePoint[], from: number, to: number, disturbed: Set<number>, timeZone?: string): TemperaturePoint[] {
  const days = new Set<number>();
  const out: TemperaturePoint[] = [];
  for (const p of [...points].sort((a, b) => a.time - b.time)) {
    if (p.time < from || p.time >= to || !Number.isFinite(p.value)) continue;
    const day = localDayNumber(p.time, timeZone);
    if (days.has(day) || disturbed.has(day)) continue;
    days.add(day);
    out.push(p);
  }
  return out;
}

/** The series with the most daily readings within [from, to) (the first one listed on a tie); null without any. */
function mainSeries (series: TemperatureSeries[], from: number, to: number, disturbed: Set<number>, timeZone?: string): { source: string, points: TemperaturePoint[] } | null {
  let main: { source: string, points: TemperaturePoint[] } | null = null;
  for (const s of series) {
    const points = dailyPoints(s.points, from, to, disturbed, timeZone);
    if (points.length > 0 && (main == null || points.length > main.points.length)) main = { source: s.source, points };
  }
  return main;
}

function inTimes (main: { source: string, points: TemperaturePoint[] }, rule: TemperatureRule): TemperatureShiftInCycle | null {
  const shift = shiftOf(main.points.map(p => p.value), rule);
  if (shift == null) return null;
  const at = (k: number): number => main.points[k].time;
  return { source: main.source, low: shift.low, line: shift.line, first: at(shift.first), confirmed: at(shift.confirmed), highs: shift.highs.map(at) };
}

/**
 * The temperature shift in [from, to) (unix seconds; e.g. one cycle), by the rule, from the device with the most
 * daily temperatures in it: one temperature a day (the first of the calendar day), disturbed days left out. Null
 * before the shift, and always for a manual rule.
 */
export function shiftInCycle (series: TemperatureSeries[], from: number, to: number, rule: TemperatureRule, options: TemperatureShiftOptions = {}): TemperatureShiftInCycle | null {
  const main = mainSeries(series, from, to, disturbedDays(options.events, options.timeZone), options.timeZone);
  return main == null ? null : inTimes(main, rule);
}

/** One cycle's coverline. */
export interface Coverline {
  /** First second of the cycle-start day. */
  cycleStart: number;
  /** First second of the next cycle-start day; null while the cycle is open. */
  cycleEnd: number | null;
  /** The line to show, °C. */
  value: number;
  /** `'event'`: `value` is the `fertility-cycles-coverline` event's; `'computed'`: the rule's line. */
  origin: 'event' | 'computed';
  /** The rule's line for this cycle, null before the shift and for a manual rule. */
  computed: number | null;
  /** The `fertility-cycles-coverline` event shown, when `origin` is `'event'`. */
  event: CycleEventLike | null;
  /**
   * The shift by the rule, with its counted high temperatures (null before the shift and for a manual rule). Counted
   * against the rule's line, not against a line the person moved.
   */
  shift: TemperatureShiftInCycle | null;
}

function coverlineValue (e: CycleEventLike): number | null {
  return typeof e.content === 'number' && Number.isFinite(e.content) ? e.content : null;
}

/**
 * One coverline per cycle that has one.
 *
 * Cycles run from a `fertility-cycles-start` day to the day before the next one; an open cycle stops after 90 days
 * (as in `cyclePhaseAt`). A `fertility-cycles-coverline` event belongs to the cycle holding its calendar day.
 * Precedence (data-model MENSTRUAL-CYCLE.md, "Coverline"): with a calculated rule, a `'manual'` event
 * (`clientData.hdsBasis`) wins, otherwise the rule's line; a stored `'auto'` or unstated event is not shown. With
 * the manual rule (nothing to compute), whichever event exists is shown. Among several eligible events of a cycle,
 * the latest `modified`. A null rule (the method draws no coverline) gives none.
 *
 * @param series - the basal temperatures, one series per device
 * @param events - the patient's `fertility-cycles-start`, `fertility-cycles-coverline` and
 *   `body-temperature-basal-disturbance` events, any order (others and trashed ones are ignored)
 * @param rule - from `temperatureRuleOf(methodDef)`
 * @param timeZone - IANA time zone of the patient (defaults to the runtime's)
 */
export function coverlinesOf (series: TemperatureSeries[], events: CycleEventLike[], rule: TemperatureRule | null, timeZone?: string): Coverline[] {
  if (rule == null) return [];
  const live = events.filter(e => e != null && !e.trashed);
  const startDays = [...new Set(live.filter(e => e.type === 'activity/plain' && inStream(e, STREAM.start)).map(e => localDayNumber(e.time, timeZone)))]
    .sort((a, b) => a - b);
  const manual = isManualTemperatureRule(rule);
  const lines = live.filter(e => e.type === 'temperature/c' && inStream(e, STREAM.coverline) && coverlineValue(e) != null &&
    (manual || e.clientData?.hdsBasis === 'manual'));
  const disturbed = disturbedDays(live, timeZone);
  const out: Coverline[] = [];
  startDays.forEach((startDay, i) => {
    const nextDay = startDays[i + 1];
    const lastDay = nextDay != null ? nextDay - 1 : startDay + OPEN_CYCLE_MAX_DAYS - 1;
    const from = startOfLocalDay(startDay, timeZone);
    const to = startOfLocalDay(lastDay + 1, timeZone);
    const main = mainSeries(series, from, to, disturbed, timeZone);
    const shift = main == null ? null : inTimes(main, rule);
    const event = lines
      .filter(e => { const d = localDayNumber(e.time, timeZone); return d >= startDay && d <= lastDay; })
      .reduce<CycleEventLike | null>((a, b) => (a == null || (b.modified ?? 0) > (a.modified ?? 0) ? b : a), null);
    const base = { cycleStart: from, cycleEnd: nextDay != null ? to : null, computed: shift?.line ?? null, shift };
    if (event != null) out.push({ ...base, value: coverlineValue(event) as number, origin: 'event', event });
    else if (shift != null) out.push({ ...base, value: shift.line, origin: 'computed', event: null });
  });
  return out;
}
