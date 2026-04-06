/**
 * Unified LLM Call Layer — Single entry point for ALL LLM calls in Enso.
 *
 * Usage:
 *   import { llm } from "./llm.js";
 *   const text = await llm({ prompt: "Hello", tier: "fast" });
 *
 * Features:
 * - Auto-resolves API keys: opts → getActiveAccount() → loadProviderKeys() → env vars
 * - Tier-based model & timeout selection: fast (60s), utility (30s), pro (90s)
 * - Built-in retry with exponential backoff (3 attempts)
 * - Multi-provider routing (Gemini → OpenAI → Anthropic → Ollama)
 * - Always has a timeout — no call can hang forever
 */

import {
  GEMINI_MODEL_FAST, GEMINI_MODEL_PRO, GEMINI_MODEL_UTILITY,
  geminiUrl, GEMINI_API_BASE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  LLM_DEFAULT_TIMEOUT_MS, LLM_FAST_TIMEOUT_MS, LLM_PRO_TIMEOUT_MS,
} from "./config.js";
import { logAction, logError } from "./action-log.js";

// Re-export model constants for convenience
export { GEMINI_MODEL_FAST, GEMINI_MODEL_PRO, GEMINI_MODEL_UTILITY };

// ── Types ──

export type LLMTier = "fast" | "utility" | "pro";

export interface LLMCallOptions {
  /** The prompt text */
  prompt: string;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Model tier — maps to a model name + default timeout */
  tier?: LLMTier;
  /** Explicit model name (overrides tier) */
  model?: string;
  /** Timeout in ms (overrides tier default) */
  timeoutMs?: number;
  /** Max output tokens (default: 16384) */
  maxOutputTokens?: number;
  /** Temperature */
  temperature?: number;
  /** Response MIME type (e.g., "application/json" for structured output) */
  responseMimeType?: string;
  /** Provider keys override */
  providerKeys?: Record<string, string>;
  /** Direct Gemini API key override */
  apiKey?: string;
}

export interface LLMVisionOptions extends LLMCallOptions {
  imageBase64: string;
  imageMimeType: string;
}

// ── Tier → Model/Timeout Mapping ──

const TIER_MODELS: Record<LLMTier, string> = {
  fast: GEMINI_MODEL_FAST,
  utility: GEMINI_MODEL_UTILITY,
  pro: GEMINI_MODEL_PRO,
};

const TIER_TIMEOUTS: Record<LLMTier, number> = {
  fast: LLM_DEFAULT_TIMEOUT_MS,
  utility: LLM_FAST_TIMEOUT_MS,
  pro: LLM_PRO_TIMEOUT_MS,
};

// ── API Key Resolution ──

/**
 * Resolve a Gemini API key from multiple sources (in priority order):
 * 1. Direct apiKey parameter
 * 2. providerKeys.gemini
 * 3. getActiveAccount().geminiApiKey
 * 4. loadProviderKeys().gemini
 * 5. process.env.GEMINI_API_KEY
 */
export function resolveApiKey(opts?: { apiKey?: string; providerKeys?: Record<string, string> }): string | null {
  // 1. Direct key
  if (opts?.apiKey) return opts.apiKey;

  // 2. Provider keys
  if (opts?.providerKeys?.gemini) return opts.providerKeys.gemini;

  // 3. Active account
  try {
    // Dynamic import to avoid circular deps — getActiveAccount is set at server boot
    const { getActiveAccount } = require("./server.js") as { getActiveAccount: () => { geminiApiKey?: string; providerKeys?: Record<string, string> } | null };
    const account = getActiveAccount();
    if (account?.geminiApiKey) return account.geminiApiKey;
    if (account?.providerKeys?.gemini) return account.providerKeys.gemini;
  } catch { /* server module not loaded yet */ }

  // 4. Provider config file
  try {
    const { loadProviderKeys } = require("./llm-provider.js") as { loadProviderKeys: () => Record<string, string> };
    const keys = loadProviderKeys();
    if (keys.gemini) return keys.gemini;
  } catch { /* provider module not loaded */ }

  // 5. Environment variable
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  return null;
}

/**
 * Resolve full provider keys dict for multi-provider routing.
 */
function resolveProviderKeys(opts?: { apiKey?: string; providerKeys?: Record<string, string> }): Record<string, string> {
  if (opts?.providerKeys && Object.keys(opts.providerKeys).length > 0) {
    // Ensure gemini key is included
    const keys = { ...opts.providerKeys };
    if (!keys.gemini && opts.apiKey) keys.gemini = opts.apiKey;
    return keys;
  }

  // Try active account
  try {
    const { getActiveAccount } = require("./server.js") as { getActiveAccount: () => { geminiApiKey?: string; providerKeys?: Record<string, string> } | null };
    const account = getActiveAccount();
    if (account) {
      const keys = { ...account.providerKeys };
      if (account.geminiApiKey) keys.gemini = account.geminiApiKey;
      return keys;
    }
  } catch { /* server not loaded */ }

  // Try provider config
  try {
    const { loadProviderKeys } = require("./llm-provider.js") as { loadProviderKeys: () => Record<string, string> };
    return loadProviderKeys();
  } catch { /* not loaded */ }

  // Env fallback
  const keys: Record<string, string> = {};
  if (process.env.GEMINI_API_KEY) keys.gemini = process.env.GEMINI_API_KEY;
  return keys;
}

// ── Core LLM Call ──

/**
 * Unified LLM call with auto key resolution, retry, and timeout.
 */
export async function llm(opts: LLMCallOptions): Promise<string> {
  const tier = opts.tier ?? "fast";
  const model = opts.model ?? TIER_MODELS[tier];
  const timeoutMs = opts.timeoutMs ?? TIER_TIMEOUTS[tier];
  const maxOutputTokens = opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  // Resolve API key
  const geminiKey = resolveApiKey(opts);

  // If we have a Gemini key AND the model is a Gemini model, use direct Gemini API with retry
  if (geminiKey && isGeminiModel(model)) {
    return callGeminiWithRetry(opts.prompt, geminiKey, model, timeoutMs, maxOutputTokens, opts.temperature, opts.responseMimeType, opts.systemPrompt);
  }

  // Multi-provider fallback via callChatLLM
  const providerKeys = resolveProviderKeys(opts);
  if (Object.keys(providerKeys).length === 0) {
    throw new Error("No LLM provider available. Add an API key in Settings or set GEMINI_API_KEY.");
  }

  try {
    const { callChatLLM } = await import("./llm-provider.js");
    return await callChatLLM({
      prompt: opts.prompt,
      systemPrompt: opts.systemPrompt,
      model,
      providerKeys,
      timeoutMs,
    });
  } catch (err) {
    throw new Error(`LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Vision (Multimodal) ──

/**
 * Multimodal image+text LLM call with auto key resolution.
 */
export async function llmVision(opts: LLMVisionOptions): Promise<string> {
  const tier = opts.tier ?? "fast";
  const model = opts.model ?? TIER_MODELS[tier];
  const timeoutMs = opts.timeoutMs ?? TIER_TIMEOUTS[tier];
  const maxOutputTokens = opts.maxOutputTokens ?? 1024;
  const apiKey = resolveApiKey(opts);

  if (!apiKey) throw new Error("No Gemini API key available for vision call.");

  return callGeminiWithRetry(
    opts.prompt, apiKey, model, timeoutMs, maxOutputTokens,
    opts.temperature, opts.responseMimeType, opts.systemPrompt,
    { base64: opts.imageBase64, mimeType: opts.imageMimeType },
  );
}

// ── TTS (Text-to-Speech) ──

/**
 * Gemini TTS call. Returns raw audio buffer.
 */
export async function llmTTS(opts: {
  text: string;
  voice?: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<Buffer> {
  const apiKey = resolveApiKey({ apiKey: opts.apiKey });
  if (!apiKey) throw new Error("No Gemini API key available for TTS.");

  const ttsModel = "gemini-2.5-flash-preview-tts";
  const url = `${GEMINI_API_BASE}/models/${ttsModel}:generateContent?key=${apiKey}`;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice ?? "Kore" } },
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`TTS API error: ${response.status}`);

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string } }> } }>;
    };
    const audioB64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioB64) throw new Error("No audio data in TTS response");

    return Buffer.from(audioB64, "base64");
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error(`TTS timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Internal Helpers ──

function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini-") || model.includes("gemini");
}

async function callGeminiWithRetry(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxOutputTokens: number,
  temperature?: number,
  responseMimeType?: string,
  systemPrompt?: string,
  image?: { base64: string; mimeType: string },
  maxAttempts = 3,
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await callGeminiOnce(prompt, apiKey, model, timeoutMs, maxOutputTokens, temperature, responseMimeType, systemPrompt, image);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;

      // Only retry on transient errors
      const isRetryable = msg.includes("timeout") || msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("AbortError");
      if (!isRetryable || attempt === maxAttempts) break;

      const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 4000);
      logAction({ ts: Date.now(), type: "action", category: "llm", message: `Retrying LLM call (${attempt}/${maxAttempts}) in ${delayMs}ms — model=${model}` });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError ?? new Error("LLM call failed after retries");
}

async function callGeminiOnce(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxOutputTokens: number,
  temperature?: number,
  responseMimeType?: string,
  systemPrompt?: string,
  image?: { base64: string; mimeType: string },
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const parts: Array<Record<string, unknown>> = [];
    if (image) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    }
    parts.push({ text: prompt });

    const body: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(responseMimeType ? { responseMimeType } : {}),
      },
    };
    if (systemPrompt) {
      body.system_instruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(geminiUrl(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logError("llm", `Gemini API error (${model}): ${response.status}`, errText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Gemini response");

    // Strip markdown fences if present
    return text
      .replace(/^```(?:json|jsx?|tsx?)?\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`LLM timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
