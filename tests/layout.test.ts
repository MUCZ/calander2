import { describe, expect, it } from 'vitest';
import { layoutDay, layoutSpans, layoutTimed, splitIntoDaySegments, type DaySegment } from '../src/lib/layout';
import type { CalendarEvent, Occurrence } from '../src/lib/types';
import { parse } from '../src/lib/time';

function occ(id: string, start: string, end: string, allDay = false): Occurrence {
  const ev: CalendarEvent = { id, title: id, start, end, allDay, calendarId: 'c' };
  return { key: id, event: ev, start: parse(start), end: parse(end), originalStart: parse(start), recurring: false };
}

const seg = (id: string, startMin: number, endMin: number): DaySegment => ({
  occ: occ(id, '2026-11-16T00:00', '2026-11-16T01:00'),
  dayIndex: 0,
  startMin,
  endMin,
  isStart: true,
  isEnd: true,
});

describe('overlap layout', () => {
  it('keeps non-overlapping events full width', () => {
    const r = layoutDay([seg('a', 540, 600), seg('b', 600, 660)]);
    expect(r.map((s) => [s.occ.key, s.column, s.columns, s.span])).toEqual([
      ['a', 0, 1, 1],
      ['b', 0, 1, 1],
    ]);
  });

  it('places overlapping events side by side and reuses free columns', () => {
    // a 10:00-11:30, b 10:30-11:00, c 11:00-12:00
    const r = layoutDay([seg('a', 600, 690), seg('b', 630, 660), seg('c', 660, 720)]);
    const by = Object.fromEntries(r.map((s) => [s.occ.key, s]));
    expect(by.a.column).toBe(0);
    expect(by.b.column).toBe(1);
    expect(by.c.column).toBe(1); // b ended, c reuses column 1
    expect(by.a.columns).toBe(2);
    expect(by.c.columns).toBe(2);
  });

  it('expands an event across free columns to its right', () => {
    // a and b overlap, c overlaps a only at the start, d starts later in column 0's neighbour space
    const r = layoutDay([seg('a', 0, 120), seg('b', 0, 60), seg('c', 0, 30), seg('d', 60, 120)]);
    const by = Object.fromEntries(r.map((s) => [s.occ.key, s]));
    expect(by.a.columns).toBe(3);
    expect(by.d.column).toBe(1);
    expect(by.d.span).toBe(2); // nothing in column 2 after 30min
    expect(by.a.span).toBe(1);
  });

  it('separates clusters that do not overlap', () => {
    const r = layoutDay([seg('a', 0, 60), seg('b', 30, 90), seg('c', 120, 180)]);
    const by = Object.fromEntries(r.map((s) => [s.occ.key, s]));
    expect(by.c.columns).toBe(1);
    expect(by.a.columns).toBe(2);
  });
});

describe('midnight-spanning events', () => {
  it('are split into a segment per day with continuation flags', () => {
    const o = occ('deploy', '2026-11-19T23:00', '2026-11-20T01:30');
    const segs = splitIntoDaySegments([o], parse('2026-11-16'), 7);
    expect(segs.map((s) => [s.dayIndex, s.startMin, s.endMin, s.isStart, s.isEnd])).toEqual([
      [3, 23 * 60, 24 * 60, true, false],
      [4, 0, 90, false, true],
    ]);
  });

  it('are clipped to the visible range', () => {
    const o = occ('late', '2026-11-15T22:00', '2026-11-16T02:00');
    const segs = splitIntoDaySegments([o], parse('2026-11-16'), 7);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ dayIndex: 0, startMin: 0, endMin: 120, isStart: false });
  });

  it('ignore all-day events and lay out per day', () => {
    const r = layoutTimed(
      [occ('x', '2026-11-16T09:00', '2026-11-16T10:00'), occ('y', '2026-11-16', '2026-11-17', true)],
      parse('2026-11-16'),
      7,
    );
    expect(r).toHaveLength(1);
  });
});

describe('all-day lanes', () => {
  it('stacks overlapping multi-day bars into lanes', () => {
    const bars = layoutSpans(
      [
        occ('offsite', '2026-11-18', '2026-11-20', true),
        occ('bday', '2026-11-19', '2026-11-20', true),
        occ('trip', '2026-11-21', '2026-11-24', true),
      ],
      parse('2026-11-16'),
      7,
    );
    const by = Object.fromEntries(bars.map((b) => [b.occ.key, b]));
    expect(by.offsite).toMatchObject({ startIndex: 2, endIndex: 4, lane: 0 });
    expect(by.bday).toMatchObject({ startIndex: 3, endIndex: 4, lane: 1 });
    expect(by.trip).toMatchObject({ startIndex: 5, endIndex: 7, lane: 0, continuesAfter: true });
  });
});
