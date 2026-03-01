# Enso

**Every AI answer is an interactive app.**

Enso is an [OpenClaw](https://github.com/nicepkg/openclaw) channel plugin that turns conversational AI into on-demand interactive experiences. Ask a question and get a clean text response — then tap a button to transform it into a live React application with charts, tables, controls, and actions.

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
