import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarData, EditScope, Occurrence, ViewMode } from './lib/types';
import { createHistory, pushHistory, redo as redoHistory, undo as undoHistory, type History } from './lib/history';
import { expandEvents, occurrenceKey, sameRecurrence } from './lib/recurrence';
import {
  createEvent,
  deleteOccurrence,
  draftFromOccurrence,
  duplicateOccurrence,
  rescheduleOccurrence,
  sameDraft,
  uid,
  updateOccurrence,
  type EventDraft,
} from './lib/operations';
import { createDemoData } from './lib/demo';
import { loadData, loadPrefs, saveData, savePrefs } from './lib/storage';
import { matchesQuery, searchOccurrences } from './lib/search';
import {
  DAY,
  HOUR,
  MINUTE,
  addDays,
  addMonths,
  dateKey,
  format,
  formatDuration,
  formatLongDate,
  formatMonthYear,
  formatRangeTitle,
  formatShortDate,
  formatTime,
  formatTimeRange,
  formatWeekdayShort,
  nowNaive,
  parse,
  startOfDay,
  startOfWeek,
} from './lib/time';
import { WeekView, type RescheduleKind } from './components/WeekView';
import { MonthView, monthGridStart } from './components/MonthView';
import { EventEditor } from './components/EventEditor';
import { ScopeDialog, type ScopeAction } from './components/ScopeDialog';
import { Sidebar } from './components/Sidebar';
import { SearchBox } from './components/SearchBox';
import { Toast, type ToastData } from './components/Toast';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { EVENT_KEYBOARD_HELP_ID } from './components/eventLabel';
import { ChevronLeft, ChevronRight, Menu, Plus, Redo, Search, Undo } from './components/Icons';

type EditorState =
  | { mode: 'create'; draft: EventDraft }
  | { mode: 'edit'; occ: Occurrence; draft: EventDraft };

interface ScopeState {
  action: ScopeAction;
  occ: Occurrence;
  thisDisabledReason?: string;
  apply: (scope: EditScope) => { data: CalendarData; focusKey?: string };
  label: string;
  closeEditor?: boolean;
  /** New times shown as a ghost in the grid while the user decides. */
  preview?: { key: string; start: number; end: number };
}

function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    onChange();
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

function describeWhen(start: number, end: number, allDay: boolean): string {
  if (allDay) {
    const days = Math.round((end - start) / DAY);
    return days > 1 ? `${formatShortDate(start)} – ${formatShortDate(end - DAY)}` : `${formatWeekdayShort(start)}, ${formatShortDate(start)}`;
  }
  return `${formatWeekdayShort(start)} ${formatShortDate(start)}, ${formatTimeRange(start, end)}`;
}

/** Key of the occurrence that represents `occ` after it was changed with `scope`. */
function keyAfterChange(next: CalendarData, occ: Occurrence, scope: EditScope, newStart: number): string {
  if (!occ.recurring) return occ.key;
  if (scope === 'this') {
    const detached = next.events.find((e) => e.seriesId === occ.event.id && e.originalStart === format(occ.originalStart));
    return detached?.id ?? occ.key;
  }
  const series = next.events.find((e) => e.id === occ.event.id);
  return series?.recurrence ? occurrenceKey(occ.event.id, newStart) : occ.event.id;
}

export default function App() {
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [history, setHistory] = useState<History<CalendarData>>(() =>
    createHistory(loadData() ?? createDemoData(nowNaive())),
  );
  const data = history.present;
  const [view, setView] = useState<ViewMode>(initialPrefs.view ?? 'week');
  const [focusDate, setFocusDate] = useState<number>(() =>
    initialPrefs.date ? parse(initialPrefs.date) : startOfDay(nowNaive()),
  );
  const [now, setNow] = useState(nowNaive);
  const compact = useMediaQuery('(max-width: 760px)');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scope, setScope] = useState<ScopeState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<{ key: string; n: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // ---------------- Persistence ----------------
  useEffect(() => {
    saveData(data);
  }, [data]);
  useEffect(() => {
    savePrefs({ view, date: dateKey(focusDate) });
  }, [view, focusDate]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(nowNaive()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!compact) setSidebarOpen(false);
  }, [compact]);

  // Restore keyboard focus to an event after it was re-rendered elsewhere.
  useEffect(() => {
    if (!pendingFocus) return;
    const el = mainRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(pendingFocus.key)}"][tabindex="0"]`) ??
      mainRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(pendingFocus.key)}"]`);
    el?.focus({ preventScroll: false });
  }, [pendingFocus, data, view, focusDate]);

  // ---------------- Derived data ----------------
  const calendarsById = useMemo(() => new Map(data.calendars.map((c) => [c.id, c])), [data.calendars]);
  const range = useMemo(() => {
    if (view === 'day') return { start: startOfDay(focusDate), days: 1 };
    if (view === 'week') return { start: startOfWeek(focusDate, 1), days: 7 };
    return { start: monthGridStart(focusDate), days: 42 };
  }, [view, focusDate]);

  const visibleEvents = useMemo(() => {
    const visible = new Set(data.calendars.filter((c) => c.visible).map((c) => c.id));
    return data.events.filter((e) => visible.has(e.calendarId));
  }, [data]);

  const occurrences = useMemo(
    () => expandEvents(visibleEvents, range.start, addDays(range.start, range.days)),
    [visibleEvents, range],
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of expandEvents(data.events, range.start, addDays(range.start, range.days))) {
      m.set(o.event.calendarId, (m.get(o.event.calendarId) ?? 0) + 1);
    }
    return m;
  }, [data.events, range]);

  const searchResults = useMemo(
    () => searchOccurrences(data.events, data.calendars, query, focusDate - 365 * DAY, focusDate + 366 * DAY, now),
    [data, query, focusDate, now],
  );

  const isDimmed = useCallback(
    (occ: Occurrence) => !!query.trim() && !matchesQuery(occ.event, query, data.calendars),
    [query, data.calendars],
  );

  // ---------------- History ----------------
  const showToast = (message: string, undoable = true) => setToast({ id: Date.now(), message, undoable });

  const commit = (next: CalendarData, label: string, focusKey?: string) => {
    setHistory((h) => pushHistory(h, next, label));
    showToast(label);
    if (focusKey) setSelectedKey(focusKey);
  };

  /** Undo/redo keep the current calendar visibility (a view preference, not content). */
  const keepVisibility = (restored: CalendarData, current: CalendarData): CalendarData => ({
    ...restored,
    calendars: restored.calendars.map((c) => {
      const cur = current.calendars.find((x) => x.id === c.id);
      return cur ? { ...c, visible: cur.visible } : c;
    }),
  });

  const undo = () => {
    const r = undoHistory(history);
    if (!r) return showToast('Nothing to undo', false);
    setHistory({ ...r.history, present: keepVisibility(r.history.present, history.present) });
    showToast(`Undid: ${r.label}`, false);
  };
  const redo = () => {
    const r = redoHistory(history);
    if (!r) return showToast('Nothing to redo', false);
    setHistory({ ...r.history, present: keepVisibility(r.history.present, history.present) });
    showToast(`Redid: ${r.label}`, false);
  };

  // ---------------- Actions ----------------
  const runScoped = (s: Omit<ScopeState, 'apply'> & { apply: ScopeState['apply'] }) => {
    if (!s.occ.recurring) {
      const r = s.apply('series');
      commit(r.data, s.label, r.focusKey);
      if (r.focusKey) setPendingFocus({ key: r.focusKey, n: Date.now() });
      if (s.closeEditor) setEditor(null);
      return;
    }
    setScope(s);
  };

  const chooseScope = (sc: EditScope) => {
    if (!scope) return;
    const r = scope.apply(sc);
    commit(r.data, `${scope.label} · ${sc === 'this' ? 'this occurrence' : 'entire series'}`, r.focusKey);
    if (scope.closeEditor) setEditor(null);
    setScope(null);
    if (r.focusKey) setPendingFocus({ key: r.focusKey, n: Date.now() });
  };

  const reschedule = (occ: Occurrence, start: number, end: number, kind: RescheduleKind) => {
    const title = occ.event.title;
    const label =
      kind === 'move'
        ? occ.event.allDay
          ? `Moved “${title}” to ${formatShortDate(start)}`
          : `Moved “${title}” to ${formatShortDate(start)}, ${formatTime(start)}`
        : occ.event.allDay
          ? `Changed “${title}” to ${Math.round((end - start) / DAY)} days`
          : `Changed “${title}” to ${formatDuration(Math.round((end - start) / MINUTE))}`;
    runScoped({
      action: kind,
      occ,
      label,
      preview: { key: occ.key, start, end },
      apply: (sc) => {
        const next = rescheduleOccurrence(data, occ, start, end, sc);
        return { data: next, focusKey: keyAfterChange(next, occ, sc, start) };
      },
    });
  };

  const defaultCalendarId = () => data.calendars.find((c) => c.visible)?.id ?? data.calendars[0]?.id ?? 'personal';

  const openCreate = (start: number, end: number, allDay: boolean) => {
    setEditor({
      mode: 'create',
      draft: { title: '', start: format(start), end: format(end), allDay, calendarId: defaultCalendarId() },
    });
  };

  const newEventAtFocus = () => {
    const today = startOfDay(now);
    const base = view === 'month' || startOfDay(focusDate) !== today ? startOfDay(focusDate) + 9 * HOUR : now;
    const start = Math.ceil(base / (30 * MINUTE)) * 30 * MINUTE;
    openCreate(start, start + HOUR, false);
  };

  const openEdit = (occ: Occurrence) => {
    setSelectedKey(occ.key);
    setEditor({ mode: 'edit', occ, draft: draftFromOccurrence(occ) });
  };

  const saveEditor = (draft: EventDraft) => {
    if (!editor) return;
    if (editor.mode === 'create') {
      const r = createEvent(data, draft);
      const key = r.event.recurrence ? occurrenceKey(r.event.id, parse(r.event.start)) : r.event.id;
      commit(r.data, `Created “${r.event.title}”`, key);
      setEditor(null);
      setPendingFocus({ key, n: Date.now() });
      return;
    }
    const { occ } = editor;
    if (sameDraft(draft, editor.draft)) {
      setEditor(null);
      return;
    }
    const ruleChanged = !sameRecurrence(draft.recurrence, occ.event.recurrence);
    runScoped({
      action: 'edit',
      occ,
      label: `Updated “${draft.title.trim() || occ.event.title}”`,
      closeEditor: true,
      thisDisabledReason: occ.recurring && ruleChanged ? 'Repeat settings can only be changed for the entire series.' : undefined,
      apply: (sc) => {
        const next = updateOccurrence(data, occ, draft, sc);
        return { data: next, focusKey: keyAfterChange(next, occ, sc, parse(draft.start)) };
      },
    });
  };

  const requestDelete = (occ: Occurrence, closeEditor = false) => {
    runScoped({
      action: 'delete',
      occ,
      label: `Deleted “${occ.event.title}”`,
      closeEditor,
      apply: (sc) => ({ data: deleteOccurrence(data, occ, sc) }),
    });
  };

  const onEventKey = (occ: Occurrence, e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      requestDelete(occ);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const step = 15 * MINUTE;
    let start = occ.start;
    let end = occ.end;
    let kind: RescheduleKind = 'move';
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
    if (view === 'month') {
      const delta = (vertical ? 7 : 1) * dir * DAY;
      start += delta;
      end += delta;
    } else if (occ.event.allDay) {
      if (vertical) return;
      if (e.shiftKey) {
        end = Math.max(start + DAY, end + dir * DAY);
        kind = 'resize';
      } else {
        start += dir * DAY;
        end += dir * DAY;
      }
    } else if (vertical && e.shiftKey) {
      end = Math.max(start + step, end + dir * step);
      kind = 'resize';
    } else if (vertical) {
      start += dir * step;
      end += dir * step;
    } else {
      start += dir * DAY;
      end += dir * DAY;
    }
    if (start === occ.start && end === occ.end) return;
    // Follow the event if it leaves the visible range.
    const rangeEnd = addDays(range.start, range.days);
    if (start >= rangeEnd || end <= range.start) setFocusDate(startOfDay(start));
    reschedule(occ, start, end, kind);
  };

  const navigate = (dir: -1 | 1) => {
    setFocusDate((d) => (view === 'month' ? addMonths(d, dir) : addDays(d, dir * (view === 'week' ? 7 : 1))));
  };
  const goToday = () => setFocusDate(startOfDay(now));
  const changeView = (v: ViewMode) => setView(v);

  const pickSearchResult = (occ: Occurrence) => {
    setFocusDate(startOfDay(occ.start));
    setSelectedKey(occ.key);
    setMobileSearch(false);
    setPendingFocus({ key: occ.key, n: Date.now() });
  };

  const toggleCalendar = (id: string) => {
    // Visibility is a view preference: update in place without an undo entry.
    setHistory((h) => ({
      ...h,
      present: { ...h.present, calendars: h.present.calendars.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)) },
    }));
  };

  const addCalendar = (name: string, color: string) => {
    commit({ ...data, calendars: [...data.calendars, { id: uid('cal'), name, color, visible: true }] }, `Added calendar “${name}”`);
  };

  const resetDemo = () => {
    commit(createDemoData(now), 'Reset demo data');
    setFocusDate(startOfDay(now));
  };

  // ---------------- Global keyboard shortcuts ----------------
  const closeSidebar = () => setSidebarOpen(false);
  const handlersRef = useRef({ undo, redo, navigate, goToday, changeView, newEventAtFocus, sidebarOpen, closeSidebar });
  handlersRef.current = { undo, redo, navigate, goToday, changeView, newEventAtFocus, sidebarOpen, closeSidebar };
  const modalOpen = !!editor || !!scope || showShortcuts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen || e.defaultPrevented) return;
      const h = handlersRef.current;
      if (e.key === 'Escape' && h.sidebarOpen) {
        h.closeSidebar();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        if (isTypingTarget(e.target)) return; // native text undo inside inputs
        e.preventDefault();
        if (e.key === 'y' || e.shiftKey) h.redo();
        else h.undo();
        return;
      }
      if (mod || e.altKey || isTypingTarget(e.target)) return;
      const onEvent = (e.target as HTMLElement | null)?.closest?.('.ev');
      switch (e.key) {
        case 'n':
        case 'c':
          e.preventDefault();
          h.newEventAtFocus();
          break;
        case 't':
          h.goToday();
          break;
        case 'd':
          h.changeView('day');
          break;
        case 'w':
          h.changeView('week');
          break;
        case 'm':
          h.changeView('month');
          break;
        case 'j':
        case 'ArrowRight':
          if (!onEvent) h.navigate(1);
          break;
        case 'k':
        case 'ArrowLeft':
          if (!onEvent) h.navigate(-1);
          break;
        case '/':
          e.preventDefault();
          setMobileSearch(true);
          window.setTimeout(() => searchRef.current?.focus(), 0);
          break;
        case '?':
          setShowShortcuts(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  // ---------------- Render ----------------
  const title =
    view === 'month'
      ? formatMonthYear(focusDate)
      : view === 'day'
        ? compact
          ? formatShortDate(focusDate)
          : formatLongDate(focusDate)
        : formatRangeTitle(range.start, addDays(range.start, 7));

  const seriesTitle =
    editor?.mode === 'edit' && editor.occ.event.seriesId
      ? data.events.find((e) => e.id === editor.occ.event.seriesId)?.title
      : undefined;

  const viewProps = {
    occurrences,
    calendars: calendarsById,
    now,
    selectedKey,
    compact,
    isDimmed,
    onSelectDay: (d: number) => {
      setFocusDate(d);
      setView('day');
    },
    onCreate: openCreate,
    onOpen: openEdit,
    onEventKey,
    onFocusEvent: (occ: Occurrence) => setSelectedKey(occ.key),
    pending: scope?.preview ?? null,
  };

  const viewSwitch = (
    <div className="seg" role="group" aria-label="View">
      {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
        <button key={v} type="button" className={view === v ? 'is-on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
          {v[0].toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );

  const undoRedo = (
    <div className="undo-redo">
      <button type="button" className="icon-btn" onClick={undo} disabled={!history.past.length} aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)">
        <Undo />
      </button>
      <button type="button" className="icon-btn" onClick={redo} disabled={!history.future.length} aria-label="Redo" title="Redo (⇧⌘Z / Ctrl+Y)">
        <Redo />
      </button>
    </div>
  );

  const searchBox = (
    <SearchBox
      ref={searchRef}
      query={query}
      results={searchResults}
      calendars={calendarsById}
      onQuery={setQuery}
      onPick={pickSearchResult}
      compact={compact}
      onCollapse={() => setMobileSearch(false)}
    />
  );

  return (
    <div className={`app ${compact ? 'is-compact' : ''}`}>
      <a className="skip-link" href="#calendar-main">
        Skip to calendar
      </a>
      <Sidebar
        focusDate={focusDate}
        view={view}
        now={now}
        calendars={data.calendars}
        counts={counts}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onPickDate={(d) => {
          setFocusDate(d);
          if (compact) setSidebarOpen(false);
        }}
        onToggleCalendar={toggleCalendar}
        onAddCalendar={addCalendar}
        onShowShortcuts={() => setShowShortcuts(true)}
        onResetDemo={resetDemo}
        onNewEvent={() => {
          setSidebarOpen(false);
          newEventAtFocus();
        }}
      />

      <div className="main" ref={mainRef}>
        <header className="toolbar">
          <div className="toolbar-row">
            {compact && (
              <button type="button" className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open calendars and date picker">
                <Menu />
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={goToday}>
              Today
            </button>
            <div className="nav-arrows">
              <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={`Previous ${view}`}>
                <ChevronLeft />
              </button>
              <button type="button" className="icon-btn" onClick={() => navigate(1)} aria-label={`Next ${view}`}>
                <ChevronRight />
              </button>
            </div>
            <h1 className="period" aria-live="polite">
              {title}
            </h1>
            <span className="spacer" />
            {!compact && searchBox}
            {compact && (
              <button
                type="button"
                className={`icon-btn ${mobileSearch || query ? 'is-on' : ''}`}
                aria-label="Search events"
                aria-expanded={mobileSearch || !!query}
                onClick={() => {
                  if (mobileSearch && !query) {
                    setMobileSearch(false);
                    return;
                  }
                  setMobileSearch(true);
                  window.setTimeout(() => searchRef.current?.focus(), 0);
                }}
              >
                <Search />
              </button>
            )}
            {!compact && undoRedo}
            {!compact && viewSwitch}
          </div>
          {compact && (mobileSearch || query) && <div className="toolbar-row">{searchBox}</div>}
          {compact && (
            <div className="toolbar-row">
              {viewSwitch}
              <span className="spacer" />
              {undoRedo}
            </div>
          )}
        </header>

        <main id="calendar-main" className="view" tabIndex={-1} aria-label={`${view} view, ${title}`}>
          {view === 'month' ? (
            <MonthView {...viewProps} focusDate={focusDate} onReschedule={reschedule} />
          ) : (
            <WeekView {...viewProps} rangeStart={range.start} dayCount={range.days} onReschedule={reschedule} />
          )}
        </main>
      </div>

      {compact && (
        <button type="button" className="fab" onClick={newEventAtFocus} aria-label="New event">
          <Plus width={24} height={24} />
        </button>
      )}

      <p id={EVENT_KEYBOARD_HELP_ID} className="sr-only">
        Press Enter to edit. Arrow keys move the event, Shift plus arrow keys change its duration, Delete removes it.
      </p>

      {editor && (
        <EventEditor
          key={editor.mode === 'edit' ? editor.occ.key : 'new'}
          mode={editor.mode}
          occ={editor.mode === 'edit' ? editor.occ : undefined}
          initial={editor.draft}
          calendars={data.calendars}
          seriesTitle={seriesTitle}
          onSave={saveEditor}
          onClose={() => setEditor(null)}
          onDelete={editor.mode === 'edit' ? () => requestDelete(editor.occ, true) : undefined}
          onDuplicate={
            editor.mode === 'edit'
              ? () => {
                  const r = duplicateOccurrence(data, editor.occ);
                  commit(r.data, `Duplicated “${editor.occ.event.title}”`, r.event.id);
                  setEditor(null);
                }
              : undefined
          }
        />
      )}

      {scope && (
        <ScopeDialog
          action={scope.action}
          title={scope.occ.event.title}
          occurrenceDate={formatLongDate(scope.occ.originalStart)}
          thisDisabledReason={scope.thisDisabledReason}
          change={
            scope.preview
              ? { from: describeWhen(scope.occ.start, scope.occ.end, scope.occ.event.allDay), to: describeWhen(scope.preview.start, scope.preview.end, scope.occ.event.allDay) }
              : undefined
          }
          onChoose={chooseScope}
          onCancel={() => setScope(null)}
        />
      )}

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      <Toast toast={toast} onUndo={undo} onDismiss={() => setToast(null)} />
    </div>
  );
}
