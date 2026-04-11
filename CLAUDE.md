# Enso — CLAUDE.md

> For detailed app building guides, API references, template rules, and code examples, see [CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md).

## Vision

**Enso is a deeply personal AI assistant that understands who you are, discovers what you care about, and mobilizes a full team of AI agents to help you make real progress on the goals that matter most.**

Every installation is self-hosted, open-source, and fully owned by the user — you own the factory, not just the product.

### The Arc: Understand → Focus → Execute

Enso follows a three-phase arc that compounds over time:

**1. Understand the user deeply** — Enso scans the user's digital life across 12 data sources (Kindle library, YouTube subscriptions, browser history, email, projects, Steam games, movies/TV, photos, Twitter/X, QQ Music, system apps). Each scan ingests content into the **Knowledge Cortex** — an interlinked wiki of 2000+ pages that builds a semantic map of who the user is, what they know, and what they're drawn to. Cross-source synthesis connects a Kindle book on quantitative finance to an AlphaRank project to a YouTube channel on systematic investing. The system sees patterns the user might not.

**2. Identify what matters** — From the Cortex, Enso infers **Focus Areas** — concrete, outcome-oriented goals the user is working toward. Not category labels ("Quantitative Finance") but actionable goals ("Develop AlphaRank into a Market-Beating Quant Tool"). Each focus has clarity levels (emerging → developing → clear), a deeper personal WHY, adjacent pursuits, and evidence grounded in the user's actual data. Focus areas are first-class Cortex citizens — their wiki pages accumulate everything: evaluation briefings, conversation insights, sprint results, and cross-references.

**3. Iterate: Evaluate → Discuss → Evolve** — Each focus area has a three-step iterative workflow:
   - **Evaluate**: An orchestration-powered deep study. Multiple AI agents (researcher, codebase analyst, synthesizer) work in parallel to gather web research, analyze project code and sprint history, cross-reference Cortex knowledge, and produce a comprehensive briefing. Progress is visible live in the Evolve tab.
   - **Discuss**: A clean strategic dialogue with the AI (no tool calls, no app cards — just focused thinking). The AI arrives prepared with the evaluation briefing and all Cortex context, acting as a co-strategist to flesh out the problem space, define success criteria, and build a clear vision.
   - **Evolve**: The full conversation context feeds into an `/Evolve` orchestration — a multi-agent sprint where a team of AI agents (Project Leader, Architect, Engineer, QA, and domain specialists) execute on the agreed goals. Each agent is a Claude Code session with role-specific prompts, coordinated through a DAG execution engine.
   This cycle repeats — each sprint's results feed back into the Cortex, refining the focus and informing the next evaluation.

This arc repeats and compounds: each sprint produces results that feed back into the Cortex, which refines the focus areas, which inform the next strategic dialogue, which shapes the next sprint. The system gets smarter about the user with every cycle.

### Core Architecture

- **Knowledge Cortex** — The single brain. Every data source scan, research result, conversation memory, and user profile lives as interlinked wiki pages at `~/.enso/wiki/` (Karpathy's LLM Wiki pattern). Cross-source synthesis finds semantic connections across all 12 sources. Daily discovery searches the web for top interests and emails a personalized intelligence briefing.
- **Conversation Context Registry** — A general-purpose framework where features (focus areas, projects, data sources) register as context providers for specific conversations. Enables context-aware system prompts, proactive messages on state changes, and event-driven triggers from external systems. Focus areas are the first consumer.
- **Adaptive answers** — Responses flow through a deterministic tool-to-UI pipeline: interactive research boards, data visualizations, photo studios, knowledge graphs — not walls of text. No LLM call needed for rendering. Focus conversations use a clean dialogue mode — pure text, no tool calls.
- **AI teams** — Complex goals are auto-decomposed into DAGs and executed by parallel Claude Code-powered agents with approval gates and shared context. Five agent roles: researcher, architect, builder, coder, reviewer.
- **Unified LLM layer** — Single `llm()` function for all LLM calls. Tier-based model selection (fast/utility/pro), auto API key resolution, built-in retry with backoff.
- **Self-evolving** — The platform includes Claude Code directly (`/code`), so it can build and modify itself from within. Every user-built app is dual-registered as both a UI experience and an agent-callable tool — the ecosystem compounds with use.
- **User owns the factory** — Each installation is a complete codebase with build tools. During setup, Claude Code personalizes the source code based on who the user is. The resulting APK is a custom app, not a configured generic one.

## Architecture Overview

Enso has two layers:

1. **React Frontend** — Browser-based chat UI (Vite + React 19 + Tailwind CSS 4 + Zustand), including a **conversation sidebar** for multiple persisted threads per client
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
├── components/               # TabNavigation, TasksView, EvolveView, ProjectsView, SettingsView, CardTimeline, CardContainer, ChatInput, ConversationSidebar, MarkdownText, ConnectionPicker, ToastContainer, BackgroundTaskBar
├── store/chat.ts             # Zustand state
├── lib/                      # ws-client, sandbox (Sucrase JSX→JS), enso-ui (17 components), connection manager, notifications, useElapsedTime
└── types.ts

server/                       # Enso server (the backend)
├── index.ts                  # Server/plugin entry
├── apps/                     # Shipped apps (checked into git)
│   ├── <appId>/              # app.json + template.jsx + executors/*.js
│   ├── cortex/               # Cortex Explorer (wiki dashboard, reader, graph, discovery, cross-reference)
│   ├── kindle/               # Kindle Library (data source + browse/search)
│   ├── youtube_manager/      # YouTube Manager (data source + browse/search)
│   ├── browser/              # Browser Data (history + bookmarks, unified)
│   ├── email_scanner/        # Email Scanner (data source + browse)
│   ├── projects/             # Projects Scanner (data source + browse)
│   └── system_info/          # System Info (data source + browse)
└── src/
    ├── channel.ts            # ChannelPlugin implementation
    ├── server.ts             # Express + WS server
    ├── inbound.ts            # Browser msg → OpenClaw dispatch
    ├── outbound.ts           # Barrel re-export (delivery, enhance, card actions, context)
    ├── outbound/             # Outbound submodules (card-actions, card-context, delivery, helpers)
    ├── llm.ts                # Unified LLM call layer (tier-based model, retry, timeout)
    ├── cortex-tools.ts       # Cortex wiki engine (ingest, search, read, lint, cross-reference)
    ├── cortex-synthesis.ts   # Cross-source synthesis engine (LLM-first intelligence)
    ├── cortex-direct-ingest.ts # Per-item Cortex page creation (zero-LLM)
    ├── cortex-enrichment.ts  # Post-ingest LLM semantic tagging + cross-source references
    ├── card-to-cortex.ts     # Auto-persist app cards as Cortex wiki pages
    ├── data-source-registry.ts # Centralized DATA_SOURCES descriptors
    ├── data-source-pipeline.ts # Post-scan auto-ingest to Cortex
    ├── onboarding.ts         # First-run data source onboarding flow
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
    ├── wechat.ts             # WeChat Official Account API (token mgmt, customer service msgs, mass send, followers)
    ├── wechat-tools.ts       # WeChat tools (enso_wechat_send, enso_wechat_followers)
    ├── wechat-webhook.ts     # WeChat webhook (server verification + message receiving + interaction tracking)
    ├── app-catalog.ts          # APP_CATALOG definitions (system + app entries)
    ├── tunnel-registry.ts    # Cloudflare tunnel provisioning for <name>.enso.net
    └── native-tools/         # App action bridge
        ├── registry.ts       # App tool discovery + template registry
        └── templates/        # Pre-built JSX templates per app

scripts/                       # Setup and maintenance scripts
├── personalize-prompt.md      # Claude Code prompt for deep UI personalization
├── personalize.cjs            # Deterministic fallback personalization (6 persona templates)
├── install.sh / install.ps1   # Legacy install scripts (superseded by ./setup)
└── qr-terminal.js             # QR code generator for mobile deep links

setup                          # One-command setup script (bash, macOS/Linux)
setup.ps1                      # One-command setup script (Windows PowerShell)

shared/types.ts               # Protocol types shared between frontend and server
```

## Key Concepts

### 7-Tab Universal Navigation

The app uses a **universal 7-tab navigation** that renders as a left rail on desktop and a bottom bar on mobile. Both platforms share the same tab state (`activeTab` in Zustand) and content views.

| Tab | Purpose | Key Components |
|-----|---------|---------------|
| **Chat** | Conversations with Enso | ConversationSidebar + CardTimeline + ChatInput + PinnedSidebar |
| **Cortex** | Knowledge browser — wiki pages, graph, discovery | CortexView (dashboard, reader, graph, search) |
| **Focus** | AI-inferred goals with deeper intention analysis | FocusView (list → detail with Overview/Activity/Plan tabs) |
| **Tasks** | Command center for active/completed/recoverable sessions | TasksView (polls `/api/sessions`) |
| **Evolve** | Self-evolution hub — evolve everything | EvolveView (quick actions, app ecosystem, sprint/discovery history) |
| **Projects** | External codebase management | ProjectsView (project list, import, detail with team/personas/sprints) |
| **Me** | Profile, connection, settings | SettingsView (connection, model picker, debug) |

- **Desktop**: `DesktopTabRail` (~56px left rail with icons + labels) + tab content fills remaining space
- **Mobile**: `MobileTabBar` (bottom bar, hides when inside a chat conversation)
- **State**: `activeTab` (which tab is shown), `chatViewOpen` (whether a conversation is open on mobile)
- **No desktop header**: All header functions (search, settings, apps menu, connection) are absorbed into their respective tabs
- Key files: `src/components/TabNavigation.tsx`, `src/components/FocusView.tsx`, `src/components/TasksView.tsx`, `src/components/EvolveView.tsx`, `src/components/ProjectsView.tsx`, `src/components/SettingsView.tsx`, `src/App.tsx`

### WebSocket Protocol

- **Multi-conversation**: `conversationId` on `chat.send`, `chat.history`, and other chat-scoped messages; card journals live per thread under `~/.enso/cards/<client>/` (`conversations.json` + `<conversationId>.jsonl`). REST: `/api/conversations` (CRUD + list). Client: `activeConversationId` in Zustand + `ConversationSidebar`.
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

### AI VC Discovery (`/discover`)

Enso includes an AI venture capital team that discovers high-potential project opportunities. The `/discover [focus]` command launches a 5-phase investment process: independent deal sourcing (3 partners with different lenses — demand signals, technology timing, competitive gaps) → pitch session → investment committee challenge (market timing, Enso advantage, feasibility, cost of entry) → deliverables (interactive dashboard + investment memo). Each recommendation receives a verdict: STRONG BUY / BUY / HOLD / PASS. Approved projects → import via Projects card → auto-generated AI team → evolution sprints. See [PROJECTS.md](PROJECTS.md) for full process.

- Key files: `discovery.ts` (VC team + planning prompt), `orchestrator.ts` + `orchestrator-engine.ts` (execution)
- Trigger: `/discover` command or "Discover" tile on WelcomeCard
- Protocol: `discovery.start` client message type
- Cost: ~$8-12 per discovery sprint, ~30 min runtime
- Output: Interactive `.orchestration-ui.jsx` dashboard + `investment-memo.md`

### Projects & Self-Evolution System

Enso can **import and manage any existing software project** — not just projects it created. Point Enso at a codebase, it scans the project, auto-generates a domain-specific AI team and customer personas, then evolves the project through autonomous sprints. See [PROJECTS.md](PROJECTS.md) for full guide.

#### Project Import & Team Generation

- **UI**: Projects tile → "Import Project" → enter name + codebase path → auto-generates team
- **API**: `POST /api/projects/create-with-team` with `projectId`, `projectName`, `codebasePath`
- **Team generator** (`team-generator.ts`): scans codebase (README, deps, structure), detects domain, generates 4 core agents + 1-3 domain specialists + 3-5 user personas via Gemini

#### Project Structure

Each project is stored at `~/.enso/projects/<projectId>/`:
- `project.json` — Project definition (vision, team agents, personas, goals)
- `sprints/` — Sprint history with full reports, dashboards, and deliverables
- `deliverables/` — Accumulated outputs (marketing materials, architecture docs, etc.)

#### Project Definition (`project.json`)

```json
{
  "id": "alpharank",
  "name": "AlphaRank",
  "vision": "AI-powered stock ranking system...",
  "codebasePath": "D:/Github/AlphaRank",
  "testCommand": "python -m pytest test/",
  "teamAgents": [...],     // Auto-generated domain-specific team
  "personas": [...],       // Auto-generated target user personas
  "validationPersonaIds": ["quant-investor", "passive-investor"]
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

#### Orchestration Workspace

All orchestration artifacts (task outputs, persona scripts, screenshots, dashboards) are managed in a workspace directory — never scattered across the project root.

- **Location**: `~/.enso/orchestrations/<orchestrationId>/` with subdirs: `outputs/`, `personas/`, `personas/screenshots/`
- **Lifecycle**: Created on orchestration start → agents write here during execution → archived (evolution) or cleaned up (regular) on completion → workspace persists on interruption for inspection/resume
- **Module**: `server/src/orchestration-workspace.ts` — `createWorkspace()`, `getWorkspace()`, `listWorkspaces()`, workspace path resolvers (`taskOutputPath`, `personaReportPath`, `dashboardPath`, etc.)
- **Legacy fallback**: `readTaskSummary()` and `findBespokeUIFile()` check workspace paths first, fall back to legacy `server/.orchestration-*` paths for backward compatibility

#### Session Registry & Management Dashboard

Centralized tracking of all active Claude Code sessions and orchestrations with REST API and frontend dashboard.

- **Registry**: `server/src/session-registry.ts` — `registerSession()`, `unregisterSession()`, `registerOrchestration()`, `getSystemStatus()`
- **Hooks**: `claude-code.ts` registers/unregisters on session start/end; `orchestrator.ts` registers orchestrations with task count tracking
- **REST API**:
  - `GET /api/sessions` — all sessions + orchestrations
  - `DELETE /api/sessions/:runId` — cancel a Claude Code session
  - `GET /api/orchestrations/active` — active orchestrations
  - `DELETE /api/orchestrations/:id` — cancel orchestration
  - `POST /api/orchestrations/:id/pause` — pause orchestration
  - `GET /api/orchestrations/recoverable` — interrupted orchestrations that can be resumed
- **Frontend**: `/sessions` command or "Sessions" tile on WelcomeCard → `SessionDashboardCard` with live polling, stop/pause/resume controls
- **Resume after restart**: `handleOrchestrationResume()` supports lazy recovery — if orchestration is not in memory (e.g., after server restart), rebuilds from persisted plan on disk, reconstructs shared context from completed task outputs
- Key files: `session-registry.ts`, `orchestration-workspace.ts` (backend), `SessionDashboardCard.tsx` (frontend)

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

### Knowledge Cortex (The Brain)

Cortex is the ONLY brain — all knowledge, memory, profile, and data source content live as interlinked wiki pages at `~/.enso/wiki/`. Based on Karpathy's "LLM Wiki" pattern — instead of re-deriving knowledge via RAG, the LLM incrementally builds interlinked markdown pages. `buildEnsoContext()` reads only from Cortex; there are no separate memory or profile stores.

- **Wiki engine** (`server/src/cortex-tools.ts`): 7 agent tools (`enso_wiki_search`, `enso_wiki_read`, `enso_wiki_ingest`, `enso_wiki_list`, `enso_wiki_lint`, `enso_wiki_import_sources`, `enso_cross_reference`). LLM-powered ingest pipeline creates entity/synthesis pages from any source. Two-layer architecture: entities (external world) + synthesis (system-created). Enhanced index with `source` and `themes` fields for targeted retrieval. `enso_wiki_search` supports `source` and `theme` filters.
- **Synthesis engine** (`server/src/cortex-synthesis.ts`): LLM-first cross-source intelligence. `synthesize(topic)` sends full data inventory to LLM for semantic connection finding across books, movies, games, YouTube, projects, photos, music. `findRelatedContent(topic)` provides fast keyword pre-filter (zero LLM). `generateThematicMap()` creates deep cross-cutting life theme analysis. `buildDataInventory()` compiles compact view of all 12 data sources for LLM context.
- **Storage**: `~/.enso/wiki/` with `_index.md` (machine-parseable catalog), `_log.md` (operation log), and two subdirs: `entities/` (external world — books, games, movies, people, places, channels) + `synthesis/` (system-created — ideas, articles, apps, projects, reports, profile, memory). The rule: entities have external identity (ISBN, IMDB, Steam ID); synthesis is everything Enso produced. Cross-references are transparent across both layers — a book connects to an idea, a game to a project. Each entity type has a home app for lifecycle management.
- **Protected pages**: `synthesis/user-profile.md` (user identity, role, interests — rebuilt from data source scans), `synthesis/conversation-memory.md` (persistent memory across conversations). These are the primary context sources for agent prompts.
- **Data source content**: Each data source scan creates per-item wiki pages (e.g., `entities/kindle-<title>.md`, `entities/project-<name>.md`) via the direct ingest pipeline — zero LLM cost per item.
- **Cross-source enrichment** (`server/src/cortex-enrichment.ts`): Post-ingest LLM pipeline that runs at scan time (not runtime). Two phases: (1) `enrichNewEntities()` adds 3-5 universal semantic tags per entity via Gemini Flash (e.g., "coming-of-age", "dystopia", "survival" — themes that transcend source boundaries), (2) `crossReferenceNewEntities()` discovers explicit cross-source relationships by sending new entities + full inventory to LLM. Both stored on `EntityIndexEntry` (`semanticTags`, `crossReferences`). Backfill via `POST /api/cortex-enrich`.
- **3-tier related items** (`entity-model.ts`): Entity detail pages find related items using: (1) pre-computed cross-references with LLM-generated reasons, (2) semantic tag overlap (LLM-derived universal tags), (3) regular tag overlap with source-identifier exclusion. Source tags (`kindle`, `steam`, `youtube`, etc.) are excluded from overlap to prevent same-source bias.
- **LLM ingest**: Rich content (research results, manual knowledge) goes through the full LLM ingest pipeline for AI-organized entity/synthesis pages.
- **Context injection**: `getWikiContextSummary()` injected into `buildEnsoContext()` so the agent knows accumulated knowledge.
- **Auto-persist app cards**: `card-to-cortex.ts` automatically persists significant app card results (research, analysis) as Cortex wiki pages.
- **Cortex Explorer app** (`server/apps/cortex/`): Shipped app with 8 executors:
  - `explore` (dashboard: stats, top entities, gaps), `read` (article viewer with backlinks), `search`, `graph` (treemap visualization), `discover` (web search + AI branch suggestions), `ingest`, `digest` (AI knowledge summary), `daily_discovery` (scheduled task)
- **Daily Discovery**: Scheduled task (`cortex-daily-discovery`) that searches the web for top Cortex topics, uses AI to filter/analyze/categorize findings with personalized relevance, ingests into wiki, and emails an HTML intelligence briefing.
- **Context injection** (`memory-bridge.ts`): `buildEnsoContext()` injects data source inventory (book/movie/game/photo counts), theme-based Cortex summary (1500 chars), and cross-reference instructions into every agent conversation.
- **Research integration** (`researcher-tools.ts`): Every research result includes `cortexSynthesis` — auto cross-references topic against personal library with LLM narrative.
- **Morning briefing** (`daily_discovery.js`): 9-section daily email: executive summary, findings, On This Day (photo memories), Fresh Videos (YouTube), Library stats, Project Pulse, Knowledge Growth, From Your Brain (cross-source synthesis), Blind Spots.
- **Active intelligence** (`proactive-engine.ts`): 5 cross-app suggestion types: trending convergence (YouTube), knowledge gaps, cross-source connections, photo memories, stale project alerts.
- Key files: `cortex-tools.ts` (engine), `cortex-synthesis.ts` (LLM synthesis), `cortex-direct-ingest.ts` (per-item pages), `cortex-enrichment.ts` (semantic tags + cross-refs), `card-to-cortex.ts` (auto-persist), `server/apps/cortex/` (app), `memory-bridge.ts` (context injection), `proactive-engine.ts` (active intelligence)

### Focus Areas (AI-Inferred Goals)

Focus Areas is the bridge between understanding the user (Cortex) and taking action (Evolve). The system infers what the user cares about, then provides a dedicated strategic dialogue to refine each focus until it's ready for execution.

**Three-phase lifecycle:**
1. **Infer** — `inferFocusAreas()` analyzes the full Cortex data inventory to produce 4-7 focus areas with evidence, intent, deeper motivation, and adjacent pursuits. Outcome-oriented: "Develop AlphaRank into a Market-Beating Quant Tool", not "Quantitative Finance".
2. **Refine through dialogue** — Each focus has a dedicated conversation (via "Chat about this" button). These conversations use **clean dialogue mode**: no tool calls, no app cards — just the AI acting as a co-strategist with rich context from 3 zero-LLM data layers (focus state, related Cortex pages, cross-source hits). The AI's behavior adapts to clarity level:
   - **Emerging** → Discovery: explore the problem space, uncover the personal WHY
   - **Developing** → Definition: define success criteria, break down the problem, identify priorities
   - **Clear** → Execution planning: plan the next sprint, review progress, prep an Evolve brief
   After each exchange, `refineFocusFromConversation()` uses LLM fast tier to detect goals, deadlines, or motivations and progressively upgrade clarity (emerging → developing → clear).
3. **Execute via Evolve** — When the strategic dialogue has produced enough clarity, the full conversation context feeds into an `/Evolve` orchestration sprint. The AI team (Project Leader, Architect, Engineer, QA, domain specialists) executes on the agreed goals with the user's validated vision as the brief.

**Architecture:**
- **Conversation Context Registry** (`conversation-context.ts`): General-purpose framework where features register as context providers for specific conversations. `FocusContextProvider` (`focus-context-provider.ts`) is the first consumer — injects rich context, generates proactive messages (quiet focus nudges, new related content, clarity upgrades), handles events from Cortex ingest and research completion.
- **Sidebar grouping**: Focus conversations appear under a "FOCUS AREAS" section with violet styling, visually separated from regular "CHATS". Context metadata (`ConversationContext`) persisted on each conversation.
- **Deeper intention**: Each focus has a `deeperIntent` (the personal WHY) and `adjacentPursuits` (unexplored directions aligned with the deeper motivation).
- **Cortex-native**: Goals stored as wiki pages at `~/.enso/wiki/focuses/<goal-slug>.md` with intent, deeper motivation, evidence, and refinement history. Cross-referenceable with all Cortex entities.
- **REST API**: `GET /api/focus-areas`, `POST /api/focus-areas/infer`, `PATCH /api/focus-areas/:id`, `POST /api/focus-areas/:id/plan`
- **UI**: Focus tab (3rd position) with list → detail flow. Detail has three tabs:
  - **Work**: Evaluate → Discuss → Evolve workflow buttons, editable goal/motivation, next steps, adjacent pursuits
  - **Cortex**: Rich knowledge view — evaluation briefing, evidence grouped by source with icons, related Cortex entities grouped by source, adjacent pursuits, refinement journey timeline
  - **Evolve**: Live sprint monitoring — orchestration progress bar, active agent sessions, elapsed time
- **Proactive**: Focus-aware suggestions in proactive engine + event-driven via Conversation Context Registry — quiet areas get nudges, new related Cortex entities trigger insights, clarity upgrades get celebrated.
- Key files: `focus-areas.ts` (engine), `focus-context-provider.ts` (context provider), `conversation-context.ts` (registry), `standalone-agent.ts` (dialogue mode), `FocusView.tsx` (UI), `ConversationSidebar.tsx` (grouping)

### Conversation Context Registry

A general-purpose framework for context-aware conversations. Features register as context providers for specific conversations, enabling three capabilities:

1. **Context injection** — `getContextForPrompt()` injects rich context into the agent's system prompt so it knows what the conversation is about
2. **Proactive messages** — `getProactiveMessages()` checks for state changes (focus going quiet, new related content) and delivers unsolicited messages to the conversation
3. **Event-driven triggers** — `onEvent()` handles external events (Cortex entity created, research completed, focus refined) and surfaces relevant insights

**Implementation:** `conversation-context.ts` exports a singleton `contextRegistry`. Providers implement `ConversationContextProvider` interface. Events emitted from `cortex-enrichment.ts`, `researcher-tools.ts`, and `focus-areas.ts`. Proactive delivery loop in `server.ts` checks every 60s and delivers via `persistCard()` + WebSocket push. Dedup with 1h TTL prevents message spam.

**Consumers:** `FocusContextProvider` (focus-context-provider.ts) is the first consumer. Future consumers: project conversations, data source monitoring threads.

**Sidebar visual grouping:** Conversations with context metadata appear grouped by type in the sidebar — "FOCUS AREAS" (violet), "PROJECTS" (emerald), regular "CHATS" below. Each group has distinct icons and active-state colors. Context stored as `ConversationContext` on `ConversationSummary`.

- Key files: `conversation-context.ts` (registry + interfaces), `focus-context-provider.ts` (focus consumer), `standalone-agent.ts` (prompt injection + dialogue mode), `server.ts` (proactive loop + event emission), `memory-bridge.ts` (ConversationContext type), `ConversationSidebar.tsx` (visual grouping)

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

### Multi-Language (i18n)

- **Locale state**: Stored in Zustand (`language: "en" | "zh"`), persisted to `localStorage("enso_language")`, synced to backend via `settings.set_language` WS message
- **Translation files**: `src/lib/i18n/en.json` and `zh.json` — flat key-value dictionaries (~100 keys each)
- **Core module**: `src/lib/i18n/index.ts` — `t(key)` function, `useT()` React hook (uses `useSyncExternalStore`), `_setLocale()` for store sync
- **Settings UI**: `SettingsPanel.tsx` — consolidated gear icon dropdown with Language toggle (EN | 中文) + Claude Code Model picker (replaces old ModelPicker)
- **Components translated**: WelcomeCard, ChatInput, CardTimeline, BackgroundTaskBar, AppBuilderDialog, DynamicUICard
- **Adding a new language**: Create `src/lib/i18n/<code>.json`, add to `SUPPORTED_LOCALES` and `LOCALE_LABELS` in index.ts, add validation in `server.ts` settings handler

### Data Sources (Unified Architecture)

Consent-gated system that scans the user's desktop environment, ingests content into Cortex, and provides browsable app UIs for each source. All data stays local.

#### Registry & Pipeline

- **`DATA_SOURCES` registry** (`data-source-registry.ts`): Centralized descriptor for each source. Each entry declares `id`, `scan()` function, `formatForProfile()` (compact summary for user profile page), `formatForCortex()` (rich content for LLM ingest), and `getDirectIngestPages()` (per-item wiki pages created without LLM).
- **Post-scan pipeline** (`data-source-pipeline.ts`): After any scan completes, the pipeline auto-detects changes vs. previous scan, creates per-item Cortex pages via direct ingest, and triggers LLM ingest for the profile/summary content.
- **Onboarding** (`onboarding.ts`): First-run flow that guides users through enabling data sources and runs initial scans.

#### 7 Data Sources

| Source | App | Scan Method | Per-Item Pages |
|--------|-----|-------------|----------------|
| **Browser** | `server/apps/browser/` | SQLite (Chrome/Edge history + bookmarks) | Top sites, bookmark folders |
| **Email** | `server/apps/email_scanner/` | Outlook COM / Himalaya CLI | — |
| **Files** | `server/apps/projects/` | Project detection (package.json, .git) | Per-project pages |
| **System** | `server/apps/system_info/` | Installed apps + running processes | — |
| **Kindle** | `server/apps/kindle/` | My Clippings.txt parser | Per-book pages with highlights |
| **YouTube** | `server/apps/youtube_manager/` | YouTube Data API v3 | Per-channel pages |
| **Steam** | `server/apps/steam/` | ACF manifest parsing | Per-game pages with genres, metacritic |
| **Movies/TV** | `server/apps/movies_tv/` | Filesystem scan + TMDB API | Per-movie/show pages with posters, cast |
| **Photos** | `server/apps/photo_library/` | Filesystem + EXIF parser | Per-album pages with date/camera |
| **Twitter/X** | `server/apps/twitter/` | Puppeteer (persistent session) | Per-account pages |
| **QQ Music** | `server/apps/qq_music/` | Puppeteer + local file scan | Per-artist pages |

#### Data Source as App Pattern

Each data source is also a full Enso app with its own UI. The pattern (`server/apps/kindle/` as canonical example):
- `app.json` — tool definitions (scan, browse, search, enrich)
- `template.jsx` — browsable UI with tabs for library, highlights, search
- `executors/scan.js` — runs the scan, returns structured data
- `executors/browse.js` — paginated browsing of scanned content
- `executors/search.js` — full-text search across scanned data

**Adding a new data source** = create one app directory + add one entry to `DATA_SOURCES` in `data-source-registry.ts`.

- **Profile builder** (`user-context-builder.ts`): Runs all consented scanners, reduces via `formatForProfile()`, synthesizes into Cortex profile page via LLM
- **Storage**: `~/.enso/data/user-context/` — `consent.json`, `profile.json`, `scan-log.json`, `cache/*.json`
- **Settings UI**: Settings > Data Sources tab — per-source toggles
- Key files: `data-source-registry.ts`, `data-source-pipeline.ts`, `cortex-direct-ingest.ts`, `user-context-builder.ts`, `onboarding.ts` (backend); `SettingsPanel.tsx` DataSourcesSection (frontend)

### Unified LLM Layer

Single entry point for all LLM calls across the platform, replacing scattered direct API calls.

- **Module**: `server/src/llm.ts` — exports `llm(prompt, opts?)` function
- **Tier-based model selection**: `fast` (Gemini Flash — classification, summaries), `utility` (default — ingest, synthesis), `pro` (Opus-class — planning, complex reasoning)
- **Auto API key resolution**: reads from environment, no per-call key management
- **Built-in retry**: exponential backoff on transient failures, configurable timeout
- Used by: Cortex ingest pipeline, data source profile builder, task router, UI generator, team generator

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

### APP_CATALOG Integrity Rule

Every non-terminal entry in `APP_CATALOG` (`server/src/app-catalog.ts`) **must** have a UI template or it will appear callable in the client but render raw JSON. There are exactly two valid ways to provide a template:

1. **Shipped app** — `server/apps/<appId>/app.json` + `template.jsx` exists (preferred for anything with a rich UI)
2. **Native template** — a `ToolTemplate` registered via `registerToolTemplate()` in `native-tools/templates/*.ts` (for deeply integrated system tools like filesystem, researcher)

**Never add an APP_CATALOG entry without immediately providing one of these.** The server logs a startup warning for any orphan entries — check `[enso] ⚠️ APP_CATALOG integrity` in the console if something looks broken.

Also: `server/apps/` is for **shipped/promoted apps only** (git-tracked). User-built apps go to `~/.enso/apps/` automatically. The build pipeline (`build-via-claude.ts`) writes there by default — do not change it to write to `server/apps/`.

### Critical Rules (Quick Reference)

- Every tool's result data MUST include `"tool": "enso_<family>_<suffix>"` field
- All parameter schemas MUST have `additionalProperties: false`
- Exactly one tool per family must have `isPrimary: true`
- Executors are function bodies (no imports/exports), use `var` not `const`/`let`
- Templates are JSX strings (no imports), all hooks at top level (never in conditionals)
- Template sandbox has: React hooks, Recharts, Lucide icons, EnsoUI — no DOM/fetch/globals
- Use `EnsoUI.Tooltip` (not `Tooltip` which is Recharts)

## Tech Stack

Frontend: React 19 + Zustand 5 + Tailwind CSS 4 + Recharts + Lucide + Sucrase + xterm.js + Vite 6. Backend: Express 4 + ws 8 + node-pty (standalone or started by OpenClaw). Language: TypeScript 5.7 strict, ESM. LLM: Gemini (via API key). Unified LLM: `llm()` in `server/src/llm.ts` — auto-resolves API keys, tier-based model selection (fast/utility/pro), retry with backoff.

## One-Command Setup

New users get a complete environment with a single command. See [SETUP.md](SETUP.md) for full details.

```bash
./setup           # macOS/Linux
.\setup.ps1       # Windows
```

The setup script handles everything interactively:
1. **Install location** — user chooses where the source lives (default `~/Enso`)
2. **Dependencies** — Node.js check, `npm install`
3. **Chat AI model** — choose from 6 LLM providers (Gemini, OpenAI, Anthropic, DeepSeek, Ollama, OpenRouter)
4. **Service API keys** — Brave Search for web research
5. **Claude Code** — install CLI + authenticate (API key, OAuth/subscription, or skip)
6. **Remote access** — automatic `<name>.enso.net` tunnel via Cloudflare (calls tunnel registry API on master instance)
7. **App personalization** — user answers 3 questions (name, role, app name), Claude Code redesigns the UI
8. **Build** — frontend + APK (installs JDK 21 + Android SDK if needed)
9. **Server start** — guardian-supervised with watchdog

Non-interactive mode via environment variables: `ENSO_LLM_CHOICE=1 ENSO_USER_ROLE="developer" ./setup`

### App Personalization

During setup, the user's role drives **deep source code customization** via Claude Code:
- Claude Code reads the user's profile and directly modifies `App.tsx`, `WelcomeCard.tsx`, `en.json`, `manifest.json`, `capacitor.config.ts`
- Not theming or config — actual source code changes committed to the user's repo
- Each persona gets a fundamentally different welcome screen layout, domain-specific prompts, reordered tools
- Examples: "Atlas" (founder) gets a command center with tabbed deal flow panels; "Signal" (investor) gets a Bloomberg-terminal aesthetic with monospace headers; "Nexus" (researcher) gets a literature-focused deep dive layout

The deterministic fallback (`scripts/personalize.cjs`) runs if Claude Code isn't available, matching against 6 persona templates: `tech-founder`, `developer`, `researcher`, `investor`, `creative`, `product-manager`.

See [PERSONALIZATION-SHOWCASE.md](PERSONALIZATION-SHOWCASE.md) for examples of all 6 persona apps.

Key files: `setup` (bash entry point), `scripts/personalize-prompt.md` (Claude Code prompt), `scripts/personalize.cjs` (fallback)

### APK Auto-Connect

During setup, the server's URL and access token are baked into the frontend build via Vite `define`:
- `__ENSO_DEFAULT_BACKEND__`, `__ENSO_DEFAULT_TOKEN__`, `__ENSO_DEFAULT_NAME__` in `vite.config.ts`
- `App.tsx` checks these on first native launch — if present, auto-creates a backend entry and connects immediately, bypassing the SetupWizard
- The resulting APK connects to the server that built it with zero user configuration

### Tunnel Registry

A master Enso instance can provision Cloudflare tunnels for other installations, giving each a `<name>.enso.net` subdomain.

- **File**: `server/src/tunnel-registry.ts`
- **Activation**: Only mounts when `CLOUDFLARE_API_TOKEN` env var is set
- **Endpoints**: `GET /api/tunnel/check`, `POST /api/tunnel/register`, `DELETE /api/tunnel/:specifier`, `GET /api/tunnel/list`
- **Required env vars** (master only): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`
- **Registry file**: `~/.enso/tunnel-registry.json`

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
