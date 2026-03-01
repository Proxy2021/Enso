# Enso — CLAUDE.md

> For detailed app building guides, API references, template rules, and code examples, see [CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md).

## Vision

Enso is an OpenClaw channel plugin that combines conversational AI with **on-demand interactive app experiences**. Agent responses arrive as clean text cards, and users can optionally enhance any card into a fully interactive React application. Guiding principle: **"Any answer can become an app."**

## Architecture Overview

Enso has two layers:

1. **React Frontend** — Browser-based chat UI (Vite + React 19 + Tailwind CSS 4 + Zustand)
2. **OpenClaw Plugin** — Channel integration that routes messages through OpenClaw's agent pipeline, runs the Express + WS server, and provides user-triggered app enhancement via Gemini + deterministic tool templates

### Data Flow

- **Normal chat**: Browser → WS → OpenClaw Plugin → Agent → multi-block accumulation → `deliverEnsoReply` → text card → optional enhance → app view → card actions (four-path dispatch)
- **Claude Code**: Browser → WS → `server.ts` → spawn `claude.exe` (NDJSON stream) → streaming terminal card + interactive questions

## Project Structure

```
src/                          # React frontend (Vite entry)
├── App.tsx                   # Root layout
├── cards/                    # Card renderers (DynamicUICard, TerminalCard, etc.)
├── components/               # CardTimeline, CardContainer, ChatInput, MarkdownText, ConnectionPicker
├── store/chat.ts             # Zustand state
├── lib/                      # ws-client, sandbox (Sucrase JSX→JS), enso-ui (17 components), connection manager
└── types.ts

openclaw-plugin/              # OpenClaw channel plugin (the backend)
├── index.ts                  # Plugin entry
├── apps/                     # Codebase apps (checked into git)
│   └── <family>/             # app.json + template.jsx + executors/*.js
└── src/
    ├── channel.ts            # ChannelPlugin implementation
    ├── server.ts             # Express + WS server
    ├── inbound.ts            # Browser msg → OpenClaw dispatch
    ├── outbound.ts           # Agent reply delivery, enhance, card action dispatch
    ├── ui-generator.ts       # Gemini-based tool selection for enhance
    ├── tool-factory.ts       # Build pipeline: spec → executors → template → persist
    ├── app-persistence.ts    # Save/load dynamic apps from disk
    ├── claude-code.ts        # Claude Code CLI integration
    ├── *-tools.ts            # Tool family implementations (filesystem, workspace, media, travel, meal)
    ├── tool-families/catalog.ts  # TOOL_FAMILY_CAPABILITIES definitions
    └── native-tools/         # Zero-config native tool bridge
        ├── registry.ts       # Tool auto-discovery + template registry
        └── templates/        # Pre-built JSX templates per tool family

shared/types.ts               # Protocol types shared between frontend and plugin
```

## Key Concepts

### WebSocket Protocol

- **Client → Server** (`ClientMessage`): `chat.send`, `chat.history`, `ui_action`, `card.action`, `card.enhance`, `card.build_app`, `card.propose_app`, `apps.list`, `apps.run`, `settings.set_mode`, `operation.cancel`
- **Server → Client** (`ServerMessage`): states `delta` (streaming), `final`, `error` — carries `text`, `data`, `generatedUI`, `mediaUrls`, `targetCardId`, `steps`, `settings`, `enhanceResult`, `buildComplete`, `questions`
- `chat.send` with `routing.toolId: "claude-code"` bypasses OpenClaw agent, spawns CLI directly
- `card.action` carries `cardId`, `cardAction`, `cardPayload` — dispatched via four-path resolution

### Multi-Block Response Handling

1. Stable card ID generated before dispatch — all blocks reference same card
2. Each block's text collected into `AgentStep[]` with sequence numbers
3. Card's `text` set to last block (final answer); earlier blocks in `steps`
4. Frontend shows expandable "N agent steps" toggle when 2+ steps

### App Enhancement (Three Flows)

- **Fast Enhance**: User clicks App button → family selected from dropdown (or auto-detect) → deterministic tool execution → template rendering → app view with Original/App toggle
- **Build App**: User clicks "Build custom app..." → LLM proposal → async build pipeline (spec → executors ∥ template → validation → registration) → `buildComplete` notification
- **Refine**: User types instruction in app view → single LLM call regenerates template JSX only → in-place update (cheapest iteration path)

### ExecutorContext (`ctx`)

Available methods in executor function bodies: `ctx.callTool(name, params)`, `ctx.listDir(path)`, `ctx.readFile(path)`, `ctx.searchFiles(root, name)`, `ctx.fetch(url, opts?)`, `ctx.search(query, opts?)`, `ctx.ask(prompt, opts?)`, `ctx.store.get/set/delete(key)`. See CLAUDE-REFERENCE.md for full API details.

### EnsoUI Component Library

17 pre-styled components injected into the sandbox: `Tabs`, `DataTable`, `Stat`, `Badge`, `Button`, `UICard`, `Progress`, `Accordion`, `Dialog`, `Select`, `Input`, `Switch`, `Slider`, `Separator`, `EmptyState`, `EnsoUI.Tooltip`, `EnsoUI.VideoPlayer`. 13 accent colors available. See CLAUDE-REFERENCE.md for props and usage.

### Claude Code Integration

- Trigger: `/code` opens project picker, then `/code <prompt>` sends prompts
- Backend spawns `claude.exe --output-format stream-json`, parses NDJSON, streams via WS
- Session resumption via `--resume <sessionId>`, `AskUserQuestion` tool renders as clickable buttons

### Native Tool Bridge + Action Dispatch

Four-path dispatch (first match wins):
1. **Refine** — `action === "refine"` → regenerate template only (1 LLM call)
2. **Mechanical** — built-in data mutations (sorting, task boards)
3. **Native tool** — resolve `prefix + action` to registered tool → execute directly
4. **Agent fallback** — unmatched actions go through OpenClaw agent pipeline

## Building Apps

**Dynamic apps** are the primary workflow. They live as portable directories (`app.json` + `template.jsx` + `executors/*.js`) in two locations:

| Location | Path | Purpose |
|----------|------|---------|
| **User apps** | `~/.openclaw/enso-apps/<family>/` | Created by Build App pipeline |
| **Codebase apps** | `openclaw-plugin/apps/<family>/` | Promoted via Apps menu bookmark |

Three creation methods: **(1) Build from Enso UI** (recommended), **(2) Via Code button** (Claude Code), **(3) Manual** file creation.

**Built-in apps** (advanced) use a 5-file TypeScript pattern for deeply integrated tool families. See CLAUDE-REFERENCE.md for complete guides on both approaches.

### Critical Rules (Quick Reference)

- Every tool's result data MUST include `"tool": "enso_<family>_<suffix>"` field
- All parameter schemas MUST have `additionalProperties: false`
- Exactly one tool per family must have `isPrimary: true`
- Executors are function bodies (no imports/exports), use `var` not `const`/`let`
- Templates are JSX strings (no imports), all hooks at top level (never in conditionals)
- Template sandbox has: React hooks, Recharts, Lucide icons, EnsoUI — no DOM/fetch/globals
- Use `EnsoUI.Tooltip` (not `Tooltip` which is Recharts)

## Tech Stack

Frontend: React 19 + Zustand 5 + Tailwind CSS 4 + Recharts + Lucide + Sucrase + Vite 6. Backend: Express 4 + ws 8 (started by OpenClaw). Language: TypeScript 5.7 strict, ESM. LLM: Gemini (via API key).

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
- Tools registered via `api.registerTool()`, hooks via `api.registerHook()`
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
