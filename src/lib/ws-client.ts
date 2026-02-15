import type { ClientMessage, ServerMessage } from "@shared/types";

export type ConnectionState = "connecting" | "connected" | "disconnected";

interface WSClientOptions {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onStateChange: (state: ConnectionState) => void;
}

interface WSClient {
  connect: () => void;
  disconnect: () => void;
  send: (msg: ClientMessage) => void;
}

export function createWSClient(options: WSClientOptions): WSClient {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let intentionalClose = false;

  function connect() {
    intentionalClose = false;
    options.onStateChange("connecting");

    ws = new WebSocket(options.url);

    ws.onopen = () => {
      reconnectDelay = 1000;
      options.onStateChange("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        options.onMessage(msg);
      } catch {
        console.error("[WS] Failed to parse message");
      }
    };

    ws.onclose = () => {
      options.onStateChange("disconnected");
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
