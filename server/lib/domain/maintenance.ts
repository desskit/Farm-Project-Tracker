/**
 * Maintenance due-status, ported from js/store.js maintenanceStatus (509-525).
 * Pure: the caller supplies the asset's latest meter reading + unit so this
 * stays free of DB access.
 */
import { bucketForDate, type Bucket } from './dashboard';
import { fmtDate, relativeLabel } from './dates';

export type MaintItemLike = {
  intervalType: 'calendar' | 'usage';
  intervalValue: number;
  nextDueDate: string | null;
  dueAtReading: number | null;
  lastDoneReading: number | null;
};

export type MaintStatus =
  | { mode: 'date'; bucket: Bucket; detail: string; dueDate: string }
  | { mode: 'usage'; bucket: Bucket; detail: string; current: number; due: number; remaining: number; unit: string };

export function maintenanceStatus(
  item: MaintItemLike,
  opts: { latestReading: number | null; meterUnit: string | null },
): MaintStatus {
  if (item.intervalType === 'calendar') {
    const due = item.nextDueDate ?? '';
    return {
      mode: 'date',
      bucket: bucketForDate(due),
      dueDate: due,
      detail: `Due ${fmtDate(due)} · ${relativeLabel(due)}`,
    };
  }
  const unit = opts.meterUnit ?? 'units';
  let current = opts.latestReading;
  if (current == null) current = item.lastDoneReading ?? 0;
  const dueAt = item.dueAtReading ?? 0;
  const remaining = dueAt - current;
  const soonThreshold = Math.max(1, Math.round(item.intervalValue * 0.15));
  const bucket: Bucket = remaining <= 0 ? 'overdue' : remaining <= soonThreshold ? 'upcoming' : 'later';
  const detail =
    remaining <= 0
      ? `Overdue by ${-remaining} ${unit} (at ${current})`
      : `${remaining} ${unit} left (due at ${dueAt})`;
  return { mode: 'usage', bucket, detail, current, due: dueAt, remaining, unit };
}
