import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CalendarCategory, Occurrence } from '../lib/types';
import { layoutSpans, layoutTimed, splitIntoDaySegments, type PositionedSegment } from '../lib/layout';
import {
  DAY,
  MINUTE,
  addDays,
  formatHourLabel,
  formatLongDate,
  formatTime,
  formatTimeRange,
  formatWeekdayShort,
  minutesOfDay,
  sameDay,
  snapMinutes,
} from '../lib/time';
import { EVENT_KEYBOARD_HELP_ID, occurrenceAriaLabel } from './eventLabel';
import { Repeat } from './Icons';

export type RescheduleKind = 'move' | 'resize';

export interface WeekViewProps {
  rangeStart: number;
  dayCount: number;
  occurrences: Occurrence[];
  calendars: Map<string, CalendarCategory>;
  now: number;
  selectedKey: string | null;
  compact: boolean;
  isDimmed: (occ: Occurrence) => boolean;
  onSelectDay: (day: number) => void;
  onCreate: (start: number, end: number, allDay: boolean) => void;
  onOpen: (occ: Occurrence) => void;
  onReschedule: (occ: Occurrence, start: number, end: number, kind: RescheduleKind) => void;
  onEventKey: (occ: Occurrence, e: React.KeyboardEvent) => void;
  onFocusEvent: (occ: Occurrence) => void;
  /** A change awaiting confirmation (e.g. recurring scope dialog) shown as a ghost. */
  pending?: { key: string; start: number; end: number } | null;
}

type DragMode = 'move' | 'resize-start' | 'resize-end' | 'create' | 'allday-move';

interface DragData {
  mode: DragMode;
  occ?: Occurrence;
  pointerId: number;
  originX: number;
  originY: number;
  originDay: number;
  originMin: number;
  active: boolean;
  start: number;
  end: number;
}

interface Preview {
  mode: DragMode;
  key?: string;
  occ?: Occurrence;
  start: number;
  end: number;
}

const SNAP = 15;
const MIN_DURATION = 15 * MINUTE;

export function WeekView(props: WeekViewProps) {
  const { rangeStart, dayCount, occurrences, calendars, now, selectedKey, compact, isDimmed } = props;
  const hourPx = compact ? 44 : 48;
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i)), [rangeStart, dayCount]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const allDayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragData | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const lastPointerType = useRef<string>('mouse');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hover, setHover] = useState<{ day: number; minute: number } | null>(null);

  const propsRef = useRef(props);
  propsRef.current = props;

  const allDayOcc = useMemo(() => occurrences.filter((o) => o.event.allDay), [occurrences]);
  const timedOcc = useMemo(() => occurrences.filter((o) => !o.event.allDay), [occurrences]);
  const positioned = useMemo(() => layoutTimed(timedOcc, rangeStart, dayCount), [timedOcc, rangeStart, dayCount]);
  const bars = useMemo(() => layoutSpans(allDayOcc, rangeStart, dayCount), [allDayOcc, rangeStart, dayCount]);
  const lanes = bars.reduce((m, b) => Math.max(m, b.lane + 1), 0);

  // Scroll to the working day once per mount.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 7.5 * hourPx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the selected event visible (e.g. after search navigation).
  useEffect(() => {
    if (!selectedKey || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedKey)}"]`);
    if (!el) return;
    const box = scrollRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) {
      scrollRef.current.scrollTop += r.top - box.top - box.height / 3;
    }
  }, [selectedKey, rangeStart]);

  // ---------------- Pointer helpers ----------------

  const pointToGrid = (clientX: number, clientY: number) => {
    const rect = colsRef.current!.getBoundingClientRect();
    const day = Math.min(dayCount - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * dayCount)));
    const minute = Math.min(24 * 60, Math.max(0, ((clientY - rect.top) / hourPx) * 60));
    return { day, minute };
  };

  const pointToAllDay = (clientX: number) => {
    const rect = allDayRef.current!.getBoundingClientRect();
    return Math.min(dayCount - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * dayCount)));
  };

  const computeDrag = (d: DragData, clientX: number, clientY: number): { start: number; end: number } => {
    if (d.mode === 'allday-move' && d.occ) {
      const delta = (pointToAllDay(clientX) - d.originDay) * DAY;
      return { start: d.occ.start + delta, end: d.occ.end + delta };
    }
    const { day, minute } = pointToGrid(clientX, clientY);
    const dayStart = addDays(rangeStart, day);
    if (d.mode === 'create') {
      const originStart = addDays(rangeStart, d.originDay);
      const a = Math.floor(d.originMin / SNAP) * SNAP;
      const b = snapMinutes(minute, SNAP);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b, lo + SNAP);
      return { start: originStart + lo * MINUTE, end: originStart + hi * MINUTE };
    }
    const occ = d.occ!;
    if (d.mode === 'move') {
      const deltaMin = snapMinutes(minute - d.originMin, SNAP);
      const start = occ.start + (day - d.originDay) * DAY + deltaMin * MINUTE;
      return { start, end: start + (occ.end - occ.start) };
    }
    const at = dayStart + snapMinutes(minute, SNAP) * MINUTE;
    if (d.mode === 'resize-end') return { start: occ.start, end: Math.max(at, occ.start + MIN_DURATION) };
    return { start: Math.min(at, occ.end - MIN_DURATION), end: occ.end };
  };

  const endDrag = (commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    document.body.classList.remove('is-dragging', 'is-resizing');
    cleanupRef.current?.();
    cleanupRef.current = null;
    setPreview(null);
    if (!d || !commit) return;
    const p = propsRef.current;
    if (d.mode === 'create') {
      if (d.active) p.onCreate(d.start, d.end, false);
      else {
        const start = addDays(rangeStart, d.originDay) + Math.floor(d.originMin / 30) * 30 * MINUTE;
        p.onCreate(start, start + 60 * MINUTE, false);
      }
      return;
    }
    if (!d.active || !d.occ) return;
    suppressClickRef.current = true;
    window.setTimeout(() => (suppressClickRef.current = false), 0);
    if (d.start !== d.occ.start || d.end !== d.occ.end) {
      p.onReschedule(d.occ, d.start, d.end, d.mode === 'move' || d.mode === 'allday-move' ? 'move' : 'resize');
    }
  };

  function onWindowMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.originX, e.clientY - d.originY) < 4) return;
      d.active = true;
      document.body.classList.add(d.mode.startsWith('resize') ? 'is-resizing' : 'is-dragging');
      setHover(null);
    }
    // Auto-scroll near the edges of the time grid.
    const sc = scrollRef.current;
    if (sc && d.mode !== 'allday-move') {
      const r = sc.getBoundingClientRect();
      if (e.clientY < r.top + 28) sc.scrollTop -= 14;
      else if (e.clientY > r.bottom - 28) sc.scrollTop += 14;
    }
    const { start, end } = computeDrag(d, e.clientX, e.clientY);
    d.start = start;
    d.end = end;
    setPreview({ mode: d.mode, key: d.occ?.key, occ: d.occ, start, end });
  }

  function onWindowUp(e: PointerEvent) {
    if (dragRef.current && e.pointerId === dragRef.current.pointerId) endDrag(true);
  }
  function onWindowCancel() {
    endDrag(false);
  }
  function onWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endDrag(false);
    }
  }

  const beginDrag = (e: React.PointerEvent, mode: DragMode, occ?: Occurrence) => {
    lastPointerType.current = e.pointerType;
    if (e.button !== 0 || e.pointerType === 'touch') return; // touch uses tap + editor controls
    e.stopPropagation();
    if (mode !== 'move' && mode !== 'allday-move') e.preventDefault();
    const origin =
      mode === 'allday-move' ? { day: pointToAllDay(e.clientX), minute: 0 } : pointToGrid(e.clientX, e.clientY);
    dragRef.current = {
      mode,
      occ,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      originDay: origin.day,
      originMin: origin.minute,
      active: false,
      start: occ?.start ?? 0,
      end: occ?.end ?? 0,
    };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowCancel);
    window.addEventListener('keydown', onWindowKey, true);
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowCancel);
      window.removeEventListener('keydown', onWindowKey, true);
    };
  };

  useEffect(
    () => () => {
      cleanupRef.current?.();
      document.body.classList.remove('is-dragging', 'is-resizing');
    },
    [],
  );

  // ---------------- Rendering ----------------

  const onGridClick = (e: React.MouseEvent) => {
    // Touch/pen taps on empty space create a one-hour event (mouse uses pointer handlers).
    if (lastPointerType.current === 'mouse') return;
    const { day, minute } = pointToGrid(e.clientX, e.clientY);
    const start = addDays(rangeStart, day) + Math.floor(minute / 30) * 30 * MINUTE;
    props.onCreate(start, start + 60 * MINUTE, false);
  };

  const onGridHover = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || dragRef.current?.active) return;
    if ((e.target as HTMLElement).closest('.ev')) {
      if (hover) setHover(null);
      return;
    }
    const { day, minute } = pointToGrid(e.clientX, e.clientY);
    const m = Math.floor(minute / 30) * 30;
    if (!hover || hover.day !== day || hover.minute !== m) setHover({ day, minute: m });
  };

  const pendingOcc = !preview && props.pending ? occurrences.find((o) => o.key === props.pending!.key) : undefined;
  const shown: Preview | null =
    preview ??
    (pendingOcc && props.pending
      ? {
          mode: pendingOcc.event.allDay ? 'allday-move' : 'move',
          key: pendingOcc.key,
          occ: pendingOcc,
          start: props.pending.start,
          end: props.pending.end,
        }
      : null);
  const todayIndex = days.findIndex((d) => sameDay(d, now));
  const previewSegments =
    shown && shown.mode !== 'allday-move'
      ? splitIntoDaySegments(
          [
            {
              key: shown.key ?? '__new__',
              start: shown.start,
              end: shown.end,
              originalStart: shown.start,
              recurring: false,
              event: shown.occ?.event ?? {
                id: '__new__',
                title: '(New event)',
                start: '',
                end: '',
                allDay: false,
                calendarId: '',
              },
            },
          ],
          rangeStart,
          dayCount,
        )
      : [];

  const allDayPreview =
    shown?.mode === 'allday-move' && shown.occ
      ? layoutSpans([{ ...shown.occ, start: shown.start, end: shown.end }], rangeStart, dayCount)[0]
      : null;

  const gridTemplate = { gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` };

  return (
    <div className={`week ${compact ? 'is-compact' : ''} days-${dayCount}`}>
      <div className="week-head">
        <div className="gutter" />
        <div className="week-head-days" style={gridTemplate}>
          {days.map((d, i) => {
            const isToday = i === todayIndex;
            return (
              <button
                key={d}
                type="button"
                className={`day-head ${isToday ? 'is-today' : ''}`}
                onClick={() => props.onSelectDay(d)}
                aria-label={`${formatLongDate(d)}${isToday ? ' (today)' : ''}. Open day view`}
              >
                <span className="day-head-wd">{formatWeekdayShort(d)}</span>
                <span className="day-head-num">{new Date(d).getUTCDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="allday">
        <div className="gutter allday-label">{compact ? '' : 'All-day'}</div>
        <div className="allday-body" ref={allDayRef} style={{ minHeight: Math.max(1, lanes) * 24 + 6 }}>
          <div className="allday-cells" style={gridTemplate}>
            {days.map((d) => (
              <button
                key={d}
                type="button"
                tabIndex={-1}
                className="allday-cell"
                aria-label={`Create all-day event on ${formatLongDate(d)}`}
                onClick={() => props.onCreate(d, d + DAY, true)}
              />
            ))}
          </div>
          <div className="allday-bars" style={{ ...gridTemplate, gridAutoRows: '22px' }}>
            {bars.map((b) => {
              const cal = calendars.get(b.occ.event.calendarId);
              const dragging = shown?.key === b.occ.key;
              return (
                <button
                  key={b.occ.key}
                  type="button"
                  data-key={b.occ.key}
                  className={`ev ev-bar ${b.continuesBefore ? 'cont-l' : ''} ${b.continuesAfter ? 'cont-r' : ''} ${
                    selectedKey === b.occ.key ? 'is-selected' : ''
                  } ${dragging ? 'is-source' : ''} ${isDimmed(b.occ) ? 'is-dimmed' : ''}`}
                  style={{
                    gridColumn: `${b.startIndex + 1} / ${b.endIndex + 1}`,
                    gridRow: b.lane + 1,
                    ['--c' as string]: cal?.color ?? '#6b7a8f',
                  }}
                  aria-label={occurrenceAriaLabel(b.occ, cal)}
                  aria-describedby={EVENT_KEYBOARD_HELP_ID}
                  onPointerDown={(e) => beginDrag(e, 'allday-move', b.occ)}
                  onClick={() => !suppressClickRef.current && props.onOpen(b.occ)}
                  onKeyDown={(e) => props.onEventKey(b.occ, e)}
                  onFocus={() => props.onFocusEvent(b.occ)}
                >
                  {b.occ.recurring && <Repeat className="ev-icon" width={11} height={11} />}
                  <span className="ev-title">{b.occ.event.title}</span>
                </button>
              );
            })}
            {allDayPreview && (
              <div
                className="ev ev-bar is-ghost"
                style={{
                  gridColumn: `${allDayPreview.startIndex + 1} / ${allDayPreview.endIndex + 1}`,
                  gridRow: allDayPreview.lane + 1,
                  ['--c' as string]: calendars.get(allDayPreview.occ.event.calendarId)?.color ?? '#6b7a8f',
                }}
              >
                <span className="ev-title">{allDayPreview.occ.event.title}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg" style={{ height: 24 * hourPx, ['--hour' as string]: `${hourPx}px` }}>
          <div className="gutter tg-gutter" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className="tg-hour" style={{ top: (i + 1) * hourPx }}>
                {formatHourLabel(i + 1)}
              </span>
            ))}
          </div>
          <div
            className="tg-cols"
            ref={colsRef}
            style={gridTemplate}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('.ev')) return;
              beginDrag(e, 'create');
            }}
            onClick={onGridClick}
            onPointerMove={onGridHover}
            onPointerLeave={() => setHover(null)}
          >
            {days.map((d, i) => (
              <div
                key={d}
                className={`tg-col ${i === todayIndex ? 'is-today' : ''}`}
                data-date={d}
                role="group"
                aria-label={formatLongDate(d)}
              >
                {hover && hover.day === i && !shown && (
                  <div
                    className="tg-hover"
                    style={{ top: (hover.minute / 60) * hourPx, height: hourPx / 2 }}
                    aria-hidden="true"
                  >
                    + {formatTime(d + hover.minute * MINUTE)}
                  </div>
                )}
                {positioned
                  .filter((s) => s.dayIndex === i)
                  .map((s) => (
                    <TimedEvent
                      key={`${s.occ.key}@${i}`}
                      seg={s}
                      hourPx={hourPx}
                      calendar={calendars.get(s.occ.event.calendarId)}
                      selected={selectedKey === s.occ.key}
                      dragging={shown?.key === s.occ.key}
                      dimmed={isDimmed(s.occ)}
                      compact={compact}
                      onPointerDown={(e, mode) => beginDrag(e, mode, s.occ)}
                      onClick={() => !suppressClickRef.current && props.onOpen(s.occ)}
                      onKeyDown={(e) => props.onEventKey(s.occ, e)}
                      onFocus={() => props.onFocusEvent(s.occ)}
                    />
                  ))}
                {previewSegments
                  .filter((s) => s.dayIndex === i)
                  .map((s) => {
                    const cal = calendars.get(s.occ.event.calendarId);
                    const top = (s.startMin / 60) * hourPx;
                    const height = Math.max(((s.endMin - s.startMin) / 60) * hourPx - 2, 16);
                    return (
                      <div
                        key={`ghost-${i}`}
                        className={`ev ev-timed is-ghost ${shown?.mode === 'create' ? 'is-create' : ''} ${
                          s.isStart ? '' : 'cont-t'
                        } ${s.isEnd ? '' : 'cont-b'}`}
                        style={{ top, height, left: 2, right: 4, ['--c' as string]: cal?.color ?? '#4f5bd5' }}
                        aria-hidden="true"
                      >
                        {height < 34 ? (
                          <span className="ev-title ev-ghost-line">
                            {s.occ.event.title}, {formatTimeRange(shown!.start, shown!.end)}
                          </span>
                        ) : (
                          <>
                            <span className="ev-title">{s.occ.event.title}</span>
                            <span className="ev-time">{formatTimeRange(shown!.start, shown!.end)}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                {i === todayIndex && (
                  <div className="now-line" style={{ top: (minutesOfDay(now) / 60) * hourPx }} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TimedEventProps {
  seg: PositionedSegment;
  hourPx: number;
  calendar?: CalendarCategory;
  selected: boolean;
  dragging: boolean;
  dimmed: boolean;
  compact: boolean;
  onPointerDown: (e: React.PointerEvent, mode: DragMode) => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
}

function TimedEvent({
  seg,
  hourPx,
  calendar,
  selected,
  dragging,
  dimmed,
  compact,
  onPointerDown,
  onClick,
  onKeyDown,
  onFocus,
}: TimedEventProps) {
  const { occ } = seg;
  const top = (seg.startMin / 60) * hourPx;
  const rawHeight = ((seg.endMin - seg.startMin) / 60) * hourPx;
  const height = Math.max(rawHeight - 2, 18);
  const short = height < 34;
  const widthPct = (seg.span / seg.columns) * 100;
  const leftPct = (seg.column / seg.columns) * 100;
  // Narrow (mobile) columns are too thin to split; overlapping events cascade instead.
  const cascade = compact && seg.columns > 1;
  const CASCADE_STEP = 12;
  const timeText = seg.isStart
    ? formatTimeRange(occ.start, occ.end)
    : `until ${formatTime(occ.end)}`;

  return (
    <button
      type="button"
      data-key={occ.key}
      tabIndex={seg.isStart || seg.dayIndex === 0 ? 0 : -1}
      className={`ev ev-timed ${short ? 'is-short' : ''} ${selected ? 'is-selected' : ''} ${
        dragging ? 'is-source' : ''
      } ${dimmed ? 'is-dimmed' : ''} ${seg.isStart ? '' : 'cont-t'} ${seg.isEnd ? '' : 'cont-b'} ${
        seg.column > 0 ? 'is-stacked' : ''
      }`}
      style={{
        top,
        height,
        left: cascade ? seg.column * CASCADE_STEP + 1 : `calc(${leftPct}% + 1px)`,
        width: cascade ? `calc(100% - ${seg.column * CASCADE_STEP + 2}px)` : `calc(${widthPct}% - ${compact ? 2 : 6}px)`,
        zIndex: 1 + seg.column,
        ['--c' as string]: calendar?.color ?? '#6b7a8f',
      }}
      aria-label={occurrenceAriaLabel(occ, calendar)}
      aria-describedby={EVENT_KEYBOARD_HELP_ID}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {seg.isStart && <span className="rz rz-top" onPointerDown={(e) => onPointerDown(e, 'resize-start')} aria-hidden="true" />}
      <span className="ev-content">
        <span className="ev-title">
          {occ.recurring && <Repeat className="ev-icon" width={11} height={11} />}
          {occ.event.title}
          {short && !compact && <span className="ev-time-inline">, {seg.isStart ? formatTime(occ.start) : timeText}</span>}
        </span>
        {!short && <span className="ev-time">{timeText}</span>}
        {!short && height > 58 && occ.event.location && !compact && <span className="ev-loc">{occ.event.location}</span>}
      </span>
      {seg.isEnd && <span className="rz rz-bottom" onPointerDown={(e) => onPointerDown(e, 'resize-end')} aria-hidden="true" />}
    </button>
  );
}
