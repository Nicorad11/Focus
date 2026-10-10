import type { ReactNode } from 'react';
import { platform } from '../lib/platform';
import { href, type Route } from '../lib/router';
import {
  AnchorIcon,
  ChartIcon,
  LogbookIcon,
  Pennant,
  SettingsIcon,
  ShieldIcon,
  WindowCloseIcon,
  WindowMaxIcon,
  WindowMinIcon,
} from './icons';

export function TitleBar({ status }: { status?: ReactNode }) {
  const desktop = platform.desktop;
  return (
    <header className="titlebar" data-tauri-drag-region={desktop || undefined}>
      <div className="titlebar-brand" data-tauri-drag-region={desktop || undefined}>
        <Pennant />
        <span className="wordmark" data-tauri-drag-region={desktop || undefined}>
          Leeward
        </span>
      </div>
      {status && (
        <span className="titlebar-status" data-tauri-drag-region={desktop || undefined} aria-live="off">
          {status}
        </span>
      )}
      <div className="titlebar-controls" data-tauri-drag-region={desktop || undefined}>
        {desktop && (
          <>
            <button className="titlebar-button" aria-label="Minimize" onClick={() => platform.minimize()}>
              <WindowMinIcon />
            </button>
            <button className="titlebar-button" aria-label="Maximize" onClick={() => platform.toggleMaximize()}>
              <WindowMaxIcon />
            </button>
            <button className="titlebar-button close" aria-label="Close" onClick={() => platform.close()}>
              <WindowCloseIcon />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

const ITEMS: { route: Route; label: string; icon: ReactNode }[] = [
  { route: 'chart', label: 'Chart', icon: <ChartIcon /> },
  { route: 'logbook', label: 'Logbook', icon: <LogbookIcon /> },
  { route: 'ports', label: 'Voyage', icon: <AnchorIcon /> },
  { route: 'batten', label: 'Batten', icon: <ShieldIcon /> },
];

export function Rail({ route, underWay }: { route: Route; underWay: boolean }) {
  return (
    <nav className="rail" aria-label="Main">
      {ITEMS.map((item) => (
        <a key={item.route} className="rail-item" href={href(item.route)} aria-current={route === item.route ? 'page' : undefined}>
          {item.icon}
          {item.label}
          {item.route === 'chart' && underWay && route !== 'chart' && <span className="rail-dot" aria-label="Under way" />}
        </a>
      ))}
      <a className="rail-item bottom" href={href('settings')} aria-current={route === 'settings' ? 'page' : undefined}>
        <SettingsIcon />
        Settings
      </a>
    </nav>
  );
}
