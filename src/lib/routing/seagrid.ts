// Sea routing on a raster of the coastline.
//
// A passage between two harbours should go around land ("Ystad, around Falsterbo"), so distances are
// measured along a water route, not the great circle. We rasterise the Natural Earth land polygons onto
// a local grid, run Dijkstra/A* over water cells (16-neighbour moves, a small cost for hugging the coast),
// then pull the cell path tight with line-of-sight checks and measure it on the sphere.

import { distanceNm, routeLength, type LonLat } from '../geo';
import type { LandPolygon } from './land';

export interface Grid {
  w: number;
  h: number;
  lonMin: number;
  latMax: number;
  dLon: number;
  dLat: number;
  /** 1 = land */
  land: Uint8Array;
  /** chebyshev distance to land in cells, capped at 4 (0 = land) */
  coast: Uint8Array;
  /** horizontal cell width in nm per row */
  rowWidthNm: Float64Array;
  cellNm: number;
}

const LAT_LIMIT_N = 84;
const LAT_LIMIT_S = -80;

/** Build a grid centred on `center` reaching `halfNmX`/`halfNmY` either side, with square-ish cells of `cellNm`. */
export function buildGrid(land: LandPolygon[], center: LonLat, halfNmX: number, halfNmY: number, cellNm: number): Grid {
  const cosLat = Math.max(0.05, Math.cos((center[1] * Math.PI) / 180));
  const dLat = cellNm / 60;
  const dLon = cellNm / (60 * cosLat);
  let h = Math.max(8, Math.ceil((2 * halfNmY) / cellNm));
  const w = Math.max(8, Math.ceil((2 * halfNmX) / cellNm / 1)); // already in nm at centre latitude
  let latMax = center[1] + (h / 2) * dLat;
  if (latMax > LAT_LIMIT_N) latMax = LAT_LIMIT_N;
  let latMin = latMax - h * dLat;
  if (latMin < LAT_LIMIT_S) {
    latMin = LAT_LIMIT_S;
    h = Math.max(8, Math.floor((latMax - latMin) / dLat));
  }
  const lonMin = center[0] - (w / 2) * dLon;

  const grid: Grid = {
    w,
    h,
    lonMin,
    latMax,
    dLon,
    dLat,
    land: new Uint8Array(w * h),
    coast: new Uint8Array(w * h),
    rowWidthNm: new Float64Array(h),
    cellNm,
  };
  for (let j = 0; j < h; j++) {
    const lat = latMax - (j + 0.5) * dLat;
    grid.rowWidthNm[j] = dLon * 60 * Math.cos((lat * Math.PI) / 180);
  }
  rasterize(grid, land);
  computeCoastDistance(grid);
  return grid;
}

function rasterize(g: Grid, land: LandPolygon[]) {
  const lonMax = g.lonMin + g.w * g.dLon;
  const latMin = g.latMax - g.h * g.dLat;
  const rows = new Map<number, number[]>();
  for (const poly of land) {
    for (const offset of [-360, 0, 360]) {
      const [w, s, e, n] = poly.bbox;
      if (e + offset < g.lonMin || w + offset > lonMax || n < latMin || s > g.latMax) continue;
      rows.clear();
      for (const ring of poly.rings) {
        for (let k = 0; k + 3 < ring.length; k += 2) {
          const x1 = ring[k] + offset;
          const y1 = ring[k + 1];
          const x2 = ring[k + 2] + offset;
          const y2 = ring[k + 3];
          if (y1 === y2) continue;
          const yLo = Math.min(y1, y2);
          const yHi = Math.max(y1, y2);
          if (yHi < latMin || yLo > g.latMax) continue;
          // rows whose centre latitude lies in [yLo, yHi)
          const jFrom = Math.max(0, Math.ceil((g.latMax - yHi) / g.dLat - 0.5));
          const jTo = Math.min(g.h - 1, Math.floor((g.latMax - yLo) / g.dLat - 0.5));
          for (let j = jFrom; j <= jTo; j++) {
            const lat = g.latMax - (j + 0.5) * g.dLat;
            if (lat < yLo || lat >= yHi) continue;
            const x = x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1);
            const col = (x - g.lonMin) / g.dLon - 0.5;
            let list = rows.get(j);
            if (!list) rows.set(j, (list = []));
            list.push(col);
          }
        }
      }
      for (const [j, xs] of rows) {
        xs.sort((a, b) => a - b);
        const base = j * g.w;
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const from = Math.max(0, Math.ceil(xs[k]));
          const to = Math.min(g.w - 1, Math.ceil(xs[k + 1]) - 1);
          for (let i = from; i <= to; i++) g.land[base + i] = 1;
        }
      }
    }
  }
}

function computeCoastDistance(g: Grid) {
  const { w, h, land, coast } = g;
  const MAX = 4;
  coast.fill(MAX);
  let frontier: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (land[i]) {
      coast[i] = 0;
      frontier.push(i);
    }
  }
  for (let d = 1; d < MAX && frontier.length; d++) {
    const next: number[] = [];
    for (const idx of frontier) {
      const x = idx % w;
      const y = (idx - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const n = yy * w + xx;
          if (coast[n] > d) {
            coast[n] = d;
            next.push(n);
          }
        }
      }
    }
    frontier = next;
  }
}

export function cellOf(g: Grid, [lon, lat]: LonLat): [number, number] {
  return [Math.floor((lon - g.lonMin) / g.dLon), Math.floor((g.latMax - lat) / g.dLat)];
}

export function centerOf(g: Grid, idx: number): LonLat {
  const x = idx % g.w;
  const y = (idx - x) / g.w;
  return [g.lonMin + (x + 0.5) * g.dLon, g.latMax - (y + 0.5) * g.dLat];
}

/** Nearest cell to a point within `maxNm` that passes `accept` (default: any water), or -1. */
export function snapToWater(g: Grid, p: LonLat, maxNm: number, accept: (idx: number) => boolean = (i) => !g.land[i]): number {
  const [cx, cy] = cellOf(g, p);
  if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return -1;
  const start = cy * g.w + cx;
  if (accept(start)) return start;
  const maxR = Math.max(1, Math.ceil(maxNm / g.cellNm));
  let best = -1;
  let bestD = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        const idx = y * g.w + x;
        if (!accept(idx)) continue;
        const d = distanceNm(p, centerOf(g, idx));
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
      }
    }
    if (best >= 0 && bestD <= r * g.cellNm) break;
  }
  return bestD <= maxNm + g.cellNm ? best : -1;
}

/**
 * Where a voyage starts: prefer open water (not hemmed in by shore cells) so a harbour basin that the
 * raster closed off doesn't trap the search. Falls back to any water.
 */
export function snapSource(g: Grid, p: LonLat, maxNm: number): number {
  const open = snapToWater(g, p, maxNm, (i) => g.coast[i] >= 2);
  return open >= 0 ? open : snapToWater(g, p, maxNm);
}

/** Nearest cell the search actually reached. */
function snapReached(field: Field, p: LonLat, maxNm: number): number {
  return snapToWater(field.grid, p, maxNm, (i) => Number.isFinite(field.dist[i]));
}

// 16-neighbourhood: 8 kings moves plus 8 knight moves, for straighter raw paths.
const MOVES: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];

const COAST_PENALTY = [0, 0.6, 0.25, 0.06, 0];

function passable(g: Grid, x: number, y: number, dx: number, dy: number): boolean {
  const { w, land } = g;
  if (land[(y + dy) * w + (x + dx)]) return false;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === 1 && ay === 1) return !land[y * w + x + dx] && !land[(y + dy) * w + x];
  if (ax === 2) {
    const sx = Math.sign(dx);
    return !land[y * w + x + sx] && !land[(y + dy) * w + x + sx];
  }
  if (ay === 2) {
    const sy = Math.sign(dy);
    return !land[(y + sy) * w + x] && !land[(y + sy) * w + x + dx];
  }
  return true;
}

/** Min-heap keyed by Float64 priorities. */
class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): [number, number] {
    const ids = this.ids;
    const keys = this.keys;
    const topId = ids[0];
    const topKey = keys[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return [topId, topKey];
  }
}

export interface Field {
  grid: Grid;
  source: number;
  dist: Float32Array;
  parent: Int32Array;
}

/**
 * Dijkstra from `source` over water. Stops expanding past `maxNm` (cost units ≈ nm).
 * With `target`, runs A* and stops when the target is settled.
 */
export function search(grid: Grid, source: number, maxNm: number, target = -1): Field {
  const { w, h, coast, rowWidthNm, dLat } = grid;
  const n = w * h;
  const dist = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heap = new Heap();
  const vNm = dLat * 60;
  let tx = 0;
  let ty = 0;
  if (target >= 0) {
    tx = target % w;
    ty = (target - tx) / w;
  }
  const heuristic = (x: number, y: number) => {
    if (target < 0) return 0;
    const dx = (x - tx) * rowWidthNm[y];
    const dy = (y - ty) * vNm;
    return Math.sqrt(dx * dx + dy * dy) * 0.999;
  };
  dist[source] = 0;
  heap.push(source, 0);
  while (heap.size) {
    const [idx] = heap.pop();
    if (done[idx]) continue;
    done[idx] = 1;
    if (idx === target) break;
    const d0 = dist[idx];
    if (d0 > maxNm) break;
    const x = idx % w;
    const y = (idx - x) / w;
    for (const [dx, dy] of MOVES) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const nIdx = yy * w + xx;
      if (done[nIdx]) continue;
      if (!passable(grid, x, y, dx, dy)) continue;
      const hx = dx * (rowWidthNm[y] + rowWidthNm[yy]) * 0.5;
      const hy = dy * vNm;
      const step = Math.sqrt(hx * hx + hy * hy) * (1 + COAST_PENALTY[coast[nIdx]]);
      const nd = d0 + step;
      if (nd < dist[nIdx]) {
        dist[nIdx] = nd;
        parent[nIdx] = idx;
        heap.push(nIdx, nd + heuristic(xx, yy));
      }
    }
  }
  return { grid, source, dist, parent };
}

function cellPath(field: Field, target: number): number[] | null {
  if (!Number.isFinite(field.dist[target])) return null;
  const path: number[] = [];
  let cur = target;
  let guard = field.grid.w * field.grid.h;
  while (cur >= 0 && guard-- > 0) {
    path.push(cur);
    if (cur === field.source) break;
    cur = field.parent[cur];
  }
  if (path[path.length - 1] !== field.source) return null;
  return path.reverse();
}

/** True when the straight segment between two cells stays on water, clear of the immediate shore. */
function lineOfSight(g: Grid, a: number, b: number, minCoast: number): boolean {
  const ax = (a % g.w) + 0.5;
  const ay = Math.floor(a / g.w) + 0.5;
  const bx = (b % g.w) + 0.5;
  const by = Math.floor(b / g.w) + 0.5;
  const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 3);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = Math.floor(ax + (bx - ax) * t);
    const y = Math.floor(ay + (by - ay) * t);
    const c = g.coast[y * g.w + x];
    if (c === 0 || c < minCoast) return false;
  }
  return true;
}

/** String-pull the raw cell path into a few straight legs. */
function smooth(g: Grid, path: number[]): number[] {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let anchor = 0;
  let i = anchor + 1;
  while (i < path.length) {
    // the shore rule relaxes where the raw path itself runs close to land (narrow sounds, harbour mouths)
    let last = i;
    for (let k = i; k < path.length; k++) {
      const minCoast = Math.min(2, g.coast[path[anchor]], g.coast[path[k]]);
      if (k === anchor + 1 || lineOfSight(g, path[anchor], path[k], minCoast)) last = k;
      else if (k - last > 40) break;
    }
    out.push(path[last]);
    anchor = last;
    i = anchor + 1;
  }
  return out;
}

export interface SeaRoute {
  route: LonLat[];
  nm: number;
}

/** Route from the field's source to `to`, starting at `from` (the exact harbour position). */
export function routeTo(field: Field, from: LonLat, to: LonLat, snapNm = 6): SeaRoute | null {
  const target = snapReached(field, to, snapNm);
  if (target < 0) return null;
  const path = cellPath(field, target);
  if (!path) return null;
  const cells = smooth(field.grid, path);
  const route: LonLat[] = [from];
  for (const c of cells) route.push(centerOf(field.grid, c));
  route.push(to);
  const clean = dedupe(route);
  return { route: clean, nm: routeLength(clean) };
}

function dedupe(route: LonLat[]): LonLat[] {
  const out: LonLat[] = [];
  for (const p of route) {
    const prev = out[out.length - 1];
    if (prev && distanceNm(prev, p) < 0.05) continue;
    out.push(p);
  }
  if (out.length === 1) out.push(route[route.length - 1]);
  return out;
}

/** Raw (unsmoothed) search distance to a point, or Infinity. Cheap — no path reconstruction. */
export function rawDistance(field: Field, to: LonLat, snapNm = 6): number {
  const target = snapReached(field, to, snapNm);
  return target < 0 ? Infinity : field.dist[target];
}

/** Unwrap `lon` onto the branch nearest `ref`, for passages across the antimeridian. */
export function unwrapNear(lon: number, ref: number): number {
  let l = lon;
  while (l - ref > 180) l -= 360;
  while (ref - l > 180) l += 360;
  return l;
}

/** Choose grid size for a field of radius R nm. */
export function fieldCellNm(radiusNm: number): number {
  return Math.max(0.35, (2 * radiusNm) / 700);
}

/** Point-to-point route in its own grid; retries with a wider box when land forces a long detour. */
export function routeBetween(land: LandPolygon[], from: LonLat, toRaw: LonLat): SeaRoute | null {
  const to: LonLat = [unwrapNear(toRaw[0], from[0]), toRaw[1]];
  const direct = distanceNm(from, to);
  const mid: LonLat = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const cosLat = Math.max(0.1, Math.cos((mid[1] * Math.PI) / 180));
  const spanX = Math.abs(to[0] - from[0]) * 60 * cosLat;
  const spanY = Math.abs(to[1] - from[1]) * 60;
  for (const [factor, extra] of [
    [0.35, 30],
    [1.2, 200],
    [3, 900],
  ]) {
    const halfX = spanX / 2 + Math.max(spanX, spanY) * factor + extra;
    const halfY = spanY / 2 + Math.max(spanX, spanY) * factor + extra;
    const cell = Math.max(0.35, (2 * Math.max(halfX, halfY)) / 800);
    const grid = buildGrid(land, mid, halfX, halfY, cell);
    const s = snapSource(grid, from, 6 + cell);
    const t = snapSource(grid, to, 6 + cell);
    if (s < 0 || t < 0) return null;
    const field = search(grid, s, Infinity, t);
    const r = routeTo(field, from, to, 6 + cell);
    if (r) return r;
    if (direct > 8000) break;
  }
  return null;
}
