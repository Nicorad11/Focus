// Coastline data for the chart.
//
// Indexing the full 1:10m coastline (≈450k vertices) takes MapLibre seconds, so the chart draws the
// light 1:50m coastline when zoomed out, and at harbour scale swaps in 1:10m detail clipped to the
// region around the view. Polygons feed the land fill; the same rings clipped as polylines feed the
// shore strokes, so clipping never draws a false coast along the region's edge.

import { decodeLand, landToGeoJSON, type LandFile, type LandPolygon } from '../../lib/routing/land';

function fetchLand(name: string): Promise<LandPolygon[]> {
  return fetch(new URL(`data/${name}`, document.baseURI))
    .then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json() as Promise<LandFile>;
    })
    .then(decodeLand);
}

let lo: Promise<GeoJSON.FeatureCollection> | null = null;
let hi: Promise<LandPolygon[]> | null = null;

export function lowDetailLand(): Promise<GeoJSON.FeatureCollection> {
  lo ??= fetchLand('land50.json').then(landToGeoJSON);
  return lo;
}

export function highDetailLand(): Promise<LandPolygon[]> {
  hi ??= fetchLand('land.json');
  return hi;
}

export type BBox = [number, number, number, number];

/** Sutherland–Hodgman: clip one closed ring (flat lon/lat array) to a rectangle. */
function clipRing(ring: Float64Array, off: number, [w, s, e, n]: BBox): number[] {
  let pts: number[] = [];
  for (let i = 0; i < ring.length; i += 2) pts.push(ring[i] + off, ring[i + 1]);
  const edges: [number, boolean, number][] = [
    [0, true, w],
    [0, false, e],
    [1, true, s],
    [1, false, n],
  ];
  for (const [axis, isMin, v] of edges) {
    if (pts.length < 6) return [];
    const out: number[] = [];
    const inside = (x: number, y: number) => {
      const c = axis === 0 ? x : y;
      return isMin ? c >= v : c <= v;
    };
    const cross = (x1: number, y1: number, x2: number, y2: number) => {
      const t = axis === 0 ? (v - x1) / (x2 - x1) : (v - y1) / (y2 - y1);
      return axis === 0 ? [v, y1 + t * (y2 - y1)] : [x1 + t * (x2 - x1), v];
    };
    const n2 = pts.length;
    for (let i = 0; i < n2; i += 2) {
      const x1 = pts[(i - 2 + n2) % n2];
      const y1 = pts[(i - 1 + n2) % n2];
      const x2 = pts[i];
      const y2 = pts[i + 1];
      const in1 = inside(x1, y1);
      const in2 = inside(x2, y2);
      if (in2) {
        if (!in1) out.push(...cross(x1, y1, x2, y2));
        out.push(x2, y2);
      } else if (in1) out.push(...cross(x1, y1, x2, y2));
    }
    pts = out;
  }
  return pts;
}

/** The parts of a ring's outline that fall inside the rectangle, as open polylines. */
function clipOutline(ring: Float64Array, off: number, [w, s, e, n]: BBox): number[][][] {
  const lines: number[][][] = [];
  let cur: number[][] | null = null;
  const inside = (x: number, y: number) => x >= w && x <= e && y >= s && y <= n;
  for (let i = 0; i + 3 < ring.length; i += 2) {
    const x1 = ring[i] + off;
    const y1 = ring[i + 1];
    const x2 = ring[i + 2] + off;
    const y2 = ring[i + 3];
    const seg = clipSegment(x1, y1, x2, y2, w, s, e, n);
    if (!seg) {
      cur = null;
      continue;
    }
    if (!cur || !inside(x1, y1)) {
      cur = [[seg[0], seg[1]]];
      lines.push(cur);
    }
    cur.push([seg[2], seg[3]]);
    if (!inside(x2, y2)) cur = null;
  }
  return lines.filter((l) => l.length >= 2);
}

/** Liang–Barsky segment clip. */
function clipSegment(x1: number, y1: number, x2: number, y2: number, w: number, s: number, e: number, n: number): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const checks: [number, number][] = [
    [-dx, x1 - w],
    [dx, e - x1],
    [-dy, y1 - s],
    [dy, n - y1],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

const toPairs = (flat: number[]) => {
  const out: number[][] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  if (out.length) out.push(out[0]);
  return out;
};

export function regionLand(polys: LandPolygon[], box: BBox): { fill: GeoJSON.FeatureCollection; shore: GeoJSON.FeatureCollection } {
  const fill: GeoJSON.Feature[] = [];
  const shore: GeoJSON.Feature[] = [];
  const [w, s, e, n] = box;
  for (const p of polys) {
    for (const off of [-360, 0, 360]) {
      const [pw, ps, pe, pn] = p.bbox;
      if (pe + off < w || pw + off > e || pn < s || ps > n) continue;
      const contained = pw + off >= w && pe + off <= e && ps >= s && pn <= n;
      const rings: number[][][] = [];
      for (const [k, ring] of p.rings.entries()) {
        if (contained) {
          const pts: number[][] = [];
          for (let i = 0; i < ring.length; i += 2) pts.push([ring[i] + off, ring[i + 1]]);
          rings.push(pts);
          shore.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
        } else {
          const clipped = clipRing(ring, off, box);
          if (clipped.length >= 6 && (k === 0 || rings.length)) rings.push(toPairs(clipped));
          for (const line of clipOutline(ring, off, box)) shore.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } });
        }
      }
      if (rings.length) fill.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } });
    }
  }
  return { fill: { type: 'FeatureCollection', features: fill }, shore: { type: 'FeatureCollection', features: shore } };
}
