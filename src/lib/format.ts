import type { Units } from './types';

const UNIT = {
  nm: { factor: 1, label: 'nm' },
  km: { factor: 1.852, label: 'km' },
  mi: { factor: 1.150779, label: 'mi' },
} as const;

export function unitLabel(u: Units) {
  return UNIT[u].label;
}

export function convert(nm: number, u: Units) {
  return nm * UNIT[u].factor;
}

/** "61.7 nm" — one decimal below 100, whole numbers above. */
export function dist(nm: number, u: Units, decimals?: number): string {
  const v = convert(nm, u);
  const d = decimals ?? (v < 100 ? 1 : 0);
  return `${v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })} ${UNIT[u].label}`;
}

/** "62 nm" */
export function distRound(nm: number, u: Units): string {
  return dist(nm, u, 0);
}

/** Number only, for big readouts. */
export function distValue(nm: number, u: Units, decimals = 1): string {
  return convert(nm, u).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Countdown "24:42" or "1:04:09". */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "3 h 28 min", "62 min", "1 h 04 min" */
export function duration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/** "62 min" for a planned watch length */
export function minutes(nm: number): string {
  return `${Math.round(nm)} min`;
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const stampFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** "15:14" (24-hour, as on a ship's log) */
export function time(t: number) {
  return timeFmt.format(t);
}

/** "Sat 10 Oct" */
export function day(t: number) {
  return dayFmt.format(t).replace(',', '');
}

/** "10 Oct" */
export function shortDate(t: number) {
  return stampFmt.format(t);
}

export function longDate(t: number) {
  return longDayFmt.format(t);
}

export function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

/** ISO week (Monday start) */
export function startOfWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function isoWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/** "5–11 October 2026" */
export function weekRange(start: number): string {
  const end = addDays(start, 6);
  const a = new Date(start);
  const b = new Date(end);
  const month = (d: Date) => d.toLocaleString('en-GB', { month: 'long' });
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  return `${longDate(start)} – ${longDate(end)}`;
}
