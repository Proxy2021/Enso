# Enso — A self-hosted AI platform with a Knowledge Cortex that compounds with every interaction

> 99 tools, 16+ apps, 7 data sources, AI-inferred focus areas, and a unified brain that learns from your books, browsing, projects, and conversations.

![Enso Screenshot](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Desktop%20%7C%20Android%20%7C%20PWA-orange)

## What is Enso?

Enso is a self-hosted AI platform with a Knowledge Cortex at its center. Ask a question and get a structured research dashboard, not a wall of text. Connect your data sources — Kindle library, YouTube subscriptions, browser history, email, projects — and watch the Cortex populate with hundreds of interlinked wiki pages on day one. Describe an app and watch Claude Code build it in a live terminal. Run `/evolve` and an AI team improves your entire installation autonomously.

**99 tools. 16+ apps. 7 data sources. 1 brain that compounds. Yours forever.**

## Why Enso?

| What You Want | Others | Enso |
|---|---|---|
| Research a topic | Wall of text | Interactive research board with 48+ sources, charts, AI podcast |
| Build an app | Component preview or code edits | Full app built live in Claude Code terminal |
| Track knowledge | Re-derive from scratch every time | Knowledge Cortex: AI-maintained wiki that compounds with every use |
| Improve your tools | Wait for vendor updates | AI team runs evolution sprints on YOUR installation |
| Stay current | Manual news reading | Daily intelligence briefing: AI searches web for your interests, emails a digest |
| Own your workspace | Rent SaaS ($20-200/mo) | Own source code + data + build pipeline. Fork it. Modify it. Keep it. |

## Get Started

```bash
# 1. Clone
git clone https://github.com/Proxy2021/Enso.git && cd Enso

# 2. Setup (installs deps, configures API keys, personalizes your app)
./setup          # macOS / Linux
.\setup.ps1      # Windows PowerShell
```

Setup handles everything interactively: API keys, Claude Code auth, remote access, app personalization, build, and launch. See **[SETUP.md](SETUP.md)** for the full guide.

## Three Pillars

### 🏭 Own the Factory

Self-hosted. Open source. Your code, your data, your API keys. No subscriptions. No vendor
lock-in. During setup, Claude Code personalizes the entire app based on who you are — a
developer gets "Forge," an investor gets "Signal," a researcher gets "Nexus."

See **[PERSONALIZATION-SHOWCASE.md](PERSONALIZATION-SHOWCASE.md)** for examples.

### 📱 Every Answer Is an App

Research questions become interactive dashboards. Build requests become running apps.
File operations become a desktop-grade file manager. 16 built-in apps, plus unlimited custom
apps from a single command.

### 🧬 AI That Evolves Itself

Type `/evolve` and an AI team — project leader, architect, engineers, QA, marketing, sales — runs a full improvement sprint with real browser testing, code implementation, and validation. No other tool does this.

## Built-in Capabilities

| Capability | Description |
|---|---|
| 🧠 Knowledge Cortex | The ONLY brain — 680+ interlinked wiki pages auto-populated from 7 data sources, treemap graph, web discovery, AI digest, daily intelligence briefing with email delivery |
| 🎯 Focus Areas | AI-inferred goals from your Cortex data — concrete outcomes you're working toward. Progressive refinement through evidence + conversation. Deeper intention analysis reveals the WHY behind each goal and suggests adjacent pursuits |
| 🔍 Research Engine | 48+ source analysis with structured boards, AI podcast, contradiction detection, deep research escalation via Claude Code |
| 💻 Claude Code | `/code` — live terminal coding with model selection (Opus/Sonnet/Haiku), extended thinking |
| ⚡ Orchestrator | Multi-agent teams with DAG-based task decomposition for complex goals |
| 🧬 Evolution | AI team sprints: 7 phases, 6 parallel agents, persona testing, fix-verify loops |
| 📸 Photo Studio | 56 film/cinematic styles, batch processing, AI analysis, EXIF editing |
| 🎬 Video Studio | AI video generation from text prompts via Seedance |
| 🌐 Remote Browser | Full Puppeteer-driven browser inside the conversation |
| 📂 File Manager | Desktop-grade with previews, search, CRUD, 14 file operations |
| 🖥️ Remote Desktop | Control remote machines with screenshots, click, type, scroll |
| 🐚 Terminal | Full PTY terminal (PowerShell/bash/zsh) with xterm.js rendering |
| 📊 Data Analyzer | CSV/JSON analysis with statistics, charts, queries |
| 📚 Kindle Library | Browse 471+ books with covers, ratings, categories, one-click research into Cortex |
| 📺 YouTube Manager | 208 subscriptions, liked videos, feed analysis — all ingested into Cortex |
| 🌐 Browser Data | History + bookmarks combined — browsing patterns and interests into Cortex |
| 📧 Email Scanner | Communication patterns, contacts, topics — feeds into Cortex |
| 📁 Projects Scanner | Tech stack detection across local codebases — project knowledge into Cortex |
| 💻 System Info | Environment analysis — installed apps, running processes |
| 🔬 Mission Planner | AI VC team discovers project opportunities tailored to your interests |
| ⏰ Scheduled Tasks | Durable cron system: run any tool or prompt on a schedule |
| 🔄 Settings Transfer | Export/import 9 categories of data across machines |
| 🛒 ClawHub | Skill store: browse, install, manage OpenClaw extensions |

## Knowledge Cortex — The Unified Brain

Based on [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the Cortex is the ONLY brain for memory, profile, and knowledge. Instead of re-deriving knowledge from scratch each time, the LLM incrementally builds and maintains a persistent, interlinked markdown knowledge base that compounds with every interaction.

**Grand Unification architecture:** `buildEnsoContext()` reads from Cortex only. Memory, user profile, interests, and all accumulated knowledge live as wiki pages. No separate memory or profile systems — the Cortex is the single source of truth.

**7 data source apps** (each a standalone Enso app with its own UI):
- **Kindle Library** (`server/apps/kindle/`) — 471 books with covers, ratings, highlights, categories
- **YouTube Manager** (`server/apps/youtube/`) — 208 subscriptions, liked videos, feed analysis
- **Browser Data** (`server/apps/browser/`) — history + bookmarks combined
- **Email Scanner** — communication patterns and contacts
- **Projects Scanner** — tech stack detection across local codebases
- **System Info** — installed apps, running processes, environment
- **Manual ingest** — any topic via the Cortex Explorer

**Auto-ingest pipeline:** scan -> cache -> change detection -> Cortex pages. Per-item pages (one book, one channel) are deterministic templates with zero LLM cost. Synthesis pages use AI to find cross-source patterns.

**First-run onboarding:** Connect data sources during setup, populate the Cortex with 680+ pages from day one.

**Explorer app:** Dashboard with stats and knowledge gaps, treemap graph visualization (60+ nodes, 280+ connections), full-text search with tag cloud, article reader with backlinks and related pages.

**Discovery:** Enter any topic — AI searches the web, suggests 5 branches to explore, one-click ingest into the Cortex.

**Daily Intelligence Briefing:** Scheduled task searches the web daily for your top 10 interests, AI analyzes findings with personalized impact assessment and action items, ingests significant discoveries into the Cortex, emails you a curated digest.

## How It Works

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

No commands needed. The system auto-classifies every message and chooses the right level of effort.

## Tech Stack

**Frontend:** React 19, Zustand 5, Tailwind CSS 4, Vite 6, Capacitor (Android)
**Backend:** Express, WebSocket, TypeScript 5.7, node-pty
**AI:** Claude Code (Opus/Sonnet/Haiku), Unified `llm()` layer (Gemini, OpenAI, Anthropic, DeepSeek, Ollama, OpenRouter)
**Mobile:** Capacitor Android APK + PWA (offline-capable)
**Tools:** 99 registered tools across 14 families

## Architecture

<details>
<summary>Project structure</summary>

```
src/                          React frontend
├── cards/                    Card renderers (DynamicUI, Terminal, Shell, Orchestration, Mission)
├── components/               Timeline, ChatInput, CardContainer, ConnectionPicker
├── store/chat.ts             Zustand state (cards, streaming, connections, evolution)
└── lib/                      WS client, JSX sandbox (Sucrase), EnsoUI (27 components), connections

server/                       Backend
├── apps/                     16 shipped app packages incl. data source apps (kindle, youtube, browser, etc.)
└── src/
    ├── server.ts             Express + WS server with auth
    ├── standalone-agent.ts   Chat agent for standalone mode
    ├── task-router.ts        4-tier message classifier (simple/research/one-off/orchestrated)
    ├── orchestrator.ts       Multi-agent planner (goal → task DAG)
    ├── orchestrator-engine.ts  DAG executor with parallel agents
    ├── evolution.ts          Self-evolution sprint system (7 phases, 6 parallel agents)
    ├── researcher-tools.ts   Two-phase streaming research pipeline
    ├── wiki-tools.ts         Knowledge Cortex engine (ingest, search, lint, import) — the ONLY brain
    ├── llm.ts                Unified LLM layer — single llm() call across 6 providers
    ├── claude-code.ts        Claude Code CLI integration (NDJSON streaming)
    ├── build-via-claude.ts   Natural language → app build via Claude Code
    ├── scheduled-tasks.ts    Durable cron system with task execution
    ├── settings-transfer.ts  Cross-machine export/import (9 categories)
    ├── user-context-tools.ts Consent-gated desktop environment scanner
    └── *-tools.ts            14 tool families (99 total tools)

shared/types.ts               WebSocket protocol types (shared frontend ↔ backend)
```
</details>

## Documentation

| Document | Contents |
|----------|----------|
| **[SETUP.md](SETUP.md)** | One-command setup, personalization, prerequisites, troubleshooting |
| **[PERSONALIZATION-SHOWCASE.md](PERSONALIZATION-SHOWCASE.md)** | 6 persona apps with screenshots |
| **[CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md)** | App building API, ExecutorContext, template rules |
| **[CLAUDE.md](CLAUDE.md)** | Full architecture reference for AI-assisted development |
| **[PROJECTS.md](PROJECTS.md)** | Project import, AI team generation, evolution sprints |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | How to contribute to Enso |

## Contributing

We welcome contributions of all sizes — bug fixes, new app types, UI improvements, docs, translations. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

## License

MIT License — free forever.
