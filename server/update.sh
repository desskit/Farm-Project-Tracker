#!/usr/bin/env bash
# Pulls the latest code and rebuilds/restarts the app container.
# Run directly on the server, or triggered remotely via SSH from a desktop
# shortcut (see DEPLOY-PROXMOX.md).
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root (this script lives in server/)

echo "==> Pulling latest changes..."
git pull

cd server
echo "==> Rebuilding and restarting containers..."
docker compose up -d --build

echo "==> Recent app logs:"
docker compose logs --tail=20 app

echo "==> Done. Health check:"
curl -s http://localhost:3000/api/health || true
echo ""
