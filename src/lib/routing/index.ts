// Main-thread client for the routing worker.

import type { LonLat } from '../geo';
import type { PortPoint, RoutedPort, RouterRequest, RouterResponse } from './protocol';

export type { RoutedPort } from './protocol';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: RouterResponse) => void; reject: (e: Error) => void }>();

function landUrl() {
  return new URL('data/land.json', document.baseURI).href;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./router.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<RouterResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.type === 'error') p.reject(new Error(e.data.message));
      else p.resolve(e.data);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'routing worker failed'));
      pending.clear();
    };
  }
  return worker;
}

type WithoutIds<T> = T extends unknown ? Omit<T, 'id' | 'landUrl'> : never;

function send(req: WithoutIds<RouterRequest>): Promise<RouterResponse> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...req, id, landUrl: landUrl() } as RouterRequest);
  });
}

/** Sea routes from `origin` to every port whose distance falls inside `band`. */
export async function explore(origin: LonLat, radiusNm: number, band: [number, number], ports: PortPoint[]): Promise<RoutedPort[]> {
  const res = await send({ type: 'explore', origin, radiusNm, band, ports });
  return res.type === 'explore' ? res.ports : [];
}

/** A single sea route, or null when no water route exists. */
export async function seaRoute(from: LonLat, to: LonLat): Promise<{ route: LonLat[]; nm: number } | null> {
  const res = await send({ type: 'route', from, to });
  if (res.type !== 'route' || !res.route || res.nm == null) return null;
  return { route: res.route, nm: res.nm };
}

/** Start the worker and fetch the coastline early so the first plan is quick. */
export function warmUp() {
  getWorker();
}
