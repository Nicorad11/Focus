import { convert, unitLabel } from './format';
import type { AppState, Watch } from './types';
import { MS_PER_NM, watchNm } from './voyage';

const STATUS: Record<Watch['status'], string> = {
  under_way: 'under way',
  made_port: 'made port',
  anchored: 'anchored at sea (watch complete)',
  dropped_anchor: 'dropped anchor',
};

function cell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Logbook rows as CSV, oldest first. Times are local, ISO 8601. */
export function logbookCSV(s: AppState, watches: Watch[], now = Date.now()): string {
  const u = s.settings.units;
  const iso = (t?: number) => {
    if (!t) return '';
    const d = new Date(t);
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  };
  const header = ['cast_off', 'ended', 'from', 'to', `distance_${unitLabel(u)}`, 'minutes', 'purpose', 'status', 'new_port', 'battened', 'held_off', 'opened_anyway', 'note'];
  const rows = [...watches]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((w) => {
      const nm = watchNm(w, now);
      return [
        iso(w.startedAt),
        iso(w.endedAt),
        w.fromLabel,
        w.toLabel,
        convert(nm, u).toFixed(2),
        ((nm * MS_PER_NM) / 60000).toFixed(1),
        s.purposes.find((p) => p.id === w.purposeId)?.name ?? '',
        STATUS[w.status],
        w.newPort ? 'yes' : 'no',
        w.battened ? 'yes' : 'no',
        w.heldOff,
        w.openedAnyway,
        w.note ?? '',
      ]
        .map(cell)
        .join(',');
    });
  return '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}
