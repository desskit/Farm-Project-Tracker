# Farm Project Tracker — Server

The self-hosted, multi-user server-phase rewrite of the Farm Project Tracker
(Next.js + SQLite). See [`../SERVER-PHASE.md`](../SERVER-PHASE.md) for the full design.

> **Status:** Phase 0–1 in progress. The foundation runs (DB, migrations, seed,
> auth core, healthcheck, Docker/Caddy). Auth routes and the full UI are next.

## Stack

- **Next.js 14 (App Router)** — UI + API in one process, `output: standalone`.
- **SQLite via Drizzle ORM** (libsql driver, no native build step).
- **Auth**: password hashing with Node `scrypt`, opaque session cookies.
- **Migrations run automatically on boot** (`instrumentation.ts` → `lib/boot-migrate.ts`),
  and a first admin is created from `SEED_ADMIN_*` on an empty database.

## Local development

```bash
cd server
cp .env.example .env            # edit values
npm install
npm run db:generate             # (re)generate SQL migrations from db/schema.ts
DATABASE_URL="file:./data/app.db" npm run db:migrate
DATABASE_URL="file:./data/app.db" npm run db:seed   # optional demo farm data
npm run dev                     # http://localhost:3000  (health: /api/health)
```

Useful scripts: `npm run typecheck`, `npm test` (Vitest domain-logic tests),
`npm run build`.

## Deploy with Docker + Caddy (home server)

```bash
cd server
cp .env.example .env            # set PUBLIC_DOMAIN, SESSION_SECRET, SEED_ADMIN_*, TZ
docker compose up -d --build
```

- The **app** container auto-migrates on boot and creates the first admin.
- **Caddy** terminates HTTPS for `PUBLIC_DOMAIN` (automatic Let's Encrypt) and
  proxies to the app. It needs inbound **80/443**.
- Data (SQLite file + uploads) lives in the `farmdata` Docker volume.

### Router / DNS

- Point `PUBLIC_DOMAIN` at your home IP (A record). If your ISP IP is dynamic,
  use **DDNS** (e.g. Cloudflare/DuckDNS) and keep the record updated.
- Forward external **TCP 80 and 443** to the host running Docker.
- Let's Encrypt needs 80/443 reachable to issue the certificate.

## Running on Proxmox

Both work; pick one:

- **VM (simplest):** create a Debian/Ubuntu VM, install Docker, clone the repo,
  `docker compose up -d --build`. No special settings.
- **LXC container (lighter):** use a Debian template and enable Docker support on
  the container — set `features: nesting=1,keyctl=1` (Options → Features, or in
  `/etc/pve/lxc/<id>.conf`), then install Docker inside. Unprivileged + nesting is
  fine for this workload.

Give the guest a static IP on your LAN and forward the router's 80/443 to it.
Snapshot the guest before upgrades; the SQLite volume is the thing to back up.

## Backups

The whole app state is the `farmdata` volume (`/data/app.db` + `/data/uploads`).
Back it up with a nightly volume copy, or add **Litestream** for continuous SQLite
replication (planned). To restore, drop the files back into the volume.

## Environment variables

See [`.env.example`](./.env.example). Optional integrations (SMTP email digests,
VAPID web-push, Anthropic "Suggest steps") stay disabled while their vars are blank.
