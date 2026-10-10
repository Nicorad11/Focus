import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ChartHandle, ChartPort } from '../../components/chart/Chart';
import { Flag } from '../../components/Flag';
import { AnchorIcon, MinusIcon, PlusIcon, SailIcon, SearchIcon, ShieldIcon } from '../../components/icons';
import { ambience } from '../../lib/audio';
import { WATCH_PRESETS } from '../../lib/defaults';
import { day, dist, distRound, minutes, plural, time } from '../../lib/format';
import { formatPosition, pointAlong, sliceRoute, type LonLat } from '../../lib/geo';
import { useNow } from '../../lib/hooks';
import { exploreBand, exploreRadius, oneWatchScore, suggest, type Destination } from '../../lib/passage';
import { platform } from '../../lib/platform';
import { placeLine, portsWithin, searchPorts, type PortIndex } from '../../lib/ports';
import { explore, seaRoute } from '../../lib/routing';
import { getState, setState, useStore } from '../../lib/store';
import type { Harbour } from '../../lib/types';
import { anchoredPassage, boatPortId, castOff, plannedNmFor, portStamps, watchesNeeded, MS_PER_NM } from '../../lib/voyage';
import { toast } from '../../components/Toasts';
import type { ChartView } from './ChartScreen';

interface Props {
  ports: PortIndex;
  setView: (v: ChartView) => void;
  chart: RefObject<ChartHandle | null>;
  pick: { id: string; n: number } | null;
  narrow: boolean;
}

type Sel = { kind: 'resume' } | { kind: 'port'; id: string } | null;

export function PlanPanel({ ports, setView, chart, pick, narrow }: Props) {
  const settings = useStore((s) => s.settings);
  const purposes = useStore((s) => s.purposes);
  const lastPurposeId = useStore((s) => s.lastPurposeId);
  const boat = useStore((s) => s.boat);
  const passages = useStore((s) => s.passages);
  const watchesAll = useStore((s) => s.watches);
  const now = useNow(15_000);

  const anchored = useMemo(() => anchoredPassage(getState()), [boat, passages]); // eslint-disable-line react-hooks/exhaustive-deps
  const portId = boatPortId(getState()) ?? settings.homePortId;
  const originPort = portId ? ports.byId.get(portId) ?? null : null;
  const origin: LonLat | null = anchored ? pointAlong(anchored.route, anchored.sailedNm).pos : originPort ? [originPort.lon, originPort.lat] : null;
  const originKey = origin ? origin.map((v) => v.toFixed(4)).join(',') : '';
  const atHome = !anchored && originPort?.id === settings.homePortId;
  const anchoredDest = anchored ? ports.byId.get(anchored.toPortId) ?? null : null;

  const watchMin = settings.watchMin;
  const [customOpen, setCustomOpen] = useState(!WATCH_PRESETS.includes(watchMin));
  const setWatchMin = (m: number) => setState((s) => ({ ...s, settings: { ...s.settings, watchMin: Math.max(5, Math.min(240, Math.round(m))) } }));

  const [sugg, setSugg] = useState<{ key: string; one: Destination[]; longer: Destination[] } | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(anchored ? { kind: 'resume' } : null);
  const [extra, setExtra] = useState<Destination | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [purposeId, setPurposeId] = useState(lastPurposeId);
  const [batten, setBatten] = useState(settings.battenByDefault);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const routeSeq = useRef(0);

  const visited = useMemo(() => new Set(portStamps(getState()).map((p) => p.portId)), [watchesAll]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugKey = `${originKey}|${watchMin}`;

  // plot courses to harbours in reach
  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    const radius = exploreRadius(watchMin);
    const candidates = portsWithin(ports, origin, radius).map((p) => ({ id: p.id, lon: p.lon, lat: p.lat }));
    setRoutingError(null);
    explore(origin, radius, exploreBand(watchMin), candidates).then(
      (routed) => {
        if (cancelled) return;
        const s = suggest(routed, ports, origin, watchMin, originPort && !anchored ? originPort.id : null, visited);
        setSugg({ key: sugKey, ...s });
      },
      (e) => {
        if (!cancelled) setRoutingError(String(e.message ?? e));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugKey]);

  // keep a sensible selection when the suggestions change
  useEffect(() => {
    if (!sugg || sugg.key !== sugKey) return;
    setSel((cur) => {
      if (cur?.kind === 'resume') return cur;
      if (cur?.kind === 'port' && (extra?.port.id === cur.id || [...sugg.one, ...sugg.longer].some((d) => d.port.id === cur.id))) return cur;
      if (anchored) return { kind: 'resume' };
      const best = [...sugg.one].sort((a, b) => oneWatchScore(a, watchMin) - oneWatchScore(b, watchMin))[0] ?? sugg.longer[0];
      return best ? { kind: 'port', id: best.port.id } : null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugg]);

  const choosePort = async (id: string) => {
    if (!origin) return;
    if (anchored && id === anchored.toPortId) {
      setSel({ kind: 'resume' });
      return;
    }
    const known = sugg ? [...sugg.one, ...sugg.longer].find((d) => d.port.id === id) : null;
    if (known) {
      setSel({ kind: 'port', id });
      return;
    }
    const port = ports.byId.get(id);
    if (!port || (originPort && !anchored && port.id === originPort.id)) return;
    const seq = ++routeSeq.current;
    setPending(port.name);
    setRoutingError(null);
    try {
      const r = await seaRoute(origin, [port.lon, port.lat]);
      if (seq !== routeSeq.current) return;
      if (!r) {
        setRoutingError(`No sea route to ${port.name} from here.`);
        return;
      }
      setExtra({ port, nm: r.nm, route: r.route, watches: watchesNeeded(r.nm, watchMin) });
      setSel({ kind: 'port', id });
    } catch (e) {
      setRoutingError(String(e));
    } finally {
      if (seq === routeSeq.current) setPending(null);
    }
  };

  // a harbour clicked on the chart
  useEffect(() => {
    if (pick) void choosePort(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.n]);

  const selected: Destination | null = useMemo(() => {
    if (!sel) return null;
    if (sel.kind === 'resume') {
      if (!anchored || !anchoredDest) return null;
      const remaining = anchored.nm - anchored.sailedNm;
      return { port: anchoredDest, nm: remaining, route: sliceRoute(anchored.route, anchored.sailedNm, anchored.nm), watches: watchesNeeded(remaining, watchMin) };
    }
    if (extra && extra.port.id === sel.id) return { ...extra, watches: watchesNeeded(extra.nm, watchMin) };
    return sugg ? [...sugg.one, ...sugg.longer].find((d) => d.port.id === sel.id) ?? null : null;
  }, [sel, sugg, extra, anchored, anchoredDest, watchMin]);

  const plannedNm = selected ? plannedNmFor(selected.nm, watchMin) : 0;
  const finishes = selected ? plannedNm >= selected.nm - 0.01 : false;
  const priorWatches = anchored ? watchesAll.filter((w) => w.passageId === anchored.id).length : 0;
  const totalWatches = selected ? (sel?.kind === 'resume' ? priorWatches + selected.watches : selected.watches) : 0;

  // chart
  useEffect(() => {
    if (!origin) return;
    const chartPorts: ChartPort[] = [];
    if (originPort && !anchored) chartPorts.push({ id: originPort.id, pos: [originPort.lon, originPort.lat], name: originPort.name, kind: 'origin' });
    const options = sugg ? [...sugg.one, ...sugg.longer] : [];
    if (extra && !options.some((o) => o.port.id === extra.port.id)) options.push(extra);
    if (anchored && anchoredDest) options.push({ port: anchoredDest, nm: anchored.nm - anchored.sailedNm, route: [], watches: 1 });
    for (const d of options) {
      const isSel = selected?.port.id === d.port.id;
      chartPorts.push({
        id: d.port.id,
        pos: [d.port.lon, d.port.lat],
        name: d.port.name,
        sub: isSel ? `${distRound(d.nm, settings.units)} · ${plural(d.watches, 'watch', 'watches')}` : distRound(d.nm, settings.units),
        kind: isSel ? 'dest' : 'option',
      });
    }
    const pts: LonLat[] = [origin, ...options.map((d) => [d.port.lon, d.port.lat] as LonLat)];
    if (selected) pts.push(...selected.route);
    setView({
      ports: chartPorts,
      routes: selected ? [{ id: 'plan', coords: selected.route, style: 'plan' }] : [],
      boat: anchored ? { pos: origin, course: pointAlong(anchored.route, anchored.sailedNm).course } : null,
      fit: { key: `plan|${sugKey}|${extra?.port.id ?? ''}|${sugg ? 1 : 0}`, points: pts, padding: narrow ? { top: 60, bottom: 40, left: 30, right: 30 } : { top: 110, bottom: 60, left: 70, right: 470 }, maxZoom: 9 },
      harbours: true,
      label: selected ? `Chart: planned passage from ${anchored ? 'your position at sea' : originPort?.name} to ${selected.port.name}` : 'Chart of nearby harbours',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originKey, sugg, extra, selected, settings.units, narrow]);

  const results = useMemo(() => (query.trim() ? searchPorts(ports, query, origin ?? undefined, 6) : []), [query, ports, originKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activePurposes = purposes.filter((p) => !p.archived);
  const enabledApps = settings.apps.filter((a) => a.enabled).length;
  const sites = settings.sites.length;

  const doCastOff = () => {
    if (!selected || !origin) return;
    const purpose = activePurposes.find((p) => p.id === purposeId) ?? activePurposes[0];
    const t = Date.now();
    setState((s) =>
      castOff(
        s,
        sel?.kind === 'resume' && anchored
          ? {
              passageId: anchored.id,
              purposeId: purpose.id,
              watchMin,
              battened: batten,
              fromLabel: 'At sea',
              toLabel: selected.port.name,
            }
          : {
              newPassage: {
                fromPortId: anchored ? null : originPort?.id ?? null,
                fromPos: origin,
                toPortId: selected.port.id,
                route: selected.route,
                nm: selected.nm,
              },
              purposeId: purpose.id,
              watchMin,
              battened: batten,
              fromLabel: anchored ? 'At sea' : originPort?.name ?? 'At sea',
              toLabel: selected.port.name,
            },
        t,
      ),
    );
    if (settings.bell) ambience.bell('castoff');
    ambience.setVolume(settings.volume);
    ambience.play(settings.sound);
    if (settings.notifyLanding) void platform.requestNotifications();
    if (settings.remindDnd && platform.desktop) {
      toast('Turn on Do Not Disturb so Windows notifications stay quiet on this watch.', {
        action: { label: 'Open settings', run: () => platform.openNotificationSettings() },
        ms: 12_000,
      });
    }
  };

  if (!origin) {
    return (
      <aside className="plan-panel" aria-label="Plan a watch">
        <div className="plan-body">
          <p className="empty">Choose a home port in Settings to start planning.</p>
        </div>
      </aside>
    );
  }

  const loading = !sugg || sugg.key !== sugKey;
  const eta = time(now + plannedNm * MS_PER_NM);

  return (
    <>
      <div className="home-chip" aria-label={anchored ? 'Anchored at sea' : atHome ? 'Home port' : 'Moored at'}>
        <span className="home-chip-icon">
          <AnchorIcon size={20} />
        </span>
        <div className="home-chip-text">
          <span className="label-caps">{anchored ? 'Anchored at sea' : atHome ? 'Home port' : 'Moored at'}</span>
          <span className="serif home-chip-name">{anchored ? `Bound for ${anchoredDest?.name ?? '…'}` : originPort?.name}</span>
        </div>
        <span className="home-chip-pos mono">{formatPosition(origin)}</span>
      </div>

      {!narrow && (
        <div className="chart-controls" style={{ left: 20, bottom: 20 }}>
          <button aria-label="Zoom in" onClick={() => chart.current?.zoomIn()}>
            <PlusIcon />
          </button>
          <button aria-label="Zoom out" onClick={() => chart.current?.zoomOut()}>
            <MinusIcon />
          </button>
        </div>
      )}

      <aside className="plan-panel" aria-label="Plan a watch">
        <div className="plan-body">
          <div className="plan-head">
            <span className="eyebrow">
              {anchored ? 'Resume a passage' : 'Plan a watch'} · {day(now)}
            </span>
            <h1 className="plan-title">{anchored ? 'Back on watch?' : 'Where are we sailing?'}</h1>
          </div>

          <section className="plan-section">
            <h2 className="eyebrow plan-h2">Watch length</h2>
            <div className="segmented" role="group" aria-label="Watch length in minutes">
              {WATCH_PRESETS.map((m) => (
                <button
                  key={m}
                  className="seg"
                  aria-pressed={!customOpen && watchMin === m}
                  onClick={() => {
                    setCustomOpen(false);
                    setWatchMin(m);
                  }}
                >
                  {m}
                </button>
              ))}
              <button className="seg word" aria-pressed={customOpen} onClick={() => setCustomOpen(true)}>
                Other
              </button>
            </div>
            {customOpen && (
              <div className="custom-length">
                <label htmlFor="custom-min">Minutes</label>
                <input
                  id="custom-min"
                  className="field mono"
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  defaultValue={watchMin}
                  onBlur={(e) => setWatchMin(Number(e.currentTarget.value) || watchMin)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setWatchMin(Number(e.currentTarget.value) || watchMin);
                  }}
                />
                <span className="hint">5 to 240</span>
              </div>
            )}
            <p className="hint">
              Minutes. Every focused minute carries you one nautical mile{settings.units !== 'nm' ? ` (${dist(1, settings.units, 2)})` : ''}.
            </p>
          </section>

          {anchored && anchoredDest && (
            <section className="plan-section tight">
              <h2 className="eyebrow plan-h2">Your passage</h2>
              <DestButton
                selected={sel?.kind === 'resume'}
                onClick={() => setSel({ kind: 'resume' })}
                name={anchoredDest.name}
                line={`${dist(anchored.sailedNm, settings.units)} of ${dist(anchored.nm, settings.units)} sailed · anchored at sea`}
                nm={distRound(anchored.nm - anchored.sailedNm, settings.units)}
                sub="to go"
              />
            </section>
          )}

          <section className="plan-section tight" aria-busy={loading}>
            <h2 className="eyebrow plan-h2">{anchored ? 'Or make for another harbour' : 'Reach in one watch'}</h2>
            {loading && !routingError && <OptionSkeleton n={3} />}
            {!loading && sugg.one.length === 0 && <p className="hint">No harbour about {minutes(watchMin)} away by sea. Try another watch length, or search below.</p>}
            {!loading &&
              sugg.one.map((d) => (
                <DestButton
                  key={d.port.id}
                  selected={sel?.kind === 'port' && sel.id === d.port.id}
                  onClick={() => setSel({ kind: 'port', id: d.port.id })}
                  name={d.port.name}
                  line={placeLine(d.port)}
                  nm={distRound(d.nm, settings.units)}
                  sub={minutes(d.nm)}
                  stamped={visited.has(d.port.id)}
                />
              ))}
          </section>

          {(loading || sugg.longer.length > 0) && (
            <section className="plan-section tight">
              <h2 className="eyebrow plan-h2">Longer passages</h2>
              {loading && <OptionSkeleton n={2} />}
              {!loading &&
                sugg.longer.map((d) => (
                  <DestButton
                    key={d.port.id}
                    selected={sel?.kind === 'port' && sel.id === d.port.id}
                    onClick={() => setSel({ kind: 'port', id: d.port.id })}
                    name={d.port.name}
                    line={placeLine(d.port)}
                    nm={distRound(d.nm, settings.units)}
                    sub={plural(d.watches, 'watch', 'watches')}
                    stamped={visited.has(d.port.id)}
                  />
                ))}
              <p className="hint">A long passage spans several watches. Drop anchor and you pick up from the same spot next time.</p>
            </section>
          )}

          {extra && !(sugg && [...sugg.one, ...sugg.longer].some((d) => d.port.id === extra.port.id)) && (
            <section className="plan-section tight">
              <h2 className="eyebrow plan-h2">Your choice</h2>
              <DestButton
                selected={sel?.kind === 'port' && sel.id === extra.port.id}
                onClick={() => setSel({ kind: 'port', id: extra.port.id })}
                name={extra.port.name}
                line={placeLine(extra.port)}
                nm={distRound(extra.nm, settings.units)}
                sub={extra.watches > 1 ? plural(watchesNeeded(extra.nm, watchMin), 'watch', 'watches') : minutes(extra.nm)}
                stamped={visited.has(extra.port.id)}
              />
            </section>
          )}

          <section className="plan-section tight">
            {!searchOpen ? (
              <button className="btn ghost small search-toggle" onClick={() => setSearchOpen(true)}>
                <SearchIcon />
                Somewhere else…
              </button>
            ) : (
              <div className="port-search">
                <label htmlFor="port-q" className="eyebrow plan-h2">
                  Any harbour
                </label>
                <div className="port-search-field">
                  <SearchIcon />
                  <input
                    id="port-q"
                    className="field"
                    type="search"
                    autoFocus
                    placeholder="Search harbours, or click one on the chart"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                {results.length > 0 && (
                  <ul className="port-results">
                    {results.map((p: Harbour) => (
                      <li key={p.id}>
                        <button
                          onClick={() => {
                            setQuery('');
                            setSearchOpen(false);
                            void choosePort(p.id);
                          }}
                        >
                          <span className="serif">{p.name}</span>
                          <span className="row-sub">{placeLine(p)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {pending && <p className="hint">Plotting a course to {pending}…</p>}
            {routingError && <p className="hint error">{routingError}</p>}
          </section>

          <section className="plan-section">
            <h2 className="eyebrow plan-h2">Purpose flag</h2>
            <div className="purpose-grid">
              {activePurposes.map((p) => (
                <button key={p.id} className="purpose" aria-pressed={purposeId === p.id} onClick={() => setPurposeId(p.id)}>
                  <Flag flag={p.flag} />
                  {p.name}
                </button>
              ))}
            </div>
          </section>

          <div className="batten-row">
            <span className="batten-icon">
              <ShieldIcon size={20} />
            </span>
            <span className="batten-text">
              <span className="batten-title">Batten down</span>
              <span className="batten-sub">
                {enabledApps || sites
                  ? `${plural(enabledApps, 'app')} and ${plural(sites, 'site')} stay below deck`
                  : 'Nothing set to block yet'}
              </span>
            </span>
            <button role="switch" aria-checked={batten} aria-label="Batten down for this watch" className="switch-button" onClick={() => setBatten((b) => !b)}>
              <span className={`switch-track${batten ? ' on' : ''}`}>
                <span className="switch-thumb" />
              </span>
            </button>
          </div>
        </div>

        <div className="plan-foot">
          <button className="btn primary cast-off" disabled={!selected} onClick={doCastOff}>
            <SailIcon size={20} />
            {selected ? (sel?.kind === 'resume' ? `Resume passage to ${selected.port.name}` : `Cast off for ${selected.port.name}`) : 'Choose a harbour'}
          </button>
          <p className="plan-eta mono">
            {selected
              ? finishes
                ? `Make port about ${eta} · ${totalWatches > 1 ? `watch ${totalWatches} of ${totalWatches}` : 'one watch'}`
                : `Anchor about ${eta} · watch ${priorWatches + 1} of ${totalWatches}`
              : ' '}
          </p>
        </div>
      </aside>
    </>
  );
}

function DestButton({
  selected,
  onClick,
  name,
  line,
  nm,
  sub,
  stamped,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  line: string;
  nm: string;
  sub: string;
  stamped?: boolean;
}) {
  return (
    <button className="dest" aria-pressed={selected} onClick={onClick}>
      <span className="dest-radio" aria-hidden="true" />
      <span className="dest-main">
        <span className="dest-name serif">{name}</span>
        <span className="dest-line">
          {line}
          {stamped && <span className="dest-stamped"> · stamped</span>}
        </span>
      </span>
      <span className="dest-dist mono">
        <span className="dest-nm">{nm}</span>
        <span className="dest-sub">{sub}</span>
      </span>
    </button>
  );
}

function OptionSkeleton({ n }: { n: number }) {
  return (
    <div className="skeleton-list" aria-label="Plotting courses">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 56 }} />
      ))}
    </div>
  );
}
