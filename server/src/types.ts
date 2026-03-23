import type { EnsoBaseConfig } from "./local-types.js";

export type CoreConfig = EnsoBaseConfig & {
  channels?: {
    enso?: EnsoAccountConfig;
    defaults?: { groupPolicy?: string };
  };
};

export type EnsoAccountConfig = {
  enabled?: boolean;
  name?: string;
  port?: number;
  host?: string;
  geminiApiKey?: string;
  dmPolicy?: "open" | "pairing" | "disabled";
  allowFrom?: Array<string | number>;
  blockStreaming?: boolean;
  blockStreamingCoalesce?: { minChars?: number; idleMs?: number };
  textChunkLimit?: number;
  mode?: "im" | "ui" | "full";
  accessToken?: string;
  machineName?: string;
};

export type ChannelMode = "im" | "ui" | "full";

export type EnsoInboundMessage = {
  messageId: string;
  sessionId: string;
  senderNick: string;
  text: string;
  mediaUrls?: string[];
  timestamp: number;
};

/** Interactive Questions (from Claude Code AskUserQuestion) */

export interface ToolQuestion {
  question: string;
  options: Array<{ label: string; description?: string }>;
}

export type OperationStage =
  | "processing"
  | "calling_tool"
  | "generating_ui"
  | "agent_fallback"
  | "streaming"
  | "complete"
  | "cancelled"
  | "error";

export interface OperationStatus {
  operationId: string;
  stage: OperationStage;
  label?: string;
  cancellable?: boolean;
  message?: string;
}

export type CardInteractionMode = "llm" | "tool";
export type CardCoverageStatus = "covered" | "partial";

export interface CardModeDetail {
  interactionMode: CardInteractionMode;
  appId?: string;             // Primary identifier (replaces toolFamily)
  toolFamily?: string;        // Backward compat
  signatureId?: string;
  coverageStatus?: CardCoverageStatus;
}

/** Protocol types shared with the browser client */

export interface ToolRouting {
  mode: "direct_tool";
  toolId: string;
  toolSessionId?: string;
  cwd?: string;
}

export interface ToolBuildSummary {
  toolFamily: string;
  toolNames: string[];
  description: string;
  scenario: string;
  actions: string[];
  steps: Array<{ label: string; status: "passed" | "failed" }>;
  skillGenerated?: boolean;
  persisted?: boolean;
}

// ── Orchestration ──

export type AgentRole = "researcher" | "architect" | "builder" | "coder" | "reviewer";

export type OrchestrationTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "awaiting_approval";

export interface OrchestrationTask {
  taskId: string;
  title: string;
  description: string;
  agentRole: AgentRole;
  dependsOn: string[];
  outputType: "app" | "research" | "code" | "document" | "decision" | "review";
  status: OrchestrationTaskStatus;
  requiresApproval?: boolean;
  agentPrompt?: string;
  terminalCardId?: string;
  sessionId?: string;
  resultSummary?: string;
  error?: string;
}

export interface OrchestrationAgent {
  agentId: string;
  role: AgentRole;
  status: "idle" | "working" | "completed";
  currentTaskId?: string;
}

export type OrchestrationStatus =
  | "planning"
  | "reviewing"
  | "executing"
  | "paused"
  | "completed"
  | "failed";

export interface OrchestrationPlan {
  orchestrationId: string;
  goal: string;
  tasks: OrchestrationTask[];
  agents: OrchestrationAgent[];
  status: OrchestrationStatus;
}

export type OrchestrationEventType =
  | "plan_ready"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "approval_needed"
  | "paused"
  | "resumed"
  | "completed"
  | "failed"
  | "dashboard_ready";

export interface OrchestrationProgress {
  orchestrationId: string;
  eventType: OrchestrationEventType;
  plan: OrchestrationPlan;
  taskId?: string;
  error?: string;
  dashboardCardId?: string;
}

export interface EnhanceResult {
  data: unknown;
  generatedUI: string;
  cardMode: CardModeDetail;
  buildSummary?: ToolBuildSummary;
}

export interface ServerMessage {
  id: string;
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "error";
  text?: string;
  data?: unknown;
  generatedUI?: string;
  mediaUrls?: string[];
  toolMeta?: { toolId: string; toolSessionId?: string; cwd?: string };
  cardType?: string;
  cardMode?: CardModeDetail;
  targetCardId?: string;
  projects?: Array<{ name: string; path: string }>;
  questions?: ToolQuestion[];
  operation?: OperationStatus;
  serverEvent?: "restarting";
  settings?: {
    mode: ChannelMode;
    toolFamilies?: Array<{ toolFamily: string; description: string }>;
    ensoProjectPath?: string;
    claudeModel?: string;
    claudeThinking?: "adaptive" | "disabled";
    language?: string;
    chatModel?: string;
    bootId?: string;
    providers?: Array<{
      id: string;
      name: string;
      configured: boolean;
      models: Array<{ id: string; name: string; description?: string }>;
      setupUrl?: string;
      setupHint: string;
    }>;
  };
  steps?: Array<{ seq: number; text: string }>;
  enhanceResult?: EnhanceResult | null;
  enhanceHint?: { toolFamily: string };
  appProposal?: { cardId: string; proposal: string };
  appsDeleted?: { families: string[]; count: number };
  appsList?: Array<{ toolFamily: string; description: string; toolCount: number; primaryToolName: string; builtIn?: boolean; codebase?: boolean; appId?: string; system?: boolean; shipped?: boolean; experience?: "card" | "terminal" }>;
  appSaved?: { toolFamily: string; success: boolean; path?: string; error?: string };
  buildComplete?: {
    cardId: string;
    success: boolean;
    summary?: ToolBuildSummary;
    error?: string;
  };
  resolvedBugs?: Array<{
    id: string;
    timestamp: number;
    description: string;
    resolution: string;
    category: string;
  }>;
  autoHeal?: {
    stage: "fixing" | "fixed" | "failed";
    toolName: string;
    error?: string;
  };
  releaseProgress?: string;
  cardSummary?: {
    overview: string;
    keyOutcomes: string[];
    narrative: string;
  };
  cardSummaryStatus?: "generating" | "ready" | "error";
  cardSummaryError?: string;
  cardAudioUrl?: string;
  cardPodcastScript?: string;
  cardPodcastStatus?: "writing_script" | "rendering_audio" | "ready" | "error";
  sessionsList?: Array<{
    sessionId: string;
    summary: string;
    lastModified: number;
    cwd?: string;
    gitBranch?: string;
  }>;
  orchestrationPlan?: OrchestrationPlan;
  orchestrationProgress?: OrchestrationProgress;
  appSuggestion?: {
    cardId: string;
    category: string;
    label: string;
    suggestedFamily?: string;
    buildHint?: string;
  };
  followUps?: {
    cardId: string;
    suggestions: Array<{ label: string; prompt: string; icon?: string }>;
  };
  recentTopics?: Array<{ topic: string; lastMessage: string; timestamp: number; cardId: string }>;
  monitorUpdate?: { topic: string; changes: { newFindings: string[]; removedFindings: string[] }; timestamp: number };
  monitorList?: Array<{ id: string; topic: string; enabled: boolean; lastChecked: number }>;
  /** Batch of historical cards sent in response to chat.history */
  cardHistory?: Array<{
    id: string;
    runId: string;
    type: string;
    role: "user" | "assistant";
    text?: string;
    data?: unknown;
    generatedUI?: string;
    mediaUrls?: string[];
    steps?: Array<{ seq: number; text: string }>;
    toolMeta?: { toolId: string; toolSessionId?: string; cwd?: string };
    cardMode?: CardModeDetail;
    appData?: unknown;
    appGeneratedUI?: string;
    appCardMode?: CardModeDetail;
    timestamp: number;
  }>;
  timestamp: number;
}

export interface ClientMessage {
  type:
    | "chat.send"
    | "chat.history"
    | "ui_action"
    | "tools.list_projects"
    | "card.action"
    | "card.enhance"
    | "card.build_app"
    | "card.propose_app"
    | "card.delete_all_apps"
    | "apps.list"
    | "apps.run"
    | "apps.delete"
    | "apps.reload"
    | "app.save_to_codebase"
    | "app.promote"
    | "server.restart"
    | "settings.set_mode"
    | "settings.set_model"
    | "settings.set_chat_model"
    | "settings.set_provider_key"
    | "settings.set_language"
    | "operation.cancel"
    | "sessions.list"
    | "shell.create"
    | "shell.input"
    | "shell.resize"
    | "shell.destroy"
    | "orchestration.start"
    | "orchestration.approve"
    | "orchestration.pause"
    | "orchestration.resume"
    | "orchestration.modify"
    | "orchestration.cancel"
    | "orchestration.message"
    | "evolution.start"
    | "discovery.start"
    | "image_research"
    | "card.summarize"
    | "card.evolve"
    | "card.release"
    | "monitor.list"
    | "monitor.remove"
    | "client.error";
  mode?: ChannelMode;
  claudeModel?: string;
  claudeThinking?: "adaptive" | "disabled";
  chatModel?: string;
  providerId?: string;
  providerApiKey?: string;
  language?: string;
  text?: string;
  mediaUrls?: string[];
  sessionKey?: string;
  uiAction?: {
    componentId: string;
    action: string;
    payload?: unknown;
  };
  routing?: ToolRouting;
  // Terminal card routing
  sourceCardId?: string;
  // card.action fields
  cardId?: string;
  cardAction?: string;
  cardPayload?: unknown;
  // card.summarize fields
  cardType?: string;
  cardContent?: {
    text?: string;
    data?: unknown;
    taskTerminals?: Record<string, { text: string; status: string }>;
  };
  cardSummarizeAction?: "summarize";
  // card.evolve fields
  appId?: string;
  includeResearch?: boolean;
  // card.enhance / card.build_app / card.propose_app fields
  cardText?: string;
  // card.enhance fields
  suggestedFamily?: string;
  // card.build_app fields
  buildAppDefinition?: string;
  // card.propose_app + card.build_app fields
  conversationContext?: string;
  // apps.run fields
  toolFamily?: string;
  // operation.cancel fields
  operationId?: string;
  // chat.history fields
  historyCount?: number;
  // shell.* fields
  shellSessionId?: string;
  shellInput?: string;
  shellCols?: number;
  shellRows?: number;
  // client.error fields
  clientError?: {
    message: string;
    source: string;
    stack?: string;
    componentStack?: string;
    url?: string;
    timestamp: number;
  };
  // orchestration.* fields
  orchestrationGoal?: string;
  // evolution.start fields
  evolutionGoal?: string;
  projectId?: string;
  orchestrationId?: string;
  orchestrationApprovedTasks?: string[];
  orchestrationTaskId?: string;
  orchestrationModification?: string;
  orchestrationMessage?: string;
}

/** Executor Context — injected into generated app executors as `ctx` */

export interface ExecutorContext {
  /** Call any registered OpenClaw tool by name. */
  callTool(toolName: string, params: Record<string, unknown>): Promise<{ success: boolean; data: unknown; error?: string }>;

  /** Convenience: list a directory (wraps enso_fs_list_directory). */
  listDir(path: string): Promise<{ success: boolean; data: unknown; error?: string }>;

  /** Convenience: read a text file (wraps enso_fs_read_text_file). */
  readFile(path: string): Promise<{ success: boolean; data: unknown; error?: string }>;

  /** Convenience: search for files/dirs by name (wraps enso_fs_search_paths). */
  searchFiles(rootPath: string, name: string): Promise<{ success: boolean; data: unknown; error?: string }>;

  /** Sandboxed HTTP fetch (timeout 10s, max 512KB response, HTTPS only). */
  fetch(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ ok: boolean; status: number; data: unknown }>;

  /** Web search via Brave Search API. Returns structured search results for discovery scenarios. */
  search(query: string, options?: { count?: number; country?: string }): Promise<{
    ok: boolean;
    results: Array<{ title: string; url: string; description: string }>;
  }>;

  /** Ask the LLM a question. For data analysis, summarization, or classification within executors. */
  ask(prompt: string, options?: { maxTokens?: number }): Promise<{ ok: boolean; text: string }>;

  /** Per-family key-value store for persistent state across sessions. */
  store: {
    get(key: string): Promise<unknown | null>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
    /** Get a document collection for structured data persistence (indexed, auto-pruned). */
    docs<T = unknown>(
      collection: string,
      opts?: { maxEntries?: number },
    ): {
      list(): Promise<Array<{ id: string; timestamp: number; meta: Record<string, string | number | boolean> }>>;
      save(id: string, data: T, meta?: Record<string, string | number | boolean>): Promise<void>;
      load(id: string): Promise<T | null>;
      has(id: string): Promise<boolean>;
      remove(id: string): Promise<boolean>;
      clear(): Promise<void>;
      count(): Promise<number>;
    };
    /** Read-only access to this app's interaction history (actions, enhances, errors). */
    interactions(): {
      list(count?: number): Promise<Array<{
        type: "action" | "enhance" | "refine" | "view" | "error";
        action?: string;
        toolName?: string;
        params?: Record<string, unknown>;
        error?: string;
        cardId?: string;
        timestamp: number;
      }>>;
      count(): Promise<number>;
    };
  };

  /** Generate a UUID v4 string. */
  uuid(): string;

  /** Compute a hex hash of text (default: SHA-256). */
  hash(text: string, algorithm?: string): string;

  /** Async delay, capped at 10 seconds. */
  sleep(ms: number): Promise<void>;

  /** Log a message to the Enso action log for debugging. */
  log(message: string): void;

  /** Format a date string. Formats: "iso", "date", "time", "relative", or default locale. */
  formatDate(date?: string | number, format?: string): string;

  /** Current timestamp (Date.now()). */
  now(): number;
}

/** UIGenerator types */

export interface UIGeneratorResult {
  code: string;
  shapeKey: string;
  cached: boolean;
}

export interface UIGeneratorDeps {
  callLLM: (prompt: string) => Promise<string>;
  cacheGet: (key: string) => string | undefined;
  cacheSet: (key: string, value: string) => void;
}
