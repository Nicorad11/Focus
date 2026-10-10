// Stroke icons drawn for Leeward (from the design canvas). All decorative: callers label the control.

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export function Pennant({ size = 20, mast = 'var(--chrome-text)' }: { size?: number; mast?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <line x1="3" y1="2" x2="3" y2="19" stroke={mast} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 3 H18 L13.5 7.5 L18 12 H4 Z" fill="#E0442C" />
      <path d="M6 7.6 C8 6.4 9.5 8.8 11.5 7.6" fill="none" stroke="#FBFAF7" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export const ChartIcon = (p: P) => (
  <Svg strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 5 L14.5 12 L12 19 L9.5 12 Z" />
  </Svg>
);

export const LogbookIcon = (p: P) => (
  <Svg strokeLinejoin="round" {...p}>
    <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" />
    <path d="M5 17a3 3 0 0 1 3-3h10" />
  </Svg>
);

export const AnchorIcon = (p: P) => (
  <Svg strokeLinecap="round" {...p}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v13M8 11h8M4.5 13.5a7.5 7.5 0 0 0 15 0" />
  </Svg>
);

export const ShieldIcon = (p: P) => (
  <Svg strokeLinejoin="round" {...p}>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9 12h6" />
  </Svg>
);

export const ShieldPlain = (p: P) => (
  <Svg strokeLinejoin="round" {...p}>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
  </Svg>
);

export const SettingsIcon = (p: P) => (
  <Svg strokeLinecap="round" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Svg>
);

export const SailIcon = (p: P) => (
  <Svg strokeWidth={1.7} strokeLinejoin="round" {...p}>
    <path d="M12 3v14H5z" />
    <path d="M14 6l5 11h-5z" />
    <path d="M3 19.5c2 1.3 4 1.3 6 0s4-1.3 6 0 4 1.3 6 0" />
  </Svg>
);

export const MiniWindowIcon = (p: P) => (
  <Svg strokeLinejoin="round" {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const TargetIcon = (p: P) => (
  <Svg strokeLinecap="round" {...p}>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Svg>
);

export const WavesIcon = (p: P) => (
  <Svg strokeLinecap="round" {...p}>
    <path d="M2 9c2.5-2 5-2 7.5 0s5 2 7.5 0 3-1.5 5-1" />
    <path d="M2 15c2.5-2 5-2 7.5 0s5 2 7.5 0 3-1.5 5-1" />
  </Svg>
);

export const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const MinusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const CloseIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6 3 L11 8 L6 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 10V2M4.5 5.5 8 2l3.5 3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ExternalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ExpandIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9 2h5v5M14 2 8.5 7.5M7 14H2V9M2 14l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowRight = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
    <path d="M1 6h19M15 1l5 5-5 5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const LocateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M14 2 2 7l5 2 2 5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

/** The boat seen from above, pointing up; rotate it to the course. */
export function BoatGlyph({ size = 16, course = 0, hull = 'var(--ink)' }: { size?: number; course?: number; hull?: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <g transform={`rotate(${course})`}>
        <path d="M0 -10 C5 -4 5 5 3 9 L-3 9 C-5 5 -5 -4 0 -10Z" fill={hull} />
        <path d="M0 -5 L0 6 L3.5 4 Z" fill="#E0442C" />
      </g>
    </svg>
  );
}

export function WindowMinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function WindowMaxIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function WindowCloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
