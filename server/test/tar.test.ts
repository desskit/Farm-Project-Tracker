/** The backup archive is a real tar.gz that standard tools can open. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { tarGzStream } from '@/lib/data/tar';

describe('tar.gz backup archive', () => {
  it('round-trips through the system tar, nested folders and long names included', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fpt-tar-'));
    try {
      const src = path.join(dir, 'src');
      const deep = path.join(src, 'uploads', 'a'.repeat(60), 'b'.repeat(30));
      mkdirSync(deep, { recursive: true });
      writeFileSync(path.join(src, 'app.db'), Buffer.alloc(1300, 7));
      writeFileSync(path.join(deep, `${'c'.repeat(50)}.jpg`), 'photo');
      const out = path.join(dir, 'b.tar.gz');
      await pipeline(tarGzStream(src, 'farm-backup-2026-11-09'), createWriteStream(out));
      const x = path.join(dir, 'x');
      mkdirSync(x);
      execFileSync('tar', ['-xzf', out, '-C', x]);
      const root = path.join(x, 'farm-backup-2026-11-09');
      expect(readFileSync(path.join(root, 'app.db')).length).toBe(1300);
      expect(readFileSync(path.join(root, 'uploads', 'a'.repeat(60), 'b'.repeat(30), `${'c'.repeat(50)}.jpg`), 'utf8')).toBe('photo');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
