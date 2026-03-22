/**
 * llm-provider.ts — Multi-provider LLM abstraction for Enso.
 *
 * Supports Gemini (native), OpenAI-compatible (OpenAI, DeepSeek, Groq,
 * OpenRouter, Ollama), and Anthropic via a unified callChatLLM() interface.
 * Provider API keys are persisted in ~/.enso/providers.json with env var
 * fallback.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { logAction, logError } from "./action-log.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface LLMModel {
  id: string;
  name: string;
  description?: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  format: "gemini" | "openai-compat" | "anthropic";
  apiKeyEnvVar?: string;
  baseUrl?: string;
  setupUrl?: string;
  setupHint: string;
  models: LLMModel[];
}

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  models: LLMModel[];
  setupUrl?: string;
  setupHint: string;
}

interface ProvidersConfig {
  apiKeys?: Record<string, string>;
  customModels?: Array<{
    id: string;
    name: string;
    providerId: string;
    baseUrl: string;
    apiKey: string;
  }>;
}

// ── Provider Registry ───────────────────────────────────────────────────────

export const PROVIDERS: LLMProvider[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    format: "gemini",
    apiKeyEnvVar: "GEMINI_API_KEY",
    setupUrl: "https://aistudio.google.com/apikey",
    setupHint: "Get a free API key from Google AI Studio",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast, great for everyday use" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Powerful reasoning" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    format: "openai-compat",
    apiKeyEnvVar: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    setupUrl: "https://platform.openai.com/api-keys",
    setupHint: "Get an API key from OpenAI",
    models: [
      { id: "gpt-4o", name: "GPT-4o", description: "Most capable" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable" },
      { id: "o3-mini", name: "o3-mini", description: "Reasoning model" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    format: "anthropic",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    setupUrl: "https://console.anthropic.com/settings/keys",
    setupHint: "Get an API key from Anthropic Console",
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", description: "Balanced performance" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", description: "Fast and compact" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    format: "openai-compat",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    setupUrl: "https://platform.deepseek.com/api_keys",
    setupHint: "Get an API key from DeepSeek",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat", description: "General purpose" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner", description: "Chain-of-thought reasoning" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    format: "openai-compat",
    baseUrl: "http://localhost:11434/v1",
    setupUrl: "https://ollama.com",
    setupHint: "Install Ollama locally — free, no API key needed",
    models: [
      { id: "qwen3:32b", name: "Qwen 3 32B", description: "Strong all-round model" },
      { id: "llama3.3", name: "Llama 3.3", description: "Meta's latest open model" },
      { id: "qwen3", name: "Qwen 3", description: "Alibaba's multilingual model" },
      { id: "deepseek-r1:70b", name: "DeepSeek R1 70B", description: "Deep reasoning (slow)" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    format: "openai-compat",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    setupUrl: "https://openrouter.ai/keys",
    setupHint: "Access hundreds of models via one API key",
    models: [
      { id: "openrouter/auto", name: "Auto (best available)", description: "OpenRouter picks the best model" },
    ],
  },
];

// Claude Code models (separate from chat models)
export const CLAUDE_CODE_MODELS: LLMModel[] = [
  { id: "claude-opus-4-6", name: "Opus 4.6" },
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", name: "Haiku 4.5" },
  { id: "ollama:qwen3:32b", name: "Qwen 3 32B (Ollama)", description: "Strong all-round local model" },
  { id: "ollama:codestral", name: "Codestral (Ollama)", description: "22B coding model" },
];

// ── Config Persistence ──────────────────────────────────────────────────────

const ENSO_DIR = join(homedir(), ".enso");
const PROVIDERS_FILE = join(ENSO_DIR, "providers.json");

function readConfig(): ProvidersConfig {
  try {
    if (existsSync(PROVIDERS_FILE)) {
      return JSON.parse(readFileSync(PROVIDERS_FILE, "utf-8"));
    }
  } catch {
    // Corrupt file — start fresh
  }
  return {};
}

function writeConfig(cfg: ProvidersConfig): void {
  if (!existsSync(ENSO_DIR)) mkdirSync(ENSO_DIR, { recursive: true });
  writeFileSync(PROVIDERS_FILE, JSON.stringify(cfg, null, 2));
}

export function loadProviderKeys(): Record<string, string> {
  const cfg = readConfig();
  const keys: Record<string, string> = {};

  for (const provider of PROVIDERS) {
    // Config file first, then env var
    const fromFile = cfg.apiKeys?.[provider.id];
    const fromEnv = provider.apiKeyEnvVar ? process.env[provider.apiKeyEnvVar] : undefined;
    const key = fromFile || fromEnv;
    if (key) keys[provider.id] = key;
  }

  // Ollama doesn't need a key — mark as configured if endpoint is accessible
  // (we'll attempt the call and let it fail gracefully if Ollama isn't running)
  if (!keys.ollama) keys.ollama = "local";

  return keys;
}

export function saveProviderKey(providerId: string, apiKey: string): void {
  const cfg = readConfig();
  if (!cfg.apiKeys) cfg.apiKeys = {};
  cfg.apiKeys[providerId] = apiKey;
  writeConfig(cfg);
  logAction({ ts: Date.now(), type: "action", category: "llm-provider", message: `Saved API key for provider: ${providerId}` });
}

export function addCustomModel(model: {
  id: string;
  name: string;
  providerId: string;
  baseUrl: string;
  apiKey: string;
}): void {
  const cfg = readConfig();
  if (!cfg.customModels) cfg.customModels = [];
  cfg.customModels = cfg.customModels.filter((m) => m.id !== model.id);
  cfg.customModels.push(model);
  if (!cfg.apiKeys) cfg.apiKeys = {};
  cfg.apiKeys[`custom_${model.id}`] = model.apiKey;
  writeConfig(cfg);
  logAction({ ts: Date.now(), type: "action", category: "llm-provider", message: `Added custom model: ${model.name} (${model.id})` });
}

export function getProviderStatus(providerKeys: Record<string, string>): ProviderStatus[] {
  const cfg = readConfig();
  const statuses = PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    configured: p.id === "ollama" || !!providerKeys[p.id],
    models: p.models,
    setupUrl: p.setupUrl,
    setupHint: p.setupHint,
  }));

  // Append custom models as a "custom" provider
  if (cfg.customModels && cfg.customModels.length > 0) {
    statuses.push({
      id: "custom",
      name: "Custom",
      configured: true,
      models: cfg.customModels.map((m) => ({ id: m.id, name: m.name })),
      setupHint: "User-configured models",
    });
  }

  return statuses;
}

// ── Provider Lookup ─────────────────────────────────────────────────────────

export function findProviderForModel(modelId: string): LLMProvider | null {
  for (const p of PROVIDERS) {
    if (p.models.some((m) => m.id === modelId)) return p;
  }
  return null;
}

function getCustomModelConfig(modelId: string): ProvidersConfig["customModels"] extends (infer T)[] ? T | undefined : never {
  const cfg = readConfig();
  return cfg.customModels?.find((m) => m.id === modelId);
}

// ── Unified Chat LLM Call ───────────────────────────────────────────────────

export async function callChatLLM(params: {
  prompt: string;
  systemPrompt?: string;
  model: string;
  providerKeys: Record<string, string>;
  timeoutMs?: number;
}): Promise<string> {
  const { prompt, systemPrompt, model, providerKeys, timeoutMs = 60_000 } = params;

  const provider = findProviderForModel(model);

  if (provider) {
    const apiKey = providerKeys[provider.id] ?? "";
    if (!apiKey && provider.id !== "ollama") {
      throw new Error(`No API key configured for ${provider.name}. Add it in Settings or set ${provider.apiKeyEnvVar}.`);
    }

    if (provider.format === "gemini") {
      return callGeminiChat({ prompt, systemPrompt, model, apiKey, timeoutMs });
    } else if (provider.format === "anthropic") {
      return callAnthropicChat({ prompt, systemPrompt, model, apiKey, timeoutMs });
    } else {
      return callOpenAICompatChat({ prompt, systemPrompt, model, apiKey, baseUrl: provider.baseUrl!, timeoutMs });
    }
  }

  // Check custom models
  const custom = getCustomModelConfig(model);
  if (custom) {
    const apiKey = providerKeys[`custom_${model}`] || custom.apiKey;
    return callOpenAICompatChat({ prompt, systemPrompt, model: custom.id, apiKey, baseUrl: custom.baseUrl, timeoutMs });
  }

  throw new Error(`Unknown model: ${model}. Select a model in Settings.`);
}

// ── Gemini Implementation ───────────────────────────────────────────────────

async function callGeminiChat(params: {
  prompt: string;
  systemPrompt?: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}): Promise<string> {
  const { prompt, systemPrompt, model, apiKey, timeoutMs } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 16384 },
    };
    if (systemPrompt) {
      body.system_instruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const err = await response.text();
      logError("llm-provider", `Gemini API error (${model}): ${response.status}`, err);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Gemini response");

    return text
      .replace(/^```(?:json|jsx?|tsx?)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error(`LLM timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── OpenAI-Compatible Implementation ────────────────────────────────────────

async function callOpenAICompatChat(params: {
  prompt: string;
  systemPrompt?: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}): Promise<string> {
  const { prompt, systemPrompt, model, apiKey, baseUrl, timeoutMs } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey && apiKey !== "local") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, max_tokens: 16384 }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      logError("llm-provider", `OpenAI-compat API error (${model}): ${response.status}`, err);
      throw new Error(`LLM API error (${model}): ${response.status}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = result.choices?.[0]?.message?.content;
    if (!text) throw new Error(`Empty response from ${model}`);
    return text.trim();
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error(`LLM timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Anthropic Implementation ────────────────────────────────────────────────

async function callAnthropicChat(params: {
  prompt: string;
  systemPrompt?: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}): Promise<string> {
  const { prompt, systemPrompt, model, apiKey, timeoutMs } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model,
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      logError("llm-provider", `Anthropic API error (${model}): ${response.status}`, err);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const result = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = result.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("Empty Anthropic response");
    return text.trim();
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error(`LLM timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Validation Helpers ──────────────────────────────────────────────────────

export function isValidChatModel(modelId: string): boolean {
  if (findProviderForModel(modelId)) return true;
  if (getCustomModelConfig(modelId)) return true;
  return false;
}

export function isValidClaudeCodeModel(modelId: string): boolean {
  if (CLAUDE_CODE_MODELS.some((m) => m.id === modelId)) return true;
  if (modelId.startsWith("ollama:")) return true;
  return false;
}
