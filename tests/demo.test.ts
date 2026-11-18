import { describe, expect, it } from 'vitest';
import { createDemoData } from '../src/lib/demo';
import { expandEvents } from '../src/lib/recurrence';
import { layoutTimed } from '../src/lib/layout';
import { searchOccurrences } from '../src/lib/search';
import { DAY, parse, startOfDay, startOfWeek } from '../src/lib/time';

describe('demo data', () => {
  const today = parse('2026-11-18T12:00');
  const data = createDemoData(today);
  const weekStart = startOfWeek(today, 1);
  const occ = expandEvents(data.events, weekStart, weekStart + 7 * DAY);

  it('contains overlapping events in the current week', () => {
    const laid = layoutTimed(occ, weekStart, 7);
    expect(laid.some((s) => s.columns >= 2)).toBe(true);
  });

  it('contains events that span midnight', () => {
    const spanning = occ.filter((o) => !o.event.allDay && startOfDay(o.start) !== startOfDay(o.end - 1));
    expect(spanning.length).toBeGreaterThanOrEqual(2);
    expect(spanning.some((o) => o.recurring)).toBe(true);
  });

  it('contains weekly recurring events and all-day events', () => {
    expect(occ.filter((o) => o.recurring).length).toBeGreaterThan(5);
    expect(occ.some((o) => o.event.allDay && o.end - o.start > DAY)).toBe(true);
  });

  it('references only existing calendars', () => {
    const ids = new Set(data.calendars.map((c) => c.id));
    expect(data.events.every((e) => ids.has(e.calendarId))).toBe(true);
  });
});

describe('search', () => {
  const today = parse('2026-11-18T12:00');
  const data = createDemoData(today);

  it('lists upcoming occurrences first and caps repeats per series', () => {
    const r = searchOccurrences(data.events, data.calendars, 'standup', today - 30 * DAY, today + 30 * DAY, today);
    expect(r).toHaveLength(3);
    expect(r.every((o) => o.end > today)).toBe(true);
    expect(r[0].start).toBeLessThan(r[1].start);
  });

  it('does not let a weekly series bury one-off matches', () => {
    // "review" matches "Weekly planning" notes (weekly), "Quarterly review" and "Design review".
    const r = searchOccurrences(data.events, data.calendars, 'review', today - 60 * DAY, today + 365 * DAY, today);
    const titles = r.map((o) => o.event.title);
    expect(titles).toContain('Design review');
    expect(titles).toContain('Quarterly review');
    expect(titles.filter((t) => t === 'Weekly planning')).toHaveLength(3);
  });

  it('matches location, notes and calendar names, and respects hidden calendars', () => {
    expect(searchOccurrences(data.events, data.calendars, 'room 4b', today - DAY * 7, today + DAY * 7, today)).toHaveLength(1);
    const hidden = data.calendars.map((c) => (c.id === 'travel' ? { ...c, visible: false } : c));
    expect(searchOccurrences(data.events, hidden, 'flight', today - DAY * 7, today + DAY * 7, today)).toHaveLength(0);
  });
});
