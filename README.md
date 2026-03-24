# Enso

**An AI sandbox that generates complete solutions. It discovers project opportunities, assembles AI teams to build, self-evolves, and ships products.**

**Enso — 生成完整解决方案的 AI 沙盒。发现机会，组建 AI 团队，自我进化，交付产品。**

Enso is an AI sandbox powered by [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) and a multi-provider LLM layer. It doesn't just chat — it **builds**. Ask a question and get the most useful format for that answer — research boards, data visualizations, interactive tools, AI-generated podcasts. Give it a complex goal and it assembles a full AI team — researchers, architects, builders, coders, reviewers — to plan, build, test, and ship in parallel. Give it a project and it evolves it autonomously, sprint after sprint. Click **Evolve** on any card and a focused multi-agent sprint transforms it into a polished interactive app — right on the card.

**Every user owns the factory.** Each Enso installation includes the complete source code and build pipeline. During setup, Claude Code personalizes the entire app — redesigning the UI, writing domain-specific prompts, reordering tools — based on who you are. The resulting mobile app is truly yours: a developer gets "Forge" with code-first layouts, an investor gets "Signal" with a Bloomberg-terminal aesthetic, a researcher gets "Nexus" with literature-focused deep dive tools. Future `/evolve` sprints continue to modify the same source code, making each user's app diverge further over time. This is not theming — it's recompilation with a new identity.

---

## What Enso Does

### Answer Any Question — With the Best Experience

When you ask Enso something, it doesn't just return text. It delivers the **best possible experience** for that answer:

- **Research a topic** → Get a full research board with source attribution, confidence levels, contradiction detection, embedded videos, books, AI-generated podcast, and PDF export — not a wall of text
- **Compare options** → Get interactive side-by-side comparisons with data tables and charts
- **Browse files** → Get a desktop-grade file manager with previews, not a directory listing
- **Process photos** → Get a professional photo studio with 28 film/cinematic styles and batch processing
- **Browse the web** → Get a full browser rendered inside the conversation — click, type, scroll
- **Summarize anything** → One-click text summarization for any card — chat responses, orchestration runs, terminal sessions — with key outcomes, narrative, and optional AI podcast
- **Multiple conversations** → Sidebar threads with separate history per chat (persisted per browser client), so you can branch topics without losing context

Every answer is delivered through purpose-built interactive React components. The experience adapts to the content.

### Evolve Any Card — Into a Full App

Click **Evolve** on any assistant card and Enso launches a focused multi-agent sprint to transform the card's content into a polished interactive application — right on the card itself with a Standard/Evolved toggle view:

- **Chat card** → Evolve into an interactive topic explorer with data visualizations
- **Terminal card** → Evolve into a project dashboard showing files changed, tests run, decisions made
- **Orchestration card** → Evolve into an executive report with task outcomes, timelines, and deliverables
- **Dynamic app card** → Evolve to add missing features, improve data viz, enhance the UI

Evolution uses the same orchestration engine that powers complex tasks — Claude Code-powered agents working in parallel on a dependency graph. The result appears as a toggle on the source card, just like Deep Research.

### Tackle Any Task — With a Full Engineering Team

Give Enso a complex goal — *"build me a personal finance tracker"* or *"research and design a meal planning system"* — and it automatically assembles a team of Claude Code-powered agents:

| Role | What It Does |
|------|-------------|
| **Researcher** | Gathers information, analyzes domains, identifies requirements |
| **Architect** | Designs solutions, makes technical decisions, plans structure |
| **Builder** | Creates complete interactive apps with UI and data pipelines |
| **Coder** | Writes code, fixes bugs, implements features |
| **Reviewer** | Validates quality, checks for issues, ensures completeness |

These agents work in parallel on a dependency graph with shared context. You see live progress, approve key decisions, and get working results — not just plans.

The orchestration engine supports **inline targeting** — agents can deliver results directly to an existing card, replacing the old content with the evolved version. This powers Card Evolution, Deep Research, and Discovery sprints with a consistent UX pattern: all show a building view on the source card, and results appear as a toggle view.

### Build Anything — From Within

Every capability in Enso was built using Enso itself. The platform includes Claude Code directly, so you can:

- **`/code`** — Open a Claude Code session. Edit any file, build any feature, fix any bug. Streaming terminal output with model selection (Opus/Sonnet/Haiku) and live reasoning visualization.
- **`/shell`** — Open a real terminal (PowerShell/bash/zsh) with full ANSI color support via xterm.js.
- **Build App** — Describe what you want in natural language. Claude Code builds the complete app — data pipeline, UI, and all — in a live terminal session.
- **Mission Planner** — Describe your interests. Enso proposes and builds a suite of custom apps tailored to your workflow.

```
Use Enso → notice a gap → /code "add a stock tracker"
→ Claude Code builds it → new app appears → use it → refine it → repeat
```

The platform evolves from within. No separate IDE. No deployment pipeline.

### Discover Opportunities — AI VC

Enso includes an AI venture capital team that discovers high-potential project opportunities. Type **`/discover`** with an optional focus area and a 5-person VC team runs a full investment process:

| Phase | What Happens |
|-------|-------------|
| **Deal Sourcing** | 3 partners independently research using different lenses — demand signals, technology timing, competitive gaps |
| **Pitch Session** | Each partner reads all research and pitches their single best find |
| **Investment Committee** | Managing Partner chairs rigorous debate: market timing, Enso competitive advantage, feasibility, cost of entry |
| **Deliverables** | Interactive investment dashboard + presentation-style investment memo |

Each recommendation answers: *Why is this a great project right now? Why will Enso's approach beat existing competition? What does it cost to go in?*

Approve a recommendation → Enso creates the project, auto-generates a domain-specific AI team, and starts building.

### Manage Any Project — Import & Evolve

Enso isn't just for projects it creates. Point it at **any existing codebase** and it becomes the project's AI management layer:

1. **Import** — `/projects` → "Import Project" → enter codebase path
2. **Team Generation** — Enso scans the project, auto-assembles a tailored AI team (PL, Architect, Engineers, QA, domain specialists) and customer personas
3. **Evolve** — `/evolve` runs autonomous sprint cycles: persona testing → team evaluation → synthesis → implementation → review → validation
4. **Iterate** — Each sprint the team accumulates knowledge, improving sprint over sprint

---

## How It Works

Enso automatically classifies every message and responds with the right level of capability:

```
Your message
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Task Router (auto-classification)                  │
│                                                     │
│  "What's the weather?" ──→ Simple    → Agent chat   │
│  "Fix this bug"        ──→ One-off   → Claude Code  │
│  "Build a CRM system"  ──→ Complex   → Multi-agent  │
│                              orchestration with DAG  │
└──────────────────────────────┬──────────────────────┘
                               │
                               ▼
                    Tool Result + Template
                               │
                               ▼
                  Interactive React App (instant)
```

**No commands. No configuration. The system figures out the right level of effort.**

When a tool produces results, the UI isn't generated by an LLM call — it's **deterministically mapped** to a pre-built React template. This makes rendering instant, reliable, and free. Button clicks dispatch directly to tools — no LLM round-trip for interactions either.

---

## Built-in Capabilities

### 🔍 Research Engine
Research any topic in any language. Two-phase streaming pipeline: key findings appear in ~19 seconds, full analysis (sections, media, books, movies, contradictions, gap analysis) completes in ~30s. Follow-up questions, side-by-side comparisons, deep dives, AI podcast generation, and PDF export. **Deep Dive** escalates to Claude Code, which researches thoroughly and generates a bespoke interactive UI custom-designed for each topic — timeline explorers for history, comparison dashboards for tech, restaurant guides for food.

### ✨ Card Evolution (Evolve)
Click **Evolve** on any assistant card to launch a focused multi-agent sprint. The orchestration engine plans a card-type-specific strategy (dashboard for chats, report for orchestrations, upgrade for apps), deploys agents in parallel, and delivers the result as a toggle view on the source card. Works across all card types: chat, terminal, orchestration, and dynamic-ui.

### 📸 Photo Studio
28 styles across Film Stocks (Portra, Ektar, Tri-X), Cinematic (Wong Kar-wai, Blade Runner, Ghibli), Photographers (Moriyama, Fan Ho, Saul Leiter), and Trending. Data-driven recipe engine. Batch processing, photo books with intelligent layouts, AI descriptions, EXIF metadata, search, and collections.

### 🌐 Remote Browser
Full web browser inside a chat card. Navigate URLs, click on page screenshots, type into forms, scroll, manage bookmarks.

### 📂 File Manager
Desktop-grade file browser with breadcrumb navigation, sorting, search, inline previews (text, images, video, audio), and full CRUD operations.

### 🖥️ Remote Desktop
View and control the host machine's desktop from the browser. Click coordinates map to real screen positions. Type text, send key combos, scroll. Works over remote connections with token auth.

### 💻 Terminal & Claude Code
**`/shell`** — Real interactive terminal via xterm.js.
**`/code`** — Claude Code with streaming output, model picker, extended thinking, and interactive Q&A.

### 📝 Universal Text & Audio Generation
One-click summarization for any card type. Extracts content from chat, terminal, orchestration, and dynamic-ui cards; generates a structured text summary (overview, key findings, outcomes, narrative); and can produce a multi-speaker NotebookLM-style AI podcast with natural conversational tone. Multi-language support (including Chinese). Uses the multi-provider LLM layer for text; Gemini multi-speaker TTS for audio.

### 🤖 Multi-Agent Orchestrator
State a complex goal. Five agent roles collaborate on a dependency graph with parallel execution, approval gates, and live progress visualization. Supports **inline targeting** — the orchestrator can send building state and results directly to an existing card, enabling Card Evolution, Deep Research, and Discovery to render progress and results as toggle views on the source card.

### 🎯 Mission Planner
Describe your interests → Enso proposes 2–5 custom apps → approve/edit each → apps built automatically.

### 🛒 ClawHub Store
Browse and install OpenClaw skills from the marketplace with one click.

### 🌐 Multi-Language (i18n)
Settings panel with language toggle. Switch between English and Chinese (中文) — all UI labels, tiles, prompts, hints, and status messages update instantly. Language preference persists across sessions via localStorage and syncs to the backend. Adding new languages requires only a new JSON translation file.

### ⚡ Long-Running Task UX
Complex tasks (builds, orchestrations, deep research, Claude Code sessions) run in the background while you keep chatting. Progress bars with elapsed time and ETA, background task pills above the chat input, browser notifications (desktop) and haptic vibration (mobile) on completion, in-app toast banners, and a Results Inbox for catching up on completed work. Card contexts survive server restarts via journal-based recovery.

---

## Quick Start

Get the source code onto your machine, then run one command:

```bash
# macOS / Linux
./setup

# Windows PowerShell
.\setup.ps1
```

The setup handles everything interactively: install location, LLM provider + API key, Claude Code authentication, remote access via `<name>.enso.net`, **app personalization** (Claude Code redesigns the UI for your role), frontend + APK build, and server start. At the end you get a QR code to download the mobile app — it auto-connects to your server.

See **[SETUP.md](SETUP.md)** for the full guide and **[PERSONALIZATION-SHOWCASE.md](PERSONALIZATION-SHOWCASE.md)** for examples of personalized apps.

---

## Architecture

**Frontend**: React 19 · Zustand 5 · Tailwind CSS 4 · Recharts · Lucide · xterm.js · Vite 6
**Backend**: Express · WebSocket · TypeScript · OpenClaw Plugin SDK · node-pty
**Mobile**: Capacitor (Android) · PWA (installable, offline-capable)
**AI Layer**: Claude Code (building, orchestration, coding, evolution) · Multi-provider LLM via `callChatLLM` (Gemini, OpenAI, Anthropic, DeepSeek, Ollama, OpenRouter) · Gemini multi-speaker TTS (podcast audio)
**Self-Heal**: Auto-heal executor detects failed dynamic apps and autonomously regenerates their code via LLM

### Project Structure

```
src/                          React frontend
├── cards/                    Card renderers (DynamicUI, Terminal, Shell, Orchestration, Mission)
├── components/               Timeline, ChatInput, CardContainer, ConnectionPicker, MemoryPanel
├── store/chat.ts             Zustand state (cards, streaming, connections, evolution)
└── lib/                      WS client, JSX sandbox (Sucrase), EnsoUI (17 components), connections

server/              OpenClaw channel plugin (backend)
├── apps/                     Shipped app packages (app.json + template.jsx + executors/)
└── src/
    ├── server.ts             Express + WS server with auth
    ├── channel.ts            OpenClaw ChannelPlugin implementation
    ├── inbound.ts            Message routing (browser → OpenClaw dispatch)
    ├── outbound/             Response delivery, card actions, enhancement, context
    ├── llm-provider.ts       Multi-provider LLM abstraction (callChatLLM)
    ├── task-router.ts        3-tier message classifier (simple/one-off/orchestrated)
    ├── orchestrator.ts       Multi-agent planner (goal → task DAG) with inline targeting
    ├── orchestrator-engine.ts  DAG executor with parallel agents
    ├── card-evolution.ts     Card-type-specific evolution via orchestration
    ├── card-summarizer.ts    Universal content extraction + text/podcast generation
    ├── podcast.ts            Multi-speaker podcast (script gen + Gemini TTS + WAV)
    ├── researcher-tools.ts   Two-phase streaming research pipeline
    ├── build-via-claude.ts   Natural language → app build via Claude Code
    ├── claude-code.ts        Claude Code CLI integration (NDJSON streaming)
    ├── tool-factory.ts       Template refinement, auto-heal executor
    ├── shell-pty.ts          Remote PTY manager (node-pty)
    ├── native-tools/
    │   ├── registry.ts       Tool discovery + ecosystem bridge
    │   └── templates/        Pre-built JSX templates per app family
    └── *-tools.ts            System capabilities (filesystem, media, screen, browser, etc.)

shared/types.ts               WebSocket protocol types (shared frontend ↔ backend)
scripts/                      Setup tools
├── personalize-prompt.md     Claude Code prompt for deep UI personalization
├── personalize.cjs           Deterministic fallback (6 persona templates)
└── qr-terminal.js            QR code for mobile deep links
setup / setup.ps1             One-command setup (bash / PowerShell)
```

---

## Multi-Machine Access

Enso supports remote access across multiple machines. Each machine can be exposed via Cloudflare Tunnel with a fixed subdomain. The frontend includes a Connection Picker for switching between backends with token authentication.

See **[server/SETUP.md](server/SETUP.md)** for Cloudflare Tunnel setup and multi-machine configuration.

---

## Development

```bash
npm run dev          # Frontend dev server (Vite, port 5173)
npm run build        # Production build
```

Requires a running OpenClaw gateway with the Enso plugin enabled. Vite proxies `/ws`, `/media`, and `/upload` to `localhost:3001`.

---

## Documentation

| Document | Contents |
|----------|----------|
| **[SETUP.md](SETUP.md)** | One-command setup, personalization, prerequisites, troubleshooting |
| **[PERSONALIZATION-SHOWCASE.md](PERSONALIZATION-SHOWCASE.md)** | 6 persona apps with screenshots — Atlas, Forge, Nexus, Signal, Studio, Compass |
| **[CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md)** | App building API, ExecutorContext, template rules, EnsoUI components |
| **[CLAUDE.md](CLAUDE.md)** | Full architecture reference for AI-assisted development |
| **[PROJECTS.md](PROJECTS.md)** | Project import, AI team generation, evolution sprints |

---

## License

MIT
