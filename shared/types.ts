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
  timestamp: number;
}

export interface ClientMessage {
  type: "chat.send" | "chat.history" | "ui_action";
  text?: string;
  mediaUrls?: string[];
  sessionKey?: string;
  uiAction?: {
    componentId: string;
    action: string;
    payload?: unknown;
  };
}

// ── UIGenerator Types ──

export interface UIGeneratorContext {
  data: unknown;
  userMessage: string;
  assistantText: string;
}

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
