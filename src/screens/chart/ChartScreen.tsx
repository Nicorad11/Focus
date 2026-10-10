import { useEffect, useMemo, useRef, useState } from 'react';
import { on } from '../../lib/bus';
import { Chart, type ChartFit, type ChartHandle, type ChartPort, type ChartRoute } from '../../components/chart/Chart';
import type { LonLat } from '../../lib/geo';
import type { PortIndex } from '../../lib/ports';
import { useStore } from '../../lib/store';
import { activeWatch } from '../../lib/voyage';
import { useMediaQuery } from '../../lib/hooks';
import { PlanPanel } from './PlanPanel';
import { UnderWay } from './UnderWay';
import { PortDialog } from './PortDialog';

export interface ChartView {
  ports: ChartPort[];
  routes: ChartRoute[];
  boat: { pos: LonLat; course: number } | null;
  fit: ChartFit | null;
  harbours: boolean;
  label: string;
}

const BLANK: ChartView = { ports: [], routes: [], boat: null, fit: null, harbours: false, label: 'Nautical chart' };

/** The chart stays mounted across planning, sailing and making port so it never redraws from scratch. */
export function ChartScreen({ ports, visible }: { ports: PortIndex | null; visible: boolean }) {
  const [view, setView] = useState<ChartView>(BLANK);
  const [pick, setPick] = useState<{ id: string; n: number } | null>(null);
  const handle = useRef<ChartHandle>(null);
  const underWay = useStore((s) => activeWatch(s) != null);
  const reviewId = useStore((s) => s.reviewWatchId);
  const globe = useStore((s) => s.settings.projection === 'globe');
  const narrow = useMediaQuery('(max-width: 900px)');

  useEffect(() => on('plan-pick', (id) => setPick((p) => ({ id, n: (p?.n ?? 0) + 1 }))), []);
  // a pick belongs to one planning session; don't replay it after the next watch
  useEffect(() => {
    if (underWay) setPick(null);
  }, [underWay]);

  const onPortClick = useMemo(() => (underWay ? undefined : (id: string) => setPick((p) => ({ id, n: (p?.n ?? 0) + 1 }))), [underWay]);

  return (
    <div className="chart-screen" hidden={!visible}>
      <div className="chart-area">
        <Chart
          ports={view.ports}
          routes={view.routes}
          boat={view.boat}
          fit={view.fit}
          harbours={view.harbours}
          globe={globe}
          handle={handle}
          onPortClick={onPortClick}
          label={view.label}
          compassStyle={underWay ? (narrow ? { bottom: 24, left: 'auto', right: 0 } : { top: 256, bottom: 'auto', left: 'auto', right: 8, transform: 'none' }) : { left: narrow ? '80%' : 'calc(50% - 220px)' }}
          scaleStyle={underWay && !narrow ? { left: 'auto', right: 20, bottom: 200 } : narrow ? { left: 12, bottom: 12 } : { left: 84 }}
        />
      </div>
      {ports && (underWay ? <UnderWay ports={ports} setView={setView} chart={handle} narrow={narrow} /> : <PlanPanel ports={ports} setView={setView} chart={handle} pick={pick} narrow={narrow} />)}
      {ports && reviewId && <PortDialog ports={ports} watchId={reviewId} />}
    </div>
  );
}
