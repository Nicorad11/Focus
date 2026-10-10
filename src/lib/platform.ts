// Everything that differs between the browser build and the Windows app lives behind this interface.
// The UI never talks to Windows directly; in the desktop build it asks the Rust core over Tauri IPC.

export interface RunningApp {
  name: string;
  exe: string;
  path?: string;
}

export interface HelperStatus {
  browser: string;
  lastSeen: number | null;
}

export interface BlockerConfig {
  active: boolean;
  firmness: 'steady' | 'storm';
  apps: { name: string; exe: string }[];
  sites: string[];
  destination: string;
  endsAt: number | null;
  watchId: string | null;
}

export type WindowKind = 'main' | 'mini' | 'tray' | 'shield';

export type PlatformEvent =
  | { type: 'held-off'; name: string; kind: 'app' | 'site' }
  | { type: 'opened-anyway'; name: string; kind: 'app' | 'site' }
  | { type: 'shield'; name: string; exe: string }
  | { type: 'navigate'; route: string }
  | { type: 'drop-anchor' };

export interface Platform {
  desktop: boolean;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  focusMain(route?: string): void;
  setProgress(fraction: number | null): void;
  setTray(minutesLeft: number | null, tooltip: string): void;
  setMini(show: boolean): void;
  notificationPermission(): Promise<NotificationPermission>;
  requestNotifications(): Promise<boolean>;
  notify(title: string, body: string): void;
  openNotificationSettings(): void;
  setBlocker(cfg: BlockerConfig): void;
  runningApps(): Promise<RunningApp[]>;
  pickExecutable(): Promise<RunningApp | null>;
  helperStatus(): Promise<HelperStatus[]>;
  openExtensionFolder(): void;
  setAutostart(on: boolean): Promise<void>;
  idleSeconds(): Promise<number | null>;
  /** Save a text file the user names (CSV export, backups). */
  saveFile(name: string, mime: string, contents: string): Promise<boolean>;
  emit(e: PlatformEvent): void;
  on(cb: (e: PlatformEvent) => void): () => void;
  quit(): void;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ---------------------------------------------------------------- browser

function webPlatform(): Platform {
  const bus = new EventTarget();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leeward-events') : null;
  channel?.addEventListener('message', (e) => bus.dispatchEvent(new CustomEvent('e', { detail: e.data })));
  const baseTitle = document.title;
  return {
    desktop: false,
    minimize() {},
    toggleMaximize() {},
    close() {},
    focusMain(route) {
      window.focus();
      if (route) location.hash = '#/' + route;
    },
    setProgress() {},
    setTray(minutesLeft, tooltip) {
      document.title = minutesLeft == null ? baseTitle : `${tooltip} · Leeward`;
    },
    setMini() {},
    async notificationPermission() {
      return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
    },
    async requestNotifications() {
      if (typeof Notification === 'undefined') return false;
      if (Notification.permission === 'granted') return true;
      return (await Notification.requestPermission()) === 'granted';
    },
    notify(title, body) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(title, { body, icon: './favicon.svg' });
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }
    },
    openNotificationSettings() {},
    setBlocker() {},
    async runningApps() {
      return [];
    },
    async pickExecutable() {
      return null;
    },
    async helperStatus() {
      return [];
    },
    openExtensionFolder() {},
    async setAutostart() {},
    async idleSeconds() {
      return null;
    },
    async saveFile(name, mime, contents) {
      const url = URL.createObjectURL(new Blob([contents], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    },
    emit(e) {
      bus.dispatchEvent(new CustomEvent('e', { detail: e }));
      channel?.postMessage(e);
    },
    on(cb) {
      const h = (ev: Event) => cb((ev as CustomEvent<PlatformEvent>).detail);
      bus.addEventListener('e', h);
      return () => bus.removeEventListener('e', h);
    },
    quit() {},
  };
}

// ---------------------------------------------------------------- Windows (Tauri)

function desktopPlatform(): Platform {
  const core = import('@tauri-apps/api/core');
  const win = import('@tauri-apps/api/window');
  const event = import('@tauri-apps/api/event');
  const call = <T,>(cmd: string, args?: Record<string, unknown>) => core.then((c) => c.invoke<T>(cmd, args));
  const swallow = (p: Promise<unknown>) => p.catch((e) => console.warn(e));
  let lastTrayKey = '';

  return {
    desktop: true,
    minimize: () => void swallow(win.then((w) => w.getCurrentWindow().minimize())),
    toggleMaximize: () => void swallow(win.then((w) => w.getCurrentWindow().toggleMaximize())),
    close: () => void swallow(win.then((w) => w.getCurrentWindow().close())),
    focusMain: (route) => void swallow(call('focus_main', { route: route ?? null })),
    setProgress(fraction) {
      void swallow(
        win.then((w) =>
          w.getCurrentWindow().setProgressBar(
            fraction == null
              ? { status: w.ProgressBarStatus.None }
              : { status: w.ProgressBarStatus.Normal, progress: Math.round(fraction * 100) },
          ),
        ),
      );
    },
    setTray(minutesLeft, tooltip) {
      const key = `${minutesLeft}|${tooltip}`;
      if (key === lastTrayKey) return;
      lastTrayKey = key;
      void swallow(
        (async () => {
          const [{ TrayIcon }, { Image }] = await Promise.all([import('@tauri-apps/api/tray'), import('@tauri-apps/api/image')]);
          const tray = await TrayIcon.getById('main');
          if (!tray) return;
          await tray.setTooltip(tooltip);
          const rgba = drawTrayIcon(minutesLeft);
          await tray.setIcon(await Image.new(rgba, 32, 32));
        })(),
      );
    },
    setMini: (show) => void swallow(call('show_mini', { show })),
    async notificationPermission() {
      const n = await import('@tauri-apps/plugin-notification');
      return (await n.isPermissionGranted()) ? 'granted' : 'default';
    },
    async requestNotifications() {
      const n = await import('@tauri-apps/plugin-notification');
      if (await n.isPermissionGranted()) return true;
      return (await n.requestPermission()) === 'granted';
    },
    notify(title, body) {
      void swallow(import('@tauri-apps/plugin-notification').then((n) => n.sendNotification({ title, body })));
    },
    openNotificationSettings() {
      void swallow(import('@tauri-apps/plugin-opener').then((o) => o.openUrl('ms-settings:notifications')));
    },
    setBlocker: (cfg) => void swallow(call('set_blocker', { config: cfg })),
    runningApps: () => call<RunningApp[]>('running_apps').catch(() => []),
    async pickExecutable() {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ multiple: false, directory: false, filters: [{ name: 'Programs', extensions: ['exe'] }] });
      if (!path || Array.isArray(path)) return null;
      const exe = path.split(/[\\/]/).pop() ?? path;
      return { name: exe.replace(/\.exe$/i, ''), exe: exe.toLowerCase(), path };
    },
    helperStatus: () => call<HelperStatus[]>('helper_status').catch(() => []),
    openExtensionFolder: () => void swallow(call('open_extension_folder')),
    async setAutostart(on) {
      const a = await import('@tauri-apps/plugin-autostart');
      if (on) await a.enable();
      else await a.disable();
    },
    idleSeconds: () => call<number>('idle_seconds').catch(() => null),
    saveFile: (name, _mime, contents) => call<boolean>('save_file', { name, contents }),
    emit: (e) => void swallow(event.then((ev) => ev.emit('leeward', e))),
    on(cb) {
      let un: (() => void) | null = null;
      let cancelled = false;
      void event.then((ev) =>
        ev.listen<PlatformEvent>('leeward', (e) => cb(e.payload)).then((u) => {
          if (cancelled) u();
          else un = u;
        }),
      );
      return () => {
        cancelled = true;
        un?.();
      };
    },
    quit: () => void swallow(call('quit_app')),
  };
}

/** 32×32 tray icon: the Leeward pennant, with the minutes left on a badge while under way. */
function drawTrayIcon(minutesLeft: number | null): Uint8Array {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.strokeStyle = '#E8EDF2';
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(6, 3);
  g.lineTo(6, 29);
  g.stroke();
  g.fillStyle = '#E0442C';
  g.beginPath();
  g.moveTo(7.5, 4);
  g.lineTo(29, 4);
  g.lineTo(22, 11);
  g.lineTo(29, 18);
  g.lineTo(7.5, 18);
  g.closePath();
  g.fill();
  if (minutesLeft != null) {
    const text = minutesLeft > 99 ? '99' : String(Math.max(0, minutesLeft));
    g.fillStyle = '#13233A';
    g.beginPath();
    g.roundRect(9, 17, 23, 15, 7);
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 20.5, 25);
  }
  return new Uint8Array(g.getImageData(0, 0, 32, 32).data.buffer);
}

export const platform: Platform = isTauri ? desktopPlatform() : webPlatform();

/** Which window this document is: the route decides (#/mini, #/tray, #/shield). */
export function windowKind(): WindowKind {
  const h = location.hash;
  if (h.startsWith('#/mini')) return 'mini';
  if (h.startsWith('#/tray')) return 'tray';
  if (h.startsWith('#/shield')) return 'shield';
  return 'main';
}
