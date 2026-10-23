import { useEffect } from "react";

export interface ToastMessage {
  /** Changes for every toast so a repeat message restarts the timer. */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Props {
  toast: ToastMessage | null;
  onDismiss: () => void;
  /** How long the toast stays up, in ms. */
  duration?: number;
}

/** A short note at the bottom of the window, with an optional action such as Undo. */
export function Toast({ toast, onDismiss, duration = 6000 }: Props) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, duration]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span dir="auto">{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              className="toast-action"
              data-toast-action
              onClick={() => {
                toast.onAction?.();
                onDismiss();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
