import type { AchievementGroup } from '../lib/achievements';

/** The motif in the middle of an achievement medal, one per group. */
function Motif({ group }: { group: AchievementGroup }) {
  switch (group) {
    case 'distance':
      return (
        <g strokeLinejoin="round">
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 6 L14.2 12 L12 18 L9.8 12 Z" />
        </g>
      );
    case 'ports':
      return (
        <g strokeLinecap="round">
          <circle cx="12" cy="6" r="1.8" />
          <path d="M12 7.8v11.2M8.5 10.8h7M5.8 13.5a6.2 6.2 0 0 0 12.4 0" />
        </g>
      );
    case 'passages':
      return (
        <g strokeLinejoin="round">
          <path d="M12 4v12H6.5z" />
          <path d="M13.6 6.5l4 9.5h-4z" />
          <path d="M5 18.5c1.7 1.1 3.3 1.1 5 0s3.3-1.1 5 0 3.3 1.1 4 .6" strokeLinecap="round" />
        </g>
      );
    case 'lines':
      return (
        <g>
          <circle cx="12" cy="12" r="7.5" />
          <ellipse cx="12" cy="12" rx="3.2" ry="7.5" />
          <path d="M4.5 12h15" strokeDasharray="1.6 1.4" />
        </g>
      );
    case 'time':
      return (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M7.5 4.5h9M7.5 19.5h9" />
          <path d="M8.5 4.5c0 4 7 4.5 7 7.5s-7 3.5-7 7.5M15.5 4.5c0 4-7 4.5-7 7.5s7 3.5 7 7.5" />
        </g>
      );
    case 'watches':
      return (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M7 15.5V11a5 5 0 0 1 10 0v4.5l1.5 1.5h-13z" />
          <path d="M10.5 19a1.5 1.5 0 0 0 3 0M12 4.5V6" />
        </g>
      );
    case 'discipline':
      return (
        <g strokeLinejoin="round">
          <path d="M12 4l6 2.5v5c0 3.8-2.5 6.3-6 7.6-3.5-1.3-6-3.8-6-7.6v-5z" />
          <path d="M9.5 11.8l1.8 1.8 3.4-3.6" strokeLinecap="round" />
        </g>
      );
  }
}

/** An achievement medal: a rope-ringed disc, struck in ink when earned, chalked in when not. */
export function Medal({ group, earned, size = 56 }: { group: AchievementGroup; earned: boolean; size?: number }) {
  return (
    <svg className={`medal${earned ? ' earned' : ''}`} width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="26" className="medal-face" />
      <circle cx="28" cy="28" r="26" className="medal-ring" />
      <circle cx="28" cy="28" r="21.5" className="medal-rope" />
      <g transform="translate(16 16)" className="medal-motif" fill="none" strokeWidth="1.5">
        <Motif group={group} />
      </g>
    </svg>
  );
}
