/**
 * Project spend — materials, hired help, permits. Separate from maintenance
 * logs, which price servicing against a specific asset; a project's costs
 * aren't tied to a piece of equipment.
 *
 * Anyone can log an expense (the person at the lumber yard is whoever went),
 * but only the person who logged it or a manager can remove it — the same rule
 * asset documents use.
 */
import 'server-only';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { projectExpenses, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { deleteAttachment } from './attachments';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';

export type ExpenseRow = {
  id: string;
  projectId: string;
  label: string;
  amount: number;
  date: string;
  userId: string | null;
  userName: string;
  photoId: string | null;
  ts: number;
};

/** Budget vs. actual for one project. */
export type BudgetSummary = {
  budget: number | null;
  spent: number;
  remaining: number | null;
  /** Percent of budget used, 0-100+, or null when no budget is set. */
  pct: number | null;
  over: boolean;
};

function isManager(user: SessionUser): boolean {
  return user.role === 'manager' || user.role === 'admin';
}

export async function listExpenses(projectId: string): Promise<ExpenseRow[]> {
  const rows = await db
    .select({
      id: projectExpenses.id,
      projectId: projectExpenses.projectId,
      label: projectExpenses.label,
      amount: projectExpenses.amount,
      date: projectExpenses.date,
      userId: projectExpenses.userId,
      userName: users.name,
      photoId: projectExpenses.photoId,
      ts: projectExpenses.ts,
    })
    .from(projectExpenses)
    .leftJoin(users, eq(users.id, projectExpenses.userId))
    .where(eq(projectExpenses.projectId, projectId))
    .orderBy(desc(projectExpenses.date), desc(projectExpenses.ts));
  return rows.map((r) => ({ ...r, userName: r.userName ?? 'Someone' }));
}

/** Total spend per project, for the projects board. */
export async function spentByProject(projectIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of projectIds) out[id] = 0;
  if (!projectIds.length) return out;
  const rows = await db
    .select({ projectId: projectExpenses.projectId, total: sql<number>`sum(${projectExpenses.amount})` })
    .from(projectExpenses)
    .where(inArray(projectExpenses.projectId, projectIds))
    .groupBy(projectExpenses.projectId);
  for (const r of rows) out[r.projectId] = Number(r.total) || 0;
  return out;
}

/** Derives the budget picture from a project's budget and what's been spent. */
export function budgetSummary(budget: number | null, spent: number): BudgetSummary {
  if (budget == null || budget <= 0) {
    return { budget: null, spent, remaining: null, pct: null, over: false };
  }
  return {
    budget,
    spent,
    remaining: budget - spent,
    pct: Math.round((spent / budget) * 100),
    over: spent > budget,
  };
}

export async function addExpense(
  user: SessionUser,
  projectId: string,
  data: { label: string; amount: number; date?: string; photoId?: string | null },
): Promise<void> {
  const label = (data.label || '').trim();
  if (!label) throw new DataError('What was it for?', 400);
  const amount = Number(data.amount);
  if (!isFinite(amount) || amount <= 0) throw new DataError('Enter an amount greater than zero.', 400);
  await db.insert(projectExpenses).values({
    id: uid('px'),
    projectId,
    label,
    amount,
    date: data.date || todayISO(),
    userId: user.id,
    photoId: data.photoId || null,
  });
  await logActivity(user.id, `logged $${amount.toFixed(2)} on a project`);
  publishChange('project');
}

export async function deleteExpense(user: SessionUser, id: string): Promise<void> {
  const rows = await db.select().from(projectExpenses).where(eq(projectExpenses.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new DataError('No such expense.', 404);
  if (row.userId !== user.id && !isManager(user)) {
    throw new DataError('Only whoever logged it or a manager can delete this.', 403);
  }
  await db.delete(projectExpenses).where(eq(projectExpenses.id, id));
  if (row.photoId) await deleteAttachment(row.photoId);
  publishChange('project');
}
