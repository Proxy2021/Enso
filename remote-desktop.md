# Remote Desktop for Enso — Research & Design Notes

## Open Source Web Remote Desktop — Major Projects

### Tier 1: Battle-Tested & Widely Deployed

| Project | Tech Stack | Protocol | Latency | Stars |
|---------|-----------|----------|---------|-------|
| [noVNC](https://github.com/novnc/noVNC) | JavaScript + HTML5 Canvas | VNC over WebSocket | ~50-100ms | 12k+ |
| [Apache Guacamole](https://guacamole.apache.org/doc/gug/guacamole-architecture.html) | Java (guacd) + JS client | VNC/RDP/SSH → custom protocol | ~80-150ms | 5k+ |
| [RustDesk](https://github.com/rustdesk/rustdesk) | Rust + Flutter + WebSocket | Custom (VP9/AV1) | ~30-80ms | 80k+ |
| [n.eko](https://github.com/m1k1o/neko) | Go + WebRTC | WebRTC (H.264) | ~20-50ms | 8k+ |

### Tier 2: Lightweight / Docker-Based

| Project | Approach |
|---------|----------|
| [Webtop](https://github.com/linuxserver/docker-webtop) | Full Linux desktop in Docker, served via browser |
| [Myrtille](https://github.com/cedrozor/myrtille) | HTTP(S) → RDP gateway, pure web client, Windows-native |
| [websockify](https://github.com/novnc/websockify) | WebSocket↔TCP bridge (pairs with noVNC) |

---

## Architecture Patterns (Ranked by Complexity)

### Pattern A: Screenshot Streaming (Simplest — Best Fit for Enso)

```
[Windows Desktop]
       │
   node-screenshots / screenshot-desktop  (native Node.js, ~5-30 FPS)
       │  JPEG/PNG buffer
       ▼
   Enso Gateway (Express + WebSocket, port 3001)
       │  binary frames over existing WS
       ▼
   Enso React Frontend (Canvas render + mouse/keyboard events)
       │
   nut.js / robotjs  ←── keyboard & mouse input forwarded back
```

**Key libraries:**
- [node-screenshots](https://github.com/nashaofu/node-screenshots) — zero-dependency, native, Win/Mac/Linux
- [nut.js](https://nutjs.dev/) — mouse move, click, keyboard type, screen grab
- [screenshot-desktop](https://www.npmjs.com/package/screenshot-desktop) — simple API, returns Buffer

**Pros:** Pure Node.js, plugs directly into existing WebSocket, no external servers
**Cons:** ~5-15 FPS for full desktop, fine for task-level interaction but not video playback

---

### Pattern B: noVNC + Local VNC Server (Proven, Moderate Effort)

```
[Windows Desktop]
       │
   TightVNC / UltraVNC server  (runs locally, port 5900)
       │  RFB protocol
       ▼
   websockify  (WebSocket↔TCP bridge, Node.js or Python)
       │  VNC over WebSocket
       ▼
   noVNC client  (embedded in Enso React app via iframe or component)
```

**Pros:** Mature, handles 30+ FPS, clipboard sync, multi-monitor
**Cons:** Requires installing a VNC server, another moving part

---

### Pattern C: WebRTC Streaming (Best Quality, Most Complex)

```
[Windows Desktop]
       │
   ffmpeg screen capture  (GDI/DXGI grab → H.264 encode)
       │  RTP stream
       ▼
   WebRTC signaling server  (in Enso gateway)
       │  ICE/SDP negotiation over existing WS
       ▼
   Browser <video> element  (hardware-decoded, <50ms latency)
```

**Reference implementations:**
- [n.eko](https://github.com/m1k1o/neko) — Go backend, does exactly this
- [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — direct frame decode in browser
- [JSMpeg](https://jsmpeg.com/) — MPEG1 decode via WebSocket, ~50ms latency

**Pros:** 60 FPS, hardware-accelerated, lowest latency
**Cons:** Needs ffmpeg, WebRTC NAT traversal (though localhost simplifies this massively)

---

## Feasibility for Enso

| Factor | Assessment |
|--------|-----------|
| **Can it be done?** | ✅ Absolutely yes |
| **Does it fit Enso's architecture?** | ✅ We already have WebSocket + React + local Node.js |
| **Effort for Pattern A** | 🟢 **1-2 days** — `node-screenshots` + `nut.js` + Canvas |
| **Effort for Pattern B** | 🟡 **3-5 days** — noVNC embed + VNC server setup |
| **Effort for Pattern C** | 🔴 **1-2 weeks** — WebRTC signaling + ffmpeg pipeline |
| **Unique to Enso** | 🌟 **AI-augmented remote desktop** — not just view, but *understand* |

---

## The Enso Superpower: AI-Augmented Desktop

What makes this different from plain remote desktop: **Enso can see AND understand the screen**. Gemini Vision is already wired up. Example:

> "Click the Excel file on my desktop, open it, and summarize the sales data"

Flow:
1. Capture screenshot → send to Gemini Vision → "I see an Excel icon at coordinates (340, 520)"
2. `nut.js` double-clicks at (340, 520)
3. Wait, capture again → OCR the spreadsheet content
4. Summarize via LLM → return as an Enso card

That's not remote desktop — that's **an AI that can operate your computer**.

---

## Recommended Implementation Plan

### Phase 1: Pattern A as an Enso App

```
enso_remote_desktop/
├── app.json            # Tools: capture, click, type, scroll
├── executors/
│   ├── capture.js      # node-screenshots → base64 JPEG
│   ├── click.js        # nut.js mouse click at x,y
│   ├── type.js         # nut.js keyboard input
│   └── scroll.js       # nut.js scroll
└── template.jsx        # Canvas + mouse/keyboard event forwarding
```

### Phase 2: Continuous Streaming

- Upgrade from request/response to continuous frame push over WebSocket
- Delta encoding (only send changed regions) to reduce bandwidth
- Adaptive FPS based on activity detection

### Phase 3: WebRTC Upgrade (Optional)

- Replace JPEG streaming with H.264 via WebRTC
- Add audio capture/forwarding
- Multi-monitor support

---

## Key Dependencies to Evaluate

| Package | Purpose | Platform |
|---------|---------|----------|
| `node-screenshots` | Screen capture → Buffer | Win/Mac/Linux |
| `screenshot-desktop` | Simpler capture API | Win/Mac/Linux |
| `nut.js` | Mouse, keyboard, screen automation | Win/Mac/Linux |
| `robotjs` | Alternative to nut.js (C++ bindings) | Win/Mac/Linux |
| `sharp` | JPEG compression / resize for bandwidth | All |
| `noVNC` | VNC client in browser (Pattern B) | Browser |
| `websockify` | WebSocket↔TCP bridge (Pattern B) | Node.js/Python |
