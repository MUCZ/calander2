import { Dialog } from './Dialog';
import { Close } from './Icons';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'Navigation',
    items: [
      [['T'], 'Go to today'],
      [['←', '→'], 'Previous / next period (also J / K)'],
      [['D'], 'Day view'],
      [['W'], 'Week view'],
      [['M'], 'Month view'],
      [['/'], 'Search events'],
    ],
  },
  {
    title: 'Events',
    items: [
      [['N'], 'New event (also C)'],
      [[mod, 'Z'], 'Undo'],
      [[mod, '⇧', 'Z'], 'Redo (also Ctrl + Y)'],
    ],
  },
  {
    title: 'Focused event',
    items: [
      [['Enter'], 'Open / edit'],
      [['↑', '↓'], 'Move 15 minutes (month view: a week)'],
      [['←', '→'], 'Move one day'],
      [['⇧', '↑ / ↓'], 'Shorten / lengthen by 15 minutes'],
      [['Delete'], 'Delete event'],
      [['Esc'], 'Cancel a drag in progress'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog labelledBy="shortcuts-title" onClose={onClose} className="shortcuts">
      <header className="editor-head">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Close />
        </button>
      </header>
      <div className="shortcuts-body">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.items.map(([keys, label]) => (
                <div key={label} className="shortcut-row">
                  <dt>
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
