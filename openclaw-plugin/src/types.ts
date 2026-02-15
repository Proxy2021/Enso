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
};

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

/** Protocol types shared with the browser client */

export interface ToolRouting {
  mode: "direct_tool";
  toolId: string;
  toolSessionId?: string;
  cwd?: string;
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
  targetCardId?: string;
  projects?: Array<{ name: string; path: string }>;
  questions?: ToolQuestion[];
  timestamp: number;
}

export interface ClientMessage {
  type: "chat.send" | "chat.history" | "ui_action" | "tools.list_projects" | "card.action";
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
