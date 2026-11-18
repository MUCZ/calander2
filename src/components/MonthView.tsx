import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarCategory, Occurrence } from '../lib/types';
import {
  DAY,
  HOUR,
  addDays,
  formatLongDate,
  formatShortDate,
  formatTime,
  formatWeekdayShort,
  formatWeekdayLong,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../lib/time';
import { EVENT_KEYBOARD_HELP_ID, occurrenceAriaLabel } from './eventLabel';

export interface MonthViewProps {
  focusDate: number;
  occurrences: Occurrence[];
  calendars: Map<string, CalendarCategory>;
  now: number;
  selectedKey: string | null;
  compact: boolean;
  isDimmed: (occ: Occurrence) => boolean;
  onSelectDay: (day: number) => void;
  onCreate: (start: number, end: number, allDay: boolean) => void;
  onOpen: (occ: Occurrence) => void;
  onReschedule: (occ: Occurrence, start: number, end: number, kind: 'move') => void;
  onEventKey: (occ: Occurrence, e: React.KeyboardEvent) => void;
  onFocusEvent: (occ: Occurrence) => void;
  pending?: { key: string; start: number; end: number } | null;
}

export function monthGridStart(focusDate: number): number {
  return startOfWeek(startOfMonth(focusDate), 1);
}

interface DragData {
  occ: Occurrence;
  sourceDay: number;
  pointerId: number;
  x: number;
  y: number;
  active: boolean;
  target: number | null;
}

export function MonthView(props: MonthViewProps) {
  const { focusDate, occurrences, calendars, now, selectedKey, compact, isDimmed } = props;
  const gridStart = monthGridStart(focusDate);
  const month = new Date(focusDate).getUTCMonth();
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  // Fit as many chips as the cell height allows (re-measured on resize).
  const gridRef = useRef<HTMLDivElement>(null);
  const [cellHeight, setCellHeight] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setCellHeight(el.clientHeight / 6);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const chip = compact ? 20 : 23;
  const header = compact ? 30 : 34;
  const maxItems = cellHeight ? Math.max(1, Math.floor((cellHeight - header) / chip)) : compact ? 2 : 4;

  const byDay = useMemo(() => {
    const map = new Map<number, Occurrence[]>();
    for (const occ of occurrences) {
      const first = startOfDay(occ.start);
      const last = occ.event.allDay ? occ.end - DAY : startOfDay(Math.max(occ.end - 1, occ.start));
      for (let d = first; d <= last; d += DAY) {
        const list = map.get(d) ?? [];
        list.push(occ);
        map.set(d, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
        return a.start - b.start || b.end - a.end;
      });
    }
    return map;
  }, [occurrences]);

  const dragRef = useRef<DragData | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ key: string; target: number | null; x: number; y: number; title: string } | null>(
    null,
  );
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => () => cleanupRef.current?.(), []);

  const beginDrag = (e: React.PointerEvent, occ: Occurrence, day: number) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    e.stopPropagation();
    dragRef.current = { occ, sourceDay: day, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false, target: null };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
        d.active = true;
        document.body.classList.add('is-dragging');
      }
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-month-date]');
      d.target = cell ? Number(cell.dataset.monthDate) : null;
      setDrag({ key: d.occ.key, target: d.target, x: ev.clientX, y: ev.clientY, title: d.occ.event.title });
    };
    const finish = (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      cleanup();
      setDrag(null);
      document.body.classList.remove('is-dragging');
      if (!d?.active) return;
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
      if (commit && d.target != null && d.target !== d.sourceDay) {
        const delta = d.target - d.sourceDay;
        propsRef.current.onReschedule(d.occ, d.occ.start + delta, d.occ.end + delta, 'move');
      }
    };
    const up = (ev: PointerEvent) => ev.pointerId === dragRef.current?.pointerId && finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      cleanupRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    cleanupRef.current = cleanup;
  };

  return (
    <div className={`month ${compact ? 'is-compact' : ''}`}>
      <div className="month-head" aria-hidden="true">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="month-head-cell">
            {compact ? formatWeekdayShort(d).slice(0, 1) : formatWeekdayShort(d)}
          </div>
        ))}
      </div>
      <div className="month-grid" ref={gridRef}>
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const overflow = list.length > maxItems;
          const visible = overflow ? list.slice(0, maxItems - 1) : list;
          const isToday = sameDay(d, now);
          const outside = new Date(d).getUTCMonth() !== month;
          return (
            <div
              key={d}
              data-month-date={d}
              className={`month-cell ${outside ? 'is-outside' : ''} ${isToday ? 'is-today' : ''} ${
                drag?.target === d || (!drag && props.pending && startOfDay(props.pending.start) === d)
                  ? 'is-drop-target'
                  : ''
              }`}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                props.onCreate(d + 9 * HOUR, d + 10 * HOUR, false);
              }}
            >
              <button
                type="button"
                className="month-date"
                onClick={() => props.onSelectDay(d)}
                aria-label={`${formatLongDate(d)}${isToday ? ' (today)' : ''}, ${list.length} event${
                  list.length === 1 ? '' : 's'
                }. Open day view`}
              >
                {new Date(d).getUTCDate() === 1 && !compact ? `${formatShortDate(d)}` : new Date(d).getUTCDate()}
              </button>
              <div className="month-items">
                {visible.map((occ) => {
                  const cal = calendars.get(occ.event.calendarId);
                  const contBefore = occ.start < d;
                  const contAfter = occ.event.allDay ? occ.end > d + DAY : occ.end > d + DAY;
                  return (
                    <button
                      key={occ.key}
                      type="button"
                      data-key={occ.key}
                      className={`ev month-ev ${occ.event.allDay ? 'is-allday' : 'is-timed'} ${
                        contBefore ? 'cont-l' : ''
                      } ${contAfter ? 'cont-r' : ''} ${selectedKey === occ.key ? 'is-selected' : ''} ${
                        drag?.key === occ.key || props.pending?.key === occ.key ? 'is-source' : ''
                      } ${isDimmed(occ) ? 'is-dimmed' : ''}`}
                      tabIndex={contBefore && d !== gridStart ? -1 : 0}
                      style={{ ['--c' as string]: cal?.color ?? '#6b7a8f' }}
                      aria-label={occurrenceAriaLabel(occ, cal)}
                      aria-describedby={EVENT_KEYBOARD_HELP_ID}
                      onPointerDown={(e) => beginDrag(e, occ, d)}
                      onClick={() => !suppressClick.current && props.onOpen(occ)}
                      onKeyDown={(e) => props.onEventKey(occ, e)}
                      onFocus={() => props.onFocusEvent(occ)}
                    >
                      {!occ.event.allDay && <span className="dot" aria-hidden="true" />}
                      {!occ.event.allDay && !compact && (
                        <span className="month-ev-time">{contBefore ? '↳' : formatTime(occ.start)}</span>
                      )}
                      <span className="ev-title">{occ.event.title}</span>
                    </button>
                  );
                })}
                {overflow && (
                  <button
                    type="button"
                    className="month-more"
                    onClick={() => props.onSelectDay(d)}
                    aria-label={`${list.length - visible.length} more events on ${formatWeekdayLong(d)}. Open day view`}
                  >
                    +{list.length - visible.length} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {drag && drag.target != null && (
        <div className="drag-tip" style={{ left: drag.x + 14, top: drag.y + 14 }} aria-hidden="true">
          Move to {formatWeekdayShort(drag.target)}, {formatShortDate(drag.target)}
        </div>
      )}
    </div>
  );
}
