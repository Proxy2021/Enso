#!/usr/bin/env bash
# watchdog.sh — Check if Enso services are healthy, restart gateway if not
# Intended to run on a 10-minute interval via launchd or cron.
set -euo pipefail

HEALTH_URL="http://localhost:3001/health"
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

# Health check
if curl -sf --max-time 10 "$HEALTH_URL" &>/dev/null; then
  log "[ok] Enso plugin healthy"
  exit 0
fi

log "[FAIL] Enso plugin not responding at $HEALTH_URL — restarting gateway"

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
for i in $(seq 1 30); do
  if curl -sf --max-time 5 "$HEALTH_URL" &>/dev/null; then
    log "[restart] Gateway recovered after ${i}s"
    exit 0
  fi
  sleep 1
done

log "[restart] Gateway did NOT recover within 30s"
exit 1
