#!/usr/bin/env bash
# restart.sh — Kill and restart OpenClaw gateway + Enso Vite dev server
set -euo pipefail

ENSO_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"
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
if launchctl print "gui/$UID_NUM/ai.openclaw.gateway" &>/dev/null; then
  echo "[openclaw] Stopping gateway service"
  launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
  sleep 2
else
  # Fallback: kill by process name
  GW_PIDS=$(pgrep -f 'openclaw-gateway' 2>/dev/null || true)
  if [ -n "$GW_PIDS" ]; then
    echo "[openclaw] Stopping gateway (PIDs: $GW_PIDS)"
    kill $GW_PIDS 2>/dev/null || true
    sleep 2
  else
    echo "[openclaw] Gateway not running"
  fi
fi

# ── 3. Start OpenClaw gateway ──
echo "[openclaw] Starting gateway"
launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || openclaw gateway install 2>/dev/null || true

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
