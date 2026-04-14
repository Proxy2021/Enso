# Enso — A self-hosted AI organization that works for you

> Scans your digital life, infers your goals, staffs domain-specific expert teams, and autonomously drives progress — with a Team Leader that manages the entire operation on a daily schedule.

![Enso Screenshot](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Desktop%20%7C%20Android%20%7C%20PWA-orange)

## What is Enso?

Enso is not an AI assistant — it's a **self-hosted AI organization** that understands who you are, figures out what matters to you, and mobilizes a full team of AI specialists to make real progress on your goals, every single day.

Connect your data sources — Kindle library, YouTube subscriptions, browser history, email, projects, photos, games, music — and Enso builds a **Knowledge Cortex** of 2000+ interlinked wiki pages mapping who you are, what you know, and what you're drawn to. From this, it infers **Focus Areas** — concrete, outcome-oriented goals like "Develop AlphaRank into a Market-Beating Quant Tool" or "Master Documentary Street Photography."

A **Team Leader** agent wakes up on a configurable schedule, surveys the entire system, and runs the organization:
- Staffs each focus area with 2-4 domain-specific **expert teams** (a Quant Strategist for finance, a Master Photographer for photography, an AI Architect for your dev project)
- Evaluates expert performance, restructures teams when goals shift
- Launches evaluation sprints, strategic dialogues, and multi-agent execution sprints
- Delivers a unified daily briefing via email, WeChat, and in-app — with feedback buttons that loop back into the next cycle

You are the CEO. Enso is the company that works for you. You approve at gates, chat with experts for opinions, provide creative direction when your brain is needed. Everything else — staffing, evaluation, execution, delivery — the organization handles.

**Self-hosted. Open source. You own the factory, not just the product.**

## The Arc: Understand → Focus → Staff → Execute → Deliver

```
 Your Digital Life (12 sources)
         │
         ▼
 ┌─────────────────────────────┐
 │   KNOWLEDGE CORTEX          │  2000+ interlinked wiki pages
 │   (The Brain)               │  Cross-source synthesis
 └──────────┬──────────────────┘
            │ infers
            ▼
 ┌─────────────────────────────┐
 │   FOCUS AREAS               │  AI-inferred goals with intent,
 │   (What Matters)            │  deeper WHY, typed (project/
 │                             │  creative/learning/lifestyle)
 └──────────┬──────────────────┘
            │ staffs
            ▼
 ┌─────────────────────────────┐
 │   EXPERT TEAMS              │  2-4 domain specialists per goal
 │   (Your People)             │  Direct chat, sprint participation
 └──────────┬──────────────────┘
            │ drives
            ▼
 ┌─────────────────────────────┐
 │   TEAM LEADER               │  Morning routine: gather signals →
 │   (The Operator)            │  assess → execute → brief → deliver
 │                             │  Manages the entire org autonomously
 └──────────┬──────────────────┘
            │ delivers
            ▼
    Email / WeChat / In-App
    (with feedback loop → next cycle)
```

## Why Enso?

| What You Want | Others | Enso |
|---|---|---|
| Progress on goals | You drive everything manually | Team Leader drives daily; you approve at gates |
| Domain expertise | One generic AI for everything | Expert teams per goal (photographer, quant, architect) |
| Research a topic | Wall of text | Interactive research board with 48+ sources |
| Build an app | Component preview or code edits | Full app built live in Claude Code terminal |
| Track knowledge | Re-derive from scratch every time | Knowledge Cortex: AI-maintained wiki that compounds |
| Improve your tools | Wait for vendor updates | AI team runs evolution sprints on YOUR installation |
| Stay informed | Manual reading | Daily intelligence briefing emailed to you |
| Own your workspace | Rent SaaS ($20-200/mo) | Own source code + data + build pipeline forever |

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

### 🏢 A Living Organization

Enso runs as a **living organization** with a Team Leader agent at the helm. The TL wakes up daily, gathers signals from every system, makes prioritized decisions, staffs expert teams, launches sprints, and delivers briefings. Every notification includes feedback buttons — your remarks feed back into the next assessment cycle. The organization learns and adapts.

### 🧠 One Brain That Compounds

The **Knowledge Cortex** is the single source of truth. Based on [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — 2000+ interlinked markdown pages auto-populated from 12 data sources. Cross-source synthesis finds connections you didn't know existed. Every sprint result, conversation insight, and research finding feeds back into the Cortex. It only grows.

### 🏭 Own the Factory

Self-hosted. Open source. Your code, your data, your API keys. During setup, Claude Code personalizes the entire app based on who you are — a developer gets "Forge," an investor gets "Signal," a researcher gets "Nexus." See **[PERSONALIZATION-SHOWCASE.md](PERSONALIZATION-SHOWCASE.md)** for examples.

## Core Capabilities

| Capability | Description |
|---|---|
| 🧠 Knowledge Cortex | 2000+ interlinked wiki pages from 12 data sources, treemap graph, web discovery, daily intelligence briefing |
| 🎯 Focus Areas | AI-inferred goals with typed focus (project/creative/learning/lifestyle), intent, deeper WHY, evidence |
| 👥 Expert Teams | 2-4 domain specialists per focus area — direct chat with expert personas, TL-managed lifecycle |
| 📋 Team Leader | Autonomous agent: daily routines, signal gathering, expert staffing/evaluation, sprint execution, multi-channel briefing |
| 💬 Remark System | Async feedback via email/WeChat/web — every notification has action buttons that loop back to TL |
| 🔍 Research Engine | 48+ source analysis with structured boards, deep research escalation via Claude Code |
| 💻 Claude Code | Live terminal coding with model selection (Opus/Sonnet/Haiku), extended thinking |
| ⚡ Orchestrator | Multi-agent teams with DAG-based task decomposition for complex goals |
| 🧬 Evolution | AI team sprints: 7 phases, 6 parallel agents, persona testing, fix-verify loops |
| 📸 Photo Studio | 56 film/cinematic styles, batch processing, AI analysis, EXIF editing |
| 📂 File Manager | Desktop-grade with previews, search, CRUD, 14 file operations |
| 🐚 Terminal | Full PTY terminal (PowerShell/bash/zsh) with xterm.js rendering |
| 📚 Data Sources | 12 sources: Kindle, YouTube, browser, email, projects, system, Steam, movies/TV, photos, Twitter/X, QQ Music, manual |
| 🔬 Discovery | AI VC team discovers project opportunities tailored to your interests |
| ⏰ Scheduled Tasks | Durable cron system for automated routines |

## How It Works

```
Your message
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  Task Router (auto-classification)                   │
│                                                      │
│  "What's the weather?" ──→ Simple    → Agent chat    │
│  "Fix this bug"        ──→ One-off   → Claude Code   │
│  "Build a CRM system"  ──→ Complex   → Multi-agent   │
│                              orchestration with DAG   │
└───────────────────────────────┬──────────────────────┘
                                │
                                ▼
                     Tool Result + Template
                                │
                                ▼
                   Interactive React App (instant)
```

No commands needed. The system auto-classifies every message and chooses the right level of effort.

## 6-Tab Navigation

| Tab | Purpose |
|-----|---------|
| **Chat** | Conversations with Enso and expert teams |
| **Cortex** | Knowledge browser — wiki pages, graph, discovery |
| **Focus** | AI-inferred goals with expert teams and typed focus areas |
| **Tasks** | Team Leader command center + scheduled tasks |
| **Evolve** | Self-evolution hub |
| **Me** | Profile, connection, settings |

## Tech Stack

**Frontend:** React 19, Zustand 5, Tailwind CSS 4, Vite 6, Capacitor (Android)
**Backend:** Express, WebSocket, TypeScript 5.7, node-pty
**AI:** Claude Code (Opus/Sonnet/Haiku), Unified `llm()` layer (Gemini, OpenAI, Anthropic, DeepSeek, Ollama, OpenRouter)
**Mobile:** Capacitor Android APK + PWA (offline-capable)

## Architecture

<details>
<summary>Project structure</summary>

```
src/                          React frontend
├── cards/                    Card renderers (DynamicUI, Terminal, Shell, Orchestration)
├── components/               FocusView, TasksView, EvolveView, ConversationSidebar
├── store/chat.ts             Zustand state
└── lib/                      WS client, JSX sandbox, EnsoUI (17 components), i18n

server/                       Backend
├── apps/                     Shipped app packages (cortex, kindle, youtube, browser, etc.)
└── src/
    ├── server.ts             Express + WS server
    ├── standalone-agent.ts   Chat agent with tool routing
    ├── team-leader.ts        Team Leader — the living organization
    ├── focus-areas.ts        Focus area engine (infer, refine, evolve, expert tracking)
    ├── focus-agent.ts        Focus utilities (analyze, pulse, deliver)
    ├── focus-context-provider.ts  Decision-mode + expert persona injection
    ├── team-generator.ts     Expert team generation for all focus types
    ├── remarks.ts            Async feedback system (email/WeChat/web → TL)
    ├── cortex-tools.ts       Knowledge Cortex engine (the ONLY brain)
    ├── cortex-synthesis.ts   Cross-source intelligence
    ├── llm.ts                Unified LLM layer (6 providers)
    ├── task-router.ts        4-tier message classifier
    ├── orchestrator.ts       Multi-agent planner (goal → task DAG)
    ├── orchestrator-engine.ts  DAG executor with parallel agents
    ├── evolution.ts          Self-evolution sprint system
    ├── claude-code.ts        Claude Code CLI integration
    └── *-tools.ts            Tool families

shared/types.ts               WebSocket protocol types
```
</details>

## Documentation

| Document | Contents |
|----------|----------|
| **[SETUP.md](SETUP.md)** | One-command setup, personalization, prerequisites, troubleshooting |
| **[PERSONALIZATION-SHOWCASE.md](PERSONALIZATION-SHOWCASE.md)** | 6 persona apps with screenshots |
| **[CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md)** | App building API, ExecutorContext, template rules |
| **[TEAM-LEADER.md](TEAM-LEADER.md)** | Team Leader operations: daily routine, autonomous evolution, expert management, auto-restart |
| **[CLAUDE.md](CLAUDE.md)** | Full architecture reference for AI-assisted development |
| **[PROJECTS.md](PROJECTS.md)** | Project import, AI team generation, evolution sprints |

## Contributing

We welcome contributions of all sizes — bug fixes, new capabilities, UI improvements, docs, translations. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

## License

MIT License — free forever.
