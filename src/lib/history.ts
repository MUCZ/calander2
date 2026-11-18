export interface History<T> {
  past: { state: T; label: string }[];
  present: T;
  future: { state: T; label: string }[];
  /** Label of the change that produced `present`. */
  label: string;
}

export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], label: '' };
}

export function pushHistory<T>(h: History<T>, next: T, label: string): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, { state: h.present, label: h.label }].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], label };
}

/** Returns the new history and the label of the change that was undone. */
export function undo<T>(h: History<T>): { history: History<T>; label: string } | null {
  const prev = h.past[h.past.length - 1];
  if (!prev) return null;
  return {
    history: {
      past: h.past.slice(0, -1),
      present: prev.state,
      future: [{ state: h.present, label: h.label }, ...h.future],
      label: prev.label,
    },
    label: h.label,
  };
}

export function redo<T>(h: History<T>): { history: History<T>; label: string } | null {
  const next = h.future[0];
  if (!next) return null;
  return {
    history: {
      past: [...h.past, { state: h.present, label: h.label }],
      present: next.state,
      future: h.future.slice(1),
      label: next.label,
    },
    label: next.label,
  };
}
