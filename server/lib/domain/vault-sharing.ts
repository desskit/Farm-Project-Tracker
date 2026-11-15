/**
 * Who may open or change a vault entry, from its share list. Pure.
 *
 * Each share line names a person, a group, a role, everyone on the farm, or
 * everyone (renters too); may let them edit; and may end after a date (the
 * last day it works). The owner always has full access; with no live
 * share, nobody else does (not even admins).
 */
import type { Role } from './permissions';

export type ShareType = 'user' | 'group' | 'role' | 'farm' | 'everyone';
export type Share = { type: ShareType; target: string; canEdit: boolean; expiresOn: string | null };
export type Viewer = { id: string; role: Role; onFarm: boolean; groups: Set<string> };
export type Access = 'owner' | 'edit' | 'view';

/** A share that has passed its last day no longer counts. */
export function isExpired(s: Pick<Share, 'expiresOn'>, today: string): boolean {
  return !!s.expiresOn && s.expiresOn < today;
}

export function shareMatches(s: Share, v: Viewer, today: string): boolean {
  if (isExpired(s, today)) return false;
  switch (s.type) {
    case 'user': return s.target === v.id;
    case 'group': return v.groups.has(s.target);
    case 'role': return s.target === v.role;
    case 'farm': return v.onFarm;
    case 'everyone': return true;
    default: return false;
  }
}

/** Editing can't be handed to whole-farm or everyone shares (renters and guests would get it). */
export function canGrantEdit(type: ShareType): boolean {
  return type === 'user' || type === 'group' || type === 'role';
}

export function accessFor(ownerId: string | null, shares: Share[], v: Viewer, today: string): Access | null {
  if (ownerId === v.id) return 'owner';
  const live = shares.filter((s) => shareMatches(s, v, today));
  if (!live.length) return null;
  return live.some((s) => s.canEdit && canGrantEdit(s.type)) ? 'edit' : 'view';
}

/** When this person's access ends: null if any matching share has no end date. */
export function accessUntil(shares: Share[], v: Viewer, today: string): string | null {
  const live = shares.filter((s) => shareMatches(s, v, today));
  if (!live.length || live.some((s) => !s.expiresOn)) return null;
  return live.map((s) => s.expiresOn!).sort().at(-1)!;
}

/** One line per target: a later line for the same person/group/role replaces an earlier one. */
export function dedupeShares(shares: Share[]): Share[] {
  const byKey = new Map<string, Share>();
  for (const s of shares) {
    const target = s.type === 'farm' || s.type === 'everyone' ? '' : s.target;
    byKey.set(`${s.type}:${target}`, { ...s, target, canEdit: s.canEdit && canGrantEdit(s.type) });
  }
  return [...byKey.values()];
}
