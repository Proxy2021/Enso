# Enso

**A self-evolving AI app platform — every answer is an interactive app, and the app builds itself.**

Enso is an [OpenClaw](https://github.com/nicepkg/openclaw) channel plugin that turns conversational AI into on-demand interactive experiences. Ask a question, get a response, then transform it into a live React application — or use the built-in coding agent to build entirely new features without leaving the app. The platform, its tools, and its apps all evolve organically from within.

## How It Works

1. **Chat** — Send a message. Enso routes it through OpenClaw's agent pipeline and streams back a response.
2. **Enhance** — Tap the App button on any response card. Enso generates a self-contained React component tailored to the data.
3. **Interact** — The app is live. Click buttons, sort tables, expand sections. Actions dispatch back to real tools — no round-trip to the LLM needed.

## Features

- **Instant app generation** — Any AI response can become an interactive React app with one click
- **17 built-in UI components** — Tabs, DataTable, Charts (via Recharts), Accordion, Dialog, Stat cards, and more
- **Tool integration** — File browser, media player, travel planner, meal planner, and automatic bridge to any co-loaded OpenClaw plugin's tools
- **Build custom apps** — Describe what you want, and Enso builds a full app (executors + template) that persists and can be reused
- **Refine in place** — Type an instruction in app view to regenerate just the template (single LLM call, cheapest iteration)
- **Claude Code integration** — Run `/code` to open a Claude Code session with streaming terminal output and interactive questions
- **Multi-machine remote access** — Connect from anywhere via Cloudflare Tunnel with token auth
- **Mobile-first** — Android app (Capacitor), PWA support, QR code pairing from phone to PC
- **Dark theme** — Designed for comfortable extended use

## Built-in Apps

Enso ships with production-ready interactive apps that showcase the platform's range. Every app is generated from tool results — the same pipeline you use to build your own.

### 🔍 Web Researcher
Ask any question and get a structured research board with key findings, confidence levels, source attribution, embedded videos, and images. Drill into subtopics, compare two topics side-by-side, ask follow-up questions in context, or email the full report.

### 🏙️ City Planner
Say "plan a trip to Tokyo" and get an interactive travel board — restaurants with ratings and cuisine filters, photo spots, landmarks, and YouTube video guides. Click any place for a detailed modal. Send the full itinerary as an HTML email.

### 📸 Photo Gallery
Browse your local photo library with AI-powered descriptions, EXIF metadata, search, favorites, star ratings, and batch tagging. Full lightbox viewer with keyboard navigation. Organize photos into collections.

### 🌐 Remote Browser
A full web browser inside a chat card. Navigate to URLs, click on the page screenshot to interact, type into forms, scroll, and manage bookmarks — all through the agent.

### 📂 File Manager
Desktop-grade file browser with breadcrumb navigation, sorting, search, inline previews (text, images, video, audio), and full CRUD operations — create folders, rename, delete, all with confirmation dialogs.

### 🛒 ClawHub Store
Browse, search, and install OpenClaw skills from the ClawHub marketplace. View skill details, requirements, and README — then install or uninstall with one click.

### 💻 Workspace Studio
Scan your development environment — detect git repositories, discover installed dev tools (Node, Python, Docker, etc.), and get project structure overviews with file type statistics.

### ➕ Build Your Own
Any of these can be built from scratch. Describe what you want in natural language, and Enso's build pipeline creates a full app (executors + template) that persists and can be reused. Or use the Refine flow to iterate on any existing app with a single instruction.

## The Self-Evolving Loop

Enso includes a built-in coding environment that closes the loop — the app can build and modify itself from within.

**`/code`** opens a full [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) terminal session directly inside Enso. You get streaming output, file editing, and interactive yes/no questions — all rendered as chat cards without leaving the app.

This creates an organic evolution cycle:

```
Use Enso → notice a missing feature → /code "add a weather app"
→ Claude Code edits the codebase → new app appears → use it → refine it → repeat
```

Three paths to build, from easiest to most powerful:

| Method | What happens | Best for |
|--------|-------------|----------|
| **Enhance** | One-click React UI from any response | Quick visualizations |
| **Build App** | Describe in natural language → Claude Code builds the full app in a live terminal | New tool families |
| **`/code`** | Full coding agent edits the actual source code | Deep changes, new integrations, evolving the platform itself |

The server, the apps, and the platform itself all grow from within — no separate IDE or deployment pipeline needed.

## Quick Start

### Windows

```powershell
git clone https://github.com/Proxy2021/Enso.git
cd Enso
.\scripts\install.ps1
```

### macOS / Linux

```bash
git clone https://github.com/Proxy2021/Enso.git
cd Enso
./scripts/install.sh
```

The install script handles everything: dependencies, OpenClaw onboarding (model + API key setup), build, and server start. A QR code is displayed at the end for connecting your phone.

See [SETUP.md](SETUP.md) for the full setup guide.

## Architecture

```
Browser / Android App
    │
    │  WebSocket (text, streaming, actions)
    ▼
Enso Server (:3001)          ← Express + WS, started by OpenClaw gateway
    │
    ▼
OpenClaw Gateway (:18789)    ← Agent routing, tool dispatch
    │
    ▼
LLM (Gemini, OpenAI, etc.)  ← Configured during onboarding
```

**Frontend**: React 19 · Zustand · Tailwind CSS 4 · Recharts · Lucide · Vite 6
**Backend**: Express · WebSocket · TypeScript · OpenClaw Plugin SDK
**Mobile**: Capacitor (Android) · PWA

## Project Structure

```
src/                          Frontend (React + Vite)
├── cards/                    Card renderers (DynamicUI, Terminal, etc.)
├── components/               Timeline, ChatInput, ConnectionPicker, SetupWizard
├── store/chat.ts             Zustand state management
└── lib/                      WS client, sandbox, EnsoUI components, connections

openclaw-plugin/              Backend (OpenClaw channel plugin)
├── src/
│   ├── server.ts             Express + WS server
│   ├── outbound.ts           Response delivery + enhance + action dispatch
│   ├── ui-generator.ts       LLM-based UI generation
│   ├── tool-factory.ts       App build pipeline
│   └── native-tools/         Auto-bridge for any OpenClaw plugin's tools
└── apps/                     Built-in app templates

scripts/                      Install scripts + QR code tools
shared/types.ts               Shared WebSocket protocol types
```

## Development

```bash
npm run dev          # Frontend dev server (Vite, port 5173)
npm run build        # Production build
```

Requires a running OpenClaw gateway with the Enso plugin enabled. The Vite dev server proxies WebSocket and media requests to `localhost:3001`.

## Documentation

- [SETUP.md](SETUP.md) — Quick start and setup guide
- [openclaw-plugin/SETUP.md](openclaw-plugin/SETUP.md) — Detailed plugin configuration, remote access, Cloudflare Tunnel, multi-machine setup
- [CLAUDE-REFERENCE.md](CLAUDE-REFERENCE.md) — App building API reference, template rules, EnsoUI components

## License

MIT
