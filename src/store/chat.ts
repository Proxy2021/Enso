import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { AppInfo, ClientMessage, ServerMessage, ToolRouting } from "@shared/types";
import type { Card } from "../cards/types";
import { cardRegistry } from "../cards/registry";
import { createWSClient, type ConnectionState } from "../lib/ws-client";
import {
  getActiveBackend,
  buildWsUrl,
  getBackendBaseUrl,
  authHeaders,
  setActiveBackend,
  type BackendConfig,
} from "../lib/connection";

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
  showConnectionPicker: boolean;
  _wsClient: ReturnType<typeof createWSClient> | null;

  // Apps
  apps: AppInfo[];
  toolFamilies: Array<{ toolFamily: string; description: string }>;
  ensoProjectPath: string | null;

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
  enhanceCardWithFamily: (cardId: string, family: string) => void;
  buildApp: (cardId: string, cardText: string, definition: string, conversationContext?: string) => void;
  proposeApp: (cardId: string, cardText: string, context: string) => void;
  toggleCardView: (cardId: string, viewMode: "original" | "app") => void;
  cancelOperation: (operationId: string) => void;
  collapseCard: (cardId: string) => void;
  expandCard: (cardId: string) => void;
  deleteAllApps: () => void;
  fetchApps: () => void;
  runApp: (toolFamily: string) => void;
  saveAppToCodebase: (toolFamily: string) => void;
  restartServer: () => void;
  launchEnsoCode: () => void;
  fetchProjects: () => void;
  setCodeSessionCwd: (cwd: string) => void;
  setShowConnectionPicker: (show: boolean) => void;
  connectToBackend: (config: BackendConfig) => void;
  _handleServerMessage: (msg: ServerMessage) => void;
}


export const useChatStore = create<CardStore>((set, get) => ({
  cardOrder: [],
  cards: {},
  connectionState: "disconnected",
  isWaiting: false,
  showConnectionPicker: false,
  _wsClient: null,
  apps: [],
  toolFamilies: [],
  ensoProjectPath: null,
  projects: [],
  codeSessionCwd: null,
  codeSessionId: null,
  _activeTerminalCardId: null,

  connect: () => {
    const existing = get()._wsClient;
    if (existing) return;

    const backend = getActiveBackend();
    const wsUrl = buildWsUrl(backend);

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

    // "/delete-apps" command — delete all dynamically created apps
    if (text.trim() === "/delete-apps") {
      get().deleteAllApps();
      return;
    }

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
      const res = await fetch(`${getBackendBaseUrl()}/upload`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": file.type }),
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

    set((s) => ({ isWaiting: true }));

    const wsClient = get()._wsClient;
    const msg: ClientMessage = {
      type: "card.action",
      mode: "full",
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
          suggestedFamily: undefined,
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

  enhanceCardWithFamily: (cardId: string, family: string) => {
    const card = get().cards[cardId];
    if (!card || card.enhanceStatus === "loading") return;

    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...s.cards[cardId]!,
          enhanceStatus: "loading",
          suggestedFamily: undefined,
          updatedAt: Date.now(),
        },
      },
    }));

    get()._wsClient?.send({
      type: "card.enhance",
      cardId,
      cardText: card.text ?? "",
      suggestedFamily: family,
    });
  },

  buildApp: (cardId: string, cardText: string, definition: string, conversationContext?: string) => {
    const card = get().cards[cardId];
    if (!card) return;

    // Fire-and-forget: no loading state on the card — build runs in background
    get()._wsClient?.send({
      type: "card.build_app",
      cardId,
      cardText,
      buildAppDefinition: definition,
      conversationContext,
    });
  },

  proposeApp: (cardId: string, cardText: string, context: string) => {
    get()._wsClient?.send({
      type: "card.propose_app",
      cardId,
      cardText,
      conversationContext: context,
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

  deleteAllApps: () => {
    get()._wsClient?.send({ type: "card.delete_all_apps" });
  },

  fetchApps: () => {
    get()._wsClient?.send({ type: "apps.list" });
  },

  runApp: (toolFamily: string) => {
    get()._wsClient?.send({ type: "apps.run", toolFamily });
  },

  saveAppToCodebase: (toolFamily: string) => {
    get()._wsClient?.send({ type: "app.save_to_codebase", toolFamily });
  },

  restartServer: () => {
    get()._wsClient?.send({ type: "server.restart" });
  },

  launchEnsoCode: () => {
    const ensoPath = get().ensoProjectPath;
    if (!ensoPath) return;

    // Set CWD to Enso project, start fresh session
    set({ codeSessionCwd: ensoPath, codeSessionId: null });

    // Create terminal card (same as bare "/code" but skips project picker)
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
  },

  fetchProjects: () => {
    get()._wsClient?.send({ type: "tools.list_projects" });
  },

  setCodeSessionCwd: (cwd: string) => {
    set({ codeSessionCwd: cwd });
  },

  setShowConnectionPicker: (show: boolean) => {
    set({ showConnectionPicker: show });
  },

  connectToBackend: (config: BackendConfig) => {
    // Disconnect existing connection
    get()._wsClient?.disconnect();
    set({ _wsClient: null, connectionState: "disconnected" });

    // Set as active and connect
    setActiveBackend(config.id);
    set({ showConnectionPicker: false });

    const wsUrl = buildWsUrl(config);
    const client = createWSClient({
      url: wsUrl,
      onMessage: (msg) => get()._handleServerMessage(msg),
      onStateChange: (state) => set({ connectionState: state }),
    });
    set({ _wsClient: client });
    client.connect();
  },

  _handleServerMessage: (msg: ServerMessage) => {
    // Handle settings messages (mode + tool families)
    if (msg.settings) {
      const patch: Partial<CardStore> = {};
      if (msg.settings.toolFamilies) patch.toolFamilies = msg.settings.toolFamilies;
      if (msg.settings.ensoProjectPath) patch.ensoProjectPath = msg.settings.ensoProjectPath;
      if (Object.keys(patch).length > 0) set(patch);
      return;
    }

    // Handle project list responses
    if (msg.projects) {
      set({ projects: msg.projects });
      return;
    }

    // Handle apps list
    if (msg.appsList) {
      set({ apps: msg.appsList });
      return;
    }

    // Handle apps deleted confirmation
    if (msg.appsDeleted) {
      const { families, count } = msg.appsDeleted;
      const id = msg.id;
      const now = Date.now();
      const text = count > 0
        ? `Deleted ${count} app(s): ${families.join(", ")}`
        : "No apps to delete.";
      const card: Card = {
        id,
        runId: msg.runId,
        type: "chat",
        role: "assistant",
        status: "complete",
        display: "expanded",
        text,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({
        cardOrder: [...s.cardOrder, id],
        cards: { ...s.cards, [id]: card },
        apps: [], // Clear apps list since all were deleted
      }));
      return;
    }

    // Handle app saved to codebase confirmation
    if (msg.appSaved) {
      const { toolFamily, success, error } = msg.appSaved;
      const familyLabel = toolFamily.replace(/_/g, " ");
      const id = msg.id;
      const now = Date.now();
      const text = success
        ? `App **${familyLabel}** saved to codebase. You can now \`git commit\` it.`
        : `Failed to save app **${familyLabel}** to codebase: ${error}`;
      const card: Card = {
        id,
        runId: msg.runId,
        type: "chat",
        role: "assistant",
        status: "complete",
        display: "expanded",
        text,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({
        cardOrder: [...s.cardOrder, id],
        cards: { ...s.cards, [id]: card },
      }));
      // Refresh apps list to update codebase flags
      get().fetchApps();
      return;
    }

    // Handle app proposal (auto-generated app description) — no targetCardId
    if (msg.appProposal && msg.appProposal.cardId) {
      set((state) => {
        const proposalCardId = msg.appProposal!.cardId;
        const proposalCard = state.cards[proposalCardId];
        if (!proposalCard) return state;
        return {
          cards: {
            ...state.cards,
            [proposalCardId]: {
              ...proposalCard,
              pendingProposal: msg.appProposal!.proposal,
              updatedAt: Date.now(),
            },
          },
        };
      });
      return;
    }

    // Handle build completion (async build pipeline notification)
    if (msg.buildComplete) {
      const { cardId: buildCardId, success, summary, error } = msg.buildComplete;
      const now = Date.now();
      const notifId = msg.id;

      // Create a notification chat card
      let notifText: string;
      if (success && summary) {
        const familyLabel = summary.toolFamily.replace(/_/g, " ");
        notifText = `✓ New app built: **${familyLabel}** (${summary.toolNames.length} tools)\n\n${summary.description}`;
      } else {
        notifText = `✗ App build failed${error ? `: ${error}` : ""}`;
      }

      const notifCard: Card = {
        id: notifId,
        runId: msg.runId,
        type: "chat",
        role: "assistant",
        status: "complete",
        display: "expanded",
        text: notifText,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const updates: Partial<CardStore> = {
          cardOrder: [...state.cardOrder, notifId],
          cards: { ...state.cards, [notifId]: notifCard },
        };

        // If the source card still exists, update its enhance status
        const sourceCard = state.cards[buildCardId];
        if (sourceCard && success) {
          updates.cards = {
            ...updates.cards!,
            [buildCardId]: {
              ...sourceCard,
              enhanceStatus: "ready",
              updatedAt: now,
            },
          };
        }

        return updates;
      });
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
            // Only set unavailable if the card was actively loading (fast enhance path).
            // Background builds send their own buildComplete notification.
            const newEnhanceStatus = card.enhanceStatus === "loading" ? "unavailable" as const : card.enhanceStatus;
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  enhanceStatus: newEnhanceStatus,
                  status: "complete",
                  operation: undefined,
                  pendingAction: undefined,
                  updatedAt: now,
                },
              },
            };
          }
          // Auto-switch to app view only for the fast enhance path (enhanceStatus was "loading").
          // Background builds keep the current viewMode — user will be notified via buildComplete.
          const wasLoading = card.enhanceStatus === "loading";
          return {
            cards: {
              ...state.cards,
              [msg.targetCardId]: {
                ...card,
                appData: msg.enhanceResult.data,
                appGeneratedUI: msg.enhanceResult.generatedUI,
                appCardMode: msg.enhanceResult.cardMode,
                appBuildSummary: msg.enhanceResult.buildSummary,
                enhanceStatus: "ready",
                status: "complete",
                viewMode: wasLoading ? "app" : (card.viewMode ?? "app"),
                operation: undefined,
                pendingAction: undefined,
                updatedAt: now,
              },
            },
          };
        }

        // Handle background compatibility hint (proactive app detection)
        if (msg.enhanceHint?.toolFamily) {
          // Only apply if the card hasn't been enhanced or interacted with yet
          if (!card.enhanceStatus || card.enhanceStatus === "idle") {
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  enhanceStatus: "suggested" as const,
                  suggestedFamily: msg.enhanceHint.toolFamily,
                  updatedAt: now,
                },
              },
            };
          }
          return state;
        }

        // Handle auto-heal status updates
        if (msg.autoHeal) {
          return {
            cards: {
              ...state.cards,
              [msg.targetCardId]: {
                ...card,
                autoHealStatus: msg.autoHeal.stage,
                autoHealError: msg.autoHeal.error,
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
