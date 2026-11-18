import { useId } from 'react';
import type { EditScope } from '../lib/types';
import { Dialog } from './Dialog';
import { Repeat } from './Icons';

export type ScopeAction = 'edit' | 'move' | 'resize' | 'delete';

interface ScopeDialogProps {
  action: ScopeAction;
  title: string;
  occurrenceDate: string;
  /** When set, "This occurrence only" is disabled and this reason is shown. */
  thisDisabledReason?: string;
  /** Optional before → after description of the pending change. */
  change?: { from: string; to: string };
  onChoose: (scope: EditScope) => void;
  onCancel: () => void;
}

const VERB: Record<ScopeAction, { heading: string; verb: string }> = {
  edit: { heading: 'Save changes to a recurring event', verb: 'Save' },
  move: { heading: 'Move a recurring event', verb: 'Move' },
  resize: { heading: 'Change the duration of a recurring event', verb: 'Change' },
  delete: { heading: 'Delete a recurring event', verb: 'Delete' },
};

/** Asks whether a change applies to one occurrence or to the whole weekly series. */
export function ScopeDialog({ action, title, occurrenceDate, thisDisabledReason, change, onChoose, onCancel }: ScopeDialogProps) {
  const id = useId();
  const v = VERB[action];
  const del = action === 'delete';
  return (
    <Dialog labelledBy={`${id}-h`} describedBy={`${id}-d`} onClose={onCancel} className="scope" initialFocus=".scope-option:not([disabled])">
      <div className="scope-icon" aria-hidden="true">
        <Repeat width={20} height={20} />
      </div>
      <h2 id={`${id}-h`}>{v.heading}</h2>
      <p id={`${id}-d`} className="muted">
        “{title}” repeats every week. What should this {action === 'edit' ? 'change' : action} apply to?
      </p>
      {change && (
        <p className="scope-change">
          <span className="scope-from">{change.from}</span>
          <span aria-hidden="true">→</span>
          <span className="sr-only">to</span>
          <strong>{change.to}</strong>
        </p>
      )}
      <div className="scope-options">
        <button
          type="button"
          className="scope-option"
          disabled={!!thisDisabledReason}
          onClick={() => onChoose('this')}
        >
          <span className="scope-option-title">This occurrence only</span>
          <span className="scope-option-desc">
            {thisDisabledReason ??
              (del
                ? `Only ${occurrenceDate} is removed. Other weeks stay on the calendar.`
                : `Only ${occurrenceDate} changes. The rest of the series stays as it is.`)}
          </span>
        </button>
        <button type="button" className={`scope-option ${del ? 'is-danger' : ''}`} onClick={() => onChoose('series')}>
          <span className="scope-option-title">Entire series</span>
          <span className="scope-option-desc">
            {del
              ? 'Every occurrence of this event is deleted, including edited ones.'
              : 'Every occurrence changes, past and future.'}
          </span>
        </button>
      </div>
      <div className="scope-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
