import { useEffect, useMemo, useState } from 'react';
import { Flag } from '../../components/Flag';
import { AnchorBadge, PortStamp } from '../../components/Stamps';
import { emit } from '../../lib/bus';
import { dist, distRound, duration, plural, shortDate, time } from '../../lib/format';
import { exploreBand, exploreRadius, suggest, waypointsAlong, type Destination } from '../../lib/passage';
import { countryName, portsWithin, type PortIndex } from '../../lib/ports';
import { navigate } from '../../lib/router';
import { explore } from '../../lib/routing';
import { getState, setState, useStore } from '../../lib/store';
import { MS_PER_NM, portStamps, updateWatch } from '../../lib/voyage';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function PortDialog({ ports, watchId }: { ports: PortIndex; watchId: string }) {
  const watch = useStore((s) => s.watches.find((w) => w.id === watchId) ?? null);
  const passage = useStore((s) => s.passages.find((p) => p.id === watch?.passageId) ?? null);
  const purposes = useStore((s) => s.purposes);
  const settings = useStore((s) => s.settings);
  const watchesOnPassage = useStore((s) => s.watches.filter((w) => w.passageId === watch?.passageId).length);
  const [note, setNote] = useState(watch?.note ?? '');
  const [nextLeg, setNextLeg] = useState<Destination | null>(null);

  const to = passage ? ports.byId.get(passage.toPortId) ?? null : null;
  const from = passage?.fromPortId ? ports.byId.get(passage.fromPortId) ?? null : null;
  const madePort = watch?.status === 'made_port';

  const stampCount = useMemo(() => portStamps(getState()).filter((p) => !p.home).length, [watchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const visits = useStore((s) => s.watches.filter((w) => w.status === 'made_port' && w.toPortId === passage?.toPortId).length);
  const via = useMemo(() => (passage ? waypointsAlong(passage.route, ports, new Set([passage.fromPortId ?? '', passage.toPortId]), 1)[0] : undefined), [passage, ports]);

  // suggest the next leg from the new harbour
  useEffect(() => {
    if (!madePort || !to) return;
    let cancelled = false;
    const W = settings.watchMin;
    const origin: [number, number] = [to.lon, to.lat];
    const radius = exploreRadius(W);
    const cands = portsWithin(ports, origin, radius).map((p) => ({ id: p.id, lon: p.lon, lat: p.lat }));
    const stamped = new Set(portStamps(getState()).map((p) => p.portId));
    explore(origin, radius, exploreBand(W), cands)
      .then((routed) => {
        if (cancelled) return;
        const s = suggest(routed, ports, origin, W, to.id, stamped);
        const fresh = [...s.one, ...s.longer].filter((d) => !stamped.has(d.port.id));
        setNextLeg(fresh[0] ?? s.one[0] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [madePort, to, ports, settings.watchMin]);

  if (!watch || !passage) return null;

  const purpose = purposes.find((p) => p.id === watch.purposeId) ?? purposes[0];
  const sailed = watch.sailedNm ?? 0;
  const ended = watch.endedAt ?? Date.now();
  const toName = to?.name ?? watch.toLabel;

  const close = (then?: () => void) => {
    setState((s) => ({ ...updateWatch(s, watch.id, { note: note.trim() || undefined }), reviewWatchId: null }));
    then?.();
  };

  let eyebrow: string;
  let title: string;
  let body: string;
  if (madePort) {
    eyebrow = `Made port · ${time(ended)}`;
    title = [toName, to ? countryName(to.cc) : ''].filter(Boolean).join(', ');
    const fromText = from ? `from ${from.name}` : 'from your anchorage';
    const how = watchesOnPassage > 1 ? `over ${plural(watchesOnPassage, 'watch', 'watches')}` : 'in one watch';
    const stampText = watch.newPort ? `New port stamp: your ${ordinal(stampCount)}.` : visits > 1 ? `Your ${ordinal(visits)} time in ${toName}.` : '';
    body = `${dist(passage.nm, settings.units)} ${fromText}${via ? `, past ${via.port.name}` : ''}, ${how}. ${stampText}`.trim();
  } else if (watch.status === 'anchored') {
    eyebrow = `Watch complete · ${time(ended)}`;
    title = 'Anchored at sea';
    body = `${dist(sailed, settings.units)} sailed toward ${toName}. ${distRound(passage.nm - passage.sailedNm, settings.units)} to go; you pick up from here next watch.`;
  } else {
    eyebrow = `Dropped anchor · ${time(ended)}`;
    title = 'Anchored at sea';
    body = `You sailed ${dist(sailed, settings.units)} toward ${toName} before dropping anchor. The passage waits here for you, ${distRound(passage.nm - passage.sailedNm, settings.units)} out.`;
  }

  return (
    <>
      <div className="scrim" />
      <div className="dialog-wrap">
        <section role="dialog" aria-modal="true" aria-labelledby="port-title" className="dialog">
          <div className="port-head">
            {madePort && to ? <PortStamp name={to.name} lat={to.lat} lon={to.lon} date={shortDate(ended) + ' ' + new Date(ended).getFullYear()} /> : <AnchorBadge />}
            <div className="port-head-text">
              <span className={`eyebrow ${madePort ? 'red' : 'teal'}`}>{eyebrow}</span>
              <h1 id="port-title" className="port-title serif">
                {title}
              </h1>
              <p className="port-body">{body}</p>
            </div>
          </div>

          <div className="stat-grid four">
            <div className="stat">
              <span className="label-caps">Sailed</span>
              <span className="stat-value">{dist(sailed, settings.units)}</span>
            </div>
            <div className="stat">
              <span className="label-caps">Watch</span>
              <span className="stat-value">{duration(sailed * MS_PER_NM)}</span>
            </div>
            <div className="stat">
              <span className="label-caps">Purpose</span>
              <span className="stat-purpose">
                <Flag flag={purpose.flag} />
                {purpose.name}
              </span>
            </div>
            <div className="stat">
              <span className="label-caps">Held off</span>
              <span className="stat-value">{watch.battened ? plural(watch.heldOff, 'try', 'tries') : '—'}</span>
            </div>
          </div>

          <div className="note-field">
            <label htmlFor="log-note">Note for the logbook</label>
            <textarea id="log-note" className="field" rows={3} placeholder="What did you get done on this watch?" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="port-actions">
            {madePort ? (
              nextLeg ? (
                <button
                  className="btn white port-next"
                  onClick={() =>
                    close(() => {
                      navigate('chart');
                      emit('plan-pick', nextLeg.port.id);
                    })
                  }
                >
                  Next leg: <span className="serif">{nextLeg.port.name}</span>
                  <span className="mono muted">· {distRound(nextLeg.nm, settings.units)}</span>
                </button>
              ) : (
                <button className="btn white port-next" onClick={() => close(() => navigate('chart'))}>
                  Plan the next leg
                </button>
              )
            ) : (
              <button className="btn white port-next" onClick={() => close(() => navigate('chart'))}>
                Resume passage
              </button>
            )}
            <button className="btn primary port-log" onClick={() => close(() => navigate('logbook'))}>
              {madePort ? 'Log it and go ashore' : 'Log it and rest'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
