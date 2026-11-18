/**
 * "Naive" time helpers. A naive timestamp is the number of milliseconds since
 * the epoch for a wall-clock time interpreted as if it were UTC. This removes
 * DST gaps/overlaps from all arithmetic: a day is always 24h and 09:00 stays 09:00.
 */
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

export function parse(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
  if (!m) throw new Error(`Invalid date-time: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

export function format(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function dateKey(ms: number): string {
  return format(ms).slice(0, 10);
}

export function timeKey(ms: number): string {
  return format(ms).slice(11, 16);
}

export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

export function addDays(ms: number, days: number): number {
  return ms + days * DAY;
}

export function addMinutes(ms: number, minutes: number): number {
  return ms + minutes * MINUTE;
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(ms: number): number {
  return new Date(ms).getUTCDay();
}

export function startOfWeek(ms: number, weekStartsOn = 1): number {
  const day = startOfDay(ms);
  const diff = (weekday(day) - weekStartsOn + 7) % 7;
  return addDays(day, -diff);
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0)).getUTCDate();
  return target + (Math.min(d.getUTCDate(), lastDay) - 1) * DAY + (ms - startOfDay(ms));
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export function minutesOfDay(ms: number): number {
  return Math.round((ms - startOfDay(ms)) / MINUTE);
}

export function snapMinutes(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

/** Converts the user's current local wall-clock time to a naive timestamp. */
export function nowNaive(date = new Date()): number {
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ---- Display formatting (Intl, evaluated in UTC because timestamps are naive) ----

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function formatTimeRange(start: number, end: number): string {
  const sameD = sameDay(start, end) || (end - startOfDay(start) === DAY && minutesOfDay(end) === 0);
  if (sameD) return `${formatTime(start)} – ${formatTime(end)}`;
  return `${formatTime(start)} – ${formatShortDate(end)}, ${formatTime(end)}`;
}

export const formatWeekdayShort = (ms: number) => fmt({ weekday: 'short' }).format(ms);
export const formatWeekdayLong = (ms: number) => fmt({ weekday: 'long' }).format(ms);
export const formatShortDate = (ms: number) => fmt({ month: 'short', day: 'numeric' }).format(ms);
export const formatLongDate = (ms: number) =>
  fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(ms);
export const formatMonthYear = (ms: number) => fmt({ month: 'long', year: 'numeric' }).format(ms);
export const formatMonthShort = (ms: number) => fmt({ month: 'short' }).format(ms);

export function formatRangeTitle(start: number, endExclusive: number): string {
  const last = endExclusive - DAY;
  const a = new Date(start);
  const b = new Date(last);
  if (start === last) return formatLongDate(start);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${formatShortDate(start)}, ${a.getUTCFullYear()} – ${formatShortDate(last)}, ${b.getUTCFullYear()}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return `${formatShortDate(start)} – ${formatShortDate(last)}, ${b.getUTCFullYear()}`;
  }
  return `${formatMonthYear(start)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
