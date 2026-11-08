/**
 * In-app "Update now" for admins.
 *
 * The app can't deploy itself — it runs in a container with no access to the
 * host, and giving it that (e.g. the Docker socket) would hand anyone who
 * compromised the app the whole machine. Instead it writes a request file into
 * a folder shared with the host (DEPLOY_CONTROL_DIR, bind-mounted from
 * server/.deploy). scripts/deploy-watch.sh, run by cron on the host, picks it
 * up and runs the normal CI-gated auto-update, then writes status.json and the
 * end of the update log back into the same folder for this page to show.
 */
import 'server-only';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/data/activity';
import { DataError } from '@/lib/data/errors';
import { can } from '@/lib/domain/permissions';

export type DeployState = 'idle' | 'requested' | 'running' | 'ok' | 'failed';

export type DeployStatus = {
  /** False when the host side isn't installed (no shared folder or no watcher yet). */
  available: boolean;
  state: DeployState;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  /** Commit the server is on, and the newest commit that passed CI. */
  current: string | null;
  latest: string | null;
  updateWaiting: boolean;
  /** When the host last wrote status — tells us the watcher is alive. */
  checkedAt: string | null;
  logTail: string;
};

/** How stale status can be before we assume the host watcher isn't running. */
const WATCHER_STALE_MS = 20 * 60_000;

function controlDir(): string | null {
  return process.env.DEPLOY_CONTROL_DIR || null;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export async function deployStatus(nowMs = Date.now()): Promise<DeployStatus> {
  const dir = controlDir();
  const empty: DeployStatus = {
    available: false, state: 'idle', requestedAt: null, startedAt: null, finishedAt: null, exitCode: null,
    current: null, latest: null, updateWaiting: false, checkedAt: null, logTail: '',
  };
  if (!dir || !existsSync(dir)) return empty;

  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(await readFile(path.join(dir, 'status.json'), 'utf8'));
  } catch {
    /* watcher hasn't written anything yet */
  }
  const logTail = await readFile(path.join(dir, 'log-tail.txt'), 'utf8').catch(() => '');
  const checkedAt = str(raw.checkedAt);
  const current = str(raw.current);
  const latest = str(raw.available);

  let state: DeployState = (['idle', 'running', 'ok', 'failed'] as const).find((s) => s === raw.state) ?? 'idle';
  let requestedAt = str(raw.requestedAt);
  const pending = await stat(path.join(dir, 'request')).catch(() => null);
  if (pending) {
    state = 'requested';
    requestedAt = new Date(pending.mtimeMs).toISOString();
  }

  return {
    available: !!checkedAt && nowMs - Date.parse(checkedAt) < WATCHER_STALE_MS,
    state,
    requestedAt,
    startedAt: str(raw.startedAt),
    finishedAt: str(raw.finishedAt),
    exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : null,
    current,
    latest,
    updateWaiting: !!current && !!latest && current !== latest,
    checkedAt,
    logTail,
  };
}

export async function requestUpdate(user: SessionUser): Promise<DeployStatus> {
  if (!can(user, 'system.admin')) throw new DataError('Only an admin can update the server.', 403);
  const dir = controlDir();
  const status = await deployStatus();
  if (!dir || !status.available) {
    throw new DataError('The server side of this button isn’t set up yet (see the deploy guide).', 409);
  }
  if (status.state === 'requested' || status.state === 'running') {
    throw new DataError('An update is already on its way.', 409);
  }
  // The watcher only checks that this file exists; its contents are a note
  // for anyone looking at the folder, never read or run.
  await writeFile(path.join(dir, 'request'), `requested by ${user.id}\n`, { mode: 0o666 });
  await logActivity(user.id, 'asked the server to update');
  return deployStatus();
}
