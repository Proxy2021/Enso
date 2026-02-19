#!/usr/bin/env bash
# restart.sh — Kill and restart OpenClaw gateway + Enso Vite dev server
set -euo pipefail

ENSO_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"
LABEL="ai.openclaw.gateway"
UID_NUM="$(id -u)"

echo "=== Restarting Enso services ==="

# ── 1. Stop Enso Vite dev server ──
VITE_PIDS=$(pgrep -f "${ENSO_DIR}/node_modules/.bin/vite" 2>/dev/null || true)
if [ -n "$VITE_PIDS" ]; then
  echo "[vite] Stopping (PIDs: $VITE_PIDS)"
  kill $VITE_PIDS 2>/dev/null || true
  sleep 1
else
  echo "[vite] Not running"
fi

# ── 2. Stop OpenClaw gateway ──
echo "[openclaw] Stopping gateway service"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null || true

# Fallback: kill lingering gateway processes if launchctl bootout misses any
GW_PIDS=$(pgrep -f 'openclaw-gateway|openclaw gateway|gateway serve' 2>/dev/null || true)
if [ -n "$GW_PIDS" ]; then
  echo "[openclaw] Killing lingering gateway process(es): $GW_PIDS"
  kill $GW_PIDS 2>/dev/null || true
  sleep 1
  GW_PIDS_FORCE=$(pgrep -f 'openclaw-gateway|openclaw gateway|gateway serve' 2>/dev/null || true)
  if [ -n "$GW_PIDS_FORCE" ]; then
    echo "[openclaw] Force killing remaining process(es): $GW_PIDS_FORCE"
    kill -9 $GW_PIDS_FORCE 2>/dev/null || true
  fi
else
  echo "[openclaw] No lingering gateway process found"
fi
sleep 1

# ── 3. Start OpenClaw gateway ──
echo "[openclaw] Starting gateway"
if [ -f "$PLIST" ]; then
  launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
else
  openclaw gateway install >/dev/null 2>&1 || true
fi
launchctl kickstart -k "gui/$UID_NUM/$LABEL" 2>/dev/null || true

# Wait for gateway + Enso plugin server
echo -n "[openclaw] Waiting for plugin server"
for i in $(seq 1 15); do
  if curl -sf http://localhost:3001/health &>/dev/null; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 1
done
if ! curl -sf http://localhost:3001/health &>/dev/null; then
  echo " TIMEOUT (port 3001 not responding)"
fi

# ── 4. Start Enso Vite dev server ──
echo "[vite] Starting dev server (--host)"
cd "$ENSO_DIR"
nohup npm run dev -- --host > /tmp/enso-vite.log 2>&1 &
VITE_PID=$!

echo -n "[vite] Waiting for dev server"
for i in $(seq 1 10); do
  if curl -sf http://localhost:5173 &>/dev/null; then
    echo " ready (PID: $VITE_PID)"
    break
  fi
  echo -n "."
  sleep 1
done
if ! curl -sf http://localhost:5173 &>/dev/null; then
  echo " TIMEOUT (port 5173 not responding)"
fi

# ── Summary ──
echo ""
echo "=== Services ==="
echo "  Enso UI:  http://localhost:5173"
IP=$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")
echo "  Network:  http://$IP:5173"
echo "  Plugin:   http://localhost:3001/health"
echo "  Vite log: /tmp/enso-vite.log"
echo ""
echo "=== TUI Tips ==="
echo "  Fresh session:"
echo "    openclaw tui --session \"scratch-\$(date +%s)\" --history-limit 0"
echo "  Reuse current session with minimal history:"
echo "    openclaw tui --session main --history-limit 10"