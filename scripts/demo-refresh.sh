#!/usr/bin/env bash
# Collects new stories into the demo data folder, then ships the demo to Vercel.
# Ingestion needs this machine (Instagram session, Apple Vision, Ollama), so it runs here, not on Vercel.
set -euo pipefail

cd "$(dirname "$0")/.."

export SLOPSTAGRAM_DATA_DIR=data/demo
LOG_DIR="$SLOPSTAGRAM_DATA_DIR/logs"
LOCK_DIR="$SLOPSTAGRAM_DATA_DIR/.refresh.lock"
SHARP_LINUX_DIR=".vercel/sharp-linux"
FUNCTION_DIR=".vercel/output/functions/__server.func"
# A Vercel function is limited to 250 MB unzipped, and the demo data ships inside it.
MAX_OUTPUT_MB=230

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ABORT: $*"
  exit 1
}

mkdir -p "$LOG_DIR"
mkdir "$LOCK_DIR" 2> /dev/null || fail "another refresh is running ($LOCK_DIR)"
trap 'rmdir "$LOCK_DIR"' EXIT

[ "$(git branch --show-current)" = "demo" ] || fail "the demo is built from the demo branch"
curl -sf http://127.0.0.1:11434/api/tags > /dev/null || fail "Ollama is not running"

log "ingesting into $SLOPSTAGRAM_DATA_DIR"
RUN_LOG="$LOG_DIR/last-ingestion.log"
npm run create:report > "$RUN_LOG" 2>&1 || fail "ingestion failed, see $RUN_LOG"
# A lost Instagram session ends the run without a failing exit code.
if grep -q "tray fetch failed" "$RUN_LOG"; then
  fail "Instagram refused the tray: run SLOPSTAGRAM_DATA_DIR=$SLOPSTAGRAM_DATA_DIR npm run auth"
fi
grep -E "stories=[0-9]+ fetched=[0-9]+ failed=[0-9]+" "$RUN_LOG" | tail -n 1 || true

log "building for Vercel"
rm -rf .vercel/output
NITRO_PRESET=vercel npm run build > "$LOG_DIR/last-build.log" 2>&1 || fail "build failed, see $LOG_DIR/last-build.log"

# A single file without WAL: the function filesystem is read-only.
mkdir -p "$FUNCTION_DIR/data/demo"
sqlite3 "$SLOPSTAGRAM_DATA_DIR/slopstagram.sqlite" ".backup '$FUNCTION_DIR/data/demo/slopstagram.sqlite'"
sqlite3 "$FUNCTION_DIR/data/demo/slopstagram.sqlite" "PRAGMA journal_mode=DELETE;" > /dev/null
rm -f "$FUNCTION_DIR/data/demo/slopstagram.sqlite-shm" "$FUNCTION_DIR/data/demo/slopstagram.sqlite-wal"
cp -R "$SLOPSTAGRAM_DATA_DIR/cache" "$FUNCTION_DIR/data/demo/cache"

# The build traces this machine's sharp binaries, but the function runs on Linux.
if [ ! -d "$SHARP_LINUX_DIR/node_modules/@img/sharp-linux-x64" ]; then
  log "fetching sharp's Linux binaries"
  SHARP_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('node_modules/sharp/package.json', 'utf-8')).version")
  mkdir -p "$SHARP_LINUX_DIR"
  (cd "$SHARP_LINUX_DIR" && npm init -y > /dev/null 2>&1 \
    && npm install --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc "sharp@$SHARP_VERSION" > /dev/null 2>&1)
fi
IMG_DIR="$FUNCTION_DIR/node_modules/@img"
rm -rf "$IMG_DIR/sharp-darwin-arm64" "$IMG_DIR/sharp-libvips-darwin-arm64"
cp -R "$SHARP_LINUX_DIR/node_modules/@img/sharp-linux-x64" "$SHARP_LINUX_DIR/node_modules/@img/sharp-libvips-linux-x64" "$IMG_DIR/"

OUTPUT_MB=$(du -sm .vercel/output | cut -f1)
log "output is ${OUTPUT_MB} MB"
[ "$OUTPUT_MB" -le "$MAX_OUTPUT_MB" ] || fail "output is over ${MAX_OUTPUT_MB} MB: prune the demo data before deploying"

log "deploying to Vercel"
vercel deploy --prebuilt --prod --yes > "$LOG_DIR/last-deploy.log" 2>&1 || fail "deploy failed, see $LOG_DIR/last-deploy.log"

# The password guards every page, so a live deployment answers 401 without it.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' https://slopstagram-demo.vercel.app/report)
[ "$STATUS" = "401" ] || fail "the deployment answered $STATUS instead of 401"
log "done"
