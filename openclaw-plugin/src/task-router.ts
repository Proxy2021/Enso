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
import { getMemoryContext } from "./memory-bridge.js";

// ── Types ──

export type TaskComplexity = "simple" | "research" | "one-off" | "orchestrated";

export type TaskArchetype =
  | "data_analysis"
  | "travel_planning"
  | "competitive_analysis"
  | "document_processing"
  | "project_planning"
  | "market_research"
  | "creative_project"
  | "general";

export interface TaskClassification {
  complexity: TaskComplexity;
  reasoning: string;
  answer?: string;           // For simple: direct answer to return immediately
  goalSummary?: string;      // For orchestrated: high-level decomposition hint
  directAction?: string;     // For one-off: what to do
  researchTopic?: string;    // For research: extracted topic to pass to researcher
  researchDepth?: "quick" | "standard" | "deep";  // For research: suggested depth
  // Archetype fields — for one-off and orchestrated tasks
  archetype?: TaskArchetype;
  archetypeHints?: Record<string, string>;  // Domain-specific metadata
}

// ── Classifier ──

const CLASSIFIER_PROMPT = `You are a smart router for Enso, an AI assistant that can chat, run code, orchestrate multi-agent missions, and do deep web research.

Classify the user's message into exactly ONE of these four categories:

## SIMPLE
Anything you can answer directly from your knowledge — factual questions, greetings, explanations, opinions, creative writing, translations, code help, casual chat. You MUST provide the answer yourself. Be helpful, concise, and accurate.
Examples:
- "What is the capital of France?" → answer: "The capital of France is Paris."
- "Hi, how are you?" → answer: "Hey! I'm doing great. What can I help you with?"
- "Explain how React hooks work" → answer: "React hooks are functions that let you use state and lifecycle features in functional components..."
- "Write me a haiku about rain" → answer: "Gentle drops descend / Puddles mirror clouded skies / Earth drinks deeply now"
- "What does HTML stand for?" → answer: "HTML stands for HyperText Markup Language."
- "Translate 'hello' to Japanese" → answer: "こんにちは (Konnichiwa)"

## RESEARCH
The user wants to investigate, explore, compare, or understand a topic in depth using current web data. This includes current events, multi-source comparisons, analysis, recommendations, trends, and anything that benefits from searching the web for up-to-date information from multiple sources.
Examples:
- "What are the pros and cons of nuclear vs solar energy?"
- "Research quantum computing breakthroughs in 2025"
- "Best programming languages for AI development and why"
- "What's happening with AI regulation in the EU?"
- "Is intermittent fasting actually healthy?"

## ONE-OFF
A single concrete task that requires code execution, file manipulation, scripting, a bug fix, or creating something. The user wants something DONE, not discussed.
Examples:
- "Fix the bug in server.ts where the API returns 500"
- "Build me a todo app"
- "Write a Python script to scrape product prices"

## ORCHESTRATED
A task that benefits from deep research + producing a BESPOKE INTERACTIVE EXPERIENCE (dashboard, comparison tool, planner, analysis board) — not just a text summary. Also for complex multi-faceted goals requiring planning across multiple workstreams.

**CRITICAL: Choose ORCHESTRATED over RESEARCH when the task involves:**
- Detailed multi-entity comparisons with evaluation criteria (→ interactive comparison dashboard)
- Data analysis or visualization requests (→ interactive charts and tables)
- Planning tasks with timelines, budgets, or breakdowns (→ interactive planner)
- Market/industry analysis (→ interactive dashboard)
- Any request where an interactive app would serve better than a text report

Examples:
- "Compare Tesla Model Y vs BYD Seal U vs Hyundai Ioniq 5 — evaluate price, range, safety, cargo" → archetype: competitive_analysis
- "Plan a 5-day Tokyo trip under $3000 with daily activities and budget" → archetype: travel_planning
- "Break down my mobile app project into phases with timeline and resource estimates" → archetype: project_planning
- "Analyze the EV market — key players, market share, growth trends, outlook" → archetype: market_research
- "Build a complete freelance photography management system" → archetype: general
- "Help me launch my startup's MVP — landing page, auth, payments, admin" → archetype: general

## Rules
- **SIMPLE always includes an answer.** You are the AI — answer the user directly.
- **RESEARCH is for straightforward information gathering** — quick facts, opinions, "what is X", "what's happening with Y". Text-based answers suffice.
- **ORCHESTRATED is for tasks that deserve an interactive experience** — comparisons, analyses, planners, dashboards. When the result would be MUCH BETTER as an interactive app than a text report, choose ORCHESTRATED.
- If in doubt between RESEARCH and ORCHESTRATED, consider: would an interactive dashboard/comparison/planner serve the user better than a text summary? If yes → ORCHESTRATED.
- ONE-OFF requires explicit action intent (fix, create, write code, build, convert, deploy, refactor).
- For RESEARCH: extract the core topic and suggest a depth (quick/standard/deep).
- IMPORTANT: Keep researchTopic AND answer in the SAME LANGUAGE as the user's message.

## ARCHETYPE (for ONE-OFF and ORCHESTRATED only)
When classifying as one-off or orchestrated, also identify the task archetype and whether it has recurring usage potential. The archetype guides how the orchestrator decomposes the task:

| Archetype | When to use |
|-----------|-------------|
| data_analysis | Analyze data files, find patterns, build dashboards, visualize statistics |
| competitive_analysis | Compare products, companies, technologies, investment options |
| document_processing | Extract data from documents, review contracts, parse invoices |
| project_planning | Plan projects, create roadmaps, break down tasks, estimate timelines |
| travel_planning | Plan trips, compare destinations, build itineraries with budgets |
| market_research | Industry analysis, market sizing, trend analysis, sector deep-dives |
| creative_project | Design work, content creation, branding, artistic direction |
| general | Everything else that doesn't fit a specific archetype |

Respond with ONLY a JSON object (no markdown, no explanation):
{"complexity":"simple|research|one-off|orchestrated","reasoning":"brief reason","answer":"your answer (SIMPLE only)","researchTopic":"extracted topic (RESEARCH only)","researchDepth":"quick|standard","goalSummary":"for orchestrated only","directAction":"for one-off only","archetype":"archetype name (ONE-OFF/ORCHESTRATED only)","archetypeHints":{"key":"value"}}`;

export async function classifyTask(params: {
  userMessage: string;
  conversationHistory: string[];
  geminiApiKey: string;
  mediaUrls?: string[];
}): Promise<TaskClassification> {
  const { userMessage, conversationHistory, geminiApiKey, mediaUrls } = params;

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

  // Inject user profile + memory so answers are personalized
  const memoryContext = getMemoryContext();
  const memoryBlock = memoryContext
    ? `\n${memoryContext}\nUse the above context about the user to personalize your answers when relevant.\n`
    : "";

  // When files are attached, add media context to bias classification
  const mediaBlock = mediaUrls?.length
    ? `\nAttached files: ${mediaUrls.map(u => {
        const ext = u.split(".").pop()?.toLowerCase() ?? "";
        if ([".csv", ".json", ".xlsx", ".xls", ".tsv"].some(e => u.toLowerCase().endsWith(e))) return `data file (${ext})`;
        if ([".pdf", ".doc", ".docx"].some(e => u.toLowerCase().endsWith(e))) return `document (${ext})`;
        if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].some(e => u.toLowerCase().endsWith(e))) return `image (${ext})`;
        return `file (${ext})`;
      }).join(", ")}\nWhen data files are attached, bias toward data_analysis archetype. When documents are attached, bias toward document_processing.\n`
    : "";

  const fullPrompt = `${CLASSIFIER_PROMPT}\n${memoryBlock}${recentContext}${mediaBlock}\nUser message: "${userMessage}"`;

  try {
    const raw = await callGeminiLLMWithRetry(fullPrompt, geminiApiKey, GEMINI_MODEL_FAST);

    // Parse the JSON response
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as TaskClassification;

    // Validate the complexity field
    if (!["simple", "research", "one-off", "orchestrated"].includes(parsed.complexity)) {
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
    // Unless they're clear action commands or questions
    if (/^(fix|build|create|deploy|convert|setup|install)\b/i.test(lower)) {
      return null; // Let LLM decide — might be one-off
    }
    if (/^(what|who|when|where|why|how|is|are|does|do)\b/i.test(lower)) {
      return null; // Let LLM decide — might be direct answer
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
      reasoning: "Short message — likely a greeting or command",
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
      // Long messages with analyze/explore/examine may be archetype candidates — let LLM decide
      if (wordCount >= 12 && /^(explore|analyze|examine)\s/i.test(lower)) {
        return null;
      }
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
        researchDepth: /quick|快速/i.test(lower) || /快速/.test(trimmed) ? "quick" : "standard",
      };
    }
  }

  // ── Research intent — Chinese "tell me everything about X" ──
  // Pattern: 告诉我(关于/有关)X的(全部/一切/所有)(事情/东西/内容/信息)?
  // Topic is embedded mid-sentence, so we need capturing groups instead of prefix stripping
  const chTellMeAll = /^告诉我(关于|有关)?(.+?)(的)?(全部|一切|所有)(事情|东西|内容|信息)?$/;
  const chMatch = chTellMeAll.exec(trimmed);
  if (chMatch) {
    return {
      complexity: "research",
      reasoning: "Chinese 'tell me everything about' pattern detected",
      researchTopic: chMatch[2].trim(),
      researchDepth: "standard",
    };
  }

  // ── Research intent — Chinese "I want to know everything about X" ──
  // Pattern: 我想(了解/知道)(关于/有关)?X的(全部/一切/所有)(事情/信息)?
  const chWantToKnow = /^我想(了解|知道)(关于|有关)?(.+?)(的)?(全部|一切|所有)(事情|东西|内容|信息)?$/;
  const chWantMatch = chWantToKnow.exec(trimmed);
  if (chWantMatch) {
    return {
      complexity: "research",
      reasoning: "Chinese 'I want to know everything about' pattern detected",
      researchTopic: chWantMatch[3].trim(),
      researchDepth: "standard",
    };
  }

  // ── Research intent — comparison/analysis patterns ──
  // Complex comparisons with evaluation criteria → let LLM decide (may be competitive_analysis archetype)
  // Simple comparisons → research
  if (/\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)\b/i.test(lower) && wordCount >= 5) {
    if (wordCount >= 15) return null; // Complex — let LLM classify with archetype
    return {
      complexity: "research",
      reasoning: "Comparison/analysis pattern detected",
      researchTopic: trimmed,
      researchDepth: "standard",
    };
  }

  if (/\bcompare\b/i.test(lower) && wordCount >= 4) {
    if (wordCount >= 12) return null; // Detailed comparison — let LLM classify with archetype
    return {
      complexity: "research",
      reasoning: "Comparison request detected",
      researchTopic: trimmed,
      researchDepth: "standard",
    };
  }

  if (/\bvs\.?\b/i.test(lower) && wordCount >= 4 && !/\b(fix|build|create|write|code)\b/i.test(lower)) {
    if (wordCount >= 12) return null; // Detailed vs — let LLM classify with archetype
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

  // ── Archetype heuristics — detect specific task patterns ──
  // "plan a trip / travel / itinerary / vacation"
  if (/\b(plan\s+(a\s+)?(trip|travel|vacation|holiday|itinerary|visit))\b/i.test(lower) && wordCount >= 5) {
    return null; // Let LLM classify with archetype hints
  }
  // "analyze (this|the|my) data/file/csv/spreadsheet"
  if (/\b(analyze|analyse)\s+(this|the|my|a)?\s*(data|file|csv|spreadsheet|dataset|numbers|sales|spending|transactions)\b/i.test(lower)) {
    return null; // Let LLM classify — likely data_analysis archetype
  }
  // "compare X and Y" / "X vs Y" for investment/business (long messages)
  if (/\b(compare|evaluate|assess)\b/i.test(lower) && wordCount >= 8 && /\b(invest|business|company|stock|product|option|alternative)\b/i.test(lower)) {
    return null; // Let LLM classify — likely competitive_analysis archetype
  }
  // "review (this|the|my) contract/document/invoice/agreement"
  if (/\b(review|extract|parse|process)\s+(this|the|my|a)?\s*(contract|document|invoice|agreement|lease|report|receipt)\b/i.test(lower)) {
    return null; // Let LLM classify — likely document_processing archetype
  }
  // "plan (this|the|my|a) project/roadmap/sprint"
  if (/\b(plan|break\s+down|decompose|organize)\s+(this|the|my|a)?\s*(project|roadmap|sprint|initiative|launch|release)\b/i.test(lower)) {
    return null; // Let LLM classify — likely project_planning archetype
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
    // All question-word messages → let LLM decide (may be direct, research, or simple)
    return null;
  }

  // Let LLM handle everything else
  return null;
}
