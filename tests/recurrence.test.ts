import { describe, expect, it } from 'vitest';
import { describeRecurrence, expandEvents, sameRecurrence } from '../src/lib/recurrence';
import type { CalendarEvent } from '../src/lib/types';
import { DAY, format, parse } from '../src/lib/time';

const series: CalendarEvent = {
  id: 's1',
  title: 'Gym',
  start: '2026-11-02T18:00', // Monday
  end: '2026-11-02T19:00',
  allDay: false,
  calendarId: 'health',
  recurrence: { freq: 'weekly', byWeekday: [1, 3], interval: 1 },
};

describe('weekly recurrence expansion', () => {
  it('generates occurrences on each selected weekday', () => {
    const occ = expandEvents([series], parse('2026-11-16'), parse('2026-11-23'));
    expect(occ.map((o) => format(o.start))).toEqual(['2026-11-16T18:00', '2026-11-18T18:00']);
    expect(occ.every((o) => o.recurring)).toBe(true);
    expect(occ[0].key).toBe('s1::2026-11-16T18:00');
  });

  it('does not generate occurrences before the series start', () => {
    const occ = expandEvents([series], parse('2026-10-26'), parse('2026-11-09'));
    expect(occ.map((o) => format(o.start))).toEqual(['2026-11-02T18:00', '2026-11-04T18:00']);
  });

  it('respects the until date and exdates', () => {
    const ev = { ...series, recurrence: { ...series.recurrence!, until: '2026-11-16' }, exdates: ['2026-11-09T18:00'] };
    const occ = expandEvents([ev], parse('2026-11-01'), parse('2026-12-01'));
    expect(occ.map((o) => format(o.start))).toEqual([
      '2026-11-02T18:00',
      '2026-11-04T18:00',
      '2026-11-11T18:00',
      '2026-11-16T18:00',
    ]);
  });

  it('supports every-N-weeks intervals', () => {
    const ev = { ...series, recurrence: { freq: 'weekly' as const, byWeekday: [1], interval: 2 } };
    const occ = expandEvents([ev], parse('2026-11-01'), parse('2026-12-01'));
    expect(occ.map((o) => format(o.start))).toEqual(['2026-11-02T18:00', '2026-11-16T18:00', '2026-11-30T18:00']);
  });

  it('includes a midnight-spanning occurrence that started before the range', () => {
    const night: CalendarEvent = {
      ...series,
      id: 'n',
      start: '2026-11-01T22:00', // Sunday
      end: '2026-11-02T02:00',
      recurrence: { freq: 'weekly', byWeekday: [0], interval: 1 },
    };
    // Range starts Monday 00:00 — the Sunday-night occurrence reaches into it.
    const occ = expandEvents([night], parse('2026-11-09'), parse('2026-11-16'));
    expect(occ.map((o) => format(o.start))).toEqual(['2026-11-08T22:00', '2026-11-15T22:00']);
    expect(occ[0].end - occ[0].start).toBe(4 * 60 * 60_000);
  });

  it('returns single events overlapping the range', () => {
    const single: CalendarEvent = { ...series, id: 'x', recurrence: undefined, start: '2026-11-15T23:00', end: '2026-11-16T01:00' };
    expect(expandEvents([single], parse('2026-11-16'), parse('2026-11-16') + DAY)).toHaveLength(1);
    expect(expandEvents([single], parse('2026-11-16T01:00'), parse('2026-11-17'))).toHaveLength(0);
  });

  it('describes rules in plain language', () => {
    expect(describeRecurrence(series.recurrence)).toBe('Weekly on Mon, Wed');
    expect(describeRecurrence({ freq: 'weekly', byWeekday: [1, 2, 3, 4, 5], interval: 1 })).toBe('Weekly on weekdays');
    expect(describeRecurrence(undefined)).toBe('Does not repeat');
  });
});

describe('sameRecurrence', () => {
  it('compares rules by meaning', () => {
    const a = { freq: 'weekly' as const, byWeekday: [1, 3], interval: 1 };
    expect(sameRecurrence(a, { interval: 1, freq: 'weekly', byWeekday: [3, 1] })).toBe(true);
    expect(sameRecurrence(a, { ...a, until: '2026-12-31' })).toBe(false);
    expect(sameRecurrence(a, undefined)).toBe(false);
    expect(sameRecurrence(undefined, undefined)).toBe(true);
  });
});
