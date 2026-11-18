export interface ToastData {
  id: number;
  message: string;
  undoable: boolean;
}

export function Toast({ toast, onUndo, onDismiss }: { toast: ToastData | null; onUndo: () => void; onDismiss: () => void }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undoable && (
            <button type="button" className="toast-btn" onClick={onUndo}>
              Undo
            </button>
          )}
          <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
