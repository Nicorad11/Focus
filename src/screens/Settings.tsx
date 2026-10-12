import { useRef, useState } from 'react';
import { Flag, FLAG_PATTERNS } from '../components/Flag';
import { HoldButton } from '../components/HoldButton';
import { DownloadIcon, PlusIcon, SearchIcon, UploadIcon } from '../components/icons';
import { toast } from '../components/Toasts';
import { ambience, SOUNDS } from '../lib/audio';
import { FLAG_COLORS } from '../lib/defaults';
import { clearErrors, errorLog, errorReport } from '../lib/errors';
import { logbookCSV } from '../lib/exporting';
import { distRound, plural } from '../lib/format';
import { platform } from '../lib/platform';
import { placeLine, searchPorts, type PortIndex } from '../lib/ports';
import { getState, replaceState, resetState, setState, useStore } from '../lib/store';
import type { FlagPattern, Purpose, Settings as SettingsT, SoundId, ThemePref, Units } from '../lib/types';
import { activeWatch, anchoredPassage, BOAT_KNOTS, boatPortId, knots, newId, nmPerMinute, PACES, reachOf, type Pace } from '../lib/voyage';

function patch(p: Partial<SettingsT>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...p } }));
}

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';

export function Settings({ ports }: { ports: PortIndex | null }) {
  const settings = useStore((s) => s.settings);
  const purposes = useStore((s) => s.purposes);
  const underWay = useStore((s) => activeWatch(s) != null);
  const hereId = useStore(boatPortId);
  const anchored = useStore(anchoredPassage);
  const home = settings.homePortId && ports ? ports.byId.get(settings.homePortId) : null;
  const [changingHome, setChangingHome] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const awayFromHome = !underWay && (anchored || (hereId && hereId !== settings.homePortId));

  return (
    <div className="page">
      <div className="page-pad narrowish">
        <div className="page-head-text">
          <span className="eyebrow">Leeward {APP_VERSION}</span>
          <h1 className="page-title">Settings</h1>
        </div>

        <section className="card settings-card" aria-labelledby="home-title">
          <h2 id="home-title" className="card-title">
            Home port
          </h2>
          <div className="row">
            <div className="row-main">
              <span className="serif home-name">{home?.name ?? 'Not set'}</span>
              {home && <span className="row-sub">{placeLine(home)}</span>}
            </div>
            <button className="btn white small" onClick={() => setChangingHome((v) => !v)}>
              {changingHome ? 'Cancel' : 'Change'}
            </button>
          </div>
          {changingHome && ports && (
            <PortPicker
              ports={ports}
              onPick={(id) => {
                setState((s) => {
                  const atHomeOrNowhere = !s.boat || ('portId' in s.boat && s.boat.portId === s.settings.homePortId);
                  return {
                    ...s,
                    settings: { ...s.settings, homePortId: id },
                    // a boat still in the old home port moves with it
                    boat: atHomeOrNowhere && !activeWatch(s) ? { portId: id } : s.boat,
                  };
                });
                setChangingHome(false);
              }}
            />
          )}
          {awayFromHome && home && (
            <div className="row">
              <span className="row-sub" style={{ flex: 1 }}>
                {anchored ? 'The boat is anchored at sea mid-passage.' : `The boat is moored at ${ports?.byId.get(hereId ?? '')?.name ?? 'another harbour'}.`}
              </span>
              <button
                className="btn white small"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    passages: s.passages.map((p) => (anchored && p.id === anchored.id ? { ...p, status: 'abandoned' as const } : p)),
                    boat: { portId: s.settings.homePortId! },
                  }))
                }
              >
                Sail home instantly
              </button>
            </div>
          )}
        </section>

        <section className="card settings-card" aria-labelledby="units-title">
          <h2 id="units-title" className="card-title">
            Distance and pace
          </h2>
          <Choice<Units>
            label="Units"
            value={settings.units}
            options={[
              ['nm', 'Nautical miles'],
              ['km', 'Kilometres'],
              ['mi', 'Miles'],
            ]}
            onChange={(units) => patch({ units })}
          />
          <Choice<Pace>
            label="Pace"
            value={settings.pace}
            options={[
              ['half', PACES.half.name],
              ['real', PACES.real.name],
            ]}
            onChange={(pace) => patch({ pace })}
          />
          <p className="hint">
            {settings.pace === 'half'
              ? `The boat makes ${Math.round(knots(nmPerMinute('half')))} knots, twice a cruising yacht's ${BOAT_KNOTS}, so every passage takes half its real sailing time.`
              : `The boat makes ${BOAT_KNOTS} knots, like a cruising yacht, so every passage takes its real sailing time.`}{' '}
            A {settings.watchMin}-minute watch reaches about {distRound(reachOf(settings.watchMin, nmPerMinute(settings.pace)), settings.units)}. Watches already
            sailed keep the pace they were sailed at.
          </p>
        </section>

        <section className="card settings-card" aria-labelledby="sound-title">
          <h2 id="sound-title" className="card-title">
            Sound
          </h2>
          <div className="row">
            <label htmlFor="sound-setting" className="row-title" style={{ flex: 1 }}>
              On watch
            </label>
            <select id="sound-setting" className="field" value={settings.sound} onChange={(e) => patch({ sound: e.target.value as SoundId })}>
              {SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              className="btn white small"
              disabled={settings.sound === 'off' || underWay}
              onClick={() => {
                ambience.setVolume(settings.volume);
                ambience.play(settings.sound);
                window.setTimeout(() => {
                  if (!activeWatch(getState())) ambience.stop();
                }, 6000);
              }}
            >
              Listen
            </button>
          </div>
          <div className="row">
            <label htmlFor="volume-setting" className="row-title" style={{ flex: 1 }}>
              Volume
            </label>
            <input
              id="volume-setting"
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => {
                const volume = Number(e.target.value) / 100;
                ambience.setVolume(volume);
                patch({ volume });
              }}
            />
          </div>
          <label className="row">
            <span className="row-main">
              <span className="row-title">Ship’s bell</span>
              <span className="row-sub">Two bells as you cast off, two pairs when you make port</span>
            </span>
            <input className="switch" type="checkbox" role="switch" checked={settings.bell} onChange={(e) => patch({ bell: e.target.checked })} />
          </label>
        </section>

        <PurposeEditor purposes={purposes} />

        <section className="card settings-card" aria-labelledby="look-title">
          <h2 id="look-title" className="card-title">
            Appearance
          </h2>
          <Choice<ThemePref>
            label="Theme"
            value={settings.theme}
            options={[
              ['system', 'Match Windows'],
              ['day', 'Day'],
              ['night', 'Night watch'],
            ]}
            onChange={(theme) => patch({ theme })}
          />
          <Choice<'mercator' | 'globe'>
            label="Chart"
            value={settings.projection}
            options={[
              ['mercator', 'Flat chart'],
              ['globe', 'Globe'],
            ]}
            onChange={(projection) => patch({ projection })}
          />
        </section>

        <section className="card settings-card" aria-labelledby="notify-title">
          <h2 id="notify-title" className="card-title">
            Notifications
          </h2>
          <label className="row">
            <span className="row-main">
              <span className="row-title">Tell me when I make port</span>
              <span className="row-sub">A notification when the watch ends, even if Leeward is in the background</span>
            </span>
            <input
              className="switch"
              type="checkbox"
              role="switch"
              checked={settings.notifyLanding}
              onChange={async (e) => {
                const on = e.target.checked;
                patch({ notifyLanding: on });
                if (on && !(await platform.requestNotifications())) toast('Notifications are blocked for Leeward. Allow them in your browser or Windows settings.');
              }}
            />
          </label>
        </section>

        {platform.desktop && (
          <section className="card settings-card" aria-labelledby="win-title">
            <h2 id="win-title" className="card-title">
              Windows
            </h2>
            <label className="row">
              <span className="row-main">
                <span className="row-title">Start with Windows</span>
                <span className="row-sub">Leeward waits in the tray</span>
              </span>
              <input
                className="switch"
                type="checkbox"
                role="switch"
                checked={settings.launchAtLogin}
                onChange={async (e) => {
                  const on = e.target.checked;
                  try {
                    await platform.setAutostart(on);
                    patch({ launchAtLogin: on });
                  } catch (err) {
                    toast(`Couldn’t change startup: ${String(err)}`);
                  }
                }}
              />
            </label>
            <label className="row">
              <span className="row-main">
                <span className="row-title">Mini window while under way</span>
                <span className="row-sub">Time left and progress, always on top</span>
              </span>
              <input className="switch" type="checkbox" role="switch" checked={settings.miniOnTop} onChange={(e) => patch({ miniOnTop: e.target.checked })} />
            </label>
            <label className="row">
              <span className="row-main">
                <span className="row-title">Keep running in the tray</span>
                <span className="row-sub">Closing the window keeps the watch going; quit from the tray icon</span>
              </span>
              <input className="switch" type="checkbox" role="switch" checked={settings.closeToTray} onChange={(e) => patch({ closeToTray: e.target.checked })} />
            </label>
            <div className="row">
              <label htmlFor="idle-check" className="row-main">
                <span className="row-title">“Still on board?” check</span>
                <span className="row-sub">Ask after this long without mouse or keyboard input</span>
              </label>
              <select id="idle-check" className="field" value={settings.idleCheckMin} onChange={(e) => patch({ idleCheckMin: Number(e.target.value) })}>
                <option value={0}>Off</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
            <div className="row">
              <span className="row-main">
                <span className="row-title">Bring Leeward forward</span>
                <span className="row-sub">From anywhere in Windows</span>
              </span>
              <kbd className="kbd">Ctrl</kbd>
              <kbd className="kbd">Alt</kbd>
              <kbd className="kbd">L</kbd>
            </div>
          </section>
        )}

        <section className="card settings-card" aria-labelledby="data-title">
          <h2 id="data-title" className="card-title">
            Your data
          </h2>
          <p className="card-text">No account and no tracking. Your logbook, where the boat is, and your achievements are saved on this device as you go. Back them up to move them to another computer.</p>
          <div className="button-row">
            <button
              className="btn white"
              onClick={async () => {
                const s = getState();
                await platform.saveFile('leeward-logbook.csv', 'text/csv', logbookCSV(s, s.watches));
              }}
            >
              <DownloadIcon />
              Export logbook (CSV)
            </button>
            <button
              className="btn white"
              onClick={async () => {
                const stamp = new Date().toISOString().slice(0, 10);
                if (await platform.saveFile(`leeward-backup-${stamp}.json`, 'application/json', JSON.stringify(getState(), null, 1))) toast('Backup saved.');
              }}
            >
              <DownloadIcon />
              Back up
            </button>
            <button className="btn white" onClick={() => fileInput.current?.click()} disabled={underWay}>
              <UploadIcon />
              Restore…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const data = JSON.parse(await file.text());
                  if (data?.v !== 1 || !Array.isArray(data.watches)) throw new Error('not a Leeward backup');
                  replaceState(data);
                  toast(`Restored ${data.watches.length} watches.`);
                } catch (err) {
                  toast(`Couldn’t restore: ${String((err as Error).message ?? err)}`);
                }
              }}
            />
          </div>
          <div className="row danger-row">
            <span className="row-main">
              <span className="row-title">Start over</span>
              <span className="row-sub">Erases the logbook, stamps and settings on this device</span>
            </span>
            <HoldButton
              className="btn white danger"
              ms={2500}
              onComplete={() => {
                ambience.stop();
                resetState();
                toast('Everything was erased.');
              }}
            >
              Hold to erase
            </HoldButton>
          </div>
        </section>

        <section className="card settings-card about" aria-labelledby="about-title">
          <h2 id="about-title" className="card-title">
            About
          </h2>
          <p className="card-text">
            Your boat sails at a cruising yacht’s {BOAT_KNOTS} knots, or twice that at half time. Coastlines from Natural Earth; harbours from Natural Earth and UN/LOCODE. The chart is for planning
            watches, not for navigation.
          </p>
          <ErrorReport />
        </section>
      </div>
    </div>
  );
}

/** Errors kept on this device, to copy into a bug report. */
function ErrorReport() {
  const [count, setCount] = useState(() => errorLog().length);
  if (!count) return null;
  return (
    <div className="row">
      <span className="row-main">
        <span className="row-title">Error report</span>
        <span className="row-sub">Leeward ran into {plural(count, 'problem')} on this device. Copy the details to report it.</span>
      </span>
      <button
        className="btn white small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(errorReport());
            toast('Error report copied.');
          } catch {
            toast('Couldn’t copy. Your browser blocked the clipboard.');
          }
        }}
      >
        Copy
      </button>
      <button
        className="btn white small"
        onClick={() => {
          clearErrors();
          setCount(0);
        }}
      >
        Clear
      </button>
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="row choice-row">
      <span className="row-title" style={{ flex: 1 }}>
        {label}
      </span>
      <div className="choice" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={value === v} className="choice-opt" onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PortPicker({ ports, onPick, autoFocus = true }: { ports: PortIndex; onPick: (id: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const results = q.trim() ? searchPorts(ports, q, undefined, 8) : [];
  return (
    <div className="port-search">
      <div className="port-search-field">
        <SearchIcon />
        <input className="field" type="search" autoFocus={autoFocus} placeholder="Search harbours and cities" aria-label="Search harbours" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {results.length > 0 && (
        <ul className="port-results">
          {results.map((p) => (
            <li key={p.id}>
              <button onClick={() => onPick(p.id)}>
                <span className="serif">{p.name}</span>
                <span className="row-sub">{placeLine(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && results.length === 0 && <p className="hint">No harbour by that name. Try the nearest coastal town.</p>}
    </div>
  );
}

const SWATCHES = Object.entries(FLAG_COLORS) as [string, string][];

function PurposeEditor({ purposes }: { purposes: Purpose[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (id: string, p: Partial<Purpose>) => setState((s) => ({ ...s, purposes: s.purposes.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const active = purposes.filter((p) => !p.archived);
  const archived = purposes.filter((p) => p.archived);
  return (
    <section className="card settings-card" aria-labelledby="purpose-title">
      <div className="card-head">
        <h2 id="purpose-title" className="card-title">
          Purpose flags
        </h2>
        <span className="meta">{active.length} flying</span>
      </div>
      {active.map((p) => (
        <div key={p.id} className="purpose-edit">
          <div className="row">
            <Flag flag={p.flag} width={30} />
            <label className="visually-hidden" htmlFor={`pname-${p.id}`}>
              Name
            </label>
            <input id={`pname-${p.id}`} className="field purpose-name-field" value={p.name} maxLength={24} onChange={(e) => update(p.id, { name: e.target.value })} />
            <button className="btn ghost small" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
              Flag
            </button>
            <button className="btn ghost small" disabled={active.length <= 1} onClick={() => update(p.id, { archived: true })}>
              Strike
            </button>
          </div>
          {open === p.id && (
            <div className="flag-editor">
              <div className="flag-patterns" role="radiogroup" aria-label="Pattern">
                {FLAG_PATTERNS.map((fp) => (
                  <button
                    key={fp.id}
                    role="radio"
                    aria-checked={p.flag.pattern === fp.id}
                    aria-label={fp.name}
                    className="flag-pattern"
                    onClick={() => update(p.id, { flag: { pattern: fp.id as FlagPattern, colors: p.flag.colors.length >= fp.colors ? p.flag.colors : [...p.flag.colors, FLAG_COLORS.red] } })}
                  >
                    <Flag flag={{ pattern: fp.id, colors: p.flag.colors }} width={30} />
                  </button>
                ))}
              </div>
              {(FLAG_PATTERNS.find((f) => f.id === p.flag.pattern)?.colors === 3 ? [0, 1, 2] : [0, 1]).map((slot) => (
                <div key={slot} className="swatch-row" role="radiogroup" aria-label={`Colour ${slot + 1}`}>
                  <span className="label-caps">Colour {slot + 1}</span>
                  {SWATCHES.map(([name, hex]) => (
                    <button
                      key={name}
                      role="radio"
                      aria-checked={p.flag.colors[slot] === hex}
                      aria-label={name}
                      className="swatch"
                      style={{ background: hex }}
                      onClick={() => {
                        const colors = [...p.flag.colors];
                        colors[slot] = hex;
                        update(p.id, { flag: { ...p.flag, colors } });
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        className="btn dashed add-btn"
        onClick={() => {
          const id = newId();
          setState((s) => ({ ...s, purposes: [...s.purposes, { id, name: 'New purpose', flag: { pattern: 'diagonal', colors: [FLAG_COLORS.yellow, FLAG_COLORS.red] } }] }));
          setOpen(id);
        }}
      >
        <PlusIcon />
        Hoist a new flag
      </button>
      {archived.length > 0 && (
        <div className="struck">
          <span className="label-caps">Struck</span>
          {archived.map((p) => (
            <button key={p.id} className="btn ghost small" onClick={() => update(p.id, { archived: false })}>
              <Flag flag={p.flag} width={20} />
              {p.name} · hoist again
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
