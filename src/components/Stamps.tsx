import { useId } from 'react';
import { formatPosition } from '../lib/geo';

/** The big port stamp on the "Made port" card. */
export function PortStamp({ name, lat, lon, date, color = 'var(--red)', size = 136 }: { name: string; lat: number; lon: number; date: string; color?: string; size?: number }) {
  const id = useId().replace(/:/g, '');
  const upper = name.toUpperCase();
  const fit = upper.length > 9 ? { textLength: 84, lengthAdjust: 'spacingAndGlyphs' as const } : {};
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={`Port stamp: ${name}, ${date}`} style={{ transform: 'rotate(-8deg)', flexShrink: 0 }}>
      <defs>
        <path id={`ring-${id}`} d="M70 70 m-50 0 a50 50 0 1 1 100 0 a50 50 0 1 1 -100 0" />
      </defs>
      <circle cx="70" cy="70" r="65" fill="none" stroke={color} strokeWidth="3" />
      <circle cx="70" cy="70" r="59" fill="none" stroke={color} strokeWidth="1" />
      <circle cx="70" cy="70" r="39" fill="none" stroke={color} strokeWidth="1" />
      <text fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="1.9" fill={color}>
        <textPath href={`#ring-${id}`}>{formatPosition([lon, lat]).replace(' ', ' · ')} · LEEWARD LOGBOOK ·</textPath>
      </text>
      <path d="M58 52 v14 M59 53 h12 l-3.5 3.5 l3.5 3.5 h-12" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <text x="70" y="82" textAnchor="middle" fontFamily="var(--font-sans)" fontWeight="800" fontSize="17" letterSpacing="1.5" fill={color} {...fit}>
        {upper}
      </text>
      <text x="70" y="95" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" letterSpacing="1.2" fill={color}>
        {date.toUpperCase()}
      </text>
    </svg>
  );
}

/** A small stamp for the stamp collections; `rotate` gives each one its own tilt. */
export function SmallStamp({ label, color, rotate = 0 }: { label: string; color: string; rotate?: number }) {
  return (
    <svg width="60" height="60" viewBox="0 0 64 64" aria-hidden="true" style={{ transform: `rotate(${rotate}deg)` }}>
      <circle cx="32" cy="32" r="29" fill="none" stroke={color} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="0.9" />
      <circle cx="32" cy="19" r="2.2" fill="none" stroke={color} strokeWidth="1.5" />
      <path d="M32 21.2v15.8M27 25h10M24.5 31a7.5 7.5 0 0 0 15 0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <text x="32" y="49" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="7" letterSpacing="0.8" fill={color}>
        {label.toUpperCase()}
      </text>
    </svg>
  );
}

export function EmptyStamp() {
  return <span className="stamp-empty" aria-hidden="true" />;
}

export const STAMP_COLORS = ['var(--teal)', 'var(--ochre)', 'var(--ink)', 'var(--red)'];

/** Deterministic tilt per port so stamps don't look machine-aligned. */
export function tilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 15) - 7) as number;
}

/** "An anchored-at-sea" badge for the review card. */
export function AnchorBadge({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="60" cy="60" r="56" fill="var(--teal-tint)" stroke="var(--teal)" strokeWidth="2" />
      <circle cx="60" cy="60" r="49" fill="none" stroke="var(--teal)" strokeWidth="0.8" strokeDasharray="2 3" />
      <g fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinecap="round">
        <circle cx="60" cy="31" r="6" />
        <path d="M60 37v48M46 50h28M36 66a24 24 0 0 0 48 0" />
      </g>
      <path d="M22 95c6-4 12-4 18 0s12 4 18 0 12-4 18 0 12 4 18 0 8-3 10-2" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
