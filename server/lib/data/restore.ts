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
import { eq, sql } from 'drizzle-orm';
import { db, schema, transaction } from '@/db';
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

  await transaction(async (tx) => {
    // Delete content, children before parents (safe whether or not FKs are on).
    for (const t of [
      schema.sales,
      schema.depositEntries,
      schema.guideLinks,
      schema.guidePhotos,
      schema.guides,
      schema.notices,
      schema.contacts,
      schema.choreSupplies,
      // Livestock, land and rentals (children before parents).
      schema.inspectionPhotos,
      schema.utilityBills,
      schema.utilityAccounts,
      schema.inspections,
      schema.grazingMoves,
      schema.harvests,
      schema.landEvents,
      schema.plantings,
      schema.perennials,
      schema.webhooks,
      schema.hatches,
      schema.productionLogs,
      schema.breedings,
      schema.animalEvents,
      schema.animals,
      schema.animalGroups,
      schema.landUnits,
      schema.activity,
      schema.inventoryLog,
      schema.inventory,
      schema.rentDocs,
      schema.rentCharges,
      schema.leaseTenants,
      schema.leases,
      schema.rentalUnits,
      schema.rentAssignments,
      schema.choreCompletions,
      schema.choreAssignees,
      schema.chores,
      schema.maintenanceLogs,
      schema.maintenanceItems,
      schema.meterReadings,
      schema.assetDocs,
      schema.assets,
      schema.taskAssignees,
      schema.projectExpenses,
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
        // Never deactivate (or demote out of admin) the person running the
        // restore — that would lock them out of their own server.
        const isActor = id === admin.id;
        await tx
          .update(schema.users)
          .set({
            name: String(u.name),
            email: String(u.email),
            role: (isActor ? 'admin' : u.role) as never,
            active: isActor ? true : u.active !== false,
            deactivatedAt: isActor ? null : ((u.deactivatedAt as number | null) ?? null),
          })
          .where(eq(schema.users.id, id));
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
      [schema.projectExpenses, 'projectExpenses', 'photoId'],
      [schema.inventory, 'inventory'],
      [schema.inventoryLog, 'inventoryLog'],
      [schema.notes, 'notes', 'photoId'],
      [schema.rentAssignments, 'rentAssignments'],
      [schema.rentalUnits, 'rentalUnits'],
      [schema.leases, 'leases'],
      [schema.leaseTenants, 'leaseTenants'],
      [schema.rentCharges, 'rentCharges'],
      [schema.utilityAccounts, 'utilityAccounts'],
      [schema.utilityBills, 'utilityBills'],
      [schema.inspections, 'inspections'],
      [schema.landUnits, 'landUnits'],
      [schema.animalGroups, 'animalGroups'],
      [schema.animals, 'animals', 'photoId'],
      [schema.animalEvents, 'animalEvents'],
      [schema.breedings, 'breedings'],
      [schema.productionLogs, 'productionLogs'],
      [schema.hatches, 'hatches'],
      [schema.webhooks, 'webhooks'],
      [schema.plantings, 'plantings'],
      [schema.perennials, 'perennials'],
      [schema.harvests, 'harvests'],
      [schema.landEvents, 'landEvents'],
      [schema.grazingMoves, 'grazingMoves'],
      [schema.sales, 'sales'],
      [schema.depositEntries, 'depositEntries'],
      [schema.choreSupplies, 'choreSupplies'],
      [schema.notices, 'notices'],
      [schema.contacts, 'contacts'],
      [schema.guides, 'guides'],
      [schema.guideLinks, 'guideLinks'],
      [schema.settings, 'settings'],
      [schema.activity, 'activity'],
    ];
    for (const [table, key, photoField] of plan) {
      let rows = arr(key);
      if (photoField) rows = clean(rows, photoField);
      await insertChunked(tx as unknown as typeof db, table, rows);
      counts[key] = rows.length;
    }

    // Asset and rental documents carry a required attachment, so a row whose
    // file isn't on this server is dropped rather than nulled (which the
    // column forbids).
    const docs = arr('assetDocs').filter((d) => typeof d.attachmentId === 'string' && attIds.has(d.attachmentId));
    await insertChunked(tx as unknown as typeof db, schema.assetDocs, docs);
    counts.assetDocs = docs.length;

    const guidePics = arr('guidePhotos').filter((d) => typeof d.attachmentId === 'string' && attIds.has(d.attachmentId));
    await insertChunked(tx as unknown as typeof db, schema.guidePhotos, guidePics);
    counts.guidePhotos = guidePics.length;

    const inspPhotos = arr('inspectionPhotos').filter((d) => typeof d.attachmentId === 'string' && attIds.has(d.attachmentId));
    await insertChunked(tx as unknown as typeof db, schema.inspectionPhotos, inspPhotos);
    counts.inspectionPhotos = inspPhotos.length;

    const rentPapers = arr('rentDocs').filter((d) => typeof d.attachmentId === 'string' && attIds.has(d.attachmentId));
    await insertChunked(tx as unknown as typeof db, schema.rentDocs, rentPapers);
    counts.rentDocs = rentPapers.length;

    // A backup from before leases has per-person rent only: wrap it the way the
    // 0018 migration did, so rent keeps billing after the restore.
    if (!backup.leases && arr('rentAssignments').length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const run = (q: ReturnType<typeof sql>) => (tx as any).run(q);
      await run(sql`INSERT OR IGNORE INTO rental_units (id, name, kind) SELECT 'ru_' || a.user_id, u.name || '''s place', 'other' FROM rent_assignments a JOIN users u ON u.id = a.user_id`);
      await run(sql`INSERT OR IGNORE INTO leases (id, unit_id, start_date, end_date, rent, due_day, status, notes)
        SELECT 'ls_' || a.user_id, 'ru_' || a.user_id,
          COALESCE((SELECT MIN(c.month) FROM rent_charges c WHERE c.user_id = a.user_id) || '-01', date('now', 'localtime')),
          CASE WHEN a.active THEN NULL ELSE date('now', 'localtime') END, a.amount, a.due_day,
          CASE WHEN a.active THEN 'active' ELSE 'ended' END, 'Created from the rent set up before leases.'
        FROM rent_assignments a JOIN users u ON u.id = a.user_id`);
      await run(sql`INSERT OR IGNORE INTO lease_tenants (lease_id, user_id, is_primary) SELECT 'ls_' || a.user_id, a.user_id, 1 FROM rent_assignments a JOIN users u ON u.id = a.user_id`);
      await run(sql`UPDATE rent_charges SET lease_id = 'ls_' || user_id WHERE lease_id IS NULL AND user_id IN (SELECT user_id FROM rent_assignments)`);
    }

    // Assignee join rows last — they need both the work item and the person to
    // exist. Anything pointing at a user this server doesn't have is skipped.
    const userIds = new Set((await tx.select({ id: schema.users.id }).from(schema.users)).map((u) => u.id));
    const choreIds = new Set(arr('chores').map((c) => String(c.id)));
    const taskIds = new Set(arr('projectTasks').map((t) => String(t.id)));
    // A backup taken before multi-assignee has no join rows, only the old
    // single `assignedTo` on each item — derive the links from that instead.
    const derive = (key: string, idField: string): AnyRow[] =>
      arr(key)
        .filter((r) => typeof r.assignedTo === 'string' && r.assignedTo)
        .map((r) => ({ [idField]: r.id, userId: r.assignedTo }));
    const rawChoreLinks = backup.choreAssignees ? arr('choreAssignees') : derive('chores', 'choreId');
    const rawTaskLinks = backup.taskAssignees ? arr('taskAssignees') : derive('projectTasks', 'taskId');

    const choreLinks = rawChoreLinks.filter(
      (r) => choreIds.has(String(r.choreId)) && userIds.has(String(r.userId)),
    );
    const taskLinks = rawTaskLinks.filter(
      (r) => taskIds.has(String(r.taskId)) && userIds.has(String(r.userId)),
    );
    await insertChunked(tx as unknown as typeof db, schema.choreAssignees, choreLinks);
    await insertChunked(tx as unknown as typeof db, schema.taskAssignees, taskLinks);
    counts.choreAssignees = choreLinks.length;
    counts.taskAssignees = taskLinks.length;
  });

  await logActivity(admin.id, 'restored farm data from a backup', { audience: 'system.admin' });
  return counts;
}
