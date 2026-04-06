/**
 * card-summarizer.ts — Universal card content summarization.
 *
 * Extracts meaningful content from any Enso card type and synthesizes
 * a structured summary using callChatLLM (any configured provider).
 */

import { llm } from "./llm.js";
import { logAction, logError } from "./action-log.js";
import { LLM_FAST_TIMEOUT_MS } from "./config.js";

// ── Types ──

export interface CardSummary {
  overview: string;
  keyOutcomes: string[];
  narrative: string;
}

interface ExtractedContent {
  cardType: string;
  title: string;
  body: string;
  structuredData?: unknown;
}

// ── ANSI stripping ──

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").replace(/\x1B\][^\x07]*\x07/g, "");
}

// ── Content Extraction (per card type) ──

function extractOrchestrationContent(data: unknown): ExtractedContent {
  const d = data as Record<string, unknown> | undefined;
  const plan = (d?.orchestrationPlan ?? (d?.orchestrationProgress as Record<string, unknown>)?.plan) as Record<string, unknown> | undefined;

  if (!plan) {
    return { cardType: "orchestration", title: "Orchestration Run", body: JSON.stringify(data ?? {}).slice(0, 8000) };
  }

  const goal = String(plan.goal ?? "");
  const tasks = (plan.tasks ?? []) as Array<Record<string, unknown>>;
  const parts: string[] = [`Goal: ${goal}`, ""];

  for (const task of tasks) {
    const status = task.status === "completed" ? "DONE" : task.status === "failed" ? "FAILED" : String(task.status ?? "unknown");
    parts.push(`[${status}] ${task.title ?? task.taskId}`);
    if (task.description) parts.push(`  Description: ${String(task.description).slice(0, 200)}`);
    if (task.resultSummary) parts.push(`  Result: ${String(task.resultSummary).slice(0, 300)}`);
    if (task.error) parts.push(`  Error: ${String(task.error).slice(0, 200)}`);
    parts.push("");
  }

  const agents = (plan.agents ?? []) as Array<Record<string, unknown>>;
  if (agents.length > 0) {
    parts.push(`Agents: ${agents.map((a) => `${a.role} (${a.status})`).join(", ")}`);
  }

  return {
    cardType: "orchestration",
    title: goal || "Orchestration Run",
    body: parts.join("\n").slice(0, 8000),
    structuredData: { status: plan.status, taskCount: tasks.length, completedCount: tasks.filter((t) => t.status === "completed").length, failedCount: tasks.filter((t) => t.status === "failed").length },
  };
}

function extractTerminalContent(text: string): ExtractedContent {
  const cleaned = stripAnsi(text);
  const lines = cleaned.split("\n");

  const meaningful: string[] = [];
  let charBudget = 8000;
  for (const line of lines) {
    if (charBudget <= 0) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip repetitive progress lines
    if (trimmed.match(/^\d+%/) || trimmed.match(/^\.{3,}$/)) continue;
    meaningful.push(trimmed);
    charBudget -= trimmed.length;
  }

  return {
    cardType: "terminal",
    title: "Claude Code Session",
    body: meaningful.join("\n"),
  };
}

function extractDynamicUIContent(text?: string, data?: unknown): ExtractedContent {
  const d = data as Record<string, unknown> | undefined;
  const title = String(d?.topic ?? d?.title ?? d?.tool ?? "App Result");

  const parts: string[] = [];
  if (text) parts.push(text.slice(0, 2000));

  if (d) {
    const dataStr = JSON.stringify(d, null, 2);
    const budget = 8000 - parts.join("").length;
    if (budget > 0) parts.push(dataStr.slice(0, budget));
  }

  return {
    cardType: "dynamic-ui",
    title,
    body: parts.join("\n\n"),
    structuredData: d,
  };
}

function extractChatContent(text: string): ExtractedContent {
  return {
    cardType: "chat",
    title: "Assistant Response",
    body: text.slice(0, 8000),
  };
}

export function extractCardContent(
  cardType: string,
  text?: string,
  data?: unknown,
  taskTerminals?: Record<string, { text: string; status: string }>,
): ExtractedContent {
  switch (cardType) {
    case "orchestration": {
      const base = extractOrchestrationContent(data);
      if (taskTerminals) {
        const termParts = Object.entries(taskTerminals)
          .map(([id, t]) => `--- Task ${id} terminal ---\n${stripAnsi(t.text).slice(0, 1000)}`)
          .join("\n\n");
        if (termParts) {
          base.body = (base.body + "\n\n" + termParts).slice(0, 12000);
        }
      }
      return base;
    }
    case "terminal":
      return extractTerminalContent(text ?? "");
    case "dynamic-ui":
      return extractDynamicUIContent(text, data);
    case "chat":
      return extractChatContent(text ?? "");
    default:
      return { cardType, title: `${cardType} Card`, body: (text ?? JSON.stringify(data ?? "")).slice(0, 8000) };
  }
}

// ── Summarization Prompts ──

const SYSTEM_PROMPTS: Record<string, string> = {
  orchestration: `You are summarizing the results of a multi-agent orchestration run. The orchestration had a defined goal and multiple tasks executed by specialized agents. Provide a clear, executive-style summary of what was accomplished, what succeeded, what failed, and key outcomes.`,
  terminal: `You are summarizing a Claude Code (AI coding agent) session transcript. Extract the key actions taken, files modified, decisions made, and outcomes achieved. Focus on what was built, fixed, or changed — not the mechanical details of tool calls.`,
  "dynamic-ui": `You are summarizing the output of an interactive application or tool. Extract the key information, results, and insights from the data presented.`,
  chat: `You are summarizing an AI assistant response. Extract the key points, recommendations, and information provided.`,
};

function buildSummarizationPrompt(extracted: ExtractedContent): string {
  return `Summarize the following ${extracted.cardType} content. Return your response as valid JSON with this exact structure:

{
  "overview": "A 2-3 sentence executive summary of what happened/was accomplished",
  "keyOutcomes": ["Outcome 1", "Outcome 2", "...up to 6 key points"],
  "narrative": "A 2-3 paragraph detailed narrative covering the full scope of what occurred, key decisions, results, and implications"
}

Title: ${extracted.title}

Content:
${extracted.body}`;
}

// ── Main Summarization Function ──

export async function summarizeCard(params: {
  cardType: string;
  text?: string;
  data?: unknown;
  taskTerminals?: Record<string, { text: string; status: string }>;
  model: string;
  providerKeys: Record<string, string>;
}): Promise<CardSummary> {
  const { cardType, text, data, taskTerminals, model, providerKeys } = params;

  const extracted = extractCardContent(cardType, text, data, taskTerminals);

  if (!extracted.body.trim()) {
    return {
      overview: "This card has no content to summarize.",
      keyOutcomes: [],
      narrative: "",
    };
  }

  logAction({ ts: Date.now(), type: "action", category: "summarizer", message: `summarizing ${cardType} card: "${extracted.title.slice(0, 60)}"` });

  const prompt = buildSummarizationPrompt(extracted);
  const systemPrompt = SYSTEM_PROMPTS[cardType] ?? SYSTEM_PROMPTS.chat;

  try {
    const raw = await llm({
      prompt,
      systemPrompt,
      model,
      providerKeys,
      timeoutMs: LLM_FAST_TIMEOUT_MS,
    });

    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```$/m, "")
      .trim()
      .replace(/[\x00-\x1f\x7f]/g, (ch) => {
        if (ch === "\n" || ch === "\r" || ch === "\t") return ch;
        return "";
      });
    const parsed = JSON.parse(cleaned) as CardSummary;

    if (!parsed.overview || !Array.isArray(parsed.keyOutcomes)) {
      throw new Error("Invalid summary structure from LLM");
    }

    return {
      overview: parsed.overview,
      keyOutcomes: parsed.keyOutcomes.slice(0, 8),
      narrative: parsed.narrative ?? "",
    };
  } catch (err) {
    logError("summarizer", `summarization failed for ${cardType}`, err);
    throw err;
  }
}
