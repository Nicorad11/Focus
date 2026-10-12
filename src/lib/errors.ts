// A small log of the errors Leeward ran into on this device, so a crash can be reported from
// Settings → About. Nothing leaves the device unless the user copies it.

const KEY = 'leeward:errors';
const MAX = 20;

export interface LoggedError {
  at: number;
  area: string;
  message: string;
  stack?: string;
  componentStack?: string;
  route: string;
  version: string;
}

const VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';

export function errorLog(): LoggedError[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function recordError(area: string, error: unknown, componentStack?: string) {
  const e = error instanceof Error ? error : new Error(String(error));
  console.error(`[leeward:${area}]`, e, componentStack ?? '');
  const entry: LoggedError = {
    at: Date.now(),
    area,
    message: e.message || String(error),
    stack: e.stack?.slice(0, 4000),
    componentStack: componentStack?.slice(0, 2000),
    route: location.hash,
    version: VERSION,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify([...errorLog(), entry].slice(-MAX)));
  } catch {
    // storage full or blocked
  }
}

export function clearErrors() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function errorReport(): string {
  const lines = [`Leeward ${VERSION} · ${navigator.userAgent}`, ''];
  for (const e of errorLog()) {
    lines.push(`${new Date(e.at).toISOString()} [${e.area}] ${e.route} ${e.message}`);
    if (e.stack) lines.push(e.stack);
    if (e.componentStack) lines.push('Components:' + e.componentStack);
    lines.push('');
  }
  return lines.join('\n');
}

/** Errors outside React rendering (timers, promises) don't blank the window, but are worth keeping. */
export function watchGlobalErrors() {
  window.addEventListener('error', (e) => {
    // resource load errors have no `error`; ResizeObserver loop notices are harmless
    if (!e.error || /ResizeObserver loop/.test(e.message)) return;
    recordError('window', e.error);
  });
  window.addEventListener('unhandledrejection', (e) => recordError('promise', e.reason));
}

/**
 * Last resort when React had nothing left to draw: put the boot screen's "Reload" card back
 * (styles live in index.html) so the window is never just an empty colour.
 */
export function showFatal(container: HTMLElement, message: string) {
  if (container.childElementCount) return;
  const boot = document.createElement('div');
  boot.className = 'boot';
  boot.setAttribute('role', 'alert');
  const card = document.createElement('div');
  card.className = 'boot-stuck';
  const title = document.createElement('strong');
  title.textContent = 'Leeward ran into a problem.';
  const detail = document.createElement('span');
  detail.className = 'boot-detail';
  detail.textContent = message;
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'boot-reload';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => location.reload());
  card.append(title, detail, reload);
  boot.append(card);
  container.append(boot);
}
