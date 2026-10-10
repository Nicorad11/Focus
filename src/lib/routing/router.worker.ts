/// <reference lib="webworker" />
// Runs sea routing off the main thread. See seagrid.ts for the method.

import { distanceNm, type LonLat } from '../geo';
import { decodeLand, type LandFile, type LandPolygon } from './land';
import { buildGrid, fieldCellNm, routeBetween, routeTo, search, snapSource, unwrapNear, type Field } from './seagrid';
import type { RouterRequest, RouterResponse, RoutedPort } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let landPromise: Promise<LandPolygon[]> | null = null;
const fields: { key: string; origin: LonLat; radius: number; field: Field }[] = [];

function land(url: string) {
  if (!landPromise) {
    landPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`land data: HTTP ${r.status}`);
        return r.json() as Promise<LandFile>;
      })
      .then(decodeLand);
  }
  return landPromise;
}

function fieldFor(polys: LandPolygon[], origin: LonLat, radiusNm: number): Field | null {
  const hit = fields.find(
    (f) => f.radius >= radiusNm && distanceNm(f.origin, origin) < 0.01,
  );
  if (hit) return hit.field;
  const grid = buildGrid(polys, origin, radiusNm, radiusNm, fieldCellNm(radiusNm));
  const src = snapSource(grid, origin, 8);
  if (src < 0) return null;
  const field = search(grid, src, radiusNm * 1.15);
  fields.unshift({ key: `${origin.join(',')}:${radiusNm}`, origin, radius: radiusNm, field });
  fields.length = Math.min(fields.length, 4);
  return field;
}

async function handle(req: RouterRequest): Promise<RouterResponse> {
  const polys = await land(req.landUrl);
  if (req.type === 'explore') {
    const field = fieldFor(polys, req.origin, req.radiusNm);
    const out: RoutedPort[] = [];
    if (field) {
      const [lo, hi] = req.band;
      for (const p of req.ports) {
        const to: LonLat = [unwrapNear(p.lon, req.origin[0]), p.lat];
        const gc = distanceNm(req.origin, to);
        if (gc > hi || gc > req.radiusNm * 1.1) continue;
        const r = routeTo(field, req.origin, to);
        if (!r || r.nm < lo || r.nm > hi) continue;
        out.push({ id: p.id, nm: r.nm, route: r.route });
      }
    }
    return { id: req.id, type: 'explore', ports: out };
  }
  // point to point: reuse a cached field around the origin when it covers the target
  const to: LonLat = [unwrapNear(req.to[0], req.from[0]), req.to[1]];
  const gc = distanceNm(req.from, to);
  const cached = fields.find((f) => distanceNm(f.origin, req.from) < 0.01 && f.radius >= gc * 1.4);
  if (cached) {
    const r = routeTo(cached.field, req.from, to);
    if (r) return { id: req.id, type: 'route', route: r.route, nm: r.nm };
  }
  const r = routeBetween(polys, req.from, to);
  return { id: req.id, type: 'route', route: r?.route ?? null, nm: r?.nm ?? null };
}

self.onmessage = async (e: MessageEvent<RouterRequest>) => {
  try {
    self.postMessage(await handle(e.data));
  } catch (err) {
    self.postMessage({ id: e.data.id, type: 'error', message: String(err) } satisfies RouterResponse);
  }
};
