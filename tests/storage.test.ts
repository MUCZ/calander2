import { describe, expect, it } from 'vitest';
import { PREFS_KEY, STORAGE_KEY, loadData, loadPrefs, saveData, savePrefs } from '../src/lib/storage';
import { createDemoData } from '../src/lib/demo';
import { parse } from '../src/lib/time';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

describe('local persistence', () => {
  it('round-trips calendar data', () => {
    const s = memoryStorage();
    const data = createDemoData(parse('2026-11-18T12:00'));
    expect(saveData(data, s)).toBe(true);
    expect(loadData(s)).toEqual(data);
  });

  it('returns null for missing, corrupt or wrong-version data', () => {
    const s = memoryStorage();
    expect(loadData(s)).toBeNull();
    s.setItem(STORAGE_KEY, '{not json');
    expect(loadData(s)).toBeNull();
    s.setItem(STORAGE_KEY, JSON.stringify({ version: 99, events: [], calendars: [] }));
    expect(loadData(s)).toBeNull();
  });

  it('drops malformed events but keeps valid ones', () => {
    const s = memoryStorage();
    s.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        calendars: [{ id: 'a', name: 'A', color: '#000', visible: true }],
        events: [
          { id: '1', title: 'ok', start: '2026-11-18T09:00', end: '2026-11-18T10:00', allDay: false, calendarId: 'a' },
          { id: '2', title: 'bad', start: 'yesterday', end: '2026-11-18T10:00', allDay: false, calendarId: 'a' },
        ],
      }),
    );
    expect(loadData(s)!.events.map((e) => e.id)).toEqual(['1']);
  });

  it('persists view preferences', () => {
    const s = memoryStorage();
    savePrefs({ view: 'month', date: '2026-11-18' }, s);
    expect(loadPrefs(s)).toEqual({ view: 'month', date: '2026-11-18' });
    s.setItem(PREFS_KEY, JSON.stringify({ view: 'year', date: 'x' }));
    expect(loadPrefs(s)).toEqual({ view: undefined, date: undefined });
  });
});
