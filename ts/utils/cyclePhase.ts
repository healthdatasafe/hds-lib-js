/**
 * Menstrual cycle phase, derived from the `fertility-cycles-*` boundary items (and, for the period's last day when
 * no `-period-end` is recorded, the `body-vulva-bleeding` observations), never stored (data-model
 * `documentation/MENSTRUAL-CYCLE.md`, "Why no cycle-day or cycle-phase item?"). Everything is counted in calendar
 * days of `timeZone` (the patient's), and a day the recorded boundaries do not decide has no phase: this never
 * guesses. The boundaries decide: whether anything was logged on the day itself does not matter.
 */
import { localDayNumber, startOfLocalDay } from './calendarDay.ts';

export type CyclePhase = 'menstrual' | 'follicular' | 'fertile' | 'luteal';
/** Whether the boundaries a phase rests on are confirmed, predicted (any of them), or not stated. */
export type CycleBasis = 'confirmed' | 'predicted' | 'unknown';

export interface CyclePhaseResult {
  phase: CyclePhase | null;
  basis: CycleBasis;
  /** 1 on the calendar day of the cycle start. */
  cycleDay: number | null;
  /** Start of the cycle-start day (unix seconds). */
  cycleStart: number | null;
  /** Start of the next cycle-start day; null while the cycle is open. */
  cycleEnd: number | null;
  /**
   * When `basis` is `'predicted'`: the `createdBy` of the predicted boundaries the phase rests on (distinct, in the
   * order used), for a "predicted by {app}" label; the app resolves each access id to its name. Empty otherwise,
   * and for predicted events without `createdBy`.
   */
  predictedBy: string[];
}

export interface CycleEventLike {
  type: string;
  streamId?: string;
  streamIds?: string[];
  time: number;
  duration?: number | null;
  modified?: number;
  trashed?: boolean;
  /** Read on `body-vulva-bleeding` events only (a number on the 0-1 flow scale). */
  content?: unknown;
  /** The access that wrote the event; reported in `predictedBy`. */
  createdBy?: string;
  clientData?: { hdsBasis?: unknown, [key: string]: unknown } | null;
}

const STREAM = {
  start: 'fertility-cycles-start',
  periodEnd: 'fertility-cycles-period',
  fertileWindow: 'fertility-cycles-fertile-window',
  ovulation: 'fertility-cycles-ovulation'
} as const;
const EVENT_TYPE = 'activity/plain';
/** `body-vulva-bleeding`: a 0-1 flow whose options are anchors on the scale. */
const BLEEDING = { stream: 'body-vulva-bleeding', type: 'ratio/proportion' } as const;
/**
 * The anchors of the `body-vulva-bleeding` scale (data-model options, MENSTRUAL-CYCLE.md) that set the period
 * threshold: Spotting is not a period (`fertility-cycles-start` requires full bleeding), Very light is the lowest
 * period flow. `[CPHP0]` checks them against the published pack.
 */
const BLEEDING_ANCHORS = { spotting: 0.08, veryLight: 0.2 } as const;
/**
 * A flow counts as period bleeding when it reads as Very light or more: above the midpoint of Spotting and Very
 * light, so a device's value between the two reads as the nearest anchor (as `eventToShortText` labels it).
 */
const PERIOD_FLOW_ABOVE = (BLEEDING_ANCHORS.spotting + BLEEDING_ANCHORS.veryLight) / 2;
/** `fertility-cycles-start` duration limit (amenorrhea threshold): an open cycle stops after this many days. */
const OPEN_CYCLE_MAX_DAYS = 90;

const NO_PHASE: Omit<CyclePhaseResult, 'predictedBy'> = { phase: null, basis: 'unknown', cycleDay: null, cycleStart: null, cycleEnd: null };

interface Dated { day: number, event: CycleEventLike }

/** In the stream, wherever it sits in `streamIds` (an event may carry several). */
function inStream (e: CycleEventLike, stream: string): boolean {
  return e.streamId === stream || (e.streamIds?.includes(stream) ?? false);
}

/** One event per day: the longest duration, then the latest modified. Sorted by day. */
function byDay (events: CycleEventLike[], timeZone?: string): Dated[] {
  const days = new Map<number, CycleEventLike>();
  for (const event of events) {
    const day = localDayNumber(event.time, timeZone);
    const kept = days.get(day);
    if (kept == null ||
      (event.duration ?? 0) > (kept.duration ?? 0) ||
      ((event.duration ?? 0) === (kept.duration ?? 0) && (event.modified ?? 0) > (kept.modified ?? 0))) {
      days.set(day, event);
    }
  }
  return [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, event]) => ({ day, event }));
}

function basisOf (used: CycleEventLike[]): CycleBasis {
  const values = used.map(e => e.clientData?.hdsBasis);
  if (values.includes('predicted')) return 'predicted';
  if (values.length > 0 && values.every(v => v === 'confirmed')) return 'confirmed';
  return 'unknown';
}

/** The distinct `createdBy` of the predicted events among `used`. */
function predictedByOf (used: CycleEventLike[]): string[] {
  const ids: string[] = [];
  for (const e of used) {
    if (e.clientData?.hdsBasis !== 'predicted' || typeof e.createdBy !== 'string' || e.createdBy === '') continue;
    if (!ids.includes(e.createdBy)) ids.push(e.createdBy);
  }
  return ids;
}

/** The calendar days with a period-level bleeding observation (Very light or more; spotting does not count). */
function bleedingDays (events: CycleEventLike[], timeZone?: string): Set<number> {
  const days = new Set<number>();
  for (const e of events) {
    if (e == null || e.trashed || e.type !== BLEEDING.type || !inStream(e, BLEEDING.stream)) continue;
    if (typeof e.content === 'number' && e.content > PERIOD_FLOW_ABOVE) days.add(localDayNumber(e.time, timeZone));
  }
  return days;
}

/**
 * The last day of the bleeding days in a row that begin on `startDay` or the day after, within the cycle; null when
 * neither day has period-level bleeding.
 */
function bleedingRunEnd (bled: Set<number>, startDay: number, lastDay: number): { day: number, event: null } | null {
  if (!bled.has(startDay) && !bled.has(startDay + 1)) return null;
  let day = startDay;
  while (day + 1 <= lastDay && bled.has(day + 1)) day++;
  return { day, event: null };
}

/**
 * The cycle phase on the calendar day of `time`.
 *
 * A cycle runs from a `fertility-cycles-start` day to the day before the next one (its `duration` never bounds a
 * phase); an open cycle stops after 90 days. A boundary belongs to the cycle containing its own day, the earliest
 * when there are several. Phases: `menstrual` on the start day and through the period-end day; `fertile` on the
 * fertile-window days (first and last inclusive) and the ovulation day; `follicular` after the period end and before
 * the first fertile day; `luteal` after the ovulation day. Any other day has `phase: null`.
 *
 * The period end is the cycle's `fertility-cycles-period-end` day. When the cycle has none, it is the last of the
 * consecutive days with period-level `body-vulva-bleeding` (Very light or more: spotting does not count, as for
 * `fertility-cycles-start`) that begin on the start day or the day after; without such bleeding on either, there is
 * no period end (as before). A recorded period end always wins, and
 * either one on or after the first fertile day is ignored. Bleeding observations do not enter `basis`.
 *
 * The phase of a day depends on these events only, not on whether anything was logged that day.
 *
 * @param time - unix seconds
 * @param events - the patient's `fertility-cycles-*` and `body-vulva-bleeding` events, any order (others are ignored)
 * @param timeZone - IANA time zone of the patient (defaults to the runtime's)
 */
export function cyclePhaseAt (time: number, events: CycleEventLike[], timeZone?: string): CyclePhaseResult {
  const live = events.filter(e => e != null && !e.trashed && e.type === EVENT_TYPE);
  const of = (stream: string): CycleEventLike[] => live.filter(e => inStream(e, stream));

  const today = localDayNumber(time, timeZone);
  const starts = byDay(of(STREAM.start), timeZone);
  let startIdx = -1;
  while (startIdx + 1 < starts.length && starts[startIdx + 1].day <= today) startIdx++;
  if (startIdx < 0) return { ...NO_PHASE, predictedBy: [] };
  const start = starts[startIdx];
  const next = starts[startIdx + 1];
  const lastDay = next != null ? next.day - 1 : start.day + OPEN_CYCLE_MAX_DAYS - 1;
  if (today > lastDay) return { ...NO_PHASE, predictedBy: [] };

  const result = (phase: CyclePhase | null, used: CycleEventLike[]): CyclePhaseResult => {
    const basis = phase == null ? 'unknown' : basisOf(used);
    return {
      phase,
      basis,
      cycleDay: today - start.day + 1,
      cycleStart: startOfLocalDay(start.day, timeZone),
      cycleEnd: next != null ? startOfLocalDay(next.day, timeZone) : null,
      predictedBy: basis === 'predicted' ? predictedByOf(used) : []
    };
  };

  const inCycle = (stream: string): Dated | undefined =>
    byDay(of(stream), timeZone).find(d => d.day >= start.day && d.day <= lastDay);
  const window = inCycle(STREAM.fertileWindow);
  const ovulation = inCycle(STREAM.ovulation);
  const windowEnd = window != null
    ? Math.min(localDayNumber(window.event.time + (window.event.duration ?? 0), timeZone), lastDay)
    : null;
  // The first fertile day: the window's start or the ovulation day, whichever comes first
  const firstFertile = window != null && ovulation != null ? (ovulation.day < window.day ? ovulation : window) : (window ?? ovulation);
  // The period's last day: the recorded period end, else the run of bleeding days from the start (no boundary event)
  const recordedEnd = inCycle(STREAM.periodEnd);
  let periodEnd: { day: number, event: CycleEventLike | null } | null = recordedEnd != null
    ? recordedEnd
    : bleedingRunEnd(bleedingDays(events, timeZone), start.day, lastDay);
  if (periodEnd != null && firstFertile != null && periodEnd.day >= firstFertile.day) periodEnd = null;
  const periodUsed = periodEnd?.event != null ? [start.event, periodEnd.event] : [start.event];

  if (today === start.day) return result('menstrual', [start.event]);
  if (periodEnd != null && today <= periodEnd.day) return result('menstrual', periodUsed);
  if (window != null && windowEnd != null && today >= window.day && today <= windowEnd) return result('fertile', [window.event]);
  if (ovulation != null && today === ovulation.day) return result('fertile', [ovulation.event]);
  // Luteal only once the fertile days are over: an ovulation recorded before a window decides nothing in between
  if (ovulation != null && today > ovulation.day && (windowEnd == null || today > windowEnd)) return result('luteal', [ovulation.event]);
  if (periodEnd != null && firstFertile != null && today > periodEnd.day && today < firstFertile.day) {
    return result('follicular', [periodEnd.event ?? start.event, firstFertile.event]);
  }
  return result(null, []);
}
