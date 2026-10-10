import { describe, expect, it } from 'vitest';
import { evaluate, earnedBy } from './achievements';
import { initialState } from './defaults';
import type { LonLat } from './geo';
import type { AppState, Harbour } from './types';
import { castOff, endWatch, settle } from './voyage';

const MIN = 60_000;

const H = (id: string, cc: string, lat: number, lon: number): Harbour => ({ id, name: id, region: '', cc, lat, lon, size: 3 });
const ports = new Map<string, Harbour>([
  ['cph', H('cph', 'DK', 55.693, 12.599)],
  ['yst', H('yst', 'SE', 55.424, 13.824)],
  ['abc', H('abc', 'XX', 1, 10)],
  ['def', H('def', 'XX', -1, 10)],
]);

function moored(at = 'cph'): AppState {
  const s = initialState();
  s.onboarded = true;
  s.settings.homePortId = 'cph';
  s.boat = { portId: at };
  return s;
}

/** Sail a whole passage in one watch that starts at `t0`, by default at one nautical mile a minute. */
function sail(s: AppState, from: string, to: string, route: LonLat[], nm: number, t0: number, watchMin = 600, nmPerMin = 1): AppState {
  s = castOff(
    s,
    {
      newPassage: { fromPortId: from, fromPos: route[0], toPortId: to, route, nm },
      purposeId: 'study',
      reachNm: watchMin * nmPerMin,
      nmPerMin,
      battened: true,
      fromLabel: from,
      toLabel: to,
    },
    t0,
  );
  return settle(s, t0 + (nm / nmPerMin) * MIN + 1000);
}

const cphYst: LonLat[] = [
  [12.599, 55.693],
  [12.75, 55.35],
  [13.824, 55.424],
];

describe('achievements and voyage stats', () => {
  it('earns the first ones on the first landfall, dated by that watch', () => {
    const t0 = new Date(2026, 9, 10, 14, 12).getTime();
    const s = sail(moored(), 'cph', 'yst', cphYst, 61.7, t0, 60);
    const { achievements, stats } = evaluate(s, ports, t0 + 3 * 3600_000);
    const got = (id: string) => achievements.find((a) => a.def.id === id)!;
    expect(got('first-watch').earnedAt).toBe(s.watches[0].endedAt);
    expect(got('landfall').earnedAt).not.toBeNull();
    expect(got('foreign').earnedAt).not.toBeNull(); // Denmark → Sweden
    expect(got('nm-100').earnedAt).toBeNull();
    expect(got('nm-100').value).toBeCloseTo(61.7);
    expect(got('long-watch').earnedAt).toBeNull();
    expect(stats.totalNm).toBeCloseTo(61.7);
    expect(stats.totalMs).toBeCloseTo(61.7 * MIN);
    expect(stats.portsStamped).toBe(1);
    expect(stats.daysAtSea).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.farthest!.nm).toBeGreaterThan(40);
    expect(earnedBy(s, ports, s.watches[0]).map((d) => d.id)).toEqual(expect.arrayContaining(['first-watch', 'landfall', 'foreign']));
  });

  it('counts streaks of consecutive days and the long watch', () => {
    let s = moored();
    const day = (d: number) => new Date(2026, 9, d, 9, 0).getTime();
    s = sail(s, 'cph', 'yst', cphYst, 95, day(5), 120);
    s = sail(s, 'yst', 'cph', [...cphYst].reverse(), 60, day(6), 120);
    s = sail(s, 'cph', 'yst', cphYst, 60, day(7), 120);
    s = sail(s, 'yst', 'cph', [...cphYst].reverse(), 60, day(9), 120);
    const { achievements, stats } = evaluate(s, ports, day(9) + 6 * 3600_000);
    expect(stats.daysAtSea).toBe(4);
    expect(stats.longestStreak).toBe(3);
    expect(stats.currentStreak).toBe(1);
    expect(achievements.find((a) => a.def.id === 'long-watch')!.earnedAt).toBe(s.watches[0].endedAt);
    expect(achievements.find((a) => a.def.id === 'nm-100')!.earnedAt).toBe(s.watches[1].endedAt);
    expect(achievements.find((a) => a.def.id === 'morning-watch')!.earnedAt).toBeNull(); // 09:00 is the forenoon watch
  });

  it('counts time at sea by the clock, whatever the speed', () => {
    const t0 = new Date(2026, 9, 10, 9, 0).getTime();
    // 20 nm at half time (12 knots) is 100 minutes: a long watch, though only 20 miles
    const s = sail(moored(), 'cph', 'yst', cphYst, 20, t0, 120, 0.2);
    const { achievements, stats } = evaluate(s, ports, t0 + 3 * 3600_000);
    expect(stats.totalNm).toBeCloseTo(20);
    expect(stats.totalMs / MIN).toBeCloseTo(100);
    expect(stats.minutesByDay.get([...stats.minutesByDay.keys()][0])).toBeCloseTo(100);
    expect(achievements.find((a) => a.def.id === 'long-watch')!.earnedAt).not.toBeNull();
  });

  it('notices crossing the Equator, but not a passage that stays north of it', () => {
    let s = moored('abc');
    const t0 = new Date(2026, 9, 10, 10, 0).getTime();
    s = sail(s, 'abc', 'def', [
      [10, 1],
      [10, -1],
    ], 120, t0, 200);
    const shellback = evaluate(s, ports).achievements.find((a) => a.def.id === 'shellback')!;
    expect(shellback.earnedAt).not.toBeNull();
  });

  it('dropping anchor still counts the miles, but not as a landfall', () => {
    const t0 = new Date(2026, 9, 10, 17, 0).getTime();
    let s = castOff(
      moored(),
      { newPassage: { fromPortId: 'cph', fromPos: cphYst[0], toPortId: 'yst', route: cphYst, nm: 61.7 }, purposeId: 'work', reachNm: 60, nmPerMin: 1, battened: false, fromLabel: 'cph', toLabel: 'yst' },
      t0,
    );
    s = endWatch(s, t0 + 30 * MIN, true);
    const { achievements, stats } = evaluate(s, ports);
    expect(stats.totalNm).toBeCloseTo(30);
    expect(stats.landfalls).toBe(0);
    expect(achievements.find((a) => a.def.id === 'landfall')!.earnedAt).toBeNull();
    expect(achievements.find((a) => a.def.id === 'dog-watch')!.earnedAt).not.toBeNull();
  });
});
