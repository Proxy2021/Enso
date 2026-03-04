#!/usr/bin/env bash
# watchdog.sh — Check if Enso services are healthy, restart any that are down
# Intended to run on a 10-minute interval via launchd or cron.
#
# Monitors: Enso plugin (:3001), Vite dev server (:5173)
set -euo pipefail

ENSO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$HOME/.openclaw/watchdog.log"
PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"
LABEL="ai.openclaw.gateway"
UID_NUM="$(id -u)"
MAX_LOG_LINES=500

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

trim_log() {
  if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp"
    mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
}

trim_log

ALL_HEALTHY=true

# ── 1. Check Enso plugin (gateway + plugin) ──
if curl -sf --max-time 10 "http://localhost:3001/health" &>/dev/null; then
  log "[ok] Enso plugin healthy (:3001)"
else
  ALL_HEALTHY=false
  log "[FAIL] Enso plugin not responding — restarting gateway"

  # Kill lingering gateway processes
  GW_PIDS=$(pgrep -f 'openclaw-gateway|openclaw gateway|gateway serve' 2>/dev/null || true)
  if [ -n "$GW_PIDS" ]; then
    log "[restart] Killing gateway processes: $GW_PIDS"
    kill $GW_PIDS 2>/dev/null || true
    sleep 2
    GW_PIDS_FORCE=$(pgrep -f 'openclaw-gateway|openclaw gateway|gateway serve' 2>/dev/null || true)
    if [ -n "$GW_PIDS_FORCE" ]; then
      kill -9 $GW_PIDS_FORCE 2>/dev/null || true
      sleep 1
    fi
  fi

  # Restart via launchd
  if [ -f "$PLIST" ]; then
    launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
    launchctl kickstart -k "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  else
    openclaw gateway start 2>/dev/null || true
  fi

  # Wait for recovery
  RECOVERED=false
  for i in $(seq 1 30); do
    if curl -sf --max-time 5 "http://localhost:3001/health" &>/dev/null; then
      log "[restart] Gateway recovered after ${i}s"
      RECOVERED=true
      break
    fi
    sleep 1
  done
  if [ "$RECOVERED" = false ]; then
    log "[restart] Gateway did NOT recover within 30s"
  fi
fi

# ── 2. Check Vite dev server ──
if curl -sf --max-time 5 "http://localhost:5173" &>/dev/null; then
  log "[ok] Vite dev server healthy (:5173)"
else
  ALL_HEALTHY=false
  log "[FAIL] Vite dev server not responding — restarting"

  # Kill lingering vite processes
  VITE_PIDS=$(pgrep -f "${ENSO_DIR}/node_modules/.bin/vite" 2>/dev/null || true)
  if [ -n "$VITE_PIDS" ]; then
    log "[restart] Killing vite processes: $VITE_PIDS"
    kill $VITE_PIDS 2>/dev/null || true
    sleep 1
  fi

  # Start Vite
  cd "$ENSO_DIR"
  nohup npm run dev -- --host > /tmp/enso-vite.log 2>&1 &

  # Wait for recovery
  VITE_RECOVERED=false
  for i in $(seq 1 15); do
    if curl -sf --max-time 3 "http://localhost:5173" &>/dev/null; then
      log "[restart] Vite recovered after ${i}s"
      VITE_RECOVERED=true
      break
    fi
    sleep 1
  done
  if [ "$VITE_RECOVERED" = false ]; then
    log "[restart] Vite did NOT recover within 15s"
  fi
fi

if [ "$ALL_HEALTHY" = true ]; then
  exit 0
else
  exit 1
fi
