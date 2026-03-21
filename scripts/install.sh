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

# ── 4. Build frontend ───────────────────────────────────────────────
echo
echo "▸ Building frontend..."
cd "$REPO_DIR"
npm run build 2>&1 | tail -1
echo "  ✓ Frontend built"

# ── 5. Start server ─────────────────────────────────────────────────
echo
echo "▸ Starting Enso server..."
cd "$REPO_DIR"
npx tsx server/standalone.ts &
SERVER_PID=$!

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
    echo "  ⚠ Server did not respond within 30s. Check the terminal output above."
  fi
done

# ── 6. Display QR code ──────────────────────────────────────────────
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
echo "    - For development: npm run dev (starts Vite on :5173)"
echo "    - For remote access: see SETUP.md (Cloudflare Tunnel)"
echo "    - For Claude Code: npm install -g @anthropic-ai/claude-code"
echo

# Keep server in foreground
wait $SERVER_PID
