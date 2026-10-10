import { useState } from 'react';
import { AnchorIcon, LocateIcon, Pennant, SailIcon, ShieldIcon } from '../components/icons';
import { placeLine, nearestPorts, type PortIndex } from '../lib/ports';
import { setState } from '../lib/store';
import type { Harbour } from '../lib/types';
import { PortPicker } from './Settings';

const QUICK = ['x-copenhagen', 'x-cowes', 'x-ijmuiden', 'x-newport', 'x-palma', 'x-auckland'];

export function Welcome({ ports }: { ports: PortIndex }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [home, setHome] = useState<Harbour | null>(null);
  const [near, setNear] = useState<Harbour[] | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocError('Location isn’t available here. Search instead.');
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setNear(nearestPorts(ports, [pos.coords.longitude, pos.coords.latitude], 5, 2));
      },
      () => {
        setLocating(false);
        setLocError('Couldn’t get your location. Search for a harbour instead.');
      },
      { maximumAge: 600_000, timeout: 10_000 },
    );
  };

  const finish = () => {
    if (!home) return;
    setState((s) => ({ ...s, onboarded: true, settings: { ...s.settings, homePortId: home.id }, boat: s.boat ?? { portId: home.id } }));
  };

  const quick = QUICK.map((id) => ports.byId.get(id)).filter(Boolean) as Harbour[];

  return (
    <>
      <div className="scrim" />
      <div className="dialog-wrap">
        <section className="dialog welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <div className="welcome-brand">
            <Pennant size={28} mast="var(--ink)" />
            <span className="wordmark">Leeward</span>
          </div>
          {step === 1 ? (
            <>
              <div className="welcome-head">
                <span className="eyebrow">Welcome aboard · 1 of 2</span>
                <h1 id="welcome-title" className="plan-title">
                  Where’s your home port?
                </h1>
                <p className="port-body">Every watch starts from a harbour. Pick the one nearest you, or anywhere you’d like to sail from.</p>
              </div>
              {home ? (
                <div className="chosen-home">
                  <span className="home-chip-icon">
                    <AnchorIcon size={20} />
                  </span>
                  <span className="row-main">
                    <span className="serif home-name">{home.name}</span>
                    <span className="row-sub">{placeLine(home)}</span>
                  </span>
                  <button className="btn ghost small" onClick={() => setHome(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <PortPicker ports={ports} onPick={(id) => setHome(ports.byId.get(id) ?? null)} />
                  <div className="welcome-quick">
                    <button className="btn white small" onClick={locate} disabled={locating}>
                      <LocateIcon />
                      {locating ? 'Finding you…' : 'Use my location'}
                    </button>
                    {locError && <span className="hint error">{locError}</span>}
                  </div>
                  <div className="pick-list">
                    {(near ?? quick).map((p) => (
                      <button key={p.id} className="pick" onClick={() => setHome(p)}>
                        <span className="pick-name serif">{p.name}</span>
                        <span className="pick-exe">{placeLine(p)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button className="btn primary" disabled={!home} onClick={() => setStep(2)}>
                Continue
              </button>
            </>
          ) : (
            <>
              <div className="welcome-head">
                <span className="eyebrow">Welcome aboard · 2 of 2</span>
                <h1 id="welcome-title" className="plan-title">
                  How a watch works
                </h1>
              </div>
              <ul className="how">
                <li>
                  <SailIcon size={22} />
                  <span>
                    <strong>Choose how long to focus.</strong> Every focused minute carries you one nautical mile, so a 60-minute watch reaches a harbour about 60
                    nm away.
                  </span>
                </li>
                <li>
                  <ShieldIcon size={22} />
                  <span>
                    <strong>Batten down.</strong> Distracting apps and sites stay below deck until you make port. Set them up under Batten.
                  </span>
                </li>
                <li>
                  <AnchorIcon size={22} />
                  <span>
                    <strong>Hold to drop anchor</strong> if you must stop early. The miles you sailed still count, and you pick up from the same spot next time.
                  </span>
                </li>
              </ul>
              <div className="button-row">
                <button className="btn white" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="btn primary" style={{ flex: 1 }} onClick={finish}>
                  Plan your first watch from {home?.name}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
