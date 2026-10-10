import { useMemo } from 'react';
import { EmptyStamp, SmallStamp, STAMP_COLORS, tilt } from '../components/Stamps';
import { RANKS } from '../lib/defaults';
import { dist, duration, longDate, plural, shortDate } from '../lib/format';
import { useNearby } from '../lib/nearby';
import { placeLine, type PortIndex } from '../lib/ports';
import { getState, useStore } from '../lib/store';
import { boatPortId, lifetimeNm, MS_PER_NM, portStamps } from '../lib/voyage';

export function Ports({ ports }: { ports: PortIndex | null }) {
  const watches = useStore((s) => s.watches);
  const units = useStore((s) => s.settings.units);
  const homeId = useStore((s) => s.settings.homePortId);
  const hereId = useStore(boatPortId);
  const stamps = useMemo(() => portStamps(getState()), [watches, homeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => lifetimeNm(getState()), [watches]);
  const nearby = useNearby(ports, hereId ?? homeId, 130);
  const visited = stamps.filter((s) => !s.home);
  const stampedSet = new Set(stamps.map((s) => s.portId));
  const undiscovered = (nearby ?? []).filter((r) => !stampedSet.has(r.id)).slice(0, 12);
  const from = ports?.byId.get(hereId ?? homeId ?? '');

  const rankIdx = RANKS.reduce((best, r, i) => (total >= r.nm ? i : best), 0);
  const rank = RANKS[rankIdx];
  const next = RANKS[rankIdx + 1];
  const toNext = next ? Math.max(0, (total - rank.nm) / (next.nm - rank.nm)) : 1;
  const madePort = watches.filter((w) => w.status === 'made_port').length;

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head-text">
          <span className="eyebrow">Ports of call</span>
          <h1 className="page-title">Ports</h1>
        </div>

        <section className="papers" aria-label="Your papers">
          <div className="papers-rank">
            <span className="label-caps light">Rank</span>
            <span className="papers-title">{rank.name}</span>
            <div className="papers-bar" role="img" aria-label={next ? `${Math.round(toNext * 100)} percent of the way to ${next.name}` : 'Highest rank'}>
              <span style={{ width: `${toNext * 100}%` }} />
            </div>
            <span className="papers-next">{next ? `${dist(next.nm - total, units, 0)} to ${next.name}` : 'The highest rank there is.'}</span>
          </div>
          <div className="papers-stats">
            <div>
              <span className="label-caps light">Lifetime</span>
              <span className="papers-value">{dist(total, units, 0)}</span>
            </div>
            <div>
              <span className="label-caps light">Focused</span>
              <span className="papers-value">{duration(total * MS_PER_NM)}</span>
            </div>
            <div>
              <span className="label-caps light">Ports stamped</span>
              <span className="papers-value">{visited.length}</span>
            </div>
            <div>
              <span className="label-caps light">Landfalls</span>
              <span className="papers-value">{madePort}</span>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="stamped-title">
          <div className="card-head">
            <h2 id="stamped-title" className="card-title">
              Stamped
            </h2>
            <span className="meta">{plural(visited.length, 'port')}</span>
          </div>
          {stamps.length === 0 && <p className="empty">Make port somewhere new to collect your first stamp.</p>}
          <div className="stamp-grid wide">
            {ports &&
              stamps.map((s, i) => {
                const p = ports.byId.get(s.portId);
                if (!p) return null;
                return (
                  <div key={s.portId} className="stamp-cell" title={s.home ? 'Home port' : `First made port ${longDate(s.at)}`}>
                    <SmallStamp label={s.home ? 'Home' : shortDate(s.at)} color={s.home ? 'var(--ink)' : STAMP_COLORS[i % STAMP_COLORS.length]} rotate={tilt(s.portId)} />
                    <span className="serif stamp-name">{p.name}</span>
                    <span className="stamp-sub">{s.home ? 'Home port' : placeLine(p)}</span>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="card" aria-labelledby="undiscovered-title">
          <div className="card-head">
            <h2 id="undiscovered-title" className="card-title">
              Within reach
            </h2>
            <span className="meta">{from ? `by sea from ${from.name}` : ''}</span>
          </div>
          {!nearby && <p className="hint">Plotting courses…</p>}
          {nearby && undiscovered.length === 0 && <p className="empty">You’ve stamped every harbour nearby. Try a longer passage.</p>}
          <div className="stamp-grid wide">
            {ports &&
              undiscovered.map((r) => {
                const p = ports.byId.get(r.id);
                if (!p) return null;
                return (
                  <div key={r.id} className="stamp-cell">
                    <EmptyStamp />
                    <span className="serif stamp-name muted-name">{p.name}</span>
                    <span className="mono stamp-sub">{dist(r.nm, units, 0)}</span>
                  </div>
                );
              })}
          </div>
        </section>
      </div>
    </div>
  );
}
