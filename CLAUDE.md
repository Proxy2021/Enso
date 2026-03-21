# Enso — CLAUDE.md

> For detailed app building guides, API references, template rules, and code examples, see [CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md).

## Vision

**Enso — an AI sandbox that generates complete solutions. It discovers project opportunities, assembles AI teams to build, self-evolves, and ships products.** It can run standalone or as an OpenClaw channel plugin.

**Core principles:**
- **Adaptive answers** — Responses flow through a deterministic tool-to-UI pipeline, delivering the most useful format for each answer — interactive research boards, data visualizations, photo studios, file managers — not walls of text. No LLM call needed for rendering.
- **AI teams for any task** — Complex goals are auto-decomposed into dependency graphs and executed by parallel Claude Code-powered agents (researcher, architect, builder, coder, reviewer) with approval gates and shared context.
- **Self-evolving** — The platform includes Claude Code directly (`/code`), so it can build and modify itself from within. Every user-built app is dual-registered as both a UI experience and an agent-callable tool — the ecosystem compounds with use.
- **AI-native project management** — Each project has a team of AI agents (Project Leader, Architect, Engineer, QA, Marketing, Sales, AI Strategist) and customer personas that autonomously discover, build, and evolve projects through iterative sprints with real browser testing, code implementation, and validation cycles.

## Architecture Overview

Enso has two layers:

1. **React Frontend** — Browser-based chat UI (Vite + React 19 + Tailwind CSS 4 + Zustand)
2. **Enso Server (Backend)** — Express + WS server providing deterministic tool-to-template rendering + Claude Code integration. Can run standalone or as an OpenClaw channel plugin for agent routing and tool sharing.

> **Standalone mode**: Enso can run its backend server independently via `npm run dev:server`, without requiring an OpenClaw gateway. In standalone mode, chat is handled directly (no agent pipeline), but all other features — Claude Code, apps, orchestration, evolution — work identically.

### Data Flow

- **Normal chat (Q&A)**: Browser → WS → Enso Server → Agent → text response → `deliverEnsoReply` → text card
- **Normal chat (tool use)**: Browser → WS → Enso Server → Agent calls registered tool → `after_tool_call` hook captures result → `deliverEnsoReply` → text card + auto-enhance via `consumeRecentToolCall()` → app card rendered alongside text (no LLM call needed)
- **Claude Code**: Browser → WS → `server.ts` → spawn `claude.exe` (NDJSON stream) → streaming terminal card + interactive questions

## Project Structure

```
src/                          # React frontend (Vite entry)
├── App.tsx                   # Root layout
├── cards/                    # Card renderers (DynamicUICard, TerminalCard, ShellCard, etc.)
├── components/               # CardTimeline, CardContainer, ChatInput, MarkdownText, ConnectionPicker, ToastContainer, BackgroundTaskBar, ResultsInbox
├── store/chat.ts             # Zustand state
├── lib/                      # ws-client, sandbox (Sucrase JSX→JS), enso-ui (17 components), connection manager, notifications, useElapsedTime
└── types.ts

server/                       # Enso server (the backend)
├── index.ts                  # Server/plugin entry
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
    ├── evolution.ts          # Self-evolution sprint system with AI persona agents
    ├── project-manager.ts    # Project CRUD, team agents, personas, sprint history
    ├── app-persistence.ts    # Save/load dynamic apps from disk
    ├── claude-code.ts        # Claude Code CLI integration
    ├── shell-pty.ts          # Remote terminal PTY manager (node-pty)
    ├── *-tools.ts            # System app implementations (filesystem, workspace, media, screen, travel, meal)
    ├── app-catalog.ts          # APP_CATALOG definitions (system + app entries)
    └── native-tools/         # App action bridge
        ├── registry.ts       # App tool discovery + template registry
        └── templates/        # Pre-built JSX templates per app

shared/types.ts               # Protocol types shared between frontend and server
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
- **Deep Research**: User triggers "Deep Dive" on a research card → `handleDeepResearchBuild()` spawns Claude Code session → researches topic + writes a single `.deep-research-ui.jsx` with bespoke interactive UI tailored to the topic → compile-checked with Sucrase → delivered as `generatedUI` on the research card. No app registration needed — each deep research is a one-off custom experience.
- **Refine**: User types instruction in app view → single LLM call regenerates template JSX only → in-place update (cheapest iteration path)

### ExecutorContext (`ctx`)

Available methods in executor function bodies: `ctx.callTool(name, params)`, `ctx.listDir(path)`, `ctx.readFile(path)`, `ctx.searchFiles(root, name)`, `ctx.fetch(url, opts?)`, `ctx.search(query, opts?)`, `ctx.ask(prompt, opts?)`, `ctx.store.get/set/delete(key)`. See CLAUDE-REFERENCE.md for full API details.

### EnsoUI Component Library

17 pre-styled components injected into the sandbox: `Tabs`, `DataTable`, `Stat`, `Badge`, `Button`, `UICard`, `Progress`, `Accordion`, `Dialog`, `Select`, `Input`, `Switch`, `Slider`, `Separator`, `EmptyState`, `EnsoUI.Tooltip`, `EnsoUI.VideoPlayer`. 13 accent colors available. See CLAUDE-REFERENCE.md for props and usage.

### Agentic Task Orchestration

- **Task Router** (`task-router.ts`): Auto-classifies user messages into 4 tiers via Gemini Flash:
  - `simple` → normal agent chat (questions, information requests)
  - `research` → direct researcher tool invocation (bypasses agent, progressive streaming)
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
- Plan written to `server/.mission-plan.json`, parsed, sent as `missionPlan` to client
- User reviews proposals in MissionCard (approve/skip/edit each app)
- Approved apps built sequentially via `handleBuildAppViaClaude`
- Progress tracked via `missionProgress` messages (analyzing → proposing → building → complete)
- Key files: `mission-planner.ts` (backend), `MissionCard.tsx` (frontend), card type `"mission"`

### Projects & Self-Evolution System

Enso supports a **Projects abstraction** where each project has its own team of AI agents and customer personas. Projects can be any software product — Enso itself is just one project that Enso helps build and evolve.

#### Project Structure

Each project is stored at `~/.enso/projects/<projectId>/`:
- `project.json` — Project definition (vision, team agents, personas, goals)
- `sprints/` — Sprint history with full reports, dashboards, and deliverables
- `deliverables/` — Accumulated outputs (marketing materials, architecture docs, etc.)

#### Project Definition (`project.json`)

```json
{
  "id": "enso",
  "name": "Enso",
  "vision": "An AI sandbox that generates complete solutions...",
  "codebasePath": "D:/Github/Enso",
  "testUrl": "http://localhost:5173",
  "teamAgents": [...],     // Internal team (Project Leader, Architect, etc.)
  "personas": [...],       // Customer personas for testing
  "validationPersonaIds": ["startup-founder", "student-researcher"]
}
```

#### Team Agents (Internal Team)

Each project has a team of AI agents with specialized roles, split into **core** (always participate) and **optional** (Project Leader decides per sprint):

| Agent | Role | agentRole | Core? | What They Do |
|-------|------|-----------|:-----:|-------------|
| **Project Leader** | Meta-controller | architect | Always | Defines vision, sets sprint focus, selects personas, triages findings, reviews all outputs |
| **Software Architect** | Technical design | architect | Core | Architecture reviews, ADRs, tech debt tracking, scalability |
| **Engineering Manager** | Code quality | reviewer | Core | Convention adherence, regression prevention, build validation |
| **QA & Test Manager** | Quality assurance | reviewer | Core | Test scenarios, edge cases, quality metrics, test infrastructure |
| **Marketing Director** | Brand & messaging | researcher | Optional | Evaluates positioning, creates marketing deliverables |
| **Sales Director** | Commercialization | researcher | Optional | Pricing models, customer acquisition, ROI narratives |
| **AI Technology Strategist** | Frontier tech | researcher | Optional | Evaluates latest AI tech, recommends adoptions (scope-constrained by PL) |

**Design rationale**: Running all 7 agents on every sprint is wasteful for purely technical sprints. The PL triage gate (Phase 2) lets the Project Leader decide which optional agents add value based on actual persona feedback. Over 6 sprints, Marketing/Sales were excluded from technical sprints with no loss in quality.

#### Customer Personas

Personas represent real user archetypes who test the product through actual browser automation (Puppeteer). Each persona has: background, goals, frustrations, and test scenarios.

The **Project Leader decides which personas to involve per sprint** based on the sprint focus. They can select from existing personas or create new ones on-the-fly for specific testing needs. Typical selection: 2-3 personas chosen for diagnostic value, continuity, or rotation.

#### Evolution Sprint (`/evolve`)

- **Trigger**: `/evolve` command or "Evolve" tile on WelcomeCard
- **Planner**: Claude Opus with adaptive thinking — produces higher-quality DAG structures than Sonnet
- **Concurrency**: Up to 6 parallel Claude Code sessions
- **Duration**: ~55-65 minutes (17 tasks typical)
- **Sprint phases** (7 phases):

| Phase | Tasks | Parallelism | What Happens |
|-------|:-----:|:-----------:|-------------|
| **0. PL Meta-Evaluation** | 1 | — | Project Leader reviews all prior sprint artifacts, sets priorities, selects personas |
| **1. Persona Testing** | 2-3 | All parallel | Personas test the product via real Puppeteer browser automation (BEFORE team agents) |
| **2. PL Triage** | 1 | — | Project Leader reviews persona findings, ranks pain points, selects which team agents to involve |
| **3. Team Evaluation** | 3-4 | All parallel | Core agents (Architect, Eng Manager, QA) always run; optional agents by PL's choice |
| **4. Synthesis + Design** | 1 | — | Merged cross-report analysis + prioritized backlog + technical architecture (was 3 separate tasks) |
| **5. Implementation** | 2-3 | Tracks parallel | Parallel frontend/backend implementation tracks, then Review with fix-verify loop |
| **6. Final Phase** | 3-4 | All parallel | Validation re-tests + interactive dashboard + PL meta-review (all concurrent) |

**Key design decisions** (learned from 6 sprint iterations):

- **Personas test FIRST** (Phase 1 before Phase 3) — team agents produce better evaluations when grounded in real user feedback rather than evaluating in a vacuum
- **PL Triage gate** (Phase 2) — prevents wasteful agent runs; PL reads persona pain points and decides which specialists matter for this sprint
- **Merged synthesis-and-design** (Phase 4) — eliminates 2 unnecessary handoff phases (old structure had separate synthesis, discussion, and design tasks)
- **Parallel final phase** (Phase 6) — retests, dashboard, and meta-review run concurrently instead of serially, saving ~15 minutes
- **Fix-verify loop** — if the review task returns a FAIL verdict, the engine auto-injects a `fix-cycle` task and re-runs review

**Context propagation**: Each task writes a `<!-- STRUCTURED_SUMMARY {JSON} -->` block at the end of its output. The DAG engine's `readTaskSummary()` parses these blocks to inject compact, machine-readable context (verdict, key findings, ratings) into downstream tasks — enabling inter-agent knowledge transfer without copying full reports.

- **Safety rules**: Implementation tasks are forbidden from restarting servers, pushing to git, or modifying versions
- **Sprint persistence**: Full reports, screenshots, dashboards saved to `~/.enso/projects/<id>/sprints/sprint-<timestamp>/`

#### Running & Monitoring Evolution Sprints

**Prerequisites**:
- OpenClaw gateway running with Enso plugin
- Vite dev server running on `localhost:5173` (personas test against this)
- Fresh tsx cache (see restart procedure below)

**Launching**: Type `/evolve` in Enso chat, or send `evolution.start` via WebSocket. The sprint auto-plans (Opus, ~2-3 min) and presents the task DAG for approval. Approve to start execution.

**Monitoring progress**:
- **Enso UI**: OrchestrationCard shows live task graph with status, agent names, and progress bar
- **Action log API**: `GET /api/action-log?count=50` — watch for `DAG: launching task` and `DAG: task X completed` entries
- **Output files**: `server/.orchestration-output-*.md` appear as each task completes (cleaned up on sprint completion)
- **Sprint archive**: After completion, all artifacts archived to `~/.enso/projects/<id>/sprints/sprint-<timestamp>/`

**Viewing sprint history**: Type `/evolution-history` to browse all past sprints with interactive dashboards, persona reports, implementation details, and validation results across 6 tabs.

**Evaluating sprint quality**:
- **Sprint score** (in meta-review): PL's overall assessment (target: 8.0+)
- **Persona score deltas**: Before/after ratings from re-tests — the only objective measure of improvement
- **Build status**: Must PASS (TypeScript clean, zero errors)
- **Review verdict**: PASS/FAIL from the reviewer agent
- **Enhancement hit rate**: % of planned enhancements actually implemented

**Gateway restart procedure** (required after plugin source changes):
```bash
# All 3 steps required — skipping any step may load stale code
taskkill //F //IM node.exe          # 1. Kill ALL node processes
rm -rf "C:/Users/Administrator/AppData/Local/Temp/tsx-Administrator"  # 2. Clear tsx cache
openclaw gateway start              # 3. Restart gateway
```

**Known limitations**:
- Backend changes (task-router, researcher-tools) cannot be validated by personas without a gateway restart mid-sprint
- Personas may capture stale context from prior test sessions — a "New Conversation" button helps but session isolation is still imperfect
- The sprint cannot restart the gateway itself (safety rule), so accumulated backend fixes are only verifiable in the NEXT sprint

#### Architecture

- `evolution.ts` — Sprint planning prompt builder (streamlined 7-phase structure), lifecycle management, sprint persistence. Passes `maxConcurrency: 6` and `planningModel: "opus"` to orchestrator
- `evolution-archive.ts` — Sprint archival (`archiveEvolutionSprint`), history listing, file retrieval, meta.json generation
- `project-manager.ts` — Project CRUD, default Enso project definition, `ensureDefaultProject()`
- `orchestrator-engine.ts` — DAG executor: Kahn's algorithm with semaphore-based concurrency, `readTaskSummary()` for structured context propagation, `extractVerdict()` for fix-verify loop, `blockDependents()` for failure cascading
- `orchestrator.ts` — Planning session (Claude Code), plan parsing, lifecycle. Threads `maxConcurrency` and `planningModel` to engine
- Sprint results delivered as bespoke interactive JSX dashboard on the orchestration card
- Key files: `evolution.ts`, `evolution-archive.ts`, `project-manager.ts`, `orchestrator-engine.ts` (backend); `OrchestrationCard.tsx`, `EvolutionHistoryCard.tsx` (frontend)

### Deep Research Pipeline

Standard research uses a two-phase streaming pipeline (Phase A: summary + findings in ~19s, Phase B: full analysis in ~30s) via the Gemini API. **Deep research** escalates to Claude Code for a fundamentally different output:

- **Trigger**: "Deep Dive" button on a research card, or task router auto-escalation when `depth === "deep"`
- **Pipeline**: `card.action(deep_dive)` → `setDeepResearchLauncher()` in card-actions → `handleDeepResearchBuild()` in build-via-claude.ts → Claude Code session (visible in terminal card)
- **Claude Code does two phases**: (1) 5-10 web searches + article reading for thorough research, (2) designs and writes a bespoke interactive JSX component tailored to the topic's nature
- **Output**: Single `.deep-research-ui.jsx` file with all research data embedded as `var` declarations — no app registration, no executors
- **Delivery**: Template is compile-checked with Sucrase (auto-fix via session resume if errors), then delivered as `generatedUI` on the original research card via `_generatedUI` field in tool result
- **`_generatedUI` interception**: Both `card-actions.ts` and `delivery.ts` check for `_generatedUI` in tool result data, extract it, and deliver as `generatedUI` on the card (bypassing template registry)
- **Topic-adaptive design**: Historical topics get timeline explorers, comparison topics get side-by-side panels with radar charts, location topics get area guides with ratings — each UI is custom-designed
- Key files: `build-via-claude.ts` (`handleDeepResearchBuild`, `buildDeepResearchUIPrompt`), `researcher-tools.ts` (deep research trigger), `card-actions.ts` (launcher setup + `_generatedUI` interception), `delivery.ts` (`_generatedUI` in auto-enhance)

### Claude Code Integration

- Trigger: `/code` opens project picker, then `/code <prompt>` sends prompts
- Backend spawns `claude.exe --output-format stream-json`, parses NDJSON, streams via WS
- Session resumption via `--resume <sessionId>`, `AskUserQuestion` tool renders as clickable buttons
- **Model picker**: Header dropdown lets user choose model + thinking mode (Opus/Sonnet/Haiku × Thinking/Fast). Persisted to localStorage, synced to server via `settings.set_model`. Only affects direct user Claude Code sessions; build/orchestrator sessions default to Opus.
- **Extended thinking**: When thinking mode is "adaptive", Claude's reasoning is streamed as `[think:start]`/`[think:end]` markers and rendered as collapsible purple sections in TerminalCard. Reduces perceived wait time by showing live reasoning.

### Remote Terminal (Shell)

- Trigger: `/shell` or the "Terminal" tile on the WelcomeCard
- Backend spawns a real PTY via `node-pty` (PowerShell on Windows, bash/zsh on macOS)
- Frontend renders with xterm.js (full ANSI color, cursor positioning, alternate screen buffer)
- Character-level I/O: keystrokes forwarded via `shell.input`, output streamed as `ServerMessage` deltas with `toolMeta.toolId === "shell"`
- Performance: PTY output written directly to xterm.js via `shellWriters` map, bypassing React state
- Key files: `shell-pty.ts` (backend), `ShellCard.tsx` (frontend), card type `"shell"`

### Task Progress & Notifications

Long-running tasks (builds, orchestrations, deep research, Claude Code sessions) use a multi-layer progress and notification system:

- **Progress bars with ETA**: `CardLoadingOverlay` shows elapsed time + determinate progress bar when duration is estimable (research ~35s, build ~2min). Indeterminate sliding bar for unpredictable operations. `ActivityIndicator` in terminal cards also shows elapsed time.
- **Background task bar**: `BackgroundTaskBar` component sits above ChatInput, showing compact pills for each active background task (terminal, orchestration, deep research, shell) with elapsed time + click-to-scroll. Typing indicator suppressed when only background tasks are running — the chat stays available.
- **Browser notifications** (web): When tab is not focused — Notification API, tab title flash, favicon badge dot, completion chime (Web Audio API two-tone C5→E5).
- **Mobile notifications** (Capacitor native): Haptic vibration + chime + in-app toast. Handles "return from background" via `wasRecentlyBackgrounded()` detection.
- **In-app toast banners**: `ToastContainer` component shows slide-down toast for all completions on both platforms. Auto-dismiss 5-8s, tap to dismiss.
- **Results inbox**: Slide-up sheet (`ResultsInbox`) accessible from header button with unseen badge count. Lists all completed long-running tasks with seen/unseen tracking (persisted to localStorage). One-tap scroll-to-card navigation.
- **Card context recovery**: After server restart, `tryReconstructContext()` in card-actions.ts recovers card contexts from the JSONL journal (`loadCardHistory`) — historical cards become interactive again without re-running the app.
- Key files: `src/lib/notifications.ts`, `src/lib/useElapsedTime.ts`, `src/components/ToastContainer.tsx`, `src/components/BackgroundTaskBar.tsx`, `src/components/ResultsInbox.tsx`, `server/src/outbound/card-actions.ts`

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
| **Shipped apps** | `server/apps/<family>/` | Promoted via Apps menu |

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

Frontend: React 19 + Zustand 5 + Tailwind CSS 4 + Recharts + Lucide + Sucrase + xterm.js + Vite 6. Backend: Express 4 + ws 8 + node-pty (standalone or started by OpenClaw). Language: TypeScript 5.7 strict, ESM. LLM: Gemini (via API key).

## Development

**All development on main branch directly** — no worktrees or feature branches.

```bash
npm run dev          # Frontend dev server (Vite :5173)
npm run dev:server   # Standalone backend server (Express + WS :3001)
npm run build        # Production build
```

The backend server runs on port 3001. Vite proxies `/ws`, `/media`, `/upload` to localhost:3001. Two modes:
- **Standalone**: Run `npm run dev:server` directly — no OpenClaw gateway needed.
- **OpenClaw plugin**: Run via `openclaw gateway start` with Enso plugin enabled — adds agent routing and tool sharing.

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

Recommended: **Cloudflare Tunnel** — each machine gets a fixed subdomain (e.g., `app.yourdomain.com`). See `server/SETUP.md` for full setup instructions.

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

- **Every new feature must be validated with a full end-to-end live test** before considering it complete. Build the code, deploy it (or run dev server), then exercise the feature through the actual UI to confirm it works with full functionality verified. Do not rely solely on successful compilation — always test the real user flow.
- All source is TypeScript with strict mode, ESM imports throughout
- Path alias: `@shared` → `./shared`
- Frontend uses functional React components with hooks
- State flows: WebSocket → Zustand store → React components
- Generated components are self-contained (no imports, deps injected via scope)
- Dark theme UI (Tailwind classes)
- Server and client share types via `shared/types.ts`
- Server logs use `[enso:inbound/outbound/enhance/action/build]` prefixes

## Logging & Error Tracking

### Centralized Action Log

Enso uses a centralized NDJSON log for all significant operations, errors, and fixes.

**Files:**
- `~/.openclaw/enso-action.log` — NDJSON, rotates at 1000 lines (keeps 800)
- `~/.openclaw/enso-fixes.json` — JSON array of bug fix records with acknowledgement tracking

**Implementation:** `server/src/action-log.ts`

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
