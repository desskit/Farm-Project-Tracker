import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // Next aliases this at build time; outside Next it would throw on import.
      'server-only': resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'db/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // Date logic runs on the process timezone; pin it so results never
    // depend on the machine running the tests.
    env: { TZ: 'America/Chicago' },
    // Each data-layer test file gets its own temp database (see
    // test/db.ts), and the db module is a per-process singleton.
    pool: 'forks',
  },
});
