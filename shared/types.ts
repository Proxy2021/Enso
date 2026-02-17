// ── Channel Mode ──

export type ChannelMode = "im" | "ui" | "full";

// ── Interactive Questions (from Claude Code AskUserQuestion) ──

export interface ToolQuestion {
  question: string;
  options: Array<{ label: string; description?: string }>;
}

// ── Tool Routing ──

export interface ToolRouting {
  mode: "direct_tool";
  toolId: string;
  toolSessionId?: string;
  cwd?: string;
}

// ── Protocol Messages ──

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
  targetCardId?: string;
  projects?: Array<{ name: string; path: string }>;
  questions?: ToolQuestion[];
  settings?: { mode: ChannelMode };
  timestamp: number;
}

export interface ClientMessage {
  type: "chat.send" | "chat.history" | "ui_action" | "tools.list_projects" | "card.action" | "settings.set_mode";
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
}
