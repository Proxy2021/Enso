/**
 * Centralized frontend constants.
 * Eliminates hardcoded strings, magic numbers, and localStorage key sprawl.
 */

// ── Tool IDs ──

export const TOOL_ID_CLAUDE_CODE = "claude-code";
export const TOOL_ID_SHELL = "shell";

// ── API Paths ──

export const API = {
  PROJECTS: "/api/projects",
  EVOLUTION_SPRINTS: "/api/evolution-sprints",
  DISCOVERY_RESULTS: "/api/discovery-results",
  MEMORY: "/api/memory",
  HISTORY: "/api/history",
  VERSION: "/api/version",
  APK: "/api/apk",
  SHARE_CREATE: "/api/create-share",
  SHARE_TOKEN: "/api/share-token",
  CLAUDE_COMMANDS: "/api/claude-commands",
  WS_DEBUG: "/api/ws-debug",
  CARD_STATE: (cardId: string) => `/api/card/${cardId}/state`,
} as const;

// ── localStorage Keys ──

export const STORAGE_KEYS = {
  CLAUDE_MODEL: "enso_claude_model",
  CLAUDE_THINKING: "enso_claude_thinking",
  CHAT_MODEL: "enso_chat_model",
  LANGUAGE: "enso_language",
  CLIENT_ID: "enso-clientId",
  CODE_SESSION_CWD: "enso_code_session_cwd",
  CODE_SESSION_ID: "enso_code_session_id",
  PINNED_CARDS: "enso_pinned_cards",
  ACTIVE_BACKEND: "enso_active_backend",
  BACKENDS: "enso_backends",
  NOTIFICATION_PERMISSION: "enso_notification_permission",
  ONBOARDING_DISMISSED: "enso_onboarding_dismissed",
  WS_DEBUG: "enso-ws-debug",
} as const;

// ── Timing Constants (ms) ──

export const TIMINGS = {
  FOCUS_DELAY: 50,
  TOAST_DURATION: 2000,
  COPY_FEEDBACK: 600,
  QUEUE_TOAST: 4000,
  NL_INTERCEPTION_TOAST: 3000,
  API_FETCH_TIMEOUT: 5000,
  STALE_QUEUE_THRESHOLD: 60_000,
  ONBOARDING_HIDE: 8000,
  SEEN_POLL: 2000,
  DEBUG_FLUSH: 2000,
  NOTIFICATION_DURATION: 8000,
  GEOLOCATION_TIMEOUT: 10_000,
  SHARED_CARD_LOAD_DELAY: 1500,
} as const;

// ── Default Model Names ──

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-6";
export const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";
