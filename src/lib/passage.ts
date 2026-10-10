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

// Every planner here works in `reachNm`: how far one watch carries the boat (watch length × speed).

/** How far to look for harbours for a watch that reaches `reachNm`. */
export function exploreRadius(reachNm: number) {
  return Math.min(600, Math.max(45, reachNm * 2.3 + 12));
}

export function exploreBand(reachNm: number): [number, number] {
  return [Math.max(2, reachNm * 0.45), reachNm * 2.25 + 4];
}

function pick(cands: Destination[], origin: LonLat, n: number, score: (d: Destination) => number, reachNm: number): Destination[] {
  const sorted = [...cands].sort((a, b) => score(a) - score(b));
  const chosen: Destination[] = [];
  const bearingOf = (d: Destination) => bearing(origin, [d.port.lon, d.port.lat]);
  // harbours closer together than this count as the same choice
  const apart = Math.min(6, Math.max(1, reachNm * 0.2));
  // first pass: spread the choices around the compass
  for (const c of sorted) {
    if (chosen.length >= n) break;
    const b = bearingOf(c);
    const close = chosen.some((o) => {
      const diff = Math.abs(((bearingOf(o) - b + 540) % 360) - 180);
      return diff < 28 || distanceNm([o.port.lon, o.port.lat], [c.port.lon, c.port.lat]) < apart;
    });
    if (!close) chosen.push(c);
  }
  for (const c of sorted) {
    if (chosen.length >= n) break;
    if (!chosen.includes(c) && !chosen.some((o) => distanceNm([o.port.lon, o.port.lat], [c.port.lon, c.port.lat]) < apart / 2)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.nm - b.nm);
}

/** Lower is better: closeness to one watch's reach, then harbour size. */
export function oneWatchScore(d: Destination, reachNm: number): number {
  return Math.abs(d.nm - reachNm) / reachNm + (d.port.size === 1 ? 0.45 : (6 - d.port.size) * 0.04);
}

/** Split routed harbours into "reach in one watch" (3) and "longer passages" (2). */
export function suggest(
  routed: RoutedPort[],
  ports: PortIndex,
  origin: LonLat,
  reachNm: number,
  excludeId: string | null,
  visited: Set<string>,
): { one: Destination[]; longer: Destination[] } {
  const all: Destination[] = [];
  for (const r of routed) {
    const port = ports.byId.get(r.id);
    if (!port || port.id === excludeId || r.nm < 2) continue;
    all.push({ port, nm: r.nm, route: r.route, watches: watchesNeeded(r.nm, reachNm) });
  }
  const W = reachNm;
  // prefer real harbours: size-1 entries are small UN/LOCODE places, used only when nothing better is near
  const sizeBonus = (d: Destination) => (d.port.size === 1 ? 0.45 : (6 - d.port.size) * 0.04) + (visited.has(d.port.id) ? 0.05 : 0);
  let oneCands = all.filter((d) => d.nm >= W * 0.7 && d.nm <= W * STRETCH);
  if (oneCands.length < 3) oneCands = all.filter((d) => d.nm <= W * STRETCH);
  const one = pick(oneCands, origin, 3, (d) => Math.abs(d.nm - W) / W + sizeBonus(d), W);
  const longerCands = all.filter((d) => d.nm > W * STRETCH && d.nm <= W * 2.25);
  const longer = pick(longerCands, origin, 2, (d) => Math.abs(d.nm - W * 1.6) / W + sizeBonus(d) * 2, W);
  return { one, longer };
}

/**
 * One far harbour for going further: several watches away (about four), a real port rather than a
 * small landing, preferably one not stamped yet and not already offered.
 */
export function farCourse(reachNm: number) {
  const W = reachNm;
  return {
    radius: Math.min(900, W * 6 * 1.1 + 20),
    band: [W * STRETCH * 1.8, W * 6 + 4] as [number, number],
    pick(routed: RoutedPort[], ports: PortIndex, origin: LonLat, visited: Set<string>, exclude: Set<string>): Destination | null {
      let best: Destination | null = null;
      let bestScore = Infinity;
      for (const r of routed) {
        const port = ports.byId.get(r.id);
        if (!port || exclude.has(port.id) || distanceNm(origin, [port.lon, port.lat]) < Math.min(5, W)) continue;
        const score = Math.abs(r.nm - W * 4) / W + (6 - port.size) * 0.15 + (visited.has(port.id) ? 0.6 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { port, nm: r.nm, route: r.route, watches: watchesNeeded(r.nm, W) };
        }
      }
      return best;
    },
  };
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
