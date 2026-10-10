// Runs in the main window only: lands watches on time, sends the landing notification, keeps the
// taskbar, tray, mini window and app blocker in step with the watch, and guards against clock jumps.

import { useEffect, useRef, useState } from 'react';
import { ambience } from './audio';
import { clock } from './format';
import { platform, type BlockerConfig } from './platform';
import { navigate, type Route } from './router';
import { getState, setState, subscribe } from './store';
import { activeWatch, endWatch, passageOf, progress, settle, shiftClock, updateWatch } from './voyage';

export interface IdlePrompt {
  since: number;
}

export function useWatchKeeper(): { idle: IdlePrompt | null; dismissIdle: () => void; anchorAtIdle: () => void } {
  const prevWatchId = useRef<string | null>(activeWatch(getState())?.id ?? null);
  const clockRef = useRef({ wall: Date.now(), mono: performance.now() });
  const [idle, setIdle] = useState<IdlePrompt | null>(null);
  const idleAsked = useRef<string | null>(null);

  // land on schedule, guard the clock, keep the awareness layer current
  useEffect(() => {
    // a watch that ended while the app was closed lands right away
    setState((s) => settle(s));
    const tick = () => {
      const wall = Date.now();
      const mono = performance.now();
      const drift = wall - clockRef.current.wall - (mono - clockRef.current.mono);
      clockRef.current = { wall, mono };
      // the wall clock went backwards (manual change, time sync): don't let the watch lose time
      if (drift < -5000) setState((s) => shiftClock(s, drift));
      setState((s) => settle(s, wall));
      syncAwareness();
    };
    const t = window.setInterval(tick, 1000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // react to the watch starting or ending, whichever window did it
  useEffect(() => {
    const check = () => {
      const s = getState();
      const w = activeWatch(s);
      const prev = prevWatchId.current;
      if ((w?.id ?? null) === prev) return;
      prevWatchId.current = w?.id ?? null;
      if (w) {
        if (s.settings.miniOnTop) platform.setMini(true);
        pushBlocker();
        return;
      }
      // a watch just ended
      ambience.stop();
      platform.setMini(false);
      pushBlocker();
      const ended = s.watches.find((x) => x.id === prev);
      if (!ended) return;
      navigate('chart');
      if (ended.status === 'made_port') {
        if (s.settings.bell) ambience.bell('port');
        if (s.settings.notifyLanding) platform.notify(`Made port in ${ended.toLabel}`, `${(ended.sailedNm ?? 0).toFixed(1)} nm sailed. Log it and go ashore.`);
      } else if (ended.status === 'anchored') {
        if (s.settings.bell) ambience.bell('port');
        if (s.settings.notifyLanding) platform.notify('Watch complete', `Anchored at sea on the way to ${ended.toLabel}. Pick up from here next watch.`);
      }
    };
    check();
    return subscribe(check);
  }, []);

  // keep the blocker's list and the core's preferences current when settings change
  useEffect(() => {
    let last = '';
    let lastPrefs = '';
    const sync = () => {
      const key = JSON.stringify(blockerConfig());
      if (key !== last) {
        last = key;
        pushBlocker();
      }
      const closeToTray = getState().settings.closeToTray;
      if (String(closeToTray) !== lastPrefs) {
        lastPrefs = String(closeToTray);
        platform.setPrefs({ closeToTray });
      }
    };
    sync();
    return subscribe(sync);
  }, []);

  // events from the Rust core (blocker, tray, hotkey)
  useEffect(
    () =>
      platform.on((e) => {
        const w = activeWatch(getState());
        if (e.type === 'held-off' && w) setState((s) => updateWatch(s, w.id, { heldOff: w.heldOff + 1 }));
        else if (e.type === 'opened-anyway' && w) setState((s) => updateWatch(s, w.id, { openedAnyway: w.openedAnyway + 1 }));
        else if (e.type === 'navigate') navigate(e.route as Route);
        else if (e.type === 'drop-anchor') setState((s) => endWatch(s, Date.now(), true));
      }),
    [],
  );

  // "Still on board?" (desktop: Windows reports time since the last input anywhere)
  useEffect(() => {
    if (!platform.desktop) return;
    const t = window.setInterval(async () => {
      const s = getState();
      const w = activeWatch(s);
      const limit = s.settings.idleCheckMin;
      if (!w || !limit || idleAsked.current === w.id) return;
      const secs = await platform.idleSeconds();
      if (secs != null && secs >= limit * 60) {
        idleAsked.current = w.id;
        setIdle({ since: Math.max(w.startedAt, Date.now() - secs * 1000) });
        platform.focusMain('chart');
      }
    }, 30_000);
    return () => window.clearInterval(t);
  }, []);

  return {
    idle,
    dismissIdle: () => setIdle(null),
    anchorAtIdle: () => {
      if (idle) setState((s) => endWatch(s, idle.since, true));
      setIdle(null);
    },
  };
}

function blockerConfig(): BlockerConfig {
  const s = getState();
  const w = activeWatch(s);
  const active = !!w && w.battened;
  return {
    active,
    firmness: s.settings.firmness,
    apps: active ? s.settings.apps.filter((a) => a.enabled).map((a) => ({ name: a.name, exe: a.exe })) : [],
    sites: active ? s.settings.sites : [],
    destination: w?.toLabel ?? '',
    endsAt: w ? progress(w).endsAt : null,
    watchId: w?.id ?? null,
  };
}

function pushBlocker() {
  platform.setBlocker(blockerConfig());
}

function syncAwareness() {
  const s = getState();
  const w = activeWatch(s);
  if (!w) {
    platform.setProgress(null);
    platform.setTray(null, 'Leeward · in harbour');
    return;
  }
  const p = passageOf(s, w.passageId);
  const prog = progress(w);
  const frac = p && p.nm ? Math.min(1, (w.startNm + prog.sailedNm) / p.nm) : prog.fraction;
  const minutesLeft = Math.ceil(prog.remainingMs / 60000);
  platform.setProgress(frac);
  platform.setTray(minutesLeft, platform.desktop ? `Leeward · ${minutesLeft} min to ${w.toLabel}` : `${clock(prog.remainingMs)} to ${w.toLabel}`);
}
