import type { ClientMessage, ServerMessage } from "@shared/types";
import { STORAGE_KEYS, TIMINGS, API } from "./constants";
import { reportError } from "./error-reporter";
import { isNative } from "./platform";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export interface WSStateChangeMeta {
  isServerRestart?: boolean;
}

interface WSClientOptions {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onStateChange: (state: ConnectionState, isReconnect: boolean, meta?: WSStateChangeMeta) => void;
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
export function getClientId(): string {
  const storage = isNative ? localStorage : sessionStorage;
  let id = storage.getItem(STORAGE_KEYS.CLIENT_ID);
  // Migrate: if native and sessionStorage has an ID but localStorage doesn't, adopt it
  if (!id && isNative) {
    id = sessionStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  }
  if (!id) {
    id = crypto.randomUUID();
  }
  storage.setItem(STORAGE_KEYS.CLIENT_ID, id);
  return id;
}

// ── HTTP-based WS debug logging ──
// Sends WS lifecycle events via fetch() POST to /api/ws-debug so they arrive
// even when the WebSocket is down.  Enable by setting localStorage key
// "enso-ws-debug" to "1".  Batches events and flushes every 2s.
const _debugLog: Array<{ event: string; ts: number; detail?: string }> = [];
let _debugFlushTimer: ReturnType<typeof setTimeout> | null = null;
let _debugBaseUrl = "";
let _debugClientId = "";
let _debugEnabled = false;

function wsDebug(event: string, detail?: string) {
  if (!_debugEnabled) return;
  _debugLog.push({ event, ts: Date.now(), detail });
  if (_debugLog.length >= 10) flushDebugLog();
  else if (!_debugFlushTimer) _debugFlushTimer = setTimeout(flushDebugLog, TIMINGS.DEBUG_FLUSH);
}

function flushDebugLog() {
  if (_debugFlushTimer) { clearTimeout(_debugFlushTimer); _debugFlushTimer = null; }
  if (_debugLog.length === 0 || !_debugBaseUrl) return;
  const entries = _debugLog.splice(0);
  fetch(`${_debugBaseUrl}${API.WS_DEBUG}`, {
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
  let disconnectedAt = 0;
  let lastCloseWasRestart = false;

  const clientId = getClientId();
  _debugClientId = clientId;
  _debugEnabled = localStorage.getItem(STORAGE_KEYS.WS_DEBUG) === "1";
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
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    options.onStateChange("connecting", false);

    // Append persistent clientId so backend can swap WS on reconnect
    const url = new URL(options.url, location.href);
    url.searchParams.set("clientId", clientId);
    ws = new WebSocket(url.toString());

    ws.onopen = () => {
      const isReconnect = hasConnectedBefore;
      const wasRestart = lastCloseWasRestart;
      hasConnectedBefore = true;
      lastCloseWasRestart = false;
      reconnectDelay = 1000;
      wsDebug("open", `isReconnect=${isReconnect} wasRestart=${wasRestart}`);
      options.onStateChange("connected", isReconnect, { isServerRestart: wasRestart });

      // Flush queued messages that were sent during reconnect
      // Clear queue if disconnect lasted > 60s (messages are stale)
      if (pendingMessages.length > 0) {
        const disconnectDuration = disconnectedAt > 0 ? Date.now() - disconnectedAt : 0;
        if (disconnectDuration > TIMINGS.STALE_QUEUE_THRESHOLD) {
          wsDebug("clear-stale-queue", `count=${pendingMessages.length} disconnectedFor=${disconnectDuration}ms`);
          pendingMessages.length = 0;
        } else {
          wsDebug("flush-queue", `count=${pendingMessages.length}`);
          const queued = pendingMessages.splice(0);
          for (const m of queued) {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(m));
            }
          }
        }
      }
      disconnectedAt = 0;
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
      lastCloseWasRestart = ev.code === 4078;
      wsDebug("close", `code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean} isRestart=${lastCloseWasRestart}`);
      disconnectedAt = Date.now();
      options.onStateChange("disconnected", false, { isServerRestart: lastCloseWasRestart });
      if (!intentionalClose) {
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
          connect();
        }, reconnectDelay);
      }
    };

    ws.onerror = () => {
      wsDebug("error");
      // onclose will fire after this
    };
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    // Remove event listeners to prevent leaks on repeated createWSClient calls
    window.removeEventListener("online", onNetworkRecovery);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    ws?.close();
    ws = null;
  }

  // ── Message queue for messages sent during reconnect ──
  const pendingMessages: ClientMessage[] = [];
  const MAX_PENDING = 50;

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      // Queue messages during reconnect instead of dropping them
      if (pendingMessages.length < MAX_PENDING) {
        pendingMessages.push(msg);
      }
      console.warn("[WS] Message queued — not connected. readyState:", ws?.readyState, "msg:", msg.type, "queued:", pendingMessages.length);
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

  function onVisibilityChange() {
    if (document.visibilityState === "visible") onNetworkRecovery();
  }

  window.addEventListener("online", onNetworkRecovery);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return { connect, disconnect, send };
}
