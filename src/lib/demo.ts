import type { CalendarData, CalendarCategory, CalendarEvent } from './types';
import { addDays, format, startOfWeek } from './time';

export const DEFAULT_CALENDARS: CalendarCategory[] = [
  { id: 'work', name: 'Work', color: '#4f5bd5', visible: true },
  { id: 'personal', name: 'Personal', color: '#2f9e6e', visible: true },
  { id: 'health', name: 'Health', color: '#d9822b', visible: true },
  { id: 'family', name: 'Family', color: '#c2417a', visible: true },
  { id: 'travel', name: 'Travel', color: '#1c8fb3', visible: true },
];

/** Palette offered when creating new calendars – muted, accessible on white. */
export const CALENDAR_COLORS = [
  '#4f5bd5',
  '#2f9e6e',
  '#d9822b',
  '#c2417a',
  '#1c8fb3',
  '#7c5cc4',
  '#b5483b',
  '#6b7a8f',
];

/**
 * Demo data anchored to the week containing `today` so it is always visible.
 * Includes overlapping events, events spanning midnight, weekly series and
 * all-day/multi-day events.
 */
export function createDemoData(today: number): CalendarData {
  const mon = startOfWeek(today, 1);
  const at = (dayOffset: number, h: number, m = 0) => format(addDays(mon, dayOffset) + (h * 60 + m) * 60_000);
  const day = (dayOffset: number) => format(addDays(mon, dayOffset));
  // Weekly series start a few weeks back so earlier weeks look lived-in too.
  const past = (dayOffset: number, h: number, m = 0) => at(dayOffset - 21, h, m);

  const events: CalendarEvent[] = [
    // --- Recurring series ---
    {
      id: 'demo-standup',
      title: 'Team standup',
      start: past(0, 9, 30),
      end: past(0, 9, 45),
      allDay: false,
      calendarId: 'work',
      location: 'Zoom',
      recurrence: { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5], interval: 1 },
    },
    {
      id: 'demo-gym',
      title: 'Strength training',
      start: past(0, 18, 0),
      end: past(0, 19, 0),
      allDay: false,
      calendarId: 'health',
      location: 'City Gym',
      recurrence: { freq: 'weekly', byWeekday: [1, 3], interval: 1 },
    },
    {
      id: 'demo-planning',
      title: 'Weekly planning',
      start: past(4, 16, 0),
      end: past(4, 17, 0),
      allDay: false,
      calendarId: 'work',
      notes: 'Review goals, groom backlog, plan next week.',
      recurrence: { freq: 'weekly', byWeekday: [5], interval: 1 },
    },
    {
      id: 'demo-night-shift',
      title: 'On-call shift',
      start: past(1, 22, 0),
      end: past(2, 2, 0),
      allDay: false,
      calendarId: 'work',
      notes: 'Recurring event that spans midnight.',
      recurrence: { freq: 'weekly', byWeekday: [2], interval: 1 },
    },
    // --- Overlapping cluster (Tuesday late morning) ---
    {
      id: 'demo-design-review',
      title: 'Design review',
      start: at(1, 10, 0),
      end: at(1, 11, 30),
      allDay: false,
      calendarId: 'work',
      location: 'Room 4B',
    },
    {
      id: 'demo-one-on-one',
      title: '1:1 with Maya',
      start: at(1, 10, 30),
      end: at(1, 11, 0),
      allDay: false,
      calendarId: 'work',
    },
    {
      id: 'demo-customer',
      title: 'Customer call — Northwind',
      start: at(1, 11, 0),
      end: at(1, 12, 0),
      allDay: false,
      calendarId: 'work',
      location: 'Phone',
    },
    // --- Overlap with a recurring event (Wednesday) ---
    {
      id: 'demo-dentist',
      title: 'Dentist',
      start: at(2, 17, 30),
      end: at(2, 18, 30),
      allDay: false,
      calendarId: 'health',
      location: 'Smile Clinic',
    },
    {
      id: 'demo-lunch',
      title: 'Lunch with Sam',
      start: at(2, 12, 30),
      end: at(2, 13, 30),
      allDay: false,
      calendarId: 'personal',
    },
    {
      id: 'demo-focus',
      title: 'Focus time',
      start: at(3, 13, 0),
      end: at(3, 16, 0),
      allDay: false,
      calendarId: 'work',
    },
    // --- Events spanning midnight ---
    {
      id: 'demo-deploy',
      title: 'Overnight release',
      start: at(3, 23, 0),
      end: at(4, 1, 30),
      allDay: false,
      calendarId: 'work',
      notes: 'Spans midnight from Thursday into Friday.',
    },
    {
      id: 'demo-redeye',
      title: 'Red-eye flight SFO → JFK',
      start: at(5, 22, 15),
      end: at(6, 6, 40),
      allDay: false,
      calendarId: 'travel',
      location: 'SFO Terminal 2',
    },
    {
      id: 'demo-dinner',
      title: 'Dinner party',
      start: at(4, 19, 30),
      end: at(4, 22, 0),
      allDay: false,
      calendarId: 'personal',
      location: "Alex's place",
    },
    {
      id: 'demo-call-mom',
      title: 'Call Mom',
      start: at(6, 11, 0),
      end: at(6, 11, 30),
      allDay: false,
      calendarId: 'family',
    },
    // --- All-day and multi-day ---
    {
      id: 'demo-offsite',
      title: 'Product offsite',
      start: day(2),
      end: day(4),
      allDay: true,
      calendarId: 'work',
      location: 'Lakeview Lodge',
    },
    {
      id: 'demo-birthday',
      title: "Grandma's birthday",
      start: day(4),
      end: day(5),
      allDay: true,
      calendarId: 'family',
    },
    {
      id: 'demo-trip',
      title: 'Weekend in New York',
      start: day(5),
      end: day(8),
      allDay: true,
      calendarId: 'travel',
    },
    {
      id: 'demo-next-week',
      title: 'Quarterly review',
      start: at(8, 14, 0),
      end: at(8, 15, 30),
      allDay: false,
      calendarId: 'work',
    },
  ];

  return { events, calendars: DEFAULT_CALENDARS.map((c) => ({ ...c })) };
}
