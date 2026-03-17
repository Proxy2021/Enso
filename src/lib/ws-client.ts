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

export function createWSClient(options: WSClientOptions): WSClient {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let intentionalClose = false;
  let hasConnectedBefore = false;

  function connect() {
    intentionalClose = false;
    // Skip if already connected or connecting
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    options.onStateChange("connecting", false);

    // Append persistent clientId so backend can swap WS on reconnect
    const url = new URL(options.url, location.href);
    url.searchParams.set("clientId", getClientId());
    ws = new WebSocket(url.toString());

    ws.onopen = () => {
      const isReconnect = hasConnectedBefore;
      hasConnectedBefore = true;
      reconnectDelay = 1000;
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

    ws.onclose = () => {
      options.onStateChange("disconnected", false);
      if (!intentionalClose) {
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  function disconnect() {
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

  return { connect, disconnect, send };
}
