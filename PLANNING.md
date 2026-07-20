# Farm Project Tracker — Planning Document

*Status: prototype in progress · Last updated: 2026-07-20*

This document outlines how the Farm Project Tracker app will function. It is the founding
design for the project and the reference for implementation work that follows.

## 1. Vision & Overview

A self-hosted, mobile-first web app that gives a small farm team one place to see **what
needs doing today**. It tracks three kinds of work — recurring chores, maintenance coming
due, and long-term projects — so nothing is forgotten, equipment never silently skips a
service, and big projects keep moving forward. It runs on a home server, works well from a
phone out in the field, and reminds people through the dashboard, email digests, and push
notifications.

## 2. Core Concepts

The app tracks three distinct item types, each with its own lifecycle.

### 2.1 Chores (recurring scheduled tasks)

Regular tasks that repeat on a schedule: feeding, watering, coop cleaning, pasture rotation.

- **Schedules:** daily, weekly, specific weekdays ("every Mon/Thu"), every N days, monthly,
  or seasonal (active only between chosen dates, e.g. "daily, May–September").
- **Completion:** marking a chore done logs *who* did it and *when*, then rolls the next
  occurrence forward.
- **Missed chores** show as overdue. Each chore has a catch-up policy:
  - *Must catch up* — stays overdue until someone does it (e.g. feeding).
  - *Skip to next* — a missed occurrence lapses and the schedule resumes at the next one
    (e.g. weekly mowing).
- **Assignment:** a chore can be assigned to a specific person, rotated, or left open for
  anyone to claim.

### 2.2 Maintenance Items (asset upkeep coming due)

Maintenance is tied to an **asset** — a tractor, well pump, generator, fence line, coop, or
the truck.

- **Due rules:**
  - *Calendar interval* — e.g. "every 6 months" or "every spring".
  - *Usage interval* — e.g. "every 50 engine hours" or "every 3,000 miles", based on
    manually entered meter readings.
- **Completing a service** records the date, meter reading (if applicable), notes, parts,
  and cost, then computes the next due point.
- **Service history:** each asset shows its full log — what was done, when, by whom, and at
  what reading — plus everything upcoming.
- Items approaching their due point appear in the dashboard's "Coming Up" list before they
  go overdue.

### 2.3 Projects (long-term efforts)

Bigger undertakings that span weeks or months: build a run-in shed, fence the north pasture,
overhaul irrigation.

- **Fields:** name, description, target date, status (*idea → planned → in progress →
  on hold → done*).
- **Task checklist:** each project holds a list of tasks. Tasks can be assigned to a person
  and given their own due dates; project progress is visible as tasks complete.
- **Notes & photos** attach to a project to record progress and decisions.
- **AI-assisted planning:** a **"Suggest steps"** button sends the project's name and
  description (plus brief farm context) to the Claude API, which returns a proposed task
  breakdown. The user reviews, edits, and accepts the suggestions into the checklist —
  nothing is added without review. See §6 for the technical design.

### 2.4 Photo proof (cross-cutting)

Managers can flag any **chore, maintenance item, or project task** as requiring a photo
before it can be marked complete. Completion is blocked (server-side in the real app)
until a photo is attached; the photo is stored with the completion record and viewable
from the item's history as proof of work.

### 2.5 Rent

Managers assign **monthly rent** to workers (amount + due day of month). A charge is
generated automatically each month with a two-step ledger:

1. The worker (or a manager) **marks it paid**, optionally noting how (cash, check, app).
2. A manager **verifies** the payment was received — or reopens the charge if not.

Unpaid rent appears on the worker's dashboard like any other due item, and the manager
view shows collected vs. outstanding totals for the month plus full per-person history.

### 2.6 Open / claimable work

Managers can flag a **chore or project task** as **open** — unassigned and available for any
worker to accept. Open work surfaces in an "Up for grabs" section on the dashboard and can be
**claimed** with one tap (which assigns it to the claimer), or **released** back to open by
its current owner or a manager. This lets a crew self-organize instead of every item needing
a manager to assign it.

### 2.7 Leaderboard

A **leaderboard** celebrates good work. Everyone completing work earns points — chores (+2),
project tasks (+5), and maintenance services (+4), with a bonus for photo-verified work.
Ranked with medals and a champion banner, filterable by **this month** or **all time**, it
also surfaces personal **streaks** (consecutive days active) and photo-verified counts.
Per-person point totals also appear on the manager Team dashboard.

### 2.8 Send-back (rework)

A manager can **send back** a completed chore, project task, or logged maintenance service —
undoing the completion and flagging the item to be **redone**. The item reappears as due with
a small "↩ redo" banner naming who sent it back and their optional reason. There is no separate
verify step (completions stand on their own); send-back is the lightweight "that's not finished,
please do it again" control.

### 2.9 Inventory (supplies)

A simple stock list for consumables — feed, bedding, fuel, filters, parts. Each item tracks an
**on-hand quantity**, **unit**, and a **reorder-at** threshold; anything at or below its threshold
surfaces in a **Reorder list** at the top of the Inventory tab. Opening an item logs **usage or
restock** (a signed quantity change with an optional note), and every change is kept in a
per-item history. Managers add, edit, and delete items; anyone can log usage.

### 2.10 Time tracking

Each chore, maintenance item, and project task has a lightweight **Start / Stop timer** so
workers can measure roughly how long work takes. Running timers show a live elapsed count and
collect in a **timers strip** on the dashboard for easy stopping. Stopping logs the elapsed
seconds; total logged time is shown on the item. Nothing heavyweight — just a stopwatch per item.

### 2.11 Multi-step checklists (chores)

A chore can carry an ordered **checklist** of steps (e.g. evening lock-up: coop run, yard water,
barn lights, main gate). When present, completing the chore opens a form that requires **every
step ticked** before it can be marked done — combinable with photo proof.

### 2.12 Asset QR codes, receipts & manuals

Every asset has a printable **QR code** (encoded fully offline — no external service) that deep-links
straight to that asset's detail when scanned (`#asset=<id>`). Assets also hold **documents** —
receipts and manuals uploaded as images or PDFs, stored inline and viewable from the asset detail.

### 2.13 Weather, calendar & global search (dashboard/cross-cutting)

- **7-day weather** on the dashboard via the free open-meteo.com forecast API (no key/account);
  location is set manually or from device geolocation, and it degrades gracefully offline.
- **Calendar view** — a month grid toggled from the dashboard, with color-coded dots per day
  (chore / upkeep / task / rent) and a tap-through day agenda.
- **Global search** — a top-bar search that spans chores, assets, upkeep, projects, tasks,
  inventory, and people, opening the matching detail on tap.

## 3. Users & Roles

| Capability | Admin | Manager | Worker |
|---|:---:|:---:|:---:|
| Manage users & app settings | ✅ | — | — |
| Create/edit chores & maintenance items | ✅ | ✅ | — |
| **Create projects** | ✅ | ✅ | — |
| Assign work | ✅ | ✅ | — |
| View projects, complete/comment on project tasks | ✅ | ✅ | ✅ |
| Complete chores & log maintenance/readings | ✅ | ✅ | ✅ |
| Add notes/photos | ✅ | ✅ | ✅ |

- **Project creation is restricted to farm Managers (and Admins).** Workers can see
  projects and work project tasks, but cannot create projects. This is enforced
  server-side on the project-create endpoint, not just hidden in the UI.
- **Auth:** simple email + password with server-side sessions. No third-party identity
  provider required (the app lives on the home network).
- **Accountability:** every completion, reading, and edit records who did it, feeding a
  history/activity log.

## 4. Reminders & Notifications

Three channels, all opt-in per user via a notification preferences page:

1. **Dashboard (in-app).** The home screen shows **Overdue / Due Today / Coming Up (next
   7 days)**, filtered to "mine" by default with an "everything" toggle. This is the
   at-a-glance view for the start of the day.
2. **Email digests.** A daily (and/or weekly) email per user summarizing their overdue and
   upcoming items, sent through user-configured SMTP.
3. **Push notifications.** Web Push (VAPID) to subscribed devices: a morning "due today"
   summary and alerts when a maintenance item crosses into due/overdue. The app is an
   installable **PWA**, so push works from a phone home-screen icon like a native app.

## 5. Key Screens

- **Dashboard** — Overdue / Due Today / Coming Up, mine vs. everything. Managers get a
  third **Team** view: farm-wide status tiles, per-person workload, project progress,
  and this month's rent at a glance.
- **Chores** — list with next-due dates; chore detail with schedule, assignment, history.
- **Assets & Maintenance** — asset list; asset detail with upcoming service, full service
  history, and meter-reading entry.
- **Projects** — board/list by status; project detail with task checklist, notes, photos,
  and the "Suggest steps" button.
- **Leaderboard** — points-ranked celebration of completed work, with medals, streaks, and a
  this-month / all-time toggle.
- **History** — activity log across the whole farm (who did what, when).
- **Admin** — user management, notification settings, backup/export.

All screens are designed phone-first (large tap targets, works one-handed at the barn),
scaling up to desktop.

## 6. Tech Stack

Chosen to make self-hosting on a home server / Raspberry Pi / NAS as simple as possible:
one process, one database file, one Docker container.

| Concern | Choice | Why |
|---|---|---|
| App framework | **Next.js** (single Node.js app, UI + API) | One process to run and update |
| Database | **SQLite** via Drizzle ORM | Zero admin, single file, trivial backups |
| Auth | Session cookies (sessions table) | Simple, no external identity provider |
| Scheduling | In-process cron (`node-cron`) | Digests, push dispatch, recurrence rollover — no job queue needed |
| Email | Nodemailer + user-supplied SMTP | Works with any mail provider |
| Push | `web-push` (VAPID) + PWA manifest/service worker | Native-feeling notifications, no app store |
| AI steps | **`@anthropic-ai/sdk`** → model **`claude-opus-4-8`** | See below |
| Deploy | Single Docker image + `docker-compose.yml` | App container + volume for the SQLite file |

### AI step generation (Claude API)

- Runs **server-side only**; the API key is supplied via the `ANTHROPIC_API_KEY`
  environment variable and never reaches the browser.
- Uses **structured outputs** (`output_config.format` with a JSON schema — via
  `client.messages.parse()` + Zod) so the response is a validated array of
  `{ title, description?, estimated_effort? }` steps that maps directly onto
  `project_tasks`.
- Adaptive thinking (`thinking: {type: "adaptive"}`) is enabled for better task
  breakdowns on complex projects.
- The feature **degrades gracefully**: if no API key is configured, the "Suggest steps"
  button simply doesn't appear.

## 7. Data Model Sketch

| Table | Key columns (sketch) |
|---|---|
| `users` | id, name, email, password_hash, role (admin/manager/worker) |
| `sessions` | id, user_id, expires_at |
| `chores` | id, name, schedule (type + params), season window, catch_up_policy, assigned_to, next_due |
| `chore_completions` | id, chore_id, completed_by, completed_at, notes |
| `assets` | id, name, category, meter_unit (hours/miles/none), notes |
| `meter_readings` | id, asset_id, reading, recorded_by, recorded_at |
| `maintenance_items` | id, asset_id, name, interval_type (calendar/usage), interval_value, last_done_at/reading, next_due |
| `maintenance_logs` | id, item_id, done_by, done_at, reading, notes, cost |
| `projects` | id, name, description, status, target_date, created_by (manager/admin) |
| `project_tasks` | id, project_id, title, description, assigned_to, due_date, done_at, done_by, sort_order |
| `notes` / `attachments` | id, parent (project/task/asset), author, body / file path |
| `push_subscriptions` | id, user_id, endpoint, keys |
| `notification_prefs` | user_id, channel toggles, digest time/frequency |

## 8. Build Roadmap

- **Phase 0 — Static prototype (current):** a client-side-only app served from **GitHub
  Pages**, persisting to browser **`localStorage`**, for testing the core UX before any
  server work. Covers all three item types, simulated roles (a user switcher), the
  dashboard, and the project step-suggestion flow (with an **offline placeholder**
  generator standing in for the Claude API, which requires the server phase). No real
  auth, email, or push — those arrive with the server. The prototype has since grown well
  past the minimum: send-back/rework (§2.8), inventory (§2.9), per-item time tracking (§2.10),
  multi-step chore checklists (§2.11), printable asset QR codes plus receipts/manuals (§2.12),
  and a 7-day weather forecast, calendar view, and global search (§2.13) — all client-side.
- **Phase 1 — MVP:** auth + roles, chores with recurrence, dashboard, completion logging.
- **Phase 2 — Maintenance:** assets, calendar/usage intervals, meter readings, service
  history.
- **Phase 3 — Projects:** projects (manager-only creation) + task checklists, assignment,
  Claude-powered "Suggest steps".
- **Phase 4 — Notifications:** PWA install, web push, email digests, per-user preferences.
- **Phase 5 — Polish:** photos/attachments, activity log, backups/export, simple reporting
  (costs per asset, chore streaks).

Each phase ships something usable on its own — the app is useful from Phase 1 onward.

## 9. Open Questions (for later, not blockers)

- Photo storage limits and rotation on the home server.
- Should usage-based maintenance also remind people to *enter meter readings* (stale
  readings make "next due" unreliable)?
- Internet exposure for off-property access: VPN/Tailscale vs. port-forwarding — affects
  how push notifications reach phones off the home network.
