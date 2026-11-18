import { describe, expect, it } from 'vitest';
import {
  DAY,
  addMonths,
  format,
  formatRangeTitle,
  formatTimeRange,
  minutesOfDay,
  nowNaive,
  parse,
  startOfWeek,
  weekday,
} from '../src/lib/time';

describe('naive time helpers', () => {
  it('round-trips date-time strings', () => {
    expect(format(parse('2026-11-18T09:30'))).toBe('2026-11-18T09:30');
    expect(format(parse('2026-11-18'))).toBe('2026-11-18T00:00');
  });

  it('is immune to DST transitions (TZ=America/New_York in tests)', () => {
    // US DST ends 2026-11-01: a local day is still exactly 24h in naive time.
    const before = parse('2026-10-31T09:00');
    expect(format(before + DAY)).toBe('2026-11-01T09:00');
    expect(format(before + 2 * DAY)).toBe('2026-11-02T09:00');
  });

  it('computes weeks starting on Monday', () => {
    const wed = parse('2026-11-18T15:00');
    expect(weekday(wed)).toBe(3);
    expect(format(startOfWeek(wed, 1))).toBe('2026-11-16T00:00');
    expect(format(startOfWeek(parse('2026-11-22T10:00'), 1))).toBe('2026-11-16T00:00');
  });

  it('adds months clamping to the end of month', () => {
    expect(format(addMonths(parse('2026-01-31T10:00'), 1))).toBe('2026-02-28T10:00');
  });

  it('converts local wall-clock now to naive', () => {
    const local = new Date(2026, 10, 18, 14, 45);
    expect(format(nowNaive(local))).toBe('2026-11-18T14:45');
    expect(minutesOfDay(nowNaive(local))).toBe(14 * 60 + 45);
  });

  it('formats ranges and midnight-spanning times', () => {
    expect(formatTimeRange(parse('2026-11-18T09:00'), parse('2026-11-18T10:30'))).toBe('9am – 10:30am');
    expect(formatTimeRange(parse('2026-11-19T23:00'), parse('2026-11-20T01:30'))).toBe('11pm – Nov 20, 1:30am');
    expect(formatTimeRange(parse('2026-11-19T22:00'), parse('2026-11-20T00:00'))).toBe('10pm – 12am');
    expect(formatRangeTitle(parse('2026-11-16'), parse('2026-11-23'))).toBe('November 2026');
    expect(formatRangeTitle(parse('2026-11-30'), parse('2026-12-07'))).toBe('Nov 30 – Dec 6, 2026');
  });
});
