#!/usr/bin/env bash
#
# Unattended update for the Farm Project Tracker.
#
# Pulls the tracked branch, rebuilds, and restarts — but only when something
# actually changed, and only if the new code builds. Run from cron on the
# Docker host (not inside the container).
#
# The ordering matters more than it looks. Nothing touches the running
# container until `docker compose build` has succeeded, so a commit that
# doesn't compile leaves the farm running the last good version rather than
# taking the app down overnight. If the new version starts but fails its
# healthcheck, the script puts the previous commit back by itself.
#
# Install:  see scripts/README-auto-update.md
#
# Exit codes: 0 = up to date or deployed cleanly, 1 = failed (and rolled back
# where it could). Anything non-zero is worth looking at in the log.

set -euo pipefail

# --- settings -------------------------------------------------------------
# Where this script lives -> repo's server/ directory.
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"
LOG_FILE="${DEPLOY_LOG:-$REPO_DIR/auto-update.log}"
LOCK_FILE="${DEPLOY_LOCK:-/tmp/farm-auto-update.lock}"
# How long to wait for the new container to report healthy.
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-120}"
# The branch production follows. CI fast-forwards it only after typecheck,
# lint, tests and a build pass on main, so untested code never lands here.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-deploy}"
# Upper bound on the migration pre-flight.
PREFLIGHT_TIMEOUT="${DEPLOY_PREFLIGHT_TIMEOUT:-600}"
# Where the app keeps backups inside its container (BACKUP_DIR in compose).
CONTAINER_BACKUPS="${DEPLOY_CONTAINER_BACKUPS:-/data/backups}"
CONTAINER_DB="${DEPLOY_CONTAINER_DB:-/data/app.db}"
# Optional: a command run with a message when something goes wrong,
# e.g. DEPLOY_ALERT_CMD='/usr/local/bin/notify.sh'
ALERT_CMD="${DEPLOY_ALERT_CMD:-}"
MAX_LOG_LINES=2000

log() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE"
}

alert() {
  log "ALERT: $*"
  if [ -n "$ALERT_CMD" ]; then
    "$ALERT_CMD" "Farm Tracker auto-update: $*" >>"$LOG_FILE" 2>&1 || \
      log "(alert command failed)"
  fi
}

# Keep the log from growing without bound; it's append-only otherwise.
trim_log() {
  if [ -f "$LOG_FILE" ] && [ "$(wc -l <"$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" >"$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
}

# --- one run at a time ----------------------------------------------------
# A build can outlast the gap to the next scheduled run; overlapping rebuilds
# of the same working tree would corrupt each other.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another run is still going — skipping"
  exit 0
fi

cd "$SERVER_DIR"
touch "$LOG_FILE"

BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "$DEPLOY_BRANCH" ]; then
  alert "checkout is on '$BRANCH', not '$DEPLOY_BRANCH' — production should only follow CI-tested code. One-time fix: git -C $REPO_DIR checkout $DEPLOY_BRANCH"
  exit 1
fi
UPSTREAM="$(git -C "$REPO_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -z "$UPSTREAM" ]; then
  alert "branch '$BRANCH' has no upstream — nothing to pull from"
  exit 1
fi

# --- refuse to clobber local work ----------------------------------------
if ! git -C "$REPO_DIR" diff --quiet || ! git -C "$REPO_DIR" diff --cached --quiet; then
  alert "uncommitted changes in $REPO_DIR — not touching them; deploy skipped"
  exit 1
fi

git -C "$REPO_DIR" fetch --quiet origin "$BRANCH"
LOCAL="$(git -C "$REPO_DIR" rev-parse HEAD)"
REMOTE="$(git -C "$REPO_DIR" rev-parse "$UPSTREAM")"

if [ "$LOCAL" = "$REMOTE" ]; then
  log "up to date ($BRANCH @ ${LOCAL:0:8})"
  trim_log
  exit 0
fi

log "update available on $BRANCH: ${LOCAL:0:8} -> ${REMOTE:0:8}"
git -C "$REPO_DIR" --no-pager log --oneline "$LOCAL..$REMOTE" >>"$LOG_FILE" 2>&1 || true

# --- pull -----------------------------------------------------------------
# --ff-only: if history diverged, stop rather than guess at a merge.
if ! git -C "$REPO_DIR" merge --ff-only "$REMOTE" >>"$LOG_FILE" 2>&1; then
  alert "cannot fast-forward $BRANCH — history diverged; deploy skipped"
  exit 1
fi

# If the new version migrated the database during this deploy, put the
# pre-migration snapshot back. Code rollback alone would leave the old code
# running on a newer database layout. The app writes the marker
# ("<epoch-ms> <file>") just before migrating; only a marker newer than this
# deploy's start counts.
restore_db_if_migrated() {
  local marker ts file
  marker="$(docker compose run --rm --no-deps --entrypoint cat app "$CONTAINER_BACKUPS/pre-migrate-latest.txt" 2>/dev/null | head -n1 || true)"
  ts="${marker%% *}"
  file="${marker#* }"
  case "$ts" in ''|*[!0-9]*) return 0 ;; esac
  if [ "$ts" -lt "$DEPLOY_START_MS" ]; then
    return 0
  fi
  log "the new version migrated the database — restoring snapshot $file"
  docker compose stop app >>"$LOG_FILE" 2>&1 || true
  # Remove the WAL before swapping files: a leftover WAL from the migrated
  # database replayed onto the restored one would corrupt it.
  if docker compose run --rm --no-deps --entrypoint sh app -c \
    "cp '$CONTAINER_BACKUPS/$file' '$CONTAINER_DB.restoring' && rm -f '$CONTAINER_DB-wal' '$CONTAINER_DB-shm' && mv '$CONTAINER_DB.restoring' '$CONTAINER_DB'" \
    >>"$LOG_FILE" 2>&1; then
    log "database restored from $file"
  else
    alert "DATABASE RESTORE FAILED from $file — the app may be on a migrated database with old code. Needs a human."
  fi
}

roll_back() {
  log "rolling back to ${LOCAL:0:8}"
  git -C "$REPO_DIR" reset --hard "$LOCAL" >>"$LOG_FILE" 2>&1 || true
  # Rebuilding the old commit is slower than juggling image tags, but it is
  # the version we know built and ran, so it's the one worth trusting here.
  if ! docker compose build >>"$LOG_FILE" 2>&1; then
    alert "ROLLBACK FAILED — could not rebuild ${LOCAL:0:8}. Needs a human."
    return
  fi
  restore_db_if_migrated
  if docker compose up -d >>"$LOG_FILE" 2>&1; then
    log "rollback complete — running ${LOCAL:0:8} again"
  else
    alert "ROLLBACK FAILED — the app may be down. Needs a human."
  fi
}

# --- build before touching anything that's running ------------------------
log "building…"
if ! docker compose build >>"$LOG_FILE" 2>&1; then
  alert "build failed at ${REMOTE:0:8} — app left running ${LOCAL:0:8}"
  git -C "$REPO_DIR" reset --hard "$LOCAL" >>"$LOG_FILE" 2>&1 || true
  exit 1
fi

# --- rehearse the migrations on a copy of real data ------------------------
# The new image boots in pre-flight mode: it copies the live database, runs
# its pending migrations against the copy, checks it, deletes it and exits.
# Real data is never touched, and the running app keeps serving.
log "pre-flight: testing migrations on a copy of the live database…"
if ! timeout "$PREFLIGHT_TIMEOUT" docker compose run --rm --no-deps -e MIGRATION_PREFLIGHT=1 app >>"$LOG_FILE" 2>&1; then
  alert "pre-flight failed at ${REMOTE:0:8} — its migrations would not apply cleanly to real data (or the app refused to boot); app left running ${LOCAL:0:8}"
  git -C "$REPO_DIR" reset --hard "$LOCAL" >>"$LOG_FILE" 2>&1 || true
  exit 1
fi

DEPLOY_START_MS="$(($(date +%s) * 1000))"
log "starting new version…"
if ! docker compose up -d >>"$LOG_FILE" 2>&1; then
  alert "failed to start ${REMOTE:0:8}"
  roll_back
  exit 1
fi

# --- wait for it to actually come up --------------------------------------
# The image declares a HEALTHCHECK, so Docker is already polling /api/health;
# this just waits on its verdict. Migrations run at boot, so "healthy" also
# means they applied without throwing.
CONTAINER="$(docker compose ps -q app)"
if [ -z "$CONTAINER" ]; then
  alert "app container not found after start"
  roll_back
  exit 1
fi

log "waiting for health (up to ${HEALTH_TIMEOUT}s)…"
elapsed=0
status=""
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo unknown)"
  case "$status" in
    healthy) break ;;
    # An image without a healthcheck can't be judged this way; fall back to
    # "is it still running a few seconds later".
    none)
      sleep 10
      if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" = "true" ]; then
        status="healthy"
      fi
      break
      ;;
    unhealthy) break ;;
  esac
  sleep 5
  elapsed=$((elapsed + 5))
done

if [ "$status" != "healthy" ]; then
  alert "new version is $status after ${elapsed}s — rolling back"
  docker compose logs --tail=50 app >>"$LOG_FILE" 2>&1 || true
  roll_back
  exit 1
fi

log "deployed ${REMOTE:0:8} successfully"
# Old images pile up fast when this runs daily.
docker image prune -f >>"$LOG_FILE" 2>&1 || true
trim_log
exit 0
