import { useEffect, useState } from 'react';

/** Current time, refreshed every `ms` (aligned to the second so countdowns tick together). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let t: number;
    const tick = () => {
      setNow(Date.now());
      t = window.setTimeout(tick, ms - (Date.now() % ms) + 5);
    };
    t = window.setTimeout(tick, ms - (Date.now() % ms) + 5);
    return () => window.clearTimeout(t);
  }, [ms]);
  return now;
}

export function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}
