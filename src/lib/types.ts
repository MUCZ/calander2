/**
 * Times are stored as "floating" wall-clock strings (YYYY-MM-DDTHH:mm) without
 * a timezone, like most personal calendars do for local events. Internally they
 * are converted to "naive" millisecond numbers (see time.ts) so all arithmetic
 * is DST-free and timezone independent.
 */
export type DateTimeString = string;

export interface WeeklyRecurrence {
  freq: 'weekly';
  /** Weekdays the event repeats on, 0 = Sunday … 6 = Saturday. */
  byWeekday: number[];
  /** Repeat every N weeks (UI exposes 1, data model supports more). */
  interval: number;
  /** Last date (inclusive, YYYY-MM-DD) an occurrence may start on. */
  until?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** Start, inclusive. For all-day events the time part is 00:00. */
  start: DateTimeString;
  /** End, exclusive. For all-day events this is 00:00 of the day after the last day. */
  end: DateTimeString;
  allDay: boolean;
  calendarId: string;
  location?: string;
  notes?: string;
  recurrence?: WeeklyRecurrence;
  /** Original start times (DateTimeString) of occurrences removed from a series. */
  exdates?: DateTimeString[];
  /** Set on a detached occurrence ("This occurrence only" edit) – the parent series id. */
  seriesId?: string;
  /** Original start of the occurrence a detached event replaces. */
  originalStart?: DateTimeString;
}

export interface CalendarCategory {
  id: string;
  name: string;
  color: string;
  visible: boolean;
}

export interface CalendarData {
  events: CalendarEvent[];
  calendars: CalendarCategory[];
}

/** A concrete, renderable instance of an event within a date range. */
export interface Occurrence {
  /** Unique key: event id for single events, `${seriesId}::${originalStart}` for series. */
  key: string;
  event: CalendarEvent;
  start: number;
  end: number;
  /** Original start of the occurrence inside its series (naive ms). */
  originalStart: number;
  /** True when this occurrence is generated from a recurring series. */
  recurring: boolean;
}

export type EditScope = 'this' | 'series';

export type ViewMode = 'day' | 'week' | 'month';
