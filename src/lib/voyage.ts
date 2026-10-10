// The watch engine. A watch is fully described by when it started and how far it is planned to sail,
// so the timer, chart position and progress can be rebuilt at any moment — after a reload, a crash,
// sleep or a reboot. Nothing counts ticks.

import { pointAlong, type LonLat } from './geo';
import type { AppState, Passage, Watch } from './types';

/** One nautical mile per focused minute. */
export const MS_PER_NM = 60_000;

/** The last watch of a passage may run up to this much longer than the chosen watch length. */
export const STRETCH = 1.25;

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function activeWatch(s: AppState): Watch | null {
  return s.watches.find((w) => w.status === 'under_way') ?? null;
}

export function passageOf(s: AppState, id: string | undefined | null): Passage | null {
  if (!id) return null;
  return s.passages.find((p) => p.id === id) ?? null;
}

/** The open passage the boat is anchored on, if it is at sea between watches. */
export function anchoredPassage(s: AppState): Passage | null {
  if (!s.boat || !('passageId' in s.boat)) return null;
  const p = passageOf(s, s.boat.passageId);
  return p && p.status === 'open' ? p : null;
}

export function boatPortId(s: AppState): string | null {
  return s.boat && 'portId' in s.boat ? s.boat.portId : null;
}

/** Where the boat is right now (between watches or under way). */
export function boatPosition(s: AppState, ports: Map<string, { lat: number; lon: number }>, now = Date.now()): LonLat | null {
  const w = activeWatch(s);
  if (w) {
    const p = passageOf(s, w.passageId);
    if (p) return pointAlong(p.route, w.startNm + progress(w, now).sailedNm).pos;
  }
  const at = anchoredPassage(s);
  if (at) return pointAlong(at.route, at.sailedNm).pos;
  const portId = boatPortId(s);
  const port = portId ? ports.get(portId) : null;
  return port ? [port.lon, port.lat] : null;
}

/** How far a watch of `watchMin` minutes takes you on a passage with `remainingNm` left. */
export function plannedNmFor(remainingNm: number, watchMin: number): number {
  return remainingNm <= watchMin * STRETCH ? remainingNm : watchMin;
}

export function watchesNeeded(nm: number, watchMin: number): number {
  return Math.max(1, Math.ceil((nm - (STRETCH - 1) * watchMin) / watchMin));
}

export interface Progress {
  /** distance sailed in this watch */
  sailedNm: number;
  elapsedMs: number;
  remainingMs: number;
  fraction: number;
  endsAt: number;
  done: boolean;
}

export function progress(w: Watch, now = Date.now()): Progress {
  const plannedMs = w.plannedNm * MS_PER_NM;
  const elapsedMs = Math.max(0, Math.min(plannedMs, now - w.startedAt));
  return {
    sailedNm: elapsedMs / MS_PER_NM,
    elapsedMs,
    remainingMs: plannedMs - elapsedMs,
    fraction: plannedMs > 0 ? elapsedMs / plannedMs : 1,
    endsAt: w.startedAt + plannedMs,
    done: now - w.startedAt >= plannedMs,
  };
}

export interface CastOffPlan {
  /** continue this open passage … */
  passageId?: string;
  /** … or start a new one */
  newPassage?: Omit<Passage, 'id' | 'sailedNm' | 'createdAt' | 'status'>;
  purposeId: string;
  watchMin: number;
  battened: boolean;
  fromLabel: string;
  toLabel: string;
}

export function castOff(s: AppState, plan: CastOffPlan, now = Date.now()): AppState {
  if (activeWatch(s)) return s;
  let passages = s.passages;
  let passage: Passage | null = null;
  if (plan.passageId) passage = passageOf(s, plan.passageId);
  if (!passage && plan.newPassage) {
    // a passage that was anchored at sea and is now left behind
    const left = anchoredPassage(s);
    passages = passages.map((p) => (left && p.id === left.id ? { ...p, status: 'abandoned' as const } : p));
    passage = { ...plan.newPassage, id: newId(), sailedNm: 0, createdAt: now, status: 'open' };
    passages = [...passages, passage];
  }
  if (!passage) return s;
  const remaining = Math.max(0, passage.nm - passage.sailedNm);
  const watch: Watch = {
    id: newId(),
    passageId: passage.id,
    purposeId: plan.purposeId,
    startNm: passage.sailedNm,
    plannedNm: plannedNmFor(remaining, plan.watchMin),
    startedAt: now,
    status: 'under_way',
    battened: plan.battened,
    heldOff: 0,
    openedAnyway: 0,
    fromLabel: plan.fromLabel,
    toLabel: plan.toLabel,
    toPortId: passage.toPortId,
    resumed: passage.sailedNm > 0.01,
  };
  return {
    ...s,
    passages,
    watches: [...s.watches, watch],
    boat: { passageId: passage.id },
    lastPurposeId: plan.purposeId,
    reviewWatchId: null,
  };
}

function visitedPorts(s: AppState): Set<string> {
  const set = new Set<string>();
  if (s.settings.homePortId) set.add(s.settings.homePortId);
  for (const p of s.passages) if (p.fromPortId) set.add(p.fromPortId);
  for (const w of s.watches) if (w.status === 'made_port') set.add(w.toPortId);
  return set;
}

/** End the active watch: on schedule (`early` false) or by dropping anchor. */
export function endWatch(s: AppState, now = Date.now(), early = false): AppState {
  const w = activeWatch(s);
  if (!w) return s;
  const p = passageOf(s, w.passageId);
  if (!p) return s;
  const prog = progress(w, now);
  const sailed = early ? prog.sailedNm : w.plannedNm;
  const at = Math.min(p.nm, w.startNm + sailed);
  const arrived = p.nm - at < 0.05;
  const status: Watch['status'] = arrived ? 'made_port' : early ? 'dropped_anchor' : 'anchored';
  const newPort = arrived && !visitedPorts(s).has(p.toPortId);
  const watch: Watch = {
    ...w,
    status,
    sailedNm: arrived ? p.nm - w.startNm : sailed,
    endedAt: early ? now : Math.min(now, prog.endsAt),
    newPort,
  };
  const passage: Passage = { ...p, sailedNm: arrived ? p.nm : at, status: arrived ? 'arrived' : 'open' };
  return {
    ...s,
    watches: s.watches.map((x) => (x.id === w.id ? watch : x)),
    passages: s.passages.map((x) => (x.id === p.id ? passage : x)),
    boat: arrived ? { portId: p.toPortId } : { passageId: p.id },
    reviewWatchId: watch.id,
  };
}

/** Land the active watch if its time has passed (e.g. the app was closed through the end). */
export function settle(s: AppState, now = Date.now()): AppState {
  const w = activeWatch(s);
  if (w && progress(w, now).done) return endWatch(s, now, false);
  return s;
}

/** The wall clock moved backwards: keep elapsed time from shrinking by moving the start back too. */
export function shiftClock(s: AppState, deltaMs: number): AppState {
  const w = activeWatch(s);
  if (!w || deltaMs === 0) return s;
  return { ...s, watches: s.watches.map((x) => (x.id === w.id ? { ...x, startedAt: x.startedAt + deltaMs } : x)) };
}

export function updateWatch(s: AppState, id: string, patch: Partial<Watch>): AppState {
  return { ...s, watches: s.watches.map((w) => (w.id === id ? { ...w, ...patch } : w)) };
}

/** Distance a finished or running watch has covered. */
export function watchNm(w: Watch, now = Date.now()): number {
  return w.status === 'under_way' ? progress(w, now).sailedNm : w.sailedNm ?? 0;
}

/** Time spent focused in a watch, in ms. */
export function watchMs(w: Watch, now = Date.now()): number {
  return watchNm(w, now) * MS_PER_NM;
}

export function lifetimeNm(s: AppState, now = Date.now()): number {
  return s.watches.reduce((sum, w) => sum + watchNm(w, now), 0);
}

/** Harbours the boat has made port in, first visit date; the home port counts from the start. */
export function portStamps(s: AppState): { portId: string; at: number; home: boolean }[] {
  const out = new Map<string, { portId: string; at: number; home: boolean }>();
  const home = s.settings.homePortId;
  if (home) out.set(home, { portId: home, at: 0, home: true });
  const sorted = [...s.watches].filter((w) => w.status === 'made_port').sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  for (const w of sorted) if (!out.has(w.toPortId)) out.set(w.toPortId, { portId: w.toPortId, at: w.endedAt ?? w.startedAt, home: false });
  return [...out.values()];
}
