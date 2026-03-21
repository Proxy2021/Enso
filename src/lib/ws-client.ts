import type { ClientMessage, ServerMessage } from "@shared/types";
import { reportError } from "./error-reporter";
import { isNative } from "./platform";

export type ConnectionState = "connecting" | "connected" | "disconnected";

interface WSClientOptions {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onStateChange: (state: ConnectionState, isReconnect: boolean) => void;
}

interface WSClient {
  connect: () => void;
  disconnect: () => void;
  send: (msg: ClientMessage) => void;
}

/**
 * Persistent client identity.
 * On native (mobile), use localStorage so the ID survives app restarts
 * and chat history is properly restored.
 * On web, use sessionStorage so each tab gets its own identity.
 */
function getClientId(): string {
  const storage = isNative ? localStorage : sessionStorage;
  let id = storage.getItem("enso-clientId");
  // Migrate: if native and sessionStorage has an ID but localStorage doesn't, adopt it
  if (!id && isNative) {
    id = sessionStorage.getItem("enso-clientId");
  }
  if (!id) {
    id = crypto.randomUUID();
  }
  storage.setItem("enso-clientId", id);
  return id;
}

// ── HTTP-based WS debug logging ──
// Sends WS lifecycle events via fetch() so they arrive even when WS is down.
// Batches events and flushes every 2s or when buffer hits 10 entries.
const _debugLog: Array<{ event: string; ts: number; detail?: string }> = [];
let _debugFlushTimer: ReturnType<typeof setTimeout> | null = null;
let _debugBaseUrl = "";
let _debugClientId = "";

function wsDebug(event: string, detail?: string) {
  _debugLog.push({ event, ts: Date.now(), detail });
  if (_debugLog.length >= 10) flushDebugLog();
  else if (!_debugFlushTimer) _debugFlushTimer = setTimeout(flushDebugLog, 2000);
}

function flushDebugLog() {
  if (_debugFlushTimer) { clearTimeout(_debugFlushTimer); _debugFlushTimer = null; }
  if (_debugLog.length === 0 || !_debugBaseUrl) return;
  const entries = _debugLog.splice(0);
  const url = `${_debugBaseUrl}/api/ws-debug`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: _debugClientId, entries }),
  }).catch(() => { /* best-effort */ });
}

export function createWSClient(options: WSClientOptions): WSClient {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let intentionalClose = false;
  let hasConnectedBefore = false;
  let connectAttempt = 0;

  // Derive HTTP base URL for debug endpoint from the WS URL
  const clientId = getClientId();
  _debugClientId = clientId;
  try {
    const parsed = new URL(options.url, location.href);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "";
    parsed.search = "";
    _debugBaseUrl = parsed.origin;
  } catch { _debugBaseUrl = location.origin; }

  wsDebug("init", `clientId=${clientId} native=${isNative} url=${options.url}`);

  function connect() {
    intentionalClose = false;
    // Skip if already connected or connecting
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      wsDebug("connect-skip", `readyState=${ws.readyState}`);
      return;
    }
    connectAttempt++;
    const attempt = connectAttempt;
    wsDebug("connecting", `attempt=${attempt} delay=${reconnectDelay}`);
    options.onStateChange("connecting", false);

    // Append persistent clientId so backend can swap WS on reconnect
    const url = new URL(options.url, location.href);
    url.searchParams.set("clientId", clientId);
    ws = new WebSocket(url.toString());

    ws.onopen = () => {
      const isReconnect = hasConnectedBefore;
      hasConnectedBefore = true;
      reconnectDelay = 1000;
      wsDebug("open", `attempt=${attempt} isReconnect=${isReconnect}`);
      options.onStateChange("connected", isReconnect);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        options.onMessage(msg);
      } catch {
        console.error("[WS] Failed to parse message");
        reportError("Failed to parse WebSocket message", "ws");
      }
    };

    ws.onclose = (ev) => {
      wsDebug("close", `attempt=${attempt} code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean} intentional=${intentionalClose}`);
      options.onStateChange("disconnected", false);
      if (!intentionalClose) {
        wsDebug("scheduling-reconnect", `delay=${reconnectDelay}ms`);
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
          connect();
        }, reconnectDelay);
      }
    };

    ws.onerror = () => {
      wsDebug("error", `attempt=${attempt}`);
      // onclose will fire after this
    };
  }

  function disconnect() {
    wsDebug("disconnect-intentional");
    intentionalClose = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  }

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      console.warn("[WS] Message dropped — not connected. readyState:", ws?.readyState, "msg:", msg.type);
    }
  }

  // ── Network & visibility recovery ──
  // When the browser comes back online or the tab becomes visible again,
  // attempt an immediate reconnect instead of waiting for the backoff timer.
  function onNetworkRecovery() {
    if (intentionalClose) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;
    wsDebug("network-recovery", `online=${navigator.onLine} visibility=${document.visibilityState}`);
    // Clear any pending backoff timer — reconnect now
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectDelay = 1000;
    connect();
  }

  window.addEventListener("online", onNetworkRecovery);
  window.addEventListener("offline", () => wsDebug("offline"));
  document.addEventListener("visibilitychange", () => {
    wsDebug("visibilitychange", `state=${document.visibilityState}`);
    if (document.visibilityState === "visible") onNetworkRecovery();
  });

  return { connect, disconnect, send };
}
