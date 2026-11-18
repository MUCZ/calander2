import type { Occurrence } from './types';
import { DAY, MINUTE, addDays, startOfDay } from './time';

/** A piece of a timed occurrence clipped to a single day column. */
export interface DaySegment {
  occ: Occurrence;
  /** Index of the day column within the visible range. */
  dayIndex: number;
  /** Minutes from midnight. */
  startMin: number;
  endMin: number;
  /** False when the occurrence started on an earlier day (spans midnight). */
  isStart: boolean;
  /** False when the occurrence continues on the next day. */
  isEnd: boolean;
}

export interface PositionedSegment extends DaySegment {
  /** Column index inside its overlap cluster. */
  column: number;
  /** Number of columns in the cluster. */
  columns: number;
  /** How many columns this segment may stretch across (>= 1). */
  span: number;
}

/** Splits timed occurrences into per-day segments for `dayCount` days starting at `rangeStart`. */
export function splitIntoDaySegments(occurrences: Occurrence[], rangeStart: number, dayCount: number): DaySegment[] {
  const segments: DaySegment[] = [];
  for (const occ of occurrences) {
    if (occ.event.allDay) continue;
    const end = Math.max(occ.end, occ.start + 15 * MINUTE);
    for (let i = 0; i < dayCount; i++) {
      const dayStart = addDays(rangeStart, i);
      const dayEnd = dayStart + DAY;
      if (occ.start >= dayEnd || end <= dayStart) continue;
      const s = Math.max(occ.start, dayStart);
      const e = Math.min(end, dayEnd);
      segments.push({
        occ,
        dayIndex: i,
        startMin: Math.round((s - dayStart) / MINUTE),
        endMin: Math.round((e - dayStart) / MINUTE),
        isStart: occ.start >= dayStart,
        isEnd: end <= dayEnd,
      });
    }
  }
  return segments;
}

/**
 * Classic calendar overlap layout. Within each cluster of transitively
 * overlapping segments, segments are greedily placed into the first free
 * column; then each segment expands to the right over columns that stay free
 * for its whole duration.
 */
export function layoutDay(segments: DaySegment[], minDuration = 20): PositionedSegment[] {
  const sorted = [...segments].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.occ.key.localeCompare(b.occ.key),
  );
  const visualEnd = (s: DaySegment) => Math.max(s.endMin, s.startMin + minDuration);
  const result: PositionedSegment[] = [];
  let cluster: PositionedSegment[] = [];
  let columnsEnd: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = columnsEnd.length;
    for (const seg of cluster) {
      seg.columns = columns;
      let span = 1;
      for (let c = seg.column + 1; c < columns; c++) {
        const blocked = cluster.some(
          (o) => o.column === c && o.startMin < visualEnd(seg) && seg.startMin < visualEnd(o),
        );
        if (blocked) break;
        span++;
      }
      seg.span = span;
    }
    result.push(...cluster);
    cluster = [];
    columnsEnd = [];
    clusterEnd = -1;
  };

  for (const seg of sorted) {
    if (cluster.length && seg.startMin >= clusterEnd) flush();
    let column = columnsEnd.findIndex((end) => end <= seg.startMin);
    if (column === -1) {
      column = columnsEnd.length;
      columnsEnd.push(visualEnd(seg));
    } else {
      columnsEnd[column] = visualEnd(seg);
    }
    cluster.push({ ...seg, column, columns: 1, span: 1 });
    clusterEnd = Math.max(clusterEnd, visualEnd(seg));
  }
  if (cluster.length) flush();
  return result;
}

export function layoutTimed(occurrences: Occurrence[], rangeStart: number, dayCount: number): PositionedSegment[] {
  const segments = splitIntoDaySegments(occurrences, rangeStart, dayCount);
  const byDay = new Map<number, DaySegment[]>();
  for (const s of segments) {
    const list = byDay.get(s.dayIndex) ?? [];
    list.push(s);
    byDay.set(s.dayIndex, list);
  }
  return [...byDay.values()].flatMap((list) => layoutDay(list));
}

/** A horizontal bar in the all-day row (or a month week row). */
export interface SpanBar {
  occ: Occurrence;
  startIndex: number;
  /** Exclusive. */
  endIndex: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Places all-day / multi-day bars into lanes so they never overlap. */
export function layoutSpans(occurrences: Occurrence[], rangeStart: number, dayCount: number): SpanBar[] {
  const rangeEnd = addDays(rangeStart, dayCount);
  const bars: SpanBar[] = [];
  const items = occurrences
    .filter((o) => o.end > rangeStart && o.start < rangeEnd)
    .map((occ) => {
      const s = startOfDay(occ.start);
      // Exclusive end: an all-day event ending at 00:00 ends the previous day.
      const e = occ.event.allDay ? occ.end : startOfDay(occ.end - 1) + DAY;
      const startIndex = Math.max(0, Math.round((s - rangeStart) / DAY));
      const endIndex = Math.min(dayCount, Math.round((e - rangeStart) / DAY));
      return { occ, startIndex, endIndex: Math.max(endIndex, startIndex + 1), s, e };
    })
    .sort((a, b) => a.startIndex - b.startIndex || b.endIndex - b.startIndex - (a.endIndex - a.startIndex));

  const lanesEnd: number[] = [];
  for (const it of items) {
    let lane = lanesEnd.findIndex((end) => end <= it.startIndex);
    if (lane === -1) {
      lane = lanesEnd.length;
      lanesEnd.push(it.endIndex);
    } else lanesEnd[lane] = it.endIndex;
    bars.push({
      occ: it.occ,
      startIndex: it.startIndex,
      endIndex: it.endIndex,
      lane,
      continuesBefore: it.s < rangeStart,
      continuesAfter: it.e > rangeEnd,
    });
  }
  return bars;
}
