/**
 * Task Router — Smart 3-tier message classifier
 *
 * Classifies user messages as:
 *   - "simple"       → normal agent pipeline (informational, questions, casual chat)
 *   - "one-off"      → single Claude Code session (code tasks, file ops, single builds)
 *   - "orchestrated" → multi-agent orchestration (complex goals, sustained missions)
 *
 * Uses Gemini Flash for fast, low-latency classification (<2s).
 */

import { callGeminiLLMWithRetry, GEMINI_MODEL_FAST } from "./ui-generator.js";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export type TaskComplexity = "simple" | "one-off" | "orchestrated";

export interface TaskClassification {
  complexity: TaskComplexity;
  reasoning: string;
  goalSummary?: string;    // For orchestrated: high-level decomposition hint
  directAction?: string;   // For one-off: what to do
}

// ── Classifier ──

const CLASSIFIER_PROMPT = `You are a task complexity classifier for Enso, an AI assistant that can chat, run code, and orchestrate multi-agent missions.

Classify the user's message into exactly ONE of these three categories:

## SIMPLE
Questions, information requests, casual chat, opinions, explanations, single-step lookups, greetings, small talk.
Examples:
- "What's the weather like in Tokyo?"
- "Explain how React hooks work"
- "Hi, how are you?"
- "What's the best restaurant in SF?"
- "Summarize this article"
- "What time is it in London?"

## ONE-OFF
A single concrete task that requires code execution, file manipulation, scripting, a bug fix, data processing, or creating ONE thing. The user wants something DONE, not just discussed. But it's a bounded, single-scope task.
Examples:
- "Convert all PNG files to JPEG in my Downloads folder"
- "Fix the bug in server.ts where the API returns 500"
- "Write a Python script to scrape product prices"
- "Create a REST API endpoint for user registration"
- "Optimize this SQL query"
- "Set up a new React component for the login page"
- "Build me a todo app"
- "Refactor this function to use async/await"

## ORCHESTRATED
A complex, multi-faceted goal that requires research, planning, AND execution across multiple workstreams. The task needs different types of work (research + design + building, or analysis + multiple deliverables). These are missions, not tasks.
Examples:
- "Plan a 2-week trip to Japan for my family"
- "Build a complete freelance photography management system"
- "Help me launch my startup's MVP — I need a landing page, user auth, payment integration, and admin dashboard"
- "Analyze my competitor landscape and build tools to track them"
- "Set up my entire development environment with CI/CD, testing, and deployment"
- "Create a comprehensive marketing strategy with landing pages and analytics"

## Rules
- If in doubt between simple and one-off, choose SIMPLE (let the normal agent handle it)
- If in doubt between one-off and orchestrated, choose ONE-OFF (simpler is better)
- Short messages (< 10 words) are almost always SIMPLE unless they're clear action commands
- Messages starting with "build me a complete...", "set up a full...", "plan a..." tend toward ORCHESTRATED
- Messages that mention multiple distinct deliverables or workstreams → ORCHESTRATED
- The presence of explicit action words (fix, create, write, build, convert, deploy) signals ONE-OFF
- Just asking about something (even complex topics) is SIMPLE — the user must want ACTION

Respond with ONLY a JSON object (no markdown, no explanation):
{"complexity":"simple|one-off|orchestrated","reasoning":"brief reason","goalSummary":"for orchestrated only","directAction":"for one-off only"}`;

export async function classifyTask(params: {
  userMessage: string;
  conversationHistory: string[];
  geminiApiKey: string;
}): Promise<TaskClassification> {
  const { userMessage, conversationHistory, geminiApiKey } = params;

  // Quick heuristics for obvious cases — skip the LLM call entirely
  const quick = quickClassify(userMessage);
  if (quick) {
    logAction({
      ts: Date.now(),
      type: "action",
      category: "task-router",
      message: `Quick-classified as "${quick.complexity}": ${userMessage.slice(0, 80)}`,
    });
    return quick;
  }

  // Build context for the classifier
  const recentContext = conversationHistory.length > 0
    ? `\nRecent conversation:\n${conversationHistory.slice(-3).map((m, i) => `  ${i + 1}. ${m.slice(0, 200)}`).join("\n")}\n`
    : "";

  const fullPrompt = `${CLASSIFIER_PROMPT}\n${recentContext}\nUser message: "${userMessage}"`;

  try {
    const raw = await callGeminiLLMWithRetry(fullPrompt, geminiApiKey, GEMINI_MODEL_FAST);

    // Parse the JSON response
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as TaskClassification;

    // Validate the complexity field
    if (!["simple", "one-off", "orchestrated"].includes(parsed.complexity)) {
      throw new Error(`Invalid complexity: ${parsed.complexity}`);
    }

    logAction({
      ts: Date.now(),
      type: "action",
      category: "task-router",
      message: `Classified as "${parsed.complexity}": ${userMessage.slice(0, 80)} — ${parsed.reasoning}`,
    });

    return parsed;
  } catch (err) {
    logError("task-router", "Classification failed, defaulting to simple", err, {
      userMessage: userMessage.slice(0, 200),
    });

    // Safe fallback — normal agent handles it
    return {
      complexity: "simple",
      reasoning: "Classification failed, falling through to normal agent",
    };
  }
}

// ── Quick Heuristics ──

/**
 * Fast heuristic-based classification for obvious cases.
 * Returns null if the message needs LLM classification.
 */
function quickClassify(message: string): TaskClassification | null {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  const wordCount = trimmed.split(/\s+/).length;

  // Very short messages are almost always simple
  if (wordCount <= 3) {
    // Unless they're clear action commands
    if (/^(fix|build|create|deploy|convert|setup|install)\b/i.test(lower)) {
      return null; // Let LLM decide — might be one-off
    }
    return {
      complexity: "simple",
      reasoning: "Short message — likely a question or greeting",
    };
  }

  // Greetings
  if (/^(hi|hello|hey|howdy|good (morning|afternoon|evening)|what's up|sup)\b/i.test(lower)) {
    return {
      complexity: "simple",
      reasoning: "Greeting detected",
    };
  }

  // Pure questions that start with question words (and don't contain action verbs)
  if (/^(what|who|when|where|why|how|is|are|does|do|can|could|should|would|will)\b/i.test(lower)) {
    // Longer messages with "can you help" / "could you help" etc. are action requests — always LLM
    if (/^(can|could|would|will)\s+you\s+(help|please)\b/i.test(lower) && wordCount > 10) {
      return null; // Let LLM decide — likely an action request
    }
    // Messages with action verbs are asking to DO something
    if (/\b(build|create|make|set up|implement|write|develop|design|plan|process|organize|convert|transform|generate|deploy|configure|analyze|research|launch)\b/i.test(lower) && wordCount > 8) {
      return null; // Let LLM decide
    }
    return {
      complexity: "simple",
      reasoning: "Question format — informational request",
    };
  }

  // Let LLM handle everything else
  return null;
}
