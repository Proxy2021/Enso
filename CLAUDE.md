# Enso — CLAUDE.md

## Vision

Enso is an OpenClaw channel plugin that combines conversational AI with **on-demand interactive app experiences**. Agent responses arrive as clean text cards, and users can optionally enhance any card into a fully interactive React application — dashboards, file explorers, prediction tables — powered by pre-built tool templates. The guiding principle: **"Any answer can become an app."**

## Architecture Overview

Enso has two layers:

1. **React Frontend** — Browser-based chat UI (Vite + React 19 + Tailwind CSS 4 + Zustand)
2. **OpenClaw Plugin** — Channel integration that routes messages through OpenClaw's agent pipeline, runs the Express + WS server, and provides user-triggered app enhancement via Gemini + deterministic tool templates

### Data Flow

**Normal chat** (via OpenClaw agent):
```
Browser → WebSocket → OpenClaw Plugin Server → Agent (via OpenClaw gateway) → Response
    ↓
Multi-block accumulation (inbound.ts: stable card ID + steps array)
    ↓
deliverEnsoReply → plain text chat card (last block as primary, steps retained)
    ↓
User clicks "App" enhance button → LLM selects tool → deterministic tool execution → pre-built template UI
    ↓
User can toggle between Original (text) and App (interactive) views
    ↓
Card actions in App view → three-path dispatch (mechanical / native tool / agent fallback)
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
│   ├── types.ts              # Card, AgentStep, CardRendererProps, CardTypeRegistration
│   ├── registry.ts           # Card type registry + resolver
│   ├── DynamicUICard.tsx     # Compiled JSX sandbox renderer + error boundary
│   ├── TerminalCard.tsx      # Claude Code terminal: project picker, streaming output, questions
│   └── ...                   # Other card renderers (chat, user-bubble)
├── components/
│   ├── CardTimeline.tsx      # Card history, auto-scroll, typing indicator
│   ├── CardContainer.tsx     # Card wrapper with collapse/expand, enhance button, view toggle, agent steps
│   ├── ChatInput.tsx         # Text input + file upload
│   ├── MediaGallery.tsx      # Image/video gallery
│   └── MarkdownText.tsx      # Inline markdown renderer
├── store/chat.ts             # Zustand state (cards, connection, actions, enhance)
├── lib/
│   ├── ws-client.ts          # WebSocket client with auto-reconnect
│   ├── sandbox.ts            # Sucrase JSX→JS, scope injection, compilation
│   └── enso-ui.tsx           # EnsoUI component library (16 pre-styled components)
└── types.ts                  # Frontend types

openclaw-plugin/              # OpenClaw channel plugin (the backend)
├── index.ts                  # Plugin entry, registers channel + after_tool_call hook
├── openclaw.plugin.json      # Plugin metadata
├── SETUP.md                  # Integration guide
└── src/
    ├── channel.ts            # ChannelPlugin implementation + config schema
    ├── runtime.ts            # OpenClaw runtime singleton
    ├── accounts.ts           # Account config resolution
    ├── server.ts             # Express + WS server, /media endpoint, card.action + claude-code routing
    ├── claude-code.ts        # Claude Code CLI integration (spawn, NDJSON parse, AskUserQuestion)
    ├── inbound.ts            # Browser msg → OpenClaw dispatch, multi-block accumulation
    ├── outbound.ts           # Agent reply delivery, card enhance (LLM tool selection), card action dispatch
    ├── ui-generator.ts       # Gemini-based tool selection for enhance flow
    ├── text-parser.ts        # Deterministic text → structured data parser (tables, lists, sections)
    ├── types.ts              # Plugin type definitions
    ├── tooling-console.ts    # /tool enso console data builders
    ├── filesystem-tools.ts   # enso_fs_* tool registrations
    ├── workspace-tools.ts    # enso_ws_* tool registrations
    ├── media-tools.ts        # enso_media_* tool registrations
    ├── travel-tools.ts       # enso_travel_* tool registrations
    ├── meal-tools.ts         # enso_meal_* tool registrations
    ├── tool-families/        # Tool family capability catalog
    │   └── catalog.ts        # TOOL_FAMILY_CAPABILITIES definitions
    └── native-tools/         # Zero-config native tool bridge
        ├── registry.ts       # Tool auto-discovery, template registry, data normalization, direct execution
        ├── tool-call-store.ts # Time-windowed store linking after_tool_call events to card delivery
        └── templates/        # Pre-built JSX templates per tool family
            ├── alpharank.ts
            └── general.ts

shared/                       # Code shared between frontend and plugin
└── types.ts                  # Protocol: ClientMessage, ServerMessage, AgentStep, ToolRouting, ToolQuestion
```

## Key Concepts

### WebSocket Protocol

- **Client → Server**: `ClientMessage` with types `chat.send`, `chat.history`, `ui_action`, `tools.list_projects`, `card.action`, `card.enhance`, `card.build_app`, `card.propose_app`, `card.delete_all_apps`, `apps.list`, `apps.run`, `settings.set_mode`, `operation.cancel`
- **Server → Client**: `ServerMessage` with states `delta` (streaming), `final`, `error`
- Messages carry: `text`, `data` (structured), `generatedUI` (JSX code), `mediaUrls`, `targetCardId` (for in-place card updates), `steps` (multi-block agent steps), `settings` (connection-time config including `toolFamilies` for the enhance menu)
- `chat.send` can include `routing?: ToolRouting` — when `toolId: "claude-code"`, the server bypasses OpenClaw and directly spawns the Claude CLI
- `card.action` messages carry: `cardId`, `cardAction`, `cardPayload` — routed to the card's interaction context for data mutation + UI regeneration
- `card.enhance` messages carry: `cardId`, `cardText`, optional `suggestedFamily` — triggers tool selection and app view generation. When `suggestedFamily` is set, skips LLM selection.
- `card.build_app` messages carry: `cardId`, `cardText`, `buildAppDefinition`, optional `conversationContext` — triggers the async app build pipeline (fire-and-forget) with conversation awareness
- `card.propose_app` messages carry: `cardId`, `cardText`, `conversationContext` — generates an LLM app proposal before showing the Build App dialog
- `enhanceResult` on server messages — carries app view data (`data`, `generatedUI`, `cardMode`) back to the requesting card
- `buildComplete` on server messages — async notification when the build pipeline finishes: `{ cardId, success, summary?, error? }`. Client creates a notification card and updates the source card's enhance status.
- `steps?: AgentStep[]` — when the agent self-iterates (multiple blocks), all intermediate steps are retained
- `questions?: ToolQuestion[]` on deltas — interactive questions from Claude Code's `AskUserQuestion` tool, rendered as clickable buttons

### Multi-Block Response Handling

When the OpenClaw agent self-iterates (e.g., a tool call fails and it retries), the buffered block dispatcher delivers multiple blocks for a single request. Enso handles this via:

1. **Stable card ID**: `inbound.ts` generates a single `stableCardId` before dispatching. All blocks reference the same card.
2. **Steps accumulation**: Each block's raw text is collected into an `AgentStep[]` array with its `seq` number.
3. **Last-block-as-primary**: The card's `text` field is set to the last block (the final answer). Earlier blocks are retained in `steps`.
4. **Frontend expansion**: When a card has 2+ steps, `CardContainer` renders an expandable "N agent steps" toggle. Collapsed by default; expanding shows each step chronologically with the final step labeled.
5. **Context stability**: The stable card ID ensures `cardContexts` is always keyed consistently, so card actions work correctly even on multi-block responses.

### User-Triggered App Enhancement

Agent responses arrive as plain text chat cards. Users can optionally enhance any card into an interactive app:

**Enhance Menu** (tool family vocabulary):
The "App" enhance button shows a dropdown menu listing all available tool families (from `TOOL_FAMILY_CAPABILITIES`). Each entry shows an icon, family name, and description. Options:
- **Auto-detect**: LLM picks the best app type (original behavior)
- **Family shortcut**: Pre-selects a family, skips the LLM tool selection call entirely (instant enhance via `suggestedFamily` in the WS message)
- **Build custom app...**: Opens the async build pipeline for new app types

The menu is populated from `toolFamilies` state, sent by the server on WebSocket connection in the `settings` message. Frontend stores in Zustand; `enhanceCardWithFamily(cardId, family)` sends a `card.enhance` with `suggestedFamily`.

**Fast Enhance** (existing tool family matches):
1. User clicks the "App" button → dropdown shows families, or clicks a specific family for instant enhance
2. `card.enhance` message sent to server with `cardText` and optional `suggestedFamily`
3. **Tool selection**: When `suggestedFamily` is set, the server skips `selectToolForContent()` and uses the family's `fallbackToolName` directly. Otherwise, Gemini analyzes the text and selects the best match from `TOOL_FAMILY_CAPABILITIES`.
4. **Deterministic tool execution**: The selected tool is executed directly via `executeToolDirect()` — no further LLM calls
5. **Template rendering**: `inferToolTemplate()` selects a pre-built JSX template, `normalizeDataForToolTemplate()` aligns the data shape, `getToolTemplateCode()` returns the JSX string
6. **App view delivered**: `enhanceResult` sent back with `data`, `generatedUI`, `cardMode`
7. **Frontend**: Card gains an Original/App toggle. App view renders the compiled JSX template in the sandbox.
8. **Card actions**: Buttons in the app view trigger `card.action` → four-path dispatch (refine / mechanical / native tool / agent fallback)

**Build App** (no existing tool family — async pipeline):
1. User clicks "Build custom app..." → `card.propose_app` generates an LLM proposal (conversation context is cached and threaded through)
2. Proposal arrives → dialog opens with editable app definition
3. User submits → `card.build_app` fires the build pipeline **asynchronously** (fire-and-forget), with `conversationContext` threaded into the spec prompt
4. Dialog closes immediately, card remains fully interactive (no loading overlay)
5. Build runs in background: spec design → **executor generation ∥ UI template** (parallelized) → validation → registration → persistence
6. On completion, server sends `buildComplete` notification → client creates a chat card: "✓ New app built: **family** (N tools)" or "✗ App build failed: reason"
7. Source card's `enhanceStatus` is updated to `"ready"`, gaining the Original/App toggle

**Build pipeline parallelization**: Steps 2 (executor generation) and 3 (template generation) run concurrently via `Promise.all` since both only depend on the spec from Step 1. This saves 3-5 seconds per build. Validation (Step 4) remains sequential since it needs both results.

**Conversation context threading**: The `conversationContext` (recent chat exchanges) is captured on the frontend when the user clicks "Build custom app...", passed through `card.propose_app` and `card.build_app`, and injected into `buildPluginSpecPrompt()` between the "ORIGINAL AI RESPONSE" and "USER'S SCENARIO" sections. This gives the LLM spec designer full awareness of why the user asked for the app.

**Refine** (incremental iteration on app UI):
After an app is built and displayed, users can refine its UI without rebuilding executors:
1. In the app view footer, a "Refine" button (pencil icon) toggles an inline text input
2. User types an instruction (e.g., "use blue theme", "add a chart", "make cards bigger")
3. Submits via `card.action` with `action: "refine"` and `payload: { instruction }`
4. Server intercepts before normal dispatch, calls `refineTemplate()` — a single Gemini LLM call that takes the existing template JSX + current data shape + user instruction and regenerates only the template
5. Validated via Sucrase (with one retry on failure), then the registered template code is updated
6. Card updates in-place with the new template; data unchanged, all existing actions still work

The refine flow is the cheapest iteration path: **1 LLM call** (vs. 4+ for a full rebuild). It preserves all tool executors and data while allowing arbitrary UI/styling/layout changes.

### ExecutorContext — Runtime Capabilities for Generated Apps

Generated app executors receive a `ctx: ExecutorContext` object providing real system access. Available methods:

| Method | Description |
|--------|-------------|
| `ctx.callTool(name, params)` | Call any registered OpenClaw tool. Returns `{ success, data, error }`. |
| `ctx.listDir(path)` | List directory contents (files/folders with metadata). |
| `ctx.readFile(path)` | Read a text file. Returns file content string. |
| `ctx.searchFiles(root, name)` | Search for files by name pattern. |
| `ctx.fetch(url, opts?)` | HTTPS fetch (max 512KB, 10s timeout). Returns `{ ok, status, data }`. |
| `ctx.search(query, opts?)` | Web search via Brave Search API. Returns `{ ok, results: [{title, url, description}] }`. |
| `ctx.ask(prompt, opts?)` | Ask Gemini Flash a question. Returns `{ ok, text }`. Use for summarization, classification, analysis. During validation (no API key), returns `{ ok: false, text: "" }`. |
| `ctx.store.get(key)` | Read a value from persistent KV storage (scoped per tool family). Returns value or `null`. |
| `ctx.store.set(key, value)` | Write a JSON-serializable value. 1MB limit per family. |
| `ctx.store.delete(key)` | Remove a key. Returns `true` if it existed. |

**`ctx.ask()`** — LLM capability added to enable intelligent data processing within executors. Uses Gemini Flash for cost efficiency. Implemented via dynamic import of `callGeminiLLMWithRetry` to avoid circular dependencies. API key is resolved lazily via `getActiveAccount()` for apps loaded at startup.

**`ctx.store`** — Key-value persistence backed by JSON files at `~/.openclaw/enso-apps/<toolFamily>/store.json` with an in-memory cache. Scoped per tool family so apps don't interfere with each other. Enables use cases like saving user preferences, caching expensive computations, and tracking history across sessions.

### Dynamic UI Sandbox

When app views render compiled JSX:

1. **Sandbox** (`src/lib/sandbox.ts`): Sucrase transforms JSX → JS, Function constructor compiles in isolated scope
2. Scope provides: React hooks, Recharts, Lucide icons, **EnsoUI components** — no network/DOM/global access
3. Error boundary catches failures → falls back to formatted JSON

### EnsoUI Component Library

`src/lib/enso-ui.tsx` provides 16 pre-styled React + Tailwind components injected into the sandbox scope as the `EnsoUI` namespace. Zero npm dependencies. All components match Enso's dark theme.

**Components available in generated templates** (destructured in the preamble):

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `Tabs` | Multi-view navigation | `tabs=[{value, label}]`, `defaultValue`, `variant="pills\|underline\|boxed"`, render-function children |
| `DataTable` | Sortable, paginated tables | `columns=[{key, label, sortable?, render?}]`, `data`, `pageSize`, `striped` |
| `Stat` | KPI metric tiles | `label`, `value`, `change?`, `trend`, `accent` |
| `Badge` | Status indicators | `variant="default\|success\|warning\|danger\|info\|outline"` |
| `Button` | Styled buttons | `variant="default\|primary\|ghost\|danger\|outline"`, `icon`, `loading` |
| `UICard` | Card containers | `accent?`, `header?`, `footer?` |
| `Progress` | Completion bars | `value`, `max`, `variant`, `showLabel` |
| `Accordion` | Collapsible sections | `items=[{value, title, content}]`, `type="single\|multiple"`, `defaultOpen` |
| `Dialog` | Modal overlays | `open`, `onClose`, `title`, `footer` |
| `Select` | Dropdowns | `options=[{value, label}]`, `placeholder` |
| `Input` | Text inputs | `icon?`, standard input props |
| `Switch` | Boolean toggles | `checked`, `onChange`, `label` |
| `Slider` | Range inputs | `min`, `max`, `step`, `showValue` |
| `Separator` | Divider lines | `orientation` |
| `EmptyState` | Zero-state placeholders | `icon`, `title`, `description`, `action` |
| `EnsoUI.Tooltip` | CSS hover tooltips | `content`, `side` (not destructured — use via namespace) |

**Accent colors** (13): `blue`, `emerald`, `amber`, `purple`, `rose`, `cyan`, `orange`, `red`, `gray`, `violet`, `indigo`, `teal`, `pink`. Unknown values safely fall back to `blue`.

**Name collision strategy:** Recharts `Tooltip` stays as `Tooltip` (backward compat). EnsoUI's Tooltip is accessed as `EnsoUI.Tooltip`. The LLM prompts document this explicitly.

**LLM integration:** Both `STRUCTURED_DATA_SYSTEM_PROMPT` and `TEXT_ANALYSIS_SYSTEM_PROMPT` in `ui-generator.ts` include EnsoUI component docs with a `MANDATORY: PREFER EnsoUI` directive. `buildPluginTemplatePrompt` in `tool-factory.ts` reinforces this for the app build pipeline.

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

2. **Enhance-time linking**: When `handleCardEnhance()` selects and executes a tool, the tool's plugin is identified via `getToolPluginId()`, and a `nativeToolHint` is stored in the card context with the tool name, params, and handler prefix.

3. **Auto-detection**: The tool's common prefix is computed by `getPluginToolPrefix()` (longest common prefix among all tools from that plugin, ending with `_`).

4. **Four-path action dispatch** when a user clicks a card button:
   - **Path 0 — Refine**: `action === "refine"` with `payload.instruction` → re-generates only the template JSX (1 LLM call), preserving data and executors
   - **Path 1 — Mechanical**: Built-in data mutations (task boards, sorting) that don't need a tool call
   - **Path 2 — Native tool**: Action name resolved via exact match (`prefix + action`), suffix match (against `actionSuffixes`), or family fallback → executed directly via `executeToolDirect()` → result re-rendered with template
   - **Path 3 — Agent fallback**: If neither path matches, the action is sent through the OpenClaw agent pipeline

**Extension point**: For custom action name mappings or parameter enrichment, you can optionally register a `NativeToolActionMap` via `registerActionMap()`. But the default zero-config path handles most cases.

### Tool Mode Catalog + Tool Console

Enso now ships multiple deterministic "app experience" tool families:

- `alpharank` (predictions, regime, portfolio, routine, ticker detail)
- `filesystem` (`enso_fs_*`)
- `code_workspace` (`enso_ws_*`)
- `multimedia` (`enso_media_*`)
- `travel_planner` (`enso_travel_*`)
- `meal_planner` (`enso_meal_*`)
- `enso_tooling` (the `/tool enso` console)

The `/tool enso` command opens a dedicated in-app tool console card that:

1. Lists all supported tool families
2. Allows drilling into each family to inspect its registered templates
3. Supports adding new tool requests by description
4. Reports if matching support already exists

### Caching

- Components cached by data shape + action hints hash (DJB2) — identical structures with the same tool context reuse components
- In-memory only (resets on restart)

### OpenClaw Integration

Enso registers as a **channel plugin** in OpenClaw:
- Implements `ChannelPlugin<ResolvedEnsoAccount>` interface
- Uses OpenClaw's `resolveAgentRoute()` for agent routing
- Uses `dispatchReplyWithBufferedBlockDispatcher()` for multi-block streaming
- The `deliver` callback in `inbound.ts` accumulates blocks into steps and delivers via `deliverEnsoReply()`
- Supports DM policy config: `open`, `pairing`, `disabled`

### Server-Side Logging

Consistent `[enso:*]` prefix for filtering:
- `[enso:inbound]` — request lifecycle: run ID, card ID, block delivery
- `[enso:outbound]` — message delivery: card ID, step count, target
- `[enso:enhance]` — enhance flow: LLM selection, tool correction, context creation
- `[enso:action]` — card action dispatch: context lookup, path resolution (refine/mechanical/native/agent), tool execution results
- `[enso:build:<id>]` — app build pipeline: step-by-step trace with timing, structured final report (steps passed/failed/retried, total ms)

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

**All development must be done on the main branch directly** — do not use worktrees or feature branches. Edit files in the main tree at `/Users/kkwong/Desktop/Github/Enso/`.

```bash
# Run frontend dev server (Vite :5173)
npm run dev

# Production build
npm run build

# Live multi-step tool-mode E2E harness
node scripts/live-e2e-tool-mode.js
```

Enso requires a running OpenClaw gateway with the Enso plugin enabled. The plugin starts its own Express + WS server (default port 3001). Vite dev server proxies `/ws`, `/media`, `/upload` to the plugin's server at localhost:3001.

### Dev Commands

- `/delete-apps` — Delete all dynamically created apps (disk + memory). Useful for clearing test apps during development.

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

## Current Status (Phase 7)

**Implemented**: Card-based chat UI, WebSocket messaging, text streaming (delta/final), media upload, OpenClaw plugin integration, multi-block response accumulation with expandable agent steps, user-triggered app enhancement (LLM tool selection → deterministic execution → pre-built template UI), Original/App view toggle, interactive card actions with four-path dispatch (refine / mechanical / native tool / agent fallback), card interaction context with action history, Claude Code CLI integration with direct tool routing, NDJSON streaming from CLI, session resumption, interactive AskUserQuestion with clickable option buttons, project picker with git repo scanning, persistent terminal card with multi-turn conversations, zero-config native tool bridge (auto-discovery from OpenClaw plugin registry, direct tool execution), deterministic tool-mode templates for AlphaRank/filesystem/workspace/media/travel/meal domains, `/tool enso` tool console for template introspection + add-tool requests, comprehensive server-side logging (`[enso:inbound/outbound/enhance/action/build]`), runtime mode switching (IM/UI/Full), async app build pipeline (fire-and-forget with `buildComplete` notification), deferred Build App dialog (waits for LLM proposal before showing), enhance menu with tool family vocabulary (dropdown showing available app types for instant enhance), conversation context threading (chat history passed through build pipeline for context-aware spec design), parallelized build pipeline (executor + template generation run concurrently, saving 3-5s), `ctx.ask()` LLM capability (Gemini Flash available in executors for summarization/classification/analysis), incremental iteration via Refine (single-LLM-call template regeneration from app view), `ctx.store` key-value persistence (JSON-backed per-family storage surviving restarts), and **EnsoUI component library** (16 pre-styled React + Tailwind components — Tabs, DataTable, Stat, Badge, Button, Card, Progress, Accordion, Dialog, Select, Input, Switch, Slider, Separator, EmptyState, Tooltip — injected into the sandbox scope, with LLM prompts updated to prefer them over hand-coded equivalents, reducing generated template tokens by ~40-50%).

**Not yet implemented**: Persistent chat history, user authentication, multi-user session isolation, rate limiting, full inline tool activity trace cards (reads/edits/bash timeline), cost tracking per run, abort button for active Claude Code runs.
