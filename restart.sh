#!/usr/bin/env bash
# restart.sh — Kill and restart Enso server + Vite dev server + Cloudflare Tunnel
set -euo pipefail

ENSO_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHDOG_LABEL="ai.enso.watchdog"
UID_NUM="$(id -u)"

echo "=== Restarting Enso services ==="

# ── 0. Stop watchdog (prevent interference during restart) ──
echo "[watchdog] Stopping watchdog"
launchctl bootout "gui/$UID_NUM/$WATCHDOG_LABEL" 2>/dev/null || true

# ── 0b. Stop Cloudflare Tunnel ──
CF_PIDS=$(pgrep -f 'cloudflared tunnel' 2>/dev/null || true)
if [ -n "$CF_PIDS" ]; then
  echo "[tunnel] Stopping (PIDs: $CF_PIDS)"
  kill $CF_PIDS 2>/dev/null || true
  sleep 1
else
  echo "[tunnel] Not running"
fi

# ── 1. Stop Enso Vite dev server ──
VITE_PIDS=$(pgrep -f "${ENSO_DIR}/node_modules/.bin/vite" 2>/dev/null || true)
if [ -n "$VITE_PIDS" ]; then
  echo "[vite] Stopping (PIDs: $VITE_PIDS)"
  kill $VITE_PIDS 2>/dev/null || true
  sleep 1
else
  echo "[vite] Not running"
fi

# ── 2. Stop Enso server ──
echo "[enso] Stopping server"
ENSO_PIDS=$(pgrep -f 'server/standalone\.ts|enso.*server' 2>/dev/null || true)
if [ -n "$ENSO_PIDS" ]; then
  echo "[enso] Killing server process(es): $ENSO_PIDS"
  kill $ENSO_PIDS 2>/dev/null || true
  sleep 1
  ENSO_PIDS_FORCE=$(pgrep -f 'server/standalone\.ts|enso.*server' 2>/dev/null || true)
  if [ -n "$ENSO_PIDS_FORCE" ]; then
    echo "[enso] Force killing remaining process(es): $ENSO_PIDS_FORCE"
    kill -9 $ENSO_PIDS_FORCE 2>/dev/null || true
  fi
else
  echo "[enso] No server process found"
fi
sleep 1

# ── 3. Start Enso server ──
echo "[enso] Starting server"
cd "$ENSO_DIR"
nohup npx tsx server/standalone.ts > /tmp/enso-server.log 2>&1 &
SERVER_PID=$!

echo -n "[enso] Waiting for server"
for i in $(seq 1 15); do
  if curl -sf http://localhost:3001/health &>/dev/null; then
    echo " ready (PID: $SERVER_PID)"
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

# ── 5. Start Cloudflare Tunnel ──
if [ -f "$HOME/.cloudflared/config.yml" ]; then
  echo "[tunnel] Starting cloudflared"
  nohup cloudflared tunnel run > /tmp/cloudflared.log 2>&1 &
  CF_PID=$!
  sleep 2
  if kill -0 $CF_PID 2>/dev/null; then
    echo "[tunnel] Running (PID: $CF_PID)"
  else
    echo "[tunnel] Failed to start (check /tmp/cloudflared.log)"
  fi
else
  echo "[tunnel] No config found (~/.cloudflared/config.yml)"
fi

# ── 6. Restart watchdog ──
WATCHDOG_PLIST="$HOME/Library/LaunchAgents/${WATCHDOG_LABEL}.plist"
if [ -f "$WATCHDOG_PLIST" ]; then
  echo "[watchdog] Restarting watchdog"
  launchctl bootstrap "gui/$UID_NUM" "$WATCHDOG_PLIST" 2>/dev/null || true
  launchctl kickstart "gui/$UID_NUM/$WATCHDOG_LABEL" 2>/dev/null || true
else
  echo "[watchdog] Not installed"
fi

# ── Summary ──
echo ""
echo "=== Services ==="
echo "  Enso UI:  http://localhost:5173"
IP=$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")
echo "  Network:  http://$IP:5173"
echo "  Server:   http://localhost:3001/health"
# Show tunnel URL if config exists
if [ -f "$HOME/.cloudflared/config.yml" ]; then
  TUNNEL_HOST=$(grep 'hostname:' "$HOME/.cloudflared/config.yml" | head -1 | awk '{print $3}')
  [ -n "$TUNNEL_HOST" ] && echo "  Tunnel:   https://$TUNNEL_HOST"
fi
echo "  Logs:"
echo "    Server: /tmp/enso-server.log"
echo "    Vite:   /tmp/enso-vite.log"
echo ""
