// The small extra windows of the desktop app. Each is the same web bundle at its own route.

import { useEffect, useState } from 'react';
import { Flag } from '../components/Flag';
import { HoldButton } from '../components/HoldButton';
import { AnchorIcon, ChartIcon, MiniWindowIcon, Pennant, ShieldIcon } from '../components/icons';
import { MiniCard } from '../components/MiniCard';
import { clock, dist, plural } from '../lib/format';
import { useNow } from '../lib/hooks';
import { platform } from '../lib/platform';
import { usePorts } from '../lib/ports';
import { setState, useStore } from '../lib/store';
import { activeWatch, anchoredPassage, boatPortId, endWatch, passageOf, progress } from '../lib/voyage';
import { ShieldCard } from './BattenDown';

async function invoke(cmd: string, args?: Record<string, unknown>) {
  const core = await import('@tauri-apps/api/core');
  return core.invoke(cmd, args);
}

export function MiniWindow() {
  useEffect(() => {
    document.body.classList.add('mini-window');
  }, []);
  return <MiniCard onClose={() => platform.setMini(false)} />;
}

export function TrayFlyout() {
  const watch = useStore(activeWatch);
  const passage = useStore((s) => passageOf(s, activeWatch(s)?.passageId));
  const settings = useStore((s) => s.settings);
  const anchored = useStore(anchoredPassage);
  const portId = useStore(boatPortId);
  const ports = usePorts();
  const now = useNow(1000);
  // the flyout window fits its content
  useEffect(() => {
    const el = document.querySelector('.tray');
    if (!el || !platform.desktop) return;
    const ro = new ResizeObserver(async () => {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setSize(new LogicalSize(380, Math.ceil(el.getBoundingClientRect().height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.add('tray-window');
    const hide = () => void invoke('hide_tray_flyout').catch(() => {});
    window.addEventListener('blur', hide);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', esc);
    };
  }, []);

  const from = passage?.fromPortId && ports ? ports.byId.get(passage.fromPortId)?.name : null;
  const prog = watch ? progress(watch, now) : null;
  const posNm = watch && passage && prog ? Math.min(passage.nm, watch.startNm + prog.sailedNm) : 0;
  const apps = settings.apps.filter((a) => a.enabled).length;

  return (
    <section className="tray" aria-label="Leeward">
      <div className="tray-head">
        <Pennant size={18} mast="var(--ink)" />
        <span className="wordmark small">Leeward</span>
        <span className={`tray-status${watch ? '' : ' idle'}`}>
          <span className="status-dot" />
          {watch ? 'Under way' : anchored ? 'Anchored' : 'In harbour'}
        </span>
      </div>
      {watch && passage && prog ? (
        <div className="tray-passage">
          <span className="serif tray-route">
            {watch.resumed ? 'At sea' : from ?? watch.fromLabel} → {watch.toLabel}
          </span>
          <span className="mono tray-meta">
            {clock(prog.remainingMs)} left · {dist(passage.nm - posNm, settings.units)} to go
          </span>
          <span className="tray-bar">
            <span style={{ width: `${(posNm / passage.nm) * 100}%` }} />
          </span>
        </div>
      ) : (
        <div className="tray-passage">
          <span className="serif tray-route">{anchored ? 'Anchored at sea' : `Moored at ${portId && ports ? ports.byId.get(portId)?.name ?? '…' : '…'}`}</span>
        </div>
      )}
      <div className="tray-menu">
        <button className="tray-item" onClick={() => platform.focusMain('chart')}>
          <ChartIcon size={18} />
          {watch ? 'Show the chart' : anchored ? 'Resume passage' : 'Plan a watch'}
        </button>
        <label className="tray-item">
          <MiniWindowIcon size={18} />
          <span style={{ flex: 1 }}>Mini window on top</span>
          <input
            className="switch"
            type="checkbox"
            role="switch"
            checked={settings.miniOnTop}
            onChange={(e) => {
              const on = e.target.checked;
              setState((s) => ({ ...s, settings: { ...s.settings, miniOnTop: on } }));
              if (watch) platform.setMini(on);
            }}
          />
        </label>
        {watch ? (
          <HoldButton className="tray-item danger" onComplete={() => setState((s) => endWatch(s, Date.now(), true))}>
            <AnchorIcon size={18} />
            Hold to drop anchor
          </HoldButton>
        ) : (
          <button className="tray-item" onClick={() => platform.quit()}>
            Quit Leeward
          </button>
        )}
      </div>
      {watch?.battened && (
        <div className="tray-foot">
          <ShieldIcon size={14} />
          Battened down · {plural(apps, 'app')}, {plural(settings.sites.length, 'site')}
        </div>
      )}
    </section>
  );
}

export function ShieldWindow() {
  const watch = useStore(activeWatch);
  const firmness = useStore((s) => s.settings.firmness);
  const purposes = useStore((s) => s.purposes);
  const [blocked, setBlocked] = useState<{ name: string; exe: string }>(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
    return { name: q.get('name') ?? 'This app', exe: q.get('exe') ?? '' };
  });
  const now = useNow(1000);
  useEffect(() => {
    document.body.classList.add('shield-window');
    return platform.on((e) => {
      if (e.type === 'shield') setBlocked({ name: e.name, exe: e.exe });
    });
  }, []);
  const prog = watch ? progress(watch, now) : null;
  const purpose = watch ? purposes.find((p) => p.id === watch.purposeId) : null;
  return (
    <div className="shield-screen">
      <div className="shield-wrap">
        <div className="shield-brand">
          <Pennant size={20} />
          <span className="wordmark">Leeward</span>
          {purpose && (
            <span className="shield-purpose">
              <Flag flag={purpose.flag} width={20} />
              {purpose.name}
            </span>
          )}
        </div>
        <ShieldCard
          name={blocked.name}
          minutes={prog ? Math.max(1, Math.ceil(prog.remainingMs / 60000)) : 0}
          port={watch?.toLabel ?? 'port'}
          firmness={firmness}
          onBack={() => void invoke('shield_action', { action: 'back', exe: blocked.exe })}
          onOpen={() => void invoke('shield_action', { action: 'open', exe: blocked.exe })}
        />
        {prog && <p className="shield-clock mono">{clock(prog.remainingMs)} left on this watch</p>}
      </div>
    </div>
  );
}
