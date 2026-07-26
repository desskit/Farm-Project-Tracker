/**
 * Nightly local backup: a consistent snapshot of the database plus the
 * uploaded files, rotated to keep a fixed number of days. This runs on the
 * same volume as the live data — it protects against a bad restore, a botched
 * migration, or someone deleting the wrong thing, not against the disk itself
 * dying. (Off-box replication is a separate, larger step the deploy guide
 * covers if that's ever needed.)
 *
 * Two techniques keep this cheap enough to run every night without the
 * backup directory ballooning:
 *  - The database is captured with `VACUUM INTO`, which SQLite guarantees is
 *    a consistent point-in-time copy even while the live db is being written.
 *  - Uploaded files are never modified after creation (only added or
 *    deleted), so each day's snapshot hardlinks them instead of copying —
 *    same inode, no extra disk space, until the live file is actually
 *    deleted and only the backup's link keeps the data alive.
 *
 * A day's folder always mirrors the *current* live state exactly, however
 * many times it's rewritten today (nightly cron, plus any manual "run now").
 * Once the day rolls over, that folder is never touched again — a file
 * deleted from live storage stays recoverable from every earlier day's
 * snapshot until BACKUP_KEEP_DAYS finally prunes it.
 */
import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { client } from '@/db';
import { todayISO, addDays } from '@/lib/domain/dates';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(UPLOAD_DIR), 'backups');
const KEEP_DAYS = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 7);

export type BackupSummary = { date: string; dbBytes: number; fileCount: number; pruned: string[] };
export type BackupEntry = { date: string; dbBytes: number; fileCount: number };

const g = globalThis as unknown as { __fptBackupRunning?: boolean };

/** Hardlinks `src` into `dest`; falls back to a real copy across filesystems (EXDEV). */
async function linkOrCopy(src: string, dest: string): Promise<void> {
  try {
    await fs.link(src, dest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return;
    await fs.copyFile(src, dest);
  }
}

/**
 * Mirrors the live uploads tree into `destRoot` as of right now. A day's
 * folder is only written to during that day (the cron tick, or a manual "run
 * now"), so this also removes any link left over from an earlier run today
 * whose source file has since been deleted — otherwise a same-day rerun would
 * silently accumulate stale links and the reported count would stop matching
 * what's actually on disk. Once the day rolls over the folder is never
 * touched again, so yesterday's snapshot (and its recovery value) is safe.
 */
async function mirrorUploads(destRoot: string): Promise<number> {
  const seen = new Set<string>();
  let count = 0;

  async function walkSource(rel: string): Promise<void> {
    const srcDir = path.join(UPLOAD_DIR, rel);
    const entries = await fs.readdir(srcDir, { withFileTypes: true }).catch(() => []);
    if (entries.length) await fs.mkdir(path.join(destRoot, rel), { recursive: true });
    for (const entry of entries) {
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        await walkSource(relPath);
      } else if (entry.isFile()) {
        seen.add(relPath);
        await linkOrCopy(path.join(UPLOAD_DIR, relPath), path.join(destRoot, relPath));
        count++;
      }
    }
  }
  await walkSource('.');

  async function pruneStale(rel: string): Promise<void> {
    const dir = path.join(destRoot, rel);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        await pruneStale(relPath);
        const remaining = await fs.readdir(path.join(destRoot, relPath)).catch(() => null);
        if (remaining && remaining.length === 0) await fs.rmdir(path.join(destRoot, relPath));
      } else if (entry.isFile() && !seen.has(relPath)) {
        await fs.unlink(path.join(destRoot, relPath));
      }
    }
  }
  await pruneStale('.');

  return count;
}

/** Runs one backup now (used by both the nightly cron tick and the admin "run now" button). */
export async function runBackup(): Promise<BackupSummary> {
  if (g.__fptBackupRunning) throw new Error('A backup is already running.');
  g.__fptBackupRunning = true;
  try {
    const date = todayISO();
    const dir = path.join(BACKUP_DIR, date);
    await fs.mkdir(dir, { recursive: true });

    // VACUUM INTO refuses to overwrite an existing file — remove a same-day
    // snapshot from an earlier manual run first.
    const dbPath = path.join(dir, 'app.db');
    await fs.rm(dbPath, { force: true });
    await client.execute(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);
    const dbBytes = (await fs.stat(dbPath)).size;

    const fileCount = await mirrorUploads(path.join(dir, 'uploads'));

    const pruned = await pruneOldBackups();
    return { date, dbBytes, fileCount, pruned };
  } finally {
    g.__fptBackupRunning = false;
  }
}

/** Deletes dated backup folders past the retention window. Returns the dates removed. */
async function pruneOldBackups(): Promise<string[]> {
  const cutoff = addDays(todayISO(), -(KEEP_DAYS - 1));
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true }).catch(() => []);
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    if (entry.name < cutoff) {
      await fs.rm(path.join(BACKUP_DIR, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  return removed;
}

/** Existing backups, newest first, for the admin data page. */
export async function listBackups(): Promise<BackupEntry[]> {
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true }).catch(() => []);
  const dated = entries.filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name));
  const out: BackupEntry[] = [];
  for (const entry of dated) {
    const dbPath = path.join(BACKUP_DIR, entry.name, 'app.db');
    const dbBytes = await fs.stat(dbPath).then((s) => s.size).catch(() => 0);
    const fileCount = await countFiles(path.join(BACKUP_DIR, entry.name, 'uploads'));
    out.push({ date: entry.name, dbBytes, fileCount });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function countFiles(dir: string): Promise<number> {
  let n = 0;
  async function walk(d: string): Promise<void> {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(d, e.name));
      else if (e.isFile()) n++;
    }
  }
  await walk(dir);
  return n;
}
