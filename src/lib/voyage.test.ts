import { describe, expect, it } from 'vitest';
import { initialState } from './defaults';
import type { LonLat } from './geo';
import { activeWatch, anchoredPassage, castOff, endWatch, lifetimeNm, MS_PER_NM, plannedNmFor, portStamps, progress, settle, shiftClock, watchesNeeded } from './voyage';

const route: LonLat[] = [
  [12.599, 55.693],
  [12.7, 55.4],
  [13.824, 55.424],
];

function moored() {
  const s = initialState();
  s.onboarded = true;
  s.settings.homePortId = 'cph';
  s.boat = { portId: 'cph' };
  return s;
}

const plan = (nm: number) => ({
  newPassage: { fromPortId: 'cph', fromPos: route[0], toPortId: 'yst', route, nm },
  purposeId: 'study',
  watchMin: 60,
  battened: true,
  fromLabel: 'Copenhagen',
  toLabel: 'Ystad',
});

describe('watch engine', () => {
  it('plans one watch when the passage fits, stretched up to 25%', () => {
    expect(plannedNmFor(62, 60)).toBe(62);
    expect(plannedNmFor(75, 60)).toBe(75);
    expect(plannedNmFor(88, 60)).toBe(60);
    expect(watchesNeeded(62, 60)).toBe(1);
    expect(watchesNeeded(88, 60)).toBe(2);
    expect(watchesNeeded(130, 60)).toBe(2);
    expect(watchesNeeded(140, 60)).toBe(3);
  });

  it('runs from timestamps and makes port at the end', () => {
    const t0 = Date.UTC(2026, 9, 10, 12, 12);
    let s = castOff(moored(), plan(61.7), t0);
    const w = activeWatch(s)!;
    expect(w.plannedNm).toBeCloseTo(61.7);
    expect(progress(w, t0 + 30 * MS_PER_NM).sailedNm).toBeCloseTo(30);
    // nothing happens before the end …
    expect(settle(s, t0 + 61 * MS_PER_NM)).toBe(s);
    // … and the app being closed through the end still lands the watch
    s = settle(s, t0 + 300 * MS_PER_NM);
    const done = s.watches[0];
    expect(done.status).toBe('made_port');
    expect(done.sailedNm).toBeCloseTo(61.7);
    expect(done.newPort).toBe(true);
    expect(s.boat).toEqual({ portId: 'yst' });
    expect(portStamps(s).map((p) => p.portId)).toEqual(['cph', 'yst']);
    expect(lifetimeNm(s)).toBeCloseTo(61.7);
  });

  it('dropping anchor keeps the miles and resumes from the same spot', () => {
    const t0 = Date.UTC(2026, 9, 8, 19, 30);
    let s = castOff(moored(), plan(52), t0);
    s = endWatch(s, t0 + 30 * MS_PER_NM, true);
    expect(s.watches[0].status).toBe('dropped_anchor');
    expect(s.watches[0].sailedNm).toBeCloseTo(30);
    const at = anchoredPassage(s)!;
    expect(at.sailedNm).toBeCloseTo(30);

    const t1 = t0 + 24 * 3600_000;
    s = castOff(s, { passageId: at.id, purposeId: 'work', watchMin: 60, battened: true, fromLabel: 'At sea', toLabel: 'Ystad' }, t1);
    const w = activeWatch(s)!;
    expect(w.resumed).toBe(true);
    expect(w.startNm).toBeCloseTo(30);
    expect(w.plannedNm).toBeCloseTo(22);
    s = settle(s, t1 + 23 * MS_PER_NM);
    expect(s.watches[1].status).toBe('made_port');
    expect(lifetimeNm(s)).toBeCloseTo(52);
  });

  it('a long passage anchors at sea when the watch runs out', () => {
    const t0 = Date.UTC(2026, 9, 9, 8, 0);
    let s = castOff(moored(), plan(88), t0);
    expect(activeWatch(s)!.plannedNm).toBe(60);
    s = settle(s, t0 + 61 * MS_PER_NM);
    expect(s.watches[0].status).toBe('anchored');
    expect(anchoredPassage(s)!.sailedNm).toBe(60);
  });

  it('a clock moved backwards does not take time off the watch', () => {
    const t0 = 1_000_000;
    let s = castOff(moored(), plan(61.7), t0);
    s = shiftClock(s, -10 * MS_PER_NM);
    expect(progress(activeWatch(s)!, t0).sailedNm).toBeCloseTo(10);
  });
});
