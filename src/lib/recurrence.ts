import type { CalendarEvent, Occurrence, WeeklyRecurrence } from './types';
import { DAY, WEEKDAY_SHORT, addDays, format, parse, startOfDay, startOfWeek, weekday } from './time';

export function occurrenceKey(seriesId: string, originalStart: number): string {
  return `${seriesId}::${format(originalStart)}`;
}

/**
 * Expands events into concrete occurrences intersecting [rangeStart, rangeEnd).
 * Weekly series generate one occurrence per selected weekday; removed
 * occurrences (exdates) are skipped. Detached occurrences are ordinary events.
 */
export function expandEvents(events: CalendarEvent[], rangeStart: number, rangeEnd: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const start = parse(ev.start);
    const end = parse(ev.end);
    if (!ev.recurrence) {
      if (start < rangeEnd && end > rangeStart) {
        out.push({ key: ev.id, event: ev, start, end, originalStart: start, recurring: false });
      }
      continue;
    }
    out.push(...expandSeries(ev, start, end, ev.recurrence, rangeStart, rangeEnd));
  }
  out.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  return out;
}

function expandSeries(
  ev: CalendarEvent,
  start: number,
  end: number,
  rule: WeeklyRecurrence,
  rangeStart: number,
  rangeEnd: number,
): Occurrence[] {
  const out: Occurrence[] = [];
  const duration = Math.max(end - start, 0);
  const timeOfDay = start - startOfDay(start);
  const seriesDay = startOfDay(start);
  const seriesWeek = startOfWeek(seriesDay, 0);
  const until = rule.until ? parse(rule.until) : Infinity;
  const interval = Math.max(1, rule.interval || 1);
  const days = new Set(rule.byWeekday.length ? rule.byWeekday : [weekday(start)]);
  const ex = new Set(ev.exdates ?? []);

  // Occurrences starting before rangeStart can still reach into the range.
  let day = Math.max(seriesDay, startOfDay(rangeStart - duration));
  const lastDay = Math.min(rangeEnd, until + DAY - 1);
  for (; day < lastDay; day = addDays(day, 1)) {
    if (!days.has(weekday(day))) continue;
    const weeksFromStart = Math.round((startOfWeek(day, 0) - seriesWeek) / (7 * DAY));
    if (weeksFromStart % interval !== 0) continue;
    const occStart = day + timeOfDay;
    if (occStart < start || startOfDay(occStart) > until) continue;
    const occEnd = occStart + duration;
    if (!(occStart < rangeEnd && occEnd > rangeStart)) continue;
    if (ex.has(format(occStart))) continue;
    out.push({
      key: occurrenceKey(ev.id, occStart),
      event: ev,
      start: occStart,
      end: occEnd,
      originalStart: occStart,
      recurring: true,
    });
  }
  return out;
}

export function describeRecurrence(rule: WeeklyRecurrence | undefined): string {
  if (!rule) return 'Does not repeat';
  const days = [...rule.byWeekday].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  let dayText: string;
  if (days.length === 7) dayText = 'every day';
  else if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) dayText = 'on weekdays';
  else dayText = `on ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
  const every = rule.interval > 1 ? `Every ${rule.interval} weeks` : 'Weekly';
  const until = rule.until ? ` until ${rule.until}` : '';
  return `${every} ${dayText}${until}`;
}

/** Compares two weekly rules by meaning (ignores key order and weekday order). */
export function sameRecurrence(a: WeeklyRecurrence | undefined, b: WeeklyRecurrence | undefined): boolean {
  if (!a || !b) return !a && !b;
  const days = (r: WeeklyRecurrence) => [...new Set(r.byWeekday)].sort().join(',');
  return days(a) === days(b) && (a.interval || 1) === (b.interval || 1) && (a.until ?? '') === (b.until ?? '');
}
