import { describe, expect, it } from 'vitest';
import { expandEvents } from '../src/lib/recurrence';
import {
  createEvent,
  deleteOccurrence,
  draftFromOccurrence,
  normalizeDraft,
  rescheduleOccurrence,
  sameDraft,
  updateOccurrence,
} from '../src/lib/operations';
import type { CalendarData, CalendarEvent } from '../src/lib/types';
import { DAY, HOUR, MINUTE, format, parse } from '../src/lib/time';

const standup: CalendarEvent = {
  id: 'standup',
  title: 'Standup',
  start: '2026-11-02T09:30', // Monday
  end: '2026-11-02T09:45',
  allDay: false,
  calendarId: 'work',
  recurrence: { freq: 'weekly', byWeekday: [1, 3], interval: 1 },
};
const single: CalendarEvent = {
  id: 'review',
  title: 'Review',
  start: '2026-11-17T10:00',
  end: '2026-11-17T11:00',
  allDay: false,
  calendarId: 'work',
};
const base: CalendarData = {
  events: [standup, single],
  calendars: [{ id: 'work', name: 'Work', color: '#000', visible: true }],
};

const week = (d: CalendarData, from = '2026-11-16') => expandEvents(d.events, parse(from), parse(from) + 7 * DAY);
const findOcc = (d: CalendarData, key: string, from?: string) => week(d, from).find((o) => o.key === key)!;
const starts = (d: CalendarData, id: string, from?: string) =>
  week(d, from)
    .filter((o) => o.event.id === id || o.event.seriesId === id)
    .map((o) => format(o.start));

describe('single events', () => {
  it('reschedules (drag move) and resizes', () => {
    const o = findOcc(base, 'review');
    const moved = rescheduleOccurrence(base, o, o.start + DAY + 30 * MINUTE, o.end + DAY + 30 * MINUTE);
    expect(moved.events.find((e) => e.id === 'review')).toMatchObject({
      start: '2026-11-18T10:30',
      end: '2026-11-18T11:30',
    });
    const resized = rescheduleOccurrence(base, o, o.start, o.end + 90 * MINUTE);
    expect(resized.events.find((e) => e.id === 'review')!.end).toBe('2026-11-17T12:30');
    // Original data is never mutated (needed for undo/redo snapshots).
    expect(base.events.find((e) => e.id === 'review')!.start).toBe('2026-11-17T10:00');
  });

  it('can be moved across midnight', () => {
    const o = findOcc(base, 'review');
    const next = rescheduleOccurrence(base, o, parse('2026-11-17T23:30'), parse('2026-11-18T00:30'));
    const occ = week(next).filter((x) => x.event.id === 'review');
    expect(occ).toHaveLength(1);
    expect(format(occ[0].end)).toBe('2026-11-18T00:30');
  });

  it('deletes', () => {
    const o = findOcc(base, 'review');
    expect(deleteOccurrence(base, o).events.map((e) => e.id)).toEqual(['standup']);
  });
});

describe('recurring events', () => {
  const key = 'standup::2026-11-18T09:30'; // Wednesday occurrence

  it('"This occurrence only" detaches one occurrence and leaves the series intact', () => {
    const o = findOcc(base, key);
    const next = rescheduleOccurrence(base, o, o.start + HOUR, o.end + HOUR, 'this');
    expect(starts(next, 'standup')).toEqual(['2026-11-16T09:30', '2026-11-18T10:30']);
    const detached = next.events.find((e) => e.seriesId === 'standup')!;
    expect(detached.recurrence).toBeUndefined();
    expect(detached.originalStart).toBe('2026-11-18T09:30');
    // Other weeks are untouched.
    expect(starts(next, 'standup', '2026-11-23')).toEqual(['2026-11-23T09:30', '2026-11-25T09:30']);
  });

  it('"Entire series" shifts every occurrence, including weekday changes', () => {
    const o = findOcc(base, key);
    // Drag Wednesday 9:30 → Thursday 10:00
    const next = rescheduleOccurrence(base, o, parse('2026-11-19T10:00'), parse('2026-11-19T10:15'), 'series');
    expect(starts(next, 'standup')).toEqual(['2026-11-17T10:00', '2026-11-19T10:00']);
    expect(next.events.find((e) => e.id === 'standup')!.recurrence!.byWeekday).toEqual([2, 4]);
    expect(next.events).toHaveLength(2);
  });

  it('"Entire series" resize changes every duration', () => {
    const o = findOcc(base, key);
    const next = rescheduleOccurrence(base, o, o.start, o.start + 30 * MINUTE, 'series');
    expect(week(next).filter((x) => x.event.id === 'standup').every((x) => x.end - x.start === 30 * MINUTE)).toBe(true);
  });

  it('edits the title for one occurrence or the whole series', () => {
    const o = findOcc(base, key);
    const draft = { ...draftFromOccurrence(o), title: 'Retro' };
    const one = updateOccurrence(base, o, draft, 'this');
    expect(week(one).map((x) => x.event.title).filter((t) => t !== 'Review')).toEqual(['Standup', 'Retro']);
    const all = updateOccurrence(base, o, draft, 'series');
    expect(week(all).map((x) => x.event.title).filter((t) => t !== 'Review')).toEqual(['Retro', 'Retro']);
  });

  it('changes repeat days for the series', () => {
    const o = findOcc(base, key);
    const draft = { ...draftFromOccurrence(o), recurrence: { freq: 'weekly' as const, interval: 1, byWeekday: [1, 3, 5] } };
    const next = updateOccurrence(base, o, draft, 'series');
    expect(starts(next, 'standup')).toEqual(['2026-11-16T09:30', '2026-11-18T09:30', '2026-11-20T09:30']);
  });

  it('turning off repeat for the series collapses it into a single event', () => {
    const o = findOcc(base, key);
    const next = updateOccurrence(base, o, { ...draftFromOccurrence(o), recurrence: undefined }, 'series');
    const ev = next.events.find((e) => e.id === 'standup')!;
    expect(ev.recurrence).toBeUndefined();
    expect(ev.start).toBe('2026-11-18T09:30');
  });

  it('deletes one occurrence or the entire series (with detached edits)', () => {
    const o = findOcc(base, key);
    const one = deleteOccurrence(base, o, 'this');
    expect(starts(one, 'standup')).toEqual(['2026-11-16T09:30']);
    const detached = rescheduleOccurrence(base, findOcc(base, 'standup::2026-11-16T09:30'), parse('2026-11-16T11:00'), parse('2026-11-16T11:15'), 'this');
    const all = deleteOccurrence(detached, findOcc(detached, key), 'series');
    expect(all.events.map((e) => e.id)).toEqual(['review']);
  });

  it('editing the series keeps previously removed occurrences removed', () => {
    const removed = deleteOccurrence(base, findOcc(base, key), 'this');
    const mon = findOcc(removed, 'standup::2026-11-16T09:30');
    const shifted = rescheduleOccurrence(removed, mon, mon.start + HOUR, mon.end + HOUR, 'series');
    expect(starts(shifted, 'standup')).toEqual(['2026-11-16T10:30']);
  });
});

describe('creating events', () => {
  it('normalizes all-day ranges and inverted times', () => {
    expect(normalizeDraft({ title: ' ', start: '2026-11-18T13:00', end: '2026-11-18T12:00', allDay: false, calendarId: 'w' })).toMatchObject({
      title: '(No title)',
      end: '2026-11-18T13:15',
    });
    expect(normalizeDraft({ title: 'x', start: '2026-11-18T10:00', end: '2026-11-18T10:00', allDay: true, calendarId: 'w' })).toMatchObject({
      start: '2026-11-18T00:00',
      end: '2026-11-19T00:00',
    });
  });

  it('adds a new event with a unique id', () => {
    const r = createEvent(base, { title: 'Lunch', start: '2026-11-18T12:00', end: '2026-11-18T13:00', allDay: false, calendarId: 'work' });
    expect(r.data.events).toHaveLength(3);
    expect(new Set(r.data.events.map((e) => e.id)).size).toBe(3);
    expect(r.event.location).toBeUndefined();
  });
});

describe('change detection', () => {
  it('treats drafts with re-ordered recurrence keys as unchanged', () => {
    const o = findOcc(base, 'standup::2026-11-18T09:30');
    const draft = draftFromOccurrence(o);
    const reordered = { ...draft, recurrence: { interval: 1, byWeekday: [3, 1], freq: 'weekly' as const } };
    expect(sameDraft(draft, reordered)).toBe(true);
    expect(sameDraft(draft, { ...draft, title: 'Other' })).toBe(false);
    expect(sameDraft(draft, { ...draft, recurrence: undefined })).toBe(false);
  });
});
