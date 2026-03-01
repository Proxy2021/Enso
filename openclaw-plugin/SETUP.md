# Enso Plugin — Setup Guide

This guide walks through adding the Enso plugin to a fresh OpenClaw installation. Enso provides a WebSocket-based channel that connects the Enso React app to OpenClaw's agent pipeline.

## Prerequisites

- OpenClaw installed and running (`openclaw gateway start`)
- Node.js 22+
- The Enso repository cloned (contains both the React app and the plugin)

## 1. Register the Plugin Path

Edit your OpenClaw config file at `~/.openclaw/openclaw.json`. Add the plugin path to `plugins.load.paths` and enable it in `plugins.entries`:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "D:\\Github\\Enso\\openclaw-plugin"
      ]
    },
    "entries": {
      "enso": {
        "enabled": true
      }
    }
  }
}
```

Adjust the path to wherever you cloned the Enso repository.

## 2. Add the Channel Configuration

In the same `openclaw.json`, add an `enso` section under `channels`:

```json
{
  "channels": {
    "enso": {
      "port": 3001,
      "dmPolicy": "open"
    }
  }
}
```

### Configuration Options

| Field          | Type    | Default     | Description                                              |
|----------------|---------|-------------|----------------------------------------------------------|
| `port`         | number  | `3001`      | Port the WebSocket server listens on                     |
| `host`         | string  | `0.0.0.0`   | Bind address                                             |
| `enabled`      | boolean | `true`      | Enable/disable the channel                               |
| `dmPolicy`     | string  | `open`      | DM access policy: `"open"`, `"pairing"`, or `"disabled"` |
| `geminiApiKey` | string  | env var     | API key for Gemini UI generation (optional)              |
| `accessToken`  | string  | auto-gen    | Shared secret for remote access authentication           |
| `machineName`  | string  | OS hostname | Friendly name shown in the Connection Picker             |

The `geminiApiKey` can also be set via the `GEMINI_API_KEY` environment variable or a `gemini.key` file in the plugin directory. If not set, structured data will render as formatted JSON instead of generated React components.

The `accessToken` can also be set via `ENSO_ACCESS_TOKEN` env var. If omitted, a random UUID is auto-generated on startup and printed to the console. The `machineName` can also be set via `ENSO_MACHINE_NAME` env var.

## 3. Restart the Gateway

The gateway must be fully restarted to load a new plugin. A config-only reload is not sufficient.

```bash
openclaw gateway stop
openclaw gateway start
```

If `gateway stop` does not fully terminate the process (common on Windows with scheduled tasks), find and kill the process manually:

```bash
# Find the gateway process
netstat -ano | grep ":18789"   # note the PID

# Force kill
taskkill /PID <pid> /F         # Windows
kill <pid>                     # Linux/macOS

# Then start fresh
openclaw gateway start
```

Make sure port 3001 (or your configured port) is not already in use by another process before starting.

## 4. Verify

Check that the plugin loaded:

```bash
openclaw plugins list
```

You should see `Enso` with status `loaded`.

Check that the channel is running:

```bash
openclaw channels status
```

Expected output:

```
- Enso default: enabled, configured, running
```

Test the health endpoint:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "channel": "enso",
  "authRequired": true,
  "version": 1,
  "clients": 0,
  "machine": {
    "name": "DESKTOP-ABC123",
    "hostname": "DESKTOP-ABC123",
    "platform": "win32",
    "arch": "x64",
    "memoryGB": 32
  }
}
```

## 5. Connect the React App

### Local Development

The Enso React app connects to the WebSocket server via Vite's dev proxy. The default `vite.config.ts` already proxies `/ws` to `localhost:3001`:

```typescript
server: {
  proxy: {
    "/ws": {
      target: "http://localhost:3001",
      ws: true,
    },
  },
},
```

Start the React dev server:

```bash
npm run dev:client
```

Open the app in a browser and send a message. It will route through OpenClaw's agent pipeline and return a response.

### Remote Access

Enso supports connecting to backends over the internet. The frontend includes a **Connection Picker** (click the connection dot in the header) that lets you add, test, and switch between multiple remote servers.

#### Authentication

All remote connections are protected by a shared access token:

- **HTTP requests**: `Authorization: Bearer <token>` header
- **WebSocket**: `?token=<token>` query parameter
- **Media URLs**: `?token=<token>` appended automatically by the frontend

The `/health` endpoint is unauthenticated so the Connection Picker's **Test** button works before you enter a token.

#### Exposing via Cloudflare Tunnel (Recommended)

Each machine gets a fixed subdomain. Example setup for `app.enso.net`:

```bash
# 1. Install cloudflared
winget install cloudflare.cloudflared

# 2. Login (opens browser — select your domain)
cloudflared tunnel login

# 3. Create a named tunnel
cloudflared tunnel create enso

# 4. Route a subdomain to the tunnel
cloudflared tunnel route dns enso app.yourdomain.com

# 5. Write config (~/.cloudflared/config.yml)
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <tunnel-id>
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: app.yourdomain.com
    service: http://localhost:3001
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF

# 6. Test it
cloudflared tunnel run enso

# 7. Install as a system service (auto-start on boot)
cloudflared service install
```

HTTPS is automatic via Cloudflare. No port forwarding or firewall rules needed.

### Multi-Machine Setup

When you have multiple OpenClaw machines, each one gets its own subdomain and identity:

| Machine        | Subdomain              | Config                           |
|----------------|------------------------|----------------------------------|
| Home Desktop   | `app.yourdomain.com`   | `machineName: "Home Desktop"`    |
| Office Server  | `office.yourdomain.com`| `machineName: "Office Server"`   |
| Media PC       | `media.yourdomain.com` | `machineName: "Media PC"`        |

On each additional machine, run:

```bash
cloudflared tunnel create <name>
cloudflared tunnel route dns <name> <subdomain>.yourdomain.com
```

Then update `~/.cloudflared/config.yml` with the new tunnel ID and hostname, and install the service.

#### Machine Identity

Each machine reports its identity via the `/health` endpoint:

```json
{
  "status": "ok",
  "machine": {
    "name": "Home Desktop",
    "hostname": "DESKTOP-ABC123",
    "platform": "win32",
    "arch": "x64",
    "memoryGB": 32
  }
}
```

Set a friendly name in `openclaw.json`:

```json
{
  "channels": {
    "enso": {
      "machineName": "Home Desktop",
      "accessToken": "your-secret-token"
    }
  }
}
```

Or via environment variable: `ENSO_MACHINE_NAME="Home Desktop"`

The Connection Picker's **Test** button displays this info and auto-fills the server name field.

#### Deep Links

Share a one-click connection link:

```
https://your-enso-frontend/?backend=https://app.yourdomain.com&token=your-token
```

The frontend auto-creates the backend entry and connects immediately.

### PWA (Mobile)

Enso is a Progressive Web App. On your phone:

1. Open the Enso frontend URL in Chrome
2. Tap the three-dot menu → **Add to Home Screen**
3. It installs as a standalone app (no browser chrome)
4. Use the Connection Picker to add your remote server(s)

## Architecture

```
Browser (React App)
    |  Local: Vite proxy /ws → localhost:3001
    |  Remote: wss://app.yourdomain.com/ws?token=xxx
    v
Cloudflare Tunnel (remote only)
    |  HTTPS termination, fixed subdomain
    v
Enso WS Server (:3001)
    |  CORS + token auth middleware
    |  Started by gateway.startAccount()
    v
OpenClaw Gateway (:18789)
    |  resolveAgentRoute -> dispatchReply
    v
Agent Runtime (Gemini / configured LLM)
    |  Response text + tool calls
    v
Enso deliver callback
    |  after_tool_call hook → tool-call-store (time-windowed)
    |  consumeRecentToolCall() → auto-generated action descriptions
    |  UIGenerator (Gemini Flash) with tool-aware action hints
    v
Browser via WebSocket
    |  User clicks card button
    v
Four-path action dispatch:
    1. Refine (regenerate template only — 1 LLM call)
    2. Mechanical (built-in data mutations)
    3. Native tool (prefix + action → direct tool execution via registry)
    4. Agent fallback (re-route through OpenClaw agent)
```

### Native Tool Bridge

Enso automatically integrates with any co-loaded OpenClaw plugin's tools — zero configuration required. When the agent calls a tool from another plugin (e.g., AlphaRank), Enso:

1. Records the tool call via the `after_tool_call` hook
2. Auto-detects the tool's plugin and computes its name prefix (e.g., `alpharank_`)
3. Auto-generates action descriptions from the plugin registry (tool names, descriptions, parameter schemas)
4. Injects action hints into the Gemini UI generation prompt so buttons map to real tools
5. Attaches a `nativeToolHint` to the card context for direct tool invocation on interactions

When a user clicks a button on a tool-produced card, the action name is resolved as `prefix + action` and executed directly against the plugin registry — no LLM round-trip needed. If the tool name doesn't match, it falls back to the agent.

This bridge requires no tool-specific code in Enso. Any OpenClaw plugin that registers tools with `api.registerTool()` is automatically available.

### Built-In Tool Families

Enso currently includes first-party tool families with deterministic app-mode templates:

- Filesystem: `enso_fs_*`
- Workspace: `enso_ws_*`
- Media: `enso_media_*`
- Travel planner: `enso_travel_*`
- Meal planner: `enso_meal_*`
- Tool console: `/tool enso` (template + tool-family browser + add-tool request flow)

### `/tool enso` Console

From the Enso UI input, run:

```text
/tool enso
```

This opens a tool-console card that lets you:

1. List all currently supported tool families
2. Drill into a family to inspect registered templates
3. Go back to the family list
4. Submit a new tool description via "Add Tool"
   - if a similar family already exists, it reports the match
   - otherwise, it queues a domain-evolution generation job

### Domain Evolution Jobs

Domain evolution queue endpoints:

- `GET /domain-evolution/jobs`
- `GET /domain-evolution/jobs/:id`

Optional webhook for stronger external coding-LLM orchestration:

- `ENSO_DOMAIN_EVOLUTION_WEBHOOK_URL`

If unset, Enso uses local fallback blueprint synthesis and registers partial signatures automatically.

## Troubleshooting

**Plugin shows as `loaded` but channel not in `channels status`**

The gateway process needs a full restart. Kill the process and start again (see Step 3).

**`EADDRINUSE: address already in use :::3001`**

Another process is using port 3001. Find and kill it, or change the port in `channels.enso.port`.

**Channel shows `running` but no response to messages**

Check the gateway logs for errors:

```bash
openclaw logs
```

Look for lines containing `enso`. Common issues:
- Agent model not configured or API key missing
- The `deliver` callback encountered an error

**Plugin not appearing in `plugins list`**

Verify the path in `plugins.load.paths` points to the directory containing `openclaw.plugin.json` and `package.json`. The path must be absolute.
