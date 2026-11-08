/**
 * The admin update button only ever drops a request file; status comes from
 * what the host watcher wrote. Checks the states the panel relies on.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { useTestDb, makeUser } from './db';
import { deployStatus, requestUpdate } from '@/lib/deploy/control';

await useTestDb();
const dir = path.join(process.env.FPT_TEST_DIR!, 'deploy');
mkdirSync(dir, { recursive: true });
process.env.DEPLOY_CONTROL_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const status = (o: Record<string, unknown>) =>
  writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ state: 'idle', current: 'aaaa1111', available: 'aaaa1111', checkedAt: new Date().toISOString(), ...o }));

describe('deploy control', () => {
  it('is unavailable until the host watcher has reported recently', async () => {
    expect((await deployStatus()).available).toBe(false);
    status({ checkedAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    expect((await deployStatus()).available).toBe(false);
    status({});
    expect((await deployStatus()).available).toBe(true);
  });

  it('flags a waiting update and lets only an admin request one, once', async () => {
    status({ available: 'bbbb2222' });
    expect((await deployStatus()).updateWaiting).toBe(true);

    const mgr = await makeUser('manager');
    await expect(requestUpdate(mgr)).rejects.toThrow(/admin/);
    expect(existsSync(path.join(dir, 'request'))).toBe(false);

    const admin = await makeUser('admin');
    expect((await requestUpdate(admin)).state).toBe('requested');
    await expect(requestUpdate(admin)).rejects.toThrow(/already/);

    // Host picked it up and is running.
    rmSync(path.join(dir, 'request'));
    status({ state: 'running' });
    await expect(requestUpdate(admin)).rejects.toThrow(/already/);
  });
});
