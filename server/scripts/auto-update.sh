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

roll_back() {
  log "rolling back to ${LOCAL:0:8}"
  git -C "$REPO_DIR" reset --hard "$LOCAL" >>"$LOG_FILE" 2>&1 || true
  # Rebuilding the old commit is slower than juggling image tags, but it is
  # the version we know built and ran, so it's the one worth trusting here.
  if docker compose up -d --build >>"$LOG_FILE" 2>&1; then
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
