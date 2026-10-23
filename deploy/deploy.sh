#!/usr/bin/env bash
# Builds and releases ecom-api on the shared VPS. Run as the deploy user (wisedor).
#   deploy.sh            build origin/main, apply migrations, make it live
#   deploy.sh rollback   switch back one release (code only; migrations stay applied)
set -euo pipefail

ROOT=/srv/ecom
REPO=$ROOT/repo
ENV_FILE=$ROOT/shared/ecom-api.env
RELEASES=$ROOT/releases
CURRENT=$ROOT/current
PROCESS=ecom-api
PORT=4000
KEEP=3

exec 9>"$ROOT/.deploy.lock"
flock -n 9 || { echo "Another ecom-api deploy is running."; exit 1; }

healthy() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health" && return 0
    sleep 1
  done
  return 1
}

# Points `current` at a release and (re)starts PM2 from it.
switch_to() {
  ln -sfn "$1" "$CURRENT.tmp"
  mv -Tf "$CURRENT.tmp" "$CURRENT"
  if pm2 describe "$PROCESS" >/dev/null 2>&1; then
    pm2 reload "$PROCESS" --update-env
  else
    pm2 start "$REPO/deploy/ecosystem.config.cjs"
    pm2 save
  fi
}

# Releases sorted newest first; names are timestamps, so a name sort is a time sort.
releases() {
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort -r
}

rollback() {
  local live target="" found=0
  live=$(readlink -f "$CURRENT")
  while read -r release; do
    if [ "$found" = 1 ]; then target=$release; break; fi
    [ "$release" = "$live" ] && found=1
  done < <(releases)
  [ -n "$target" ] || { echo "No older release to roll back to."; exit 1; }
  switch_to "$target"
  healthy || { echo "Rolled back, but the API is not answering. Check: pm2 logs $PROCESS"; exit 1; }
  echo "Rolled back to $(basename "$target")."
}

deploy() {
  [ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE. Create it first (see docs/DEPLOYMENT.md)."; exit 1; }

  cd "$REPO"
  git fetch --quiet origin main
  git reset --hard --quiet origin/main

  # prisma.config.ts and the app both read .env from their working directory.
  ln -sfn "$ENV_FILE" .env

  npm ci --no-audit --no-fund
  npm run build
  npm run db:deploy

  local release previous
  release=$RELEASES/$(date +%Y%m%d%H%M%S)
  mkdir -p "$release"
  cp -a dist package.json package-lock.json prisma prisma.config.ts "$release/"
  # The Prisma client is already compiled into dist, so install scripts are not needed.
  (cd "$release" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
  ln -sfn "$ENV_FILE" "$release/.env"

  previous=$(readlink -f "$CURRENT" 2>/dev/null || true)
  switch_to "$release"

  if ! healthy; then
    echo "The new release is not answering on port $PORT. Last log lines:"
    pm2 logs "$PROCESS" --lines 40 --nostream || true
    if [ -n "$previous" ] && [ -d "$previous" ]; then
      switch_to "$previous"
      echo "Switched back to $(basename "$previous")."
    fi
    exit 1
  fi

  releases | tail -n +$((KEEP + 1)) | xargs -r rm -rf
  echo "ecom-api is live ($(git rev-parse --short HEAD))."
  pm2 status
}

# The script runs from the checkout that deploy() resets, so exit before bash reads any further.
case "${1:-deploy}" in
  deploy) deploy; exit 0 ;;
  rollback) rollback; exit 0 ;;
  *) echo "Usage: deploy.sh [rollback]"; exit 1 ;;
esac
