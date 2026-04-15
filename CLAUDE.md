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
2. **Enso Server (Backend)** — Standalone Express + WS server providing deterministic tool-to-template rendering + Claude Code integration. Entry: `server/standalone.ts` (dev) or `server/guardian.ts` (production).

### Data Flow

- **Normal chat (Q&A)**: Browser → WS → standalone agent (`standalone-agent.ts`, Gemini) → text response → `deliverEnsoReply` → text card
- **Normal chat (tool use)**: Agent calls a tool registered via `registerLocalTool()` → result captured → `deliverEnsoReply` → text card + auto-enhance via `consumeRecentToolCall()` → app card rendered alongside text (no extra LLM call)
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
├── standalone.ts             # Dev entry — boots Express + WS standalone
├── guardian.ts               # Production entry — supervises standalone with watchdog
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
    ├── server.ts             # Express + WS server
    ├── standalone-agent.ts   # Gemini-powered agent loop (chat, tool use, hooks)
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
    ├── team-leader.ts        # Team Leader agent — the living organization (gather → assess → execute → brief → deliver)
    ├── focus-agent.ts        # Focus utilities — analyzeFocusAreas, generateProgressPulse, deliverSprintResults
    ├── reacts.ts             # Async react system — email/WeChat/web feedback → queue → TL processes
    ├── wechat.ts             # WeChat Official Account API (token mgmt, customer service msgs, mass send, followers)
    ├── wechat-tools.ts       # WeChat tools (enso_wechat_send, enso_wechat_followers)
    ├── wechat-webhook.ts     # WeChat webhook (server verification + message receiving + react capture)
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

### 6-Tab Universal Navigation

The app uses a **universal 6-tab navigation** that renders as a left rail on desktop and a bottom bar on mobile. Both platforms share the same tab state (`activeTab` in Zustand) and content views.

| Tab | Purpose | Key Components |
|-----|---------|---------------|
| **Chat** | Conversations with Enso | ConversationSidebar + CardTimeline + ChatInput + PinnedSidebar |
| **Cortex** | Knowledge browser — wiki pages, graph, discovery | CortexView (dashboard, reader, graph, search) |
| **Focus** | AI-inferred goals with expert teams and typed focus areas | FocusView (list → detail with Work/Cortex/Experts/Evolve tabs) |
| **Tasks** | Team Leader command center + scheduled tasks | TasksView (TL dashboard at top + scheduled tasks below) |
| **Evolve** | Self-evolution hub — evolve everything | EvolveView (quick actions, app ecosystem, sprint/discovery history) |
| **Me** | Profile, connection, settings | SettingsView (connection, model picker, debug) |

- **Desktop**: `DesktopTabRail` (~56px left rail with icons + labels) + tab content fills remaining space
- **Mobile**: `MobileTabBar` (bottom bar, hides when inside a chat conversation)
- **State**: `activeTab` (which tab is shown), `chatViewOpen` (whether a conversation is open on mobile)
- **No desktop header**: All header functions (search, settings, apps menu, connection) are absorbed into their respective tabs
- **Projects tab removed**: Project-type focus areas cover all project capabilities (team agents, codebase analysis, evolution sprints). `ProjectsView` code remains accessible via `/projects` command.
- Key files: `src/components/TabNavigation.tsx`, `src/components/FocusView.tsx`, `src/components/TasksView.tsx`, `src/components/EvolveView.tsx`, `src/components/SettingsView.tsx`, `src/App.tsx`

### WebSocket Protocol

- **Multi-conversation**: `conversationId` on `chat.send`, `chat.history`, etc.; card journals live per thread under `~/.enso/cards/<client>/` (`conversations.json` + `<conversationId>.jsonl`). REST: `/api/conversations` (CRUD + list). Client: `activeConversationId` in Zustand + `ConversationSidebar`.
- `chat.send` with `routing.toolId: "claude-code"` bypasses the agent, spawns CLI directly
- `shell.*` messages manage PTY sessions — `toolMeta.toolId === "shell"` routes to ShellCard
- `card.action` carries `cardId`, `cardAction`, `cardPayload` — dispatched via four-path resolution

> Full `ClientMessage` / `ServerMessage` field enumeration in [CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md#websocket-protocol-full-details). Authoritative types in `shared/types.ts`.

### Multi-Block Response Handling

1. Stable card ID generated before dispatch — all blocks reference same card
2. Each block's text collected into `AgentStep[]` with sequence numbers
3. Card's `text` set to last block (final answer); earlier blocks in `steps`
4. Frontend shows expandable "N agent steps" toggle when 2+ steps

### App Enhancement (Four Flows)

- **Auto-Enhance**: When the agent calls a registered tool, `deliverEnsoReply()` checks `consumeRecentToolCall()` and automatically renders the app card alongside the text response. No LLM call needed — deterministic based on tool usage. Replaces the old background `selectToolForContent()` LLM call + `enhanceHint` approach.
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

Enso can **import and manage any existing software project** — scan a codebase, auto-generate a domain-specific AI team + customer personas, then evolve the project through autonomous sprints. Each project gets its own AI team and persona-driven validation loop.

> **Full operational guide:** See **[PROJECTS.md](PROJECTS.md)** for the complete system — VC discovery (`/discover`), import flow, team/persona generation, the 7-phase evolution sprint pipeline, sprint design rationale (PL triage gate, merged synthesis, fix-verify loop), monitoring procedures, and known limitations.

**Quick reference:**
- **Triggers**: `/evolve`, `/discover`, `/evolution-history`, `/sessions`
- **Storage**: `~/.enso/projects/<id>/` (definition + sprints), `~/.enso/orchestrations/<id>/` (live workspace)
- **Sprint planner**: Claude Opus with adaptive thinking; up to 6 parallel Claude Code sessions; ~55-65 min per sprint
- **Safety rule**: Implementation tasks are forbidden from restarting servers, pushing to git, or modifying versions
- **Context propagation**: Tasks emit `<!-- STRUCTURED_SUMMARY {JSON} -->` blocks; the engine parses these to inject compact context into downstream tasks
- **Resume after restart**: `handleOrchestrationResume()` rebuilds interrupted sprints from persisted plan + completed task outputs

**Session registry** — REST API for managing live sessions/orchestrations:
- `GET /api/sessions`, `DELETE /api/sessions/:runId`
- `GET /api/orchestrations/active`, `POST /api/orchestrations/:id/pause`, `DELETE /api/orchestrations/:id`
- `GET /api/orchestrations/recoverable` — interrupted orchestrations available for resume
- Frontend: `SessionDashboardCard.tsx` (`/sessions` command)

- Key files: `evolution.ts`, `evolution-archive.ts`, `project-manager.ts`, `team-generator.ts`, `orchestrator.ts`, `orchestrator-engine.ts`, `orchestration-workspace.ts`, `session-registry.ts` (backend); `OrchestrationCard.tsx`, `EvolutionHistoryCard.tsx`, `SessionDashboardCard.tsx` (frontend)

### Knowledge Cortex (The Brain)

> **Full architecture:** See **[CORTEX.md](CORTEX.md)** for the complete Cortex system — two-layer wiki architecture, ingest pipelines (direct + LLM), cross-source enrichment, 3-tier related-items algorithm, 13 data sources, Cortex Explorer app, Daily Discovery briefing, context injection, and REST endpoints.

Cortex is the ONLY brain — all knowledge, memory, profile, focus goals, sprint deliverables, and data source content live as interlinked wiki pages at `~/.enso/wiki/`. Based on Karpathy's "LLM Wiki" pattern: the LLM incrementally builds and maintains an interlinked markdown corpus instead of re-deriving knowledge via RAG. `buildEnsoContext()` (in `memory-bridge.ts`) reads only from Cortex — there are no separate memory, profile, or RAG stores.

**Two-layer rule:**
- **`entities/`** — external identity (ISBN, IMDB, Steam ID, YouTube channel ID). 14 types: book, game, movie, tv-series, documentary, album, photo, song, playlist, artist, channel, video, project, article, place, person, twitter-account.
- **`synthesis/`** — system-created (ideas, articles, apps, projects, reports, profile, memory). 5 types: idea, synthesis, app, and the protected `user-profile.md` + `conversation-memory.md`.
- **`focuses/`** — focus-area goals + per-focus expert pages.

**Key agent tools** (in `cortex-tools.ts`): `enso_wiki_search`, `enso_wiki_read`, `enso_wiki_ingest`, `enso_wiki_list`, `enso_wiki_lint`, `enso_wiki_import_sources`, `enso_cross_reference`.

**Key endpoints:** `POST /api/cortex-enrich` (backfill), `GET /api/cortex-stats`, `GET /api/cortex-pulse`, `POST /api/cortex-direct-ingest`, `POST /api/cortex/action`.

- Key files: `cortex-tools.ts` (engine), `cortex-synthesis.ts` (LLM synthesis), `cortex-direct-ingest.ts` (per-item pages, zero LLM), `cortex-enrichment.ts` (semantic tags + cross-refs at scan time), `card-to-cortex.ts` (auto-persist), `memory-bridge.ts` (context injection), `proactive-engine.ts` (active intelligence), `entity-model.ts` (3-tier related items), `server/apps/cortex/` (Explorer app)

### Team Leader — The Living Organization

> **Full operational guide:** See **[TEAM-LEADER.md](TEAM-LEADER.md)** for the complete Team Leader architecture — daily routine pipeline, autonomous focus evolution cycle, expert team management, background task tracking, auto-restart, and autonomy policy.

Enso runs as a **living organization** with a single Team Leader (TL) agent that coordinates everything. The TL wakes up on a configurable schedule, surveys the entire system, staffs expert teams, drives focus evolution cycles autonomously, and only surfaces items to the user when their brain is genuinely needed.

**The TL's north star:** "Make this user's life better, every single day." Whether that means delivering a focus pulse, fixing a platform bug, launching an evolution sprint, or restructuring an expert team — the TL handles it all.

**Morning routine** (configurable, default 9am daily):
1. **Gather signals** — Action log errors, focus area state, Cortex health, scheduled task results, user reacts, platform metrics. Zero LLM cost.
2. **Assess & prioritize** — Single LLM call sees ALL signals, produces 3-7 prioritized actions with reasoning. Each action has: priority (critical→low), type (user-task/platform-fix/platform-feature/maintenance), delegation target, effort estimate.
3. **Execute** — Auto-executes low-effort actions (≤5min by default). Proposes high-effort actions for user approval. Delegates to: focus utilities, Cortex enrichment, orchestration sprints.
4. **Brief the user** — One unified daily briefing delivered via email + WeChat + in-app. Replaces 8+ separate notification emails. Every notification includes react action buttons.
5. **Process reacts** — User feedback from previous notifications is incorporated into the assessment.

**Configuration** (`~/.enso/data/team-leader-config.json`):
- `schedule.morningRoutine` — cron for full routine (default: `"0 9 * * *"`)
- `schedule.checkIn` — cron for urgent scans (default: every 6h)
- `channels` — email/wechat/inApp toggles
- `autoExecuteMaxEffort` — threshold for autonomous action ("5min"/"30min"/"none")
- `autoEvolve` — whether TL can launch evolution sprints without approval

**REST API**: `GET/PATCH /api/team-leader/config`, `POST /api/team-leader/morning`, `POST /api/team-leader/checkin`, `GET /api/team-leader/briefing`, `GET /api/team-leader/state`

**Dashboard** (`/dashboard` command): `TeamLeaderCard.tsx` renders three tabs — Briefing (sections with items), Actions (each with priority/reasoning/delegation + react button), Reacts (history with resolution status).

- Key files: `team-leader.ts` (core agent), `focus-agent.ts` (focus utilities), `reacts.ts` (feedback loop), `TeamLeaderCard.tsx` (dashboard)

### React System (Async Feedback Loop)

Every notification Enso sends includes **react actions** — clickable buttons that let the user respond asynchronously without opening the app. Reacts feed back to the Team Leader (or any expert agent) for processing.

**Two modes:**
- **Reactive** — User responds to a TL-sent notification (email button, WeChat reply, web form)
- **Proactive** — User sends instructions to any agent directly from the UI with auto-attached context. Six context types: `card`, `focus`, `entity`, `sprint`, `deliverable`, `direct`

**Channels:**
- **Email**: Approve / Defer / Reply buttons. Approve/Defer hit `GET /api/reacts/quick?nid=<id>&action=approve`. Reply opens `/r/<id>` web form.
- **WeChat**: User replies to messages → webhook captures with notification context association.
- **Web form**: `/r/<notificationId>` — standalone HTML page with text input, no auth required.
- **In-app**: `POST /api/reacts` with optional `context` (direct) + optional `agentTarget` (TL or specific expert).

**Agent targeting:** Reacts can target any agent via `agentTarget`:
- `{ agent: "tl" }` — Team Leader (default)
- `{ agent: "expert", focusId, expertId }` — specific focus area expert
- `GET /api/agents` lists all available agents (TL + focus experts) for the frontend dropdown

**In-app touchpoints** (5 places to send reacts with context):
1. **Tasks tab** — Inline input in TL dashboard (always visible, primary command center)
2. **Card share menu** — "Send to Agent" in every card's ⋯ menu
3. **Focus detail** — "Instruct TL" button in status banner
4. **Sprint deliverables** — "TL" button on each deliverable card
5. **Orchestration completion** — "Send to Agent" in sprint completion header

**Shared component:** `ReactToTL.tsx` — reusable popup/inline with agent dropdown, context preview, textarea. Supports `mode: "popup" | "inline"`.

**Processing:** TL reads pending reacts in `gatherSignals()`, incorporates into LLM assessment (user reacts appear as signals alongside errors and focus state), marks as processed after the routine. Proactive reacts get a "DIRECT USER INSTRUCTION" flag in the LLM prompt, biasing toward action.

**Notification context tracking:** `registerNotification()` stores context for each sent notification. `getLastWechatNotification()` associates WeChat replies with the most recent notification. Contexts auto-expire after 7 days.

- Key files: `reacts.ts` (system), `wechat-webhook.ts` (WeChat capture), `server.ts` (API routes + `/r/<id>` page + `/api/agents`), `ReactToTL.tsx` (shared UI component)

### Focus Areas (AI-Inferred Goals)

Focus Areas is the bridge between understanding the user (Cortex) and taking action (Evolve). The system infers what the user cares about, and the Team Leader drives progress through the Evaluate → Discuss → Evolve cycle.

**Three-phase lifecycle:**
1. **Infer** — `inferFocusAreas()` analyzes the full Cortex data inventory to produce 4-7 focus areas with evidence, intent, deeper motivation, and adjacent pursuits. Outcome-oriented: "Develop AlphaRank into a Market-Beating Quant Tool", not "Quantitative Finance".
2. **Refine through dialogue** — Each focus has a dedicated conversation. These conversations use **decision-mode**: the AI arrives with a specific recommendation, not an open-ended question. The agent presents 2-3 options with tradeoffs and states its pick. Context injection adapts to the decision point:
   - **No evaluation** → Agent recommends running an evaluation and explains what it will study
   - **Evaluation complete** → Agent presents action options with tradeoffs, recommends which to pursue
   - **Sprint results available** → Agent leads with impact metrics, highlights the most useful deliverable, proposes next cycle
   - **Stalled** → Agent diagnoses the gap, proposes a restart
   After each exchange, `refineFocusFromConversation()` detects goals, deadlines, or motivations and progressively upgrades clarity (emerging → developing → clear).
3. **Execute via Evolve** — The full conversation context feeds into an `/Evolve` orchestration sprint. On completion, structured `SprintResultsSummary` maps each deliverable to a pain point with quickStart actions. Results delivered proactively via email/WeChat + in-app conversation card.

**Sprint deliverable activation:**
- `lastSprintSummary` (type `SprintResultsSummary`) stores structured deliverable-to-pain-point mapping
- `backfillSprintSummaries()` retroactively generates summaries for pre-existing sprints
- Cortex tab shows activation cards: entity type badges, pain point, how-it-helps, quickStart action, colored Run/Read/Explore/Review buttons
- Sprint completion emits `sprint.completed` event → proactive message in focus conversation + multi-channel delivery via `deliverSprintResults()`

**Typed focus areas** — each focus has a `focusType` that determines capabilities:
- `project` — has `codebasePath`, linked `projectId`, codebase analysis, team agents, evolution sprints
- `creative` — research, technique frameworks, production guides (e.g., photography, writing)
- `learning` — study plans, skill tracking, subject expertise
- `lifestyle` — habits, optimization, recommendations (e.g., gaming setup, fitness)
- Auto-detected from semantic tags + project registry matching via `detectFocusTypes()`

**Expert teams** — every focus area gets 2-4 domain-specific AI advisors:
- Generated by `generateFocusExperts()` in `team-generator.ts` — LLM produces experts tailored to the focus type and goal
- Each expert has: name, role, responsibilities, goals, perspective (with opinions), agentRole
- Example (photography): Isabella Rossellini (Curator), Kenji Tanaka (Composition Master), Chloe Dubois (Album Designer)
- **Direct chat** — each expert has a dedicated conversation via `ExpertContextProvider` ("You ARE [name]. Respond in character.")
- **Cortex-native** — experts persisted as wiki pages, searchable across focuses
- **TL-managed** — Team Leader staffs, evaluates, and restructures expert teams autonomously
- **Evolution sprints** use focus experts as `teamAgents` in the orchestration context
- Expert conversations grouped under "EXPERTS" in sidebar with amber styling

**Architecture:**
- **Decision-mode context** (`focus-context-provider.ts`): Injects sprint results as context layer, behavioral instructions adapt to current decision point (not just clarity level)
- **Expert context** (`ExpertContextProvider`): Persona injection for expert conversations — expert persona, focus context, awareness of other team members
- **Focus utilities** (`focus-agent.ts`): `analyzeFocusAreas()` (zero-LLM state machine), `generateProgressPulse()` (LLM distillation), `deliverSprintResults()` (multi-channel). Called by TL, not independent.
- **Conversation Context Registry** (`conversation-context.ts`): Event-driven — handles `sprint.completed`, `cortex.entity.created`, `research.completed`, `focus.refined`
- **Sidebar grouping**: Focus conversations under "FOCUS AREAS" (violet), expert conversations under "EXPERTS" (amber)
- **Cortex-native**: Goals at `~/.enso/wiki/focuses/<goal-slug>.md`, experts at `~/.enso/wiki/focuses/<focusId>/expert-<slug>.md`
- **REST API**: `GET /api/focus-areas`, `POST /api/focus-areas/infer`, `PATCH /api/focus-areas/:id`, `POST /api/focus-areas/:id/plan`, `POST /api/focus-areas/pulse`, `POST /api/focus-areas/backfill-summaries`, `POST /api/focus-areas/:id/generate-experts`, `POST /api/focus-areas/detect-types`
- **UI**: Focus tab with list → detail. Detail tabs: Work (Evaluate→Discuss→Evolve), Cortex (sprint results + deliverable activation cards + knowledge), Experts (expert cards with chat buttons), Evolve (live sprint monitoring). Projects tab removed — project-type focuses cover all project capabilities.
- Key files: `focus-areas.ts` (engine + backfill + types), `focus-agent.ts` (utilities), `focus-context-provider.ts` (decision-mode + expert personas), `team-generator.ts` (expert generation), `conversation-context.ts` (registry), `FocusView.tsx` (UI), `ConversationSidebar.tsx` (grouping)

### Conversation Context Registry

A general-purpose framework for context-aware conversations. Features register as context providers for specific conversations, enabling three capabilities:

1. **Context injection** — `getContextForPrompt()` injects rich context into the agent's system prompt so it knows what the conversation is about
2. **Proactive messages** — `getProactiveMessages()` checks for state changes (focus going quiet, new related content) and delivers unsolicited messages to the conversation
3. **Event-driven triggers** — `onEvent()` handles external events (Cortex entity created, research completed, focus refined) and surfaces relevant insights

**Implementation:** `conversation-context.ts` exports a singleton `contextRegistry`. Providers implement `ConversationContextProvider` interface. Events emitted from `cortex-enrichment.ts`, `researcher-tools.ts`, and `focus-areas.ts` (including `sprint.completed`). Proactive delivery loop in `server.ts` checks every 60s and delivers via `persistCard()` + WebSocket push. Dedup with 1h TTL prevents message spam.

**Consumers:** `FocusContextProvider` (focus-context-provider.ts) — handles sprint completion notifications, decision-mode context injection, quiet focus detection, new content alerts. Future consumers: project conversations, data source monitoring threads.

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

### Data Sources

> Fully documented in [CORTEX.md](CORTEX.md#data-sources--the-input-pipeline) — the 13 data sources are the input pipeline into Cortex.

Consent-gated scans of the user's desktop environment. All data stays local. Current sources: Files, Browser History, Bookmarks, Email, System, Kindle, WeRead, YouTube, Steam, Movies/TV, Photos, Twitter/X, QQ Music.

**Adding a new source** = one new app directory in `server/apps/<source>/` + one entry in `DATA_SOURCES` in `data-source-registry.ts`.

- Key files: `data-source-registry.ts`, `data-source-pipeline.ts`, `user-context-builder.ts`, `onboarding.ts` (backend); `SettingsPanel.tsx` DataSourcesSection (frontend)

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
4. **Agent fallback** — unmatched actions go through the standalone agent pipeline

**Ecosystem Bridge**: `registerAppTool()` in `registry.ts` dual-registers each dynamic app tool with both the internal `generatedToolExecutors` map AND the agent's tool registry via `registerLocalTool()` in `server/standalone.ts`. Every user-built app is immediately discoverable by the agent for future requests — closing the loop where apps become reusable ecosystem tools.

## Building Apps

**Dynamic apps** are the primary workflow. They live as portable directories (`app.json` + `template.jsx` + `executors/*.js`) in two locations:

| Location | Path | Purpose |
|----------|------|---------|
| **User apps** | `~/.enso/apps/<family>/` | Created by Build App pipeline |
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

Frontend: React 19 + Zustand 5 + Tailwind CSS 4 + Recharts + Lucide + Sucrase + xterm.js + Vite 6. Backend: Standalone Express 4 + ws 8 + node-pty. Language: TypeScript 5.7 strict, ESM. LLM: Gemini (via API key). Unified LLM: `llm()` in `server/src/llm.ts` — auto-resolves API keys, tier-based model selection (fast/utility/pro), retry with backoff.

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

The backend server runs on port 3001. Vite proxies `/ws`, `/media`, `/upload` to localhost:3001.

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

Centralized NDJSON action log captures all backend operations, errors, fixes, and Claude Code session lifecycle.

- **Files**: `~/.enso/action.log` (rotates at 1000 lines), `~/.enso/fixes.json` (bug fix records)
- **Module**: `server/src/action-log.ts` — `logAction()`, `logError(category, message, error, extra?)`, `logFix()`
- **HTTP API**: `GET /api/action-log?count=100&type=error` (types: `action`, `error`, `fix`, `build`, `system`, `claude-code`)
- **Client errors**: Frontend reports via WebSocket `client.error`; utility at `src/lib/error-reporter.ts` (5s dedup)
- **Category convention**: `module:subpath` (e.g., `action:refine`, `build-via-claude`, `ui-gen`)

> Full entry-type table, frontend error sources, and usage examples in [CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md#logging--error-tracking-detailed).
