import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { AppInfo, ClientMessage, ServerMessage, ToolRouting } from "@shared/types";
import type { Card } from "../cards/types";
import { cardRegistry } from "../cards/registry";
import { shellWriters } from "../cards/ShellCard";
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
  showSetupWizard: boolean;
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

  // Pinning
  pinnedCards: string[];
  showSidebar: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (text: string, routing?: ToolRouting, sourceCardId?: string) => void;
  sendMessageWithMedia: (text: string, mediaFiles: File[]) => Promise<void>;
  sendCardAction: (cardId: string, action: string, payload?: unknown) => void;
  enhanceCard: (cardId: string) => void;
  enhanceCardWithFamily: (cardId: string, family: string) => void;
  buildApp: (cardId: string, cardText: string, definition: string) => void;
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
  launchShell: () => void;
  sendDebugReport: (description: string, imagePaths: string[]) => void;
  codeInvestigate: (cardId: string, instruction: string) => void;
  launchSystemEnhance: (instruction: string) => void;
  fetchProjects: () => void;
  setCodeSessionCwd: (cwd: string) => void;
  switchTerminalProject: (cardId: string, cwd: string) => void;
  resumeSessionOnCard: (cardId: string, sessionId: string, cwd: string) => void;
  setShowConnectionPicker: (show: boolean) => void;
  setShowSetupWizard: (show: boolean) => void;
  connectToBackend: (config: BackendConfig) => void;
  loadSharedCard: (cardId: string) => Promise<void>;
  pinCard: (cardId: string) => void;
  unpinCard: (cardId: string) => void;
  toggleSidebar: () => void;
  _handleServerMessage: (msg: ServerMessage) => void;
}


export const useChatStore = create<CardStore>((set, get) => ({
  cardOrder: [],
  cards: {},
  connectionState: "disconnected",
  isWaiting: false,
  showConnectionPicker: false,
  showSetupWizard: false,
  _wsClient: null,
  apps: [],
  toolFamilies: [],
  ensoProjectPath: null,
  projects: [],
  codeSessionCwd: localStorage.getItem("enso_code_session_cwd") || null,
  codeSessionId: localStorage.getItem("enso_code_session_id") || null,
  _activeTerminalCardId: null,
  pinnedCards: JSON.parse(localStorage.getItem("enso_pinned_cards") ?? "[]"),
  showSidebar: false,

  connect: () => {
    const existing = get()._wsClient;
    if (existing) return;

    const backend = getActiveBackend();
    const wsUrl = buildWsUrl(backend);

    // On native with no backend configured, wsUrl is empty — don't connect
    if (!wsUrl) {
      set({ connectionState: "disconnected" });
      return;
    }

    const client = createWSClient({
      url: wsUrl,
      onMessage: (msg) => get()._handleServerMessage(msg),
      onStateChange: (state) => {
        const prev = get().connectionState;
        set({ connectionState: state });

        // When connection drops, finalize any streaming cards
        if (state === "disconnected" && prev === "connected") {
          const { cards } = get();
          const updates: Record<string, Card> = {};
          for (const [id, card] of Object.entries(cards)) {
            if (card.status === "streaming") {
              if (card.type === "shell") {
                const writer = shellWriters.get(id);
                if (writer) writer("\r\n\x1b[33m[Connection lost]\x1b[0m\r\n");
                updates[id] = { ...card, status: "complete", updatedAt: Date.now() };
              } else {
                updates[id] = {
                  ...card,
                  status: "complete",
                  text: (card.text ?? "") + "\n\u200B[connection:lost]\n",
                  operation: undefined,
                  updatedAt: Date.now(),
                };
              }
            }
          }
          if (Object.keys(updates).length > 0) {
            set((s) => ({ cards: { ...s.cards, ...updates }, isWaiting: false }));
          }
        }
      },
    });

    set({ _wsClient: client });
    client.connect();
  },

  disconnect: () => {
    get()._wsClient?.disconnect();
    set({ _wsClient: null, connectionState: "disconnected" });
  },

  sendMessage: (text: string, routing?: ToolRouting, sourceCardId?: string) => {
    let displayText = text;
    let finalRouting = routing;

    // Skip slash-command interception when routing is already set
    // (e.g. terminal input sends with claude-code routing — text should
    // go to Claude Code as-is, not be intercepted as a slash command)
    if (!finalRouting) {
      // "/delete-apps" command — delete all dynamically created apps
      if (text.trim() === "/delete-apps") {
        get().deleteAllApps();
        return;
      }

      // "/shell" command — launch remote terminal
      if (text.trim() === "/shell") {
        get().launchShell();
        return;
      }

      // Bare "/code" opens project picker
      if (text.trim() === "/code") {
        get().fetchProjects();
        // Reuse existing active terminal card if one exists
        const existingTermId = get()._activeTerminalCardId;
        if (existingTermId && get().cards[existingTermId]) {
          return;
        }
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
      if (text.startsWith("/code ")) {
        displayText = text.slice(6);
        // Read session from active terminal card's own state, fall back to global
        const termId = get()._activeTerminalCardId;
        const termCard = termId ? get().cards[termId] : null;
        const cwd = termCard?.toolMeta?.cwd ?? get().codeSessionCwd;
        const toolSessionId = termCard?.toolMeta?.toolSessionId ?? get().codeSessionId;
        finalRouting = {
          mode: "direct_tool",
          toolId: "claude-code",
          ...(toolSessionId ? { toolSessionId } : {}),
          ...(cwd ? { cwd } : {}),
        };
        // Route to the active terminal card if available
        if (termId) sourceCardId = termId;
      }
    }

    // Terminal routing: append to specific or active terminal card
    if (finalRouting?.toolId === "claude-code") {
      const now = Date.now();
      let termCardId = sourceCardId ?? get()._activeTerminalCardId;

      if (!termCardId || !get().cards[termCardId]) {
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
          toolMeta: { toolId: "claude-code", ...(finalRouting.cwd ? { cwd: finalRouting.cwd } : {}) },
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

      get()._wsClient?.send({ type: "chat.send", text: displayText, routing: finalRouting, sourceCardId: termCardId });
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

  buildApp: (cardId: string, cardText: string, definition: string) => {
    const card = get().cards[cardId];
    if (!card) return;

    // Gather recent conversation context for the build prompt
    const { cardOrder, cards } = get();
    const recent = cardOrder.slice(-6).map((id) => cards[id]).filter(Boolean);
    const conversationContext = recent
      .map((c) => `[${c.role}] ${(c.text ?? "").slice(0, 400)}`)
      .join("\n\n");

    // Fire-and-forget: build runs as Claude Code session in a terminal card
    get()._wsClient?.send({
      type: "card.build_app",
      cardId,
      cardText,
      buildAppDefinition: definition,
      conversationContext,
    });
  },

  // proposeApp removed — Build App now goes directly through Claude Code

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
    set({ isWaiting: true });
    get()._wsClient?.send({ type: "apps.run", toolFamily });
  },

  saveAppToCodebase: (toolFamily: string) => {
    get()._wsClient?.send({ type: "app.save_to_codebase", toolFamily });
  },

  restartServer: () => {
    get()._wsClient?.send({ type: "server.restart" });
  },

  launchEnsoCode: () => {
    get().fetchProjects();

    // Reuse existing active terminal card if one exists
    const existingTermId = get()._activeTerminalCardId;
    if (existingTermId && get().cards[existingTermId]) {
      return;
    }

    // Create terminal card without CWD so the project picker is shown
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

  launchShell: () => {
    const id = uuidv4();
    const now = Date.now();
    const card: Card = {
      id,
      runId: id,
      type: "shell",
      role: "assistant",
      status: "streaming",
      display: "expanded",
      toolMeta: { toolId: "shell" },
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      cardOrder: [...s.cardOrder, id],
      cards: { ...s.cards, [id]: card },
    }));
    // shell.create is sent by ShellCard after xterm.js measures the actual
    // container width (via FitAddon), so the PTY starts with the correct
    // column count instead of a hardcoded 80 that overflows on mobile.
  },

  sendDebugReport: (description: string, imagePaths: string[]) => {
    const ensoPath = get().ensoProjectPath;
    if (!ensoPath) return;

    // Update global convenience state
    localStorage.setItem("enso_code_session_cwd", ensoPath);
    localStorage.removeItem("enso_code_session_id");

    // Build the prompt
    const lines: string[] = ["A user reported a bug in the Enso app via the in-app debug reporter.", ""];
    if (imagePaths.length > 0) {
      lines.push(`${imagePaths.length} image(s) have been attached:`);
      imagePaths.forEach((p, i) => lines.push(`  ${i + 1}. ${p}${i === 0 ? " (screenshot of current app state)" : ""}`));
      lines.push("Read these image files to understand the visual state of the bug.");
      lines.push("");
    }
    if (description) {
      lines.push(`Bug description: "${description}"`);
      lines.push("");
    }
    lines.push(
      "Instructions:",
      "1. Analyze the bug based on the description and/or screenshot",
      "2. Search the Enso codebase to find the root cause",
      "3. Implement the fix",
      "4. Run `npm run build` to verify the fix compiles",
      "5. After fixing, check which files you modified:",
      "   - If ANY files in `src/` were changed (frontend code): run the FULL RELEASE procedure:",
      "     a. Commit the fix and push",
      "     b. Bump `versionCode` by 1 and bump patch `version` in package.json",
      "     c. Commit version bump and push",
      "     d. Run `npm run android:build-apk` (use a 5 minute timeout)",
      "     e. Run `powershell -ExecutionPolicy Bypass -File D:\\Github\\Enso\\restart.ps1`",
      "   - If ONLY backend files changed (`openclaw-plugin/`):",
      "     a. Commit the fix and push",
      "     b. Run `powershell -ExecutionPolicy Bypass -File D:\\Github\\Enso\\restart.ps1`",
      "",
      "Work autonomously. Fix the bug and deploy without asking for confirmation.",
    );
    const prompt = lines.join("\n");

    // Create terminal card and send
    const id = uuidv4();
    const now = Date.now();
    const displayText = description
      ? `[Bug Report] ${description.slice(0, 100)}${description.length > 100 ? "..." : ""}`
      : `[Bug Report] ${imagePaths.length} image(s) attached`;

    const card: Card = {
      id,
      runId: id,
      type: "terminal",
      role: "assistant",
      status: "streaming",
      display: "expanded",
      text: `>>> ${displayText}\n`,
      toolMeta: { toolId: "claude-code", cwd: ensoPath },
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({
      cardOrder: [...s.cardOrder, id],
      cards: { ...s.cards, [id]: card },
      _activeTerminalCardId: id,
      codeSessionCwd: ensoPath,
      codeSessionId: null,
      isWaiting: true,
    }));

    const routing: ToolRouting = {
      mode: "direct_tool",
      toolId: "claude-code",
      cwd: ensoPath,
    };

    get()._wsClient?.send({ type: "chat.send", text: prompt, routing, sourceCardId: id });
  },

  codeInvestigate: (cardId: string, instruction: string) => {
    const card = get().cards[cardId];
    if (!card) return;

    const ensoPath = get().ensoProjectPath;
    if (!ensoPath) return;

    localStorage.setItem("enso_code_session_cwd", ensoPath);
    localStorage.removeItem("enso_code_session_id");

    const promptParts: string[] = [
      `## User Request`,
      instruction,
      "",
      "Use the following context to carry out the request.",
      "",
    ];

    // For dynamic-ui / app cards — include app context
    const activeMode = card.appCardMode ?? card.cardMode;
    if (activeMode?.toolFamily) {
      promptParts.push(
        `## App: ${activeMode.toolFamily}`,
        `Location: Look in ~/.openclaw/enso-apps/${activeMode.toolFamily}/ or openclaw-plugin/apps/${activeMode.toolFamily}/`,
        `Read CLAUDE-REFERENCE.md for the app structure reference.`,
        "",
      );
    }

    // Include card text if available
    if (card.text) {
      promptParts.push("## AI Response", card.text.slice(0, 4000), "");
    }

    // Include app data summary if available
    const appData = card.appData ?? card.data;
    if (appData) {
      promptParts.push("## Current App Data (sample)", "```json", JSON.stringify(appData, null, 2).slice(0, 2000), "```", "");
    }

    const prompt = promptParts.join("\n");

    const id = uuidv4();
    const now = Date.now();
    const termCard: Card = {
      id,
      runId: id,
      type: "terminal",
      role: "assistant",
      status: "streaming",
      display: "expanded",
      text: `>>> Investigating response...\n`,
      toolMeta: { toolId: "claude-code", cwd: ensoPath },
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({
      cardOrder: [...s.cardOrder, id],
      cards: { ...s.cards, [id]: termCard },
      _activeTerminalCardId: id,
      codeSessionCwd: ensoPath,
      codeSessionId: null,
      isWaiting: true,
    }));

    const routing: ToolRouting = {
      mode: "direct_tool",
      toolId: "claude-code",
      cwd: ensoPath,
    };

    get()._wsClient?.send({ type: "chat.send", text: prompt, routing, sourceCardId: id });
  },

  launchSystemEnhance: (instruction: string) => {
    const ensoPath = get().ensoProjectPath;
    if (!ensoPath) return;

    localStorage.setItem("enso_code_session_cwd", ensoPath);
    localStorage.removeItem("enso_code_session_id");

    const prompt = [
      "The user wants to enhance the Enso system.",
      "",
      "## Enhancement Request",
      instruction,
      "",
      "## Instructions",
      "Analyze the codebase deeply across both the frontend (src/) and backend (openclaw-plugin/src/).",
      "Read CLAUDE.md and CLAUDE-REFERENCE.md for architecture context.",
      "Suggest the most impactful improvements for this area, then ask which ones to implement.",
    ].join("\n");

    const id = uuidv4();
    const now = Date.now();
    const termCard: Card = {
      id,
      runId: id,
      type: "terminal",
      role: "assistant",
      status: "streaming",
      display: "expanded",
      text: `>>> System enhance: ${instruction.slice(0, 80)}...\n`,
      toolMeta: { toolId: "claude-code", cwd: ensoPath },
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({
      cardOrder: [...s.cardOrder, id],
      cards: { ...s.cards, [id]: termCard },
      _activeTerminalCardId: id,
      codeSessionCwd: ensoPath,
      codeSessionId: null,
      isWaiting: true,
    }));

    const routing: ToolRouting = {
      mode: "direct_tool",
      toolId: "claude-code",
      cwd: ensoPath,
    };

    get()._wsClient?.send({ type: "chat.send", text: prompt, routing, sourceCardId: id });
  },

  fetchProjects: () => {
    get()._wsClient?.send({ type: "tools.list_projects" });
  },

  setCodeSessionCwd: (cwd: string) => {
    const prev = get().codeSessionCwd;
    localStorage.setItem("enso_code_session_cwd", cwd);
    const termId = get()._activeTerminalCardId;

    // Update global state + active terminal card's toolMeta
    const updates: Record<string, unknown> = { codeSessionCwd: cwd };
    if (prev && prev !== cwd) {
      localStorage.removeItem("enso_code_session_id");
      updates.codeSessionId = null;
    }

    if (termId) {
      const card = get().cards[termId];
      if (card) {
        updates.cards = {
          ...get().cards,
          [termId]: {
            ...card,
            toolMeta: { ...card.toolMeta, toolId: "claude-code", cwd, toolSessionId: undefined },
            updatedAt: Date.now(),
          },
        };
      }
    }

    set(updates as Partial<CardStore>);
  },

  switchTerminalProject: (cardId: string, cwd: string) => {
    const card = get().cards[cardId];
    if (!card) return;
    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...card,
          toolMeta: { toolId: "claude-code", cwd },
          updatedAt: Date.now(),
        },
      },
      // Also update global convenience state
      codeSessionCwd: cwd,
      codeSessionId: null,
    }));
    localStorage.setItem("enso_code_session_cwd", cwd);
    localStorage.removeItem("enso_code_session_id");
  },

  resumeSessionOnCard: (cardId: string, sessionId: string, cwd: string) => {
    const card = get().cards[cardId];
    if (!card) return;
    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...card,
          toolMeta: { toolId: "claude-code", cwd, toolSessionId: sessionId },
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setShowConnectionPicker: (show: boolean) => {
    set({ showConnectionPicker: show });
  },

  setShowSetupWizard: (show: boolean) => {
    set({ showSetupWizard: show });
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
      onStateChange: (state) => {
        const prev = get().connectionState;
        set({ connectionState: state });
        if (state === "disconnected" && prev === "connected") {
          const { cards } = get();
          const updates: Record<string, Card> = {};
          for (const [id, card] of Object.entries(cards)) {
            if (card.status === "streaming") {
              if (card.type === "shell") {
                // Shell cards: write disconnect message to xterm, mark complete
                const writer = shellWriters.get(id);
                if (writer) writer("\r\n\x1b[33m[Connection lost]\x1b[0m\r\n");
                updates[id] = { ...card, status: "complete", updatedAt: Date.now() };
              } else {
                updates[id] = { ...card, status: "complete", text: (card.text ?? "") + "\n\u200B[connection:lost]\n", operation: undefined, updatedAt: Date.now() };
              }
            }
          }
          if (Object.keys(updates).length > 0) {
            set((s) => ({ cards: { ...s.cards, ...updates }, isWaiting: false }));
          }
        }
      },
    });
    set({ _wsClient: client });
    client.connect();
  },

  loadSharedCard: async (cardId: string) => {
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/card/${encodeURIComponent(cardId)}/state`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const state = await res.json();
      if (!state.data && !state.generatedUI) return;

      const now = Date.now();
      const card: Card = {
        id: cardId,
        runId: cardId,
        type: state.generatedUI ? "dynamic-ui" : "chat",
        role: "assistant",
        status: "complete",
        display: "expanded",
        text: "",
        data: state.data,
        generatedUI: state.generatedUI,
        toolMeta: state.toolMeta,
        cardMode: state.toolFamily ? {
          interactionMode: "tool" as const,
          toolFamily: state.toolFamily,
          signatureId: state.signatureId,
          coverageStatus: state.coverageStatus,
        } : undefined,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({
        cardOrder: [...s.cardOrder, cardId],
        cards: { ...s.cards, [cardId]: card },
      }));
    } catch { /* shared card load failed — show home page */ }
  },

  pinCard: (cardId: string) => {
    set((s) => {
      if (s.pinnedCards.includes(cardId)) return s;
      const pins = [...s.pinnedCards, cardId];
      localStorage.setItem("enso_pinned_cards", JSON.stringify(pins));
      return { pinnedCards: pins, showSidebar: true };
    });
  },

  unpinCard: (cardId: string) => {
    set((s) => {
      const pins = s.pinnedCards.filter((id) => id !== cardId);
      localStorage.setItem("enso_pinned_cards", JSON.stringify(pins));
      return { pinnedCards: pins };
    });
  },

  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),

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

    // Handle resolved bugs notification on reconnect
    if (msg.resolvedBugs && msg.resolvedBugs.length > 0) {
      const bugs = msg.resolvedBugs;
      const id = msg.id;
      const now = Date.now();
      const count = bugs.length;
      const lines = bugs.map((b) => `- **${b.category}**: ${b.description} → ${b.resolution}`);
      const text = `${count} issue${count === 1 ? " was" : "s were"} fixed since your last visit:\n\n${lines.join("\n")}`;
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
      return;
    }

    // appProposal handler removed — Build App now goes directly through Claude Code

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
        let card = state.cards[msg.targetCardId];

        // Auto-create terminal card if it doesn't exist yet (e.g. build-via-claude)
        if (!card && msg.toolMeta?.toolId === "claude-code" && msg.state === "delta") {
          card = {
            id: msg.targetCardId,
            runId: msg.runId,
            type: "terminal",
            role: "assistant",
            status: "streaming",
            display: "expanded",
            text: msg.text ?? "",
            toolMeta: msg.toolMeta,
            operation: msg.operation,
            createdAt: now,
            updatedAt: now,
          };
          return {
            cardOrder: [...state.cardOrder, msg.targetCardId],
            cards: { ...state.cards, [msg.targetCardId]: card },
            _activeTerminalCardId: msg.targetCardId,
            isWaiting: true,
          };
        }

        // Auto-create shell card if it doesn't exist yet
        if (!card && msg.toolMeta?.toolId === "shell" && msg.state === "delta") {
          card = {
            id: msg.targetCardId,
            runId: msg.runId,
            type: "shell",
            role: "assistant",
            status: "streaming",
            display: "expanded",
            toolMeta: msg.toolMeta,
            createdAt: now,
            updatedAt: now,
          };
          // Write output to xterm via shellWriters
          const writer = shellWriters.get(msg.targetCardId);
          if (writer && msg.text) writer(msg.text);
          return {
            cardOrder: [...state.cardOrder, msg.targetCardId],
            cards: { ...state.cards, [msg.targetCardId]: card },
          };
        }

        if (!card) return state;

        // ── Terminal card (claude-code): append text, per-card session ──
        if (card.type === "terminal" && msg.toolMeta?.toolId === "claude-code") {
          if (msg.state === "delta") {
            const hasQuestions = msg.questions && msg.questions.length > 0;
            return {
              ...(hasQuestions ? { isWaiting: false } : {}),
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  text: (card.text ?? "") + (msg.text ?? ""),
                  status: hasQuestions ? "complete" : "streaming",
                  toolMeta: { ...card.toolMeta, ...msg.toolMeta, cwd: card.toolMeta?.cwd },
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
            // Capture session ID on the card's own toolMeta
            const newToolMeta = {
              ...card.toolMeta,
              toolId: "claude-code" as const,
              ...(msg.toolMeta?.toolSessionId ? { toolSessionId: msg.toolMeta.toolSessionId } : {}),
            };
            // Also update global convenience state
            if (msg.toolMeta?.toolSessionId) {
              storeUpdates.codeSessionId = msg.toolMeta.toolSessionId;
              localStorage.setItem("enso_code_session_id", msg.toolMeta.toolSessionId);
            }
            return {
              ...storeUpdates,
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  status: "complete",
                  toolMeta: newToolMeta,
                  operation: msg.operation,
                  cardMode: msg.cardMode ?? card.cardMode,
                  updatedAt: now,
                },
              },
            };
          }

          if (msg.state === "error") {
            // Keep session ID — the session is likely still resumable via /resume.
            // Only append error text; preserve cwd and toolSessionId on the card.
            return {
              ...storeUpdates,
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  text: (card.text ?? "") + (msg.text ?? "Error occurred."),
                  status: "error",
                  toolMeta: card.toolMeta, // preserve existing session + cwd
                  operation: msg.operation,
                  cardMode: msg.cardMode ?? card.cardMode,
                  updatedAt: now,
                },
              },
            };
          }

          return state;
        }

        // ── Shell card: stream output directly to xterm.js, not to card.text ──
        if (card.type === "shell" && msg.toolMeta?.toolId === "shell") {
          if (msg.state === "delta") {
            // Write output directly to xterm.js via shellWriters — no React re-render
            const writer = shellWriters.get(msg.targetCardId);
            if (writer && msg.text) writer(msg.text);

            // Only update Zustand state if toolSessionId changed (first delta after shell.create)
            const newSessionId = msg.toolMeta?.toolSessionId;
            if (newSessionId && newSessionId !== card.toolMeta?.toolSessionId) {
              return {
                cards: {
                  ...state.cards,
                  [msg.targetCardId]: {
                    ...card,
                    toolMeta: { ...card.toolMeta, toolId: "shell", toolSessionId: newSessionId },
                    updatedAt: now,
                  },
                },
              };
            }
            return state; // No React state change for output
          }

          if (msg.state === "final") {
            const writer = shellWriters.get(msg.targetCardId);
            if (writer && msg.text) writer(msg.text);
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  status: "complete",
                  updatedAt: now,
                },
              },
            };
          }

          if (msg.state === "error") {
            const writer = shellWriters.get(msg.targetCardId);
            if (writer && msg.text) writer(msg.text);
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  status: "error",
                  updatedAt: now,
                },
              },
            };
          }

          return state;
        }

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
            localStorage.setItem("enso_code_session_id", msg.toolMeta.toolSessionId);
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
          // Keep session ID for claude-code — session is still resumable.
          // For other tool types, use msg.toolMeta as before.
          const isClaudeCode = card.toolMeta?.toolId === "claude-code" || msg.toolMeta?.toolId === "claude-code";
          const errorToolMeta = isClaudeCode ? card.toolMeta : (msg.toolMeta ?? card.toolMeta);
          return {
            ...storeUpdates,
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                text: (card.text ?? "") + (msg.text ?? "Error occurred."),
                status: "error",
                toolMeta: errorToolMeta,
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
          localStorage.setItem("enso_code_session_id", msg.toolMeta.toolSessionId);
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
