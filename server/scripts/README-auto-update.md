# Automatic daily updates

`auto-update.sh` pulls the tracked branch, rebuilds, and restarts the stack —
but only when something changed, and only if the new code builds. It runs on
the **Docker host**, not inside the container.

## What it does, in order

1. Takes a lock, so a slow build can't overlap the next scheduled run.
2. Refuses to run if the repo has uncommitted changes (your work is never
   clobbered).
3. Fetches. **If nothing changed it stops here** — no rebuild, no restart, no
   downtime on a quiet day.
4. Fast-forwards. If history diverged it stops rather than guessing at a merge.
5. **Builds before touching the running container.** A commit that doesn't
   compile leaves the farm on the last good version.
6. Starts the new version and waits for Docker's healthcheck (which hits
   `/api/health`, so a healthy verdict also means the boot-time migrations
   applied without throwing).
7. If it never goes healthy, **rolls back** to the previous commit and rebuilds.
8. Prunes old images, so daily rebuilds don't fill the disk.

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

The branch it deploys is whatever the repo is checked out on. Confirm with
`git -C ~/Farm-Project-Tracker branch --show-current` — anything pushed there
goes live unattended that night.

Rollback covers a broken build or a container that won't come up. It does
**not** undo a migration that applied successfully but was wrong — migrations
are forward-only. That's what the nightly backup is for, which is why this is
scheduled to run shortly after one.
