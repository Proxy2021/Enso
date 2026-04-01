import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { AppInfo, ClientMessage, OrchestrationCardData, ServerMessage, ToolRouting } from "@shared/types";
import type { Card } from "../cards/types";
import { cardRegistry } from "../cards/registry";
import { shellWriters } from "../cards/ShellCard";
import { createWSClient, getClientId, type ConnectionState } from "../lib/ws-client";
import { initErrorReporter } from "../lib/error-reporter";
import {
  initNotifications,
  requestNotificationPermission,
  notifyTaskComplete,
} from "../lib/notifications";
import {
  getActiveBackend,
  buildWsUrl,
  getBackendBaseUrl,
  authHeaders,
  setActiveBackend,
  type BackendConfig,
} from "../lib/connection";
import { _setLocale, type Locale } from "../lib/i18n";
import { TOOL_ID_CLAUDE_CODE, STORAGE_KEYS, TIMINGS, DEFAULT_CLAUDE_MODEL, DEFAULT_CHAT_MODEL, API } from "../lib/constants";

type CardHistoryRecord = NonNullable<ServerMessage["cardHistory"]>[number];

/** Drop journal rows / finals that would render as an empty bubble only. */
function shouldSkipEmptyHistoryRecord(rec: CardHistoryRecord, resolvedType: string): boolean {
  const textTrim = String(rec.text ?? "").trim();
  const hasMedia = Array.isArray(rec.mediaUrls) && rec.mediaUrls.length > 0;
  const hasSteps = Array.isArray(rec.steps) && rec.steps.length > 0;
  const hasData = rec.data != null;
  const hasUI = Boolean(rec.generatedUI);
  const hasApp = rec.appData != null || Boolean(rec.appGeneratedUI);

  if (rec.role === "user") {
    if (resolvedType === "terminal") return false;
    return !textTrim && !hasMedia;
  }
  if (resolvedType !== "chat") return false;
  return !textTrim && !hasMedia && !hasData && !hasUI && !hasSteps && !hasApp;
}

/** Derive a short sidebar title from a command string. */
function deriveConversationTitle(msg: string): string {
  const t = msg.trim();
  if (t.startsWith("/evolve")) {
    const rest = t.slice(7).trim();
    return rest ? `Evolve: ${rest}`.slice(0, 60) : "Evolution Sprint";
  }
  if (t.startsWith("/discover")) {
    const rest = t.slice(9).trim();
    return rest ? `Discover: ${rest}`.slice(0, 60) : "AI Discovery";
  }
  if (t.startsWith("/code ")) {
    return t.slice(6).trim().slice(0, 60) || "Claude Code";
  }
  if (t.startsWith("/research ")) {
    return t.slice(10).trim().slice(0, 60) || "Research";
  }
  if (t.startsWith("/mission")) return "Mission Planner";
  if (t.startsWith("/shell")) return "Terminal";
  if (t === "/evolution-history") return "Evolution History";
  if (t === "/discovery-history") return "Discovery History";
  if (t === "/sessions") return "Session Dashboard";
  if (t === "/projects") return "Projects";
  if (t === "/help") return "Help";
  if (t.startsWith("/orchestrate")) {
    const rest = t.slice(12).trim();
    return rest ? `Orchestrate: ${rest}`.slice(0, 60) : "Orchestration";
  }
  const firstLine = t.split("\n")[0]?.trim() ?? t;
  const chars = Array.from(firstLine);
  if (chars.length <= 60) return firstLine;
  let out = chars.slice(0, 60).join("");
  const lastSpace = out.lastIndexOf(" ");
  if (lastSpace > 24) out = out.slice(0, lastSpace).trimEnd();
  return `${out}…`;
}

export interface ConversationEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  preview?: string;
}

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
  toolFamilies: Array<{ appId?: string; toolFamily: string; description: string }>;
  ensoProjectPath: string | null;

  // Claude Code session state
  projects: ProjectInfo[];
  codeSessionCwd: string | null;
  defaultProjectCwd: string | null;
  codeSessionId: string | null;
  claudeModel: string;
  claudeThinking: "adaptive" | "disabled";
  chatModel: string;
  providers: Array<{
    id: string;
    name: string;
    configured: boolean;
    models: Array<{ id: string; name: string; description?: string }>;
    setupUrl?: string;
    setupHint: string;
  }>;
  language: "en" | "zh";

  // Internal: active terminal card
  _activeTerminalCardId: string | null;
  _pendingCodeText: string | null;
  _thinkingCardId: string | null;
  _nlInterceptionToast: string | null;

  // Graceful restart protocol
  _serverBootId: string | null;
  _lastDisconnectWasRestart: boolean;

  // Conversation continuity
  recentTopics: Array<{ topic: string; lastMessage: string; timestamp: number; cardId: string }>;
  activeConversationId: string;
  conversationsList: ConversationEntry[];

  // Pinning
  pinnedCards: string[];
  showSidebar: boolean;

  // Card search
  cardSearchQuery: string;
  cardSearchVisible: boolean;

  // Tab navigation (universal — desktop rail + mobile bottom bar)
  activeTab: "chat" | "tasks" | "evolve" | "projects" | "me";
  chatViewOpen: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (text: string, routing?: ToolRouting, sourceCardId?: string) => void;
  sendMessageWithMedia: (text: string, mediaFiles: File[], intent?: "image_research" | "image_search") => Promise<void>;
  sendCardAction: (cardId: string, action: string, payload?: unknown) => void;
  enhanceCard: (cardId: string) => void;
  enhanceCardWithFamily: (cardId: string, family: string) => void;
  buildApp: (cardId: string, cardText: string, definition: string) => void;
  toggleCardView: (cardId: string, viewMode: "original" | "app" | "plan" | "sessions") => void;
  completeAutoAppReveal: (cardId: string) => void;
  cancelOperation: (operationId: string) => void;
  collapseCard: (cardId: string) => void;
  expandCard: (cardId: string) => void;
  deleteAllApps: () => void;
  deleteApp: (toolFamily: string) => void;
  fetchApps: () => void;
  runApp: (toolFamily: string) => void;
  saveAppToCodebase: (toolFamily: string) => void; // legacy name kept for compat
  promoteApp: (appId: string) => void;
  restartServer: () => void;
  launchEnsoCode: (instruction?: string) => void;
  launchShell: (initialCommand?: string) => void;
  sendShellInput: (text: string) => void;
  getActiveShellSessionId: () => string | null;
  hasActiveBackgroundTask: () => boolean;
  sendDebugReport: (description: string, imagePaths: string[]) => void;
  codeInvestigate: (cardId: string, instruction: string) => void;
  launchSystemEnhance: (instruction: string) => void;
  fetchProjects: () => void;
  setCodeSessionCwd: (cwd: string) => void;
  switchTerminalProject: (cardId: string, cwd: string) => void;
  resumeSessionOnCard: (cardId: string, sessionId: string, cwd: string) => void;
  setClaudeModel: (model: string, thinking?: "adaptive" | "disabled") => void;
  setChatModel: (model: string) => void;
  configureProvider: (providerId: string, apiKey: string) => void;
  setLanguage: (language: "en" | "zh") => void;
  setShowConnectionPicker: (show: boolean) => void;
  setShowSetupWizard: (show: boolean) => void;
  connectToBackend: (config: BackendConfig) => void;
  startOrchestration: (cardId: string, goal: string) => void;
  approveOrchestration: (orchestrationId: string, taskIds?: string[]) => void;
  pauseOrchestration: (orchestrationId: string) => void;
  resumeOrchestration: (orchestrationId: string) => void;
  cancelOrchestration: (orchestrationId: string) => void;
  loadSharedCard: (cardId: string) => Promise<void>;
  removeCard: (cardId: string) => void;
  pinCard: (cardId: string) => void;
  unpinCard: (cardId: string) => void;
  clearConversation: () => void;
  refreshConversationsList: () => Promise<void>;
  selectConversation: (id: string) => void;
  startNewChat: (title?: string) => Promise<void>;
  launchCommandInNewChat: (message: string) => Promise<void>;
  deleteConversationById: (id: string) => Promise<void>;
  renameConversationById: (id: string, title: string) => Promise<void>;
  toggleSidebar: () => void;
  requestCardSummary: (cardId: string) => void;
  requestCardEvolution: (cardId: string, options?: { goal?: string; includeResearch?: boolean }) => void;
  releaseCard: (cardId: string) => void;
  setCardSearchQuery: (query: string) => void;
  setCardSearchVisible: (visible: boolean) => void;
  setActiveTab: (tab: "chat" | "tasks" | "evolve" | "projects" | "me") => void;
  setChatViewOpen: (open: boolean) => void;
  _handleServerMessage: (msg: ServerMessage) => void;
}


// Pending auto-resume timer IDs — stored so boot ID mismatch can cancel them
let _pendingResumeTimers: ReturnType<typeof setTimeout>[] = [];

function _cancelPendingResumes() {
  for (const t of _pendingResumeTimers) clearTimeout(t);
  _pendingResumeTimers = [];
}

// Helper: handle reconnection — replace connection:lost markers and auto-resume sessions
function _handleReconnection(
  get: () => CardStore,
  set: (fn: Partial<CardStore> | ((s: CardStore) => Partial<CardStore>)) => void,
  isServerRestart = false,
) {
  const { cards } = get();
  const updates: Record<string, Card> = {};
  const resumeTargets: Array<{ id: string; sessionId: string; cwd: string }> = [];

  for (const [id, card] of Object.entries(cards)) {
    // After a server restart, handle server:restarting markers
    if (card.text?.includes("\u200B[server:restarting]")) {
      updates[id] = {
        ...card,
        text: card.text.replace(/\u200B\[server:restarting\]\n?/g, "\u200B[server:restarted]\n"),
        updatedAt: Date.now(),
      };
      continue; // never auto-resume after a restart
    }

    if (card.text?.includes("\u200B[connection:lost]")) {
      if (isServerRestart) {
        // Server restarted (detected via boot ID) — upgrade the marker
        updates[id] = {
          ...card,
          text: card.text.replace(/\u200B\[connection:lost\]\n?/g, "\u200B[server:restarted]\n"),
          updatedAt: Date.now(),
        };
      } else {
        // Normal network glitch — replace with restored
        updates[id] = {
          ...card,
          text: card.text.replace(/\u200B\[connection:lost\]\n?/g, "\u200B[connection:restored]\n"),
          updatedAt: Date.now(),
        };
        // Collect terminal cards with valid sessions for auto-resume
        if (card.type === "terminal" && card.toolMeta?.toolSessionId && card.toolMeta?.cwd) {
          resumeTargets.push({
            id,
            sessionId: card.toolMeta.toolSessionId,
            cwd: card.toolMeta.cwd,
          });
        }
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    set((s) => ({ cards: { ...s.cards, ...updates } }));
  }

  // Skip auto-resume entirely after a server restart — sessions are gone
  if (isServerRestart) return;

  // Auto-resume Claude Code sessions — but only if the backend session is no
  // longer alive.  After a brief disconnect the backend swaps the WebSocket
  // reference and the running session resumes sending deltas automatically.
  // We wait 5 seconds and check whether the card has already gone back to
  // "streaming" (meaning the old session is alive) before sending /resume.
  if (resumeTargets.length > 0) {
    const reconnectTs = Date.now();
    const timer = setTimeout(() => {
      for (const target of resumeTargets) {
        const wsClient = get()._wsClient;
        if (!wsClient) continue;

        // If the card already went back to streaming (old session alive) or
        // has been updated since reconnect (deltas arrived), skip auto-resume.
        const card = get().cards[target.id];
        if (!card) continue;
        if (card.status === "streaming") continue; // old session already resumed
        if (card.updatedAt > reconnectTs) continue; // got deltas since reconnect

        // Mark card as streaming
        set((s) => {
          const c = s.cards[target.id];
          if (!c) return {};
          return {
            cards: {
              ...s.cards,
              [target.id]: {
                ...c,
                status: "streaming",
                updatedAt: Date.now(),
              },
            },
            isWaiting: true,
          };
        });

        // Send resume command directly (no ">>> /resume" in card text)
        wsClient.send({
          type: "chat.send",
          conversationId: get().activeConversationId,
          text: "/resume",
          routing: {
            mode: "direct_tool",
            toolId: TOOL_ID_CLAUDE_CODE,
            toolSessionId: target.sessionId,
            cwd: target.cwd,
          },
          sourceCardId: target.id,
        });
      }
    }, 5000);
    _pendingResumeTimers.push(timer);
  }
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
  codeSessionCwd: localStorage.getItem(STORAGE_KEYS.CODE_SESSION_CWD) || null,
  defaultProjectCwd: null,
  codeSessionId: localStorage.getItem(STORAGE_KEYS.CODE_SESSION_ID) || null,
  claudeModel: localStorage.getItem(STORAGE_KEYS.CLAUDE_MODEL) || DEFAULT_CLAUDE_MODEL,
  claudeThinking: (localStorage.getItem(STORAGE_KEYS.CLAUDE_THINKING) as "adaptive" | "disabled") || "adaptive",
  chatModel: localStorage.getItem(STORAGE_KEYS.CHAT_MODEL) || DEFAULT_CHAT_MODEL,
  providers: [],
  language: (localStorage.getItem(STORAGE_KEYS.LANGUAGE) as Locale) || "en",
  _activeTerminalCardId: null,
  _pendingCodeText: null as string | null,
  _thinkingCardId: null as string | null,
  _nlInterceptionToast: null as string | null,
  _serverBootId: null as string | null,
  _lastDisconnectWasRestart: false,
  recentTopics: [],
  activeConversationId: localStorage.getItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID) || "default",
  conversationsList: [],
  pinnedCards: JSON.parse(localStorage.getItem(STORAGE_KEYS.PINNED_CARDS) ?? "[]"),
  showSidebar: false,
  cardSearchQuery: "",
  cardSearchVisible: false,
  activeTab: "chat" as const,
  chatViewOpen: false,

  setActiveTab: (tab) => set({ activeTab: tab, chatViewOpen: false }),
  setChatViewOpen: (open) => set({ chatViewOpen: open }),

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
      onStateChange: (state, isReconnect, meta) => {
        const prev = get().connectionState;
        set({ connectionState: state });

        // Handle successful reconnection — restore lost cards and auto-resume sessions
        if (state === "connected" && isReconnect) {
          const isRestart = meta?.isServerRestart || get()._lastDisconnectWasRestart;
          _handleReconnection(get, set, isRestart);
          if (isRestart) set({ _lastDisconnectWasRestart: false });
        }

        // When connection drops, finalize any streaming cards
        if (state === "disconnected" && prev === "connected") {
          const isRestart = meta?.isServerRestart ?? false;
          if (isRestart) set({ _lastDisconnectWasRestart: true });

          const { cards } = get();
          const updates: Record<string, Card> = {};
          const marker = isRestart ? "\n\u200B[server:restarting]\n" : "\n\u200B[connection:lost]\n";
          for (const [id, card] of Object.entries(cards)) {
            if (card.status === "streaming") {
              if (card.type === "shell") {
                const writer = shellWriters.get(id);
                if (writer) writer(isRestart ? "\r\n\x1b[36m[Server restarting]\x1b[0m\r\n" : "\r\n\x1b[33m[Connection lost]\x1b[0m\r\n");
                updates[id] = { ...card, status: "complete", updatedAt: Date.now() };
              } else {
                updates[id] = {
                  ...card,
                  status: "complete",
                  text: (card.text ?? "") + marker,
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
    initErrorReporter((msg) => client.send(msg));
    initNotifications();
    client.connect();
  },

  disconnect: () => {
    get()._wsClient?.disconnect();
    set({ _wsClient: null, connectionState: "disconnected" });
  },

  sendMessage: (text: string, routing?: ToolRouting, sourceCardId?: string) => {
    let displayText = text;
    let finalRouting = routing;

    /** Add a card to store, persist it to the server journal, and auto-title the conversation */
    const addLocalCard = (card: Card, commandText?: string) => {
      set((s) => ({
        cardOrder: [...s.cardOrder, card.id],
        cards: { ...s.cards, [card.id]: card },
      }));
      get()._wsClient?.send({
        type: "card.persist",
        conversationId: get().activeConversationId,
        cardRecord: {
          id: card.id,
          runId: card.runId,
          type: card.type,
          role: card.role,
          text: card.text,
          data: card.data,
          timestamp: card.updatedAt ?? Date.now(),
        },
      });
      if (commandText) {
        const convId = get().activeConversationId;
        const conv = get().conversationsList.find((c) => c.id === convId);
        const curTitle = conv?.title?.trim().toLowerCase() ?? "";
        if (!curTitle || curTitle === "new chat" || curTitle === "chat") {
          const title = deriveConversationTitle(commandText);
          if (title && title.toLowerCase() !== "new chat") {
            get().renameConversationById(convId, title);
          }
        }
      }
    };

    // Skip slash-command interception when routing is already set
    // (e.g. terminal input sends with claude-code routing — text should
    // go to Claude Code as-is, not be intercepted as a slash command)
    if (!finalRouting) {
      // "/help" command — show available commands locally
      if (text.trim() === "/help") {
        const id = uuidv4();
        const now = Date.now();
        addLocalCard({
          id, runId: id, type: "chat", role: "assistant",
          status: "complete", display: "expanded",
          text: `## Available Commands

| Command | Description |
|---------|-------------|
| **/research** <topic> | Deep research with live web sources |
| **/code** [prompt] | Launch Claude Code AI engineer |
| **/shell** | Open a remote terminal |
| **/orchestrate** | Multi-agent parallel workflows |
| **/projects** | Manage projects and AI teams |
| **/evolve** | Run an evolution sprint |
| **/tool enso** | Open the tool console |
| **/evolution-history** | Browse past evolution sprints |
| **/help** | Show this help card |

**Tips:** Type / to see autocomplete suggestions. Attach files with +. Every response can become an app.`,
          createdAt: now, updatedAt: now,
        }, text.trim());
        return;
      }

      // "/delete-apps" command — delete all dynamically created apps
      if (text.trim() === "/delete-apps") {
        get().deleteAllApps();
        return;
      }

      // "/orchestrate" command — launch orchestrator
      // "/orchestrate <goal>" — launch with pre-populated goal
      if (text.trim() === "/orchestrate" || text.trim().startsWith("/orchestrate ")) {
        const goal = text.trim().startsWith("/orchestrate ")
          ? text.trim().slice("/orchestrate ".length).trim()
          : "";
        const id = uuidv4();
        const now = Date.now();
        addLocalCard({
          id,
          runId: id,
          type: "orchestration",
          role: "assistant",
          status: "complete",
          display: "expanded",
          createdAt: now,
          updatedAt: now,
          data: goal ? { orchestrationGoal: goal } : undefined,
        }, text.trim());
        return;
      }


      // "/evolution-history" command — browse past evolution sprints
      if (text.trim() === "/evolution-history") {
        const id = uuidv4();
        const now = Date.now();
        addLocalCard({
          id, runId: id, type: "evolution-history", role: "assistant",
          status: "complete", display: "expanded", createdAt: now, updatedAt: now,
        }, text.trim());
        return;
      }

      // "/discovery-history" command — browse past AI VC discovery sprints
      if (text.trim() === "/discovery-history") {
        const id = uuidv4();
        const now = Date.now();
        addLocalCard({
          id, runId: id, type: "discovery-history", role: "assistant",
          status: "complete", display: "expanded", createdAt: now, updatedAt: now,
        }, text.trim());
        return;
      }

      // "/sessions" command — open session dashboard
      if (text.trim() === "/sessions") {
        const id = uuidv4();
        const now = Date.now();
        addLocalCard({
          id, runId: id, type: "session-dashboard", role: "assistant",
          status: "complete", display: "expanded", createdAt: now, updatedAt: now,
        }, text.trim());
        return;
      }

      // "/projects" command — open projects manager
      if (text.trim() === "/projects") {
        const id = uuidv4();
        const now = Date.now();
        addLocalCard({
          id, runId: id, type: "projects", role: "assistant",
          status: "complete", display: "expanded", createdAt: now, updatedAt: now,
        }, text.trim());
        return;
      }

      // "/evolve" command — launch evolution sprint
      if (text.trim().startsWith("/evolve")) {
        const goal = text.trim().slice(7).trim();
        get()._wsClient?.send({
          type: "evolution.start",
          evolutionGoal: goal || undefined,
          projectId: localStorage.getItem("enso-active-project") || "enso",
        } as any);
        return;
      }

      // "/discover" command — launch AI VC discovery sprint
      if (text.trim().startsWith("/discover")) {
        const focus = text.trim().slice(9).trim();
        get()._wsClient?.send({
          type: "discovery.start",
          text: focus || undefined,
        } as any);
        return;
      }

      // "/shell" command — launch remote terminal
      // "/shell <command>" — launch terminal and auto-execute command
      if (text.trim() === "/shell" || text.trim().startsWith("/shell ")) {
        const shellCommand = text.trim().startsWith("/shell ") ? text.trim().slice(7).trim() : undefined;
        get().launchShell(shellCommand);
        return;
      }

      // "/research <topic>" — route directly to researcher tool
      if (text.trim().startsWith("/research ")) {
        const topic = text.trim().slice("/research ".length).trim();
        if (topic) {
          displayText = topic;
          finalRouting = { mode: "direct_tool", toolId: "researcher" };
        }
      }
      // bare "/research" with no topic falls through to normal message path

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
          toolMeta: { toolId: TOOL_ID_CLAUDE_CODE },
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
        const cwd = termCard?.toolMeta?.cwd ?? get().codeSessionCwd ?? get().defaultProjectCwd;
        const toolSessionId = termCard?.toolMeta?.toolSessionId ?? get().codeSessionId;

        if (!cwd) {
          // No project selected — queue text and show project picker
          set({ _pendingCodeText: displayText });
          get().fetchProjects();
          const existingTermId = get()._activeTerminalCardId;
          if (!existingTermId || !get().cards[existingTermId]) {
            const id = uuidv4();
            const now = Date.now();
            const card: Card = {
              id,
              runId: id,
              type: "terminal",
              role: "assistant",
              status: "complete",
              display: "expanded",
              toolMeta: { toolId: TOOL_ID_CLAUDE_CODE },
              data: displayText ? { pendingCodeText: displayText } : undefined,
              createdAt: now,
              updatedAt: now,
            };
            set((s) => ({
              cardOrder: [...s.cardOrder, id],
              cards: { ...s.cards, [id]: card },
              _activeTerminalCardId: id,
            }));
          }
          return;
        }

        finalRouting = {
          mode: "direct_tool",
          toolId: TOOL_ID_CLAUDE_CODE,
          ...(toolSessionId ? { toolSessionId } : {}),
          ...(cwd ? { cwd } : {}),
        };
        // Route to the active terminal card if available
        if (termId) sourceCardId = termId;
      }
    }

    // Terminal routing: append to specific or active terminal card
    if (finalRouting?.toolId === TOOL_ID_CLAUDE_CODE) {
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
          toolMeta: { toolId: TOOL_ID_CLAUDE_CODE, ...(finalRouting.cwd ? { cwd: finalRouting.cwd } : {}) },
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

      const wsClient = get()._wsClient;
      if (!wsClient) {
        // WS not connected — revert card to "complete" so input stays usable
        set((s) => {
          const card = s.cards[termCardId!];
          if (!card) return s;
          return {
            cards: { ...s.cards, [termCardId!]: { ...card, status: "complete", updatedAt: Date.now() } },
            isWaiting: false,
          };
        });
        return;
      }
      wsClient.send({
        type: "chat.send",
        conversationId: get().activeConversationId,
        text: displayText,
        routing: finalRouting,
        sourceCardId: termCardId,
      });
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

    // Remove any existing thinking card before creating a new one
    const oldThinkingId = get()._thinkingCardId;
    if (oldThinkingId) {
      set((s) => {
        const { [oldThinkingId]: _, ...remainingCards } = s.cards;
        return {
          cardOrder: s.cardOrder.filter(cid => cid !== oldThinkingId),
          cards: remainingCards,
          _thinkingCardId: null,
        };
      });
    }

    const thinkingId = uuidv4();
    const thinkingCard: Card = {
      id: thinkingId,
      runId: thinkingId,
      type: "thinking",
      role: "assistant",
      status: "streaming",
      display: "expanded",
      text: "Processing your request...",
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({
      cardOrder: [...s.cardOrder, id, thinkingId],
      cards: { ...s.cards, [id]: card, [thinkingId]: thinkingCard },
      _thinkingCardId: thinkingId,
      isWaiting: true,
      chatViewOpen: true,
    }));
    get()._wsClient?.send({
      type: "chat.send",
      conversationId: get().activeConversationId,
      text: displayText,
      routing: finalRouting,
    });
  },

  sendMessageWithMedia: async (text: string, mediaFiles: File[], intent?: "image_research" | "image_search") => {
    const id = uuidv4();
    const now = Date.now();

    // Optimistic UI: show the user bubble IMMEDIATELY with local blob previews
    const localPreviews = mediaFiles.map((f) => URL.createObjectURL(f));

    // Remove any existing thinking card before creating a new one
    const oldThinkingId = get()._thinkingCardId;
    if (oldThinkingId) {
      set((s) => {
        const { [oldThinkingId]: _, ...remainingCards } = s.cards;
        return {
          cardOrder: s.cardOrder.filter(cid => cid !== oldThinkingId),
          cards: remainingCards,
          _thinkingCardId: null,
        };
      });
    }

    const thinkingId = uuidv4();
    const card: Card = {
      id,
      runId: id,
      type: "user-bubble",
      role: "user",
      status: "complete",
      display: "expanded",
      text,
      mediaUrls: localPreviews,
      createdAt: now,
      updatedAt: now,
    };
    const thinkingCard: Card = {
      id: thinkingId,
      runId: thinkingId,
      type: "thinking",
      role: "assistant",
      status: "streaming",
      display: "expanded",
      text: "Processing your request...",
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({
      cardOrder: [...s.cardOrder, id, thinkingId],
      cards: { ...s.cards, [id]: card, [thinkingId]: thinkingCard },
      _thinkingCardId: thinkingId,
      isWaiting: true,
    }));

    // Background: compress images + upload all files in parallel
    const { compressImageFile } = await import("../lib/media-actions");

    const uploadResults = await Promise.all(
      mediaFiles.map(async (file) => {
        const compressed = await compressImageFile(file);
        const res = await fetch(`${getBackendBaseUrl()}/upload`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": compressed.type }),
          body: compressed,
        });
        if (res.ok) {
          return (await res.json()) as { filePath: string; mediaUrl: string };
        }
        return null;
      }),
    );

    const serverPaths = uploadResults.filter(Boolean).map((r) => r!.filePath);
    const serverUrls = uploadResults.filter(Boolean).map((r) => r!.mediaUrl);

    // Update card with server URLs (replaces blob: previews for persistence/history)
    if (serverUrls.length > 0) {
      set((s) => ({
        cards: {
          ...s.cards,
          [id]: { ...s.cards[id]!, mediaUrls: serverUrls, updatedAt: Date.now() },
        },
      }));
    }

    // Revoke blob URLs to free memory
    for (const url of localPreviews) URL.revokeObjectURL(url);

    // Send to server via WebSocket
    get()._wsClient?.send({
      type: intent === "image_research" ? "image_research" : intent === "image_search" ? "image_search" : "chat.send",
      conversationId: get().activeConversationId,
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
    // For deep research: eagerly snapshot standard data BEFORE any backend response
    // can overwrite card.data with interim "building" state.
    // The Deep button uses action "search" with depth:"deep", not "deep_dive"
    const isDeepDive = action === "deep_dive"
      || (action === "search" && (payload as Record<string, unknown>)?.depth === "deep");
    // Request notification permission for long-running deep research
    if (isDeepDive) requestNotificationPermission();
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
          ...(isDeepDive ? {
            // Snapshot standard data with hasDeepResearch flag so the Deep button
            // is greyed out / hidden when viewing Standard during/after deep build
            standardDataSnapshot: card.data && typeof card.data === "object"
              ? { ...(card.data as Record<string, unknown>), hasDeepResearch: true }
              : card.data,
            standardGeneratedUISnapshot: card.generatedUI,
          } : {}),
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

    requestNotificationPermission();

    // Put the card into building mode — Claude Code will stream into buildTerminalText
    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...s.cards[cardId],
          deepResearchStatus: "building" as const,
          buildTerminalText: "",
          viewMode: "app" as const,
          enhanceStatus: "ready" as const,
          appCardMode: { interactionMode: "tool", signatureId: "app_building" },
          updatedAt: Date.now(),
        },
      },
    }));

    const { cardOrder, cards } = get();
    const recent = cardOrder.slice(-6).map((id) => cards[id]).filter(Boolean);
    const conversationContext = recent
      .map((c) => `[${c.role}] ${(c.text ?? "").slice(0, 400)}`)
      .join("\n\n");

    get()._wsClient?.send({
      type: "card.build_app",
      cardId,
      cardText,
      buildAppDefinition: definition,
      conversationContext,
    });
  },

  // ── Orchestration ──

  startOrchestration: (cardId: string, goal: string) => {
    set((s) => {
      const card = s.cards[cardId];
      if (!card) return s;
      return {
        cards: {
          ...s.cards,
          [cardId]: {
            ...card,
            data: {
              ...(card.data && typeof card.data === "object" ? card.data : {}),
              orchestrationProgress: {
                orchestrationId: "",
                eventType: "plan_ready",
                plan: { orchestrationId: "", goal, tasks: [], agents: [], status: "planning" },
              },
            } as OrchestrationCardData,
            updatedAt: Date.now(),
          },
        },
      };
    });

    // Request notification permission for long-running orchestration
    requestNotificationPermission();

    get()._wsClient?.send({
      type: "orchestration.start",
      cardId,
      orchestrationGoal: goal,
    });
  },

  approveOrchestration: (orchestrationId: string, taskIds?: string[]) => {
    get()._wsClient?.send({
      type: "orchestration.approve",
      orchestrationId,
      orchestrationApprovedTasks: taskIds,
    });
  },

  pauseOrchestration: (orchestrationId: string) => {
    get()._wsClient?.send({
      type: "orchestration.pause",
      orchestrationId,
    });
  },

  resumeOrchestration: (orchestrationId: string) => {
    get()._wsClient?.send({
      type: "orchestration.resume",
      orchestrationId,
    });
  },

  cancelOrchestration: (orchestrationId: string) => {
    get()._wsClient?.send({
      type: "orchestration.cancel",
      orchestrationId,
    });
  },

  toggleCardView: (cardId: string, viewMode: "original" | "app" | "plan" | "sessions") => {
    set((s) => {
      const card = s.cards[cardId];
      if (!card) return s;
      const clearPending =
        viewMode === "app" || (card.pendingAutoAppReveal && viewMode === "original");
      return {
        cards: {
          ...s.cards,
          [cardId]: {
            ...card,
            viewMode,
            ...(clearPending ? { pendingAutoAppReveal: false } : {}),
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  completeAutoAppReveal: (cardId: string) => {
    set((s) => {
      const card = s.cards[cardId];
      if (!card?.pendingAutoAppReveal) return s;
      return {
        cards: {
          ...s.cards,
          [cardId]: {
            ...card,
            pendingAutoAppReveal: false,
            viewMode: "app",
            updatedAt: Date.now(),
          },
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

  removeCard: (cardId: string) => {
    set((s) => {
      const { [cardId]: _, ...rest } = s.cards;
      return {
        cards: rest,
        cardOrder: s.cardOrder.filter((id) => id !== cardId),
        pinnedCards: s.pinnedCards.filter((id) => id !== cardId),
      };
    });
  },

  deleteAllApps: () => {
    get()._wsClient?.send({ type: "card.delete_all_apps" });
  },

  deleteApp: (toolFamily: string) => {
    get()._wsClient?.send({ type: "apps.delete", toolFamily });
  },

  fetchApps: () => {
    get()._wsClient?.send({ type: "apps.list" });
  },

  runApp: (toolFamily: string) => {
    set({ isWaiting: true });
    get()._wsClient?.send({
      type: "apps.run",
      toolFamily,
      conversationId: get().activeConversationId,
    });
  },

  saveAppToCodebase: (toolFamily: string) => {
    get()._wsClient?.send({ type: "app.promote", toolFamily });
  },

  promoteApp: (appId: string) => {
    get()._wsClient?.send({ type: "app.promote", toolFamily: appId });
  },

  restartServer: () => {
    get()._wsClient?.send({ type: "server.restart" });
  },

  launchEnsoCode: (instruction?: string) => {
    get().fetchProjects();

    // Reuse existing active terminal card if one exists (only when no instruction)
    if (!instruction) {
      const existingTermId = get()._activeTerminalCardId;
      if (existingTermId && get().cards[existingTermId]) {
        return;
      }
    }

    const ensoPath = get().ensoProjectPath;

    // If instruction + known project path, launch directly with prompt
    if (instruction && ensoPath) {
      localStorage.setItem(STORAGE_KEYS.CODE_SESSION_CWD, ensoPath);
      localStorage.removeItem(STORAGE_KEYS.CODE_SESSION_ID);

      const id = uuidv4();
      const now = Date.now();
      const card: Card = {
        id,
        runId: id,
        type: "terminal",
        role: "assistant",
        status: "streaming",
        display: "expanded",
        text: `>>> ${instruction}\n`,
        toolMeta: { toolId: TOOL_ID_CLAUDE_CODE, cwd: ensoPath },
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
      const routing: ToolRouting = { mode: "direct_tool", toolId: TOOL_ID_CLAUDE_CODE, cwd: ensoPath };
      get()._wsClient?.send({
        type: "chat.send",
        conversationId: get().activeConversationId,
        text: instruction,
        routing,
        sourceCardId: id,
      });
      return;
    }

    // No instruction — create terminal card without CWD so the project picker is shown
    const id = uuidv4();
    const now = Date.now();
    const card: Card = {
      id,
      runId: id,
      type: "terminal",
      role: "assistant",
      status: "complete",
      display: "expanded",
      toolMeta: { toolId: TOOL_ID_CLAUDE_CODE },
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      cardOrder: [...s.cardOrder, id],
      cards: { ...s.cards, [id]: card },
      _activeTerminalCardId: id,
    }));
  },

  launchShell: (initialCommand?: string) => {
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
      data: initialCommand ? { initialCommand } : undefined,
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

  sendShellInput: (text: string) => {
    const sessionId = get().getActiveShellSessionId();
    if (!sessionId) return;
    get()._wsClient?.send({
      type: "shell.input",
      shellSessionId: sessionId,
      shellInput: text + "\r",
    });
  },

  getActiveShellSessionId: () => {
    const { cardOrder, cards } = get();
    for (let i = cardOrder.length - 1; i >= 0; i--) {
      const card = cards[cardOrder[i]];
      if (card?.type === "shell" && card.status === "streaming" && card.toolMeta?.toolSessionId) {
        return card.toolMeta.toolSessionId;
      }
    }
    return null;
  },

  hasActiveBackgroundTask: () => {
    const { cardOrder, cards } = get();
    for (const id of cardOrder) {
      const c = cards[id];
      if (!c || c.status !== "streaming") continue;
      if (c.type === "terminal" || c.type === "shell" || c.type === "orchestration" || c.deepResearchStatus === "building") {
        return true;
      }
    }
    return false;
  },

  sendDebugReport: (description: string, imagePaths: string[]) => {
    const ensoPath = get().ensoProjectPath;
    if (!ensoPath) return;

    // Update global convenience state
    localStorage.setItem(STORAGE_KEYS.CODE_SESSION_CWD, ensoPath);
    localStorage.removeItem(STORAGE_KEYS.CODE_SESSION_ID);

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
      "   - If ONLY backend files changed (`server/`):",
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
      toolMeta: { toolId: TOOL_ID_CLAUDE_CODE, cwd: ensoPath },
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
      toolId: TOOL_ID_CLAUDE_CODE,
      cwd: ensoPath,
    };

    get()._wsClient?.send({
      type: "chat.send",
      conversationId: get().activeConversationId,
      text: prompt,
      routing,
      sourceCardId: id,
    });
  },

  codeInvestigate: (cardId: string, instruction: string) => {
    const card = get().cards[cardId];
    if (!card) return;

    const ensoPath = get().ensoProjectPath;
    if (!ensoPath) return;

    localStorage.setItem(STORAGE_KEYS.CODE_SESSION_CWD, ensoPath);
    localStorage.removeItem(STORAGE_KEYS.CODE_SESSION_ID);

    const promptParts: string[] = [
      `## Enhancement Request`,
      instruction,
      "",
      "You are enhancing an Enso app. Focus on improving the user experience — adding features, better visuals, richer interactivity, new data views, or improved layouts. Use the context below to understand the current app.",
      "",
    ];

    // For dynamic-ui / app cards — include app context
    const activeMode = card.appCardMode ?? card.cardMode;
    const activeAppId = activeMode?.appId ?? activeMode?.toolFamily;
    if (activeAppId) {
      promptParts.push(
        `## App: ${activeAppId}`,
        `Location: Look in ~/.enso/apps/${activeAppId}/ or server/apps/${activeAppId}/`,
        `Read CLAUDE-REFERENCE.md for the app structure reference.`,
        "",
      );
    }

    // Include card text if available
    if (card.text) {
      promptParts.push("## Current Content", card.text.slice(0, 4000), "");
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
      text: `>>> Enhancing app...\n`,
      toolMeta: { toolId: TOOL_ID_CLAUDE_CODE, cwd: ensoPath },
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
      toolId: TOOL_ID_CLAUDE_CODE,
      cwd: ensoPath,
    };

    get()._wsClient?.send({
      type: "chat.send",
      conversationId: get().activeConversationId,
      text: prompt,
      routing,
      sourceCardId: id,
    });
  },

  launchSystemEnhance: (instruction: string) => {
    const ensoPath = get().ensoProjectPath;
    if (!ensoPath) return;

    localStorage.setItem(STORAGE_KEYS.CODE_SESSION_CWD, ensoPath);
    localStorage.removeItem(STORAGE_KEYS.CODE_SESSION_ID);

    const prompt = [
      "The user wants to enhance the Enso system.",
      "",
      "## Enhancement Request",
      instruction,
      "",
      "## Instructions",
      "Analyze the codebase deeply across both the frontend (src/) and backend (server/src/).",
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
      toolMeta: { toolId: TOOL_ID_CLAUDE_CODE, cwd: ensoPath },
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
      toolId: TOOL_ID_CLAUDE_CODE,
      cwd: ensoPath,
    };

    get()._wsClient?.send({
      type: "chat.send",
      conversationId: get().activeConversationId,
      text: prompt,
      routing,
      sourceCardId: id,
    });
  },

  fetchProjects: () => {
    get()._wsClient?.send({ type: "tools.list_projects" });
  },

  setCodeSessionCwd: (cwd: string) => {
    const prev = get().codeSessionCwd;
    localStorage.setItem(STORAGE_KEYS.CODE_SESSION_CWD, cwd);
    const termId = get()._activeTerminalCardId;

    // Update global state + active terminal card's toolMeta
    const updates: Record<string, unknown> = { codeSessionCwd: cwd };
    if (prev && prev !== cwd) {
      localStorage.removeItem(STORAGE_KEYS.CODE_SESSION_ID);
      updates.codeSessionId = null;
    }

    if (termId) {
      const card = get().cards[termId];
      if (card) {
        updates.cards = {
          ...get().cards,
          [termId]: {
            ...card,
            toolMeta: { ...card.toolMeta, toolId: TOOL_ID_CLAUDE_CODE, cwd, toolSessionId: undefined },
            updatedAt: Date.now(),
          },
        };
      }
    }

    set(updates as Partial<CardStore>);

    // After setting cwd, check for pending /code text
    const pendingText = get()._pendingCodeText;
    if (pendingText) {
      set({ _pendingCodeText: null });
      get().sendMessage(`/code ${pendingText}`);
    }
  },

  switchTerminalProject: (cardId: string, cwd: string) => {
    const card = get().cards[cardId];
    if (!card) return;
    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...card,
          toolMeta: { toolId: TOOL_ID_CLAUDE_CODE, cwd },
          updatedAt: Date.now(),
        },
      },
      // Also update global convenience state
      codeSessionCwd: cwd,
      codeSessionId: null,
    }));
    localStorage.setItem(STORAGE_KEYS.CODE_SESSION_CWD, cwd);
    localStorage.removeItem(STORAGE_KEYS.CODE_SESSION_ID);
  },

  resumeSessionOnCard: (cardId: string, sessionId: string, cwd: string) => {
    const card = get().cards[cardId];
    if (!card) return;
    set((s) => ({
      cards: {
        ...s.cards,
        [cardId]: {
          ...card,
          toolMeta: { toolId: TOOL_ID_CLAUDE_CODE, cwd, toolSessionId: sessionId },
          updatedAt: Date.now(),
        },
      },
    }));
  },

  setClaudeModel: (model: string, thinking?: "adaptive" | "disabled") => {
    const patch: Partial<CardStore> = { claudeModel: model };
    localStorage.setItem(STORAGE_KEYS.CLAUDE_MODEL, model);
    if (thinking) {
      patch.claudeThinking = thinking;
      localStorage.setItem(STORAGE_KEYS.CLAUDE_THINKING, thinking);
    }
    set(patch);
    const ws = get()._wsClient;
    if (ws) {
      ws.send({ type: "settings.set_model", claudeModel: model, claudeThinking: thinking ?? get().claudeThinking } as import("@shared/types").ClientMessage);
    }
  },

  setChatModel: (model: string) => {
    set({ chatModel: model });
    localStorage.setItem(STORAGE_KEYS.CHAT_MODEL, model);
    const ws = get()._wsClient;
    if (ws) {
      ws.send({ type: "settings.set_chat_model", chatModel: model } as import("@shared/types").ClientMessage);
    }
  },

  configureProvider: (providerId: string, apiKey: string) => {
    const ws = get()._wsClient;
    if (ws) {
      ws.send({ type: "settings.set_provider_key", providerId, providerApiKey: apiKey } as import("@shared/types").ClientMessage);
    }
  },

  setLanguage: (language: "en" | "zh") => {
    set({ language });
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, language);
    _setLocale(language);
    const ws = get()._wsClient;
    if (ws) {
      ws.send({ type: "settings.set_language", language } as import("@shared/types").ClientMessage);
    }
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
      onStateChange: (state, isReconnect, meta) => {
        const prev = get().connectionState;
        set({ connectionState: state });

        // Handle successful reconnection
        if (state === "connected" && isReconnect) {
          const isRestart = meta?.isServerRestart || get()._lastDisconnectWasRestart;
          _handleReconnection(get, set, isRestart);
          if (isRestart) set({ _lastDisconnectWasRestart: false });
        }

        if (state === "disconnected" && prev === "connected") {
          const isRestart = meta?.isServerRestart ?? false;
          if (isRestart) set({ _lastDisconnectWasRestart: true });

          const { cards } = get();
          const updates: Record<string, Card> = {};
          const marker = isRestart ? "\n\u200B[server:restarting]\n" : "\n\u200B[connection:lost]\n";
          for (const [id, card] of Object.entries(cards)) {
            if (card.status === "streaming") {
              if (card.type === "shell") {
                const writer = shellWriters.get(id);
                if (writer) writer(isRestart ? "\r\n\x1b[36m[Server restarting]\x1b[0m\r\n" : "\r\n\x1b[33m[Connection lost]\x1b[0m\r\n");
                updates[id] = { ...card, status: "complete", updatedAt: Date.now() };
              } else {
                updates[id] = { ...card, status: "complete", text: (card.text ?? "") + marker, operation: undefined, updatedAt: Date.now() };
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
    initErrorReporter((msg) => client.send(msg));
    client.connect();

    // On mobile (Capacitor), manage WS lifecycle around app background/foreground.
    // Don't disconnect immediately on background — let the OS/server ping timeout
    // handle it naturally. This avoids unnecessary disconnect/reconnect churn for
    // quick app switches (checking notifications, replying to a text, etc.).
    // Only reconnect proactively when returning to foreground.
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      import("@capacitor/app").then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            // App returning to foreground — reconnect if needed.
            // The backend will replay any buffered messages.
            client.connect();
          }
          // Background: do nothing — let OS/server timeout handle disconnect.
          // Server buffers messages once the socket dies, so no output is lost.
        });
      }).catch(() => { /* not native — no-op */ });
    }
  },

  loadSharedCard: async (cardId: string) => {
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}${API.CARD_STATE(encodeURIComponent(cardId))}`, {
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
        cardMode: (state.appId ?? state.toolFamily) ? {
          interactionMode: "tool" as const,
          appId: state.appId ?? state.toolFamily,
          toolFamily: state.appId ?? state.toolFamily,
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
      localStorage.setItem(STORAGE_KEYS.PINNED_CARDS, JSON.stringify(pins));
      return { pinnedCards: pins, showSidebar: true };
    });
  },

  unpinCard: (cardId: string) => {
    set((s) => {
      const pins = s.pinnedCards.filter((id) => id !== cardId);
      localStorage.setItem(STORAGE_KEYS.PINNED_CARDS, JSON.stringify(pins));
      return { pinnedCards: pins };
    });
  },

  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),

  requestCardSummary: (cardId: string) => {
    const card = get().cards[cardId];
    if (!card) return;
    const wsClient = get()._wsClient;
    if (!wsClient) return;
    const MAX_TEXT = 10000;
    const msg: ClientMessage = {
      type: "card.summarize",
      cardId,
      cardType: card.type,
      cardContent: {
        text: card.text?.slice(0, MAX_TEXT),
        data: card.data,
        taskTerminals: card.taskTerminals,
      },
    };
    wsClient.send(msg);
  },
  requestCardEvolution: (cardId: string, options?: { goal?: string; includeResearch?: boolean }) => {
    const card = get().cards[cardId];
    if (!card) return;
    const wsClient = get()._wsClient;
    if (!wsClient) return;
    const MAX_TEXT = 10000;
    const activeMode = card.appCardMode ?? card.cardMode;
    const msg: ClientMessage = {
      type: "card.evolve",
      cardId,
      cardType: card.type,
      cardContent: {
        text: card.text?.slice(0, MAX_TEXT),
        data: card.data,
        taskTerminals: card.taskTerminals,
      },
      appId: activeMode?.appId ?? activeMode?.toolFamily,
      toolFamily: activeMode?.toolFamily ?? activeMode?.appId,
      evolutionGoal: options?.goal,
      includeResearch: options?.includeResearch,
    };
    wsClient.send(msg);
  },
  releaseCard: (cardId: string) => {
    const card = get().cards[cardId];
    if (!card) return;
    const wsClient = get()._wsClient;
    if (!wsClient) return;
    const activeMode = card.appCardMode ?? card.cardMode;
    wsClient.send({
      type: "card.release",
      cardId,
      appId: activeMode?.appId ?? activeMode?.toolFamily,
      toolFamily: activeMode?.toolFamily ?? activeMode?.appId,
    } as ClientMessage);
  },
  setCardSearchQuery: (query: string) => set({ cardSearchQuery: query }),
  setCardSearchVisible: (visible: boolean) => set((s) => ({
    cardSearchVisible: visible,
    cardSearchQuery: visible ? s.cardSearchQuery : "",
  })),

  clearConversation: () => {
    set({
      cardOrder: [],
      cards: {},
      isWaiting: false,
      _activeTerminalCardId: null,
      _pendingCodeText: null,
      _thinkingCardId: null,
      pinnedCards: [],
    });
    localStorage.removeItem(STORAGE_KEYS.PINNED_CARDS);
  },

  refreshConversationsList: async () => {
    try {
      const clientId = getClientId();
      const res = await fetch(
        `${getBackendBaseUrl()}${API.CONVERSATIONS}?clientId=${encodeURIComponent(clientId)}`,
        { headers: authHeaders(), signal: AbortSignal.timeout(TIMINGS.API_FETCH_TIMEOUT) },
      );
      if (!res.ok) return;
      const j = (await res.json()) as { conversations: ConversationEntry[] };
      set({ conversationsList: j.conversations ?? [] });
    } catch {
      // best-effort
    }
  },

  selectConversation: (id: string) => {
    const ws = get()._wsClient;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, id);
    set({
      activeConversationId: id,
      cardOrder: [],
      cards: {},
      isWaiting: false,
      _activeTerminalCardId: null,
      _pendingCodeText: null,
      _thinkingCardId: null,
      recentTopics: [],
      chatViewOpen: true,
    });
    if (ws) ws.send({ type: "chat.history", historyCount: 50, conversationId: id });
  },

  startNewChat: async (title?: string) => {
    try {
      const clientId = getClientId();
      const res = await fetch(`${getBackendBaseUrl()}${API.CONVERSATIONS}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId, ...(title ? { title } : {}) }),
        signal: AbortSignal.timeout(TIMINGS.API_FETCH_TIMEOUT),
      });
      if (!res.ok) return;
      const created = (await res.json()) as { id: string };
      await get().refreshConversationsList();
      get().selectConversation(created.id);
    } catch {
      // best-effort
    }
  },

  launchCommandInNewChat: async (message: string) => {
    const title = deriveConversationTitle(message);
    await get().startNewChat(title);
    get().sendMessage(message);
    set({ activeTab: "chat", chatViewOpen: true });
  },

  deleteConversationById: async (id: string) => {
    try {
      const clientId = getClientId();
      const res = await fetch(
        `${getBackendBaseUrl()}${API.CONVERSATIONS}/${encodeURIComponent(id)}?clientId=${encodeURIComponent(clientId)}`,
        { method: "DELETE", headers: authHeaders(), signal: AbortSignal.timeout(TIMINGS.API_FETCH_TIMEOUT) },
      );
      if (!res.ok) return;
      const wasActive = get().activeConversationId === id;
      await get().refreshConversationsList();
      if (wasActive) {
        const first = get().conversationsList[0];
        if (first) get().selectConversation(first.id);
      }
    } catch {
      // best-effort
    }
  },

  renameConversationById: async (id: string, title: string) => {
    try {
      const clientId = getClientId();
      const res = await fetch(`${getBackendBaseUrl()}${API.CONVERSATIONS}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId, title }),
        signal: AbortSignal.timeout(TIMINGS.API_FETCH_TIMEOUT),
      });
      if (!res.ok) return;
      await get().refreshConversationsList();
    } catch {
      // best-effort
    }
  },

  _handleServerMessage: (msg: ServerMessage) => {
    // Handle settings messages (mode + tool families)
    if (msg.settings) {
      const patch: Partial<CardStore> = {};
      if (msg.settings.toolFamilies) patch.toolFamilies = msg.settings.toolFamilies;
      if (msg.settings.ensoProjectPath) patch.ensoProjectPath = msg.settings.ensoProjectPath;
      if (msg.settings.defaultProjectCwd) patch.defaultProjectCwd = msg.settings.defaultProjectCwd;
      if (msg.settings.claudeModel) {
        patch.claudeModel = msg.settings.claudeModel;
        localStorage.setItem(STORAGE_KEYS.CLAUDE_MODEL, msg.settings.claudeModel);
      }
      if (msg.settings.claudeThinking) {
        patch.claudeThinking = msg.settings.claudeThinking;
        localStorage.setItem(STORAGE_KEYS.CLAUDE_THINKING, msg.settings.claudeThinking);
      }
      if (msg.settings.chatModel) {
        patch.chatModel = msg.settings.chatModel;
        localStorage.setItem(STORAGE_KEYS.CHAT_MODEL, msg.settings.chatModel);
      }
      if (msg.settings.providers) {
        patch.providers = msg.settings.providers;
      }
      if (msg.settings.language) {
        patch.language = msg.settings.language as Locale;
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, msg.settings.language);
        _setLocale(msg.settings.language as Locale);
      }
      // Boot ID mismatch detection — catches abrupt kills where close code
      // 4078 was never received.  If the server restarted, cancel any pending
      // auto-resume timers and upgrade connection:lost markers.
      if (msg.settings.bootId) {
        const prevBootId = get()._serverBootId;
        patch._serverBootId = msg.settings.bootId;
        if (prevBootId && prevBootId !== msg.settings.bootId) {
          _cancelPendingResumes();
          // Upgrade any connection:lost markers to server:restarted
          const { cards } = get();
          const cardUpdates: Record<string, Card> = {};
          for (const [id, card] of Object.entries(cards)) {
            if (card.text?.includes("\u200B[connection:lost]")) {
              cardUpdates[id] = {
                ...card,
                text: card.text.replace(/\u200B\[connection:lost\]\n?/g, "\u200B[server:restarted]\n"),
                updatedAt: Date.now(),
              };
            }
          }
          if (Object.keys(cardUpdates).length > 0) {
            set((s) => ({ cards: { ...s.cards, ...cardUpdates } }));
          }
        }
      }

      if (Object.keys(patch).length > 0) set(patch);

      // Request chat history + sync models only on initial settings (has toolFamilies)
      if (msg.settings.toolFamilies) {
        const wsClient = get()._wsClient;
        if (wsClient) {
          void (async () => {
            await get().refreshConversationsList();
            const list = get().conversationsList;
            let active = get().activeConversationId;
            if (list.length > 0 && !list.some((c) => c.id === active)) {
              active = list[0].id;
              localStorage.setItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, active);
              set({ activeConversationId: active });
            }
            wsClient.send({ type: "chat.history", historyCount: 50, conversationId: active });
          })();
          const { claudeModel: model, claudeThinking: thinking, chatModel } = get();
          if (model) {
            wsClient.send({ type: "settings.set_model", claudeModel: model, claudeThinking: thinking } as import("@shared/types").ClientMessage);
          }
          if (chatModel) {
            wsClient.send({ type: "settings.set_chat_model", chatModel } as import("@shared/types").ClientMessage);
          }
        }
      }
      return;
    }

    if (msg.conversationsList) {
      set({ conversationsList: msg.conversationsList });
    }

    // Handle card history batch (response to chat.history)
    if (msg.cardHistory?.length) {
      const historicCards: Record<string, Card> = {};
      const historicOrder: string[] = [];
      for (const rec of msg.cardHistory) {
        // Re-resolve card type from record fields for backward compatibility
        // (older records may have type="chat" even for terminal/dynamic-ui cards)
        let resolvedType = rec.type;
        if (rec.role === "user") {
          resolvedType = rec.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE ? "terminal" : "user-bubble";
        } else {
          if (rec.toolMeta?.toolId === "shell") resolvedType = "shell";
          else if (rec.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) resolvedType = "terminal";
          else if (rec.generatedUI) resolvedType = "dynamic-ui";
        }
        if (shouldSkipEmptyHistoryRecord(rec, resolvedType)) continue;
        historicCards[rec.id] = {
          id: rec.id,
          runId: rec.runId,
          type: resolvedType,
          role: rec.role,
          status: "complete",
          display: "collapsed",
          text: rec.text,
          data: rec.data,
          generatedUI: rec.generatedUI,
          mediaUrls: rec.mediaUrls,
          steps: rec.steps,
          toolMeta: rec.toolMeta,
          cardMode: rec.cardMode,
          appData: rec.appData,
          appGeneratedUI: rec.appGeneratedUI,
          appCardMode: rec.appCardMode,
          viewMode: rec.appData ? "app" : "original",
          enhanceStatus: rec.appData ? "ready" : undefined,
          cardSummary: (rec as any).cardSummary,
          cardSummaryStatus: (rec as any).cardSummary ? "ready" : undefined,
          cardAudioUrl: (rec as any).cardAudioUrl,
          cardPodcastScript: (rec as any).cardPodcastScript,
          cardPodcastStatus: (rec as any).cardAudioUrl ? "ready" : undefined,
          createdAt: rec.timestamp,
          updatedAt: rec.timestamp,
        };
        historicOrder.push(rec.id);
      }
      // Prepend history before any current-session cards (deduplicate by ID)
      set((s) => {
        const merged = { ...historicCards };
        for (const [id, card] of Object.entries(s.cards)) {
          merged[id] = card; // current session wins
        }
        const existingIds = new Set(s.cardOrder);
        const newOrder = historicOrder.filter((id) => !existingIds.has(id));
        return {
          cards: merged,
          cardOrder: [...newOrder, ...s.cardOrder],
        };
      });
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
        apps: s.apps.filter((a) => !families.includes(a.toolFamily)),
      }));
      get().fetchApps();
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
      const text = `${count} issue${count === 1 ? " was" : "s were"} fixed:\n\n${lines.join("\n")}`;
      const card: Card = {
        id,
        runId: msg.runId,
        type: "chat",
        role: "assistant",
        status: "complete",
        display: "expanded",
        text,
        data: { restartPrompt: true },
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({
        cardOrder: [...s.cardOrder, id],
        cards: { ...s.cards, [id]: card },
      }));
      return;
    }

    // Handle recent topics (conversation continuity)
    if (msg.recentTopics) {
      set({ recentTopics: msg.recentTopics });
      return;
    }

    // Handle research monitor updates — show as a chat card
    if (msg.monitorUpdate) {
      const { topic, changes } = msg.monitorUpdate;
      const newItems = changes.newFindings.slice(0, 3).map((f: string) => `- ${f}`).join("\n");
      const text = `**Topic Update: ${topic}**\n\nNew findings detected:\n${newItems || "Changes in existing findings."}`;
      const monitorCard: Card = {
        id: msg.id, runId: msg.runId, type: "chat", role: "assistant",
        status: "complete", display: "expanded", text,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      set((s) => ({
        cardOrder: [...s.cardOrder, msg.id],
        cards: { ...s.cards, [msg.id]: monitorCard },
      }));
      return;
    }

    // Handle follow-up suggestions
    if (msg.followUps) {
      const { cardId: fuCardId, suggestions } = msg.followUps;
      set((s) => {
        const card = s.cards[fuCardId];
        if (!card) return s;
        return {
          cards: {
            ...s.cards,
            [fuCardId]: { ...card, followUps: suggestions, updatedAt: Date.now() },
          },
        };
      });
      return;
    }

    // Handle app suggestion (pattern detection)
    if (msg.appSuggestion) {
      const { cardId: sugCardId, category, label, suggestedFamily, buildHint } = msg.appSuggestion;
      set((s) => {
        const card = s.cards[sugCardId];
        if (!card) return s;
        return {
          cards: {
            ...s.cards,
            [sugCardId]: {
              ...card,
              appSuggestion: { category, label, suggestedFamily, buildHint },
              updatedAt: Date.now(),
            },
          },
        };
      });
      return;
    }

    // Handle orchestration plan and progress updates
    if (msg.orchestrationPlan || msg.orchestrationProgress) {
      // Browser notification when orchestration completes or fails
      const orchEvent = msg.orchestrationProgress?.eventType;
      if (orchEvent === "completed" || orchEvent === "failed") {
        const goal = msg.orchestrationProgress?.plan?.goal || "Orchestration";
        const shortGoal = goal.length > 60 ? goal.slice(0, 57) + "..." : goal;
        notifyTaskComplete({
          type: "orchestration",
          title: orchEvent === "completed" ? "Task complete" : "Task failed",
          body: shortGoal,
          success: orchEvent === "completed",
        });
      }

      const targetId = msg.targetCardId;
      if (targetId) {
        set((s) => {
          const now = Date.now();
          const existingCard = s.cards[targetId];
          const existingData = (existingCard?.data && typeof existingCard.data === "object"
            ? existingCard.data : {}) as Record<string, unknown>;

          // Auto-switch viewMode based on orchestration phase
          const progress = msg.orchestrationProgress;
          const planStatus = progress?.plan?.status || msg.orchestrationPlan?.status;
          let viewMode = existingCard?.viewMode;
          let buildTerminalText = existingCard?.buildTerminalText;
          if (planStatus === "planning") {
            viewMode = "app"; // Show terminal during planning
          } else if (planStatus === "reviewing") {
            viewMode = "app"; // Auto-execute: stay on terminal view
            buildTerminalText = ""; // Reset for execution phase
          } else if (planStatus === "executing") {
            viewMode = "app"; // Show terminal during execution
          } else if (planStatus === "completed" || planStatus === "failed") {
            // If bespoke UI was already delivered (enhanceStatus === "ready"),
            // stay on "app" view to show the result. Otherwise show plan summary.
            const hasBespokeUI = existingCard?.enhanceStatus === "ready" && existingCard?.appGeneratedUI;
            viewMode = hasBespokeUI ? "app" : "original";
          }

          const updatedCard = {
            ...(existingCard || {
              id: targetId,
              runId: msg.runId,
              role: "assistant" as const,
              display: "expanded" as const,
              createdAt: now,
            }),
            type: "orchestration" as const,
            data: {
              ...existingData,
              ...(msg.orchestrationPlan ? { orchestrationPlan: msg.orchestrationPlan } : {}),
              ...(msg.orchestrationProgress ? { orchestrationProgress: msg.orchestrationProgress } : {}),
            },
            status: ((planStatus === "completed" || planStatus === "failed") ? "complete"
              : msg.state === "final" ? "complete" : "streaming") as any,
            viewMode,
            buildTerminalText,
            updatedAt: now,
          };
          return {
            // Auto-append to cardOrder if new card
            cardOrder: existingCard ? s.cardOrder : [...s.cardOrder, targetId],
            cards: { ...s.cards, [targetId]: updatedCard },
          };
        });
      }
      return;
    }

    // Handle build completion — update source card, browser notification only (no extra cards)
    if (msg.buildComplete) {
      const { cardId: buildCardId, success, summary, error } = msg.buildComplete;
      const now = Date.now();

      if (success && summary) {
        const familyLabel = summary.toolFamily.replace(/_/g, " ");
        notifyTaskComplete({
          type: "build",
          title: `App built: ${familyLabel}`,
          body: summary.description,
          success: true,
        });
      } else {
        notifyTaskComplete({
          type: "build",
          title: "App build failed",
          body: error || "Build encountered an error",
          success: false,
        });
      }

      set((state) => {
        const sourceCard = state.cards[buildCardId];
        if (!sourceCard) return state;
        return {
          cards: {
            ...state.cards,
            [buildCardId]: {
              ...sourceCard,
              enhanceStatus: success ? "ready" as const : sourceCard.enhanceStatus,
              viewMode: success ? "app" as const : sourceCard.viewMode,
              deepResearchStatus: undefined,
              buildTerminalText: undefined,
              updatedAt: now,
            },
          },
        };
      });
      return;
    }

    set((state) => {
      const now = Date.now();

      // ── Conversation isolation: skip new card creation for other conversations ──
      // If the server says this message belongs to conversation X, but the user
      // has switched to conversation Y, don't create new cards in the current view.
      // Updates to existing cards (targetCardId already in state) still apply.
      const wrongConversation =
        msg.conversationId &&
        msg.conversationId !== state.activeConversationId;

      // ── Route card updates by targetCardId ──
      if (msg.targetCardId) {
        let card = state.cards[msg.targetCardId];

        // ── Deep research build: accumulate terminal text in buildTerminalText ──
        if (card?.deepResearchStatus === "building" && msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) {
          if (msg.state === "delta") {
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  buildTerminalText: (card.buildTerminalText ?? "") + (msg.text ?? ""),
                  updatedAt: now,
                },
              },
            };
          }
          // final — no-op here, enhanceResult will finalize
          if (msg.state === "final") {
            return state;
          }
          // error — clear building status (build failed, no enhanceResult coming)
          if (msg.state === "error") {
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  deepResearchStatus: undefined,
                  buildTerminalText: undefined,
                  updatedAt: now,
                },
              },
            };
          }
        }

        // ── Parallel orchestration: route virtual task card IDs to taskTerminals ──
        if (!card && msg.targetCardId.includes(":task:") && msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) {
          const sepIdx = msg.targetCardId.indexOf(":task:");
          const parentCardId = msg.targetCardId.slice(0, sepIdx);
          const taskId = msg.targetCardId.slice(sepIdx + 6); // after ":task:"
          const parentCard = state.cards[parentCardId];
          if (parentCard?.type === "orchestration") {
            const prevTerminals = parentCard.taskTerminals ?? {};
            const prevTask = prevTerminals[taskId] ?? { text: "", status: "streaming" };
            if (msg.state === "delta") {
              return {
                cards: {
                  ...state.cards,
                  [parentCardId]: {
                    ...parentCard,
                    taskTerminals: {
                      ...prevTerminals,
                      [taskId]: { text: prevTask.text + (msg.text ?? ""), status: "streaming" },
                    },
                    updatedAt: now,
                  },
                },
              };
            }
            if (msg.state === "final" || msg.state === "error") {
              return {
                cards: {
                  ...state.cards,
                  [parentCardId]: {
                    ...parentCard,
                    taskTerminals: {
                      ...prevTerminals,
                      [taskId]: { ...prevTask, status: msg.state === "error" ? "error" : "complete" },
                    },
                    updatedAt: now,
                  },
                },
              };
            }
            return state;
          }
        }

        // ── Orchestration: accumulate claude-code terminal text inline (legacy single-session) ──
        if (card?.type === "orchestration" && msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) {
          if (msg.state === "delta") {
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  buildTerminalText: (card.buildTerminalText ?? "") + (msg.text ?? ""),
                  updatedAt: now,
                },
              },
            };
          }
          // final/error — keep buildTerminalText, don't change orchestration status
          return state;
        }

        // Auto-create terminal card if it doesn't exist yet (e.g. build-via-claude)
        if (!card && msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE && msg.state === "delta") {
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

          // Deep research terminal (cardId + "-deep"): insert BEFORE the parent researcher card
          // so the terminal shows above and final results appear below in the timeline
          let newOrder: string[];
          const deepSuffix = "-deep";
          if (msg.targetCardId.endsWith(deepSuffix)) {
            const parentCardId = msg.targetCardId.slice(0, -deepSuffix.length);
            const parentIdx = state.cardOrder.indexOf(parentCardId);
            if (parentIdx >= 0) {
              newOrder = [...state.cardOrder];
              newOrder.splice(parentIdx, 0, msg.targetCardId);
            } else {
              newOrder = [...state.cardOrder, msg.targetCardId];
            }
          } else {
            newOrder = [...state.cardOrder, msg.targetCardId];
          }

          return {
            cardOrder: newOrder,
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

        // Auto-create dynamic-ui card if data + generatedUI arrive for unknown card
        // (e.g., deep research result arriving after client reconnect lost the original card)
        if (!card && msg.state === "final" && msg.data != null && msg.generatedUI) {
          card = {
            id: msg.targetCardId,
            runId: msg.runId,
            type: "dynamic-ui",
            role: "assistant",
            status: "complete",
            display: "expanded",
            data: msg.data,
            generatedUI: msg.generatedUI,
            cardMode: msg.cardMode,
            createdAt: now,
            updatedAt: now,
          };
          return {
            cardOrder: [...state.cardOrder, msg.targetCardId],
            cards: { ...state.cards, [msg.targetCardId]: card },
            isWaiting: false,
          };
        }

        if (!card) return state;

        // ── Terminal card (claude-code): append text, per-card session ──
        if (card.type === "terminal" && msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) {
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
                  toolMeta: { ...card.toolMeta, ...msg.toolMeta, cwd: card.toolMeta?.cwd ?? msg.toolMeta?.cwd },
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
              toolId: TOOL_ID_CLAUDE_CODE,
              ...(msg.toolMeta?.toolSessionId ? { toolSessionId: msg.toolMeta.toolSessionId } : {}),
            };
            // Also update global convenience state
            if (msg.toolMeta?.toolSessionId) {
              storeUpdates.codeSessionId = msg.toolMeta.toolSessionId;
              localStorage.setItem(STORAGE_KEYS.CODE_SESSION_ID, msg.toolMeta.toolSessionId);
            }
            // Browser notification for Claude Code session completion
            const isDeepResearchTerminal = msg.targetCardId.endsWith("-deep");
            if (!isDeepResearchTerminal) {
              notifyTaskComplete({
                type: "claude_code",
                title: "Claude Code session complete",
                body: card.toolMeta?.cwd || "Session finished",
                success: true,
              });
            }
            return {
              ...storeUpdates,
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  status: "complete",
                  pendingQuestions: undefined,
                  display: isDeepResearchTerminal ? "collapsed" : card.display,
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
                  pendingQuestions: undefined,
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
            const wasDeepBuilding = card.deepResearchStatus === "building";
            const newEnhanceStatus = wasDeepBuilding
              ? undefined  // clear enhance status — deep build failed, no toggle
              : (card.enhanceStatus === "loading" ? "unavailable" as const : card.enhanceStatus);
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  enhanceStatus: newEnhanceStatus,
                  deepResearchStatus: undefined,
                  buildTerminalText: undefined,
                  status: "complete",
                  operation: undefined,
                  pendingAction: undefined,
                  updatedAt: now,
                },
              },
            };
          }
          // Deep research building phase — show terminal in app view, clear overlay
          const isDeepBuildStart = msg.enhanceResult.cardMode?.signatureId === "deep_research_building"
            || msg.enhanceResult.cardMode?.signatureId === "focused_archetype_building"
            || msg.enhanceResult.cardMode?.signatureId === "card_evolution_building";
          if (isDeepBuildStart) {
            return {
              cards: {
                ...state.cards,
                [msg.targetCardId]: {
                  ...card,
                  appCardMode: msg.enhanceResult.cardMode,
                  enhanceStatus: "ready",
                  deepResearchStatus: "building",
                  buildTerminalText: "",
                  // Preserve existing snapshot (saved eagerly in sendCardAction before
                  // backend progress messages could overwrite card.data).
                  // Flag hasDeepResearch so the Deep button hides in Standard view.
                  standardDataSnapshot: (() => {
                    const snap = card.standardDataSnapshot ?? card.data;
                    return snap && typeof snap === "object"
                      ? { ...(snap as Record<string, unknown>), hasDeepResearch: true }
                      : snap;
                  })(),
                  standardGeneratedUISnapshot: card.standardGeneratedUISnapshot ?? card.generatedUI,
                  status: "complete",       // clear "streaming" so CardLoadingOverlay disappears
                  viewMode: "app",          // auto-switch to app view to show build terminal
                  operation: undefined,
                  pendingAction: undefined,
                  updatedAt: now,
                },
              },
            };
          }

          // Deep research complete — clear building state, show real UI
          const wasBuilding = card.deepResearchStatus === "building";
          const isOrchestration = card.type === "orchestration";

          // Browser notification for deep research / enhance completion
          // (skip for app builds — buildComplete sends its own notification)
          if (wasBuilding && card.appCardMode?.signatureId !== "app_building") {
            notifyTaskComplete({
              type: "deep_research",
              title: "Deep research complete",
              body: (card.text ?? "").slice(0, 100) || "Your deep research results are ready",
              success: true,
            });
          }

          // Fast enhance / deep build / orchestration: jump straight to app.
          // Auto-matched tool reply: stay on original text until sandbox is ready (CardContainer + completeAutoAppReveal).
          const wasLoading = card.enhanceStatus === "loading";
          const forceImmediateApp = wasBuilding || isOrchestration || wasLoading;
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
                deepResearchStatus: undefined,
                buildTerminalText: isOrchestration ? card.buildTerminalText : undefined,
                viewMode: forceImmediateApp ? "app" : "original",
                pendingAutoAppReveal: !forceImmediateApp,
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

        // Handle release progress updates
        if (msg.releaseProgress != null) {
          return {
            cards: {
              ...state.cards,
              [msg.targetCardId]: {
                ...card,
                releaseProgress: msg.releaseProgress,
                releaseStatus: msg.state === "final" ? "done" : "releasing",
                updatedAt: now,
              },
            },
          };
        }

        // Handle card summary / podcast updates
        if (msg.cardSummaryStatus || msg.cardSummary || msg.cardAudioUrl || msg.cardPodcastStatus) {
          return {
            cards: {
              ...state.cards,
              [msg.targetCardId]: {
                ...card,
                ...(msg.cardSummary ? { cardSummary: msg.cardSummary } : {}),
                ...(msg.cardSummaryStatus ? { cardSummaryStatus: msg.cardSummaryStatus } : {}),
                ...(msg.cardSummaryError ? { cardSummaryError: msg.cardSummaryError } : {}),
                ...(msg.cardAudioUrl ? { cardAudioUrl: msg.cardAudioUrl } : {}),
                ...(msg.cardPodcastScript ? { cardPodcastScript: msg.cardPodcastScript } : {}),
                ...(msg.cardPodcastStatus ? { cardPodcastStatus: msg.cardPodcastStatus } : {}),
                updatedAt: now,
              },
            },
          };
        }

        const isAppView = card.viewMode === "app" && (card.enhanceStatus === "ready" || !!card.appGeneratedUI);
        const isDeepBuild = card.deepResearchStatus === "building";
        const updatedCard: Card = {
          ...card,
          text: msg.text ?? card.text,
          status:
            msg.state === "error"
              ? "error"
              : msg.state === "delta"
                ? (isDeepBuild ? card.status : "streaming")  // Don't change status during deep build
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

        if (isDeepBuild) {
          // During deep research build, protect standard data from being overwritten
          // by the deep_dive action's progress/result updates.
          // Standard data is preserved in the snapshot fields.
          // Only update app-side fields.
          if (msg.data != null) updatedCard.appData = msg.data;
          if (msg.generatedUI != null) updatedCard.appGeneratedUI = msg.generatedUI;
          if (msg.cardMode != null) updatedCard.appCardMode = msg.cardMode;
          // Keep card.data and card.generatedUI untouched (standard research)
        } else if (isAppView) {
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
      if (msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE && state._activeTerminalCardId) {
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
                toolMeta: { ...card.toolMeta, ...msg.toolMeta, cwd: card.toolMeta?.cwd ?? msg.toolMeta?.cwd },
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
          const newToolMeta = {
            ...card.toolMeta,
            toolId: TOOL_ID_CLAUDE_CODE,
            ...(msg.toolMeta?.toolSessionId ? { toolSessionId: msg.toolMeta.toolSessionId } : {}),
          };
          if (msg.toolMeta?.toolSessionId) {
            storeUpdates.codeSessionId = msg.toolMeta.toolSessionId;
            localStorage.setItem(STORAGE_KEYS.CODE_SESSION_ID, msg.toolMeta.toolSessionId);
          }
          // Browser notification for active Claude Code session completion
          notifyTaskComplete({
            type: "claude_code",
            title: "Claude Code session complete",
            body: card.toolMeta?.cwd || "Session finished",
            success: true,
          });
          return {
            ...storeUpdates,
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                status: "complete",
                pendingQuestions: undefined,
                toolMeta: newToolMeta,
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
          const isClaudeCode = card.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE || msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE;
          const errorToolMeta = isClaudeCode ? card.toolMeta : (msg.toolMeta ?? card.toolMeta);
          return {
            ...storeUpdates,
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                text: (card.text ?? "") + (msg.text ?? "Error occurred."),
                status: "error",
                pendingQuestions: undefined,
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
      // If this message belongs to a different conversation, don't render it
      // (server already persisted it; it'll appear when the user navigates back).
      if (wrongConversation) {
        if (msg.state === "final" || msg.state === "error") {
          return { isWaiting: false };
        }
        return state;
      }

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
        // Remove thinking placeholder when first real assistant card arrives
        const thinkingId = state._thinkingCardId;
        if (thinkingId) {
          const { [thinkingId]: _, ...cardsWithoutThinking } = state.cards;
          return {
            cardOrder: [...state.cardOrder.filter(cid => cid !== thinkingId), cardId],
            cards: { ...cardsWithoutThinking, [cardId]: card },
            _thinkingCardId: null,
          };
        }
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
        if (msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE && msg.toolMeta.toolSessionId) {
          storeUpdates.codeSessionId = msg.toolMeta.toolSessionId;
          localStorage.setItem(STORAGE_KEYS.CODE_SESSION_ID, msg.toolMeta.toolSessionId);
        }

        // Resolve card type from the full message
        const type = msg.cardType ?? cardRegistry.resolve(msg, "assistant");

        // Browser notification for research results (skip simple chat / fast enhance)
        const toolName = (msg.data && typeof msg.data === "object" && "tool" in msg.data)
          ? (msg.data as { tool?: string }).tool
          : undefined;
        if (toolName?.includes("research")) {
          notifyTaskComplete({
            type: "research",
            title: "Research complete",
            body: (msg.text ?? "").slice(0, 100) || "Your research results are ready",
            success: true,
          });
        }

        if (existing && existingId) {
          // Dismiss processing indicator cards — remove cards that finalize with no content
          const finalText = String(msg.text ?? existing.text ?? "").trim();
          const finalData = msg.data ?? existing.data;
          const finalUI = msg.generatedUI ?? existing.generatedUI;
          const finalSteps = msg.steps ?? existing.steps;
          const hasSteps = Array.isArray(finalSteps) && finalSteps.length > 0;
          if (
            !finalText &&
            !finalData &&
            !finalUI &&
            !mergedMediaUrls.length &&
            !hasSteps &&
            existing.type === "chat"
          ) {
            const { [existingId]: _, ...remainingCards } = state.cards;
            return {
              ...storeUpdates,
              cardOrder: state.cardOrder.filter(id => id !== existingId),
              cards: remainingCards,
            };
          }

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

        // Empty final with a fresh id (e.g. processing dismiss) — do not append a ghost bubble
        if (
          type === "chat" &&
          !String(msg.text ?? "").trim() &&
          !(mediaUrls?.length) &&
          msg.data == null &&
          !msg.generatedUI &&
          !(msg.steps?.length)
        ) {
          return { ...storeUpdates };
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
        // Remove thinking placeholder when first real assistant card arrives (final path)
        const thinkingId = state._thinkingCardId;
        if (thinkingId) {
          const { [thinkingId]: _, ...cardsWithoutThinking } = state.cards;
          return {
            ...storeUpdates,
            _thinkingCardId: null,
            cardOrder: [...state.cardOrder.filter(id => id !== thinkingId), cardId],
            cards: { ...cardsWithoutThinking, [cardId]: card },
          };
        }
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

