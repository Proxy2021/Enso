# Enso Setup Guide

Get Enso running in three commands. The install script handles everything else.

## Prerequisites

- **Node.js 22+** &mdash; [nodejs.org](https://nodejs.org/) or `nvm install 22`
- **Git** &mdash; to clone the repository

## Quick Start

### Windows (PowerShell)

```powershell
git clone https://github.com/Proxy2021/Enso.git
cd Enso
.\scripts\install.ps1
```

### macOS / Linux (Terminal)

```bash
git clone https://github.com/Proxy2021/Enso.git
cd Enso
./scripts/install.sh
```

That's it. The script will:

1. Install OpenClaw (if needed)
2. Install dependencies
3. Walk you through **OpenClaw onboarding** &mdash; pick your AI model (Gemini, OpenAI, Anthropic, etc.) and enter your API key
4. Configure the Enso plugin
5. Build the frontend
6. Start the server
7. Display a **QR code** for connecting your phone

## Connect Your Phone

**Scan the QR code** shown at the end of setup with your phone's camera. The Enso app connects automatically.

If you can't scan:

1. Open the Enso app on your phone
2. Tap **"I already have a server"**
3. Tap **"Add Remote Server"**
4. Enter the **URL** and **Token** printed below the QR code

To show the QR code again later:

```bash
node scripts/show-qr.js
```

## Open in Browser

For local development, start the Vite dev server:

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser. The dev server proxies to the backend on port 3001 automatically.

For the production build (already built by the install script), the frontend is served directly at [http://localhost:3001](http://localhost:3001).

## Remote Access (Optional)

To access Enso from outside your local network, expose port 3001 via a **Cloudflare Tunnel**:

```bash
# Install cloudflared
# macOS: brew install cloudflared
# Windows: winget install cloudflare.cloudflared
# Linux: see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Login and create a tunnel
cloudflared tunnel login
cloudflared tunnel create enso
cloudflared tunnel route dns enso app.yourdomain.com

# Run the tunnel
cloudflared tunnel run enso
```

HTTPS is automatic. See [openclaw-plugin/SETUP.md](openclaw-plugin/SETUP.md) for detailed tunnel configuration and multi-machine setups.

## Re-running Setup

Running the install script again is safe &mdash; it detects that OpenClaw is already configured and skips onboarding. It will rebuild the frontend and restart the gateway.

## Troubleshooting

**Server won't start?**
Check if port 3001 is already in use. Kill the existing process or change the port in `~/.openclaw/openclaw.json` under `channels.enso.port`.

**AI features not working?**
Enso reads your API key from OpenClaw's configuration. If you skipped onboarding or need to change your key, run:
```bash
openclaw configure --section model
```

**Gateway not responding?**
```bash
openclaw gateway stop
openclaw gateway start
```

If stop doesn't work, kill the process manually and start again.

**Need full logs?**
```bash
openclaw logs
```

Look for lines containing `enso` for plugin-specific issues.
