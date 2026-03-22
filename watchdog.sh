#!/usr/bin/env bash
# watchdog.sh — Verify Enso guardian + server are running; restart if needed.
# Runs on a 2-minute interval via launchd (macOS) or cron (Linux).
#
# Defense layer 3: catches the case where both guardian and server are dead.
# Under normal operation the guardian (layer 2) handles server restarts, so
# this script only intervenes when the guardian itself is gone.
set -euo pipefail

ENSO_DIR="$(cd "$(dirname "$0")" && pwd)"
ENSO_HOME="$HOME/.enso"
LOG_FILE="$ENSO_HOME/watchdog.log"
GUARDIAN_PID_FILE="$ENSO_HOME/guardian.pid"
MAX_LOG_LINES=500
PORT=3001

mkdir -p "$ENSO_HOME"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

trim_log() {
  if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp"
    mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
}

is_pid_alive() {
  [ -n "$1" ] && kill -0 "$1" 2>/dev/null
}

trim_log

ALL_HEALTHY=true

# ── 1. Check guardian process via PID file ──
GUARDIAN_ALIVE=false
GUARDIAN_PID=""
if [ -f "$GUARDIAN_PID_FILE" ]; then
  GUARDIAN_PID=$(cat "$GUARDIAN_PID_FILE" 2>/dev/null | tr -d '[:space:]')
  if is_pid_alive "$GUARDIAN_PID"; then
    GUARDIAN_ALIVE=true
  fi
fi

# ── 2. Check server health endpoint ──
SERVER_UP=false
if curl -sf --max-time 10 "http://localhost:$PORT/health" &>/dev/null; then
  SERVER_UP=true
fi

# ── 3. Decide what to do ──
if [ "$GUARDIAN_ALIVE" = true ] && [ "$SERVER_UP" = true ]; then
  log "[ok] Guardian (PID $GUARDIAN_PID) + server healthy"

elif [ "$GUARDIAN_ALIVE" = true ] && [ "$SERVER_UP" = false ]; then
  log "[wait] Guardian alive (PID $GUARDIAN_PID) but server not responding — guardian will handle"
  ALL_HEALTHY=false

else
  ALL_HEALTHY=false
  log "[FAIL] Guardian not running — restarting"

  # Kill orphaned Enso processes
  ENSO_PIDS=$(pgrep -f 'standalone\.ts|guardian\.ts' 2>/dev/null || true)
  if [ -n "$ENSO_PIDS" ]; then
    log "[restart] Killing orphaned processes: $ENSO_PIDS"
    kill $ENSO_PIDS 2>/dev/null || true
    sleep 2
    FORCE_PIDS=$(pgrep -f 'standalone\.ts|guardian\.ts' 2>/dev/null || true)
    if [ -n "$FORCE_PIDS" ]; then
      kill -9 $FORCE_PIDS 2>/dev/null || true
      sleep 1
    fi
  fi

  # Start the guardian
  cd "$ENSO_DIR"
  nohup npx tsx server/guardian.ts > /tmp/enso-guardian.log 2>&1 &

  # Wait for server to become healthy
  RECOVERED=false
  for i in $(seq 1 30); do
    if curl -sf --max-time 5 "http://localhost:$PORT/health" &>/dev/null; then
      log "[restart] Server recovered after ${i}s"
      RECOVERED=true
      break
    fi
    sleep 1
  done
  if [ "$RECOVERED" = false ]; then
    log "[restart] Server did NOT recover within 30s"
  fi
fi

# ── 4. Check Vite dev server (optional) ──
if curl -sf --max-time 5 "http://localhost:5173" &>/dev/null; then
  log "[ok] Vite dev server healthy (:5173)"
else
  log "[info] Vite dev server not running (:5173) — normal in production"
fi

if [ "$ALL_HEALTHY" = true ]; then
  exit 0
else
  exit 1
fi
