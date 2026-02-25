import type { AgentStep, CardModeDetail, OperationStatus, ServerMessage, ToolBuildSummary, ToolQuestion } from "@shared/types";

// ── Card ──

export type EnhanceStatus = "idle" | "loading" | "ready" | "unavailable" | "suggested";

export interface Card {
  id: string;
  runId: string;
  type: string; // "chat" | "terminal" | "dynamic-ui" | "user-bubble" | custom
  role: "user" | "assistant";
  status: "streaming" | "complete" | "error";
  display: "expanded" | "collapsed";

  // Content — type-specific
  text?: string;
  data?: unknown;
  generatedUI?: string;
  mediaUrls?: string[];

  // Tool/routing context
  toolMeta?: { toolId: string; toolSessionId?: string };

  // Interactive questions (from Claude Code AskUserQuestion)
  pendingQuestions?: ToolQuestion[];

  // Card action in progress
  pendingAction?: string;
  operation?: OperationStatus;
  cardMode?: CardModeDetail;

  // Multi-block agent steps (for expandable intermediate content)
  steps?: AgentStep[];

  // App enhancement (user-triggered)
  appData?: unknown;
  appGeneratedUI?: string;
  appCardMode?: CardModeDetail;
  appBuildSummary?: ToolBuildSummary;
  viewMode?: "original" | "app";
  enhanceStatus?: EnhanceStatus;
  suggestedFamily?: string;
  pendingProposal?: string;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ── Card Renderer ──

export interface CardRendererProps {
  card: Card;
  isActive: boolean;
  onAction: (action: string, payload?: unknown) => void;
}

// ── Card Type Registration ──

export interface CardTypeRegistration {
  type: string;
  renderer: React.ComponentType<CardRendererProps>;
  match: (msg: ServerMessage) => boolean;
}
