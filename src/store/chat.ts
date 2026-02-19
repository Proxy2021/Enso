import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { ChannelMode, ClientMessage, ServerMessage, ToolRouting } from "@shared/types";
import type { Card } from "../cards/types";
import { cardRegistry } from "../cards/registry";
import { createWSClient, type ConnectionState } from "../lib/ws-client";

export interface ProjectInfo {
  name: string;
  path: string;
}

interface CardStore {
  // Card state (normalized)
  cardOrder: string[];
  cards: Record<string, Card>;

  // Connection & session
  connectionState: ConnectionState;
  isWaiting: boolean;
  _wsClient: ReturnType<typeof createWSClient> | null;

  // Channel mode
  channelMode: ChannelMode;

  // Claude Code session state
  projects: ProjectInfo[];
  codeSessionCwd: string | null;
  codeSessionId: string | null;

  // Internal: active terminal card
  _activeTerminalCardId: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (text: string, routing?: ToolRouting) => void;
  sendMessageWithMedia: (text: string, mediaFiles: File[]) => Promise<void>;
  sendCardAction: (cardId: string, action: string, payload?: unknown) => void;
  enhanceCard: (cardId: string) => void;
  toggleCardView: (cardId: string, viewMode: "original" | "app") => void;
  cancelOperation: (operationId: string) => void;
  collapseCard: (cardId: string) => void;
  expandCard: (cardId: string) => void;
  setChannelMode: (mode: ChannelMode) => void;
  fetchProjects: () => void;
  setCodeSessionCwd: (cwd: string) => void;
  _handleServerMessage: (msg: ServerMessage) => void;
}

/** Format a card action + payload into a readable user-facing label. */
function formatActionLabel(action: string, payload?: unknown): string {
  const name = action
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (!payload || typeof payload !== "object") return name;
  const p = payload as Record<string, unknown>;

  // Pick the most descriptive value from the payload
  const hint =
    p.toolName ?? p.name ?? p.title ?? p.item ?? p.text ?? p.id ?? p.emailId ?? p.tickerId;
  if (hint != null) return `${name}: ${String(hint)}`;
  return name;
}

function formatActionOutcome(mode: ChannelMode): string {
  if (mode === "ui") return "creates a follow-up card";
  if (mode === "full") return "updates the current card";
  return "runs an action";
}

export const useChatStore = create<CardStore>((set, get) => ({
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

  connect: () => {
    const existing = get()._wsClient;
    if (existing) return;

    const wsUrl =
      location.protocol === "https:"
        ? `wss://${location.host}/ws`
        : `ws://${location.host}/ws`;

    const client = createWSClient({
      url: wsUrl,
      onMessage: (msg) => get()._handleServerMessage(msg),
      onStateChange: (state) => set({ connectionState: state }),
    });

    set({ _wsClient: client });
    client.connect();
  },

  disconnect: () => {
    get()._wsClient?.disconnect();
    set({ _wsClient: null, connectionState: "disconnected" });
  },

  sendMessage: (text: string, routing?: ToolRouting) => {
    let displayText = text;
    let finalRouting = routing;

    // Bare "/code" opens project picker
    if (text.trim() === "/code") {
      get().fetchProjects();
      const id = uuidv4();
      const now = Date.now();
      const card: Card = {
        id,
        runId: id,
        type: "terminal",
        role: "assistant",
        status: "complete",
        display: "expanded",
        toolMeta: { toolId: "claude-code" },
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({
        cardOrder: [...s.cardOrder, id],
        cards: { ...s.cards, [id]: card },
        _activeTerminalCardId: id,
      }));
      return;
    }

    // /code prefix auto-routes to claude-code tool
    if (!finalRouting && text.startsWith("/code ")) {
      displayText = text.slice(6);
      const cwd = get().codeSessionCwd;
      const toolSessionId = get().codeSessionId;
      finalRouting = {
        mode: "direct_tool",
        toolId: "claude-code",
        ...(toolSessionId ? { toolSessionId } : {}),
        ...(cwd ? { cwd } : {}),
      };
    }

    // Terminal routing: append to active terminal card
    if (finalRouting?.toolId === "claude-code") {
      const now = Date.now();
      let termCardId = get()._activeTerminalCardId;

      if (!termCardId) {
        // Create a terminal card if none exists
        termCardId = uuidv4();
        const card: Card = {
          id: termCardId,
          runId: termCardId,
          type: "terminal",
          role: "assistant",
          status: "streaming",
          display: "expanded",
          text: `>>> ${displayText}\n`,
          toolMeta: { toolId: "claude-code" },
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          cardOrder: [...s.cardOrder, termCardId!],
          cards: { ...s.cards, [termCardId!]: card },
          _activeTerminalCardId: termCardId,
          isWaiting: true,
        }));
      } else {
        // Append user prompt to existing terminal card
        set((s) => {
          const card = s.cards[termCardId!];
          if (!card) return s;
          return {
            cards: {
              ...s.cards,
              [termCardId!]: {
                ...card,
                text: (card.text ?? "") + `>>> ${displayText}\n`,
                status: "streaming",
                pendingQuestions: undefined, // clear questions when user responds
                updatedAt: now,
              },
            },
            isWaiting: true,
          };
        });
      }

      get()._wsClient?.send({ type: "chat.send", text: displayText, routing: finalRouting });
      return;
    }

    // Regular message — create user bubble card
    const id = uuidv4();
    const now = Date.now();
    const card: Card = {
      id,
      runId: id,
      type: "user-bubble",
      role: "user",
      status: "complete",
      display: "expanded",
      text: displayText,
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({
      cardOrder: [...s.cardOrder, id],
      cards: { ...s.cards, [id]: card },
      isWaiting: true,
    }));
    get()._wsClient?.send({ type: "chat.send", text: displayText, routing: finalRouting });
  },

  sendMessageWithMedia: async (text: string, mediaFiles: File[]) => {
    const serverPaths: string[] = [];
    const previewUrls: string[] = [];

    for (const file of mediaFiles) {
      const res = await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (res.ok) {
        const { filePath, mediaUrl } = await res.json();
        serverPaths.push(filePath);
        previewUrls.push(mediaUrl);
      }
    }

    const id = uuidv4();
    const now = Date.now();
    const card: Card = {
      id,
      runId: id,
      type: "user-bubble",
      role: "user",
      status: "complete",
      display: "expanded",
      text,
      mediaUrls: previewUrls,
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({
      cardOrder: [...s.cardOrder, id],
      cards: { ...s.cards, [id]: card },
      isWaiting: true,
    }));
    get()._wsClient?.send({
      type: "chat.send",
      text,
      mediaUrls: serverPaths,
    });
  },

  sendCardAction: (cardId: string, action: string, payload?: unknown) => {
    const card = get().cards[cardId];
    if (!card) {
      console.warn("[card-action] Card not found:", cardId);
      return;
    }
    if (card.status === "streaming") {
      console.log("[card-action] Ignored while card is busy:", cardId, action);
      return;
    }

    // Optimistic loading state with action label
    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...s.cards[cardId]!,
          status: "streaming",
          pendingAction: action,
          operation: card.operation
            ? { ...card.operation, stage: "processing", label: "Processing action", cancellable: false }
            : undefined,
          updatedAt: Date.now(),
        },
      },
    }));

    // Create an action bubble so the user sees what was clicked
    const mode = get().channelMode;
    if (mode === "ui" || mode === "full") {
      const bubbleId = uuidv4();
      const now = Date.now();
      const label = formatActionLabel(action, payload);
      const outcome = formatActionOutcome(mode);
      const bubble: Card = {
        id: bubbleId,
        runId: bubbleId,
        type: "user-bubble",
        role: "user",
        status: "complete",
        display: "expanded",
        text: `Action: ${label} (${outcome})`,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({
        cardOrder: [...s.cardOrder, bubbleId],
        cards: { ...s.cards, [bubbleId]: bubble },
        isWaiting: true,
      }));
    }

    const wsClient = get()._wsClient;
    const msg: ClientMessage = {
      type: "card.action",
      mode,
      cardId,
      cardAction: action,
      cardPayload: payload,
      routing: card.toolMeta ? { mode: "direct_tool" as const, toolId: card.toolMeta.toolId } : undefined,
    };
    console.log("[card-action] Sending:", msg);
    if (!wsClient) {
      console.error("[card-action] No WS client!");
      set((s) => ({
        cards: {
          ...s.cards,
          [cardId]: {
            ...s.cards[cardId]!,
            status: "error",
            pendingAction: undefined,
            updatedAt: Date.now(),
          },
        },
      }));
      return;
    }
    wsClient.send(msg);
  },

  enhanceCard: (cardId: string) => {
    const card = get().cards[cardId];
    if (!card || card.enhanceStatus === "loading") return;

    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...s.cards[cardId]!,
          enhanceStatus: "loading",
          updatedAt: Date.now(),
        },
      },
    }));

    get()._wsClient?.send({
      type: "card.enhance",
      cardId,
      cardText: card.text ?? "",
    });
  },

  toggleCardView: (cardId: string, viewMode: "original" | "app") => {
    set((s) => {
      const card = s.cards[cardId];
      if (!card) return s;
      return {
        cards: {
          ...s.cards,
          [cardId]: { ...card, viewMode, updatedAt: Date.now() },
        },
      };
    });
  },

  cancelOperation: (operationId: string) => {
    get()._wsClient?.send({ type: "operation.cancel", operationId });
  },

  collapseCard: (cardId: string) => {
    set((s) => {
      const card = s.cards[cardId];
      if (!card) return s;
      return {
        cards: {
          ...s.cards,
          [cardId]: { ...card, display: "collapsed" },
        },
      };
    });
  },

  expandCard: (cardId: string) => {
    set((s) => {
      const card = s.cards[cardId];
      if (!card) return s;
      return {
        cards: {
          ...s.cards,
          [cardId]: { ...card, display: "expanded" },
        },
      };
    });
  },

  setChannelMode: (mode: ChannelMode) => {
    set({ channelMode: mode });
    get()._wsClient?.send({ type: "settings.set_mode", mode });
  },

  fetchProjects: () => {
    get()._wsClient?.send({ type: "tools.list_projects" });
  },

  setCodeSessionCwd: (cwd: string) => {
    set({ codeSessionCwd: cwd });
  },

  _handleServerMessage: (msg: ServerMessage) => {
    // Handle settings messages (mode changes)
    if (msg.settings) {
      set({ channelMode: msg.settings.mode });
      return;
    }

    // Handle project list responses
    if (msg.projects) {
      set({ projects: msg.projects });
      return;
    }

    set((state) => {
      const now = Date.now();

      // ── Route card updates by targetCardId ──
      if (msg.targetCardId) {
        const card = state.cards[msg.targetCardId];
        if (!card) return state;

        // Handle enhance result (user-triggered app enhancement)
        if (msg.enhanceResult !== undefined) {
          if (msg.enhanceResult === null) {
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  enhanceStatus: "unavailable",
                  updatedAt: now,
                },
              },
            };
          }
          return {
            cards: {
              ...state.cards,
              [msg.targetCardId]: {
                ...card,
                appData: msg.enhanceResult.data,
                appGeneratedUI: msg.enhanceResult.generatedUI,
                appCardMode: msg.enhanceResult.cardMode,
                enhanceStatus: "ready",
                viewMode: "app",
                updatedAt: now,
              },
            },
          };
        }

        const isAppView = card.viewMode === "app" && card.enhanceStatus === "ready";
        const updatedCard: Card = {
          ...card,
          text: msg.text ?? card.text,
          status:
            msg.state === "error"
              ? "error"
              : msg.state === "delta"
                ? "streaming"
                : "complete",
          pendingAction: msg.state === "delta" ? card.pendingAction : undefined,
          operation:
            msg.operation ??
            (msg.state === "delta"
              ? card.operation
              : undefined),
          cardMode: msg.cardMode ?? card.cardMode,
          updatedAt: now,
        };

        if (isAppView) {
          if (msg.data != null) updatedCard.appData = msg.data;
          if (msg.generatedUI != null) updatedCard.appGeneratedUI = msg.generatedUI;
          if (msg.cardMode != null) updatedCard.appCardMode = msg.cardMode;
          updatedCard.data = msg.data ?? card.data;
          updatedCard.generatedUI = msg.generatedUI ?? card.generatedUI;
        } else {
          updatedCard.data = msg.data ?? card.data;
          updatedCard.generatedUI = msg.generatedUI ?? card.generatedUI;
        }

        return {
          isWaiting: msg.state === "delta" ? state.isWaiting : false,
          cards: {
            ...state.cards,
            [msg.targetCardId]: updatedCard,
          },
        };
      }

      // ── Route claude-code messages to active terminal card ──
      if (msg.toolMeta?.toolId === "claude-code" && state._activeTerminalCardId) {
        const cardId = state._activeTerminalCardId;
        const card = state.cards[cardId];
        if (!card) return { isWaiting: false };

        if (msg.state === "delta") {
          // When questions arrive, Claude is blocked waiting for input —
          // mark the card as complete so buttons render and cursor stops.
          const hasQuestions = msg.questions && msg.questions.length > 0;
          return {
            ...(hasQuestions ? { isWaiting: false } : {}),
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                text: (card.text ?? "") + (msg.text ?? ""),
                status: hasQuestions ? "complete" : "streaming",
                toolMeta: msg.toolMeta ?? card.toolMeta,
                operation: msg.operation ?? card.operation,
                cardMode: msg.cardMode ?? card.cardMode,
                ...(hasQuestions ? { pendingQuestions: msg.questions } : {}),
                updatedAt: now,
              },
            },
          };
        }

        const storeUpdates: Partial<CardStore> = { isWaiting: false };

        if (msg.state === "final") {
          if (msg.toolMeta?.toolSessionId) {
            storeUpdates.codeSessionId = msg.toolMeta.toolSessionId;
          }
          return {
            ...storeUpdates,
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                // Don't replace text — deltas already delivered the full output
                status: "complete",
                toolMeta: msg.toolMeta ?? card.toolMeta,
                operation: msg.operation,
                cardMode: msg.cardMode ?? card.cardMode,
                updatedAt: now,
              },
            },
          };
        }

        if (msg.state === "error") {
          return {
            ...storeUpdates,
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                text: (card.text ?? "") + (msg.text ?? "Error occurred."),
                status: "error",
                toolMeta: msg.toolMeta ?? card.toolMeta,
                operation: msg.operation,
                cardMode: msg.cardMode ?? card.cardMode,
                updatedAt: now,
              },
            },
          };
        }

        return state;
      }

      // ── Normal card flow ──
      // Find existing card by runId (assistant role)
      const existingId = state.cardOrder.find(
        (id) => state.cards[id]?.runId === msg.runId && state.cards[id]?.role === "assistant",
      );
      const existing = existingId ? state.cards[existingId] : undefined;

      if (msg.state === "delta") {
        // Don't clear isWaiting on delta — wait for final/error
        if (existing && existingId) {
          return {
            cards: {
              ...state.cards,
              [existingId]: {
                ...existing,
                text: (existing.text ?? "") + (msg.text ?? ""),
                status: "streaming",
                operation: msg.operation ?? existing.operation,
                cardMode: msg.cardMode ?? existing.cardMode,
                updatedAt: now,
              },
            },
          };
        }
        // Create new card — use "chat" type during streaming (will resolve on final)
        const cardId = msg.id;
        const card: Card = {
          id: cardId,
          runId: msg.runId,
          type: "chat",
          role: "assistant",
          status: "streaming",
          display: "expanded",
          text: msg.text ?? "",
          toolMeta: msg.toolMeta,
          operation: msg.operation,
          cardMode: msg.cardMode,
          createdAt: now,
          updatedAt: now,
        };
        return {
          cardOrder: [...state.cardOrder, cardId],
          cards: { ...state.cards, [cardId]: card },
        };
      }

      if (msg.state === "final") {
        const mergedMediaUrls = [
          ...(existing?.mediaUrls ?? []),
          ...(msg.mediaUrls ?? []),
        ];
        const mediaUrls = mergedMediaUrls.length > 0 ? mergedMediaUrls : undefined;

        const storeUpdates: Partial<CardStore> = { isWaiting: false };
        if (msg.toolMeta?.toolId === "claude-code" && msg.toolMeta.toolSessionId) {
          storeUpdates.codeSessionId = msg.toolMeta.toolSessionId;
        }

        // Resolve card type from the full message
        const type = msg.cardType ?? cardRegistry.resolve(msg, "assistant");

        if (existing && existingId) {
          return {
            ...storeUpdates,
            cards: {
              ...state.cards,
              [existingId]: {
                ...existing,
                text: msg.text ?? existing.text,
                data: msg.data ?? existing.data,
                generatedUI: msg.generatedUI ?? existing.generatedUI,
                mediaUrls,
                toolMeta: msg.toolMeta ?? existing.toolMeta,
                type,
                status: "complete",
                operation: msg.operation,
                cardMode: msg.cardMode ?? existing.cardMode,
                steps: msg.steps ?? existing.steps,
                updatedAt: now,
              },
            },
          };
        }

        const cardId = msg.id;
        const card: Card = {
          id: cardId,
          runId: msg.runId,
          type,
          role: "assistant",
          status: "complete",
          display: "expanded",
          text: msg.text ?? "",
          data: msg.data,
          generatedUI: msg.generatedUI,
          mediaUrls,
          toolMeta: msg.toolMeta,
          operation: msg.operation,
          cardMode: msg.cardMode,
          steps: msg.steps,
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...storeUpdates,
          cardOrder: [...state.cardOrder, cardId],
          cards: { ...state.cards, [cardId]: card },
        };
      }

      if (msg.state === "error") {
        if (existing && existingId) {
          return {
            isWaiting: false,
            cards: {
              ...state.cards,
              [existingId]: {
                ...existing,
                text: msg.text ?? "An error occurred.",
                toolMeta: msg.toolMeta ?? existing.toolMeta,
                status: "error",
                operation: msg.operation,
                cardMode: msg.cardMode ?? existing.cardMode,
                updatedAt: now,
              },
            },
          };
        }
        const cardId = msg.id;
        const card: Card = {
          id: cardId,
          runId: msg.runId,
          type: "chat",
          role: "assistant",
          status: "error",
          display: "expanded",
          text: msg.text ?? "An error occurred.",
          toolMeta: msg.toolMeta,
          operation: msg.operation,
          cardMode: msg.cardMode,
          createdAt: now,
          updatedAt: now,
        };
        return {
          isWaiting: false,
          cardOrder: [...state.cardOrder, cardId],
          cards: { ...state.cards, [cardId]: card },
        };
      }

      return state;
    });
  },
}));
