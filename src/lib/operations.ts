import type { CalendarData, CalendarEvent, EditScope, Occurrence, WeeklyRecurrence } from './types';
import { DAY, MINUTE, format, parse, startOfDay } from './time';
import { sameRecurrence } from './recurrence';

let counter = 0;
export function uid(prefix = 'ev'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Editable fields of an event, as shown in the editor. */
export interface EventDraft {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  location?: string;
  notes?: string;
  recurrence?: WeeklyRecurrence;
}

export function draftFromOccurrence(occ: Occurrence): EventDraft {
  const ev = occ.event;
  return {
    title: ev.title,
    start: format(occ.start),
    end: format(occ.end),
    allDay: ev.allDay,
    calendarId: ev.calendarId,
    location: ev.location,
    notes: ev.notes,
    recurrence: ev.recurrence ? { ...ev.recurrence, byWeekday: [...ev.recurrence.byWeekday] } : undefined,
  };
}

function clean<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    if (out[k] === undefined || out[k] === '') delete out[k];
  }
  return out as T;
}

export function createEvent(data: CalendarData, draft: EventDraft): { data: CalendarData; event: CalendarEvent } {
  const event: CalendarEvent = clean({ id: uid(), ...normalizeDraft(draft) });
  return { data: { ...data, events: [...data.events, event] }, event };
}

/** Ensures end > start and all-day events cover whole days. */
export function normalizeDraft(draft: EventDraft): EventDraft {
  let start = parse(draft.start);
  let end = parse(draft.end);
  if (draft.allDay) {
    start = startOfDay(start);
    end = Math.max(startOfDay(end - 1) + DAY, start + DAY);
  } else if (end <= start) {
    end = start + 15 * MINUTE;
  }
  return { ...draft, title: draft.title.trim() || '(No title)', start: format(start), end: format(end) };
}

function replaceEvent(data: CalendarData, id: string, fn: (ev: CalendarEvent) => CalendarEvent | null): CalendarData {
  const events: CalendarEvent[] = [];
  for (const ev of data.events) {
    if (ev.id !== id) events.push(ev);
    else {
      const next = fn(ev);
      if (next) events.push(next);
    }
  }
  return { ...data, events };
}

function shiftWeekdays(days: number[], shift: number): number[] {
  const s = ((shift % 7) + 7) % 7;
  return [...new Set(days.map((d) => (d + s) % 7))].sort();
}

function sameDays(a: number[], b: number[]): boolean {
  const sa = [...a].sort().join(',');
  const sb = [...b].sort().join(',');
  return sa === sb;
}

/**
 * Applies `draft` (whose start/end describe the occurrence's new times) to the
 * given occurrence. For recurring occurrences, `scope` decides whether a
 * detached copy is created ("this") or the whole series is changed ("series").
 */
export function updateOccurrence(
  data: CalendarData,
  occ: Occurrence,
  rawDraft: EventDraft,
  scope: EditScope = 'series',
): CalendarData {
  const draft = normalizeDraft(rawDraft);
  const ev = occ.event;

  if (!occ.recurring) {
    return replaceEvent(data, ev.id, (old) =>
      clean({
        ...old,
        ...draft,
        recurrence: draft.recurrence,
        exdates: draft.recurrence ? old.exdates : undefined,
        // A detached occurrence that is turned into its own series is no longer linked.
        seriesId: draft.recurrence ? undefined : old.seriesId,
        originalStart: draft.recurrence ? undefined : old.originalStart,
      }),
    );
  }

  if (scope === 'this') {
    const detached: CalendarEvent = clean({
      ...draft,
      id: uid(),
      recurrence: undefined,
      seriesId: ev.id,
      originalStart: format(occ.originalStart),
    });
    const withEx = replaceEvent(data, ev.id, (old) => ({
      ...old,
      exdates: [...new Set([...(old.exdates ?? []), format(occ.originalStart)])],
    }));
    return { ...withEx, events: [...withEx.events, detached] };
  }

  // Entire series.
  const newStart = parse(draft.start);
  const newEnd = parse(draft.end);
  const delta = newStart - occ.start;
  const dayShift = Math.round((startOfDay(newStart) - startOfDay(occ.start)) / DAY);

  if (!draft.recurrence) {
    // "Does not repeat" for the series: collapse into a single event at the edited time.
    const single: CalendarEvent = clean({ ...ev, ...draft, recurrence: undefined, exdates: undefined });
    const without = data.events.filter((e) => e.seriesId !== ev.id);
    return replaceEvent({ ...data, events: without }, ev.id, () => single);
  }

  const seriesStart = parse(ev.start) + delta;
  const seriesEnd = seriesStart + (newEnd - newStart);
  const originalDays = ev.recurrence?.byWeekday ?? [];
  const byWeekday =
    ev.recurrence && sameDays(draft.recurrence.byWeekday, originalDays)
      ? shiftWeekdays(originalDays, dayShift)
      : [...draft.recurrence.byWeekday].sort();

  return replaceEvent(data, ev.id, (old) =>
    clean({
      ...old,
      ...draft,
      start: format(seriesStart),
      end: format(seriesEnd),
      recurrence: { ...draft.recurrence!, byWeekday },
      exdates: old.exdates?.length ? old.exdates.map((x) => format(parse(x) + delta)) : undefined,
    }),
  );
}

/** Moves/resizes an occurrence to new start/end times, keeping all other fields. */
export function rescheduleOccurrence(
  data: CalendarData,
  occ: Occurrence,
  start: number,
  end: number,
  scope: EditScope = 'series',
): CalendarData {
  return updateOccurrence(data, occ, { ...draftFromOccurrence(occ), start: format(start), end: format(end) }, scope);
}

export function deleteOccurrence(data: CalendarData, occ: Occurrence, scope: EditScope = 'series'): CalendarData {
  const ev = occ.event;
  if (!occ.recurring) return replaceEvent(data, ev.id, () => null);
  if (scope === 'this') {
    return replaceEvent(data, ev.id, (old) => ({
      ...old,
      exdates: [...new Set([...(old.exdates ?? []), format(occ.originalStart)])],
    }));
  }
  return { ...data, events: data.events.filter((e) => e.id !== ev.id && e.seriesId !== ev.id) };
}

export function duplicateOccurrence(data: CalendarData, occ: Occurrence): { data: CalendarData; event: CalendarEvent } {
  const draft = draftFromOccurrence(occ);
  return createEvent(data, { ...draft, recurrence: undefined, title: `${draft.title} (copy)` });
}

/** True when two drafts describe the same event (used to skip no-op saves). */
export function sameDraft(a: EventDraft, b: EventDraft): boolean {
  const na = normalizeDraft(a);
  const nb = normalizeDraft(b);
  return (
    na.title === nb.title &&
    na.start === nb.start &&
    na.end === nb.end &&
    na.allDay === nb.allDay &&
    na.calendarId === nb.calendarId &&
    (na.location ?? '') === (nb.location ?? '') &&
    (na.notes ?? '') === (nb.notes ?? '') &&
    sameRecurrence(na.recurrence, nb.recurrence)
  );
}
