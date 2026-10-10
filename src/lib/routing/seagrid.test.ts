import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeLand } from './land';
import { buildGrid, cellOf, fieldCellNm, rawDistance, routeBetween, routeTo, search, snapSource } from './seagrid';
import { distanceNm, pointAlong, routeLength, type LonLat } from '../geo';

const land = decodeLand(JSON.parse(readFileSync(new URL('../../../public/data/land.json', import.meta.url), 'utf8')));

const COPENHAGEN: LonLat = [12.599, 55.693];
const YSTAD: LonLat = [13.824, 55.424];
const KLINTHOLM: LonLat = [12.468, 54.952];
const HALMSTAD: LonLat = [12.854, 56.663];

function isWaterAll(route: LonLat[], grid: ReturnType<typeof buildGrid>) {
  // every point along the route (except the harbour ends) should be on water
  const total = routeLength(route);
  let bad = 0;
  for (let d = 1.5; d < total - 1.5; d += 0.5) {
    const p = pointAlong(route, d).pos;
    const [x, y] = cellOf(grid, p);
    if (grid.land[y * grid.w + x]) bad++;
  }
  return bad;
}

describe('sea routing', () => {
  it('rasterises land and water around the Øresund', () => {
    const grid = buildGrid(land, COPENHAGEN, 60, 60, 0.5);
    const [x, y] = cellOf(grid, [12.75, 55.85]); // middle of the Øresund
    expect(grid.land[y * grid.w + x]).toBe(0);
    const [lx, ly] = cellOf(grid, [12.2, 55.6]); // Zealand, west of Copenhagen
    expect(grid.land[ly * grid.w + lx]).toBe(1);
    const [sx, sy] = cellOf(grid, [13.5, 55.7]); // Skåne
    expect(grid.land[sy * grid.w + sx]).toBe(1);
  });

  it('routes Copenhagen to Ystad around Falsterbo', () => {
    const radius = 150;
    const grid = buildGrid(land, COPENHAGEN, radius, radius, fieldCellNm(radius));
    const src = snapSource(grid, COPENHAGEN, 6);
    expect(src).toBeGreaterThanOrEqual(0);
    const field = search(grid, src, radius * 1.2);
    const r = routeTo(field, COPENHAGEN, YSTAD)!;
    expect(r).not.toBeNull();
    // the great circle is ~44 nm across Skåne; the sea route around Falsterbo is ~60 nm
    expect(distanceNm(COPENHAGEN, YSTAD)).toBeLessThan(48);
    expect(r.nm).toBeGreaterThan(54);
    expect(r.nm).toBeLessThan(70);
    expect(isWaterAll(r.route, grid)).toBe(0);
    // the route passes south of Falsterbo (55.38N)
    expect(Math.min(...r.route.map((p) => p[1]))).toBeLessThan(55.39);
    expect(rawDistance(field, YSTAD)).toBeGreaterThan(r.nm * 0.95);
  });

  it('routes to Klintholm and Halmstad from Copenhagen', () => {
    const k = routeBetween(land, COPENHAGEN, KLINTHOLM)!;
    expect(k.nm).toBeGreaterThan(45);
    expect(k.nm).toBeLessThan(65);
    const h = routeBetween(land, COPENHAGEN, HALMSTAD)!;
    expect(h.nm).toBeGreaterThan(55);
    expect(h.nm).toBeLessThan(80);
  });

  it('finds a long ocean passage around a continent', () => {
    const rotterdam: LonLat = [4.1, 51.95];
    const genoa: LonLat = [8.92, 44.4];
    const r = routeBetween(land, rotterdam, genoa)!;
    expect(r).not.toBeNull();
    // around Spain via Gibraltar: well over 2000 nm
    expect(r.nm).toBeGreaterThan(2000);
    expect(r.nm).toBeLessThan(2800);
  });
});
