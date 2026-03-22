/**
 * Phase 3: Conversation Pattern Detection (App Suggestions)
 *
 * Detects structured data patterns in agent text responses and suggests
 * app-ification. Two-tier approach:
 *   1. Heuristic fast path (no LLM, ~1ms) — regex for tables, lists, budgets, etc.
 *   2. LLM refinement (background, non-blocking) — Gemini Flash refines with
 *      a specific app family recommendation.
 *
 * Living Apps initiative — Phase 3.
 */

import { logAction, logError } from "./action-log.js";
import { geminiUrl, GEMINI_MODEL_UTILITY } from "./config.js";

// ── Types ──

export type PatternCategory =
  | "table"
  | "list"
  | "budget"
  | "timeline"
  | "comparison"
  | "tracker";

export interface PatternMatch {
  category: PatternCategory;
  confidence: number; // 0-1
  label: string; // "This looks like a budget tracker"
}

export interface AppSuggestion {
  category: PatternCategory;
  label: string;
  suggestedFamily?: string; // e.g. "alpharank", "researcher"
  buildHint?: string; // one-line description for Build App
}

// ── Rate limiting ──

let lastSuggestionTime = 0;
const SUGGESTION_COOLDOWN_MS = 30_000; // 30 seconds

export function canSuggest(): boolean {
  return Date.now() - lastSuggestionTime >= SUGGESTION_COOLDOWN_MS;
}

export function markSuggested(): void {
  lastSuggestionTime = Date.now();
}

// ── Heuristic detectors ──

/**
 * Detect markdown tables: lines with | delimiters and a separator row (|---|---|)
 */
function detectTable(text: string): PatternMatch | null {
  const lines = text.split("\n");
  let pipeRows = 0;
  let hasSeparator = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      pipeRows++;
      if (/^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)+\|$/.test(trimmed)) {
        hasSeparator = true;
      }
    }
  }

  if (hasSeparator && pipeRows >= 4) {
    return {
      category: "table",
      confidence: 0.9,
      label: "This looks like tabular data — view as an interactive table?",
    };
  }

  return null;
}

/**
 * Detect numbered/bulleted lists with 5+ items.
 */
function detectList(text: string): PatternMatch | null {
  const lines = text.split("\n");
  let listItems = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Numbered: "1.", "2)", "1:" or bullet: "- ", "* ", "• "
    if (/^(\d{1,3}[.):]|\s*[-*•])\s+\S/.test(trimmed)) {
      listItems++;
    }
  }

  if (listItems >= 5) {
    const conf = Math.min(0.5 + listItems * 0.05, 0.95);
    return {
      category: "list",
      confidence: conf,
      label: `Found ${listItems} items — turn into an interactive list or dashboard?`,
    };
  }

  return null;
}

/**
 * Detect budget/financial patterns: currency symbols, "cost", "price", "budget", etc.
 */
function detectBudget(text: string): PatternMatch | null {
  const currencyPattern = /(?:\$|€|£|¥)\s?\d[\d,.]+/g;
  const budgetKeywords = /\b(?:budget|cost|price|expense|revenue|profit|income|salary|total|subtotal|tax)\b/gi;

  const currencyMatches = text.match(currencyPattern)?.length ?? 0;
  const keywordMatches = text.match(budgetKeywords)?.length ?? 0;

  if (currencyMatches >= 3 || (currencyMatches >= 1 && keywordMatches >= 2)) {
    return {
      category: "budget",
      confidence: 0.8,
      label: "Financial data detected — track as a budget or expense app?",
    };
  }

  return null;
}

/**
 * Detect timeline/date sequences.
 */
function detectTimeline(text: string): PatternMatch | null {
  // Date patterns: YYYY-MM-DD, MM/DD/YYYY, "January 15", "Jan 2024", etc.
  const datePattern = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(?:,?\s+\d{4})?)\b/g;
  const dateMatches = text.match(datePattern)?.length ?? 0;

  // Also check for sequence words
  const sequenceWords = /\b(?:phase|step|stage|milestone|deadline|schedule|timeline|week\s+\d|day\s+\d|sprint)\b/gi;
  const seqMatches = text.match(sequenceWords)?.length ?? 0;

  if (dateMatches >= 3 || (dateMatches >= 2 && seqMatches >= 2)) {
    return {
      category: "timeline",
      confidence: 0.75,
      label: "Timeline detected — visualize as an interactive timeline?",
    };
  }

  return null;
}

/**
 * Detect comparison structures: "vs", "compared to", "pros/cons", etc.
 */
function detectComparison(text: string): PatternMatch | null {
  const compPatterns = /\b(?:vs\.?|versus|compared\s+to|pros?\s+(?:and|&)\s+cons?|advantages?\s+(?:and|&)\s+disadvantages?|better\s+than|worse\s+than|alternative)\b/gi;
  const matches = text.match(compPatterns)?.length ?? 0;

  // Multiple section headers with similar structures (e.g. Option A / Option B)
  const optionHeaders = /^#{1,3}\s+(?:Option|Choice|Plan|Approach|Solution|Alternative)\s+[A-Za-z0-9]/gm;
  const headerMatches = text.match(optionHeaders)?.length ?? 0;

  if (matches >= 2 || headerMatches >= 2) {
    return {
      category: "comparison",
      confidence: 0.7,
      label: "Comparison detected — create a side-by-side comparison app?",
    };
  }

  return null;
}

/**
 * Detect task/tracker patterns: checkboxes, TODO, status markers, etc.
 */
function detectTracker(text: string): PatternMatch | null {
  const checkboxPattern = /^[\s]*[-*]\s*\[[ xX✓✗]\]/gm;
  const statusPattern = /\b(?:TODO|DONE|IN\s+PROGRESS|PENDING|BLOCKED|COMPLETE[D]?|NOT\s+STARTED)\b/gi;

  const checkboxes = text.match(checkboxPattern)?.length ?? 0;
  const statuses = text.match(statusPattern)?.length ?? 0;

  if (checkboxes >= 3 || statuses >= 3) {
    return {
      category: "tracker",
      confidence: 0.85,
      label: "Task list detected — manage as an interactive tracker?",
    };
  }

  return null;
}

// ── Core API ──

/**
 * Heuristic fast-path pattern detection. Sync, ~1ms.
 * Returns the highest-confidence match, or null.
 */
export function detectPattern(text: string): PatternMatch | null {
  if (!text || text.length < 200) return null;

  const detectors = [
    detectTable,
    detectTracker,
    detectBudget,
    detectTimeline,
    detectComparison,
    detectList,
  ];

  let best: PatternMatch | null = null;
  for (const detect of detectors) {
    const match = detect(text);
    if (match && (!best || match.confidence > best.confidence)) {
      best = match;
    }
  }

  return best;
}

// ── Category → App family mapping (heuristic) ──

const CATEGORY_FAMILY_MAP: Partial<Record<PatternCategory, string>> = {
  // No direct mapping for most — these need LLM refinement or Build App
  // Only map categories to families when there's a clear match
};

/**
 * Build a suggestion from a pattern match. If LLM refinement is available,
 * it can later upgrade the suggestion with a specific family.
 */
export function buildSuggestion(match: PatternMatch): AppSuggestion {
  return {
    category: match.category,
    label: match.label,
    suggestedFamily: CATEGORY_FAMILY_MAP[match.category],
    buildHint: buildHintForCategory(match.category),
  };
}

function buildHintForCategory(category: PatternCategory): string {
  switch (category) {
    case "table":
      return "Interactive sortable/filterable data table";
    case "list":
      return "Interactive list with search, sort, and filtering";
    case "budget":
      return "Budget tracker with charts and totals";
    case "timeline":
      return "Visual timeline with milestones and dates";
    case "comparison":
      return "Side-by-side comparison with scoring";
    case "tracker":
      return "Task board with drag-and-drop status management";
    default:
      return "Interactive app for this content";
  }
}

// ── LLM refinement (background, non-blocking) ──

/**
 * Use Gemini Flash to refine a pattern match with a specific app family
 * recommendation. Fire-and-forget — never blocks text delivery.
 *
 * Returns an updated AppSuggestion with suggestedFamily if the LLM
 * identifies a good match, or the original suggestion unchanged.
 */
export async function refinePatternSuggestion(
  text: string,
  match: PatternMatch,
  apiKey: string,
): Promise<AppSuggestion> {
  const suggestion = buildSuggestion(match);

  try {
    const prompt = `You are an app suggestion engine for Enso, an agentic AI platform where text responses can become interactive apps.

A pattern detector found "${match.category}" content (confidence: ${match.confidence.toFixed(2)}).

Available app families (pick one if it fits, or respond "none"):
- alpharank: Stock market analysis, financial data, portfolios
- filesystem: File browsing, directory management
- web_browser: Web browsing, URL navigation
- researcher: Deep research on any topic in any language, comparisons, city research
- clawhub: Skill store management

Text excerpt (first 500 chars):
${text.slice(0, 500)}

Respond with ONLY a JSON object: { "family": "<family_name>" or "none", "label": "<short suggestion label>" }`;

    const response = await fetch(
      geminiUrl(GEMINI_MODEL_UTILITY, apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 100,
          },
        }),
      },
    );

    if (!response.ok) {
      logError("pattern-detector", `LLM refinement failed: ${response.status}`, null);
      return suggestion;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = rawText.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.family && parsed.family !== "none") {
        suggestion.suggestedFamily = parsed.family;
      }
      if (parsed.label) {
        suggestion.label = parsed.label;
      }
    }

    logAction({
      ts: Date.now(),
      type: "action",
      category: "pattern-detector",
      message: `LLM refined: ${match.category} → family=${suggestion.suggestedFamily ?? "none"}`,
    });
  } catch (err) {
    logError("pattern-detector", "LLM refinement error", err);
  }

  return suggestion;
}
