#!/usr/bin/env bash
# restart.sh — Kill and restart all Enso services (guardian + server + Vite + tunnel)
set -euo pipefail

ENSO_DIR="$(cd "$(dirname "$0")" && pwd)"
ENSO_HOME="$HOME/.enso"
GUARDIAN_PID_FILE="$ENSO_HOME/guardian.pid"
SERVER_PID_FILE="$ENSO_HOME/server.pid"
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

# ── 1. Stop Vite dev server ──
VITE_PIDS=$(pgrep -f "${ENSO_DIR}/node_modules/.bin/vite" 2>/dev/null || true)
if [ -n "$VITE_PIDS" ]; then
  echo "[vite] Stopping (PIDs: $VITE_PIDS)"
  kill $VITE_PIDS 2>/dev/null || true
  sleep 1
else
  echo "[vite] Not running"
fi

# ── 2. Stop guardian + server ──
echo "[enso] Stopping guardian + server"

# Kill by PID files first (most reliable)
for PIDFILE in "$GUARDIAN_PID_FILE" "$SERVER_PID_FILE"; do
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      echo "[enso] Killing PID $PID ($(basename "$PIDFILE"))"
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
  fi
done

# Also sweep for orphaned processes
sleep 1
ENSO_PIDS=$(pgrep -f 'standalone\.ts|guardian\.ts|enso.*server' 2>/dev/null || true)
if [ -n "$ENSO_PIDS" ]; then
  echo "[enso] Killing orphaned processes: $ENSO_PIDS"
  kill $ENSO_PIDS 2>/dev/null || true
  sleep 1
  FORCE_PIDS=$(pgrep -f 'standalone\.ts|guardian\.ts|enso.*server' 2>/dev/null || true)
  if [ -n "$FORCE_PIDS" ]; then
    echo "[enso] Force killing: $FORCE_PIDS"
    kill -9 $FORCE_PIDS 2>/dev/null || true
  fi
else
  echo "[enso] No orphaned processes"
fi
sleep 1

# ── 3. Pull latest code ──
echo "[git] Pulling latest code"
cd "$ENSO_DIR"
git pull --ff-only 2>&1 | tail -1 || echo "[git] Pull failed or nothing to pull"

# ── 4. Start guardian (supervises the server) ──
echo "[enso] Starting guardian"
cd "$ENSO_DIR"
nohup npx tsx server/guardian.ts > /tmp/enso-guardian.log 2>&1 &
GUARDIAN_PID=$!

echo -n "[enso] Waiting for server"
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health &>/dev/null; then
    echo " ready (guardian PID: $GUARDIAN_PID)"
    break
  fi
  echo -n "."
  sleep 1
done
if ! curl -sf http://localhost:3001/health &>/dev/null; then
  echo " TIMEOUT (port 3001 not responding)"
fi

# ── 5. Start Vite dev server ──
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

# ── 6. Start Cloudflare Tunnel ──
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

# ── 7. Restart watchdog ──
WATCHDOG_PLIST="$HOME/Library/LaunchAgents/${WATCHDOG_LABEL}.plist"
if [ -f "$WATCHDOG_PLIST" ]; then
  echo "[watchdog] Restarting watchdog"
  launchctl bootstrap "gui/$UID_NUM" "$WATCHDOG_PLIST" 2>/dev/null || true
  launchctl kickstart "gui/$UID_NUM/$WATCHDOG_LABEL" 2>/dev/null || true
else
  echo "[watchdog] Not installed — run install-watchdog.sh to install"
fi

# ── Summary ──
echo ""
echo "=== Services ==="
echo "  Guardian: supervised, auto-restart on crash"
echo "  Server:   http://localhost:3001/health"
echo "  Vite UI:  http://localhost:5173"
IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")
echo "  Network:  http://$IP:5173"
if [ -f "$HOME/.cloudflared/config.yml" ]; then
  TUNNEL_HOST=$(grep 'hostname:' "$HOME/.cloudflared/config.yml" | head -1 | awk '{print $3}')
  [ -n "$TUNNEL_HOST" ] && echo "  Tunnel:   https://$TUNNEL_HOST"
fi
echo "  Logs:"
echo "    Guardian: /tmp/enso-guardian.log + ~/.enso/guardian.log"
echo "    Vite:     /tmp/enso-vite.log"
echo "  Crashes:    ~/.enso/crashes/"
echo ""
