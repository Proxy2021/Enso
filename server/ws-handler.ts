import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { ClientMessage, ServerMessage } from "../shared/types.js";
import { handleChat } from "./agent-bridge.js";

export function handleConnection(ws: WebSocket): void {
  const connectionId = uuidv4().slice(0, 8);
  const sessionKey = `session_${connectionId}`;
  console.log(`[WS] Client connected: ${connectionId}`);

  const send = (msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  ws.on("message", async (raw) => {
    try {
      const msg: ClientMessage = JSON.parse(raw.toString());
      console.log(`[WS] Received: ${msg.type}`, msg.text?.slice(0, 50));

      switch (msg.type) {
        case "chat.send":
          if (msg.text) {
            await handleChat(msg.text, sessionKey, send);
          }
          break;
        case "chat.history":
          // Phase 1: no history persistence
          break;
        case "ui_action":
          console.log("[WS] UI action:", msg.uiAction);
          // Phase 1: treat ui_action like a chat send
          if (msg.uiAction) {
            await handleChat(
              `UI Action: ${msg.uiAction.action} on ${msg.uiAction.componentId}`,
              sessionKey,
              send
            );
          }
          break;
      }
    } catch (err) {
      console.error("[WS] Message handling error:", err);
      send({
        id: uuidv4(),
        runId: uuidv4(),
        sessionKey,
        seq: 0,
        state: "error",
        text: "An error occurred processing your message.",
        timestamp: Date.now(),
      });
    }
  });

  ws.on("close", () => {
    console.log(`[WS] Client disconnected: ${connectionId}`);
  });
}
