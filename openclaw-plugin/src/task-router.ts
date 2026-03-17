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

export type TaskComplexity = "simple" | "direct" | "research" | "one-off" | "orchestrated";

export interface TaskClassification {
  complexity: TaskComplexity;
  reasoning: string;
  answer?: string;           // For direct: the answer to return immediately
  goalSummary?: string;      // For orchestrated: high-level decomposition hint
  directAction?: string;     // For one-off: what to do
  researchTopic?: string;    // For research: extracted topic to pass to researcher
  researchDepth?: "quick" | "standard" | "deep";  // For research: suggested depth
}

// ── Classifier ──

const CLASSIFIER_PROMPT = `You are a smart router for Enso, an AI assistant that can chat, run code, orchestrate multi-agent missions, and do deep web research.

Classify the user's message into exactly ONE of these five categories:

## DIRECT
Factual questions with definitive, well-known answers that you can answer immediately without web search. Provide the answer directly. This saves the user from waiting for unnecessary processing.
Examples:
- "What is the capital of France?" → answer: "The capital of France is Paris."
- "What's 2+2?" → answer: "4"
- "How many meters in a kilometer?" → answer: "There are 1,000 meters in a kilometer."
- "When did World War 2 end?" → answer: "World War 2 ended in 1945."
- "What does HTML stand for?" → answer: "HTML stands for HyperText Markup Language."
- "Who wrote Romeo and Juliet?" → answer: "William Shakespeare wrote Romeo and Juliet."

## SIMPLE
Casual chat, greetings, small talk, code explanations, opinions, creative writing, translations — things that need conversational AI but NOT web research or direct factual answers.
Examples:
- "Hi, how are you?"
- "Explain how React hooks work"
- "What does this error mean?"
- "Translate this to Spanish"
- "Write me a poem about the ocean"

## RESEARCH
The user wants to learn about, investigate, explore, compare, or understand a topic in depth. This includes any request where web research would significantly improve the answer — current events, comparisons, analysis, recommendations, trends, controversies, or any factual topic that benefits from multiple sources. The user does NOT need to say "research" explicitly.
Examples:
- "What are the pros and cons of nuclear vs solar energy?"
- "Research quantum computing breakthroughs in 2025"
- "Best programming languages for AI development and why"
- "Compare Tesla Model 3 vs BMW i4 vs Polestar 2"
- "What's happening with AI regulation in the EU?"
- "Latest developments in CRISPR gene therapy"
- "Is intermittent fasting actually healthy?"

## ONE-OFF
A single concrete task that requires code execution, file manipulation, scripting, a bug fix, data processing, or creating ONE thing. The user wants something DONE, not researched.
Examples:
- "Fix the bug in server.ts where the API returns 500"
- "Build me a todo app"
- "Write a Python script to scrape product prices"
- "Refactor this function to use async/await"

## ORCHESTRATED
A complex, multi-faceted goal requiring planning AND execution across multiple workstreams.
Examples:
- "Build a complete freelance photography management system"
- "Help me launch my startup's MVP — landing page, auth, payments, admin"

## Rules
- **DIRECT is for questions with a single, definitive answer** you are confident about. If there's any nuance, debate, or the answer depends on context/timing, use RESEARCH instead.
- **RESEARCH is the default for informational questions about real-world topics.** If the question benefits from current web data or multiple perspectives, choose RESEARCH.
- SIMPLE is for chat, greetings, code help, creative tasks, and conversational interactions.
- If in doubt between DIRECT and RESEARCH, choose RESEARCH.
- If in doubt between SIMPLE and RESEARCH, choose RESEARCH.
- ONE-OFF requires explicit action intent (fix, create, write, build, convert, deploy, refactor).
- For RESEARCH: extract the core topic and suggest a depth.
- For DIRECT: provide a concise, accurate answer (1-3 sentences).
- IMPORTANT: Keep researchTopic AND answer in the SAME LANGUAGE as the user's message.

Respond with ONLY a JSON object (no markdown, no explanation):
{"complexity":"direct|simple|research|one-off|orchestrated","reasoning":"brief reason","answer":"direct answer (DIRECT only)","researchTopic":"extracted topic (RESEARCH only)","researchDepth":"quick|standard|deep","goalSummary":"for orchestrated only","directAction":"for one-off only"}`;

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
    if (!["simple", "direct", "research", "one-off", "orchestrated"].includes(parsed.complexity)) {
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

  // Check for CJK characters — if present, skip the short-message heuristic
  // since CJK text doesn't use spaces between words
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(trimmed);

  // Very short messages are almost always simple (skip for CJK)
  if (wordCount <= 3 && !hasCJK) {
    // Unless they're clear action commands
    if (/^(fix|build|create|deploy|convert|setup|install)\b/i.test(lower)) {
      return null; // Let LLM decide — might be one-off
    }
    // "research X" with just a topic word
    if (/^research\b/i.test(lower)) {
      return {
        complexity: "research",
        reasoning: "Explicit research keyword",
        researchTopic: trimmed.replace(/^research\s*/i, ""),
        researchDepth: "standard",
      };
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

  // ── Research intent — explicit keywords ──
  // Phrases that unambiguously signal research intent
  const explicitResearchPatterns = [
    /^research\s+this\s*[:;]?\s/i,
    /^research\b/i,
    /^deep\s*dive\b/i,
    /^investigate\b/i,
    /^look\s*(in)?to\b/i,
    /^tell\s+me\s+(everything|all)\s+(about|regarding)\b/i,
    /^what\s+(should\s+I\s+know|do\s+I\s+need\s+to\s+know)\s+about\b/i,
    /^(find|gather)\s+(information|info|details|data)\s+(on|about)\b/i,
    /^(explore|analyze|examine)\s/i,
    // Chinese research triggers
    /^(快速)?研究/,
    /^调查/,
    /^深入(了解|研究|探索)/,
    /^了解/,
    // Japanese research triggers
    /^(リサーチ|調査|研究|調べ)/,
    // Spanish research triggers
    /^investigar?\b/i,
    /^buscar?\s+(información|info)\b/i,
    // Korean research triggers
    /^(연구|조사|리서치)/,
  ];

  for (const pat of explicitResearchPatterns) {
    if (pat.test(lower) || pat.test(trimmed)) {
      // Extract topic by removing the trigger phrase
      const topic = trimmed
        .replace(/^(research\s+this\s*[:;]?\s*|research|deep\s*dive\s*(into)?|investigate|look\s*(in)?to|tell\s+me\s+(everything|all)\s+(about|regarding)|what\s+(should\s+I\s+know|do\s+I\s+need\s+to\s+know)\s+about|(find|gather)\s+(information|info|details|data)\s+(on|about)|(explore|analyze|examine))\s*/i, "")
        // Strip multilingual research prefixes
        .replace(/^(快速研究|快速)?研究|^调查|^深入(了解|研究|探索)|^了解|^(リサーチ|調査|研究|調べ)(する|して)?|^investigar?\s*|^buscar?\s+(información|info)\s+(sobre|de)\s*|^(연구|조사|리서치)\s*/i, "")
        .trim();
      return {
        complexity: "research",
        reasoning: "Explicit research-intent phrase detected",
        researchTopic: topic || trimmed,
        researchDepth: /deep\s*dive|深入/i.test(lower) || /深入/.test(trimmed) ? "deep" : /quick|快速/i.test(lower) || /快速/.test(trimmed) ? "quick" : "standard",
      };
    }
  }

  // ── Research intent — comparison/analysis patterns ──
  // "pros and cons of X", "compare X vs Y", "X vs Y", "best X for Y"
  if (/\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)\b/i.test(lower) && wordCount >= 5) {
    return {
      complexity: "research",
      reasoning: "Comparison/analysis pattern detected",
      researchTopic: trimmed,
      researchDepth: "standard",
    };
  }

  if (/\bcompare\b/i.test(lower) && wordCount >= 4) {
    return {
      complexity: "research",
      reasoning: "Comparison request detected",
      researchTopic: trimmed,
      researchDepth: "standard",
    };
  }

  if (/\bvs\.?\b/i.test(lower) && wordCount >= 4 && !/\b(fix|build|create|write|code)\b/i.test(lower)) {
    return {
      complexity: "research",
      reasoning: "Versus comparison detected",
      researchTopic: trimmed,
      researchDepth: "standard",
    };
  }

  if (/^(what\s+are\s+)?the\s+best\b/i.test(lower) && wordCount >= 5 && !/\b(fix|build|create|write)\b/i.test(lower)) {
    return {
      complexity: "research",
      reasoning: "Best-of recommendation request",
      researchTopic: trimmed,
      researchDepth: "standard",
    };
  }

  // ── Research intent — "what's happening with", "latest on", "current state of" ──
  if (/\b(latest|current\s+state|what'?s\s+happening|recent\s+developments?|state\s+of\s+the\s+art)\b/i.test(lower) && wordCount >= 4) {
    return {
      complexity: "research",
      reasoning: "Current-events/trends query detected",
      researchTopic: trimmed,
      researchDepth: "standard",
    };
  }

  // Pure questions that start with question words
  if (/^(what|who|when|where|why|how|is|are|does|do|can|could|should|would|will)\b/i.test(lower)) {
    // Longer messages with "can you help" / "could you help" etc. are action requests — always LLM
    if (/^(can|could|would|will)\s+you\s+(help|please)\b/i.test(lower) && wordCount > 10) {
      return null; // Let LLM decide — likely an action request
    }
    // Messages with code/build action verbs → let LLM decide (might be one-off)
    if (/\b(build|create|make|set up|implement|write|develop|design|process|organize|convert|transform|generate|deploy|configure|refactor|launch)\b/i.test(lower) && wordCount > 8) {
      return null; // Let LLM decide
    }
    // Substantive questions (6+ words) about real-world topics → likely research
    if (wordCount >= 6) {
      return null; // Let LLM decide — could be research or simple
    }
    return {
      complexity: "simple",
      reasoning: "Short question — likely a quick factual lookup",
    };
  }

  // Let LLM handle everything else
  return null;
}
