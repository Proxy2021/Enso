// ── Channel Mode ──

export type ChannelMode = "im" | "ui" | "full";

// ── Interactive Questions (from Claude Code AskUserQuestion) ──

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

// ── Tool Routing ──

export interface ToolRouting {
  mode: "direct_tool";
  toolId: string;
  toolSessionId?: string;
  cwd?: string;
}

// ── Agent Steps (multi-block responses) ──

export interface AgentStep {
  seq: number;
  text: string;
}

// ── App Info (for Apps menu) ──

export interface AppInfo {
  appId: string;              // Primary identifier (replaces toolFamily)
  toolFamily: string;         // Backward compat — set to same value as appId
  description: string;
  toolCount: number;
  primaryToolName: string;
  system?: boolean;           // Core platform capability (replaces builtIn)
  builtIn?: boolean;          // Backward compat
  shipped?: boolean;          // Ships with Enso in git (replaces codebase)
  codebase?: boolean;         // Backward compat
  experience?: "card" | "terminal"; // How the app renders
}

// ── Protocol Messages ──

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
  steps?: AgentStep[];
  enhanceResult?: EnhanceResult | null;
  enhanceHint?: { toolFamily: string };
  appProposal?: { cardId: string; proposal: string };
  appsDeleted?: { families: string[]; count: number };
  appsList?: AppInfo[];
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
  /** Saved chat threads for the browser client (sidebar). */
  conversationsList?: Array<{ id: string; title: string; createdAt: number; updatedAt: number }>;
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
    steps?: AgentStep[];
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
    | "image_search"
    | "card.summarize"
    | "card.evolve"
    | "card.release"
    | "card.persist"
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
  /** Active chat thread (persisted server-side per client). */
  conversationId?: string;
  // shell.* fields
  shellSessionId?: string;
  shellInput?: string;
  shellCols?: number;
  shellRows?: number;
  // card.persist fields — persist a client-created card to server journal
  cardRecord?: {
    id: string;
    runId: string;
    type: string;
    role: "user" | "assistant";
    text?: string;
    data?: unknown;
    timestamp: number;
  };
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

// ── Card Data Types ──

/** Data shape for research cards (researcher tool output) */
export interface ResearchCardData {
  tool?: string;
  topic?: string;
  depth?: string;
  phase?: string;
  summary?: string;
  narrative?: string;
  keyFindings?: Array<{
    title: string;
    description: string;
    type?: string;
    confidence?: string;
    priority?: string;
  }>;
  sections?: Array<{ title: string; content: string }>;
  sources?: Array<{ url: string; title?: string; snippet?: string; fullText?: string }>;
  videos?: Array<{ url: string; title?: string; duration?: string }>;
  books?: Array<{ title: string; author?: string; url?: string }>;
  movies?: Array<{ title: string; year?: string; url?: string }>;
  contradictions?: Array<{ claim: string; counter: string }>;
  images?: Array<{ url: string; pageUrl?: string; alt?: string }>;
  audioUrl?: string;
  podcastScript?: string;
  searchHistory?: Array<{ topic: string; timestamp: number }>;
}

/** Data shape for orchestration cards */
export interface OrchestrationCardData {
  orchestrationPlan?: OrchestrationPlan;
  orchestrationProgress?: OrchestrationProgress;
}

/** Discriminated union for all known card data shapes */
export type CardData =
  | ResearchCardData
  | OrchestrationCardData
  | Record<string, unknown>;

// ── Type Guards ──

export function isOrchestrationCardData(data: unknown): data is OrchestrationCardData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return "orchestrationPlan" in d || "orchestrationProgress" in d;
}

export function isResearchCardData(data: unknown): data is ResearchCardData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return "keyFindings" in d || "sources" in d || "sections" in d || "topic" in d;
}
