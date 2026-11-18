import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, createHistory, pushHistory, redo, undo } from '../src/lib/history';

describe('undo / redo history', () => {
  it('undoes and redoes in order with labels', () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, 'one');
    h = pushHistory(h, 2, 'two');
    const u1 = undo(h)!;
    expect(u1.history.present).toBe(1);
    expect(u1.label).toBe('two');
    const u2 = undo(u1.history)!;
    expect(u2.history.present).toBe(0);
    expect(undo(u2.history)).toBeNull();
    const r1 = redo(u2.history)!;
    expect(r1.history.present).toBe(1);
    expect(r1.label).toBe('one');
    expect(redo(r1.history)!.history.present).toBe(2);
  });

  it('clears the redo stack on a new change', () => {
    let h = pushHistory(pushHistory(createHistory('a'), 'b', 'b'), 'c', 'c');
    h = undo(h)!.history;
    h = pushHistory(h, 'd', 'd');
    expect(h.future).toHaveLength(0);
    expect(redo(h)).toBeNull();
  });

  it('ignores no-op changes and caps its size', () => {
    let h = createHistory(0);
    expect(pushHistory(h, 0, 'noop')).toBe(h);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = pushHistory(h, i, `#${i}`);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
