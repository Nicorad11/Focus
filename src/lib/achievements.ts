// Achievements and lifetime voyage statistics.
//
// Everything here is derived from the logbook (watches and passages), never stored: old watches count
// the day this ships, a restored backup brings its achievements with it, and nothing can drift out of
// step. Each achievement is dated by the watch that earned it.

import { distanceNm, pointAlong, sliceRoute, type LonLat } from './geo';
import type { AppState, Harbour, Passage, Watch } from './types';
import { watchMs } from './voyage';

export type AchievementGroup = 'distance' | 'ports' | 'passages' | 'lines' | 'time' | 'watches' | 'discipline';

export interface AchievementDef {
  id: string;
  title: string;
  /** what it takes, in a short sentence */
  description: string;
  group: AchievementGroup;
  /** for progress bars: the number to reach, and what it counts */
  target?: number;
  unit?: 'nm' | 'ports' | 'countries' | 'hours' | 'days' | 'watches' | 'tries';
}

export const GROUP_NAMES: Record<AchievementGroup, string> = {
  distance: 'Distance',
  ports: 'Ports and flags',
  passages: 'Passages',
  lines: 'Crossing the line',
  time: 'Time at sea',
  watches: 'The ship’s watches',
  discipline: 'Battened down',
};

/** Equatorial circumference in nautical miles: 360° × 60′. */
export const AROUND_THE_WORLD_NM = 21_600;
export const ARCTIC_CIRCLE = 66.5622;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-watch', title: 'Cast off', description: 'Finish your first watch.', group: 'distance', target: 1, unit: 'watches' },
  { id: 'nm-100', title: 'Century', description: 'Sail 100 nm.', group: 'distance', target: 100, unit: 'nm' },
  { id: 'nm-500', title: 'Coastal sailor', description: 'Sail 500 nm.', group: 'distance', target: 500, unit: 'nm' },
  { id: 'nm-1000', title: 'Thousand-mile mariner', description: 'Sail 1,000 nm.', group: 'distance', target: 1000, unit: 'nm' },
  { id: 'nm-3000', title: 'An ocean’s worth', description: 'Sail 3,000 nm, about the width of the Atlantic.', group: 'distance', target: 3000, unit: 'nm' },
  { id: 'nm-world', title: 'Around the world', description: 'Sail 21,600 nm, once around the Equator.', group: 'distance', target: AROUND_THE_WORLD_NM, unit: 'nm' },

  { id: 'landfall', title: 'Landfall', description: 'Make port for the first time.', group: 'ports', target: 1, unit: 'ports' },
  { id: 'ports-5', title: 'Harbour hopper', description: 'Collect 5 port stamps.', group: 'ports', target: 5, unit: 'ports' },
  { id: 'ports-25', title: 'Port collector', description: 'Collect 25 port stamps.', group: 'ports', target: 25, unit: 'ports' },
  { id: 'foreign', title: 'Foreign waters', description: 'Make port in another country.', group: 'ports' },
  { id: 'countries-5', title: 'Five courtesy flags', description: 'Make port in 5 countries.', group: 'ports', target: 5, unit: 'countries' },

  { id: 'passage-100', title: 'Blue water', description: 'Finish a passage of 100 nm or more.', group: 'passages' },
  { id: 'passage-500', title: 'Long haul', description: 'Finish a passage of 500 nm or more.', group: 'passages' },
  { id: 'far-250', title: 'Over the horizon', description: 'Get 250 nm from your home port.', group: 'passages', target: 250, unit: 'nm' },
  { id: 'far-1000', title: 'Far from home', description: 'Get 1,000 nm from your home port.', group: 'passages', target: 1000, unit: 'nm' },

  { id: 'shellback', title: 'Shellback', description: 'Cross the Equator.', group: 'lines' },
  { id: 'bluenose', title: 'Bluenose', description: 'Cross the Arctic Circle.', group: 'lines' },
  { id: 'golden-dragon', title: 'Golden Dragon', description: 'Cross the 180th meridian.', group: 'lines' },

  { id: 'hours-10', title: 'Sea legs', description: 'Spend 10 hours at sea.', group: 'time', target: 10, unit: 'hours' },
  { id: 'hours-24', title: 'A day at sea', description: 'Spend 24 hours at sea.', group: 'time', target: 24, unit: 'hours' },
  { id: 'hours-168', title: 'A week at sea', description: 'Spend 168 hours at sea.', group: 'time', target: 168, unit: 'hours' },
  { id: 'days-30', title: 'Seasoned', description: 'Sail on 30 different days.', group: 'time', target: 30, unit: 'days' },
  { id: 'streak-7', title: 'Steady hand', description: 'Sail 7 days in a row.', group: 'time', target: 7, unit: 'days' },
  { id: 'streak-30', title: 'Fair winds', description: 'Sail 30 days in a row.', group: 'time', target: 30, unit: 'days' },

  { id: 'long-watch', title: 'Long watch', description: 'Sail 90 minutes in a single watch.', group: 'watches' },
  { id: 'middle-watch', title: 'Middle watch', description: 'Start a watch between midnight and 04:00.', group: 'watches' },
  { id: 'morning-watch', title: 'Morning watch', description: 'Start a watch between 04:00 and 08:00.', group: 'watches' },
  { id: 'dog-watch', title: 'Dog watch', description: 'Start a watch between 16:00 and 20:00.', group: 'watches' },

  { id: 'held-off-10', title: 'Iron will', description: 'Turn away 10 attempts to open a blocked app or site.', group: 'discipline', target: 10, unit: 'tries' },
  { id: 'battened-10', title: 'Battened tight', description: 'Finish 10 battened watches without opening anything anyway.', group: 'discipline', target: 10, unit: 'watches' },
];

export interface AchievementState {
  def: AchievementDef;
  earnedAt: number | null;
  /** current value toward `def.target` (capped at the target) */
  value: number;
}

export interface VoyageStats {
  totalNm: number;
  totalMs: number;
  watches: number;
  landfalls: number;
  portsStamped: number;
  countries: string[];
  /** local calendar days with at least one watch */
  daysAtSea: number;
  currentStreak: number;
  longestStreak: number;
  farthest: { nm: number; pos: LonLat; portId: string | null; at: number } | null;
  longestPassageNm: number;
  firstAt: number | null;
  /** minutes at sea per local day, keyed "YYYY-MM-DD" */
  minutesByDay: Map<string, number>;
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
}

function finished(w: Watch): boolean {
  return w.status !== 'under_way' && (w.sailedNm ?? 0) > 0.01;
}

function crossings(seg: LonLat[]): { equator: boolean; arctic: boolean; dateLine: boolean } {
  let equator = false;
  let arctic = false;
  let dateLine = false;
  for (let i = 1; i < seg.length; i++) {
    const [x0, y0] = seg[i - 1];
    const [x1, y1] = seg[i];
    if ((y0 < 0 && y1 >= 0) || (y0 >= 0 && y1 < 0)) equator = true;
    if ((y0 < ARCTIC_CIRCLE && y1 >= ARCTIC_CIRCLE) || (y0 >= ARCTIC_CIRCLE && y1 < ARCTIC_CIRCLE)) arctic = true;
    // routes keep longitudes continuous, so the date line is any multiple of 360 plus 180
    if (Math.floor((x0 + 180) / 360) !== Math.floor((x1 + 180) / 360)) dateLine = true;
  }
  return { equator, arctic, dateLine };
}

/**
 * Replay the logbook in order and work out every achievement and the lifetime statistics.
 * `ports` is needed for countries; without it country-based achievements stay locked.
 */
export function evaluate(s: AppState, ports: Map<string, Harbour> | null, now = Date.now()): { achievements: AchievementState[]; stats: VoyageStats } {
  const earned = new Map<string, number>();
  const value = new Map<string, number>();
  const earn = (id: string, at: number) => {
    if (!earned.has(id)) earned.set(id, at);
  };
  const track = (id: string, v: number, at: number) => {
    const def = ACHIEVEMENTS.find((a) => a.id === id)!;
    value.set(id, Math.max(value.get(id) ?? 0, v));
    if (def.target != null && v >= def.target) earn(id, at);
  };

  const passages = new Map<string, Passage>(s.passages.map((p) => [p.id, p]));
  const homeId = s.settings.homePortId;
  const home = homeId && ports ? ports.get(homeId) ?? null : null;
  const homeCc = home?.cc ?? null;

  const watches = s.watches.filter(finished).sort((a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt));
  let totalNm = 0;
  let totalMs = 0;
  let landfalls = 0;
  let heldOff = 0;
  let cleanBattened = 0;
  let longestPassageNm = 0;
  const stamped = new Set<string>();
  const countries = new Set<string>();
  const minutesByDay = new Map<string, number>();
  let farthest: VoyageStats['farthest'] = null;

  for (const w of watches) {
    const at = w.endedAt ?? w.startedAt;
    const nm = w.sailedNm ?? 0;
    const min = watchMs(w) / 60_000;
    totalNm += nm;
    totalMs += min * 60_000;
    const day = dayKey(w.startedAt);
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + min);

    track('first-watch', 1, at);
    for (const id of ['nm-100', 'nm-500', 'nm-1000', 'nm-3000', 'nm-world']) track(id, totalNm, at);
    for (const id of ['hours-10', 'hours-24', 'hours-168']) track(id, totalMs / 3_600_000, at);
    track('days-30', minutesByDay.size, at);

    // streak ending on this watch's day
    let streak = 1;
    for (let k = prevDayKey(day); minutesByDay.has(k); k = prevDayKey(k)) streak++;
    track('streak-7', streak, at);
    track('streak-30', streak, at);

    if (min >= 89.99) earn('long-watch', at);
    const hour = new Date(w.startedAt).getHours();
    if (hour < 4) earn('middle-watch', at);
    else if (hour < 8) earn('morning-watch', at);
    else if (hour >= 16 && hour < 20) earn('dog-watch', at);

    if (w.battened) {
      heldOff += w.heldOff;
      track('held-off-10', heldOff, at);
      if (w.openedAnyway === 0 && w.status !== 'dropped_anchor') track('battened-10', ++cleanBattened, at);
    }

    const p = passages.get(w.passageId);
    if (p) {
      const seg = sliceRoute(p.route, w.startNm, w.startNm + nm);
      const c = crossings(seg);
      if (c.equator) earn('shellback', at);
      if (c.arctic) earn('bluenose', at);
      if (c.dateLine) earn('golden-dragon', at);

      if (home) {
        const end = pointAlong(p.route, w.startNm + nm).pos;
        const fromHome = distanceNm([home.lon, home.lat], end);
        if (!farthest || fromHome > farthest.nm) farthest = { nm: fromHome, pos: end, portId: w.status === 'made_port' ? w.toPortId : null, at };
        track('far-250', fromHome, at);
        track('far-1000', fromHome, at);
      }

      if (w.status === 'made_port') {
        landfalls++;
        earn('landfall', at);
        value.set('landfall', 1);
        if (w.toPortId !== homeId) stamped.add(w.toPortId);
        track('ports-5', stamped.size, at);
        track('ports-25', stamped.size, at);
        if (p.nm > longestPassageNm) longestPassageNm = p.nm;
        if (p.nm >= 100) earn('passage-100', at);
        if (p.nm >= 500) earn('passage-500', at);
        const cc = ports?.get(w.toPortId)?.cc;
        if (cc) {
          countries.add(cc);
          if (homeCc && cc !== homeCc) earn('foreign', at);
          track('countries-5', countries.size, at);
        }
      }
    }
  }

  // streaks as of today
  const days = minutesByDay;
  let longestStreak = 0;
  for (const k of days.keys()) {
    if (days.has(prevDayKey(k))) continue;
    let n = 0;
    let cur = k;
    while (days.has(cur)) {
      n++;
      const [y, m, d] = cur.split('-').map(Number);
      cur = dayKey(new Date(y, m - 1, d + 1, 12).getTime());
    }
    longestStreak = Math.max(longestStreak, n);
  }
  const today = dayKey(now);
  let start = days.has(today) ? today : days.has(prevDayKey(today)) ? prevDayKey(today) : null;
  let currentStreak = 0;
  while (start && days.has(start)) {
    currentStreak++;
    start = prevDayKey(start);
  }

  const achievements = ACHIEVEMENTS.map((def) => ({
    def,
    earnedAt: earned.get(def.id) ?? null,
    value: Math.min(def.target ?? 1, value.get(def.id) ?? (earned.has(def.id) ? def.target ?? 1 : 0)),
  }));

  return {
    achievements,
    stats: {
      totalNm,
      totalMs,
      watches: watches.length,
      landfalls,
      portsStamped: stamped.size,
      countries: [...countries],
      daysAtSea: days.size,
      currentStreak,
      longestStreak,
      farthest,
      longestPassageNm,
      firstAt: watches.length ? watches[0].startedAt : null,
      minutesByDay,
    },
  };
}

/** Achievements this watch earned (for the "Made port" card and the landing notification). */
export function earnedBy(s: AppState, ports: Map<string, Harbour> | null, watch: Watch): AchievementDef[] {
  const at = watch.endedAt;
  if (at == null) return [];
  return evaluate(s, ports)
    .achievements.filter((a) => a.earnedAt === at)
    .map((a) => a.def);
}
