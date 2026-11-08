/**
 * "Can this person see that piece of work?" for things that hang off work —
 * notes, timers — so they can't be used to reach work that's hidden from them.
 * Answers with a 404, like the work itself.
 */
import 'server-only';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { canSeeWork } from '@/lib/domain/scope';
import { DataError } from './errors';

export type WorkRef = 'chore' | 'task' | 'project' | 'maintenance' | 'asset';

export async function assertWorkVisible(user: SessionUser, kind: WorkRef, id: string): Promise<void> {
  let ok = can(user, 'farm.view');
  if (ok && kind === 'chore') {
    const { choreForViewer } = await import('./chores');
    ok = !!(await choreForViewer(user, id));
  } else if (ok && kind === 'task') {
    const { taskById } = await import('./projects');
    const t = await taskById(id);
    ok = !!t && canSeeWork(user, t);
  } else if (ok && kind === 'project') {
    const { projectForViewer } = await import('./projects');
    ok = !!(await projectForViewer(user, id));
  }
  // Upkeep and assets are shared farm work: farm.view is enough.
  if (!ok) throw new DataError('Not found.', 404);
}
