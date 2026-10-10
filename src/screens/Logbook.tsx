import { useMemo, useState } from 'react';
import { Chart, type ChartRoute } from '../components/chart/Chart';
import { Flag } from '../components/Flag';
import { AnchorIcon, ChevronLeft, ChevronRight, DownloadIcon } from '../components/icons';
import { EmptyStamp, SmallStamp, STAMP_COLORS, tilt } from '../components/Stamps';
import { toast } from '../components/Toasts';
import { addDays, day, dist, duration, isoWeek, shortDate, startOfWeek, time, weekRange } from '../lib/format';
import { sliceRoute, type LonLat } from '../lib/geo';
import { useNow } from '../lib/hooks';
import { useNearby } from '../lib/nearby';
import { platform } from '../lib/platform';
import type { PortIndex } from '../lib/ports';
import { href } from '../lib/router';
import { getState, setState, useStore } from '../lib/store';
import { logbookCSV } from '../lib/exporting';
import { portStamps, updateWatch, watchMs, watchNm } from '../lib/voyage';
import type { Watch } from '../lib/types';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function Logbook({ ports }: { ports: PortIndex | null }) {
  const watches = useStore((s) => s.watches);
  const passages = useStore((s) => s.passages);
  const purposes = useStore((s) => s.purposes);
  const settings = useStore((s) => s.settings);
  const now = useNow(30_000);
  const thisWeek = startOfWeek(now);
  const [week, setWeek] = useState(thisWeek);
  const units = settings.units;

  const inWeek = useMemo(
    () => watches.filter((w) => w.startedAt >= week && w.startedAt < addDays(week, 7)).sort((a, b) => b.startedAt - a.startedAt),
    [watches, week],
  );
  const earliest = useMemo(() => Math.min(now, ...watches.map((w) => w.startedAt)), [watches, now]);
  const totalMs = inWeek.reduce((s, w) => s + watchMs(w, now), 0);
  const totalNm = inWeek.reduce((s, w) => s + watchNm(w, now), 0);

  const todayIdx = week === thisWeek ? (new Date(now).getDay() + 6) % 7 : -1;
  const atSea = DAYS.map((_, i) => inWeek.some((w) => (new Date(w.startedAt).getDay() + 6) % 7 === i));
  const daysAtSea = atSea.filter(Boolean).length;

  const byPurpose = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of inWeek) m.set(w.purposeId, (m.get(w.purposeId) ?? 0) + watchMs(w, now));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inWeek, now]);

  const tracks: ChartRoute[] = useMemo(() => {
    const out: ChartRoute[] = [];
    const startToday = new Date(now).setHours(0, 0, 0, 0);
    for (const w of inWeek) {
      const p = passages.find((x) => x.id === w.passageId);
      if (!p) continue;
      const seg = sliceRoute(p.route, w.startNm, w.startNm + watchNm(w, now));
      if (seg.length >= 2) out.push({ id: w.id, coords: seg, style: w.startedAt >= startToday ? 'today' : 'past' });
    }
    return out;
  }, [inWeek, passages, now]);
  const trackPoints = useMemo(() => tracks.flatMap((t) => t.coords) as LonLat[], [tracks]);

  const exportWeek = async () => {
    const csv = logbookCSV(getState(), inWeek, now);
    const name = `leeward-logbook-${new Date(week).getFullYear()}-w${String(isoWeek(week)).padStart(2, '0')}.csv`;
    try {
      if (await platform.saveFile(name, 'text/csv', csv)) toast(`Saved ${name}`);
    } catch (e) {
      toast(`Couldn’t save the file: ${String(e)}`);
    }
  };

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div className="page-head-text">
            <span className="eyebrow">
              Week {isoWeek(week)} · {weekRange(week)}
            </span>
            <h1 className="page-title">Logbook</h1>
          </div>
          <div className="page-actions">
            <button className="icon-btn boxed" aria-label="Previous week" disabled={week <= startOfWeek(earliest)} onClick={() => setWeek(addDays(week, -7))}>
              <ChevronLeft />
            </button>
            <button className="icon-btn boxed" aria-label="Next week" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}>
              <ChevronRight />
            </button>
            <button className="btn" onClick={exportWeek} disabled={!inWeek.length}>
              <DownloadIcon />
              Export CSV
            </button>
          </div>
        </div>

        <section aria-label="This week" className="week-stats">
          <div className="week-stat">
            <span className="label-caps">Watches</span>
            <span className="week-value">{inWeek.length}</span>
          </div>
          <div className="week-stat">
            <span className="label-caps">Focused</span>
            <span className="week-value">{duration(totalMs)}</span>
          </div>
          <div className="week-stat">
            <span className="label-caps">Sailed</span>
            <span className="week-value">{dist(totalNm, units, 0)}</span>
          </div>
          <div className="week-stat">
            <span className="label-caps">Days at sea · {daysAtSea} of 7</span>
            <div className="days" role="img" aria-label={daysAtSea ? `At sea ${DAY_NAMES.filter((_, i) => atSea[i]).join(', ')}` : 'No days at sea yet'}>
              {DAYS.map((d, i) => (
                <span key={i} className="day">
                  <span className={`day-dot${atSea[i] ? (i === todayIdx ? ' today' : ' sea') : i === todayIdx ? ' today-empty' : ''}`} />
                  {d}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="logbook-grid">
          <section aria-labelledby="ship-log" className="card log-card">
            <div className="card-head log-head">
              <h2 id="ship-log" className="card-title">
                Ship’s log
              </h2>
              <span className="meta-text">Newest first</span>
            </div>
            {inWeek.length === 0 ? (
              <div className="empty">
                No watches {week === thisWeek ? 'yet this week' : 'that week'}.{' '}
                {week === thisWeek && <a href={href('chart')}>Plan a watch</a>}
              </div>
            ) : (
              <div className="table-scroll">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Cast off</th>
                      <th>Passage</th>
                      <th className="num">Distance</th>
                      <th className="num">Watch</th>
                      <th>Purpose</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inWeek.map((w) => (
                      <LogRow key={w.id} w={w} now={now} units={units} purpose={purposes.find((p) => p.id === w.purposeId)} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Week total</td>
                      <td className="num mono">{dist(totalNm, units)}</td>
                      <td className="num mono">{duration(totalMs)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <div className="logbook-side">
            <section aria-labelledby="tracks" className="card">
              <h2 id="tracks" className="card-title" style={{ marginBottom: 8 }}>
                {week === thisWeek ? 'This week’s tracks' : 'That week’s tracks'}
              </h2>
              <div className="tracks-chart">
                {tracks.length ? (
                  <Chart
                    routes={tracks}
                    interactive={false}
                    decor={false}
                    fit={{ key: `tracks|${week}|${tracks.length}`, points: trackPoints, padding: { top: 24, bottom: 24, left: 24, right: 24 }, maxZoom: 9, animate: false }}
                    label="Overview chart of this week's passages"
                  />
                ) : (
                  <div className="empty tracks-empty">Tracks appear here once you’ve sailed.</div>
                )}
              </div>
              <div className="legend">
                <span>
                  <span className="legend-line red" />
                  Today
                </span>
                <span>
                  <span className="legend-line teal" />
                  Earlier this week
                </span>
              </div>
            </section>

            <section aria-labelledby="purpose" className="card">
              <h2 id="purpose" className="card-title" style={{ marginBottom: 8 }}>
                Time by purpose
              </h2>
              {byPurpose.length === 0 && <p className="hint">Nothing logged yet.</p>}
              {byPurpose.map(([id, ms]) => {
                const p = purposes.find((x) => x.id === id);
                return (
                  <div key={id} className="purpose-row">
                    {p && <Flag flag={p.flag} />}
                    <span className="purpose-name">{p?.name ?? 'Unknown'}</span>
                    <span className="mono">{duration(ms)}</span>
                    <span className="mono purpose-pct">{totalMs ? Math.round((ms / totalMs) * 100) : 0}%</span>
                  </div>
                );
              })}
            </section>

            <StampsCard ports={ports} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LogRow({ w, now, units, purpose }: { w: Watch; now: number; units: 'nm' | 'km' | 'mi'; purpose?: { name: string; flag: import('../lib/types').FlagSpec } }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(w.note ?? '');
  const save = () => {
    setState((s) => updateWatch(s, w.id, { note: draft.trim() || undefined }));
    setEditing(false);
  };
  return (
    <tr>
      <td className="nowrap">
        <div className="strong">{day(w.startedAt)}</div>
        <div className="mono muted small">{time(w.startedAt)}</div>
      </td>
      <td>
        <div className="serif log-passage">
          {w.resumed ? 'At sea' : w.fromLabel} → {w.toLabel}
        </div>
        {w.status === 'under_way' && <span className="chip teal">Under way</span>}
        {w.newPort && <span className="chip red">New port</span>}
        {w.resumed && w.status !== 'under_way' && !w.newPort && <span className="chip teal">Resumed passage</span>}
        {(w.status === 'dropped_anchor' || w.status === 'anchored') && (
          <span className="chip outline">
            <AnchorIcon size={11} strokeWidth={2.2} />
            Anchored at sea
          </span>
        )}
      </td>
      <td className="num mono nowrap">{dist(watchNm(w, now), units)}</td>
      <td className="num mono nowrap">{duration(watchMs(w, now))}</td>
      <td>
        {purpose && (
          <span className="purpose-cell">
            <Flag flag={purpose.flag} width={20} />
            {purpose.name}
          </span>
        )}
      </td>
      <td className="note-cell">
        {editing ? (
          <input
            className="field note-input"
            autoFocus
            value={draft}
            aria-label="Note"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setDraft(w.note ?? '');
                setEditing(false);
              }
            }}
          />
        ) : (
          <button className={`note-button${w.note ? '' : ' empty-note'}`} onClick={() => setEditing(true)} aria-label={w.note ? `Edit note: ${w.note}` : 'Add a note'}>
            {w.note || '—'}
          </button>
        )}
      </td>
    </tr>
  );
}

function StampsCard({ ports }: { ports: PortIndex | null }) {
  const watches = useStore((s) => s.watches);
  const homeId = useStore((s) => s.settings.homePortId);
  const units = useStore((s) => s.settings.units);
  const stamps = useMemo(() => portStamps(getState()), [watches, homeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const nearby = useNearby(ports, homeId);
  const stamped = new Set(stamps.map((s) => s.portId));
  const homeStamp = stamps.find((s) => s.home);
  const visitedStamps = stamps.filter((s) => !s.home);
  const shown = [...(homeStamp ? [homeStamp] : []), ...visitedStamps.slice(-(homeStamp ? 3 : 4))];
  const undiscovered = (nearby ?? []).filter((r) => !stamped.has(r.id)).slice(0, Math.max(0, 8 - shown.length));
  const home = homeId && ports ? ports.byId.get(homeId) : null;
  const newest = stamps.filter((s) => !s.home).at(-1);
  const today = new Date().setHours(0, 0, 0, 0);

  return (
    <section id="ports" aria-labelledby="ports-title" className="card">
      <div className="card-head">
        <h2 id="ports-title" className="card-title">
          Port stamps
        </h2>
        <a className="meta-link mono" href={href('ports')}>
          {stamps.filter((s) => !s.home).length} stamped
        </a>
      </div>
      <div className="stamp-grid">
        {ports &&
          shown.map((s, i) => {
            const p = ports.byId.get(s.portId);
            if (!p) return null;
            const isNew = newest?.portId === s.portId && s.at >= today;
            const color = s.home ? 'var(--ink)' : isNew ? 'var(--red)' : STAMP_COLORS[i % 2];
            return (
              <div key={s.portId} className="stamp-cell">
                <SmallStamp label={s.home ? 'Home' : shortDate(s.at)} color={color} rotate={tilt(s.portId)} />
                <span className={`serif stamp-name${isNew ? ' new' : ''}`}>{p.name}</span>
                <span className={`mono stamp-sub${isNew ? ' new' : ''}`}>{s.home ? 'Home port' : isNew ? 'New today' : shortDate(s.at)}</span>
              </div>
            );
          })}
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
      {home && undiscovered.length > 0 && <p className="hint">Distances from {home.name}.</p>}
    </section>
  );
}
