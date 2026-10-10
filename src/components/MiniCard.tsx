import { Flag } from './Flag';
import { ExpandIcon, Pennant } from './icons';
import { clock, dist, time } from '../lib/format';
import { useNow } from '../lib/hooks';
import { platform } from '../lib/platform';
import { usePorts } from '../lib/ports';
import { useStore } from '../lib/store';
import { activeWatch, anchoredPassage, boatPortId, passageOf, progress } from '../lib/voyage';

/** The always-on-top mini window ("binnacle"): time left, destination, progress. */
export function MiniCard({ onClose }: { onClose: () => void }) {
  const watch = useStore(activeWatch);
  const passage = useStore((s) => passageOf(s, activeWatch(s)?.passageId));
  const purposes = useStore((s) => s.purposes);
  const units = useStore((s) => s.settings.units);
  const anchored = useStore(anchoredPassage);
  const portId = useStore(boatPortId);
  const ports = usePorts();
  const now = useNow(1000);
  const desktop = platform.desktop;

  const head = (
    <div className="mini-head" data-tauri-drag-region={desktop || undefined}>
      <Pennant size={14} />
      <span className="mini-brand" data-tauri-drag-region={desktop || undefined}>
        Leeward
      </span>
      <button className="mini-btn" aria-label="Open the chart" onClick={() => platform.focusMain('chart')}>
        <ExpandIcon />
      </button>
      <button className="mini-btn" aria-label="Close the mini window" onClick={onClose}>
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
    </div>
  );

  if (!watch || !passage) {
    const where = anchored ? 'Anchored at sea' : portId && ports ? `Moored at ${ports.byId.get(portId)?.name ?? '…'}` : 'In harbour';
    return (
      <section className="mini" aria-label="Mini window">
        {head}
        <div className="mini-body idle">
          <span className="mini-idle-text">{where}</span>
          <button className="mini-cta" onClick={() => platform.focusMain('chart')}>
            {anchored ? 'Resume passage' : 'Plan a watch'}
          </button>
        </div>
      </section>
    );
  }

  const prog = progress(watch, now);
  const posNm = Math.min(passage.nm, watch.startNm + prog.sailedNm);
  const frac = passage.nm ? posNm / passage.nm : 0;
  const purpose = purposes.find((p) => p.id === watch.purposeId) ?? purposes[0];
  const finishing = watch.startNm + watch.plannedNm >= passage.nm - 0.01;

  return (
    <section className="mini" aria-label="Mini window">
      {head}
      <div className="mini-body">
        <div className="mini-row">
          <span className="mini-time" role="timer">
            {clock(prog.remainingMs)}
          </span>
          <span className="mini-dest">
            <span className="mini-to">
              to <span className="serif">{watch.toLabel}</span>
            </span>
            <span className="mono mini-meta">
              {dist(passage.nm - posNm, units)} · {finishing ? 'lands' : 'anchors'} {time(prog.endsAt)}
            </span>
          </span>
          <span className="mini-purpose">
            <Flag flag={purpose.flag} width={20} />
            {purpose.name}
          </span>
        </div>
        <div className="mini-bar" role="img" aria-label={`Passage ${Math.round(frac * 100)} percent complete`}>
          <div className="mini-bar-track" />
          <div className="mini-bar-done" style={{ width: `${frac * 100}%` }} />
          <span className="mini-bar-end" />
          <span className="mini-bar-boat" style={{ left: `${frac * 100}%` }} />
        </div>
      </div>
    </section>
  );
}
