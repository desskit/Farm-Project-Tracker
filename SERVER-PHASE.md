# Farm Project Tracker — Server Deployment Phase Plan

*Status: design · Last updated: 2026-07-21*

This document plans the move from the current client-only prototype to a real, self-hosted,
multi-user server app. It is the companion to [`PLANNING.md`](./PLANNING.md) (the founding design)
and the reference for the server-phase implementation work.

## 1. Context

The app today is a **client-only static prototype**: three scripts (`js/store.js`, `js/app.js`,
`js/qrcode.js`) plus `index.html` / `styles.css` / `sw.js`, deployed to GitHub Pages. All data lives
in the browser as **one localStorage JSON blob**, "auth" is a user switcher (`currentUserId` inside
that blob), photos are stored **inline as base64**, and time-sensitive logic (recurrence rollover,
rent generation, "due today") is computed on the client from `todayISO()`. This is ideal for UX
testing but cannot support a real crew: no shared data, no real accounts, no reminders, no durable
storage, and every device sees only its own browser state.

The server phase makes it a real self-hosted, multi-user app. **Decisions locked with the user:**

- **Full Next.js rewrite** of the UI (App Router + React), per the founding doc's stack.
- **SQLite via Drizzle ORM**, single file on a mounted volume.
- **Email + password auth**, secure cookie sessions, **admin-invite** account provisioning.
- **Live updates via server push (SSE)** so devices stay in sync in near-real-time.
- **Home-server hosting**, exposed by **router port-forward + Caddy** (auto-HTTPS via Let's Encrypt).

The bulk of `store.js` is **pure business logic** (recurrence, dashboard bucketing, leaderboard,
rent ledger, maintenance-due math, calendar expansion, search) — that code ports almost verbatim to
TypeScript and becomes the server's authoritative domain layer. The UI is a rewrite, but the *rules*
are reused.

## 2. Target Architecture

```
Phone / laptop (PWA)  ──HTTPS──▶  Home router :443  ──▶  Caddy (reverse proxy, TLS)
                                                            │  proxy → app:3000
                                                            ▼
                                              Next.js app (App Router)
                                              ├─ React UI (SSR + client)
                                              ├─ /api/* Route Handlers (JSON)
                                              ├─ /api/events  (SSE stream)
                                              ├─ domain layer (ported logic)
                                              ├─ Drizzle → SQLite  (/data/app.db)
                                              ├─ file store (/data/uploads)
                                              ├─ in-process event bus (realtime)
                                              └─ node-cron worker (rent, digests, push)
                                              external: Open-Meteo, SMTP, Web Push, Anthropic API
```

A single container (one Node process) plus a Caddy container, orchestrated by `docker-compose`.
SQLite + in-process pub/sub are correct here because it's one process on one box — no queue/broker
needed.

## 3. Project Restructure (new Next.js app)

The current static files are retired, but their logic and design are reused:

- `db/schema.ts` — Drizzle tables (see §4). `db/index.ts` — client. `db/migrate.ts`, `db/seed.ts`.
- `lib/domain/` — **ported pure logic** from `js/store.js`, one module per concern:
  - `recurrence.ts` — `nextOccurrenceAfter`, `clampToSeason`, `isActiveSeason`, `describeSchedule` (`js/store.js:57-115`)
  - `dashboard.ts` — `bucketForDate`, `dashboard`, `counts`
  - `leaderboard.ts` — `leaderboard`, `userPoints`, `userStreak`, `choreStreak`
  - `rent.ts` — charge generation, `rentSummary`, status transitions
  - `maintenance.ts` — `maintenanceStatus`, next-due recompute, `itemCostTotal` / `assetCostTotal`
  - `calendar.ts` — `calendarItems` (`js/store.js:1229`); `search.ts`; `dates.ts`
  - `weather.ts` — `fireDanger` + `weatherEmoji` (ported from `js/app.js:1042-1063`)
- `lib/data/` — server data-access layer: the ~100 `Store` operations reimplemented against Drizzle
  (identity comes from the **session**, not a stored `currentUserId`). Role guards port
  `isManager` / `canCreateProject` / `canManageUsers` (`js/store.js:269-272`) and run on the server.
- `app/api/**/route.ts` — Route Handlers (REST-ish, grouped by resource); `app/api/events/route.ts` — SSE.
- `app/(app)/**` — React screens replacing `js/app.js` views (dashboard, chores, upkeep, projects,
  more-hub, etc.); reuse `styles.css` tokens/components as the design system (Tailwind or CSS Modules).
- `app/(auth)/login`, `app/(auth)/invite/[token]` — auth screens.
- `worker/cron.ts` — scheduled jobs. `public/manifest.webmanifest`, `public/sw.js` — PWA (push-capable).
- `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.env.example`.

Client data flow replaces `var S = window.Store` (`js/app.js:6`): use **TanStack Query** (React
Query) for reads/mutations against `/api/*`; an SSE subscription invalidates affected queries, so the
236 former synchronous `S.xxx` reads become cached async queries that refetch on change.

## 4. Data Model (Drizzle / SQLite)

Port the runtime shapes seen in `seed()` (`js/store.js:118-235`) and PLANNING.md §7. Tables:

- `users` (id, name, email UNIQUE, password_hash, role, created_at)
- `sessions` (id, user_id, expires_at) · `invites` (token, email, role, expires_at, used_at)
- `chores` (schedule JSON, catch_up, assigned_to, next_due, require_photo, open, steps JSON)
- `chore_completions` (chore_id, completed_by, date, notes, photo_attachment_id)
- `assets` (name, category, meter_unit) · `meter_readings` (asset_id, reading, by, date)
- `maintenance_items` (interval_type, interval_value, interval_unit, last_done_date,
  last_done_reading, due_at_reading, next_due_date, require_photo)
- `maintenance_logs` (item_id, by, date, reading, notes, cost, photo_attachment_id)
- `projects` (status, target_date, created_by) · `project_tasks` (assigned_to, due_date, done,
  done_by, done_at, sort, require_photo, open, sent_back JSON, done_photo_attachment_id)
- `inventory` + `inventory_log` · `time_entries` (kind, ref_id, user_id, start, end, seconds)
- `rent_assignments` + `rent_charges` (status: unpaid / marked / verified + audit cols)
- `notes` (parent_type, parent_id, body, photo_attachment_id) · `attachments` (id, path, mime, size,
  uploaded_by, created_at) — **files on disk, metadata in DB**
- `activity`, `notification_prefs`, `push_subscriptions`, `settings` (weather cache per location)

**Migration importer:** a one-time admin route that ingests an exported prototype backup
(`Store.exportState`, `js/store.js:1253`), creating rows and **writing base64 photos out to
`/data/uploads`** as real attachments — so a tester's existing data survives the move.

## 5. Auth (admin-invite + cookie sessions)

- Passwords hashed with **argon2** (or bcrypt). Login issues an httpOnly, `Secure`, `SameSite=Lax`
  session cookie backed by the `sessions` table; logout deletes it.
- **Provisioning:** admin adds a person (already an app flow) → server mints an `invites` token →
  emailed link → `/invite/[token]` set-password page → account activated. No open signup.
- Next.js **middleware** guards `app/(app)/*` and `/api/*`; every mutating handler re-checks role
  server-side (ported guards). The client keeps role-based UI hiding as UX only.
- Remove the user switcher (`setCurrentUser`); identity = session user. (Optional admin-only "act as"
  can come later, off by default.)

## 6. Realtime (SSE)

- `GET /api/events` holds an authenticated **SSE** stream per device.
- An in-process **event bus** publishes typed change events (e.g. `chore.completed`, `rent.updated`)
  from every mutation. Clients receive them and **invalidate the matching React Query keys** → refetch.
- Reconnect with `Last-Event-ID` + backoff. SSE (not WebSocket) chosen: one-directional, proxies
  cleanly through Caddy, no upgrade handshake. (WebSocket remains a later option if bidirectional
  needs arise.)

## 7. Photos & File Storage

- Uploads go to `POST /api/attachments` (multipart), resized/normalized with **sharp**, written to
  `/data/uploads`, metadata rows in `attachments`. Served by an **auth-checked**
  `GET /api/attachments/[id]`. Replaces base64-in-state (`fileToDataURL`, `js/app.js:55`).
- Enforce max size + allowed types (image/*, application/pdf). Asset QR deep-links keep working — they
  now point at the real HTTPS URL + `#asset=<id>`.

## 8. Notifications & Cron

`worker/cron.ts` (node-cron in the same process):

- **Rent:** generate monthly charges on schedule (server-authoritative; removes client-time logic).
- **Recurrence / overdue:** nightly reconciliation of `next_due` (client no longer rolls dates).
- **Email digests:** daily/weekly per-user overdue + upcoming summaries via **Nodemailer + SMTP** (env).
- **Web Push:** morning "due today" + maintenance-crossing alerts via **web-push (VAPID)**;
  subscriptions captured by the PWA and stored in `push_subscriptions`. Honors `notification_prefs`.

## 9. Server-side Integrations

- **Weather + fire:** a cron job fetches Open-Meteo per saved location and **caches** the 7-day
  forecast (with hourly humidity/wind) in `settings`; `fireDanger` (ported from `js/app.js`) is
  computed server-side. The client just reads the cache — no client API calls, works behind the firewall.
- **AI "Suggest steps":** replace the offline placeholder (`suggestSteps`, `js/store.js:682`) with a
  server route using **`@anthropic-ai/sdk`**, model **`claude-opus-4-8`**, structured outputs (Zod)
  → validated `{ title, description? }[]` mapped onto `project_tasks`. Key via `ANTHROPIC_API_KEY`;
  the button stays hidden when unset (the UI already degrades gracefully).

## 10. Deployment (home server: port-forward + Caddy)

- **Dockerfile:** multi-stage (build Next.js standalone → slim runtime). **docker-compose.yml:**
  `app` (Next.js, `:3000`, volumes `/data` for `app.db` + `uploads`) and `caddy` (`:80` / `:443`).
- **Caddyfile:** `farm.example.com { reverse_proxy app:3000 }` → automatic Let's Encrypt TLS.
- **Router:** forward external 80/443 → server; **DDNS** if the ISP IP is dynamic; a domain/subdomain
  is required for Let's Encrypt.
- **.env:** `SESSION_SECRET`, `SQLITE_PATH`, `PUBLIC_URL`, `SMTP_*`, `VAPID_PUBLIC` / `VAPID_PRIVATE`,
  `ANTHROPIC_API_KEY`. Documented in `.env.example`.
- **Backups:** nightly copy of `app.db` + `uploads/` (optionally **Litestream** for continuous SQLite
  replication).
- **Hardening (important with public exposure):** HTTPS-only + secure cookies, **login
  rate-limiting**, security headers, optional fail2ban on Caddy logs; healthcheck endpoint.

## 11. What Changes In the App (client behavior → server world)

- **Persistence:** localStorage blob → SQLite via `/api/*`. The 236 synchronous `S.xxx` reads become
  React Query async reads; mutations POST, then rely on SSE-driven refetch (replaces "re-render after
  local mutation").
- **Identity / auth:** `currentUserId`-in-state → session user; add login / invite / set-password /
  logout; remove the user switcher. Role checks enforced server-side.
- **Photos:** base64 inline → uploaded files served via auth'd URLs.
- **Time-sensitive logic:** recurrence rollover, rent generation, and due recompute move to the server
  (+ cron) — the client no longer derives these from `todayISO()`.
- **Weather / fire + AI:** client Open-Meteo fetch → server cache; AI placeholder → real Claude call.
- **PWA / service worker:** static network-first cache → app-shell + API-aware caching **plus push**;
  offline degrades to a read-only cached view (mutations need connectivity).
- **Backup / export:** `Store.exportState` / `importState` → admin server endpoints (+ the one-time importer).

## 12. Build Roadmap (phased, each shippable/testable)

0. Scaffold Next.js + Drizzle + Docker/Caddy skeleton; healthcheck; SQLite up.
1. Auth: users, sessions, admin-invite, set-password, middleware guards.
2. Port `lib/domain/*`; data layer; core resources (chores + dashboard) end-to-end.
3. Remaining resources: assets/maintenance, projects/tasks, inventory, rent, timers, notes, attachments.
4. Realtime SSE + React Query invalidation.
5. Cron + email digests + web push (+ prefs).
6. Weather/fire cache + AI Suggest-steps.
7. PWA push polish, backups/Litestream, hardening, migration importer.

## 13. Verification

- **Local e2e:** `docker compose up`; walk login → invite a user → set password → CRUD every resource;
  open two devices and confirm an action on one **pushes** to the other via SSE; install the PWA on a
  phone and receive a **web-push**; trigger cron jobs manually (rent charge, digest) and verify
  email/push; test Suggest-steps with a real key; back up and restore `app.db` + `uploads`.
- **Off-network:** reach `https://farm.example.com` from cellular; confirm valid TLS and secure cookies.
- **Automated:** port the existing Playwright suites (all 8 currently green) to drive the running
  server instead of the static file server; add **Vitest** unit tests for the ported domain modules
  (recurrence, dashboard buckets, leaderboard, rent transitions, maintenance due, fire index) reusing
  the prototype's expected values; add auth/role-guard integration tests and a migration-importer test
  that ingests an exported prototype JSON and checks photos land on disk.
