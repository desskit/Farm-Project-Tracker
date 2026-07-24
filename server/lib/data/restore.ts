/**
 * Restore a farm from a JSON backup produced by GET /api/data/export.
 *
 * Semantics (admin-only, destructive): content tables are replaced wholesale
 * inside a transaction, so a failure leaves the existing data untouched. Users
 * are *upserted* rather than replaced — an existing account keeps its password,
 * so the admin performing the restore is never locked out, and accounts that
 * only exist in the backup come in as pending (they set a password via invite).
 * Photo references that point at files not present on this server are nulled so
 * the restore can't fail on a dangling attachment.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { DataError } from './errors';

type AnyRow = Record<string, unknown>;
type Backup = { version?: number } & Record<string, unknown>;

async function insertChunked(tx: typeof db, table: unknown, rows: AnyRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (chunk.length) await (tx as any).insert(table).values(chunk);
  }
}

export async function restoreBackup(admin: SessionUser, backup: Backup): Promise<Record<string, number>> {
  if (!backup || typeof backup !== 'object') throw new DataError('That file is not a valid backup.', 400);
  if (backup.version !== 1) throw new DataError('Unsupported or unrecognized backup version.', 400);

  const arr = (k: string): AnyRow[] => (Array.isArray(backup[k]) ? (backup[k] as AnyRow[]) : []);

  // Null out photo references whose file isn't on this server, so inserts can't
  // fail on a dangling attachment (e.g. restoring onto a fresh volume).
  const attIds = new Set((await db.select({ id: schema.attachments.id }).from(schema.attachments)).map((r) => r.id));
  const clean = (rows: AnyRow[], field: string): AnyRow[] =>
    rows.map((r) => ({ ...r, [field]: typeof r[field] === 'string' && attIds.has(r[field] as string) ? r[field] : null }));

  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    // Delete content, children before parents (safe whether or not FKs are on).
    for (const t of [
      schema.activity,
      schema.inventoryLog,
      schema.inventory,
      schema.rentCharges,
      schema.rentAssignments,
      schema.choreCompletions,
      schema.chores,
      schema.maintenanceLogs,
      schema.maintenanceItems,
      schema.meterReadings,
      schema.assets,
      schema.projectTasks,
      schema.projects,
      schema.notes,
      schema.settings,
    ]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (tx as any).delete(t);
    }

    // Users: upsert by id, preserving any existing password hash.
    const existing = new Map((await tx.select().from(schema.users)).map((u) => [u.id, u]));
    for (const u of arr('users')) {
      const id = String(u.id);
      if (existing.has(id)) {
        await tx.update(schema.users).set({ name: String(u.name), email: String(u.email), role: u.role as never }).where(eq(schema.users.id, id));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.insert(schema.users).values({ ...(u as any), passwordHash: null });
        await tx.insert(schema.notificationPrefs).values({ userId: id }).onConflictDoNothing();
      }
    }
    counts.users = arr('users').length;

    for (const p of arr('notificationPrefs')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.insert(schema.notificationPrefs).values(p as any).onConflictDoNothing();
    }

    // Insert content, parents before children.
    const plan: [unknown, string, string?][] = [
      [schema.assets, 'assets'],
      [schema.meterReadings, 'meterReadings'],
      [schema.maintenanceItems, 'maintenanceItems'],
      [schema.maintenanceLogs, 'maintenanceLogs', 'photoId'],
      [schema.chores, 'chores'],
      [schema.choreCompletions, 'choreCompletions', 'photoId'],
      [schema.projects, 'projects'],
      [schema.projectTasks, 'projectTasks', 'donePhotoId'],
      [schema.inventory, 'inventory'],
      [schema.inventoryLog, 'inventoryLog'],
      [schema.notes, 'notes', 'photoId'],
      [schema.rentAssignments, 'rentAssignments'],
      [schema.rentCharges, 'rentCharges'],
      [schema.settings, 'settings'],
      [schema.activity, 'activity'],
    ];
    for (const [table, key, photoField] of plan) {
      let rows = arr(key);
      if (photoField) rows = clean(rows, photoField);
      await insertChunked(tx as unknown as typeof db, table, rows);
      counts[key] = rows.length;
    }
  });

  await logActivity(admin.id, 'restored farm data from a backup');
  return counts;
}
