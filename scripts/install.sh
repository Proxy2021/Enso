#!/usr/bin/env bash
set -euo pipefail

# ─── Enso Server Installer (macOS / Linux) ───────────────────────────
# Run from the Enso repo root:  ./scripts/install.sh
# ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENSO_DIR="$HOME/.enso"
SETUP_JSON="$ENSO_DIR/enso-setup.json"
SERVER_DIR="$REPO_DIR/server"
ENV_FILE="$SERVER_DIR/.env"
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

# ── 2. npm install ───────────────────────────────────────────────────
echo "▸ Installing dependencies..."
cd "$REPO_DIR"
npm install --no-audit --no-fund 2>&1 | tail -1
echo "  ✓ Dependencies installed"

# ── 3. Configure .env ────────────────────────────────────────────────
echo
echo "▸ Configuring server..."
mkdir -p "$ENSO_DIR"

# Generate access token
ACCESS_TOKEN=$(node -e "console.log(require('crypto').randomUUID())")
MACHINE_NAME=$(hostname)

if [ -f "$ENV_FILE" ]; then
  echo "  ✓ server/.env already exists — preserving"
  # Read existing token if available
  EXISTING_TOKEN=$(grep -oP '(?<=^ENSO_ACCESS_TOKEN=).*' "$ENV_FILE" 2>/dev/null || echo "")
  if [ -n "$EXISTING_TOKEN" ]; then
    ACCESS_TOKEN="$EXISTING_TOKEN"
  fi
  # Read existing Gemini key
  HAS_GEMINI=$(grep -c '^GEMINI_API_KEY=' "$ENV_FILE" 2>/dev/null || echo "0")
else
  HAS_GEMINI="0"
  # Prompt for Gemini API key
  echo
  echo "  Enso uses the Gemini API for chat and UI generation."
  echo "  Get a free API key at: https://aistudio.google.com/apikey"
  echo
  read -rp "  Enter your Gemini API key (or press Enter to skip): " GEMINI_KEY
  echo

  cat > "$ENV_FILE" <<EOF
GEMINI_API_KEY=${GEMINI_KEY}
ENSO_ACCESS_TOKEN=${ACCESS_TOKEN}
ENSO_MACHINE_NAME=${MACHINE_NAME}
EOF
  echo "  ✓ Config written to server/.env"

  if [ -z "$GEMINI_KEY" ]; then
    echo "  ⚠ No Gemini API key set. Chat will not work until you add it to server/.env"
  fi
fi

# Read back the actual token from .env
ACCESS_TOKEN=$(node -e "
const fs = require('fs');
try {
  const env = fs.readFileSync('$ENV_FILE', 'utf-8');
  const m = env.match(/^ENSO_ACCESS_TOKEN=(.+)$/m);
  console.log(m ? m[1].trim() : '');
} catch { console.log(''); }
")

if [ -z "$ACCESS_TOKEN" ]; then
  ACCESS_TOKEN=$(node -e "console.log(require('crypto').randomUUID())")
  echo "ENSO_ACCESS_TOKEN=${ACCESS_TOKEN}" >> "$ENV_FILE"
fi

# ── 4. Install CLI ──────────────────────────────────────────────────
echo
echo "▸ Installing CLI..."

CLI_JSON="$ENSO_DIR/cli.json"
BIN_SCRIPT="$REPO_DIR/bin/enso"

# Write cli.json so the CLI knows where the server is and the token
node -e "
const fs = require('fs');
const dir = '$ENSO_DIR';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync('$CLI_JSON', JSON.stringify({
  server: 'http://localhost:$PORT',
  token: '$ACCESS_TOKEN'
}, null, 2));
"
echo "  ✓ CLI config written to ~/.enso/cli.json"

# Make the wrapper executable
chmod +x "$BIN_SCRIPT"

# Symlink into /usr/local/bin (or ~/bin if no sudo)
if [ -w /usr/local/bin ]; then
  ln -sf "$BIN_SCRIPT" /usr/local/bin/enso
  echo "  ✓ Linked 'enso' into /usr/local/bin"
elif command -v sudo &>/dev/null; then
  sudo ln -sf "$BIN_SCRIPT" /usr/local/bin/enso
  echo "  ✓ Linked 'enso' into /usr/local/bin (via sudo)"
else
  # Fallback: symlink into ~/bin
  mkdir -p "$HOME/bin"
  ln -sf "$BIN_SCRIPT" "$HOME/bin/enso"
  if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
    echo "  ⚠ Added symlink to ~/bin — add it to your PATH:"
    echo "    export PATH=\"\$HOME/bin:\$PATH\""
  else
    echo "  ✓ Linked 'enso' into ~/bin"
  fi
fi

# ── 5. Build frontend ───────────────────────────────────────────────
echo
echo "▸ Building frontend..."
cd "$REPO_DIR"
npm run build 2>&1 | tail -1
echo "  ✓ Frontend built"

# ── 6. Start server via guardian ─────────────────────────────────────
echo
echo "▸ Starting Enso guardian (production supervisor)..."
cd "$REPO_DIR"
npx tsx server/guardian.ts &
GUARDIAN_PID=$!

echo -n "  Waiting for server"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo
    echo "  ✓ Server is running on port $PORT (guardian-supervised)"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo
    echo "  ⚠ Server did not respond within 30s. Check /tmp/enso-guardian.log"
  fi
done

# ── 6b. Install watchdog ──────────────────────────────────────────────
echo
echo "▸ Installing watchdog (2-minute health checks)..."
WATCHDOG_INSTALLER="$REPO_DIR/install-watchdog.sh"
if [ -f "$WATCHDOG_INSTALLER" ]; then
  chmod +x "$WATCHDOG_INSTALLER"
  bash "$WATCHDOG_INSTALLER" 2>/dev/null && echo "  ✓ Watchdog installed" || echo "  ⚠ Watchdog install failed (non-critical)"
else
  echo "  ⚠ install-watchdog.sh not found"
fi

# ── 7. Display QR code ──────────────────────────────────────────────
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
const dir = '$ENSO_DIR';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
echo "  Next steps:"
echo "    - Try the CLI: enso chat \"Hello, world!\""
echo "    - For development: npm run dev (starts Vite on :5173)"
echo "    - For remote access: see SETUP.md (Cloudflare Tunnel)"
echo "    - For Claude Code: npm install -g @anthropic-ai/claude-code"
echo

# Keep guardian in foreground
wait $GUARDIAN_PID
