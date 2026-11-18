import type { CalendarData, CalendarEvent, CalendarCategory, ViewMode } from './types';

export const STORAGE_KEY = 'calander2:data:v1';
export const PREFS_KEY = 'calander2:prefs:v1';

export interface Prefs {
  view: ViewMode;
  /** YYYY-MM-DD of the focused date. */
  date?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function validEvent(e: unknown): e is CalendarEvent {
  if (!e || typeof e !== 'object') return false;
  const ev = e as Record<string, unknown>;
  if (!isStr(ev.id) || !isStr(ev.title) || !isStr(ev.calendarId)) return false;
  if (!isStr(ev.start) || !isStr(ev.end) || !DT.test(ev.start) || !DT.test(ev.end)) return false;
  if (typeof ev.allDay !== 'boolean') return false;
  if (ev.recurrence !== undefined) {
    const r = ev.recurrence as Record<string, unknown>;
    if (r.freq !== 'weekly' || !Array.isArray(r.byWeekday)) return false;
  }
  return true;
}

function validCalendar(c: unknown): c is CalendarCategory {
  if (!c || typeof c !== 'object') return false;
  const cal = c as Record<string, unknown>;
  return isStr(cal.id) && isStr(cal.name) && isStr(cal.color) && typeof cal.visible === 'boolean';
}

/** Loads persisted data; returns null when nothing (valid) is stored. */
export function loadData(storage: StorageLike | undefined = safeStorage()): CalendarData | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; events?: unknown[]; calendars?: unknown[] };
    if (parsed.version !== 1 || !Array.isArray(parsed.events) || !Array.isArray(parsed.calendars)) return null;
    const calendars = parsed.calendars.filter(validCalendar);
    if (!calendars.length) return null;
    return { events: parsed.events.filter(validEvent), calendars };
  } catch {
    return null;
  }
}

export function saveData(data: CalendarData, storage: StorageLike | undefined = safeStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...data }));
    return true;
  } catch {
    return false;
  }
}

export function loadPrefs(storage: StorageLike | undefined = safeStorage()): Partial<Prefs> {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<Prefs>;
    const view = p.view === 'day' || p.view === 'week' || p.view === 'month' ? p.view : undefined;
    const date = isStr(p.date) && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : undefined;
    return { view, date };
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Prefs, storage: StorageLike | undefined = safeStorage()): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full or unavailable – preferences are optional */
  }
}

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}
