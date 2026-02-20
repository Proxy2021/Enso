import type { OpenClawConfig } from "openclaw/plugin-sdk";

export type CoreConfig = OpenClawConfig & {
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
  toolFamily?: string;
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
  cardMode?: CardModeDetail;
  targetCardId?: string;
  projects?: Array<{ name: string; path: string }>;
  questions?: ToolQuestion[];
  operation?: OperationStatus;
  settings?: { mode: ChannelMode };
  enhanceResult?: EnhanceResult | null;
  appProposal?: { cardId: string; proposal: string };
  appsDeleted?: { families: string[]; count: number };
  appsList?: Array<{ toolFamily: string; description: string; toolCount: number; primaryToolName: string }>;
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
  // card.build_app fields
  buildAppDefinition?: string;
  // card.propose_app fields
  conversationContext?: string;
  // apps.run fields
  toolFamily?: string;
  // operation.cancel fields
  operationId?: string;
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
