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

## SIMPLE (default — use this for MOST messages)
Anything you can answer directly from your knowledge — factual questions, greetings, explanations, opinions, creative writing, translations, code help, casual chat, comparisons from general knowledge, templates, frameworks, strategies, plans, and outlines. You MUST provide the answer yourself. Be helpful, thorough, and well-structured. Use markdown formatting (headers, bullet points, tables, numbered lists) for longer answers. Start your response with a **1-2 sentence headline** that directly answers the user's question or gives your recommendation. Then provide detailed analysis, comparisons, or explanation below. The headline should give the user immediate value within seconds.
Examples:
- "What is the capital of France?" → answer: "The capital of France is Paris."
- "Hi, how are you?" → answer: "Hey! I'm doing great. What can I help you with?"
- "Explain how React hooks work" → answer: "React hooks are functions that let you use state and lifecycle features in functional components..."
- "Write me a haiku about rain" → answer: "Gentle drops descend / Puddles mirror clouded skies / Earth drinks deeply now"
- "Compare React Server Components vs traditional SSR" → answer with detailed comparison table
- "Generate 10 tagline options for a sustainability brand" → answer with creative taglines organized by tone
- "Create a social media campaign strategy for a fintech app" → answer with structured strategy (platform mix, content pillars, posting schedule, sample posts)
- "Create an executive summary template for a board presentation" → answer with professional template
- "Plan a product launch timeline with milestones for 90 days" → answer with phased timeline
- "Compare Salesforce vs HubSpot vs Pipedrive for a small startup" → answer with comparison table covering pricing, features, pros/cons
- "Design a customer segmentation framework" → answer with RFM methodology and segment definitions
- "Explain transformer attention mechanisms" → answer with detailed technical explanation
- "What are the pros and cons of subscription vs one-time pricing?" → answer with structured comparison
- "Create a 30-day content calendar for a tech blog" → answer with calendar table

## RESEARCH
The user wants current, real-time information that requires searching the web. Use this when the answer depends on data you might not have — recent events, latest statistics, current prices, 2025-2026 developments, or when the user explicitly says "research" or "find out."
Examples:
- "Research quantum computing breakthroughs in 2026"
- "What are the latest Series A funding trends in 2026?"
- "What's happening with AI regulation in the EU right now?"
- "Find the current pricing for AWS vs Azure vs GCP"
- "Latest news on CRISPR applications in agriculture"

## ONE-OFF
A single concrete task that requires code execution, file manipulation, scripting, a bug fix, or creating something technical. The user wants something DONE, not discussed.
Examples:
- "Fix the bug in server.ts where the API returns 500"
- "Build me a todo app"
- "Write a Python script to scrape product prices"

## ORCHESTRATED
ONLY for complex, multi-step projects that genuinely require building a software application, system, or executing coordinated workstreams. This is the heaviest option — use it sparingly.

**Use ORCHESTRATED only when ALL of these are true:**
1. The task requires building actual software/apps OR coordinating multiple dependent workstreams
2. A simple text answer or web research would be clearly insufficient
3. The task has multiple phases that need separate agent roles (researcher, coder, reviewer)

Examples:
- "Build a complete freelance photography management system" → archetype: general
- "Help me launch my startup's MVP — landing page, auth, payments, admin" → archetype: general
- "Create a full data pipeline from CSV ingestion to dashboard deployment" → archetype: data_analysis

**NOT orchestrated (these are SIMPLE or RESEARCH instead):**
- "Compare 3 CRM platforms" → SIMPLE (comparison table)
- "Analyze the EV market" → RESEARCH (web data needed)
- "Plan a 5-day Tokyo trip" → SIMPLE (structured itinerary from knowledge)
- "Create a campaign strategy" → SIMPLE (structured plan)
- "Design an architecture diagram" → SIMPLE (text-based architecture description)

## FORMATTING GUIDELINES (CRITICAL — follow these for SIMPLE answers)
When writing your SIMPLE answer, use the BEST format for the content type:
- **Comparisons** (X vs Y, pros/cons, feature comparison): You MUST use a markdown table with columns for each option and rows for criteria. Include at least 5 comparison rows.
- **Architecture / System Design / Workflows / Diagrams**: ALWAYS include a Mermaid diagram using \`\`\`mermaid code blocks when the user asks about architecture, flows, processes, or relationships. The frontend renders these as interactive SVG visualizations. Supported types: flowchart TD/LR, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, timeline.

**CRITICAL Mermaid syntax rules (MUST follow — violations cause render failures):**
- Do NOT include \`style\` directives (e.g., \`style nodeA fill:#f9f\`)
- Do NOT include \`classDef\` directives (e.g., \`classDef error fill:#f99\`)
- Do NOT include \`class\` assignments (e.g., \`class nodeA error\`)
- Do NOT include \`linkStyle\` directives (e.g., \`linkStyle 0 stroke:#ff3\`)
- Do NOT include \`click\` event handlers (e.g., \`click nodeA callback\`)
- Do NOT include \`:::\` CSS class syntax (e.g., \`A:::highlight\`)
- Do NOT include \`%%{init:...}%%\` config blocks
- Keep node labels simple — no HTML tags, no special characters except hyphens and parentheses
- For gantt charts, ALWAYS include \`dateFormat YYYY-MM-DD\` after the \`gantt\` declaration
- Always pair the diagram with a text explanation.

Example:
\`\`\`mermaid
flowchart TD
    A[Client] --> B[API Gateway]
    B --> C[Auth Service]
    B --> D[User Service]
\`\`\`

- **Timelines / Roadmaps / Launch Plans**: When the user asks for a "timeline", "roadmap", "launch plan", "milestone plan", or "Gantt chart", you MUST include a Mermaid gantt or timeline diagram. Example:
\`\`\`mermaid
gantt
    title Product Launch Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Market Research    :a1, 2026-01-01, 30d
    MVP Development    :a2, after a1, 45d
    section Phase 2
    Beta Launch        :b1, after a2, 14d
    Iteration          :b2, after b1, 30d
\`\`\`
- **Dashboards / Metrics / KPI displays**: When the user asks for a "dashboard", include a summary table with realistic sample data AND a Mermaid pie chart showing the distribution. Use realistic numbers, not placeholders.
- **Frameworks / Segmentation / Process Flows**: When the user asks for a "framework", "segmentation", or "process", include a Mermaid flowchart showing the methodology.

**CRITICAL: Visual output is MANDATORY when the user's query contains any of these words: timeline, roadmap, dashboard, diagram, chart, flowchart, visualization, framework, process flow, architecture, sequence, Gantt. You MUST include at least one Mermaid code block in your response.**

- **Plans / Timelines / Roadmaps**: Use numbered phases with **bold milestones** and specific timeframes.
- **Analysis / Strategy**: Use ## headers for sections, bullet points for key findings, and tables for data.
- **Creative content** (campaigns, calendars, content plans): Use markdown tables for schedules and calendars, numbered lists for options.
- **Technical explanations**: Use code blocks for code examples, and Mermaid diagrams for architecture or flow visualization.
- **Lists of options/recommendations**: Use a comparison table, not just bullet points.

## ENSO TOOL AWARENESS (mention relevant tools when helpful)
Enso has powerful built-in tools. When relevant, briefly mention them:
- **Deep Research** — mention when the user might benefit from live web research (e.g., "For the latest data, try asking me to research this topic")
- **Build App** — mention when the response could become an interactive tool (e.g., "You can click '+ Build App' to turn this into an interactive dashboard")
- **Code Assistant** — mention for coding tasks (e.g., "Use /code to have me write and run this directly")
- **Orchestrate** — mention for complex multi-step projects (e.g., "For a full implementation, try /orchestrate")
Do NOT mention tools in every response — only when genuinely useful for the user's specific request.

## Rules
- **Default to SIMPLE.** Most questions, comparisons, plans, templates, strategies, creative content, and explanations should be SIMPLE with a direct answer. Give thorough, well-formatted answers.
- **SIMPLE always includes an answer.** You are the AI — answer the user directly. Use markdown tables for comparisons, numbered lists for plans, and clear structure for strategies.
- **RESEARCH is ONLY for queries needing current web data** — recent events, latest prices, 2025-2026 statistics, news. If the answer doesn't require live data, use SIMPLE instead.
- **ORCHESTRATED is RARE** — only for building software systems or complex multi-agent projects. Never for comparisons, analyses, planning, creative content, or explanations.
- **If in doubt, choose SIMPLE over RESEARCH, and RESEARCH over ORCHESTRATED.**
- **NEVER use bracketed placeholders** like [Company Name], [INSERT], [YOUR X], [Concern 1], [YEAR], [TBD], [Brief description], or [High/Medium/Low]. Always generate realistic sample data, specific examples, and concrete numbers. If you don't know the user's specifics, use plausible realistic examples (e.g., "$4.2M revenue" not "[Revenue]").
- ONE-OFF requires explicit action intent (fix, create, write code, build, convert, deploy, refactor) for a technical coding task.
- For RESEARCH: extract the core topic and suggest a depth (quick/standard/deep).
- IMPORTANT: Keep researchTopic AND answer in the SAME LANGUAGE as the user's message.

## ARCHETYPE (for ONE-OFF and ORCHESTRATED only)
When classifying as one-off or orchestrated, also identify the task archetype:

| Archetype | When to use |
|-----------|-------------|
| data_analysis | Process actual data files, build data pipelines |
| document_processing | Extract data from documents, review contracts, parse invoices |
| travel_planning | Build interactive trip planners with booking integration |
| general | Everything else (most one-off and orchestrated tasks) |

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
    logError("task-router", "Classification failed, using heuristic fallback", err, {
      userMessage: userMessage.slice(0, 200),
    });

    // Heuristic fallback — try to classify based on keywords
    const heuristicResult = heuristicFallbackClassify(userMessage);
    if (heuristicResult) {
      logAction({
        ts: Date.now(),
        type: "action",
        category: "task-router",
        message: `Heuristic fallback classified as "${heuristicResult.complexity}": ${userMessage.slice(0, 80)}`,
      });
      return heuristicResult;
    }

    // Ultimate fallback — route to normal agent (NOT simple with a visible error message)
    // Return simple with no answer so server.ts routes to handleEnsoInbound
    return {
      complexity: "simple",
      reasoning: "Routed to assistant for response",
    };
  }
}

// ── Heuristic Fallback (used when LLM classification fails) ──

/**
 * Keyword-based fallback classifier for when the Gemini Flash LLM call fails.
 * Catches common query patterns so users get useful routing even without the LLM.
 * Returns null if no pattern matches (caller should use ultimate fallback).
 */
function heuristicFallbackClassify(message: string): TaskClassification | null {
  const lower = message.toLowerCase();

  // Research indicators — needs web data
  if (/\b(research|latest|2026|2025|current|trending|news|recent)\b/i.test(lower) &&
      !/\b(build|create|deploy|code)\b/i.test(lower)) {
    const topic = message.replace(/^(research|find|search)\s*/i, "").trim();
    return {
      complexity: "research",
      reasoning: "Heuristic fallback: research keywords detected",
      researchTopic: topic || message,
      researchDepth: "standard",
    };
  }

  // Strategy/planning/analysis queries — handle as simple (direct AI answer)
  if (/\b(design|plan|create|analyze|compare|strategy|campaign|framework|template|outline|calendar|segmentation|summary)\b/i.test(lower) &&
      !/\b(app|application|system|software|server|database|deploy|code|script)\b/i.test(lower)) {
    return {
      complexity: "simple",
      reasoning: "Heuristic fallback: strategy/planning/analysis request",
    };
  }

  // Code/build tasks — more conservative: require action verb + specific target
  if (/\b(fix|deploy|refactor|debug)\b/i.test(lower) &&
      /\b(bug|error|issue|server|app|file|module|function|component|endpoint|database)\b/i.test(lower)) {
    return {
      complexity: "one-off",
      reasoning: "Heuristic fallback: specific code fix task",
      directAction: message,
    };
  }
  if (/\b(build|implement|scaffold|create)\b/i.test(lower) &&
      /\b(app|application|system|server|api|pipeline|service|project|tool|bot|scraper|script)\b/i.test(lower) &&
      !/\b(diagram|chart|flowchart|template|checklist|outline|example)\b/i.test(lower)) {
    return {
      complexity: "one-off",
      reasoning: "Heuristic fallback: build task with specific deliverable",
      directAction: message,
    };
  }

  // No pattern matched
  return null;
}

// ── Data-seeking keywords that signal the query needs live web data ──
const DATA_SEEKING_PATTERN = /\b(market\s+size|growth\s+(projections?|rate|forecast)|key\s+metrics|benchmark|statistics|data\s+points?|industry\s+(analysis|report|size)|revenue|valuation|funding|investment\s+trends?|market\s+share|pricing\s+(comparison|data)|salary|compensation|adoption\s+rate|roi\s+data|case\s+stud(y|ies))\b/i;

// ── Quick Heuristics ──

/**
 * Fast heuristic-based classification for obvious cases.
 * Returns null if the message needs LLM classification.
 */
export function quickClassify(message: string): TaskClassification | null {
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
    // Short "X vs Y" should be research, not simple
    if (/\bvs\.?\b/i.test(lower)) {
      return {
        complexity: "research",
        reasoning: "Short versus comparison",
        researchTopic: trimmed,
        researchDepth: "quick",
      };
    }
    return {
      complexity: "simple",
      reasoning: "Short message — likely a greeting or command",
    };
  }

  // Explanatory/educational queries — should be SIMPLE even if they mention code terms
  // "What is an API?" "How do REST APIs work?" "Explain debugging techniques"
  if (/^(what|how|why|explain|describe|tell\s+me|can\s+you\s+explain)\b/i.test(lower) &&
      !/\b(fix|build|create|deploy|implement|refactor)\b/i.test(lower)) {
    return null; // Let LLM decide — but signal it's likely SIMPLE, not ONE-OFF
  }

  // Content generation queries that mention "code" but don't want execution
  // "Create a Mermaid diagram" "Show me a Python example" "Write a code review checklist"
  const contentCreationSignals = [
    /\b(diagram|chart|flowchart|mermaid|visualization)\b/i,
    /\b(example|template|checklist|outline|sample)\b/i,
    /\b(explain|describe|compare|analyze|summarize)\b/i,
  ];
  const executionSignals = [
    /\b(fix|deploy|install|run|execute|build\s+(me\s+)?a\s+(todo|app|system|server|api|project))\b/i,
    /\b(refactor|debug|migrate|convert|scaffold)\b/i,
    /\b(in\s+my\s+(project|repo|codebase|file))\b/i,
  ];
  const hasContentSignal = contentCreationSignals.some(p => p.test(lower));
  const hasExecutionSignal = executionSignals.some(p => p.test(lower));

  if (hasContentSignal && !hasExecutionSignal) {
    return null; // Let LLM classify — won't hit the bad heuristic fallback for these
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
      // Long messages starting with research/analyze/explore keywords may be archetype candidates
      // (e.g., "Research the plant-based meat industry — market size, companies, trends...")
      // Let the LLM classify these so it can detect market_research, data_analysis, etc.
      if (wordCount >= 12 && /^(explore|analyze|examine|research)\s/i.test(lower)) {
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

  if (/\bcompare\b/i.test(lower) && wordCount >= 4 && !/\b(build|create|deploy|code)\b/i.test(lower)) {
    return {
      complexity: "research",
      reasoning: "Comparison request detected",
      researchTopic: trimmed,
      researchDepth: wordCount >= 15 ? "standard" : "quick",
    };
  }

  if (/\bvs\.?\b/i.test(lower) && wordCount >= 4 && !/\b(fix|build|create|write|code)\b/i.test(lower)) {
    return {
      complexity: "research",
      reasoning: "Versus comparison detected",
      researchTopic: trimmed,
      researchDepth: wordCount >= 15 ? "standard" : "quick",
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

  // ── Creative generation & template requests → simple (direct answer, no LLM call needed) ──
  if (/^(generate|create|write|draft|come up with|give me|list|make|suggest|propose)\b/i.test(lower) &&
      /\b(tagline|slogan|headline|name|title|idea|concept|tip|suggestion|example|template|outline|framework|strategy|plan|calendar|schedule|campaign|post|copy|bio|pitch|summary|overview)\b/i.test(lower) &&
      !DATA_SEEKING_PATTERN.test(lower) &&
      !/\b(app|application|system|software|code|script|api|database|server|deploy)\b/i.test(lower) &&
      wordCount <= 35) {
    return {
      complexity: "simple",
      reasoning: "Creative generation / template request — direct answer",
    };
  }

  // ── Technical explanations → simple (no web data needed) ──
  if (/^(explain|describe|what\s+is|what\s+are|how\s+does|how\s+do|tell\s+me\s+about|walk\s+me\s+through)\b/i.test(lower) &&
      !/\b(latest|current|2026|2025|recent|news|happening|trending)\b/i.test(lower) &&
      !DATA_SEEKING_PATTERN.test(lower) &&
      wordCount <= 40) {
    return {
      complexity: "simple",
      reasoning: "Technical explanation — direct answer from knowledge",
    };
  }

  // ── Comparison/analysis without needing live data → simple ──
  if (/^(compare|contrast|what\s+are\s+the\s+(pros|differences?|advantages?))\b/i.test(lower) &&
      !/\b(latest|current|2026|2025|price|pricing|cost)\b/i.test(lower) &&
      !DATA_SEEKING_PATTERN.test(lower) &&
      !/\b(app|application|system|software|build|deploy)\b/i.test(lower) &&
      wordCount <= 35) {
    return {
      complexity: "simple",
      reasoning: "Comparison from general knowledge — direct answer",
    };
  }

  // ── Archetype heuristics — detect specific task patterns ──
  // "analyze (this|the|my) data/file/csv/spreadsheet" — actual data processing
  if (/\b(analyze|analyse)\s+(this|the|my|a)?\s*(data|file|csv|spreadsheet|dataset)\b/i.test(lower)) {
    return null; // Let LLM classify — likely data_analysis archetype
  }
  // "review (this|the|my) contract/document/invoice/agreement"
  if (/\b(review|extract|parse|process)\s+(this|the|my|a)?\s*(contract|document|invoice|agreement|lease|report|receipt)\b/i.test(lower)) {
    return null; // Let LLM classify — likely document_processing archetype
  }

  // Pure questions that start with question words
  if (/^(what|who|when|where|why|how|is|are|does|do|can|could|should|would|will)\b/i.test(lower)) {
    // Longer messages with "can you help" / "could you help" etc. are action requests — always LLM
    if (/^(can|could|would|will)\s+you\s+(help|please)\b/i.test(lower) && wordCount > 10) {
      return null; // Let LLM decide — likely an action request
    }
    // Messages with explicit build/code action verbs → let LLM decide (might be one-off)
    if (/\b(build|set up|implement|develop|deploy|configure|refactor)\b/i.test(lower) && wordCount > 8) {
      return null; // Let LLM decide
    }
    // All question-word messages → let LLM decide (may be direct, research, or simple)
    return null;
  }

  // Let LLM handle everything else
  return null;
}

// ── Quality Gate ──

export interface QualityGateResult {
  pass: boolean;
  reason?: "too_short" | "template_detected" | "no_substance";
}

/**
 * Validates a classifier-generated answer before sending to user.
 * Returns { pass: false } if the answer should be escalated to the full agent pipeline.
 */
export function qualityGate(answer: string, userMessage: string): QualityGateResult {
  // 1. Minimum length — answer should be at least 3x the question length (in words)
  const answerWords = answer.split(/\s+/).length;
  const questionWords = userMessage.split(/\s+/).length;
  const minWords = Math.max(30, questionWords * 3);
  if (answerWords < minWords) {
    return { pass: false, reason: "too_short" };
  }

  // 2. Template pattern detection — catch placeholder output
  const templatePatterns = /\[X\]%|\[INSERT\]|\[YOUR[_ ]|\[NAME\b|\[COMPANY\b|\[DATE\b|\[NUMBER\b|___+|\bTBD\b|\bTODO\b|\[PLACEHOLDER\b|\[YEAR\]|\[Concern\b|\[Brief\b|\[Describe\b|\[Specific\b|\[High\/Medium\/Low\]|\[Objective\b|\[Add\s|\[Revenue\b|\[Metric\b|\[Target\b|\[Action\b/i;
  if (templatePatterns.test(answer)) {
    return { pass: false, reason: "template_detected" };
  }

  // 3. Substance check — longer questions need structured answers
  const hasStructure = /^#{1,4}\s|^\s*[-*]\s|^\|.*\|/m.test(answer);
  if (questionWords > 10 && !hasStructure && answerWords < 100) {
    return { pass: false, reason: "no_substance" };
  }

  return { pass: true };
}
