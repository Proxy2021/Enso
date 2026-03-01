#!/usr/bin/env bash
set -euo pipefail

# ─── Enso Server Installer (macOS / Linux) ───────────────────────────
# Run from the Enso repo root:  ./scripts/install.sh
# ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_JSON="$OPENCLAW_DIR/openclaw.json"
SETUP_JSON="$OPENCLAW_DIR/enso-setup.json"
PLUGIN_DIR="$REPO_DIR/openclaw-plugin"
PORT=3001

echo
echo "  ╔═══════════════════════════════════════╗"
echo "  ║        Enso Server Setup              ║"
echo "  ║   Every answer is an app.             ║"
echo "  ╚═══════════════════════════════════════╝"
echo

# ── 1. Check Node.js ─────────────────────────────────────────────────
echo "▸ Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js not found."
  echo "  Install Node.js 22+ from https://nodejs.org/ or via nvm:"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "    nvm install 22"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.version.split('.')[0].slice(1))")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "  ✗ Node.js $NODE_MAJOR found, but 22+ is required."
  echo "  Upgrade: nvm install 22 && nvm use 22"
  exit 1
fi
echo "  ✓ Node.js $(node --version)"

# ── 2. Check OpenClaw ────────────────────────────────────────────────
echo "▸ Checking OpenClaw..."
if ! command -v openclaw &>/dev/null; then
  echo "  Installing OpenClaw..."
  npm install -g openclaw
fi

if command -v openclaw &>/dev/null; then
  echo "  ✓ OpenClaw installed"
else
  echo "  ✗ Failed to install OpenClaw. Install manually: npm install -g openclaw"
  exit 1
fi

# ── 3. npm install ───────────────────────────────────────────────────
echo "▸ Installing dependencies..."
cd "$REPO_DIR"
npm install --no-audit --no-fund 2>&1 | tail -1
echo "  ✓ Dependencies installed"

# ── 4. Gemini API key (optional) ─────────────────────────────────────
GEMINI_KEY=""
echo
echo "▸ Gemini API key (optional)"
echo "  This enables AI-generated interactive apps. You can add it later."
read -rp "  Enter Gemini API key (or press Enter to skip): " GEMINI_KEY
if [ -n "$GEMINI_KEY" ]; then
  # Write to .env (create or update)
  if grep -q "^GEMINI_API_KEY=" "$REPO_DIR/.env" 2>/dev/null; then
    sed -i.bak "s/^GEMINI_API_KEY=.*/GEMINI_API_KEY=$GEMINI_KEY/" "$REPO_DIR/.env"
    rm -f "$REPO_DIR/.env.bak"
  else
    echo "GEMINI_API_KEY=$GEMINI_KEY" >> "$REPO_DIR/.env"
  fi
  echo "  ✓ API key saved to .env"
else
  echo "  ○ Skipped"
fi

# ── 5. Generate openclaw.json ────────────────────────────────────────
echo
echo "▸ Configuring OpenClaw..."
mkdir -p "$OPENCLAW_DIR"

# Generate a UUID-like token
ACCESS_TOKEN=$(node -e "console.log(require('crypto').randomUUID())")
MACHINE_NAME=$(hostname)

# Use Node to safely deep-merge JSON config
node -e "
const fs = require('fs');
const path = '$OPENCLAW_JSON';
const pluginDir = '$PLUGIN_DIR';
const token = '$ACCESS_TOKEN';

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path, 'utf-8')); } catch {}

// Plugins
if (!cfg.plugins) cfg.plugins = {};
if (!cfg.plugins.load) cfg.plugins.load = {};
if (!Array.isArray(cfg.plugins.load.paths)) cfg.plugins.load.paths = [];
if (!cfg.plugins.load.paths.includes(pluginDir)) cfg.plugins.load.paths.push(pluginDir);
if (!cfg.plugins.entries) cfg.plugins.entries = {};
cfg.plugins.entries.enso = { enabled: true };

// Channel
if (!cfg.channels) cfg.channels = {};
if (!cfg.channels.enso) cfg.channels.enso = {};
cfg.channels.enso.port = cfg.channels.enso.port || $PORT;
cfg.channels.enso.dmPolicy = cfg.channels.enso.dmPolicy || 'open';
if (!cfg.channels.enso.accessToken) cfg.channels.enso.accessToken = token;

fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log('  ✓ Config written to ' + path);
"

# Read back the actual token (may have been preserved from existing config)
ACCESS_TOKEN=$(node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$OPENCLAW_JSON', 'utf-8'));
console.log(cfg.channels.enso.accessToken);
")

# ── 6. Build frontend ───────────────────────────────────────────────
echo
echo "▸ Building frontend..."
cd "$REPO_DIR"
npm run build 2>&1 | tail -1
echo "  ✓ Frontend built"

# ── 7. Start gateway ────────────────────────────────────────────────
echo
echo "▸ Starting OpenClaw gateway..."
openclaw gateway start 2>/dev/null || true

# Wait for health
echo -n "  Waiting for server"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo
    echo "  ✓ Server is running on port $PORT"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo
    echo "  ⚠ Server did not respond within 30s. Check: openclaw logs"
  fi
done

# ── 8. Display QR code ──────────────────────────────────────────────
echo
echo "════════════════════════════════════════════"
echo "  Setup complete!"
echo "════════════════════════════════════════════"

# Detect LAN IPs
LAN_IPS=$(node -e "
const os = require('os');
const ips = [];
for (const ifaces of Object.values(os.networkInterfaces())) {
  for (const i of ifaces || []) {
    if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  }
}
console.log(ips.join(','));
")

PRIMARY_IP=$(echo "$LAN_IPS" | cut -d',' -f1)
if [ -z "$PRIMARY_IP" ]; then
  PRIMARY_IP="localhost"
fi

DEEP_LINK="enso://connect?backend=http://${PRIMARY_IP}:${PORT}&token=$(node -e "console.log(encodeURIComponent('$ACCESS_TOKEN'))")&name=$(node -e "console.log(encodeURIComponent('$MACHINE_NAME'))")"

# Save setup info
node -e "
const fs = require('fs');
fs.writeFileSync('$SETUP_JSON', JSON.stringify({
  installPath: '$REPO_DIR',
  accessToken: '$ACCESS_TOKEN',
  machineName: '$MACHINE_NAME',
  port: $PORT,
  lanAddresses: '$LAN_IPS'.split(',').filter(Boolean),
  installedAt: new Date().toISOString()
}, null, 2));
"

echo
echo "  Scan this QR code with your phone camera"
echo "  to connect the Enso app:"
echo
node "$SCRIPT_DIR/qr-terminal.js" "$DEEP_LINK" 2>/dev/null || echo "  Deep link: $DEEP_LINK"

echo
echo "  Or enter manually in the app:"
echo "    URL:   http://${PRIMARY_IP}:${PORT}"
echo "    Token: ${ACCESS_TOKEN}"
echo
echo "  To show this QR code again later:"
echo "    node $REPO_DIR/scripts/show-qr.js"
echo
