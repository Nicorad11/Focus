import { bearing, distanceNm, pointAlong, routeLength, type LonLat } from './geo';
import type { PortIndex } from './ports';
import type { RoutedPort } from './routing';
import type { Harbour } from './types';
import { STRETCH, watchesNeeded } from './voyage';

export interface Destination {
  port: Harbour;
  nm: number;
  route: LonLat[];
  watches: number;
}

/** How far to look for harbours for a watch of `watchMin` minutes. */
export function exploreRadius(watchMin: number) {
  return Math.min(600, Math.max(45, watchMin * 2.3 + 12));
}

export function exploreBand(watchMin: number): [number, number] {
  return [Math.max(2, watchMin * 0.45), watchMin * 2.25 + 4];
}

function pick(cands: Destination[], origin: LonLat, n: number, score: (d: Destination) => number): Destination[] {
  const sorted = [...cands].sort((a, b) => score(a) - score(b));
  const chosen: Destination[] = [];
  const bearingOf = (d: Destination) => bearing(origin, [d.port.lon, d.port.lat]);
  // first pass: spread the choices around the compass
  for (const c of sorted) {
    if (chosen.length >= n) break;
    const b = bearingOf(c);
    const close = chosen.some((o) => {
      const diff = Math.abs(((bearingOf(o) - b + 540) % 360) - 180);
      return diff < 28 || distanceNm([o.port.lon, o.port.lat], [c.port.lon, c.port.lat]) < 6;
    });
    if (!close) chosen.push(c);
  }
  for (const c of sorted) {
    if (chosen.length >= n) break;
    if (!chosen.includes(c) && !chosen.some((o) => distanceNm([o.port.lon, o.port.lat], [c.port.lon, c.port.lat]) < 3)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.nm - b.nm);
}

/** Split routed harbours into "reach in one watch" (3) and "longer passages" (2). */
/** Lower is better: closeness to the watch length, then harbour size. */
export function oneWatchScore(d: Destination, watchMin: number): number {
  return Math.abs(d.nm - watchMin) / watchMin + (d.port.size === 1 ? 0.45 : (6 - d.port.size) * 0.04);
}

export function suggest(
  routed: RoutedPort[],
  ports: PortIndex,
  origin: LonLat,
  watchMin: number,
  excludeId: string | null,
  visited: Set<string>,
): { one: Destination[]; longer: Destination[] } {
  const all: Destination[] = [];
  for (const r of routed) {
    const port = ports.byId.get(r.id);
    if (!port || port.id === excludeId || r.nm < 2) continue;
    all.push({ port, nm: r.nm, route: r.route, watches: watchesNeeded(r.nm, watchMin) });
  }
  const W = watchMin;
  // prefer real harbours: size-1 entries are small UN/LOCODE places, used only when nothing better is near
  const sizeBonus = (d: Destination) => (d.port.size === 1 ? 0.45 : (6 - d.port.size) * 0.04) + (visited.has(d.port.id) ? 0.05 : 0);
  let oneCands = all.filter((d) => d.nm >= W * 0.7 && d.nm <= W * STRETCH);
  if (oneCands.length < 3) oneCands = all.filter((d) => d.nm <= W * STRETCH);
  const one = pick(oneCands, origin, 3, (d) => Math.abs(d.nm - W) / W + sizeBonus(d));
  const longerCands = all.filter((d) => d.nm > W * STRETCH && d.nm <= W * 2.25);
  const longer = pick(longerCands, origin, 2, (d) => Math.abs(d.nm - W * 1.6) / W + sizeBonus(d) * 2);
  return { one, longer };
}

export interface Waypoint {
  port: Harbour;
  atNm: number;
}

/** Harbours the route passes close to, to name the stretch of water on the progress bar. */
export function waypointsAlong(route: LonLat[], ports: PortIndex, exclude: Set<string>, maxCount = 3): Waypoint[] {
  const total = routeLength(route);
  if (total < 8) return [];
  const samples: { p: LonLat; d: number }[] = [];
  const step = Math.max(0.5, total / 600);
  for (let d = 0; d <= total; d += step) samples.push({ p: pointAlong(route, d).pos, d });
  let w = Infinity;
  let e = -Infinity;
  let s = Infinity;
  let n = -Infinity;
  for (const { p } of samples) {
    w = Math.min(w, p[0]);
    e = Math.max(e, p[0]);
    s = Math.min(s, p[1]);
    n = Math.max(n, p[1]);
  }
  const near = Math.min(7, Math.max(3, total * 0.08));
  const pad = near / 50;
  const found: Waypoint[] = [];
  for (const port of ports.list) {
    if (exclude.has(port.id)) continue;
    if (port.lat < s - pad || port.lat > n + pad) continue;
    const plon = port.lon;
    if (plon < w - pad * 3 && plon + 360 > e + pad * 3) continue;
    if (plon > e + pad * 3 && plon - 360 < w - pad * 3) continue;
    let best = Infinity;
    let at = 0;
    for (const smp of samples) {
      const dd = distanceNm(smp.p, [plon, port.lat]);
      if (dd < best) {
        best = dd;
        at = smp.d;
      }
    }
    if (best <= near && at > total * 0.08 && at < total * 0.92) found.push({ port, atNm: at });
  }
  // keep the biggest, spaced apart
  found.sort((a, b) => b.port.size - a.port.size || a.atNm - b.atNm);
  const out: Waypoint[] = [];
  for (const f of found) {
    if (out.length >= maxCount) break;
    if (out.every((o) => Math.abs(o.atNm - f.atNm) > total * 0.16)) out.push(f);
  }
  return out.sort((a, b) => a.atNm - b.atNm);
}
