/**
 * Runs before every test file's imports (vitest `setupFiles`), so `@/db` —
 * which opens its database on import — always lands on a fresh temp file
 * rather than the developer's real data/app.db. Each file gets its own.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'fpt-test-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'app.db')}`;
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.BACKUP_DIR = path.join(dir, 'backups');
process.env.FPT_TEST_DIR = dir;
