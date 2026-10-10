// Spherical geometry for routes. Coordinates are [lon, lat] in degrees, like GeoJSON.
// Longitudes along a route may run past ±180 so a passage across the antimeridian stays continuous.

export type LonLat = [number, number];

export const EARTH_NM = 3440.065; // mean Earth radius in nautical miles

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function distanceNm(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing from a to b, 0–360°. */
export function bearing(a: LonLat, b: LonLat): number {
  const φ1 = a[1] * RAD;
  const φ2 = b[1] * RAD;
  const Δλ = (b[0] - a[0]) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

/** Point a fraction f of the way along the great circle from a to b. */
export function interpolate(a: LonLat, b: LonLat, f: number): LonLat {
  if (f <= 0) return [a[0], a[1]];
  if (f >= 1) return [b[0], b[1]];
  const d = distanceNm(a, b) / EARTH_NM;
  if (d < 1e-9) return [a[0], a[1]];
  const φ1 = a[1] * RAD;
  const λ1 = a[0] * RAD;
  const φ2 = b[1] * RAD;
  const λ2 = b[0] * RAD;
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * DEG;
  let lon = Math.atan2(y, x) * DEG;
  // Keep the longitude on the same "unwrapped" branch as the endpoints.
  const ref = a[0] + (b[0] - a[0]) * f;
  while (lon - ref > 180) lon -= 360;
  while (ref - lon > 180) lon += 360;
  return [lon, lat];
}

export function routeLength(route: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distanceNm(route[i - 1], route[i]);
  return total;
}

export interface RoutePoint {
  pos: LonLat;
  /** Heading of the leg the point sits on. */
  course: number;
  leg: number;
}

/** Position `d` nautical miles along the route (clamped). */
export function pointAlong(route: LonLat[], d: number): RoutePoint {
  if (route.length === 0) return { pos: [0, 0], course: 0, leg: 0 };
  if (route.length === 1 || d <= 0) {
    return { pos: [...route[0]] as LonLat, course: route.length > 1 ? bearing(route[0], route[1]) : 0, leg: 0 };
  }
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const leg = distanceNm(route[i - 1], route[i]);
    if (acc + leg >= d) {
      const f = leg > 0 ? (d - acc) / leg : 0;
      const pos = interpolate(route[i - 1], route[i], f);
      const ahead = interpolate(route[i - 1], route[i], Math.min(1, f + 0.001));
      const course = distanceNm(pos, ahead) > 1e-6 ? bearing(pos, ahead) : bearing(route[i - 1], route[i]);
      return { pos, course, leg: i - 1 };
    }
    acc += leg;
  }
  const n = route.length;
  return { pos: [...route[n - 1]] as LonLat, course: bearing(route[n - 2], route[n - 1]), leg: n - 2 };
}

/** The part of the route between d0 and d1 nautical miles, densified on long legs so it draws as a curve. */
export function sliceRoute(route: LonLat[], d0: number, d1: number): LonLat[] {
  if (route.length < 2 || d1 <= d0) return [];
  const out: LonLat[] = [pointAlong(route, d0).pos];
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const leg = distanceNm(route[i - 1], route[i]);
    const end = acc + leg;
    if (end > d0 && acc < d1) {
      // densify long legs (great-circle arcs)
      const steps = Math.max(1, Math.ceil(leg / 60));
      for (let s = 1; s <= steps; s++) {
        const at = acc + (leg * s) / steps;
        if (at <= d0) continue;
        if (at >= d1) break;
        out.push(interpolate(route[i - 1], route[i], s / steps));
      }
    }
    acc = end;
    if (acc >= d1) break;
  }
  out.push(pointAlong(route, d1).pos);
  return out;
}

export function bounds(points: LonLat[]): [LonLat, LonLat] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [
    [w, s],
    [e, n],
  ];
}

function dm(value: number, pos: string, neg: string, degWidth: number): string {
  const hemi = value >= 0 ? pos : neg;
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.round((abs - deg) * 60);
  if (min === 60) {
    deg += 1;
    min = 0;
  }
  return `${String(deg).padStart(degWidth, '0')}°${String(min).padStart(2, '0')}′${hemi}`;
}

/** "55°41′N 12°39′E" */
export function formatPosition([lon, lat]: LonLat): string {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return `${dm(lat, 'N', 'S', 2)} ${dm(l, 'E', 'W', 2)}`;
}

/** Compass course with leading zeros: "092°" */
export function formatCourse(deg: number): string {
  return `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(deg: number): string {
  return POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function normalizeLon(lon: number): number {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}
