import { useEffect, useState } from 'react';
import { distanceNm, type LonLat } from './geo';
import type { Harbour } from './types';

export interface PortIndex {
  list: Harbour[];
  byId: Map<string, Harbour>;
}

let loaded: PortIndex | null = null;
let loading: Promise<PortIndex> | null = null;

export function loadPorts(): Promise<PortIndex> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = fetch(new URL('data/ports.json', document.baseURI))
      .then((r) => {
        if (!r.ok) throw new Error(`ports: HTTP ${r.status}`);
        return r.json() as Promise<{ ports: [string, string, string, string, number, number, number][] }>;
      })
      .then((d) => {
        const list: Harbour[] = d.ports.map(([id, name, region, cc, lat, lon, size]) => ({ id, name, region, cc, lat, lon, size }));
        loaded = { list, byId: new Map(list.map((p) => [p.id, p])) };
        return loaded;
      });
  }
  return loading;
}

export function usePorts(): PortIndex | null {
  const [ports, setPorts] = useState<PortIndex | null>(loaded);
  useEffect(() => {
    if (!ports) loadPorts().then(setPorts, (e) => console.error(e));
  }, [ports]);
  return ports;
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(cc: string): string {
  if (!cc) return '';
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/** "Skåne, Sweden" */
export function placeLine(p: Harbour): string {
  const country = countryName(p.cc);
  return [p.region, country].filter(Boolean).join(', ');
}

export function lonLat(p: Harbour): LonLat {
  return [p.lon, p.lat];
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase();

/** Name search: prefix matches first, bigger harbours first, then closer ones. */
export function searchPorts(index: PortIndex, query: string, near?: LonLat, limit = 8): Harbour[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: [number, Harbour][] = [];
  for (const p of index.list) {
    const name = fold(p.name);
    let score: number;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(' ' + q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (fold(p.region).startsWith(q) || fold(countryName(p.cc)).startsWith(q)) score = 4;
    else continue;
    score -= p.size * 0.05;
    if (near) score += Math.min(1, distanceNm(near, [p.lon, p.lat]) / 3000) * 0.5;
    scored.push([score, p]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, p]) => p);
}

export function nearestPorts(index: PortIndex, at: LonLat, limit = 6, minSize = 1): Harbour[] {
  return index.list
    .filter((p) => p.size >= minSize)
    .map((p) => [distanceNm(at, [p.lon, p.lat]), p] as const)
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, p]) => p);
}

export function portsWithin(index: PortIndex, at: LonLat, radiusNm: number): Harbour[] {
  const dLat = radiusNm / 60;
  return index.list.filter((p) => Math.abs(p.lat - at[1]) <= dLat && distanceNm(at, [p.lon, p.lat]) <= radiusNm);
}
