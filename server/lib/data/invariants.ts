/**
 * Data health check for the launch checklist and after big changes: things
 * the schema can't enforce on its own. Read-only; each finding says what's
 * wrong and how many rows.
 */
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

export type Finding = { check: string; count: number; detail: string };

const CHECKS: { check: string; detail: string; query: ReturnType<typeof sql> }[] = [
  {
    check: 'Duplicate rent charges',
    detail: 'More than one charge for the same person and month.',
    query: sql`SELECT count(*) AS n FROM (SELECT 1 FROM rent_charges GROUP BY user_id, month HAVING count(*) > 1)`,
  },
  {
    check: 'Assignees on deleted work',
    detail: 'Chore or task assignee rows pointing at work that no longer exists.',
    query: sql`SELECT (SELECT count(*) FROM chore_assignees WHERE chore_id NOT IN (SELECT id FROM chores))
                    + (SELECT count(*) FROM task_assignees WHERE task_id NOT IN (SELECT id FROM project_tasks)) AS n`,
  },
  {
    check: 'Renters assigned to work',
    detail: 'People with the renter role on chores or tasks (they can’t see the farm app).',
    query: sql`SELECT (SELECT count(*) FROM chore_assignees a JOIN users u ON u.id = a.user_id WHERE u.role = 'renter')
                    + (SELECT count(*) FROM task_assignees a JOIN users u ON u.id = a.user_id WHERE u.role = 'renter') AS n`,
  },
  {
    check: 'File references to missing files',
    detail: 'Records pointing at an attachment id with no file row.',
    query: sql`SELECT (SELECT count(*) FROM chore_completions WHERE photo_id IS NOT NULL AND photo_id NOT IN (SELECT id FROM attachments))
                    + (SELECT count(*) FROM notes WHERE photo_id IS NOT NULL AND photo_id NOT IN (SELECT id FROM attachments))
                    + (SELECT count(*) FROM maintenance_logs WHERE photo_id IS NOT NULL AND photo_id NOT IN (SELECT id FROM attachments)) AS n`,
  },
  {
    check: 'Sessions for people who can’t sign in',
    detail: 'Live sessions belonging to deactivated people or people whose access ended.',
    query: sql`SELECT count(*) AS n FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE u.active = 0 OR (u.access_expires_at IS NOT NULL AND u.access_expires_at < (unixepoch() * 1000))`,
  },
  {
    check: 'No active admin',
    detail: 'Nobody can manage people or settings.',
    query: sql`SELECT CASE WHEN (SELECT count(*) FROM users WHERE role = 'admin' AND active = 1) = 0 THEN 1 ELSE 0 END AS n`,
  },
  {
    check: 'Negative stock',
    detail: 'Supplies with a quantity below zero.',
    query: sql`SELECT count(*) AS n FROM inventory WHERE qty < 0`,
  },
];

export async function checkInvariants(): Promise<{ ok: boolean; findings: Finding[]; checked: number }> {
  const findings: Finding[] = [];
  for (const c of CHECKS) {
    const rows = await db.all<{ n: number }>(c.query);
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) findings.push({ check: c.check, count: n, detail: c.detail });
  }
  return { ok: findings.length === 0, findings, checked: CHECKS.length };
}
