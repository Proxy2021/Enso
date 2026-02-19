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

The `geminiApiKey` can also be set via the `GEMINI_API_KEY` environment variable or a `gemini.key` file in the plugin directory. If not set, structured data will render as formatted JSON instead of generated React components.

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
{"status":"ok","channel":"enso","accountId":"default","clients":0}
```

## 5. Connect the React App

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

## Architecture

```
Browser (React App on :5173)
    |  Vite proxy /ws
    v
Enso WS Server (:3001)
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
Three-path action dispatch:
    1. Mechanical (built-in data mutations)
    2. Native tool (prefix + action → direct tool execution via registry)
    3. Agent fallback (re-route through OpenClaw agent)
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
