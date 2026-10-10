import { useEffect, useState } from 'react';
import { HoldButton } from '../components/HoldButton';
import { CloseIcon, ExternalIcon, PlusIcon, ShieldPlain } from '../components/icons';
import { toast } from '../components/Toasts';
import { SUGGESTED_APPS } from '../lib/defaults';
import { plural } from '../lib/format';
import { platform, type HelperStatus, type RunningApp } from '../lib/platform';
import { setState, useStore } from '../lib/store';
import type { BlockApp, Firmness, Settings } from '../lib/types';

function patch(p: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...p } }));
}

/** "https://www.YouTube.com/watch?v=1" → "youtube.com" */
export function normalizeSite(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#]/)[0].split(':')[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

const HELPER_BROWSERS = [
  { id: 'edge', name: 'Microsoft Edge' },
  { id: 'chrome', name: 'Google Chrome' },
  { id: 'firefox', name: 'Firefox' },
];

export function BattenDown() {
  const settings = useStore((s) => s.settings);
  const { apps, sites, firmness } = settings;
  const enabled = apps.filter((a) => a.enabled).length;
  const [siteDraft, setSiteDraft] = useState('');
  const [siteError, setSiteError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [helpers, setHelpers] = useState<HelperStatus[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!platform.desktop) return;
    const load = () => {
      platform.helperStatus().then(setHelpers);
      setNow(Date.now());
    };
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, []);

  const setApp = (id: string, p: Partial<BlockApp>) => patch({ apps: apps.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const removeApp = (id: string) => patch({ apps: apps.filter((a) => a.id !== id) });
  const addApp = (a: { name: string; exe: string; category?: string }) => {
    const exe = a.exe.toLowerCase().trim();
    if (!exe) return;
    if (apps.some((x) => x.exe === exe)) {
      toast(`${a.name} is already on the list.`);
      return;
    }
    patch({ apps: [...apps, { id: exe, name: a.name.trim() || exe, exe, category: a.category ?? 'App', enabled: true }] });
  };

  const addSite = () => {
    const site = normalizeSite(siteDraft);
    if (!site) {
      setSiteError('Enter a web address like news.example.com');
      return;
    }
    if (sites.includes(site)) {
      setSiteError(`${site} is already on the list`);
      return;
    }
    patch({ sites: [...sites, site] });
    setSiteDraft('');
    setSiteError(null);
  };

  return (
    <div className="page">
      <div className="page-pad narrowish">
        <div className="page-head-text">
          <span className="eyebrow">Distractions</span>
          <h1 className="page-title">Batten down</h1>
          <p className="page-lede">What stays below deck while you’re on watch. It applies to every watch; you can leave it off for one when you cast off.</p>
        </div>

        {!platform.desktop && (
          <div className="notice">
            <ShieldPlain size={20} />
            <span>
              <strong>Blocking runs in the Windows app.</strong> In the browser your lists are saved and the shield below shows what a blocked app looks like, but
              nothing is blocked.
            </span>
          </div>
        )}

        <fieldset className="firmness">
          <legend className="eyebrow">How firm</legend>
          {(
            [
              ['steady', 'Steady', 'A blocked app shows a shield. Hold for 3 seconds to open it anyway; the log notes it.'],
              ['storm', 'Storm', 'Nothing opens until you make port or drop anchor.'],
            ] as [Firmness, string, string][]
          ).map(([id, name, text]) => (
            <label key={id} className={`firm-card${firmness === id ? ' on' : ''}`}>
              <input type="radio" name="firmness" checked={firmness === id} onChange={() => patch({ firmness: id })} />
              <span className="firm-text">
                <span className="firm-name">{name}</span>
                <span className="firm-desc">{text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="batten-grid">
          <section aria-labelledby="apps-title" className="card apps-card">
            <div className="card-head">
              <h2 id="apps-title" className="card-title">
                Apps
              </h2>
              <span className="meta">
                {enabled} of {apps.length} below deck
              </span>
            </div>
            {apps.length === 0 && <p className="hint">No apps yet.</p>}
            {apps.map((a) => (
              <div key={a.id} className="row tall app-row">
                <span className="app-badge" aria-hidden="true">
                  {a.name.charAt(0).toUpperCase()}
                </span>
                <label className="row-main" htmlFor={`app-${a.id}`}>
                  <span className="row-title">{a.name}</span>
                  <span className="row-sub">
                    {a.category} · <span className="mono">{a.exe}</span>
                    {!a.enabled && ' · stays on deck'}
                  </span>
                </label>
                <button className="icon-btn remove" aria-label={`Remove ${a.name}`} onClick={() => removeApp(a.id)}>
                  <CloseIcon />
                </button>
                <input id={`app-${a.id}`} className="switch" type="checkbox" role="switch" checked={a.enabled} onChange={(e) => setApp(a.id, { enabled: e.target.checked })} />
              </div>
            ))}
            {adding ? <AddApp existing={apps} onAdd={addApp} onDone={() => setAdding(false)} /> : (
              <button className="btn dashed add-btn" onClick={() => setAdding(true)}>
                <PlusIcon />
                Add an app
              </button>
            )}
          </section>

          <div className="batten-side">
            <section aria-labelledby="sites-title" className="card">
              <div className="card-head">
                <h2 id="sites-title" className="card-title">
                  Websites
                </h2>
                <span className="meta">{plural(sites.length, 'site')}</span>
              </div>
              {sites.map((site) => (
                <div key={site} className="row">
                  <span className="mono site-name">{site}</span>
                  <button className="icon-btn" aria-label={`Remove ${site}`} onClick={() => patch({ sites: sites.filter((x) => x !== site) })}>
                    <CloseIcon />
                  </button>
                </div>
              ))}
              <label htmlFor="add-site" className="add-site-label">
                Add a site
              </label>
              <form
                className="add-site"
                onSubmit={(e) => {
                  e.preventDefault();
                  addSite();
                }}
              >
                <input
                  id="add-site"
                  className="field mono"
                  type="text"
                  inputMode="url"
                  placeholder="e.g. news.example.com"
                  value={siteDraft}
                  onChange={(e) => {
                    setSiteDraft(e.target.value);
                    setSiteError(null);
                  }}
                  aria-invalid={!!siteError}
                  aria-describedby={siteError ? 'site-error' : undefined}
                />
                <button className="btn dark" type="submit">
                  Add
                </button>
              </form>
              {siteError && (
                <p id="site-error" className="hint error">
                  {siteError}
                </p>
              )}
              <p className="hint">Subdomains are included: blocking youtube.com also blocks m.youtube.com.</p>
            </section>

            <section aria-labelledby="helpers-title" className="card">
              <h2 id="helpers-title" className="card-title" style={{ marginBottom: 6 }}>
                Browser helpers
              </h2>
              <p className="hint" style={{ marginBottom: 8 }}>
                Sites are blocked by a small helper inside each browser. It only checks the address of the tab you open.
              </p>
              {HELPER_BROWSERS.map((b) => {
                const st = helpers.find((h) => h.browser === b.id);
                const connected = !!st?.lastSeen && now - st.lastSeen < 120_000;
                return (
                  <div key={b.id} className="row">
                    <span className="row-title" style={{ flex: 1 }}>
                      {b.name}
                    </span>
                    {connected ? (
                      <span className="connected">
                        <span className="status-dot" />
                        Connected
                      </span>
                    ) : (
                      <>
                        <span className="row-sub">{platform.desktop ? (st?.lastSeen ? 'Not running' : 'Not installed') : 'Needs the Windows app'}</span>
                        {platform.desktop && (
                          <button className="btn white small" onClick={() => platform.openExtensionFolder()}>
                            Install helper
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </section>
          </div>
        </div>

        <div className="batten-grid">
          <section aria-labelledby="notif-title" className="card notif-card">
            <h2 id="notif-title" className="card-title">
              Windows notifications
            </h2>
            <p className="card-text">Windows doesn’t let apps turn on Do Not Disturb by themselves, so Leeward reminds you as you cast off.</p>
            <label className="row" style={{ borderBottom: 0 }}>
              <span className="row-title" style={{ flex: 1 }}>
                Remind me at cast off
              </span>
              <input className="switch" type="checkbox" role="switch" checked={settings.remindDnd} onChange={(e) => patch({ remindDnd: e.target.checked })} />
            </label>
            {platform.desktop && (
              <button className="btn white" style={{ alignSelf: 'flex-start' }} onClick={() => platform.openNotificationSettings()}>
                Open notification settings
                <ExternalIcon />
              </button>
            )}
          </section>

          <section aria-labelledby="shield-title" className="shield-preview">
            <h2 id="shield-title" className="eyebrow light">
              What a blocked app shows
            </h2>
            <ShieldCard name={apps.find((a) => a.enabled)?.name ?? 'Discord'} minutes={24} port="Ystad" firmness={firmness} preview />
          </section>
        </div>
      </div>
    </div>
  );
}

function AddApp({ existing, onAdd, onDone }: { existing: BlockApp[]; onAdd: (a: RunningApp & { category?: string }) => void; onDone: () => void }) {
  const [running, setRunning] = useState<RunningApp[] | null>(platform.desktop ? null : []);
  const [name, setName] = useState('');
  const [exe, setExe] = useState('');
  useEffect(() => {
    if (platform.desktop) platform.runningApps().then(setRunning);
  }, []);
  const has = (e: string) => existing.some((a) => a.exe === e.toLowerCase());
  const suggestions = SUGGESTED_APPS.filter((a) => !has(a.exe));
  const live = (running ?? []).filter((a) => !has(a.exe));

  return (
    <div className="add-app">
      {platform.desktop && (
        <>
          <h3 className="eyebrow">Running now</h3>
          {running === null && <p className="hint">Looking at open windows…</p>}
          {running && live.length === 0 && <p className="hint">Nothing new is running.</p>}
          <div className="pick-list">
            {live.map((a) => (
              <button key={a.exe} className="pick" onClick={() => onAdd({ ...a, category: 'App' })}>
                <span className="app-badge small">{a.name.charAt(0).toUpperCase()}</span>
                <span className="pick-name">{a.name}</span>
                <span className="mono pick-exe">{a.exe}</span>
              </button>
            ))}
          </div>
          <button
            className="btn white small"
            onClick={async () => {
              const a = await platform.pickExecutable();
              if (a) onAdd(a);
            }}
          >
            Browse for a program…
          </button>
        </>
      )}
      {suggestions.length > 0 && (
        <>
          <h3 className="eyebrow">Common distractions</h3>
          <div className="pick-list">
            {suggestions.map((a) => (
              <button key={a.exe} className="pick" onClick={() => onAdd(a)}>
                <span className="app-badge small">{a.name.charAt(0)}</span>
                <span className="pick-name">{a.name}</span>
                <span className="mono pick-exe">{a.exe}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h3 className="eyebrow">By program name</h3>
      <form
        className="add-app-form"
        onSubmit={(e) => {
          e.preventDefault();
          const file = exe.trim().toLowerCase();
          if (!file) return;
          onAdd({ name: name || file.replace(/\.exe$/, ''), exe: file.endsWith('.exe') ? file : file + '.exe' });
          setName('');
          setExe('');
        }}
      >
        <label className="visually-hidden" htmlFor="app-name">
          App name
        </label>
        <input id="app-name" className="field" placeholder="Name, e.g. Slack" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="visually-hidden" htmlFor="app-exe">
          Program file
        </label>
        <input id="app-exe" className="field mono" placeholder="slack.exe" value={exe} onChange={(e) => setExe(e.target.value)} />
        <button className="btn dark" type="submit">
          Add
        </button>
      </form>
      <button className="btn ghost small" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

/** The shield shown over a blocked app; also used as the preview on this page. */
export function ShieldCard({
  name,
  minutes,
  port,
  firmness,
  preview,
  onBack,
  onOpen,
}: {
  name: string;
  minutes: number;
  port: string;
  firmness: Firmness;
  preview?: boolean;
  onBack?: () => void;
  onOpen?: () => void;
}) {
  return (
    <div className="shield-card">
      <span className="shield-icon">
        <ShieldPlain size={24} />
      </span>
      <div className="shield-text">
        <span className="shield-title">{name} is below deck</span>
        <span className="shield-sub">
          {minutes} min until you make port in <span className="serif">{port}</span>.
        </span>
        <div className="shield-actions">
          <button className="btn shield-back" onClick={onBack} tabIndex={preview ? -1 : 0}>
            Back to the chart
          </button>
          {firmness === 'steady' ? (
            preview ? (
              <button className="btn shield-open" tabIndex={-1}>
                Hold to open anyway
              </button>
            ) : (
              <ShieldHold onOpen={onOpen} />
            )
          ) : (
            <span className="shield-storm">Storm: nothing opens until you make port.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ShieldHold({ onOpen }: { onOpen?: () => void }) {
  return (
    <HoldButton className="btn shield-open" ms={3000} onComplete={() => onOpen?.()}>
      Hold to open anyway
    </HoldButton>
  );
}
