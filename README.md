# Enso — An AI sandbox that ships

> Every answer is an interactive app. Every sprint makes it smarter. You own the entire factory.

![Enso Screenshot](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Desktop%20%7C%20Android%20%7C%20PWA-orange)

## What is Enso?

Enso is an open-source AI platform that doesn't just chat — it **builds**. Ask a question
and get a structured research dashboard, not a wall of text. Describe an app and watch
Claude Code build it in a live terminal. Run `/evolve` and an AI team improves your entire
installation autonomously.

**Self-hosted. Self-evolving. Yours.**

## Why Enso?

| What You Want | Others | Enso |
|---|---|---|
| Research a topic | Wall of text (ChatGPT) | Interactive research board with 48+ sources, charts, AI podcast |
| Build an app | Component preview (v0) or code edits (Cursor) | Full app built live in Claude Code terminal |
| Improve your tools | Wait for vendor updates | AI team runs evolution sprints on YOUR installation |
| Own your workspace | Rent SaaS ($20–200/mo) | Own source code, fork it, modify it, keep it forever |
| Personalize | Config files, themes | Claude Code recompiles the entire app for your role |

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
File operations become a desktop-grade file manager. 15+ built-in app types, plus custom
apps from a single command.

### 🧬 AI That Evolves Itself

Type `/evolve` and an AI team — project leader, architect, engineers, QA — runs a full
improvement sprint. Sprint scores: 4.5 → 7.5 over 4 cycles. No other developer tool does this.

## Built-in Capabilities

| Capability | Description |
|---|---|
| 🔍 Research Engine | 48+ source analysis with structured boards, AI podcast, PDF export |
| 💻 Claude Code | `/code` — live terminal coding with model selection (Opus/Sonnet/Haiku) |
| ⚡ Orchestrator | Multi-agent teams with dependency graphs for complex tasks |
| 📸 Photo Studio | 28 film/cinematic styles, batch processing, EXIF editing |
| 🌐 Remote Browser | Full browser inside the conversation |
| 📂 File Manager | Desktop-grade with previews and CRUD |
| 🖥️ Remote Desktop | Control remote machines from within Enso |
| 🧠 Knowledge Cortex | LLM-maintained knowledge base with graph visualization, web discovery, AI digest, daily intelligence briefing |
| 🔬 Mission Planner | AI discovers project opportunities tailored to your interests |
| ✨ Card Evolution | Click Evolve on any card — AI team turns it into a polished app |
| 📝 Summarizer | One-click text + AI podcast summaries for any card |

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

No commands. No configuration. The system figures out the right level of effort.

## Tech Stack

**Frontend:** React 19, Zustand 5, Tailwind CSS 4, Vite 6, Capacitor (Android)
**Backend:** Express, WebSocket, TypeScript, node-pty
**AI:** Claude Code, Multi-provider LLM (Claude, Gemini, GPT, DeepSeek, Ollama, OpenRouter)
**Mobile:** Capacitor Android APK + PWA (offline-capable)

## Architecture

<details>
<summary>Project structure</summary>

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
    ├── researcher-tools.ts   Two-phase streaming research pipeline
    ├── build-via-claude.ts   Natural language → app build via Claude Code
    ├── claude-code.ts        Claude Code CLI integration (NDJSON streaming)
    └── tool-factory.ts       Template refinement, auto-heal executor

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
