#!/usr/bin/env bash
#
# Runs the "Update now" button from the app's admin page.
#
# The app runs inside a container and can't (and shouldn't) run anything on
# this host. All it can do is drop a request file into server/.deploy, which
# is bind-mounted into the container at /deploy. This script, run by cron
# every minute on the host, notices the request and runs auto-update.sh —
# the same CI-gated, pre-flighted, roll-back-on-failure deploy as the nightly
# run. The request file's contents are never read or executed.
#
# It also writes status for the admin page every few minutes: the running
# commit, the newest commit that passed CI, and the end of the update log.
#
# Install (cron, every minute):
#   * * * * * /home/YOU/Farm-Project-Tracker/server/scripts/deploy-watch.sh
# See scripts/README-auto-update.md.

set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"
CONTROL_DIR="${DEPLOY_CONTROL_DIR:-$SERVER_DIR/.deploy}"
LOG_FILE="${DEPLOY_LOG:-$REPO_DIR/auto-update.log}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-deploy}"
# How often to refresh "is there an update?" when nobody pressed the button.
CHECK_EVERY_MIN="${DEPLOY_CHECK_EVERY_MIN:-10}"

# One watcher at a time: a deploy outlasts the minute between cron runs.
exec 8>"${DEPLOY_WATCH_LOCK:-/tmp/farm-deploy-watch.lock}"
flock -n 8 || exit 0

mkdir -p "$CONTROL_DIR"
# The container's user must be able to write the request file whatever its
# uid is on this host.
chmod 0777 "$CONTROL_DIR" 2>/dev/null || true

REQUEST="$CONTROL_DIR/request"
STATUS="$CONTROL_DIR/status.json"
STATUS_TMP="$CONTROL_DIR/.status.json.tmp"

now() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
short() { git -C "$REPO_DIR" rev-parse --short=8 "$1" 2>/dev/null || echo ""; }

# Only fixed, generated values go in the JSON — never free text — so there's
# nothing to escape.
write_status() { # state requestedAt startedAt finishedAt exitCode
  local current available
  current="$(short HEAD)"
  available="$(short "origin/$DEPLOY_BRANCH")"
  printf '{"state":"%s","requestedAt":"%s","startedAt":"%s","finishedAt":"%s","exitCode":%s,"current":"%s","available":"%s","checkedAt":"%s"}\n' \
    "$1" "$2" "$3" "$4" "${5:-null}" "$current" "$available" "$(now)" >"$STATUS_TMP"
  mv "$STATUS_TMP" "$STATUS"
  chmod 0644 "$STATUS"
  if [ -f "$LOG_FILE" ]; then
    tail -n 40 "$LOG_FILE" >"$CONTROL_DIR/.log-tail.tmp" && mv "$CONTROL_DIR/.log-tail.tmp" "$CONTROL_DIR/log-tail.txt"
    chmod 0644 "$CONTROL_DIR/log-tail.txt"
  fi
}

# Last run's result survives in status.json between invocations.
prev() { # field
  [ -f "$STATUS" ] && sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p" "$STATUS" || true
}

if [ -e "$REQUEST" ]; then
  requested="$(date -u -r "$REQUEST" '+%Y-%m-%dT%H:%M:%SZ')"
  rm -f "$REQUEST"
  started="$(now)"
  write_status running "$requested" "$started" "" null
  printf '%s  update requested from the app\n' "$(date '+%Y-%m-%d %H:%M:%S')" >>"$LOG_FILE"
  code=0
  "$SERVER_DIR/scripts/auto-update.sh" || code=$?
  write_status "$([ "$code" = 0 ] && echo ok || echo failed)" "$requested" "$started" "$(now)" "$code"
  exit 0
fi

# No request: refresh the status now and then so the page can say whether an
# update is waiting, without fetching from GitHub every minute.
if [ ! -f "$STATUS" ] || [ -n "$(find "$STATUS" -mmin +"$CHECK_EVERY_MIN" 2>/dev/null)" ]; then
  git -C "$REPO_DIR" fetch --quiet origin "$DEPLOY_BRANCH" 2>/dev/null || true
  state="$(prev state)"
  [ "$state" = running ] && state=failed # a run that never wrote its result was interrupted
  write_status "${state:-idle}" "$(prev requestedAt)" "$(prev startedAt)" "$(prev finishedAt)" "$(prev exitCode | grep -E '^[0-9]+$' || echo null)"
fi
