import { useState } from 'react';
import type { CalendarCategory, ViewMode } from '../lib/types';
import { CALENDAR_COLORS } from '../lib/demo';
import {
  DAY,
  addDays,
  addMonths,
  formatLongDate,
  formatMonthYear,
  sameDay,
  startOfMonth,
  startOfWeek,
} from '../lib/time';
import { Check, ChevronLeft, ChevronRight, Close, Keyboard, Plus, Reset } from './Icons';

interface SidebarProps {
  focusDate: number;
  view: ViewMode;
  now: number;
  calendars: CalendarCategory[];
  counts: Map<string, number>;
  open: boolean;
  onClose: () => void;
  onPickDate: (d: number) => void;
  onToggleCalendar: (id: string) => void;
  onAddCalendar: (name: string, color: string) => void;
  onShowShortcuts: () => void;
  onResetDemo: () => void;
  onNewEvent: () => void;
}

export function Sidebar(props: SidebarProps) {
  const { calendars, open } = props;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(CALENDAR_COLORS[5]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    props.onAddCalendar(name.trim(), color);
    setName('');
    setAdding(false);
  };

  return (
    <>
      {open && <div className="sidebar-scrim" onClick={props.onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Calendars and navigation">
        <div className="sidebar-top">
          <button type="button" className="btn btn-primary btn-create" onClick={props.onNewEvent}>
            <Plus width={16} height={16} /> New event
          </button>
          <button type="button" className="icon-btn sidebar-close" onClick={props.onClose} aria-label="Close sidebar">
            <Close />
          </button>
        </div>

        <MiniMonth focusDate={props.focusDate} view={props.view} now={props.now} onPick={props.onPickDate} />

        <section className="cal-list" aria-labelledby="cal-list-h">
          <div className="section-head">
            <h2 id="cal-list-h">My calendars</h2>
            <button
              type="button"
              className="icon-btn sm"
              aria-label="Add calendar"
              aria-expanded={adding}
              onClick={() => setAdding((a) => !a)}
            >
              <Plus width={16} height={16} />
            </button>
          </div>
          <ul>
            {calendars.map((c) => (
              <li key={c.id}>
                <label className="cal-item" style={{ ['--c' as string]: c.color }}>
                  <input type="checkbox" checked={c.visible} onChange={() => props.onToggleCalendar(c.id)} />
                  <span className="cal-box" aria-hidden="true">
                    <Check width={12} height={12} strokeWidth={3} />
                  </span>
                  <span className="cal-name">{c.name}</span>
                  <span className="cal-count" aria-label={`${props.counts.get(c.id) ?? 0} events`}>
                    {props.counts.get(c.id) ?? 0}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {adding && (
            <form className="cal-add" onSubmit={submit}>
              <label className="field">
                <span className="field-label">Calendar name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Side project" autoFocus />
              </label>
              <div className="swatches" role="radiogroup" aria-label="Color">
                {CALENDAR_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    role="radio"
                    aria-checked={col === color}
                    aria-label={`Color ${col}`}
                    className={`swatch ${col === color ? 'is-on' : ''}`}
                    style={{ ['--c' as string]: col }}
                    onClick={() => setColor(col)}
                  />
                ))}
              </div>
              <div className="cal-add-actions">
                <button type="button" className="btn btn-ghost sm" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary sm" disabled={!name.trim()}>
                  Add
                </button>
              </div>
            </form>
          )}
        </section>

        <div className="sidebar-foot">
          <button type="button" className="link-btn" onClick={props.onShowShortcuts}>
            <Keyboard width={16} height={16} /> Keyboard shortcuts <kbd>?</kbd>
          </button>
          <button type="button" className="link-btn" onClick={props.onResetDemo}>
            <Reset width={16} height={16} /> Reset demo data
          </button>
        </div>
      </aside>
    </>
  );
}

function MiniMonth({
  focusDate,
  view,
  now,
  onPick,
}: {
  focusDate: number;
  view: ViewMode;
  now: number;
  onPick: (d: number) => void;
}) {
  const [shown, setShown] = useState(() => startOfMonth(focusDate));
  const [lastFocus, setLastFocus] = useState(focusDate);
  if (lastFocus !== focusDate) {
    // Follow the main view when it navigates.
    setLastFocus(focusDate);
    setShown(startOfMonth(focusDate));
  }
  const gridStart = startOfWeek(shown, 1);
  const month = new Date(shown).getUTCMonth();
  const weekStart = startOfWeek(focusDate, 1);
  const inRange = (d: number) =>
    view === 'week' ? d >= weekStart && d < weekStart + 7 * DAY : view === 'day' ? sameDay(d, focusDate) : false;

  return (
    <section className="mini" aria-label="Date picker">
      <div className="mini-head">
        <span className="mini-title" aria-live="polite">
          {formatMonthYear(shown)}
        </span>
        <button type="button" className="icon-btn sm" onClick={() => setShown(addMonths(shown, -1))} aria-label="Previous month">
          <ChevronLeft width={16} height={16} />
        </button>
        <button type="button" className="icon-btn sm" onClick={() => setShown(addMonths(shown, 1))} aria-label="Next month">
          <ChevronRight width={16} height={16} />
        </button>
      </div>
      <div className="mini-grid" role="grid">
        <div className="mini-row" role="row">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
            <span key={i} className="mini-wd" role="columnheader">
              {l}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, w) => (
          <div className="mini-row" role="row" key={w}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(gridStart, w * 7 + i);
              const cls = [
                'mini-day',
                new Date(d).getUTCMonth() !== month ? 'is-outside' : '',
                sameDay(d, now) ? 'is-today' : '',
                sameDay(d, focusDate) ? 'is-focus' : '',
                inRange(d) ? 'is-range' : '',
              ].join(' ');
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  className={cls}
                  onClick={() => onPick(d)}
                  aria-label={formatLongDate(d)}
                  aria-current={sameDay(d, now) ? 'date' : undefined}
                >
                  {new Date(d).getUTCDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
