import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A button that only acts after being held down (mouse, touch, Space or Enter).
 * The friction is the point: dropping anchor or opening a blocked app should take a moment's thought.
 */
export function HoldButton({
  ms = 2000,
  onComplete,
  className = 'btn',
  style,
  children,
  label,
  disabled,
}: {
  ms?: number;
  onComplete: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const done = useRef(onComplete);
  done.current = onComplete;

  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (disabled || timer.current != null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      done.current();
    }, ms);
  };
  useEffect(() => cancel, []);

  return (
    <button
      type="button"
      className={`${className} hold${holding ? ' holding' : ''}`}
      style={{ ...style, ['--hold-ms' as string]: `${ms}ms` }}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancel();
      }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hold-fill" aria-hidden="true" />
      {children}
    </button>
  );
}
