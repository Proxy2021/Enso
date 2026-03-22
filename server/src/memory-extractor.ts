/**
 * Memory Extractor — auto-learns from conversations.
 *
 * After each assistant response, asynchronously extracts key facts
 * and appends them to daily memory logs. Uses the centralized LLM provider
 * system (callChatLLM) with fast model fallback.
 * Fire-and-forget — never blocks the main response path.
 */

import { callChatLLM } from "./llm-provider.js";
import { callGeminiLLMWithRetry, GEMINI_MODEL_FAST } from "./ui-generator.js";
import { appendDailyMemory, readRecentDailyLogs, appendEnsoMemory, readEnsoMemory, writeEnsoMemory } from "./memory-bridge.js";
import { logAction, logError } from "./action-log.js";

/**
 * Call LLM for memory operations. Prefers Gemini Flash (cheapest/fastest),
 * falls back to user's configured chat model via unified provider system.
 */
async function callMemoryLLM(prompt: string, geminiApiKey?: string, providerKeys?: Record<string, string>): Promise<string> {
  // Prefer direct Gemini Flash — cheapest for background tasks
  if (geminiApiKey) {
    return callGeminiLLMWithRetry(prompt, geminiApiKey, GEMINI_MODEL_FAST, 10_000);
  }
  // Fallback: use unified provider system with any configured model
  if (providerKeys && Object.keys(providerKeys).length > 0) {
    // Pick cheapest available: gemini flash → gpt-4o-mini → first configured
    const model = providerKeys.gemini ? GEMINI_MODEL_FAST
      : providerKeys.openai ? "gpt-4o-mini"
      : "gemini-2.5-flash";
    return callChatLLM({ prompt, model, providerKeys, timeoutMs: 10_000 });
  }
  throw new Error("No LLM provider available for memory extraction");
}

// ── Rate limiting ──

let lastExtractionTime = 0;
const EXTRACTION_COOLDOWN_MS = 30_000; // 30 seconds

function canExtract(): boolean {
  return Date.now() - lastExtractionTime >= EXTRACTION_COOLDOWN_MS;
}

function markExtracted(): void {
  lastExtractionTime = Date.now();
}

// ── Extraction ──

const EXTRACTION_PROMPT = `You analyze conversations to extract genuinely memorable facts.

Given a user message and assistant response, determine if the conversation contains any of these:
- User preferences, opinions, or personal information
- Decisions made or conclusions reached
- Something the user built, created, or accomplished
- Important topics the user is working on or interested in

RULES:
- Only extract facts that would be useful in FUTURE conversations
- Skip greetings, small talk, trivial questions (how to X, what is Y)
- Skip ephemeral information (current time, weather, one-off calculations)
- Return EMPTY arrays if nothing is worth remembering
- Be very selective — only truly persistent, reusable facts

Respond with ONLY a JSON object (no markdown):
{"topic": "short topic label", "facts": ["fact 1", "fact 2"]}

If nothing worth remembering, respond: {"topic": "", "facts": []}`;

export async function extractAndPersistMemory(params: {
  userMessage: string;
  assistantResponse: string;
  geminiApiKey?: string;
  providerKeys?: Record<string, string>;
}): Promise<void> {
  const { userMessage, assistantResponse, geminiApiKey, providerKeys } = params;

  // Rate limit
  if (!canExtract()) return;
  markExtracted();

  // Skip very short exchanges
  if (userMessage.length < 20 && assistantResponse.length < 50) return;

  try {
    const prompt = `${EXTRACTION_PROMPT}

User: ${userMessage.slice(0, 500)}
Assistant: ${assistantResponse.slice(0, 1000)}`;

    const raw = await callMemoryLLM(prompt, geminiApiKey, providerKeys);
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(cleaned) as { topic: string; facts: string[] };

    if (!result.topic || !result.facts?.length) return;

    // Deduplication: skip if same topic logged in recent daily logs
    const recentLogs = readRecentDailyLogs(1); // today only
    if (recentLogs && result.topic.length > 5) {
      const topicLower = result.topic.toLowerCase();
      if (recentLogs.toLowerCase().includes(topicLower)) return;
    }

    // Append to today's daily log (not curated MEMORY.md)
    const entry = `**${result.topic}**: ${result.facts.map((f) => `${f}`).join("; ")}`;
    appendDailyMemory(entry);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "memory-extractor",
      message: `Extracted: ${result.topic} (${result.facts.length} facts)`,
    });

    // Prune if needed
    await pruneIfNeeded(geminiApiKey, providerKeys);
  } catch (err) {
    logError("memory-extractor", "Extraction failed (non-fatal)", err);
  }
}

// ── Consolidation: daily logs → curated MEMORY.md ──

const MAX_MEMORY_SIZE = 4096; // 4KB

/**
 * Consolidate older daily logs into curated MEMORY.md.
 * Keeps last 2 days of daily logs intact, summarizes older ones into MEMORY.md.
 */
async function pruneIfNeeded(geminiApiKey?: string, providerKeys?: Record<string, string>): Promise<void> {
  try {
    // Check if daily logs from 3+ days ago exist
    const { listDailyLogFiles } = await import("./memory-bridge.js");
    const files = listDailyLogFiles();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const olderFiles = files.filter((f) => {
      const date = f.name.replace(".md", "");
      return date < yesterday && date !== today;
    });

    if (olderFiles.length === 0) return;

    // Read older daily logs
    const { safeReadFile } = await import("./memory-bridge.js");
    const olderContent = olderFiles
      .map((f) => safeReadFile(f.path))
      .filter(Boolean)
      .join("\n\n");

    if (!olderContent || olderContent.length < 50) return;

    // Consolidate into curated memory
    const consolidatePrompt = `Consolidate these daily conversation notes into durable memory entries.
Keep: user preferences, decisions, projects worked on, important facts, accomplishments.
Drop: trivial exchanges, one-off questions, ephemeral details.
Format as a bulleted list of key facts. Max 500 chars.
Respond with ONLY the consolidated text, no markdown fences.

${olderContent.slice(0, 3000)}`;

    const summary = await callMemoryLLM(consolidatePrompt, geminiApiKey, providerKeys);
    if (summary.trim().length > 10) {
      appendEnsoMemory(summary.trim());
    }

    // Delete consolidated daily files
    const { unlinkSync } = await import("node:fs");
    for (const f of olderFiles) {
      try { unlinkSync(f.path); } catch { /* best effort */ }
    }

    logAction({
      ts: Date.now(),
      type: "action",
      category: "memory-extractor",
      message: `Consolidated ${olderFiles.length} daily logs into MEMORY.md`,
    });

    // Also prune MEMORY.md if too large
    const { memory } = readEnsoMemory();
    if (memory && memory.length > MAX_MEMORY_SIZE) {
      const recentPortion = memory.slice(-2048);
      const olderPortion = memory.slice(0, memory.length - 2048);

      const prunePrompt = `Consolidate these older memory entries into a brief summary (max 500 chars).
Keep the most important facts, preferences, and patterns. Drop trivial or outdated items.
Respond with ONLY the consolidated text, no markdown fences.

${olderPortion}`;

      const prunedSummary = await callMemoryLLM(prunePrompt, geminiApiKey, providerKeys);
      const consolidated = `# Enso Memory\n\n## Consolidated\n${prunedSummary.trim()}\n\n${recentPortion.trim()}\n`;
      writeEnsoMemory(consolidated);

      logAction({
        ts: Date.now(),
        type: "action",
        category: "memory-extractor",
        message: `Pruned MEMORY.md: ${memory.length} → ${consolidated.length} chars`,
      });
    }
  } catch (err) {
    logError("memory-extractor", "Consolidation failed (non-fatal)", err);
  }
}
