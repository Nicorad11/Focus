import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { ChartHandle, ChartPort } from '../../components/chart/Chart';
import { Flag } from '../../components/Flag';
import { HoldButton } from '../../components/HoldButton';
import { AnchorIcon, ArrowRight, BoatGlyph, MiniWindowIcon, MinusIcon, PlusIcon, ShieldIcon, TargetIcon, WavesIcon } from '../../components/icons';
import { ambience, SOUNDS } from '../../lib/audio';
import { clock, dist, distValue, plural, time, unitLabel } from '../../lib/format';
import { formatCourse, pointAlong, sliceRoute } from '../../lib/geo';
import { useNow } from '../../lib/hooks';
import { waypointsAlong } from '../../lib/passage';
import { openMiniWindow } from '../../lib/pip';
import { platform } from '../../lib/platform';
import type { PortIndex } from '../../lib/ports';
import { getState, setState, useStore } from '../../lib/store';
import type { SoundId } from '../../lib/types';
import { activeWatch, endWatch, knots, nmPerMinute, passageOf, progress, reachOf, speedOf, wake, watchesNeeded } from '../../lib/voyage';
import type { ChartView } from './ChartScreen';

interface Props {
  ports: PortIndex;
  setView: (v: ChartView) => void;
  chart: RefObject<ChartHandle | null>;
  narrow: boolean;
}

export function UnderWay({ ports, setView, chart, narrow }: Props) {
  const watch = useStore(activeWatch);
  const passage = useStore((s) => passageOf(s, activeWatch(s)?.passageId));
  const settings = useStore((s) => s.settings);
  const purposes = useStore((s) => s.purposes);
  const watchesOnPassage = useStore((s) => s.watches.filter((w) => w.passageId === activeWatch(s)?.passageId).length);
  const now = useNow(1000);
  const [soundBlocked, setSoundBlocked] = useState(false);

  // ambience follows the watch (and resumes after a reload once the page is clicked)
  useEffect(() => {
    ambience.setVolume(settings.volume);
    ambience.play(settings.sound);
    const t = window.setInterval(() => setSoundBlocked(ambience.blocked), 1000);
    return () => window.clearInterval(t);
  }, [settings.sound, settings.volume]);
  useEffect(() => () => ambience.stop(), []);

  const from = passage?.fromPortId ? ports.byId.get(passage.fromPortId) : null;
  const to = passage ? ports.byId.get(passage.toPortId) : null;
  const waypoints = useMemo(
    () => (passage ? waypointsAlong(passage.route, ports, new Set([passage.fromPortId ?? '', passage.toPortId])) : []),
    [passage, ports],
  );

  // earlier passages, drawn faintly so the voyage reads as one long wake
  const wakeRoutes = useMemo(() => wake(getState(), 200), [watch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prog = watch ? progress(watch, now) : null;
  const posNm = watch && prog ? Math.min(passage?.nm ?? 0, watch.startNm + prog.sailedNm) : 0;
  const here = passage ? pointAlong(passage.route, posNm) : null;

  useEffect(() => {
    if (!passage || !here || !watch) return;
    const chartPorts: ChartPort[] = [];
    if (from) chartPorts.push({ id: from.id, pos: [from.lon, from.lat], name: from.name, kind: 'origin' });
    if (to) chartPorts.push({ id: to.id, pos: [to.lon, to.lat], name: to.name, sub: `${dist(passage.nm - posNm, settings.units)} to go`, kind: 'dest' });
    for (const w of waypoints) chartPorts.push({ id: w.port.id, pos: [w.port.lon, w.port.lat], name: w.port.name, kind: 'waypoint' });
    setView({
      ports: chartPorts,
      routes: [
        ...wakeRoutes.map((coords, i) => ({ id: 'wake' + i, coords, style: 'wake' as const })),
        { id: 'done', coords: sliceRoute(passage.route, 0, posNm), style: 'done' },
        { id: 'todo', coords: sliceRoute(passage.route, posNm, passage.nm), style: 'todo' },
      ],
      boat: { pos: here.pos, course: here.course },
      fit: {
        key: `underway|${watch.id}|${narrow}`,
        points: passage.route,
        padding: narrow ? { top: 40, bottom: 40, left: 30, right: 90 } : { top: 70, bottom: 230, left: 400, right: 170 },
        maxZoom: 9,
      },
      harbours: false,
      label: `Chart: under way from ${from?.name ?? 'sea'} to ${to?.name ?? ''}, ${Math.round((posNm / passage.nm) * 100)} percent of the passage sailed`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, passage, waypoints, settings.units, narrow]);

  if (!watch || !passage || !prog || !here) return null;

  const purpose = purposes.find((p) => p.id === watch.purposeId) ?? purposes[0];
  const remainingNm = Math.max(0, passage.nm - posNm);
  const finishesThisWatch = watch.startNm + watch.plannedNm >= passage.nm - 0.01;
  const totalWatches = finishesThisWatch
    ? watchesOnPassage
    : watchesOnPassage + watchesNeeded(passage.nm - watch.startNm - watch.plannedNm, reachOf(settings.watchMin, nmPerMinute(settings.pace)));
  const next = waypoints.find((w) => w.atNm > posNm + 0.05);
  const apps = settings.apps.filter((a) => a.enabled).length;
  const fraction = passage.nm > 0 ? posNm / passage.nm : 0;
  const watchEndFrac = (watch.startNm + watch.plannedNm) / passage.nm;
  const toName = to?.name ?? watch.toLabel;

  const dropAnchor = () => {
    setState((s) => endWatch(s, Date.now(), true));
    ambience.stop();
  };

  return (
    <>
      <section className="passage-card" aria-label="Current passage">
        <div className="passage-status">
          <span className="status-dot pulse" />
          <span className="eyebrow teal">
            Under way · watch {watchesOnPassage} of {totalWatches}
          </span>
        </div>
        <div className="passage-route">
          <span className="serif passage-from">{watch.resumed ? 'At sea' : from?.name ?? 'At sea'}</span>
          <ArrowRight />
          <span className="serif passage-to">{toName}</span>
        </div>
        <div className="passage-meta">
          <Flag flag={purpose.flag} />
          <span>
            {purpose.name} · cast off {time(watch.startedAt)} · {knots(speedOf(watch)).toLocaleString('en-GB', { maximumFractionDigits: 1 })} knots
          </span>
        </div>
        {watch.battened && (
          <div className="passage-batten">
            <ShieldIcon size={18} />
            <span className="passage-batten-text">
              <strong>Battened down</strong> · {plural(apps, 'app')}, {plural(settings.sites.length, 'site')}
            </span>
            <span className="mono teal small">{watch.heldOff} held off</span>
          </div>
        )}
      </section>

      <div className="chart-controls underway-controls">
        <button aria-label="Centre on the boat" onClick={() => chart.current?.flyTo(here.pos)}>
          <TargetIcon size={18} />
        </button>
        <button aria-label="Open the mini window" onClick={() => (platform.desktop ? platform.setMini(true) : void openMiniWindow())}>
          <MiniWindowIcon size={18} />
        </button>
        <button aria-label="Zoom in" onClick={() => chart.current?.zoomIn()}>
          <PlusIcon />
        </button>
        <button aria-label="Zoom out" onClick={() => chart.current?.zoomOut()}>
          <MinusIcon />
        </button>
      </div>

      {soundBlocked && (
        <button className="sound-chip" onClick={() => ambience.resume()}>
          <WavesIcon size={16} /> Sound is paused by the browser. Click to resume.
        </button>
      )}

      <section className="console" aria-label="Instruments">
        <div className="console-row">
          <div className="readout">
            <span className="readout-label">Time left</span>
            <span className="readout-value" role="timer" aria-live="off">
              {clock(prog.remainingMs)}
            </span>
            <span className="readout-sub">Watch ends {time(prog.endsAt)}</span>
          </div>
          <div className="readout">
            <span className="readout-label">To {toName}</span>
            <span className="readout-value">
              {distValue(remainingNm, settings.units)}
              <span className="readout-unit"> {unitLabel(settings.units)}</span>
            </span>
            <span className="readout-sub">
              {distValue(posNm, settings.units)} of {dist(passage.nm, settings.units)} sailed
            </span>
          </div>
          <div className="readout">
            <span className="readout-label">Course</span>
            <span className="readout-value">{formatCourse(here.course)}</span>
            <span className="readout-sub">{next ? `${next.port.name} in ${dist(next.atNm - posNm, settings.units)}` : `${toName} ahead`}</span>
          </div>
          <div className="console-spacer" />
          <div className="sound-control">
            <WavesIcon size={18} />
            <label className="visually-hidden" htmlFor="sound-pick">
              Sound
            </label>
            <select
              id="sound-pick"
              className="sound-select"
              value={settings.sound}
              onChange={(e) => {
                const sound = e.target.value as SoundId;
                setState((s) => ({ ...s, settings: { ...s.settings, sound } }));
              }}
            >
              {SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="visually-hidden" htmlFor="sea-volume">
              Volume
            </label>
            <input
              id="sea-volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              disabled={settings.sound === 'off'}
              onChange={(e) => {
                const volume = Number(e.target.value) / 100;
                ambience.setVolume(volume);
                setState((s) => ({ ...s, settings: { ...s.settings, volume } }));
              }}
            />
          </div>
          <HoldButton className="btn anchor-btn" onComplete={dropAnchor} ms={2000}>
            <AnchorIcon size={18} />
            Hold to drop anchor
          </HoldButton>
        </div>

        <div className="passage-bar" role="img" aria-label={`Passage progress: ${Math.round(fraction * 100)} percent${next ? `, next ${next.port.name}` : ''}`}>
          <div className="passage-bar-track" />
          <div className="passage-bar-done" style={{ width: `${fraction * 100}%` }} />
          <span className="passage-bar-start" />
          {waypoints.map((w) => (
            <span key={w.port.id} className={`passage-bar-wp${w.atNm <= posNm ? ' passed' : ''}`} style={{ left: `${(w.atNm / passage.nm) * 100}%` }} />
          ))}
          {!finishesThisWatch && <span className="passage-bar-watchend" style={{ left: `${watchEndFrac * 100}%` }} title="This watch ends here" />}
          <span className="passage-bar-end" />
          <span className="passage-bar-boat" style={{ left: `${fraction * 100}%` }}>
            <BoatGlyph size={16} course={90} hull="var(--chrome)" />
          </span>
          <span className="passage-bar-label start">{watch.resumed && !from ? 'At sea' : from?.name ?? 'At sea'}</span>
          {waypoints.map((w) => (
            <span key={'l' + w.port.id} className="passage-bar-label mid" style={{ left: `${(w.atNm / passage.nm) * 100}%` }}>
              {w.port.name}
            </span>
          ))}
          <span className="passage-bar-label end">{toName}</span>
        </div>
      </section>
    </>
  );
}

