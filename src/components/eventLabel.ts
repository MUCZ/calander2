import type { CalendarCategory, Occurrence } from '../lib/types';
import { DAY, formatLongDate, formatShortDate, formatTimeRange } from '../lib/time';

export function occurrenceTimeText(occ: Occurrence): string {
  if (occ.event.allDay) {
    const days = Math.round((occ.end - occ.start) / DAY);
    return days > 1 ? `All day, ${formatShortDate(occ.start)} – ${formatShortDate(occ.end - DAY)}` : 'All day';
  }
  return formatTimeRange(occ.start, occ.end);
}

/** Full accessible description of an occurrence for screen readers. */
export function occurrenceAriaLabel(occ: Occurrence, calendar?: CalendarCategory): string {
  const parts = [occ.event.title, `${formatLongDate(occ.start)}, ${occurrenceTimeText(occ)}`];
  if (occ.event.location) parts.push(`at ${occ.event.location}`);
  if (calendar) parts.push(`${calendar.name} calendar`);
  if (occ.recurring) parts.push('repeats weekly');
  if (occ.event.seriesId) parts.push('edited occurrence of a series');
  return parts.join(', ');
}

export const EVENT_KEYBOARD_HELP_ID = 'event-keyboard-help';
