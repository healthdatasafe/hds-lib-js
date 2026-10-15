/**
 * Menstrual cycle phase, derived from the `fertility-cycles-*` boundary items, never stored (data-model
 * `documentation/MENSTRUAL-CYCLE.md`, "Why no cycle-day or cycle-phase item?"). Everything is counted in calendar
 * days of `timeZone` (the patient's), and a day the recorded boundaries do not decide has no phase: this never
 * guesses.
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
}

export interface CycleEventLike {
  type: string;
  streamId?: string;
  streamIds?: string[];
  time: number;
  duration?: number | null;
  modified?: number;
  trashed?: boolean;
  clientData?: { hdsBasis?: unknown, [key: string]: unknown } | null;
}

const STREAM = {
  start: 'fertility-cycles-start',
  periodEnd: 'fertility-cycles-period',
  fertileWindow: 'fertility-cycles-fertile-window',
  ovulation: 'fertility-cycles-ovulation'
} as const;
const EVENT_TYPE = 'activity/plain';
/** `fertility-cycles-start` duration limit (amenorrhea threshold): an open cycle stops after this many days. */
const OPEN_CYCLE_MAX_DAYS = 90;

const NO_PHASE: CyclePhaseResult = { phase: null, basis: 'unknown', cycleDay: null, cycleStart: null, cycleEnd: null };

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

/**
 * The cycle phase on the calendar day of `time`.
 *
 * A cycle runs from a `fertility-cycles-start` day to the day before the next one (its `duration` never bounds a
 * phase); an open cycle stops after 90 days. A boundary belongs to the cycle containing its own day, the earliest
 * when there are several. Phases: `menstrual` on the start day and through the period-end day; `fertile` on the
 * fertile-window days (first and last inclusive) and the ovulation day; `follicular` after the period end and before
 * the first fertile day; `luteal` after the ovulation day. Any other day has `phase: null`.
 *
 * @param time - unix seconds
 * @param events - the patient's `fertility-cycles-*` events, any order (others are ignored)
 * @param timeZone - IANA time zone of the patient (defaults to the runtime's)
 */
export function cyclePhaseAt (time: number, events: CycleEventLike[], timeZone?: string): CyclePhaseResult {
  const live = events.filter(e => e != null && !e.trashed && e.type === EVENT_TYPE);
  const of = (stream: string): CycleEventLike[] => live.filter(e => inStream(e, stream));

  const today = localDayNumber(time, timeZone);
  const starts = byDay(of(STREAM.start), timeZone);
  let startIdx = -1;
  while (startIdx + 1 < starts.length && starts[startIdx + 1].day <= today) startIdx++;
  if (startIdx < 0) return { ...NO_PHASE };
  const start = starts[startIdx];
  const next = starts[startIdx + 1];
  const lastDay = next != null ? next.day - 1 : start.day + OPEN_CYCLE_MAX_DAYS - 1;
  if (today > lastDay) return { ...NO_PHASE };

  const result = (phase: CyclePhase | null, used: CycleEventLike[]): CyclePhaseResult => ({
    phase,
    basis: phase == null ? 'unknown' : basisOf(used),
    cycleDay: today - start.day + 1,
    cycleStart: startOfLocalDay(start.day, timeZone),
    cycleEnd: next != null ? startOfLocalDay(next.day, timeZone) : null
  });

  const inCycle = (stream: string): Dated | undefined =>
    byDay(of(stream), timeZone).find(d => d.day >= start.day && d.day <= lastDay);
  const window = inCycle(STREAM.fertileWindow);
  const ovulation = inCycle(STREAM.ovulation);
  const windowEnd = window != null
    ? Math.min(localDayNumber(window.event.time + (window.event.duration ?? 0), timeZone), lastDay)
    : null;
  // The first fertile day: the window's start or the ovulation day, whichever comes first
  const firstFertile = window != null && ovulation != null ? (ovulation.day < window.day ? ovulation : window) : (window ?? ovulation);
  let periodEnd = inCycle(STREAM.periodEnd);
  if (periodEnd != null && firstFertile != null && periodEnd.day >= firstFertile.day) periodEnd = undefined;

  if (today === start.day) return result('menstrual', [start.event]);
  if (periodEnd != null && today <= periodEnd.day) return result('menstrual', [start.event, periodEnd.event]);
  if (window != null && windowEnd != null && today >= window.day && today <= windowEnd) return result('fertile', [window.event]);
  if (ovulation != null && today === ovulation.day) return result('fertile', [ovulation.event]);
  // Luteal only once the fertile days are over: an ovulation recorded before a window decides nothing in between
  if (ovulation != null && today > ovulation.day && (windowEnd == null || today > windowEnd)) return result('luteal', [ovulation.event]);
  if (periodEnd != null && firstFertile != null && today > periodEnd.day && today < firstFertile.day) {
    return result('follicular', [periodEnd.event, firstFertile.event]);
  }
  return result(null, []);
}
