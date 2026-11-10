# Farm Project Tracker — Server

The self-hosted, multi-user farm app (Next.js + SQLite) that runs the farm day to day. It
replaced the browser-only prototype in the repo root. Install and day-to-day running are
covered in **[DEPLOY-PROXMOX.md](./DEPLOY-PROXMOX.md)**. Who can do what is in
**[../docs/permissions.md](../docs/permissions.md)** (also in the app: People → Who sees what).

## What it does

| Area | What's in it |
|---|---|
| **Today** | Your overdue / due today / coming up, work up for grabs, weather, and "farm today" tiles for managers (upkeep due, low stock, rent to confirm, requests, leases ending). Animals and land cards: eggs, births due, withdrawals, crops ready, sowings due, spray waits |
| **Work** | Repeating chores (skip or snooze an occurrence), projects with tasks (tasks can repeat), equipment upkeep by date or meter, claiming open work, proof photos, timers, sending work back |
| **Farm** | Supplies with quick logging; assets and their papers; **animals** (groups, individual records, eggs/milk/wool, treatments with withdrawal dates, breeding, care chores); **land** (gardens and beds, plantings and successions, orchard, harvests, sprays with pre-harvest intervals, grazing rotation) |
| **Money** | Rent per lease, utilities billed back, late fees, rent history, project budgets and expenses, spending |
| **Rentals** | Units, leases with several tenants, inspections with photos and move-in/move-out comparison, maintenance requests tied to the unit, lease-end reminders |
| **Renter portal** | Renters get their rent, documents and requests — never the farm |
| **People** | Six roles (admin, manager, family, crew, guest, renter) with per-person switches, guest access that expires, preview-as-person, invite emails |
| **Other** | Passwords & codes vault (encrypted, shared by group), calendar, search, activity, leaderboard, CSV exports, push/email digests, offline logging that syncs later |

## Stack

- **Next.js 14 (App Router)**: UI and API in one process, `output: standalone`.
- **SQLite via Drizzle ORM** (libsql driver, no native build step). WAL mode, foreign keys on.
- **Auth**: `scrypt` password hashes, random session tokens stored hashed, login throttling,
  Origin checks on every write, a per-request CSP script nonce.
- **Permissions**: one capability table (`lib/domain/permissions.ts`) drives the API, screens and
  navigation. Tests fail if a route skips its check or the doc drifts from the table.
- **Migrations run on boot** (`lib/boot-migrate.ts`), after a snapshot of the database. The
  nightly updater rehearses them on a copy first.

## Local development

```bash
cd server
cp .env.example .env            # set TZ and SEED_ADMIN_* at least
npm ci
DATABASE_URL="file:./data/app.db" npm run db:migrate
DATABASE_URL="file:./data/app.db" npm run db:seed   # optional demo farm data
npm run dev                     # http://localhost:3000  (health: /api/health)
```

Before pushing: `npm run typecheck && npm run lint && npm test && npm run build` (CI runs the same).

Changing the database: edit `db/schema.ts`, run `npm run db:generate`, read the SQL it wrote, and
add a migration test in `test/migrations.test.ts` when existing rows are reshaped.

Changing permissions: edit `CAPS` / `MATRIX` in `lib/domain/permissions.ts`, then
`npx tsx scripts/permissions-doc.ts` to regenerate `docs/permissions.md`.

## How releases reach the server

1. Push to `main` → GitHub Actions CI (typecheck, lint, tests, build).
2. If CI passes, CI fast-forwards the **`deploy`** branch.
3. On the server, `scripts/auto-update.sh` (cron, 3 a.m.) pulls `deploy`, builds, rehearses the
   migrations on a copy of the live database, switches over, and rolls back code and data if the
   health check fails. Admins can also start it from More → Data → Update
   (`scripts/deploy-watch.sh` picks the request up within a minute).

See [`scripts/README-auto-update.md`](./scripts/README-auto-update.md).

## Backups

- **Nightly (02:40):** a consistent `VACUUM INTO` snapshot of the database plus hard links of every
  upload, kept for `BACKUP_KEEP_DAYS` (default 7) next to the data.
- **Download:** More → Data lists each day's backup with a **.tar.gz** download (database + files).
  Keep one off the server now and then.
- **Restore:** More → Data accepts the JSON export. A Proxmox backup of the whole VM is the
  disaster-recovery copy.

## Environment variables

See [`.env.example`](./.env.example). `TZ` is required (boot refuses UTC unless `ALLOW_UTC=1`).
Email (`SMTP_*`), push (`VAPID_*`) and AI suggestions (`ANTHROPIC_API_KEY`) stay off while blank.
The vault key is created on first use under the data folder unless `VAULT_KEY` is set. There is no
session secret to set.
