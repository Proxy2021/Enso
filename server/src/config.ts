/**
 * Centralized configuration for the Enso server.
 * Values come from environment variables with sensible defaults.
 */

import { join } from "node:path";

// ── Network ──

export const ENSO_PORT = parseInt(process.env.ENSO_PORT ?? "3001", 10);
export const ENSO_HOST = process.env.ENSO_HOST ?? "0.0.0.0";

// ── Paths ──

export const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";
export const ENSO_HOME = process.env.ENSO_HOME || join(HOME_DIR, ".enso");

// ── Gemini API ──

export const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_MODEL_FAST = "gemini-3-flash-preview";
export const GEMINI_MODEL_PRO = "gemini-3-pro-preview";
export const GEMINI_MODEL_UTILITY = "gemini-2.0-flash";

export function geminiUrl(model: string, apiKey: string): string {
  return `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
}

// ── Brave Search API ──

export const BRAVE_SEARCH_BASE = "https://api.search.brave.com/res/v1";
export const BRAVE_WEB_SEARCH = `${BRAVE_SEARCH_BASE}/web/search`;
export const BRAVE_IMAGE_SEARCH = `${BRAVE_SEARCH_BASE}/images/search`;
export const BRAVE_VIDEO_SEARCH = `${BRAVE_SEARCH_BASE}/videos/search`;

// ── Ollama ──

export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";
export const OLLAMA_API_URL = `${OLLAMA_BASE_URL}/v1`;

// ── LLM defaults ──

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-6";
export const DEFAULT_CHAT_MODEL = GEMINI_MODEL_FAST;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

// ── Timeouts (ms) ──

export const WS_PING_INTERVAL_MS = 30_000;
export const WS_DISCONNECT_CLEANUP_MS = 600_000;
export const CLAUDE_HEARTBEAT_TIMEOUT_MS = 1_800_000; // 30 min — long-running Bash (compiling, scheduled-task scripts, ffmpeg) can silence the stream for 10+ minutes
export const LLM_DEFAULT_TIMEOUT_MS = 60_000;
export const LLM_FAST_TIMEOUT_MS = 30_000;
export const LLM_RESEARCH_TIMEOUT_MS = 45_000;
export const LLM_PRO_TIMEOUT_MS = 90_000;
export const BRAVE_SEARCH_TIMEOUT_MS = 10_000;

// ── Rate Limit Thresholds ──

export const RATE_LIMIT_THROTTLE_THRESHOLD = 0.15;
export const RATE_LIMIT_MAX_THROTTLE_MS = 1000;

// ── BytePlus Seedance (video generation) ──

export const BYTEPLUS_API_KEY = process.env.BYTEPLUS_API_KEY ?? "";
export const SEEDANCE_BASE_URL = process.env.SEEDANCE_BASE_URL ?? "https://ark.ap-southeast.bytepluses.com/api/v3";
export const SEEDANCE_MODEL = process.env.SEEDANCE_MODEL ?? "seedance-1-5-pro-251215";

// ── Size limits ──

export const MAX_MEDIA_FILE_SIZE = 300 * 1024 * 1024; // 300 MB
export const MAX_VISION_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_TRANSCRIBE_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
