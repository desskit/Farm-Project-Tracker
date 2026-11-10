/**
 * Rotational grazing: a paddock is occupied while a group is on it, then
 * rests; once it has rested its target days it's ready again. Pure.
 */
import { addDays, diffDays } from './dates';

/** Whole days from `from` to `to`. */
const daysBetween = (from: string, to: string) => diffDays(to, from);

export type PaddockState = 'occupied' | 'resting' | 'ready' | 'unused';

export function paddockStatus(
  p: { occupied: boolean; lastLeftOn: string | null; restDays: number },
  today: string,
): { state: PaddockState; rested: number | null; readyOn: string | null } {
  if (p.occupied) return { state: 'occupied', rested: null, readyOn: null };
  if (!p.lastLeftOn) return { state: 'unused', rested: null, readyOn: null };
  const rested = Math.max(0, daysBetween(p.lastLeftOn, today));
  const readyOn = addDays(p.lastLeftOn, p.restDays);
  return { state: rested >= p.restDays ? 'ready' : 'resting', rested, readyOn };
}

/** Days a group has been on its current paddock. */
export function daysOn(movedOn: string | null, today: string): number | null {
  return movedOn ? Math.max(0, daysBetween(movedOn, today)) : null;
}

export type PaddockOption = { id: string; name: string; parentId: string | null; state: PaddockState; rested: number | null };

/**
 * Where to move next: a paddock that's ready, preferring the same pasture and
 * the one rested longest (never-grazed ground counts as rested longest).
 */
export function nextPaddock(options: PaddockOption[], current: { id: string | null; parentId: string | null }): PaddockOption | null {
  const ok = options.filter((p) => p.id !== current.id && (p.state === 'ready' || p.state === 'unused'));
  if (!ok.length) return null;
  const score = (p: PaddockOption) => (p.rested ?? Number.MAX_SAFE_INTEGER);
  return ok.sort((a, b) => {
    const same = Number(b.parentId === current.parentId) - Number(a.parentId === current.parentId);
    return same || score(b) - score(a) || a.name.localeCompare(b.name, undefined, { numeric: true });
  })[0];
}

/** Days past the paddock's target stay, or 0 if within it (or no target set). */
export function overstayDays(daysHere: number | null, grazeDays: number | null | undefined): number {
  if (daysHere == null || !grazeDays || grazeDays <= 0) return 0;
  return Math.max(0, daysHere - grazeDays);
}
