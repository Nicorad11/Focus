// App state: one JSON document in localStorage, shared live between windows (main, mini window,
// tray flyout, shield) through BroadcastChannel and the storage event.

import { useSyncExternalStore } from 'react';
import { DEFAULT_PURPOSES, DEFAULT_SETTINGS, initialState } from './defaults';
import type { AppState } from './types';

const KEY = 'leeward:state:v1';
const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leeward') : null;

function migrate(raw: unknown): AppState {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<AppState>;
  return {
    ...base,
    ...s,
    settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) },
    purposes: s.purposes?.length ? s.purposes : structuredClone(DEFAULT_PURPOSES),
    passages: s.passages ?? [],
    watches: s.watches ?? [],
    v: 1,
  };
}

function read(): AppState {
  try {
    const text = localStorage.getItem(KEY);
    return text ? migrate(JSON.parse(text)) : initialState();
  } catch {
    return initialState();
  }
}

let state: AppState = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked: the session still works in memory
  }
}

export function getState(): AppState {
  return state;
}

export function setState(next: AppState | ((s: AppState) => AppState)) {
  const value = typeof next === 'function' ? next(state) : next;
  if (value === state) return;
  state = value;
  persist();
  channel?.postMessage({ type: 'state', state });
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(state),
  );
}

/** Replace everything (restore from a backup file). */
export function replaceState(raw: unknown) {
  setState(migrate(raw));
}

export function resetState() {
  setState(initialState());
}

channel?.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'state') {
    state = migrate(e.data.state);
    emit();
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = migrate(JSON.parse(e.newValue));
        emit();
      } catch {
        /* ignore */
      }
    }
  });
}
