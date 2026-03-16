# Enso — CLAUDE.md

> For detailed app building guides, API references, template rules, and code examples, see [CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md).

## Vision

Enso is an OpenClaw channel plugin that combines conversational AI with **on-demand interactive app experiences**. Agent responses arrive as clean text cards, and users can optionally enhance any card into a fully interactive React application. Guiding principle: **"Any answer can become an app."**

## Architecture Overview

Enso has two layers:

1. **React Frontend** — Browser-based chat UI (Vite + React 19 + Tailwind CSS 4 + Zustand)
2. **OpenClaw Plugin** — Channel integration that routes messages through OpenClaw's agent pipeline, runs the Express + WS server, and provides user-triggered app enhancement via Gemini + deterministic tool templates

### Data Flow

- **Normal chat (Q&A)**: Browser → WS → OpenClaw Plugin → Agent → text response → `deliverEnsoReply` → text card
- **Normal chat (tool use)**: Browser → WS → OpenClaw Plugin → Agent calls registered tool → `after_tool_call` hook captures result → `deliverEnsoReply` → text card + auto-enhance via `consumeRecentToolCall()` → app card rendered alongside text (no LLM call needed)
- **Claude Code**: Browser → WS → `server.ts` → spawn `claude.exe` (NDJSON stream) → streaming terminal card + interactive questions

## Project Structure

```
src/                          # React frontend (Vite entry)
├── App.tsx                   # Root layout
├── cards/                    # Card renderers (DynamicUICard, TerminalCard, ShellCard, etc.)
├── components/               # CardTimeline, CardContainer, ChatInput, MarkdownText, ConnectionPicker
├── store/chat.ts             # Zustand state
├── lib/                      # ws-client, sandbox (Sucrase JSX→JS), enso-ui (17 components), connection manager
└── types.ts

openclaw-plugin/              # OpenClaw channel plugin (the backend)
├── index.ts                  # Plugin entry
├── apps/                     # Shipped apps (checked into git)
│   └── <appId>/              # app.json + template.jsx + executors/*.js
└── src/
    ├── channel.ts            # ChannelPlugin implementation
    ├── server.ts             # Express + WS server
    ├── inbound.ts            # Browser msg → OpenClaw dispatch
    ├── outbound.ts           # Barrel re-export (delivery, enhance, card actions, context)
    ├── outbound/             # Outbound submodules (card-actions, card-context, delivery, helpers)
    ├── ui-generator.ts       # Gemini-based tool selection for enhance
    ├── tool-factory.ts       # Validation, auto-heal, and refine utilities
    ├── task-router.ts        # Smart 3-tier message classifier (simple/one-off/orchestrated)
    ├── orchestrator.ts       # Multi-agent orchestration planner and lifecycle
    ├── orchestrator-engine.ts # DAG execution engine with parallel agents
    ├── build-via-claude.ts   # Build App via Claude Code session
    ├── mission-planner.ts    # Mission analysis + sequential app building
    ├── app-persistence.ts    # Save/load dynamic apps from disk
    ├── claude-code.ts        # Claude Code CLI integration
    ├── shell-pty.ts          # Remote terminal PTY manager (node-pty)
    ├── *-tools.ts            # System app implementations (filesystem, workspace, media, screen, travel, meal)
    ├── app-catalog.ts          # APP_CATALOG definitions (system + app entries)
    └── native-tools/         # App action bridge
        ├── registry.ts       # App tool discovery + template registry
        └── templates/        # Pre-built JSX templates per app

shared/types.ts               # Protocol types shared between frontend and plugin
```

## Key Concepts

### WebSocket Protocol

- **Client → Server** (`ClientMessage`): `chat.send`, `chat.history`, `ui_action`, `card.action`, `card.enhance`, `card.build_app`, `apps.list`, `apps.run`, `app.promote`, `settings.set_mode`, `operation.cancel`, `shell.create`, `shell.input`, `shell.resize`, `shell.destroy`, `mission.start`, `mission.approve`, `orchestration.approve`, `orchestration.pause`, `orchestration.resume`, `orchestration.cancel`, `client.error`
- **Server → Client** (`ServerMessage`): states `delta` (streaming), `final`, `error` — carries `text`, `data`, `generatedUI`, `mediaUrls`, `targetCardId`, `steps`, `settings`, `enhanceResult`, `buildComplete`, `missionPlan`, `missionProgress`, `orchestrationProgress`, `questions`
- `chat.send` with `routing.toolId: "claude-code"` bypasses OpenClaw agent, spawns CLI directly
- `shell.*` messages manage PTY sessions — `toolMeta.toolId === "shell"` routes to ShellCard
- `card.action` carries `cardId`, `cardAction`, `cardPayload` — dispatched via four-path resolution

### Multi-Block Response Handling

1. Stable card ID generated before dispatch — all blocks reference same card
2. Each block's text collected into `AgentStep[]` with sequence numbers
3. Card's `text` set to last block (final answer); earlier blocks in `steps`
4. Frontend shows expandable "N agent steps" toggle when 2+ steps

### App Enhancement (Four Flows)

- **Auto-Enhance**: When the OpenClaw agent calls a registered tool, `deliverEnsoReply()` checks `consumeRecentToolCall()` and automatically renders the app card alongside the text response. No LLM call needed — deterministic based on tool usage. Replaces the old background `selectToolForContent()` LLM call + `enhanceHint` approach.
- **Fast Enhance** (manual fallback): User clicks App button → app selected from dropdown (or auto-detect) → deterministic tool execution → template rendering → app view with Original/App toggle
- **Build App**: User clicks "Build custom app..." → single-line instruction → Claude Code session in terminal card → writes app files → post-build auto-registration → `buildComplete` notification
- **Refine**: User types instruction in app view → single LLM call regenerates template JSX only → in-place update (cheapest iteration path)

### ExecutorContext (`ctx`)

Available methods in executor function bodies: `ctx.callTool(name, params)`, `ctx.listDir(path)`, `ctx.readFile(path)`, `ctx.searchFiles(root, name)`, `ctx.fetch(url, opts?)`, `ctx.search(query, opts?)`, `ctx.ask(prompt, opts?)`, `ctx.store.get/set/delete(key)`. See CLAUDE-REFERENCE.md for full API details.

### EnsoUI Component Library

17 pre-styled components injected into the sandbox: `Tabs`, `DataTable`, `Stat`, `Badge`, `Button`, `UICard`, `Progress`, `Accordion`, `Dialog`, `Select`, `Input`, `Switch`, `Slider`, `Separator`, `EmptyState`, `EnsoUI.Tooltip`, `EnsoUI.VideoPlayer`. 13 accent colors available. See CLAUDE-REFERENCE.md for props and usage.

### Agentic Task Orchestration

- **Task Router** (`task-router.ts`): Auto-classifies user messages into 3 tiers via Gemini Flash:
  - `simple` → normal agent chat (questions, information requests)
  - `one-off` → single Claude Code session (file ops, bug fixes, single app builds)
  - `orchestrated` → multi-agent orchestration (complex goals, sustained projects)
- **Orchestrator** (`orchestrator.ts`): Spawns a Claude Code planning session that decomposes the goal into a task DAG with agent roles. Sends plan to frontend for review/approval.
- **Execution Engine** (`orchestrator-engine.ts`): DAG-based executor with configurable parallelism (default: 2 concurrent agents). Each agent = a Claude Code session with role-specific prompt. Hub-and-spoke communication: completed task results stored in shared context and injected into dependent tasks.
- **5 agent roles**: `researcher` (web research + analysis), `architect` (design + decision), `builder` (Enso app creation via `handleBuildAppViaClaude`), `coder` (code changes), `reviewer` (quality validation)
- **Approval gates**: Tasks with `requiresApproval: true` pause execution for user review
- **Frontend**: `OrchestrationCard.tsx` renders planning → review → executing → complete phases with live task graph, agent status, progress bar
- **Protocol**: `orchestration.approve`, `orchestration.pause`, `orchestration.resume`, `orchestration.cancel` client messages; `orchestrationProgress` server field
- Key files: `task-router.ts`, `orchestrator.ts`, `orchestrator-engine.ts` (backend), `OrchestrationCard.tsx` (frontend), card type `"orchestration"`

### Mission Planner

- Trigger: `/mission` command or "Mission Planner" tile on WelcomeCard
- User describes interests/goals → Claude Code analyzes and proposes 2–5 apps
- Plan written to `openclaw-plugin/.mission-plan.json`, parsed, sent as `missionPlan` to client
- User reviews proposals in MissionCard (approve/skip/edit each app)
- Approved apps built sequentially via `handleBuildAppViaClaude`
- Progress tracked via `missionProgress` messages (analyzing → proposing → building → complete)
- Key files: `mission-planner.ts` (backend), `MissionCard.tsx` (frontend), card type `"mission"`

### Claude Code Integration

- Trigger: `/code` opens project picker, then `/code <prompt>` sends prompts
- Backend spawns `claude.exe --output-format stream-json`, parses NDJSON, streams via WS
- Session resumption via `--resume <sessionId>`, `AskUserQuestion` tool renders as clickable buttons

### Remote Terminal (Shell)

- Trigger: `/shell` or the "Terminal" tile on the WelcomeCard
- Backend spawns a real PTY via `node-pty` (PowerShell on Windows, bash/zsh on macOS)
- Frontend renders with xterm.js (full ANSI color, cursor positioning, alternate screen buffer)
- Character-level I/O: keystrokes forwarded via `shell.input`, output streamed as `ServerMessage` deltas with `toolMeta.toolId === "shell"`
- Performance: PTY output written directly to xterm.js via `shellWriters` map, bypassing React state
- Key files: `shell-pty.ts` (backend), `ShellCard.tsx` (frontend), card type `"shell"`

### App Action Bridge + Dispatch

Four-path dispatch (first match wins):
1. **Refine** — `action === "refine"` → regenerate template only (1 LLM call)
2. **Mechanical** — built-in data mutations (sorting, task boards)
3. **App tool** — resolve `prefix + action` to registered tool → execute directly
4. **Agent fallback** — unmatched actions go through OpenClaw agent pipeline

**Ecosystem Bridge**: `registerAppTool()` in `registry.ts` dual-registers each dynamic app tool with both the internal `generatedToolExecutors` map AND the OpenClaw ecosystem via `api.registerTool()`. The `PluginApi` is stored during plugin init via `setPluginApi()` in `runtime.ts`. This means every user-built app is immediately discoverable by the OpenClaw agent for future requests — closing the loop where apps become reusable ecosystem tools.

## Building Apps

**Dynamic apps** are the primary workflow. They live as portable directories (`app.json` + `template.jsx` + `executors/*.js`) in two locations:

| Location | Path | Purpose |
|----------|------|---------|
| **User apps** | `~/.openclaw/enso-apps/<family>/` | Created by Build App pipeline |
| **Shipped apps** | `openclaw-plugin/apps/<family>/` | Promoted via Apps menu |

Three creation methods: **(1) Build from Enso UI** (recommended), **(2) Via Code button** (Claude Code), **(3) Manual** file creation.

**System apps** (advanced) use a 5-file TypeScript pattern for deeply integrated platform capabilities. See CLAUDE-REFERENCE.md for complete guides on both approaches.

### App Tiers

| Tier | What | Can Delete? | Examples |
|------|------|-------------|---------|
| **System** | Core platform capabilities. Deeply integrated (Node.js APIs, native binaries, SDK sessions). Always available. | No | filesystem, media, screen, browser, claude_code, shell |
| **Apps** | Everything else. Built on top of system capabilities. Can be pre-installed (`shipped`) or user-created. | Yes | researcher, clawhub, alpharank, photo_studio |

### Experience Types

Apps render in two styles:

| Experience | Card Type | Rendering | Apps |
|------------|-----------|-----------|------|
| **card** | `dynamic-ui` | React JSX template in sandbox | filesystem, media, screen, browser, researcher, all user apps |
| **terminal** | `terminal` / `shell` | Streaming text terminal (xterm.js) | claude_code, shell |

### Critical Rules (Quick Reference)

- Every tool's result data MUST include `"tool": "enso_<family>_<suffix>"` field
- All parameter schemas MUST have `additionalProperties: false`
- Exactly one tool per family must have `isPrimary: true`
- Executors are function bodies (no imports/exports), use `var` not `const`/`let`
- Templates are JSX strings (no imports), all hooks at top level (never in conditionals)
- Template sandbox has: React hooks, Recharts, Lucide icons, EnsoUI — no DOM/fetch/globals
- Use `EnsoUI.Tooltip` (not `Tooltip` which is Recharts)

## Tech Stack

Frontend: React 19 + Zustand 5 + Tailwind CSS 4 + Recharts + Lucide + Sucrase + xterm.js + Vite 6. Backend: Express 4 + ws 8 + node-pty (started by OpenClaw). Language: TypeScript 5.7 strict, ESM. LLM: Gemini (via API key).

## Development

**All development on main branch directly** — no worktrees or feature branches.

```bash
npm run dev          # Frontend dev server (Vite :5173)
npm run build        # Production build
```

Requires a running OpenClaw gateway with Enso plugin enabled. Plugin starts Express + WS on port 3001. Vite proxies `/ws`, `/media`, `/upload` to localhost:3001.

Dev commands: `/delete-apps` — clear all dynamically created apps.

## Remote Access & Multi-Machine

Enso supports connecting to remote backends over the internet. The frontend includes a **Connection Picker** for managing multiple servers.

### Key Components

- **`src/lib/connection.ts`** — Backend config CRUD (localStorage), URL resolution with token auth, deep-link support
- **`src/components/ConnectionPicker.tsx`** — Modal UI for adding/testing/switching backends
- **Server auth** (`server.ts`) — CORS middleware, token auth (Bearer header or `?token=` query param), WS token validation

### Configuration

| Config Key     | Env Var                | Purpose                                     |
|----------------|------------------------|---------------------------------------------|
| `accessToken`  | `ENSO_ACCESS_TOKEN`    | Shared secret for auth (auto-generated if unset) |
| `machineName`  | `ENSO_MACHINE_NAME`    | Friendly name shown in Connection Picker    |

### Connection Modes

- **Same-origin** (default): No active backend config → relative URLs via Vite proxy
- **Remote**: Active backend set → absolute URLs with token auth appended
- **Deep-link**: `?backend=https://...&token=xxx` in URL auto-creates + connects

### Media URL Resolution

Backend returns relative `/media/...` URLs. `DynamicUICard` recursively resolves these to absolute URLs with tokens for remote backends via `resolveMediaUrlsInData()`.

### Exposing to Internet

Recommended: **Cloudflare Tunnel** — each machine gets a fixed subdomain (e.g., `app.yourdomain.com`). See `openclaw-plugin/SETUP.md` for full setup instructions.

### PWA

Enso is installable as a Progressive Web App — `public/manifest.json`, `public/sw.js` (app shell caching), and PWA meta tags in `index.html`.

## OpenClaw Integration

- Enso implements `ChannelPlugin<ResolvedEnsoAccount>` and registers via `api.registerChannel()`
- Uses `resolveAgentRoute()` for agent routing, `dispatchReplyWithBufferedBlockDispatcher()` for streaming
- Built-in tools registered via `api.registerTool()` during plugin init, hooks via `api.registerHook()`
- Dynamic app tools also registered via `api.registerTool()` at runtime (ecosystem bridge in `registerAppTool()`)
- `runtime.ts` stores both `PluginRuntime` (via `setEnsoRuntime`) and `OpenClawPluginApi` (via `setPluginApi`) for runtime access
- Session keys: `<workspace>:<agent>:<channel>:<account>:<peer>`
- Supports DM policy config: `open`, `pairing`, `disabled`

## Conventions

- All source is TypeScript with strict mode, ESM imports throughout
- Path alias: `@shared` → `./shared`
- Frontend uses functional React components with hooks
- State flows: WebSocket → Zustand store → React components
- Generated components are self-contained (no imports, deps injected via scope)
- Dark theme UI (Tailwind classes)
- Plugin and client share types via `shared/types.ts`
- Server logs use `[enso:inbound/outbound/enhance/action/build]` prefixes

## Logging & Error Tracking

### Centralized Action Log

Enso uses a centralized NDJSON log for all significant operations, errors, and fixes.

**Files:**
- `~/.openclaw/enso-action.log` — NDJSON, rotates at 1000 lines (keeps 800)
- `~/.openclaw/enso-fixes.json` — JSON array of bug fix records with acknowledgement tracking

**Implementation:** `openclaw-plugin/src/action-log.ts`

### Log Entry Types

| Type | Usage |
|------|-------|
| `action` | Normal operations: chat messages, enhance, card actions, uploads, shell sessions |
| `error` | Failures in any backend or client-reported error path |
| `fix` | Auto-heal successes and Claude Code fix resolutions |
| `build` | Build App via Claude Code lifecycle events |
| `system` | Server start, client connect/disconnect |
| `claude-code` | Claude Code session lifecycle (init, tools, rate limits, completion) |

### Usage

```typescript
import { logAction, logError, logFix } from "./action-log.js";

// Log an operation
logAction({ ts: Date.now(), type: "action", category: "enhance", message: "Enhance start", cardId });

// Log an error (category, message, error, extra fields)
logError("ui-gen", "Generation failed", err, { cardId, toolFamily: "filesystem" });

// Log a fix
logFix({ description: "Fixed broken executor", error: "TypeError", resolution: "Auto-healed", category: "app" });
```

### Reading Logs

**HTTP API:** `GET /api/action-log?count=100&type=error`

| Param | Description |
|-------|-------------|
| `count` | Number of recent entries (default 100, max 500) |
| `type` | Filter: `action`, `error`, `fix`, `build`, `system`, `claude-code` |

**Programmatic:** `getRecentLog(count, typeFilter)` returns `LogEntry[]` (most recent first).

### Client Error Reporting

Frontend errors are reported to the backend via WebSocket (`client.error` message type) and logged as `type: "error"`, `category: "client"`.

| Source | Trigger |
|--------|---------|
| `unhandled` | `window.onerror` global handler |
| `unhandled_rejection` | `window.onunhandledrejection` |
| `react_boundary` | Root-level `AppErrorBoundary` in App.tsx |
| `ws` | WebSocket message parse failures |
| `sandbox` | JSX component compilation errors |
| `card_render` | Component runtime render errors (`UIErrorBoundary`) |

**Frontend utility:** `src/lib/error-reporter.ts` — `reportError(message, source, extra?)`. Deduplicates identical messages within 5 seconds. Initialized via `initErrorReporter(sendFn)` when WS connects.

### Category Convention

Use `module:subpath` format: `inbound`, `enhance`, `action:refine`, `action:native`, `action:fix_with_code`, `build-via-claude`, `ui-gen`, `shell`, `tool-factory`, `persistence`, `upload`, `apps`, `sessions`, `system`, `client`.
