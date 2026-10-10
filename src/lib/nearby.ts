import { useEffect, useState } from 'react';
import { portsWithin, type PortIndex } from './ports';
import { explore, type RoutedPort } from './routing';

const cache = new Map<string, RoutedPort[]>();

/** Harbours within `radiusNm` of a harbour, by sea distance (nearest first). */
export function useNearby(ports: PortIndex | null, originId: string | null, radiusNm = 110): RoutedPort[] | null {
  const key = `${originId}|${radiusNm}`;
  const [result, setResult] = useState<RoutedPort[] | null>(cache.get(key) ?? null);
  useEffect(() => {
    if (!ports || !originId) return;
    const hit = cache.get(key);
    if (hit) {
      setResult(hit);
      return;
    }
    const origin = ports.byId.get(originId);
    if (!origin) return;
    let cancelled = false;
    const cands = portsWithin(ports, [origin.lon, origin.lat], radiusNm)
      .filter((p) => p.id !== originId)
      .map((p) => ({ id: p.id, lon: p.lon, lat: p.lat }));
    explore([origin.lon, origin.lat], radiusNm, [3, radiusNm], cands)
      .then((r) => {
        const sorted = [...r].sort((a, b) => a.nm - b.nm);
        cache.set(key, sorted);
        if (!cancelled) setResult(sorted);
      })
      .catch(() => !cancelled && setResult([]));
    return () => {
      cancelled = true;
    };
  }, [ports, originId, radiusNm, key]);
  return result;
}
