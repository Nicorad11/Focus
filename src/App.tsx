import { useEffect } from 'react';
import { Rail, TitleBar } from './components/Shell';
import { Toasts } from './components/Toasts';
import { AnchorIcon } from './components/icons';
import { clock, time } from './lib/format';
import { useNow } from './lib/hooks';
import { useWatchKeeper } from './lib/keeper';
import { windowKind } from './lib/platform';
import { usePorts } from './lib/ports';
import { useRoute } from './lib/router';
import { warmUp } from './lib/routing';
import { getState, useStore } from './lib/store';
import { activeWatch, anchoredPassage, boatPortId, progress } from './lib/voyage';
import { BattenDown } from './screens/BattenDown';
import { ChartScreen } from './screens/chart/ChartScreen';
import { Logbook } from './screens/Logbook';
import { Voyage } from './screens/Voyage';
import { Settings } from './screens/Settings';
import { Welcome } from './screens/Welcome';
import { MiniWindow, ShieldWindow, TrayFlyout } from './screens/windows';

// A page that embeds Leeward may already say light or dark on the root element; follow it in "system" mode.
const hostTheme = document.documentElement.dataset.theme;

function useTheme() {
  const pref = useStore((s) => s.settings.theme);
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const systemNight = hostTheme === 'dark' ? true : hostTheme === 'light' ? false : m.matches;
      const night = pref === 'night' || (pref === 'system' && systemNight);
      document.documentElement.dataset.theme = night ? 'night' : 'day';
    };
    apply();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, [pref]);
}

export function App() {
  useTheme();
  const kind = windowKind();
  if (kind === 'mini') return <MiniWindow />;
  if (kind === 'tray') return <TrayFlyout />;
  if (kind === 'shield') return <ShieldWindow />;
  return <MainWindow />;
}

function MainWindow() {
  const ports = usePorts();
  const { route } = useRoute();
  const onboarded = useStore((s) => s.onboarded);
  const watch = useStore(activeWatch);
  const keeper = useWatchKeeper();

  useEffect(() => warmUp(), []);

  return (
    <div className="shell">
      <TitleBar status={<StatusLine />} />
      <div className="shell-body">
        <Rail route={route} underWay={!!watch} />
        <main className="main">
          <ChartScreen ports={ports} visible={route === 'chart'} />
          {route === 'logbook' && <Logbook ports={ports} />}
          {route === 'ports' && <Voyage ports={ports} />}
          {route === 'batten' && <BattenDown />}
          {route === 'settings' && <Settings ports={ports} />}
          {!ports && <div className="chart-loading">Loading harbours…</div>}
          {ports && !onboarded && <Welcome ports={ports} />}
          {keeper.idle && watch && (
            <div className="idle-card" role="alertdialog" aria-labelledby="idle-title">
              <AnchorIcon size={22} />
              <div className="idle-text">
                <strong id="idle-title">Still on board?</strong>
                <span>No mouse or keyboard since {time(keeper.idle.since)}.</span>
              </div>
              <button className="btn white small" onClick={keeper.dismissIdle}>
                Yes, still on watch
              </button>
              <button className="btn dark small" onClick={keeper.anchorAtIdle}>
                Drop anchor at {time(keeper.idle.since)}
              </button>
            </div>
          )}
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function StatusLine() {
  const watch = useStore(activeWatch);
  const review = useStore((s) => s.watches.find((w) => w.id === s.reviewWatchId) ?? null);
  const portId = useStore(boatPortId);
  const anchored = useStore(anchoredPassage);
  const ports = usePorts();
  const now = useNow(1000);
  if (watch) return <>{`Under way to ${watch.toLabel} · ${clock(progress(watch, now).remainingMs)} left`}</>;
  if (review?.status === 'made_port') return <>{`Made port in ${review.toLabel} · ${time(review.endedAt ?? now)}`}</>;
  if (anchored) return <>{`Anchored at sea · bound for ${ports?.byId.get(anchored.toPortId)?.name ?? '…'}`}</>;
  if (portId && ports && getState().onboarded) return <>{`Moored at ${ports.byId.get(portId)?.name ?? '…'}`}</>;
  return null;
}
