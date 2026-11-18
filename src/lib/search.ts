import type { CalendarCategory, CalendarEvent, Occurrence } from './types';
import { expandEvents } from './recurrence';

export function matchesQuery(ev: CalendarEvent, query: string, calendars?: CalendarCategory[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const calName = calendars?.find((c) => c.id === ev.calendarId)?.name ?? '';
  const haystack = `${ev.title}\n${ev.location ?? ''}\n${ev.notes ?? ''}\n${calName}`.toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/**
 * Finds occurrences matching `query` between `from` and `to`. Results start
 * with the first upcoming match (relative to `anchor`) followed by later ones,
 * then past matches, so the most relevant items are listed first. At most
 * `perEvent` occurrences of the same (recurring) event are returned.
 */
export function searchOccurrences(
  events: CalendarEvent[],
  calendars: CalendarCategory[],
  query: string,
  from: number,
  to: number,
  anchor: number,
  limit = 40,
  perEvent = 3,
): Occurrence[] {
  if (!query.trim()) return [];
  const visible = new Set(calendars.filter((c) => c.visible).map((c) => c.id));
  const matching = events.filter((e) => visible.has(e.calendarId) && matchesQuery(e, query, calendars));
  const occ = expandEvents(matching, from, to);
  const upcoming = occ.filter((o) => o.end > anchor);
  const pastOcc = occ.filter((o) => o.end <= anchor).reverse();
  // Cap occurrences per series so one weekly event cannot bury other matches.
  const seen = new Map<string, number>();
  const out: Occurrence[] = [];
  for (const o of [...upcoming, ...pastOcc]) {
    const n = seen.get(o.event.id) ?? 0;
    if (n >= perEvent) continue;
    seen.set(o.event.id, n + 1);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}
