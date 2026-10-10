import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dayKey } from '../lib/achievements';
import { addDays, day, duration, startOfWeek } from '../lib/format';

const WEEKS = 26;
// minutes focused in a day → shade 1–4 (0 = no watch)
const STEPS = [1, 25, 60, 120];
const STEP_LABELS = ['1–24 min', '25–59 min', '1–2 h', '2 h or more'];

function shade(min: number): number {
  let s = 0;
  for (let i = 0; i < STEPS.length; i++) if (min >= STEPS[i]) s = i + 1;
  return s;
}

/** Half a year of days at sea, one square per day, darker for longer at sea. */
export function DaysAtSea({ minutesByDay, now }: { minutesByDay: Map<string, number>; now: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const first = addDays(startOfWeek(now), -7 * (WEEKS - 1));
  const today = dayKey(now);

  const weeks: { t: number; key: string; min: number; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const t = addDays(first, w * 7 + d);
      const key = dayKey(t);
      col.push({ t, key, min: minutesByDay.get(key) ?? 0, future: t > now && key !== today });
    }
    weeks.push(col);
  }
  const months = weeks.map((col, i) => {
    const m = new Date(col[0].t).getMonth();
    const prev = i ? new Date(weeks[i - 1][0].t).getMonth() : -1;
    return m !== prev ? new Date(col[0].t).toLocaleString('en-GB', { month: 'short' }) : '';
  });
  const inRange = weeks.flat().filter((c) => c.min > 0);
  const totalMin = inRange.reduce((s, c) => s + c.min, 0);

  // newest weeks in view on narrow screens
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip]);

  return (
    <div className="days-at-sea">
      <div className="das-scroll" ref={scroller}>
        <div
          className="das-grid"
          role="img"
          aria-label={`Days at sea over the last ${WEEKS} weeks: ${inRange.length} days, ${duration(totalMin * 60000)} in all. The logbook lists every watch.`}
          onMouseLeave={() => setTip(null)}
        >
          <div className="das-months" aria-hidden="true">
            {months.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="das-days" aria-hidden="true">
            <span>M</span>
            <span />
            <span>W</span>
            <span />
            <span>F</span>
            <span />
            <span>S</span>
          </div>
          <div className="das-cells" aria-hidden="true">
            {weeks.map((col, i) => (
              <div key={i} className="das-col">
                {col.map((c) => (
                  <span
                    key={c.key}
                    className={`das-cell s${shade(c.min)}${c.future ? ' future' : ''}${c.key === today ? ' today' : ''}`}
                    onMouseEnter={(e) => {
                      if (c.future) return;
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setTip({ x: r.left + r.width / 2, y: r.top, text: `${day(c.t)} · ${c.min ? `${duration(c.min * 60000)} at sea` : 'in harbour'}` });
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="das-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((s) => (
          <span key={s} className={`das-cell s${s}`} title={s ? STEP_LABELS[s - 1] : 'No watch'} />
        ))}
        <span>More</span>
        <span className="das-legend-note">time focused per day</span>
      </div>
      {tip && (
        <div className="das-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.text}
        </div>
      )}
    </div>
  );
}
