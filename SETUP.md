# Enso Setup Guide

Get Enso running in minutes. No external dependencies beyond Node.js.

## Prerequisites

- **Node.js 22+** — [nodejs.org](https://nodejs.org/) or `nvm install 22`
- **Git** — to clone the repository
- **Gemini API key** — for AI chat and UI generation ([aistudio.google.com](https://aistudio.google.com/apikey))
- **Claude Code** (optional) — for `/code`, Build App, orchestration, and evolution features

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/nicobailon/Enso.git
cd Enso
npm install
```

### 2. Configure environment

Create `server/.env`:

```env
GEMINI_API_KEY=your-gemini-api-key-here

# Optional — auto-generated if omitted
# ENSO_ACCESS_TOKEN=your-secret-token
# ENSO_MACHINE_NAME=My Desktop
```

### 3. Start Enso

Open two terminals:

```bash
# Terminal 1 — Backend
npm run dev:server

# Terminal 2 — Frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. That's it.

### Production deployment (recommended)

Use the guardian process supervisor for automatic crash recovery:

```bash
npm run build
npx tsx server/guardian.ts
# Guardian spawns + monitors the server, restarts on crash
# Frontend served at http://localhost:3001
```

The guardian provides three layers of fault tolerance:

- **Layer 1 -- In-process**: event loop monitoring, memory pressure detection, error budget tracking
- **Layer 2 -- Guardian**: forks the server, restarts on crash with exponential backoff, IPC heartbeat monitoring
- **Layer 3 -- Watchdog**: OS-level scheduled task (every 2 min) restarts the guardian if it dies

Install the watchdog for maximum resilience:

```bash
# Windows
powershell -ExecutionPolicy Bypass -File install-watchdog.ps1

# macOS
./install-watchdog.sh
```

Restart all services cleanly:

```bash
# Windows
powershell -ExecutionPolicy Bypass -File restart.ps1

# macOS / Linux
./restart.sh
```

### Development mode

```bash
npm run dev:server    # Backend only (no guardian, direct mode)
npm run dev           # Frontend with hot reload
```

## CLI

After running the setup script, the `enso` command is available globally:

```bash
enso status                              # server health check
enso chat "What is quantum computing?"   # ask anything
enso research "AI trends in 2026"        # deep research
enso apps list                           # list installed apps
enso apps run photobook browse           # run an app tool
enso --json chat "Hello"                 # NDJSON output for scripting
```

The CLI reads `~/.enso/cli.json` for the server URL and access token (created automatically by the setup script). You can also use flags (`--server`, `--token`) or environment variables (`ENSO_SERVER`, `ENSO_TOKEN`).

## Claude Code Setup (Optional)

Claude Code powers `/code` sessions, Build App, orchestration, and evolution sprints. Without it, Enso still works for chat, research, and all built-in apps.

### Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Verify:

```bash
claude --version
```

### Authenticate

Claude Code uses your Anthropic API key or OAuth:

```bash
# Option A: API key
export ANTHROPIC_API_KEY=your-key

# Option B: OAuth (opens browser)
claude auth login
```

### Verify

In Enso, type `/code hello` — you should see a terminal card with Claude's response.

## Remote Access (Cloudflare Tunnel)

Expose Enso to the internet with a fixed HTTPS subdomain. No port forwarding or firewall rules needed.

### 1. Install cloudflared

```bash
# Windows
winget install cloudflare.cloudflared

# macOS
brew install cloudflared

# Linux (Debian/Ubuntu)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

### 2. Login and create tunnel

```bash
cloudflared tunnel login          # Opens browser — select your domain
cloudflared tunnel create enso    # Creates a named tunnel
```

### 3. Route a subdomain

```bash
cloudflared tunnel route dns enso app.yourdomain.com
```

### 4. Write config

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-id-from-step-2>
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: app.yourdomain.com
    service: http://localhost:3001
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

### 5. Run the tunnel

```bash
cloudflared tunnel run enso
```

Test it: open `https://app.yourdomain.com/health` in your browser.

### 6. Install as system service (auto-start on boot)

```bash
cloudflared service install
```

On Windows, this creates a Windows Service. On Linux/macOS, a systemd/launchd service.

## Connecting Remotely

### Connection Picker

Click the connection indicator in the Enso header to open the Connection Picker:

1. Tap **Add Server**
2. Enter `https://app.yourdomain.com` as the URL
3. Enter your access token (printed to console on server start, or set via `ENSO_ACCESS_TOKEN`)
4. Tap **Test** to verify connectivity
5. Tap **Connect**

### Deep Links

Share a one-click connection URL:

```
https://your-frontend-url/?backend=https://app.yourdomain.com&token=your-token
```

The frontend auto-creates the backend entry and connects immediately.

### Authentication

All remote connections are protected by the access token:

- **HTTP**: `Authorization: Bearer <token>` header
- **WebSocket**: `?token=<token>` query parameter
- **Media URLs**: Token appended automatically by the frontend

The `/health` endpoint is unauthenticated so the Test button works before entering a token.

## Multi-Machine Setup

Each machine gets its own tunnel and subdomain:

| Machine | Subdomain | ENSO_MACHINE_NAME |
|---------|-----------|-------------------|
| Home Desktop | `app.yourdomain.com` | `Home Desktop` |
| Office Server | `office.yourdomain.com` | `Office Server` |
| Media PC | `media.yourdomain.com` | `Media PC` |

On each additional machine:

```bash
cloudflared tunnel create <name>
cloudflared tunnel route dns <name> <subdomain>.yourdomain.com
```

Update `~/.cloudflared/config.yml` with the new tunnel ID and hostname, then install the service.

The Connection Picker shows each machine's name (set via `ENSO_MACHINE_NAME` in `.env`).

## PWA (Mobile)

Enso is installable as a Progressive Web App:

1. Open the Enso URL in Chrome on your phone
2. Tap the menu -> **Add to Home Screen** (or **Install App**)
3. It installs as a standalone app with no browser chrome
4. Use the Connection Picker to add your remote server

## OpenClaw Integration (Optional)

If you also run OpenClaw, Enso can integrate as a channel plugin for access to OpenClaw's agent pipeline and cross-plugin tool ecosystem.

### Register the plugin

In `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["D:\\Github\\Enso\\server"]
    },
    "entries": {
      "enso": { "enabled": true }
    }
  },
  "channels": {
    "enso": {
      "port": 3001,
      "dmPolicy": "open"
    }
  }
}
```

### Restart the gateway

```bash
# Windows: kill all node processes first
taskkill /F /IM node.exe
rm -rf "$LOCALAPPDATA/Temp/tsx-$USER"
openclaw gateway start

# macOS/Linux
openclaw gateway stop && openclaw gateway start
```

When loaded as an OpenClaw plugin, Enso automatically:
- Routes chat through OpenClaw's agent pipeline instead of Gemini
- Registers all Enso tools in the OpenClaw ecosystem
- Makes cross-plugin tools available (e.g., AlphaRank tools work in Enso)

## Configuration Reference

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| Gemini API key | `GEMINI_API_KEY` | — | Required for chat and UI generation |
| Access token | `ENSO_ACCESS_TOKEN` | auto-generated | Shared secret for remote auth |
| Machine name | `ENSO_MACHINE_NAME` | OS hostname | Friendly name in Connection Picker |
| Port | — | `3001` | Backend server port |
| Host | — | `0.0.0.0` | Bind address |

## Troubleshooting

**Server won't start?**
Check if port 3001 is in use: `netstat -ano | grep 3001` (or `findstr` on Windows). Kill the existing process or set a different port.

**No AI responses?**
Verify your `GEMINI_API_KEY` is set correctly in `server/.env`. Test it: `curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"`.

**Claude Code not working?**
Run `claude --version` to verify installation. Run `claude auth status` to check authentication. Ensure `claude.exe` (Windows) or `claude` (macOS/Linux) is on your PATH.

**Stale code after editing server files?**
If running via OpenClaw, clear the tsx cache before restarting:
```bash
# Windows
rm -rf "$LOCALAPPDATA/Temp/tsx-$USER"
# macOS/Linux
rm -rf /tmp/tsx-*
```

**Need logs?**
Access the action log API: `GET http://localhost:3001/api/action-log?count=50`
Filter by type: `?type=error`, `?type=action`, `?type=build`
