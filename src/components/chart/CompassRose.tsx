import type { CSSProperties } from 'react';

/** The chart's compass rose (decorative; the chart is always north-up). */
export function CompassRose({ style, size = 110 }: { style?: CSSProperties; size?: number }) {
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180;
    const long = i % 2 === 0;
    const r1 = 54;
    const r2 = long ? 49 : 51;
    ticks.push(
      <line
        key={i}
        x1={Math.sin(a) * r1}
        y1={-Math.cos(a) * r1}
        x2={Math.sin(a) * r2}
        y2={-Math.cos(a) * r2}
        strokeWidth={long ? 0.7 : 0.45}
      />,
    );
  }
  return (
    <svg className="compass" width={size} height={size + 14} viewBox="-60 -74 120 134" style={style} aria-hidden="true">
      <text x="0" y="-62" textAnchor="middle" fontFamily="var(--font-serif)" fontWeight="700" fontSize="13" fill="var(--ink)">
        N
      </text>
      <g stroke="var(--ink)" fill="none" opacity="0.7">
        <circle r="54" strokeWidth="0.8" />
        <circle r="47" strokeWidth="0.5" />
        {ticks}
      </g>
      <g opacity="0.82">
        <path d="M0 -44 L4 -4 L0 0 Z" fill="var(--ink)" />
        <path d="M0 -44 L-4 -4 L0 0 Z" fill="var(--ink-3)" opacity="0.55" />
        <path d="M0 44 L4 4 L0 0 Z" fill="var(--ink-3)" opacity="0.55" />
        <path d="M0 44 L-4 4 L0 0 Z" fill="var(--ink)" />
        <path d="M44 0 L4 4 L0 0 Z" fill="var(--ink)" />
        <path d="M44 0 L4 -4 L0 0 Z" fill="var(--ink-3)" opacity="0.55" />
        <path d="M-44 0 L-4 -4 L0 0 Z" fill="var(--ink)" />
        <path d="M-44 0 L-4 4 L0 0 Z" fill="var(--ink-3)" opacity="0.55" />
        <path d="M0 0 L20 -20 L3 -3 Z" fill="var(--ink-3)" opacity="0.5" />
        <path d="M0 0 L-20 -20 L-3 -3 Z" fill="var(--ink-3)" opacity="0.5" />
        <path d="M0 0 L20 20 L3 3 Z" fill="var(--ink-3)" opacity="0.5" />
        <path d="M0 0 L-20 20 L-3 3 Z" fill="var(--ink-3)" opacity="0.5" />
      </g>
    </svg>
  );
}
