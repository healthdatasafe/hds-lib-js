/**
 * Calendar days in a time zone (B-2026-10-15-3).
 *
 * A cycle day is a calendar concept in the patient's time zone, not a count of 24-hour steps from
 * the cycle-start event: a period start logged at 21:00 makes the next morning day 2, and a DST
 * change must not move a day boundary. Times are unix seconds; `timeZone` is an IANA name and
 * defaults to the runtime's own (the patient's browser in the webapp).
 */

const SECONDS_PER_DAY = 86400;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter (timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let f = formatters.get(key);
  if (f == null) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    formatters.set(key, f);
  }
  return f;
}

/** Wall-clock time of `time` in `timeZone`, read as if it were UTC (unix seconds). */
function wallClockAsUtc (time: number, timeZone?: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(time * 1000));
  const get = (type: string): number => Number(parts.find(p => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) / 1000;
}

/** The calendar date of `time` in `timeZone`, as a day number (days since 1970-01-01). */
export function localDayNumber (time: number, timeZone?: string): number {
  return Math.floor(wallClockAsUtc(time, timeZone) / SECONDS_PER_DAY);
}

/** Unix time of the first second of calendar day `dayNumber` in `timeZone`. */
export function startOfLocalDay (dayNumber: number, timeZone?: string): number {
  const midnightUtc = dayNumber * SECONDS_PER_DAY;
  // Two passes: the offset at a first guess, then at the corrected time (DST).
  let start = midnightUtc - (wallClockAsUtc(midnightUtc, timeZone) - midnightUtc);
  start = midnightUtc - (wallClockAsUtc(start, timeZone) - start);
  return start;
}

/**
 * Cycle day of `time` for a cycle that started at `cycleStart`: 1 on the calendar day of the start,
 * 2 on the next calendar day, and so on, in `timeZone`.
 */
export function cycleDayAt (time: number, cycleStart: number, timeZone?: string): number {
  return localDayNumber(time, timeZone) - localDayNumber(cycleStart, timeZone) + 1;
}
