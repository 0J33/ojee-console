#!/usr/bin/env bash
# Deploy the console to the HP box.
#
# The one thing this script exists for: config/ is NOT synced.
#
# config/console.json in this repo is a SAMPLE — it lists a "demo" and a
# "ghost" module pointing at localhost. The real one on the box lists home,
# router, fleet, remote, agent and loq, and it is not in any repo. An rsync
# that copies config/ replaces the real one with the sample, and every module
# disappears from the console at once. That has happened. Hence the exclude,
# and hence the backup this script refreshes before it syncs anything.
set -euo pipefail

HOST="${CONSOLE_HOST:-ojee@ojee-hp-zorin}"
DEST="${CONSOLE_DEST:-~/stack/console/}"

echo "→ backing up the live config"
ssh "$HOST" 'cp -a ~/stack/console/config/console.json ~/stack/console-config.backup.json' \
  || echo "  (no live config to back up — check this before continuing)"

echo "→ syncing"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'config/' \
  --exclude 'deploy.sh' \
  ./ "$HOST:$DEST"

echo "→ building"
ssh "$HOST" 'cd ~/stack && docker compose build console && docker compose up -d console'

echo "→ modules the console came up with"
ssh "$HOST" 'sleep 3; docker logs --tail 20 ojee-console 2>&1 | grep "^  module" || echo "  NONE — restore ~/stack/console-config.backup.json"'
