/**
 * Chore recurrence, ported from js/store.js:57-115.
 *
 * `nextOccurrenceAfter` returns the smallest date strictly after `from` that
 * matches the schedule (respecting an optional active season window). This is
 * the authoritative rollover used server-side when a chore is completed and by
 * the nightly reconciliation job.
 */
import { addDays, iso, parseISO, weekday } from './dates';
import type { Schedule } from '@/db/schema';

function mdOf(s: string): string {
  return s.slice(5);
}

export function isActiveSeason(season: { start: string; end: string }, s: string): boolean {
  const md = mdOf(s);
  if (season.start <= season.end) return md >= season.start && md <= season.end;
  return md >= season.start || md <= season.end; // wraps the new year
}

function nextSeasonStart(season: { start: string; end: string }, s: string): string {
  const year = parseISO(s).getFullYear();
  let cand = `${year}-${season.start}`;
  if (cand < s) cand = `${year + 1}-${season.start}`;
  return cand;
}

export function clampToSeason(schedule: Schedule, s: string): string {
  if (!schedule.season) return s;
  if (isActiveSeason(schedule.season, s)) return s;
  return nextSeasonStart(schedule.season, s);
}

/** Smallest date strictly after `from` that matches the schedule. */
export function nextOccurrenceAfter(schedule: Schedule, from: string): string {
  let d: string;
  switch (schedule.type) {
    case 'once':
      // One-time chores don't recur; callers mark them done instead of rolling.
      return from;
    case 'daily':
      d = addDays(from, 1);
      break;
    case 'everyNDays':
      d = addDays(from, Math.max(1, schedule.n || 1));
      break;
    case 'weekly': {
      const wds = schedule.weekdays && schedule.weekdays.length ? schedule.weekdays : [weekday(from)];
      d = addDays(from, 1);
      for (let i = 1; i <= 7; i++) {
        const c = addDays(from, i);
        if (wds.indexOf(weekday(c)) !== -1) {
          d = c;
          break;
        }
      }
      break;
    }
    case 'monthly': {
      const base = parseISO(from);
      const day = schedule.day || 1;
      let cand = new Date(base.getFullYear(), base.getMonth(), day);
      if (iso(cand) <= from) cand = new Date(base.getFullYear(), base.getMonth() + 1, day);
      d = iso(cand);
      break;
    }
    default:
      d = addDays(from, 1);
  }
  return clampToSeason(schedule, d);
}

export function describeSchedule(schedule: Schedule): string {
  let base: string;
  switch (schedule.type) {
    case 'once':
      return 'One-time';
    case 'daily':
      base = 'Every day';
      break;
    case 'everyNDays':
      base = `Every ${schedule.n || 1} days`;
      break;
    case 'weekly': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const ds = (schedule.weekdays || []).slice().sort().map((w) => names[w]);
      base = ds.length ? `Weekly · ${ds.join(', ')}` : 'Weekly';
      break;
    }
    case 'monthly':
      base = `Monthly · day ${schedule.day || 1}`;
      break;
    default:
      base = 'Recurring';
  }
  if (schedule.season) base += ' (seasonal)';
  return base;
}
