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
  toolMeta?: { toolId: string; toolSessionId?: string; cwd?: string };

  // Interactive questions (from Claude Code AskUserQuestion)
  pendingQuestions?: ToolQuestion[];

  // Card action in progress
  pendingAction?: string;
  operation?: OperationStatus;
  cardMode?: CardModeDetail;

  // Multi-block agent steps (for expandable intermediate content)
  steps?: AgentStep[];

  /** Auto-enhance: text stays visible until app sandbox is ready, then crossfade to app view. */
  pendingAutoAppReveal?: boolean;

  // App enhancement (user-triggered)
  appData?: unknown;
  appGeneratedUI?: string;
  appCardMode?: CardModeDetail;
  appBuildSummary?: ToolBuildSummary;
  viewMode?: "original" | "app" | "plan" | "sessions";
  enhanceStatus?: EnhanceStatus;
  suggestedFamily?: string;
  pendingProposal?: string;

  // App suggestion (pattern detection)
  appSuggestion?: {
    category: string;
    label: string;
    suggestedFamily?: string;
    buildHint?: string;
  };

  // Smart follow-up suggestions
  followUps?: Array<{ label: string; prompt: string; icon?: string }>;

  // Deep research build in progress (terminal streams into app view)
  deepResearchStatus?: "building";
  buildTerminalText?: string;
  // Snapshot of standard data/template before deep research overwrites them
  standardDataSnapshot?: unknown;
  standardGeneratedUISnapshot?: string;

  // Auto-heal status
  autoHealStatus?: "fixing" | "fixed" | "failed";
  autoHealError?: string;

  // Parallel orchestration task terminals
  taskTerminals?: Record<string, { text: string; status: string }>;

  // Universal card summary + podcast
  cardSummary?: {
    overview: string;
    keyOutcomes: string[];
    narrative: string;
  };
  cardSummaryStatus?: "generating" | "ready" | "error";
  cardSummaryError?: string;
  cardAudioUrl?: string;
  cardPodcastScript?: string;
  cardPodcastStatus?:
    | "writing_script"
    | "rendering_audio"
    | "ready"
    | "error"
    // Deep-content phases (emitted by generateDeepContent)
    | "researching"
    | "generating_outline"
    | "writing_section"
    | "stitching"
    | "complete";

  // Release status
  releaseProgress?: string;
  releaseStatus?: "releasing" | "done";

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ── Card Renderer ──

export interface CardRendererProps {
  card: Card;
  isActive: boolean;
  onAction: (action: string, payload?: unknown) => void;
  /** Fired once when generated UI has compiled (success or error) and is ready to show — used for staged auto-enhance reveal. */
  onDynamicUIReady?: () => void;
}

// ── Card Type Registration ──

export interface CardTypeRegistration {
  type: string;
  renderer: React.ComponentType<CardRendererProps>;
  match: (msg: ServerMessage) => boolean;
}
