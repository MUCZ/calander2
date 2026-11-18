import { useId, useMemo, useState } from 'react';
import type { CalendarCategory, Occurrence, WeeklyRecurrence } from '../lib/types';
import type { EventDraft } from '../lib/operations';
import { DAY, MINUTE, WEEKDAY_LETTERS, WEEKDAY_NAMES, dateKey, format, formatDuration, parse, timeKey, weekday } from '../lib/time';
import { describeRecurrence } from '../lib/recurrence';
import { Dialog } from './Dialog';
import { Close, Repeat, Trash } from './Icons';

const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

interface EventEditorProps {
  mode: 'create' | 'edit';
  occ?: Occurrence;
  initial: EventDraft;
  calendars: CalendarCategory[];
  seriesTitle?: string;
  onSave: (draft: EventDraft) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onClose: () => void;
}

interface FormState {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  calendarId: string;
  location: string;
  notes: string;
  repeat: boolean;
  byWeekday: number[];
  until: string;
}

function toForm(d: EventDraft): FormState {
  const s = parse(d.start);
  const e = parse(d.end);
  return {
    title: d.title,
    allDay: d.allDay,
    startDate: dateKey(s),
    startTime: timeKey(s),
    // All-day ends are exclusive internally but inclusive in the UI.
    endDate: dateKey(d.allDay ? e - DAY : e),
    endTime: timeKey(e),
    calendarId: d.calendarId,
    location: d.location ?? '',
    notes: d.notes ?? '',
    repeat: !!d.recurrence,
    byWeekday: d.recurrence?.byWeekday ?? [weekday(s)],
    until: d.recurrence?.until ?? '',
  };
}

function toDraft(f: FormState): { draft: EventDraft | null; error?: string } {
  if (!f.startDate || !f.endDate || (!f.allDay && (!f.startTime || !f.endTime))) {
    return { draft: null, error: 'Please enter a start and end.' };
  }
  let start: number;
  let end: number;
  if (f.allDay) {
    start = parse(f.startDate);
    end = parse(f.endDate) + DAY;
    if (end <= start) return { draft: null, error: 'The end date must be on or after the start date.' };
  } else {
    start = parse(`${f.startDate}T${f.startTime}`);
    end = parse(`${f.endDate}T${f.endTime}`);
    if (end <= start) return { draft: null, error: 'The event must end after it starts.' };
  }
  let recurrence: WeeklyRecurrence | undefined;
  if (f.repeat) {
    if (!f.byWeekday.length) return { draft: null, error: 'Choose at least one day to repeat on.' };
    if (f.until && f.until < f.startDate) return { draft: null, error: 'The repeat end date is before the start date.' };
    recurrence = { freq: 'weekly', interval: 1, byWeekday: [...f.byWeekday].sort(), ...(f.until ? { until: f.until } : {}) };
  }
  return {
    draft: {
      title: f.title,
      start: format(start),
      end: format(end),
      allDay: f.allDay,
      calendarId: f.calendarId,
      location: f.location.trim() || undefined,
      notes: f.notes.trim() || undefined,
      recurrence,
    },
  };
}

export function EventEditor({ mode, occ, initial, calendars, seriesTitle, onSave, onDelete, onDuplicate, onClose }: EventEditorProps) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [error, setError] = useState<string | undefined>();
  const id = useId();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(undefined);
  };
  const isSeries = !!occ?.recurring;
  const isDetached = !!occ?.event.seriesId;
  const calendar = calendars.find((c) => c.id === form.calendarId);

  const duration = useMemo(() => {
    const { draft } = toDraft(form);
    if (!draft || draft.allDay) return null;
    return Math.round((parse(draft.end) - parse(draft.start)) / MINUTE);
  }, [form]);

  /** Touch-friendly alternative to dragging: shift start/end by fixed amounts. */
  const nudge = (startDelta: number, endDelta: number) => {
    const { draft } = toDraft(form);
    if (!draft) return;
    const s = parse(draft.start) + startDelta;
    let e = parse(draft.end) + endDelta;
    if (e - s < (draft.allDay ? DAY : 15 * MINUTE)) return;
    if (draft.allDay) e = Math.max(e, s + DAY);
    setForm((f) => ({
      ...f,
      startDate: dateKey(s),
      startTime: timeKey(s),
      endDate: dateKey(draft.allDay ? e - DAY : e),
      endTime: timeKey(e),
    }));
    setError(undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { draft, error: err } = toDraft(form);
    if (!draft) {
      setError(err);
      return;
    }
    onSave(draft);
  };

  const toggleAllDay = (allDay: boolean) => {
    setForm((f) => {
      if (allDay === f.allDay) return f;
      if (allDay) return { ...f, allDay };
      // Switching to timed: default to 9–10am on the start date.
      return { ...f, allDay, startTime: f.startTime === '00:00' ? '09:00' : f.startTime, endDate: f.startDate, endTime: f.endTime === '00:00' ? '10:00' : f.endTime };
    });
    setError(undefined);
  };

  const step = form.allDay ? DAY : 15 * MINUTE;
  const titleId = `${id}-title`;

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      className="editor"
      // Avoid popping the on-screen keyboard when merely opening an event on touch devices.
      initialFocus={mode === 'create' || !coarsePointer() ? 'input[name=title]' : undefined}
    >
      <form onSubmit={submit} noValidate>
        <header className="editor-head" style={{ ['--c' as string]: calendar?.color ?? '#4f5bd5' }}>
          <h2 id={titleId}>{mode === 'create' ? 'New event' : 'Edit event'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </header>

        <div className="editor-body">
          {isSeries && (
            <p className="editor-note">
              <Repeat width={14} height={14} />
              <span>
                <strong>{describeRecurrence(occ!.event.recurrence)}.</strong> When you save, you'll choose whether
                the change applies to <strong>this occurrence only</strong> or the <strong>entire series</strong>.
              </span>
            </p>
          )}
          {isDetached && (
            <p className="editor-note">
              <Repeat width={14} height={14} />
              <span>
                Edited occurrence of {seriesTitle ? `“${seriesTitle}”` : 'a weekly series'}. Changes here apply to this
                occurrence only.
              </span>
            </p>
          )}

          <label className="field field-title">
            <span className="sr-only">Title</span>
            <input
              name="title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Add title"
              autoComplete="off"
            />
          </label>

          <div className="field-row">
            <label className="check">
              <input type="checkbox" checked={form.allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
              <span>All day</span>
            </label>
            {duration != null && <span className="muted small">Duration {formatDuration(duration)}</span>}
          </div>

          <fieldset className="when">
            <legend className="sr-only">Time</legend>
            <div className="when-row">
              <label className="field">
                <span className="field-label">Start date</span>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} required />
              </label>
              {!form.allDay && (
                <label className="field">
                  <span className="field-label">Start time</span>
                  <input type="time" step={900} value={form.startTime} onChange={(e) => set('startTime', e.target.value)} required />
                </label>
              )}
            </div>
            <div className="when-row">
              <label className="field">
                <span className="field-label">End date</span>
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} required />
              </label>
              {!form.allDay && (
                <label className="field">
                  <span className="field-label">End time</span>
                  <input type="time" step={900} value={form.endTime} onChange={(e) => set('endTime', e.target.value)} required />
                </label>
              )}
            </div>
          </fieldset>

          <div className="nudge">
            <div className="nudge-row" role="group" aria-labelledby={`${id}-move`}>
              <span className="field-label" id={`${id}-move`}>
                Move
              </span>
              <div className="nudge-btns">
                <button type="button" className="chip-btn" onClick={() => nudge(-DAY, -DAY)} aria-label="Move one day earlier">
                  −1 day
                </button>
                {!form.allDay && (
                  <>
                    <button type="button" className="chip-btn" onClick={() => nudge(-step, -step)} aria-label="Move 15 minutes earlier">
                      −15m
                    </button>
                    <button type="button" className="chip-btn" onClick={() => nudge(step, step)} aria-label="Move 15 minutes later">
                      +15m
                    </button>
                  </>
                )}
                <button type="button" className="chip-btn" onClick={() => nudge(DAY, DAY)} aria-label="Move one day later">
                  +1 day
                </button>
              </div>
            </div>
            <div className="nudge-row" role="group" aria-labelledby={`${id}-len`}>
              <span className="field-label" id={`${id}-len`}>
                Duration
              </span>
              <div className="nudge-btns">
                <button type="button" className="chip-btn" onClick={() => nudge(0, -step)} aria-label={form.allDay ? 'Shorten by one day' : 'Shorten by 15 minutes'}>
                  {form.allDay ? '−1 day' : '−15m'}
                </button>
                <button type="button" className="chip-btn" onClick={() => nudge(0, step)} aria-label={form.allDay ? 'Lengthen by one day' : 'Lengthen by 15 minutes'}>
                  {form.allDay ? '+1 day' : '+15m'}
                </button>
              </div>
            </div>
          </div>

          {!isDetached && (
            <div className="repeat">
              <label className="field">
                <span className="field-label">Repeat</span>
                <select
                  value={form.repeat ? 'weekly' : 'none'}
                  onChange={(e) => set('repeat', e.target.value === 'weekly')}
                >
                  <option value="none">Does not repeat</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              {form.repeat && (
                <>
                  <div className="weekday-picker" role="group" aria-label="Repeat on">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const on = form.byWeekday.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          className={`wd ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          aria-label={WEEKDAY_NAMES[d]}
                          onClick={() =>
                            set('byWeekday', on ? form.byWeekday.filter((x) => x !== d) : [...form.byWeekday, d])
                          }
                        >
                          {WEEKDAY_LETTERS[d]}
                        </button>
                      );
                    })}
                  </div>
                  <label className="field">
                    <span className="field-label">Ends on (optional)</span>
                    <input type="date" value={form.until} min={form.startDate} onChange={(e) => set('until', e.target.value)} />
                  </label>
                </>
              )}
            </div>
          )}

          <label className="field">
            <span className="field-label">Calendar</span>
            <span className="select-with-dot" style={{ ['--c' as string]: calendar?.color }}>
              <select value={form.calendarId} onChange={(e) => set('calendarId', e.target.value)}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="field">
            <span className="field-label">Location</span>
            <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Add location" />
          </label>

          <label className="field">
            <span className="field-label">Notes</span>
            <textarea value={form.notes} rows={3} onChange={(e) => set('notes', e.target.value)} placeholder="Add notes" />
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="editor-foot">
          {mode === 'edit' && onDelete && (
            <button type="button" className="btn btn-danger-ghost" onClick={onDelete}>
              <Trash width={16} height={16} /> Delete
            </button>
          )}
          {mode === 'edit' && onDuplicate && (
            <button type="button" className="btn btn-ghost hide-compact" onClick={onDuplicate}>
              Duplicate
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
