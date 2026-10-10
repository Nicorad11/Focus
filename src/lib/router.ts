import { useSyncExternalStore } from 'react';

export type Route = 'chart' | 'logbook' | 'ports' | 'batten' | 'settings';
const ROUTES: Route[] = ['chart', 'logbook', 'ports', 'batten', 'settings'];

function parse(): { route: Route; query: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : 'chart';
  return { route, query: new URLSearchParams(qs) };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  for (const l of listeners) l();
});

export function useRoute() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export function navigate(route: Route) {
  const target = '#/' + route;
  if (location.hash !== target) location.hash = target;
}

export function href(route: Route) {
  return '#/' + route;
}
