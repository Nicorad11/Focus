import { useMemo } from 'react';
import { Chart, type ChartPort, type ChartRoute } from '../components/chart/Chart';
import { DaysAtSea } from '../components/DaysAtSea';
import { Medal } from '../components/Medal';
import { EmptyStamp, SmallStamp, STAMP_COLORS, tilt } from '../components/Stamps';
import { ACHIEVEMENTS, evaluate, GROUP_NAMES, type AchievementGroup, type AchievementState } from '../lib/achievements';
import { RANKS } from '../lib/defaults';
import { convert, dist, longDate, plural, seaTime, shortDate, unitLabel } from '../lib/format';
import { distanceNm, pointAlong, sliceRoute, type LonLat } from '../lib/geo';
import { useNow } from '../lib/hooks';
import { useNearby } from '../lib/nearby';
import { countryName, nearestPorts, placeLine, type PortIndex } from '../lib/ports';
import { href } from '../lib/router';
import { getState, useStore } from '../lib/store';
import type { Units } from '../lib/types';
import { activeWatch, anchoredPassage, boatPortId, portStamps, progress, wake } from '../lib/voyage';

const GROUPS = Object.keys(GROUP_NAMES) as AchievementGroup[];

function progressText(a: AchievementState, units: Units): string {
  const { target, unit } = a.def;
  if (target == null) return 'Not yet';
  switch (unit) {
    case 'nm':
      return `${convert(a.value, units).toLocaleString('en-GB', { maximumFractionDigits: 0 })} of ${convert(target, units).toLocaleString('en-GB', { maximumFractionDigits: 0 })} ${unitLabel(units)}`;
    case 'hours':
      return `${a.value.toLocaleString('en-GB', { maximumFractionDigits: 1 })} of ${target} hours`;
    default:
      return `${Math.floor(a.value)} of ${target} ${unit}`;
  }
}

export function Voyage({ ports }: { ports: PortIndex | null }) {
  const watches = useStore((s) => s.watches);
  const passages = useStore((s) => s.passages);
  const units = useStore((s) => s.settings.units);
  const homeId = useStore((s) => s.settings.homePortId);
  const hereId = useStore(boatPortId);
  const anchored = useStore(anchoredPassage);
  const sailing = useStore(activeWatch);
  const now = useNow(60_000);

  const { achievements, stats } = useMemo(() => evaluate(getState(), ports?.byId ?? null, now), [watches, passages, homeId, ports, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const stamps = useMemo(() => portStamps(getState()), [watches, homeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const nearby = useNearby(ports, hereId ?? homeId, 130);
  const home = homeId && ports ? ports.byId.get(homeId) ?? null : null;
  const here = hereId && ports ? ports.byId.get(hereId) ?? null : null;

  // where the boat is now
  const position: LonLat | null = useMemo(() => {
    const s = getState();
    const w = activeWatch(s);
    const p = w ? s.passages.find((x) => x.id === w.passageId) : anchored;
    if (p) return pointAlong(p.route, w ? w.startNm + progress(w, now).sailedNm : p.sailedNm).pos;
    return here ? [here.lon, here.lat] : null;
  }, [anchored, here, now, sailing]); // eslint-disable-line react-hooks/exhaustive-deps

  const chart = useMemo(() => {
    const segs = wake(getState());
    const routes: ChartRoute[] = segs.map((coords, i) => ({ id: 'w' + i, coords, style: 'past' }));
    const open = sailing ? passages.find((p) => p.id === sailing.passageId) : anchored;
    if (open && position) {
      const atNm = sailing ? sailing.startNm + progress(sailing, now).sailedNm : open.sailedNm;
      routes.push({ id: 'ahead', coords: sliceRoute(open.route, atNm, open.nm), style: 'todo' });
    }
    const marks: ChartPort[] = [];
    if (ports) {
      for (const s of stamps) {
        const p = ports.byId.get(s.portId);
        if (!p || s.home || p.id === hereId) continue;
        marks.push({ id: p.id, pos: [p.lon, p.lat], name: stamps.length <= 14 ? p.name : '', kind: 'visited' });
      }
    }
    if (home) marks.push({ id: home.id, pos: [home.lon, home.lat], name: home.name, sub: 'Home port', kind: 'home' });
    if (here && here.id !== home?.id) marks.push({ id: here.id, pos: [here.lon, here.lat], name: here.name, sub: 'Moored here', kind: 'dest' });
    const points: LonLat[] = [...segs.flat(), ...marks.map((m) => m.pos)];
    if (position) points.push(position);
    return { routes, marks, points };
  }, [watches, passages, stamps, ports, home, here, hereId, anchored, sailing, position, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = stats.totalNm;
  const rankIdx = RANKS.reduce((best, r, i) => (total >= r.nm ? i : best), 0);
  const rank = RANKS[rankIdx];
  const next = RANKS[rankIdx + 1];
  const toNext = next ? Math.max(0, (total - rank.nm) / (next.nm - rank.nm)) : 1;
  const earnedCount = achievements.filter((a) => a.earnedAt != null).length;
  const latest = [...achievements].filter((a) => a.earnedAt != null).sort((a, b) => b.earnedAt! - a.earnedAt!)[0];

  const farthest = stats.farthest;
  const farthestPlace = farthest
    ? farthest.portId && ports?.byId.get(farthest.portId)
      ? `in ${ports.byId.get(farthest.portId)!.name}`
      : ports
        ? `at sea near ${nearestPorts(ports, farthest.pos, 1, 2)[0]?.name ?? 'land'}`
        : 'at sea'
    : '';

  const whereNow = sailing
    ? `Under way to ${sailing.toLabel}`
    : anchored
      ? `Anchored at sea, ${dist(anchored.nm - anchored.sailedNm, units, 0)} short of ${ports?.byId.get(anchored.toPortId)?.name ?? 'port'}`
      : here
        ? here.id === home?.id
          ? `In your home port, ${here.name}`
          : `Moored at ${here.name}`
        : 'In harbour';
  const fromHome = home && position ? distanceNm([home.lon, home.lat], position) : 0;

  const stampedSet = new Set(stamps.map((s) => s.portId));
  const undiscovered = (nearby ?? []).filter((r) => !stampedSet.has(r.id)).slice(0, 12);
  const from = ports?.byId.get(hereId ?? homeId ?? '');

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head-text">
          <span className="eyebrow">{stats.firstAt ? `Under sail since ${longDate(stats.firstAt)}` : 'Your voyage starts with your first watch'}</span>
          <h1 className="page-title">Voyage</h1>
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
              <span className="label-caps light">Time at sea</span>
              <span className="papers-value">{seaTime(stats.totalMs)}</span>
              <span className="papers-sub">{stats.watches ? `about ${Math.round(stats.totalMs / stats.watches / 60_000)} min a watch` : 'Cast off to start the clock'}</span>
            </div>
            <div>
              <span className="label-caps light">Days at sea</span>
              <span className="papers-value">{stats.daysAtSea}</span>
              <span className="papers-sub">
                {stats.currentStreak > 1 ? `${stats.currentStreak} in a row now` : 'Streak'} · best {plural(stats.longestStreak, 'day')}
              </span>
            </div>
            <div>
              <span className="label-caps light">Sailed</span>
              <span className="papers-value">{dist(total, units, 0)}</span>
              <span className="papers-sub">
                {plural(stats.watches, 'watch', 'watches')} · {plural(stats.landfalls, 'landfall')}
              </span>
            </div>
            <div>
              <span className="label-caps light">Farthest from home</span>
              <span className="papers-value">{farthest ? dist(farthest.nm, units, 0) : '—'}</span>
              <span className="papers-sub">{farthest ? `${farthestPlace}, ${shortDate(farthest.at)}` : 'Sail to set one'}</span>
            </div>
            <div>
              <span className="label-caps light">Ports stamped</span>
              <span className="papers-value">{stats.portsStamped}</span>
              <span className="papers-sub">
                {plural(stats.countries.length, 'country', 'countries')} visited
                {stats.countries.length > 0 && stats.countries.length <= 3 ? `: ${stats.countries.map(countryName).join(', ')}` : ''}
              </span>
            </div>
          </div>
        </section>

        <div className="voyage-grid">
          <section className="card wake-card" aria-labelledby="wake-title">
            <div className="card-head">
              <h2 id="wake-title" className="card-title">
                Your wake
              </h2>
              {home && position && fromHome > 1 && <span className="meta">{dist(fromHome, units, 0)} from {home.name}</span>}
            </div>
            <div className="wake-chart">
              <Chart
                routes={chart.routes}
                ports={chart.marks}
                boat={(sailing || anchored) && position ? { pos: position, course: 90 } : null}
                fit={{ key: `voyage|${watches.length}|${hereId}`, points: chart.points.length ? chart.points : home ? [[home.lon, home.lat]] : [], padding: { top: 50, bottom: 40, left: 50, right: 90 }, maxZoom: 8, zoom: 7, animate: false }}
                decor={false}
                label="Chart of every passage you have sailed"
              />
            </div>
            <div className="wake-foot">
              <span className="wake-where">{whereNow}</span>
              {!sailing && (
                <a className="btn white small" href={href('chart')}>
                  {anchored ? 'Resume the passage' : 'Plan the next leg'}
                </a>
              )}
            </div>
            <p className="hint">Each watch starts where the last one ended, so the wake keeps growing as you go.</p>
          </section>

          <section className="card" aria-labelledby="das-title">
            <div className="card-head">
              <h2 id="das-title" className="card-title">
                Days at sea
              </h2>
              <span className="meta">last 26 weeks</span>
            </div>
            <DaysAtSea minutesByDay={stats.minutesByDay} now={now} />
            <p className="hint">
              Every watch is listed in the <a href={href('logbook')}>logbook</a>.
            </p>
          </section>
        </div>

        <section className="card" aria-labelledby="ach-title">
          <div className="card-head">
            <h2 id="ach-title" className="card-title">
              Achievements
            </h2>
            <span className="meta">
              {earnedCount} of {ACHIEVEMENTS.length} earned
            </span>
          </div>
          {latest && (
            <p className="ach-latest">
              Latest: <strong>{latest.def.title}</strong>, {longDate(latest.earnedAt!)}
            </p>
          )}
          {GROUPS.map((g) => (
            <div key={g} className="ach-group">
              <h3 className="eyebrow">{GROUP_NAMES[g]}</h3>
              <div className="ach-grid">
                {achievements
                  .filter((a) => a.def.group === g)
                  .map((a) => {
                    const done = a.earnedAt != null;
                    const frac = a.def.target ? Math.min(1, a.value / a.def.target) : 0;
                    return (
                      <div key={a.def.id} className={`ach${done ? ' done' : ''}`}>
                        <Medal group={g} earned={done} />
                        <div className="ach-text">
                          <span className="ach-title">{a.def.title}</span>
                          <span className="ach-desc">{a.def.description}</span>
                          {done ? (
                            <span className="ach-status earned">Earned {shortDate(a.earnedAt!)} {new Date(a.earnedAt!).getFullYear()}</span>
                          ) : a.def.target != null ? (
                            <>
                              <span className="ach-bar" role="img" aria-label={progressText(a, units)}>
                                <span style={{ width: `${frac * 100}%` }} />
                              </span>
                              <span className="ach-status">{progressText(a, units)}</span>
                            </>
                          ) : (
                            <span className="ach-status">Not yet</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>

        <section className="card" aria-labelledby="stamped-title">
          <div className="card-head">
            <h2 id="stamped-title" className="card-title">
              Port stamps
            </h2>
            <span className="meta">{plural(stats.portsStamped, 'port')}</span>
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
