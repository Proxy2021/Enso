import type { ServerMessage, ToolQuestion } from "@shared/types";

// ── Card ──

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
