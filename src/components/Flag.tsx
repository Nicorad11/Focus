import type { FlagPattern, FlagSpec } from '../lib/types';

/** A purpose flag drawn like a maritime signal flag. */
export function Flag({ flag, width = 22 }: { flag: FlagSpec; width?: number }) {
  const [a, b, c = b] = flag.colors;
  const h = (width * 15) / 22;
  return (
    <svg width={width} height={h} viewBox="0 0 22 15" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <FlagBody pattern={flag.pattern} a={a} b={b} c={c} />
      <rect width="22" height="15" fill="none" stroke="#13233A" strokeWidth="0.6" />
    </svg>
  );
}

function FlagBody({ pattern, a, b, c }: { pattern: FlagPattern; a: string; b: string; c: string }) {
  switch (pattern) {
    case 'nested':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <rect x="3.5" y="2.5" width="15" height="10" fill={b} />
          <rect x="7" y="5" width="8" height="5" fill={c} />
        </>
      );
    case 'square':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <rect x="7" y="3.5" width="8" height="8" fill={b} />
        </>
      );
    case 'cross':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <rect x="9" y="0" width="4" height="15" fill={b} />
          <rect x="0" y="5.5" width="22" height="4" fill={b} />
        </>
      );
    case 'stripes':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <rect y="3" width="22" height="9" fill={b} />
          <rect y="6" width="22" height="3" fill={c} />
        </>
      );
    case 'halves':
      return (
        <>
          <rect width="11" height="15" fill={a} />
          <rect x="11" width="11" height="15" fill={b} />
        </>
      );
    case 'diagonal':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <path d="M22 0 L22 15 L0 15 Z" fill={b} />
        </>
      );
    case 'saltire':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <path d="M0 0 L22 15 M22 0 L0 15" stroke={b} strokeWidth="3.4" />
        </>
      );
    case 'checker':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          {[0, 1, 2, 3].flatMap((x) =>
            [0, 1, 2].map((y) => ((x + y) % 2 ? <rect key={`${x}${y}`} x={x * 5.5} y={y * 5} width="5.5" height="5" fill={b} /> : null)),
          )}
        </>
      );
    case 'quarters':
      return (
        <>
          <rect width="22" height="15" fill={b} />
          <rect width="11" height="7.5" fill={a} />
          <rect x="11" y="7.5" width="11" height="7.5" fill={a} />
        </>
      );
    case 'border':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <rect x="3.5" y="3" width="15" height="9" fill={b} />
        </>
      );
    case 'disc':
      return (
        <>
          <rect width="22" height="15" fill={a} />
          <circle cx="11" cy="7.5" r="4.2" fill={b} />
        </>
      );
    case 'bands':
      return (
        <>
          <rect width="22" height="7.5" fill={a} />
          <rect y="7.5" width="22" height="7.5" fill={b} />
        </>
      );
  }
}

export const FLAG_PATTERNS: { id: FlagPattern; name: string; colors: number }[] = [
  { id: 'nested', name: 'Nested', colors: 3 },
  { id: 'square', name: 'Square', colors: 2 },
  { id: 'cross', name: 'Cross', colors: 2 },
  { id: 'stripes', name: 'Stripes', colors: 3 },
  { id: 'halves', name: 'Halves', colors: 2 },
  { id: 'bands', name: 'Bands', colors: 2 },
  { id: 'diagonal', name: 'Diagonal', colors: 2 },
  { id: 'saltire', name: 'Saltire', colors: 2 },
  { id: 'checker', name: 'Checker', colors: 2 },
  { id: 'quarters', name: 'Quarters', colors: 2 },
  { id: 'border', name: 'Border', colors: 2 },
  { id: 'disc', name: 'Disc', colors: 2 },
];
