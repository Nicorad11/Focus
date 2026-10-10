import { useEffect, useState } from 'react';
import { CloseIcon } from './icons';

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

let seq = 0;
let toasts: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();

function publish() {
  for (const l of listeners) l(toasts);
}

export function toast(message: string, opts: { action?: Toast['action']; ms?: number } = {}) {
  const t: Toast = { id: ++seq, message, action: opts.action };
  toasts = [...toasts.slice(-2), t];
  publish();
  window.setTimeout(() => dismiss(t.id), opts.ms ?? 6000);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  publish();
}

export function Toasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  if (!list.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span style={{ flex: 1 }}>{t.message}</span>
          {t.action && (
            <button
              className="btn small"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn" style={{ color: '#fff', width: 36, height: 36 }} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
