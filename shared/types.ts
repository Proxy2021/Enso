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
  toolFamily?: string;
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
  toolFamily: string;
  description: string;
  toolCount: number;
  primaryToolName: string;
  builtIn?: boolean;
  codebase?: boolean;
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
  toolMeta?: { toolId: string; toolSessionId?: string };
  cardType?: string;
  cardMode?: CardModeDetail;
  targetCardId?: string;
  projects?: Array<{ name: string; path: string }>;
  questions?: ToolQuestion[];
  operation?: OperationStatus;
  settings?: { mode: ChannelMode; toolFamilies?: Array<{ toolFamily: string; description: string }>; ensoProjectPath?: string };
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
    | "app.save_to_codebase"
    | "server.restart"
    | "settings.set_mode"
    | "operation.cancel";
  mode?: ChannelMode;
  text?: string;
  mediaUrls?: string[];
  sessionKey?: string;
  uiAction?: {
    componentId: string;
    action: string;
    payload?: unknown;
  };
  routing?: ToolRouting;
  // card.action fields
  cardId?: string;
  cardAction?: string;
  cardPayload?: unknown;
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
}
