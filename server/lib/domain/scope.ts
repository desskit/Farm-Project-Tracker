/**
 * Which work a person can see. One rule, used by every list, detail page,
 * search, calendar and action:
 *
 *  - with `work.viewAll`: everything;
 *  - otherwise: what they're on, what was sent back to them, and — with
 *    `work.claim` — anything up for grabs (open).
 *
 * Upkeep is shared farm work and stays visible to everyone on the farm app.
 * Pure and client-safe; data functions apply it.
 */
import { can, type Subject } from './permissions';

export type Viewer = Subject & { id: string };
export type WorkItem = {
  open: boolean;
  assigneeIds: string[];
  sentBack?: { worker: string | null } | null;
  doneBy?: string | null;
};

export function seesAllWork(viewer: Viewer): boolean {
  return can(viewer, 'work.viewAll');
}

export function canSeeWork(viewer: Viewer, item: WorkItem): boolean {
  if (seesAllWork(viewer)) return true;
  if (item.assigneeIds.includes(viewer.id)) return true;
  if (item.sentBack?.worker === viewer.id || item.doneBy === viewer.id) return true;
  return item.open && can(viewer, 'work.claim');
}
