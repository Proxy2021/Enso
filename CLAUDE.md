# Enso — CLAUDE.md

## Vision

Enso is an OpenClaw channel plugin where **every AI response becomes an interactive React application**. Instead of rendering plain text, Enso dynamically generates custom React components to visually present structured data — dashboards, charts, profiles, task boards — all fully interactive. The guiding principle: **"The component IS the answer."**

## Architecture Overview

Enso has two layers:

1. **React Frontend** — Browser-based chat UI (Vite + React 19 + Tailwind CSS 4 + Zustand)
2. **OpenClaw Plugin** — Channel integration that routes messages through OpenClaw's agent pipeline, runs the Express + WS server, and generates dynamic UI via Gemini

### Data Flow

**Normal chat** (via OpenClaw agent):
```
Browser → WebSocket → OpenClaw Plugin Server → Agent (via OpenClaw gateway) → Response
    ↓
UI Generator (Gemini API) → JSX component code
    ↓
Browser sandbox (Sucrase) → Compiled React component → Rendered in chat
    ↓
User interaction → card.action → Plugin processes action → Updated data + regenerated UI → Card re-renders in-place
```

**Claude Code direct tool** (bypasses OpenClaw agent):
```
Browser → WS → server.ts → spawn("claude.exe" --stream-json) → NDJSON events → WS back
    ↓
Text deltas → streaming terminal card
AskUserQuestion tool_use → clickable question buttons → user selects → resumes session
```

## Project Structure

```
src/                          # React frontend (Vite entry)
├── App.tsx                   # Root layout with connection indicator
├── cards/                    # Card-based UI system
│   ├── types.ts              # Card, CardRendererProps, CardTypeRegistration
│   ├── registry.ts           # Card type registry + resolver
│   ├── DynamicUICard.tsx     # Compiled JSX sandbox renderer + error boundary
│   ├── TerminalCard.tsx      # Claude Code terminal: project picker, streaming output, questions
│   └── ...                   # Other card renderers (chat, user-bubble)
├── components/
│   ├── CardTimeline.tsx      # Card history, auto-scroll, typing indicator
│   ├── CardContainer.tsx     # Card wrapper with collapse/expand + action routing
│   ├── ChatInput.tsx         # Text input + file upload
│   ├── MediaGallery.tsx      # Image/video gallery
│   └── MarkdownText.tsx      # Inline markdown renderer
├── store/chat.ts             # Zustand state (cards, connection, actions)
├── lib/
│   ├── ws-client.ts          # WebSocket client with auto-reconnect
│   └── sandbox.ts            # Sucrase JSX→JS, scope injection, compilation
└── types.ts                  # Frontend types

openclaw-plugin/              # OpenClaw channel plugin (the backend)
├── index.ts                  # Plugin entry, registers channel + after_tool_call hook
├── openclaw.plugin.json      # Plugin metadata
├── SETUP.md                  # Integration guide
└── src/
    ├── channel.ts            # ChannelPlugin implementation + config schema
    ├── runtime.ts            # OpenClaw runtime singleton
    ├── accounts.ts           # Account config resolution
    ├── server.ts             # Express + WS server, handles card.action + claude-code routing
    ├── claude-code.ts        # Claude Code CLI integration (spawn, NDJSON parse, AskUserQuestion)
    ├── inbound.ts            # Browser msg → OpenClaw dispatch
    ├── outbound.ts           # Agent response → UI generation → WS delivery + card action processing
    ├── ui-generator.ts       # Dual-path UI gen (structured + text analysis)
    ├── types.ts              # Plugin type definitions
    └── native-tools/         # Zero-config native tool bridge
        ├── registry.ts       # Tool auto-discovery, prefix detection, action description generation, direct execution
        └── tool-call-store.ts # Time-windowed store linking after_tool_call events to card delivery

shared/                       # Code shared between frontend and plugin
└── types.ts                  # Protocol: ClientMessage, ServerMessage, ToolRouting, ToolQuestion
```

## Key Concepts

### WebSocket Protocol

- **Client → Server**: `ClientMessage` with types `chat.send`, `chat.history`, `ui_action`, `tools.list_projects`, `card.action`
- **Server → Client**: `ServerMessage` with states `delta` (streaming), `final`, `error`
- Messages carry: `text`, `data` (structured), `generatedUI` (JSX code), `mediaUrls`, `targetCardId` (for in-place card updates)
- `chat.send` can include `routing?: ToolRouting` — when `toolId: "claude-code"`, the server bypasses OpenClaw and directly spawns the Claude CLI
- `card.action` messages carry: `cardId`, `cardAction`, `cardPayload` — routed to the card's interaction context for data mutation + UI regeneration
- `questions?: ToolQuestion[]` on deltas — interactive questions from Claude Code's `AskUserQuestion` tool, rendered as clickable buttons

### Dynamic UI Pipeline

1. Agent responds with text (optionally containing JSON blocks)
2. **Structured path**: JSON detected → Gemini generates a React component for that data shape
3. **Text path**: Gemini analyzes response, decides if UI is warranted, extracts data + generates component
4. Component code sent to browser as a string
5. **Sandbox** (src/lib/sandbox.ts): Sucrase transforms JSX → JS, Function constructor compiles in isolated scope
6. Scope provides: React hooks, Recharts, Lucide icons — no network/DOM/global access
7. Error boundary catches failures → falls back to formatted JSON

### Claude Code Integration

Enso embeds Claude Code as a direct tool, bypassing the OpenClaw agent pipeline for coding tasks:

- **Trigger**: User types `/code` to open the project picker, then `/code <prompt>` or uses the in-terminal input to send prompts
- **Backend** (`claude-code.ts`): Spawns `claude.exe` with `--output-format stream-json --dangerously-skip-permissions`, parses NDJSON events line-by-line
- **Session resumption**: `--resume <sessionId>` maintains conversation context across prompts
- **Streaming**: `stream_event` → `content_block_delta` → text deltas sent via WS
- **AskUserQuestion**: When Claude Code uses this tool, the `assistant` message contains a `tool_use` block with `name: "AskUserQuestion"`. The server extracts the questions and sends them as `questions: ToolQuestion[]` on a delta. The frontend renders them as clickable buttons; clicking sends the label back as a new prompt on the same session.
- **Terminal card**: All Claude Code interaction happens in a single persistent `terminal` card — user prompts (`>>> ` prefixed), streaming responses, and question buttons all render in-place
- **Project scanning**: `tools.list_projects` scans common directories for git repos to populate the project picker

### Native Tool Bridge (Zero-Config)

When other OpenClaw plugins (e.g., AlphaRank) register tools via `api.registerTool()`, Enso automatically integrates them — no Enso-side code needed. This enables card actions to call tools directly without an agent round-trip.

**How it works:**

1. **Recording**: The `after_tool_call` hook in `index.ts` fires when the agent calls any registered tool. If the tool exists in the OpenClaw plugin registry, the call is recorded in a time-windowed store (`tool-call-store.ts`, 30s TTL).

2. **Linking**: When `deliverEnsoReply()` generates UI, it first consumes the most recent tool call record. This links the tool call to the card being created.

3. **Tool-aware UI generation**: Before sending data to Gemini, action descriptions are auto-generated from the plugin registry — tool names, descriptions, and parameter schemas are read directly from the registered tool metadata. Gemini then generates buttons with exact action names that map to real tools.

4. **Auto-detection**: The tool's plugin is identified via `getToolPluginId()`, and its common tool-name prefix is computed by `getPluginToolPrefix()` (longest common prefix among all tools from that plugin, ending with `_`).

5. **Three-path action dispatch** when a user clicks a card button:
   - **Path 1 — Mechanical**: Built-in data mutations (task boards, sorting) that don't need a tool call
   - **Path 2 — Native tool**: Action name is interpreted as `prefix + action` → resolved to a registered tool → executed directly via `executeToolDirect()` → result re-rendered with Gemini
   - **Path 3 — Agent fallback**: If neither path matches, the action is sent through the OpenClaw agent pipeline

**Extension point**: For custom action name mappings or parameter enrichment, you can optionally register a `NativeToolActionMap` via `registerActionMap()`. But the default zero-config path handles most cases.

### Caching

- Components cached by data shape + action hints hash (DJB2) — identical structures with the same tool context reuse components
- Text responses cached by text hash
- In-memory only (resets on restart)

### OpenClaw Integration

Enso registers as a **channel plugin** in OpenClaw:
- Implements `ChannelPlugin<ResolvedEnsoAccount>` interface
- Uses OpenClaw's `resolveAgentRoute()` for agent routing
- Uses `dispatchReplyWithBufferedBlockDispatcher()` for streaming
- The `deliver` callback in inbound.ts triggers UI generation before sending to browser
- Supports DM policy config: `open`, `pairing`, `disabled`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 19 |
| State management | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 2.15 |
| Icons | Lucide React |
| JSX compilation | Sucrase |
| Build tool | Vite 6 |
| Plugin server | Express 4 + ws 8 (started by OpenClaw) |
| TypeScript | 5.7, strict mode |
| Module system | ESM (`"type": "module"`) |
| UI generation LLM | Gemini (via API key in .env or gemini.key file) |

## Development

```bash
# Run frontend dev server (Vite :5173)
npm run dev

# Production build
npm run build
```

Enso requires a running OpenClaw gateway with the Enso plugin enabled. The plugin starts its own Express + WS server (default port 3001). Vite dev server proxies `/ws`, `/media`, `/upload` to the plugin's server at localhost:3001.

## OpenClaw Framework Context

Enso is a plugin for [OpenClaw](../OpenClaw), a local-first multi-channel AI gateway. Key OpenClaw concepts relevant to Enso:

- **Channel Plugin**: Enso implements `ChannelPlugin` — the standard interface for messaging surfaces (like Telegram, Discord, WhatsApp). Each channel has adapters for config, security, messaging, setup, etc.
- **Plugin API**: Plugins get an `OpenClawPluginApi` with methods like `registerChannel()`, `registerTool()`, `registerHook()`. Enso uses `registerChannel()`.
- **Plugin SDK**: Stable types and helpers at `openclaw/plugin-sdk` — compile-time only, no runtime deps.
- **Gateway**: Central WebSocket server (port 18789) that coordinates agents, sessions, channels. Enso's server is separate and bridges to the gateway.
- **Sessions**: Per-agent, per-conversation state. Session keys follow `<workspace>:<agent>:<channel>:<account>:<peer>`.
- **Routing**: `resolveAgentRoute()` maps incoming messages to the correct agent based on workspace config.
- **Hooks**: Lifecycle events (`message_received`, `message_sending`, `before_agent_start`, etc.) that plugins can tap into.
- **DM Pairing**: Security model where unknown senders must provide a short code before being allowed. Enso supports this via `dmPolicy` config.

## Conventions

- All source is TypeScript with strict mode
- ESM imports throughout (no CommonJS)
- Path alias: `@shared` → `./shared` (configured in tsconfig)
- Frontend uses functional React components with hooks
- State flows unidirectionally: WebSocket → Zustand store → React components
- Generated components must be self-contained (no imports, all deps injected via scope)
- Dark theme UI (Tailwind classes)
- Plugin and client share types via `shared/types.ts`

## Current Status (Phase 3)

**Implemented**: Card-based chat UI, WebSocket messaging, text streaming (delta/final), dynamic React component generation, Gemini UI generation, component caching, media upload, OpenClaw plugin integration, interactive card actions (onAction → server mutation → UI regeneration → in-place card update), card interaction context with action history, Claude Code CLI integration with direct tool routing, NDJSON streaming from CLI, session resumption, interactive AskUserQuestion with clickable option buttons, project picker with git repo scanning, persistent terminal card with multi-turn conversations, zero-config native tool bridge (auto-discovery from OpenClaw plugin registry, tool-aware UI generation, three-path action dispatch with direct tool execution).

**Not yet implemented**: Persistent chat history, user authentication, multi-user sessions, rate limiting, request logging, tool call activity display (reads/edits/bash visible inline), cost tracking per run, abort button for active Claude Code runs.
