# Farm Project Tracker

A mobile-first web app for a small farm team to track recurring **chores**, **maintenance**
coming due on equipment and property, and long-term **projects** — with an at-a-glance
dashboard of what's overdue, due today, and coming up.

**Status:** Phase 0 — a working **static prototype** for testing the UX. It runs entirely in
the browser and stores data in **`localStorage`** (nothing is sent to a server). Real auth,
email/push reminders, and the live Claude API step-generation come with the server phase.

## Try it

**Locally:** open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

**On GitHub Pages:** the whole repo root is the site (no build step). The quickest way to
preview this branch: **Settings → Pages → Deploy from a branch →** pick
`claude/chore-tracking-app-plan-une7hx`, folder **`/ (root)`**. (A GitHub Actions workflow in
`.github/workflows/pages.yml` also publishes automatically once this is merged to the default
branch and Pages source is set to "GitHub Actions".)

## What you can test

- **Today (dashboard)** — Overdue / Due today / Coming up, with a **Mine ↔ Everything** toggle.
- **Chores** — add recurring chores (daily, every-N-days, weekly, monthly, seasonal), assign
  them, mark done, and watch the next occurrence roll forward. "Must catch up" vs. "skips if
  missed" behave differently when overdue.
- **Upkeep** — assets with calendar- or usage-based (meter reading) maintenance, service
  logging, and per-item history.
- **Projects** — create projects (**managers/admins only** — switch users in the top bar to
  see the restriction), a task checklist with progress, and **✨ Suggest steps**, which
  proposes a task breakdown to review and accept. In this prototype the suggestions come from
  an **offline placeholder**; the real Claude API integration arrives with the server phase.
- **Roles** — switch the current user from the top bar to test manager vs. worker permissions.
- **More** — recent activity log and a **Reset demo data** button.

The app is an installable PWA (add to home screen) when served over HTTP/HTTPS.

## Design

See **[PLANNING.md](PLANNING.md)** for the full design: core concepts, roles, screens, tech
stack, data model, and the phased roadmap.

## Structure

```
index.html              app shell
styles.css              mobile-first styling (light/dark)
js/store.js             data model, localStorage persistence, recurrence & due-date logic
js/app.js               views, event handling, forms
manifest.webmanifest    PWA manifest
sw.js                   service worker (offline shell)
```
