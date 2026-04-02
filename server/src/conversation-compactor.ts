/**
 * conversation-compactor.ts — LLM-powered conversation history compaction.
 *
 * Adapted from Claude Code's compaction approach: when conversation history
 * grows beyond a threshold, older entries are summarized into a structured
 * summary via Gemini, preserving recent messages verbatim. This maintains
 * conversational context without hitting quality degradation from diluted history.
 */

import { callGeminiLLMWithRetry } from "./ui-generator.js";
import { GEMINI_MODEL_UTILITY } from "./config.js";
import { appendDailyMemory } from "./memory-bridge.js";
import { logAction, logError } from "./action-log.js";
import type { ConversationEntry } from "./standalone-agent.js";

// ── Constants ──────────────────────────────────────────────────────────────

/** Auto-compact when history exceeds this many entries. */
const COMPACT_THRESHOLD = 20;

/** Keep the last N entries verbatim (~4 user-model turn pairs). */
const PRESERVE_RECENT = 8;

/** Don't bother summarizing fewer than this many entries. */
const MIN_ENTRIES_TO_SUMMARIZE = 6;

/** Skip compaction if estimated tokens are below this (short conversations). */
const MIN_TOKEN_ESTIMATE = 2000;

// ── Concurrency guard ──────────────────────────────────────────────────────

const compactingKeys = new Set<string>();

// ── Token estimation ───────────────────────────────────────────────────────

/** Rough token estimate: ~4 chars per token for English text. */
export function estimateTokens(entries: ConversationEntry[]): number {
  let chars = 0;
  for (const entry of entries) {
    for (const part of entry.parts) {
      if (part.text) chars += part.text.length;
      if (part.functionCall) chars += JSON.stringify(part.functionCall.args).length + part.functionCall.name.length;
      if (part.functionResponse) chars += JSON.stringify(part.functionResponse.response).length + part.functionResponse.name.length;
    }
  }
  return Math.ceil(chars / 4);
}

// ── Serialization ──────────────────────────────────────────────────────────

/** Convert conversation entries into a human-readable transcript for the summarizer. */
function serializeForSummary(entries: ConversationEntry[]): string {
  var lines: string[] = [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var roleLabel = entry.role === "user" ? "USER" : "ASSISTANT";

    for (var part of entry.parts) {
      if (part.text) {
        // Truncate very long texts (e.g., large file contents in tool results)
        var text = part.text.length > 800 ? part.text.slice(0, 800) + "..." : part.text;
        lines.push(`${roleLabel}: ${text}`);
      }
      if (part.functionCall) {
        var argStr = JSON.stringify(part.functionCall.args);
        if (argStr.length > 200) argStr = argStr.slice(0, 200) + "...";
        lines.push(`TOOL CALL: ${part.functionCall.name}(${argStr})`);
      }
      if (part.functionResponse) {
        var resStr = JSON.stringify(part.functionResponse.response);
        if (resStr.length > 400) resStr = resStr.slice(0, 400) + "...";
        lines.push(`TOOL RESULT [${part.functionResponse.name}]: ${resStr}`);
      }
    }
  }

  return lines.join("\n");
}

// ── Summarization prompt ───────────────────────────────────────────────────

function buildSummaryPrompt(transcript: string): string {
  return `You are summarizing a conversation between a user and Enso, an AI assistant with tool-calling capabilities (web search, filesystem, media, browser, code sessions, etc.).

Produce a structured summary covering these sections:

1. **User Goals**: What the user has been trying to accomplish
2. **Key Decisions**: Important choices, preferences, or constraints the user stated
3. **Tools Used & Results**: Which tools were called and their key outcomes (tool names + brief result, not full output)
4. **Errors & Fixes**: Any errors encountered and how they were resolved
5. **Current State**: Where things stand right now — what was just completed or discussed
6. **Pending Items**: Anything the user asked about but hasn't been resolved yet

Rules:
- Be concise. Use bullet points within each section.
- Focus on facts needed to continue the conversation seamlessly.
- Omit sections that have no content (e.g., skip "Errors & Fixes" if there were none).
- Aim for 300-500 words total.
- Do NOT wrap your response in any XML tags or markdown code fences — just write the summary directly.

CONVERSATION:
${transcript}`;
}

// ── History surgery ────────────────────────────────────────────────────────

/**
 * Splice the history array in-place: replace older entries with a summary,
 * preserving the most recent entries verbatim.
 *
 * Handles Gemini's role alternation constraint:
 * - Summary is injected as role: "user" (Gemini requires first entry = user)
 * - If preserved tail starts with "user", insert a brief model bridge entry
 */
function compactInPlace(history: ConversationEntry[], summary: string): void {
  var preserved = history.slice(-PRESERVE_RECENT);

  // Clear and rebuild
  history.length = 0;

  // Summary as user entry (satisfies Gemini's "first = user" constraint)
  history.push({
    role: "user",
    parts: [{ text: `Here is a summary of our conversation so far:\n\n${summary}` }],
  });

  // If preserved starts with "user", we need a model entry for alternation
  if (preserved.length > 0 && preserved[0].role === "user") {
    history.push({
      role: "model",
      parts: [{ text: "Understood — I have the full context from our conversation. Continuing from where we left off." }],
    });
  }

  // Append preserved recent entries
  for (var entry of preserved) {
    history.push(entry);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Auto-compact conversation history if it exceeds thresholds.
 * Returns true if compaction occurred, false if skipped.
 * On failure, logs the error and returns false (caller should fall back to trimHistory).
 */
export async function maybeCompactHistory(
  history: ConversationEntry[],
  apiKey: string,
  conversationKey?: string,
): Promise<boolean> {
  // Gate: entry count
  if (history.length <= COMPACT_THRESHOLD) return false;

  // Gate: enough entries worth summarizing
  var toSummarize = history.slice(0, -PRESERVE_RECENT);
  if (toSummarize.length < MIN_ENTRIES_TO_SUMMARIZE) return false;

  // Gate: token estimate
  if (estimateTokens(toSummarize) < MIN_TOKEN_ESTIMATE) return false;

  // Gate: concurrency
  var lockKey = conversationKey ?? "default";
  if (compactingKeys.has(lockKey)) return false;

  compactingKeys.add(lockKey);
  try {
    var transcript = serializeForSummary(toSummarize);
    var prompt = buildSummaryPrompt(transcript);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "compaction",
      message: `Auto-compacting: ${history.length} entries (${toSummarize.length} to summarize, ${PRESERVE_RECENT} preserved), ~${estimateTokens(history)} tokens`,
    });

    var summary = await callGeminiLLMWithRetry(prompt, apiKey, GEMINI_MODEL_UTILITY);

    if (!summary || summary.trim().length < 50) {
      logError("compaction", "Summarization returned empty or too-short result");
      return false;
    }

    var oldCount = history.length;
    compactInPlace(history, summary.trim());

    logAction({
      ts: Date.now(),
      type: "action",
      category: "compaction",
      message: `Compacted ${oldCount} → ${history.length} entries (~${estimateTokens(history)} tokens)`,
    });

    // Persist a note to daily memory for cross-session continuity
    appendDailyMemory(`[compaction] Conversation compacted: ${toSummarize.length} older entries summarized`);

    return true;
  } catch (err) {
    logError("compaction", "Auto-compaction failed", err);
    return false;
  } finally {
    compactingKeys.delete(lockKey);
  }
}

/**
 * Force-compact the conversation history (used by /compact command).
 * Returns the summary text. Throws on failure.
 */
export async function forceCompactHistory(
  history: ConversationEntry[],
  apiKey: string,
): Promise<string> {
  var toSummarize = history.length > PRESERVE_RECENT
    ? history.slice(0, -PRESERVE_RECENT)
    : history.slice(0, Math.max(1, history.length - 2));

  if (toSummarize.length < 2) {
    throw new Error("Not enough conversation history to compact");
  }

  var transcript = serializeForSummary(toSummarize);
  var prompt = buildSummaryPrompt(transcript);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "compaction",
    message: `Force-compacting: ${history.length} entries (${toSummarize.length} to summarize)`,
  });

  var summary = await callGeminiLLMWithRetry(prompt, apiKey, GEMINI_MODEL_UTILITY);

  if (!summary || summary.trim().length < 50) {
    throw new Error("Summarization returned an unusable result");
  }

  var trimmed = summary.trim();
  var oldCount = history.length;
  compactInPlace(history, trimmed);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "compaction",
    message: `Force-compacted ${oldCount} → ${history.length} entries`,
  });

  appendDailyMemory(`[compaction] Conversation force-compacted: ${toSummarize.length} entries summarized`);

  return trimmed;
}
