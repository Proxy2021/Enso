import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { startEnsoServer } from "./server";
import type { ClientMessage, ServerMessage } from "../../shared/types";
import { useChatStore } from "../../src/store/chat";
import type { Card } from "../../src/cards/types";

vi.mock("openclaw/plugin-sdk", () => ({
  DEFAULT_ACCOUNT_ID: "default",
  createReplyPrefixOptions: () => ({}),
}));

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeAllListeners("message");
      reject(new Error(`Timed out waiting for WS message after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.once("message", (raw) => {
      clearTimeout(timeout);
      resolve(JSON.parse(String(raw)) as ServerMessage);
    });
  });
}

function waitForMatchingMessage(
  ws: WebSocket,
  predicate: (msg: ServerMessage) => boolean,
  timeoutMs = 3000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener("message", onMessage);
      reject(new Error(`Timed out waiting for matching WS message after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      if (predicate(msg)) {
        clearTimeout(timeout);
        ws.removeListener("message", onMessage);
        resolve(msg);
      }
    };

    ws.on("message", onMessage);
  });
}

describe("Phase 1 enhancements", () => {
  afterEach(() => {
    useChatStore.setState({
      cardOrder: [],
      cards: {},
      connectionState: "disconnected",
      isWaiting: false,
      _wsClient: null,
      channelMode: "full",
      projects: [],
      codeSessionCwd: null,
      codeSessionId: null,
      _activeTerminalCardId: null,
    });
  });

  it("returns structured operation error for unknown cancellation ids", async () => {
    const port = 32981;
    const { stop } = await startEnsoServer({
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        port,
        host: "127.0.0.1",
        geminiApiKey: "",
        mode: "full",
        config: {},
      },
      config: {},
      runtime: { log: () => {}, error: () => {} } as never,
    });

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });

      const cancelMsg: ClientMessage = {
        type: "operation.cancel",
        operationId: "missing-op-id",
      };
      ws.send(JSON.stringify(cancelMsg));

      const response = await waitForMatchingMessage(
        ws,
        (msg) => msg.operation?.operationId === "missing-op-id",
      );
      expect(response.state).toBe("error");
      expect(response.operation?.operationId).toBe("missing-op-id");
      expect(response.operation?.stage).toBe("error");
      expect(response.operation?.label).toBe("Not running");

      ws.close();
    } finally {
      stop();
    }
  });

  it("updates card operation state for targeted delta and final messages", () => {
    const now = Date.now();
    const cardId = "card-1";
    const baseCard: Card = {
      id: cardId,
      runId: "run-1",
      type: "dynamic-ui",
      role: "assistant",
      status: "streaming",
      display: "expanded",
      pendingAction: "refresh",
      createdAt: now,
      updatedAt: now,
    };

    useChatStore.setState({
      cardOrder: [cardId],
      cards: { [cardId]: baseCard },
      isWaiting: true,
    });

    useChatStore.getState()._handleServerMessage({
      id: "msg-1",
      runId: "run-1",
      sessionKey: "s",
      seq: 1,
      state: "delta",
      targetCardId: cardId,
      operation: {
        operationId: "op-1",
        stage: "generating_ui",
        label: "Generating UI",
        cancellable: false,
      },
      timestamp: now + 1,
    });

    let updated = useChatStore.getState().cards[cardId]!;
    expect(updated.status).toBe("streaming");
    expect(updated.pendingAction).toBe("refresh");
    expect(updated.operation?.stage).toBe("generating_ui");
    expect(updated.operation?.label).toBe("Generating UI");

    useChatStore.getState()._handleServerMessage({
      id: "msg-2",
      runId: "run-1",
      sessionKey: "s",
      seq: 2,
      state: "final",
      targetCardId: cardId,
      operation: {
        operationId: "op-1",
        stage: "complete",
        label: "Action complete",
        cancellable: false,
      },
      timestamp: now + 2,
    });

    updated = useChatStore.getState().cards[cardId]!;
    expect(useChatStore.getState().isWaiting).toBe(false);
    expect(updated.status).toBe("complete");
    expect(updated.pendingAction).toBeUndefined();
    expect(updated.operation?.stage).toBe("complete");
    expect(updated.operation?.label).toBe("Action complete");
  });
});
