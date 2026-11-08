# Automatic daily updates

`auto-update.sh` pulls the `deploy` branch, rebuilds, and restarts the stack —
but only when something changed, and only if the new code passes every check
below. It runs on the **Docker host**, not inside the container.

## How code reaches production

1. Code is pushed to `main`.
2. GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, tests and
   a production build.
3. **Only if all pass**, CI fast-forwards the `deploy` branch to that commit.
4. That night, this script deploys `deploy`.

A commit that fails CI never reaches the farm. The script refuses to run on
any branch other than `deploy` (override with `DEPLOY_BRANCH`).

### One-time switch

The server's checkout must follow `deploy`. After CI has passed on `main` at
least once (so the branch exists):

```bash
cd ~/Farm-Project-Tracker
git fetch origin
git checkout deploy
```

## What it does, in order

1. Takes a lock, so a slow build can't overlap the next scheduled run.
2. Refuses to run if the repo has uncommitted changes (your work is never
   clobbered), or if the checkout isn't on `deploy`.
3. Fetches. **If nothing changed it stops here** — no rebuild, no restart, no
   downtime on a quiet day.
4. Fast-forwards. If history diverged it stops rather than guessing at a merge.
5. **Builds before touching the running container.** A commit that doesn't
   compile leaves the farm on the last good version.
6. **Pre-flight on real data.** Boots the new image in a throwaway container
   that copies the live database, applies the new migrations *to the copy*,
   checks it, deletes it and exits. If that fails — or the new version refuses
   to boot, e.g. because `TZ` isn't set — production is left alone.
7. Starts the new version. On boot it snapshots the database before applying
   any migrations, then waits for Docker's healthcheck.
8. If it never goes healthy, **rolls back**: rebuilds the previous commit and,
   if the new version had already migrated the database, restores that
   snapshot too — so old code never ends up on a newer database layout.
9. Prunes old images, so daily rebuilds don't fill the disk.

Everything lands in `auto-update.log` next to the repo.

## Install

Pick a time that sits **after** the app's nightly backup (02:40) so a recent
snapshot exists before any migration runs, and clear of the other jobs
(00:15 reconcile, 03:20 auth cleanup, 07:00 rent reminders). 03:00 fits.

```bash
crontab -e
```

Add:

```cron
0 3 * * * /home/YOUR_USER/Farm-Project-Tracker/server/scripts/auto-update.sh
```

Cron runs with a minimal PATH. If `docker` isn't found, give it one:

```cron
PATH=/usr/local/bin:/usr/bin:/bin
0 3 * * * /home/YOUR_USER/Farm-Project-Tracker/server/scripts/auto-update.sh
```

The user running it must be able to use Docker without a password prompt
(i.e. be in the `docker` group).

## Update button (optional)

Admins get an **Update now** button under More → Data. It runs this same
script on demand, with the same CI gate, pre-flight and rollback. The app
can't touch the server itself: it only drops a request file into
`server/.deploy` (shared with the container), and a helper on the host,
`deploy-watch.sh`, notices it within a minute and runs the update. The
helper also reports which version is running and whether a newer tested one
is waiting.

To turn it on, add a second cron line next to the nightly one:

```cron
PATH=/usr/local/bin:/usr/bin:/bin
0 3 * * * /home/YOUR_USER/Farm-Project-Tracker/server/scripts/auto-update.sh
* * * * * /home/YOUR_USER/Farm-Project-Tracker/server/scripts/deploy-watch.sh
```

Until the helper has run once, the panel says it isn't set up yet.

## Checking on it

```bash
tail -20 ~/Farm-Project-Tracker/auto-update.log
```

A quiet night looks like:

```
2026-09-01 03:00:01  up to date (main @ b74fcd88)
```

## Getting told when it fails

Set `DEPLOY_ALERT_CMD` to any command taking one message argument:

```cron
DEPLOY_ALERT_CMD=/home/YOUR_USER/notify.sh
0 3 * * * /home/YOUR_USER/Farm-Project-Tracker/server/scripts/auto-update.sh
```

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `DEPLOY_LOG` | `<repo>/auto-update.log` | Where the log goes |
| `DEPLOY_LOCK` | `/tmp/farm-auto-update.lock` | Lock file |
| `DEPLOY_HEALTH_TIMEOUT` | `120` | Seconds to wait for healthy before rolling back |
| `DEPLOY_ALERT_CMD` | *(unset)* | Run with a message on failure |

## Worth knowing

Rollback covers a broken build, a migration that fails on real data (caught
by the pre-flight), and a version that won't come up healthy (database and
code both restored). It does **not** catch a migration that applies cleanly
but does the wrong thing to the data. The pre-migration snapshots
(`/data/backups/pre-migrate-*.db`, the last 5 kept) and the nightly backups
are the way back from that.
