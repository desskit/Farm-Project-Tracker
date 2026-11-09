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
