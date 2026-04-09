/**
 * Focus Areas — AI-inferred priorities synchronized between user and AI.
 *
 * The Cortex contains behavioral signals (books, videos, projects, browsing)
 * that reveal what the user actively cares about. This module:
 *   1. Infers focus areas from Cortex data via LLM
 *   2. Tracks progress through entity index activity
 *   3. Refines focus clarity through conversation signals
 *   4. Provides fast topic→focus mapping for agent context
 *
 * Focus areas are NOT tasks or to-do items. They are practical areas of
 * attention: a project to ship, a skill to develop, a hobby to deepen,
 * a health habit to build. They synchronize user and AI on "what matters."
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export interface FocusArea {
  id: string;
  title: string;
  description: string;
  status: "active" | "paused" | "completed" | "emerging";

  /** How well-defined is this focus? */
  clarity: "emerging" | "developing" | "clear";

  /** What the user wants to achieve (filled as clarity increases) */
  intent?: string;
  /** The deeper WHY behind this focus — what drives it at a personal level */
  deeperIntent?: string;
  /** Adjacent pursuits the AI suggests based on the deeper intention */
  adjacentPursuits?: string[];
  /** Concrete next actions (filled at "clear") */
  nextSteps?: string[];
  /** Dedicated conversation ID for this focus area */
  conversationId?: string;

  confidence: number;
  evidence: string[];
  relatedEntityIds: string[];
  semanticTags: string[];

  progress: {
    trend: "growing" | "steady" | "quiet";
    recentActivity: string[];
    lastActiveAt: string;
  };

  refinements: Array<{
    date: string;
    source: "inference" | "conversation" | "user_edit";
    change: string;
  }>;

  suggestedActions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FocusState {
  areas: FocusArea[];
  lastInferredAt: string;
  lastRefreshedAt: string;
  version: number;
}

// ── Paths ──

const ENSO_HOME = join(homedir(), ".enso");
const FOCUS_PATH = join(ENSO_HOME, "data", "focus-areas.json");
const CORTEX_FOCUS_PATH = join(ENSO_HOME, "wiki", "synthesis", "focus-areas.md");

// ── Persistence ──

let _cachedState: FocusState | null = null;

export function loadFocusState(): FocusState | null {
  if (_cachedState) return _cachedState;
  try {
    if (existsSync(FOCUS_PATH)) {
      _cachedState = JSON.parse(readFileSync(FOCUS_PATH, "utf-8")) as FocusState;
      return _cachedState;
    }
  } catch (err) {
    logError("focus-areas", "Failed to load focus state", err);
  }
  return null;
}

function saveFocusState(state: FocusState): void {
  try {
    const dir = dirname(FOCUS_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(FOCUS_PATH, JSON.stringify(state, null, 2), "utf-8");
    _cachedState = state;

    // Also write to Cortex for agent access
    writeFocusToCortex(state);
  } catch (err) {
    logError("focus-areas", "Failed to save focus state", err);
  }
}

function writeFocusToCortex(state: FocusState): void {
  try {
    // Write summary page
    const synthDir = dirname(CORTEX_FOCUS_PATH);
    if (!existsSync(synthDir)) mkdirSync(synthDir, { recursive: true });

    const summaryLines = [`# Focus Areas`, ``, `Last updated: ${new Date().toISOString()}`, ``];
    for (const area of state.areas) {
      const statusIcon = area.status === "emerging" ? "~" : area.status === "active" ? "●" : "○";
      summaryLines.push(`## ${statusIcon} ${area.title}`);
      summaryLines.push(area.description);
      if (area.intent) summaryLines.push(`**Intent:** ${area.intent}`);
      summaryLines.push(`**Clarity:** ${area.clarity} | **Trend:** ${area.progress.trend}`);
      summaryLines.push(`See: [[focuses/${area.id}]]`);
      summaryLines.push(``);
    }
    writeFileSync(CORTEX_FOCUS_PATH, summaryLines.join("\n"), "utf-8");

    // Write per-goal pages in focuses/ directory
    const focusDir = join(ENSO_HOME, "wiki", "focuses");
    if (!existsSync(focusDir)) mkdirSync(focusDir, { recursive: true });

    for (const area of state.areas) {
      const pagePath = join(focusDir, `${area.id}.md`);
      const lines = [
        `# ${area.title}`,
        ``,
        area.description,
        ``,
        `## Status`,
        `- **Status:** ${area.status}`,
        `- **Clarity:** ${area.clarity}`,
        `- **Confidence:** ${Math.round(area.confidence * 100)}%`,
        `- **Trend:** ${area.progress.trend}`,
        `- **Last active:** ${area.progress.lastActiveAt}`,
        ``,
      ];
      if (area.intent) {
        lines.push(`## Intent`, ``, area.intent, ``);
      }
      if (area.deeperIntent) {
        lines.push(`## Deeper Motivation`, ``, area.deeperIntent, ``);
      }
      if (area.adjacentPursuits?.length) {
        lines.push(`## Adjacent Pursuits`, ``);
        for (const p of area.adjacentPursuits) lines.push(`- ${p}`);
        lines.push(``);
      }
      if (area.nextSteps?.length) {
        lines.push(`## Next Steps`, ``);
        for (const step of area.nextSteps) lines.push(`- ${step}`);
        lines.push(``);
      }
      lines.push(`## Evidence`, ``);
      for (const ev of area.evidence) lines.push(`- ${ev}`);
      lines.push(``);
      if (area.semanticTags.length) {
        lines.push(`## Related Themes`, ``, `Tags: ${area.semanticTags.join(", ")}`, ``);
      }
      if (area.refinements.length) {
        lines.push(`## Refinement History`, ``);
        for (const r of area.refinements.slice(-5)) {
          lines.push(`- ${r.date.slice(0, 10)} [${r.source}]: ${r.change}`);
        }
        lines.push(``);
      }
      if (area.suggestedActions.length) {
        lines.push(`## Suggested Actions`, ``);
        for (const a of area.suggestedActions) lines.push(`- ${a}`);
      }
      writeFileSync(pagePath, lines.join("\n"), "utf-8");
    }
  } catch { /* best effort */ }
}

// ── Inference ──

/**
 * Infer focus areas from the user's complete Cortex data.
 * Uses LLM to analyze behavioral signals and propose areas of focus.
 * Cost: ~$0.01 per call (utility tier).
 */
export async function inferFocusAreas(): Promise<FocusState> {
  const { llm } = await import("./llm.js");
  const { buildDataInventory } = await import("./cortex-synthesis.js");
  const { getEntityIndex } = await import("./entity-model.js");

  // Gather all signals
  const inventory = buildDataInventory(5000);
  const entityIndex = getEntityIndex();

  // Compute semantic tag clusters (what themes are strongest?)
  const tagClusters: Record<string, { count: number; sources: Set<string>; entities: string[] }> = {};
  for (const [, entry] of entityIndex) {
    for (const tag of entry.semanticTags || []) {
      if (!tagClusters[tag]) tagClusters[tag] = { count: 0, sources: new Set(), entities: [] };
      tagClusters[tag].count++;
      tagClusters[tag].sources.add(entry.source);
      if (tagClusters[tag].entities.length < 3) tagClusters[tag].entities.push(entry.title);
    }
  }
  const topClusters = Object.entries(tagClusters)
    .filter(([, d]) => d.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([tag, d]) => `${tag} (${d.count} items across ${[...d.sources].join("+")}): ${d.entities.join(", ")}`)
    .join("\n");

  // Read user profile if available
  const profilePath = join(ENSO_HOME, "wiki", "synthesis", "user-profile.md");
  const profile = existsSync(profilePath) ? readFileSync(profilePath, "utf-8").slice(0, 1500) : "";

  // Read existing focus areas (for continuity)
  const existing = loadFocusState();
  const existingContext = existing?.areas.length
    ? `\n\nPreviously identified focus areas (maintain continuity, update rather than replace):\n${existing.areas.map(a => `- ${a.title}: ${a.description} [${a.clarity}, ${a.progress.trend}]`).join("\n")}`
    : "";

  const prompt = `You are analyzing someone's complete digital footprint to identify their ACTIVE FOCUS AREAS — concrete goals and outcomes they're working toward.

CRITICAL: Focus areas must be OUTCOME-ORIENTED, not vague categories.
- BAD: "Full-Stack Development" (too vague — a skill category, not a goal)
- GOOD: "Develop Enso into a truly useful personal AI assistant" (specific project + outcome)
- BAD: "Quantitative Finance" (passive interest label)
- GOOD: "Build AlphaRank into a quant tool that consistently outperforms S&P 500" (specific project + measurable outcome)
- BAD: "Photography" (vague hobby)
- GOOD: "Develop a documentary street photography practice" (specific style + intent)

Each focus area should answer: "What is this person trying to ACHIEVE?" — not just "What category are they interested in?"

## User Profile
${profile || "(not available)"}

## Their Data Inventory
${inventory}

## Strongest Semantic Themes (from AI-enriched entity tags)
${topClusters || "(not yet enriched)"}
${existingContext}

## Task
Identify 4-7 concrete focus areas from this data. For each:

1. **id**: kebab-case slug (e.g., "build-alpharank-quant-tool")
2. **title**: Concrete outcome statement (e.g., "Build AlphaRank into a Market-Beating Quant Tool")
3. **description**: One sentence describing the GOAL — what success looks like
4. **status**: "active" (clear ongoing activity) or "emerging" (growing but not yet crystallized)
5. **clarity**: "emerging" (intent unclear), "developing" (direction clear, specifics forming), or "clear" (concrete goal visible)
6. **intent**: The specific outcome they're working toward
7. **deeperIntent**: The deeper WHY — what drives this person at a personal level? What need does this goal serve? Think about: financial freedom, creative expression, intellectual mastery, career advancement, personal fulfillment, family/legacy, independence, proving a thesis, building something meaningful. Be specific and insightful — go beyond the surface. Example: for AlphaRank, the deeper intent might be "Achieving financial independence through systematic, data-driven investing — removing emotional decision-making from wealth building."
8. **adjacentPursuits**: 1-2 related areas the person HASN'T explored yet that would naturally complement this focus if the deeper intent is correct. These are suggestions for EXPANDING their horizon. Example: if deeper intent is financial independence, adjacent pursuits might be "Tax optimization strategies for systematic traders" or "Building passive income streams beyond equity markets."
9. **confidence**: 0-1 how confident you are this is a real focus
10. **evidence**: 3-5 specific data points from the inventory (actual titles, project names, channel names)
11. **semanticTags**: 2-4 relevant theme tags
12. **trend**: "growing" (increasing activity), "steady" (consistent), or "quiet" (declining/paused)
13. **suggestedActions**: 2-3 concrete next steps. For "emerging" areas, these should be CLARIFYING QUESTIONS including WHY questions to understand the deeper motivation.

When a project exists (like Enso, AlphaRank), make the focus about that PROJECT's goal, not the generic skill category.

Sort by confidence (highest first). Be specific — reference actual titles. Be deeply insightful about the WHY.

Return JSON: { "areas": [ { ... } ] }`;

  try {
    const response = await llm({
      prompt,
      tier: "utility",
      maxOutputTokens: 4000,
      responseMimeType: "application/json",
      temperature: 0.4,
      timeoutMs: 90_000,
    });

    const parsed = JSON.parse(response) as { areas: Array<Record<string, unknown>> };
    const now = new Date().toISOString();

    const areas: FocusArea[] = (parsed.areas || []).map((raw) => ({
      id: String(raw.id || "").toLowerCase().replace(/\s+/g, "-").slice(0, 50),
      title: String(raw.title || ""),
      description: String(raw.description || ""),
      status: (raw.status === "emerging" ? "emerging" : "active") as FocusArea["status"],
      clarity: (["emerging", "developing", "clear"].includes(String(raw.clarity)) ? raw.clarity : "emerging") as FocusArea["clarity"],
      intent: raw.intent ? String(raw.intent) : undefined,
      deeperIntent: raw.deeperIntent ? String(raw.deeperIntent) : undefined,
      adjacentPursuits: Array.isArray(raw.adjacentPursuits) ? raw.adjacentPursuits.map(String).slice(0, 3) : undefined,
      nextSteps: undefined,
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
      evidence: Array.isArray(raw.evidence) ? raw.evidence.map(String).slice(0, 5) : [],
      relatedEntityIds: [],
      semanticTags: Array.isArray(raw.semanticTags) ? raw.semanticTags.map(String) : [],
      progress: {
        trend: (["growing", "steady", "quiet"].includes(String(raw.trend)) ? raw.trend : "steady") as FocusArea["progress"]["trend"],
        recentActivity: [],
        lastActiveAt: now,
      },
      refinements: [{
        date: now,
        source: "inference" as const,
        change: "Initial inference from Cortex data",
      }],
      suggestedActions: Array.isArray(raw.suggestedActions) ? raw.suggestedActions.map(String).slice(0, 3) : [],
      createdAt: now,
      updatedAt: now,
    }));

    // Merge with existing state (preserve user edits and refinement history)
    if (existing?.areas.length) {
      for (const area of areas) {
        const prev = existing.areas.find(a => a.id === area.id);
        if (prev) {
          // Preserve user-driven data
          area.refinements = [...prev.refinements, ...area.refinements];
          area.createdAt = prev.createdAt;
          if (prev.clarity === "clear" && area.clarity !== "clear") area.clarity = prev.clarity;
          if (prev.intent) area.intent = prev.intent;
          if (prev.deeperIntent) area.deeperIntent = prev.deeperIntent;
          if (prev.adjacentPursuits) area.adjacentPursuits = prev.adjacentPursuits;
          if (prev.nextSteps) area.nextSteps = prev.nextSteps;
          if (prev.status === "paused") area.status = "paused";
        }
      }
    }

    const state: FocusState = {
      areas,
      lastInferredAt: now,
      lastRefreshedAt: now,
      version: (existing?.version ?? 0) + 1,
    };

    saveFocusState(state);

    logAction({
      ts: Date.now(), type: "action", category: "focus-areas",
      message: `Inferred ${areas.length} focus areas (${areas.filter(a => a.status === "active").length} active, ${areas.filter(a => a.status === "emerging").length} emerging)`,
    });

    return state;
  } catch (err) {
    logError("focus-areas", "Focus inference failed", err);
    throw err;
  }
}

// ── Progress Refresh (zero LLM) ──

/**
 * Lightweight daily update — check entity activity per focus area.
 * Zero LLM cost. Updates trends and recent activity.
 */
export async function refreshFocusProgress(): Promise<FocusState | null> {
  const state = loadFocusState();
  if (!state?.areas.length) return null;

  try {
    const { getEntityIndex } = await import("./entity-model.js");
    const entityIndex = getEntityIndex();

    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    for (const area of state.areas) {
      // Find entities matching this focus area's semantic tags
      const matchingEntities: Array<{ title: string; updatedAt: string }> = [];
      for (const [, entry] of entityIndex) {
        const entryTags = new Set(entry.semanticTags || []);
        const overlap = area.semanticTags.filter(t => entryTags.has(t));
        if (overlap.length >= 1) {
          matchingEntities.push({ title: entry.title, updatedAt: entry.updatedAt || "" });
        }
      }

      // Check recent activity
      const recent = matchingEntities
        .filter(e => e.updatedAt > twoWeeksAgo)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3);

      area.progress.recentActivity = recent.map(e => e.title);

      if (recent.length > 0) {
        area.progress.lastActiveAt = recent[0].updatedAt;
      }

      // Update trend
      if (recent.length >= 3) {
        area.progress.trend = "growing";
      } else if (recent.length >= 1) {
        area.progress.trend = "steady";
      } else {
        area.progress.trend = "quiet";
      }
    }

    state.lastRefreshedAt = now.toISOString();
    saveFocusState(state);
    return state;
  } catch (err) {
    logError("focus-areas", "Focus progress refresh failed", err);
    return state;
  }
}

// ── Activity Mapping (zero LLM) ──

/**
 * Fast mapping: given a user message, which focus area does it relate to?
 * Returns the focus area ID or null. Zero LLM, <1ms.
 */
export function mapActivityToFocus(message: string): FocusArea | null {
  const state = loadFocusState();
  if (!state?.areas.length) return null;

  const words = message.toLowerCase().split(/\s+/);
  let bestMatch: FocusArea | null = null;
  let bestScore = 0;

  for (const area of state.areas) {
    if (area.status === "completed" || area.status === "paused") continue;

    let score = 0;
    const targets = [
      area.title.toLowerCase(),
      area.description.toLowerCase(),
      area.intent?.toLowerCase() || "",
      ...area.semanticTags,
    ].join(" ");

    for (const word of words) {
      if (word.length < 3) continue;
      if (targets.includes(word)) score++;
    }

    // Bonus for title match
    const titleWords = area.title.toLowerCase().split(/\s+/);
    for (const tw of titleWords) {
      if (words.includes(tw)) score += 2;
    }

    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = area;
    }
  }

  return bestMatch;
}

// ── Conversational Refinement ──

/**
 * After a conversation related to a focus area, check if the user
 * provided signals that refine the focus (goals, deadlines, specifics).
 * Uses LLM fast tier — only called when conversation maps to a focus.
 */
export async function refineFocusFromConversation(
  focusId: string,
  userMessage: string,
  agentResponse: string,
): Promise<void> {
  const state = loadFocusState();
  if (!state) return;

  const area = state.areas.find(a => a.id === focusId);
  if (!area) return;

  try {
    const { llm } = await import("./llm.js");

    const prompt = `A user has a focus area: "${area.title}" (currently: ${area.clarity}).
Current description: "${area.description}"
${area.intent ? `Current intent: "${area.intent}"` : "No clear intent yet."}
${area.deeperIntent ? `Current deeper motivation: "${area.deeperIntent}"` : "Deeper motivation not yet understood."}

They just said: "${userMessage.slice(0, 500)}"

Did they reveal anything that SHARPENS this focus area? Look for:
- A specific goal or outcome they want (intent)
- The deeper WHY — what personal need drives this? (financial freedom, creative expression, intellectual mastery, career growth, proving a thesis, building legacy, personal fulfillment)
- A deadline or timeframe
- Concrete next steps they mentioned
- A correction to the description
- Adjacent interests that connect to the deeper motivation

Return JSON:
{
  "hasRefinement": true/false,
  "newClarity": "emerging"|"developing"|"clear" (upgrade only, never downgrade),
  "updatedIntent": "..." or null,
  "deeperIntent": "..." or null (the WHY — only if the user revealed personal motivation),
  "adjacentPursuits": ["..."] or null (new pursuits suggested based on deeper intent),
  "nextSteps": ["..."] or null,
  "change": "brief description of what changed"
}

If nothing changed, return { "hasRefinement": false }.`;

    const response = await llm({
      prompt,
      tier: "fast",
      maxOutputTokens: 500,
      responseMimeType: "application/json",
      temperature: 0.2,
    });

    const result = JSON.parse(response) as {
      hasRefinement: boolean;
      newClarity?: string;
      updatedIntent?: string;
      deeperIntent?: string;
      adjacentPursuits?: string[];
      nextSteps?: string[];
      change?: string;
    };

    if (!result.hasRefinement) return;

    const now = new Date().toISOString();
    const clarityOrder = ["emerging", "developing", "clear"];

    if (result.newClarity && clarityOrder.indexOf(result.newClarity) > clarityOrder.indexOf(area.clarity)) {
      area.clarity = result.newClarity as FocusArea["clarity"];
    }
    if (result.updatedIntent) area.intent = result.updatedIntent;
    if (result.deeperIntent) area.deeperIntent = result.deeperIntent;
    if (result.adjacentPursuits?.length) area.adjacentPursuits = result.adjacentPursuits;
    if (result.nextSteps?.length) area.nextSteps = result.nextSteps;
    area.updatedAt = now;
    area.refinements.push({
      date: now,
      source: "conversation",
      change: result.change || "Refined from conversation",
    });

    saveFocusState(state);

    logAction({
      ts: Date.now(), type: "action", category: "focus-areas",
      message: `Refined focus "${area.title}": ${result.change || "conversation update"}`,
    });
  } catch (err) {
    logError("focus-areas", `Refinement failed for "${area.title}"`, err);
  }
}

// ── User Edits ──

/** Update a focus area from user input (title, description, status, etc.) */
export function updateFocusArea(focusId: string, updates: Partial<FocusArea>): FocusArea | null {
  const state = loadFocusState();
  if (!state) return null;

  const area = state.areas.find(a => a.id === focusId);
  if (!area) return null;

  const now = new Date().toISOString();
  const changes: string[] = [];

  if (updates.title && updates.title !== area.title) {
    changes.push(`title: "${area.title}" → "${updates.title}"`);
    area.title = updates.title;
  }
  if (updates.description && updates.description !== area.description) {
    changes.push(`description updated`);
    area.description = updates.description;
  }
  if (updates.status && updates.status !== area.status) {
    changes.push(`status: ${area.status} → ${updates.status}`);
    area.status = updates.status;
  }
  if (updates.intent) {
    changes.push(`intent set: "${updates.intent}"`);
    area.intent = updates.intent;
  }
  if (updates.nextSteps) {
    area.nextSteps = updates.nextSteps;
    changes.push(`next steps updated`);
  }
  if (updates.deeperIntent) {
    changes.push(`deeper intent updated`);
    area.deeperIntent = updates.deeperIntent;
  }
  // conversationId is a silent update — no refinement log needed
  if (updates.conversationId && updates.conversationId !== area.conversationId) {
    area.conversationId = updates.conversationId;
  }

  if (changes.length > 0) {
    area.updatedAt = now;
    area.refinements.push({
      date: now,
      source: "user_edit",
      change: changes.join("; "),
    });
    saveFocusState(state);
  }

  return area;
}

/** Add a new user-created focus area. Saves immediately, then enriches async via LLM + Cortex. */
export function addFocusArea(area: { title: string; description: string; intent?: string }): FocusArea {
  let state = loadFocusState();
  if (!state) {
    state = { areas: [], lastInferredAt: "", lastRefreshedAt: "", version: 0 };
  }

  const now = new Date().toISOString();
  const newArea: FocusArea = {
    id: area.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50),
    title: area.title,
    description: area.description,
    status: "active",
    clarity: area.intent ? "developing" : "emerging",
    intent: area.intent,
    confidence: 1.0, // user-created = max confidence
    evidence: ["User-created focus area"],
    relatedEntityIds: [],
    semanticTags: [],
    progress: { trend: "steady", recentActivity: [], lastActiveAt: now },
    refinements: [{ date: now, source: "user_edit", change: "Created by user" }],
    suggestedActions: [],
    createdAt: now,
    updatedAt: now,
  };

  state.areas.push(newArea);
  state.version++;
  saveFocusState(state);

  // Fire-and-forget: enrich via LLM + Cortex (logged errors, never throws to caller)
  enrichNewFocusArea(newArea.id).catch(err => {
    logError("focus-areas", `Background enrichment failed for "${newArea.title}"`, err);
  });

  return newArea;
}

/**
 * Enrich a newly created focus area using LLM + Cortex data.
 * Analyzes the user's title/description, cross-references with the full
 * data inventory, and fills in: deeperIntent, evidence, semanticTags,
 * adjacentPursuits, suggestedActions, and refined clarity.
 */
/** Re-enrich a focus area after edits. Exported for API use. */
export async function enrichFocusArea(focusId: string): Promise<FocusArea | null> {
  await enrichNewFocusArea(focusId);
  const state = loadFocusState();
  return state?.areas.find(a => a.id === focusId) ?? null;
}

async function enrichNewFocusArea(focusId: string): Promise<void> {
  const state = loadFocusState();
  if (!state) return;
  const area = state.areas.find(a => a.id === focusId);
  if (!area) return;

  try {
    const { llm } = await import("./llm.js");
    const { buildDataInventory } = await import("./cortex-synthesis.js");
    const { findRelatedContent } = await import("./cortex-synthesis.js");

    // Find what the Cortex already knows about this topic
    const related = findRelatedContent(area.title, 5);
    const relatedHits = related.hits.slice(0, 10).map(h => `- "${h.title}" [${h.source}]`).join("\n");
    const cortexPages = related.cortexPages.slice(0, 5).map(p => `- "${p.title}" (${p.path})`).join("\n");

    // Get compact data inventory for context
    const inventory = buildDataInventory(3000);

    const prompt = `A user just defined a new focus area. Analyze it and enrich it with deeper understanding using their personal data.

## User's Focus Area
- **Title**: "${area.title}"
- **Description**: "${area.description}"
${area.intent ? `- **Intent**: "${area.intent}"` : ""}

## Matching Items Already in Their Data
${relatedHits || "(no direct matches found)"}

## Matching Cortex Pages
${cortexPages || "(none)"}

## Their Full Data Inventory
${inventory}

## Task
Analyze this focus area in the context of their data and return:

1. **deeperIntent**: What is the deeper personal motivation behind this focus? Why does it matter to them? Infer from their data patterns. Be specific and insightful.
2. **evidence**: 3-5 specific items from their data inventory that are relevant to this focus (actual titles, project names, book titles, channel names).
3. **semanticTags**: 3-5 theme tags that connect this focus to their broader knowledge (e.g., "artificial-intelligence", "creative-expression").
4. **adjacentPursuits**: 2-3 related areas they haven't explored that would complement this focus, based on their deeper motivation.
5. **suggestedActions**: 2-3 concrete next steps to make progress on this focus. Be specific to their situation.
6. **clarity**: "emerging" (vague), "developing" (direction clear), or "clear" (specific goal visible) — assess based on how specific their title/description is.
7. **refinedDescription**: If the description could be more outcome-oriented, suggest a better one. Otherwise return null.

Return JSON:
{
  "deeperIntent": "...",
  "evidence": ["..."],
  "semanticTags": ["..."],
  "adjacentPursuits": ["..."],
  "suggestedActions": ["..."],
  "clarity": "...",
  "refinedDescription": "..." or null
}`;

    const response = await llm({
      prompt,
      tier: "fast",
      maxOutputTokens: 1500,
      responseMimeType: "application/json",
      temperature: 0.3,
      timeoutMs: 30_000,
    });

    const result = JSON.parse(response) as {
      deeperIntent?: string;
      evidence?: string[];
      semanticTags?: string[];
      adjacentPursuits?: string[];
      suggestedActions?: string[];
      clarity?: string;
      refinedDescription?: string;
    };

    const now = new Date().toISOString();
    const changes: string[] = [];

    if (result.deeperIntent) { area.deeperIntent = result.deeperIntent; changes.push("deeper intent inferred"); }
    if (result.evidence?.length) { area.evidence = result.evidence; changes.push(`${result.evidence.length} evidence points found`); }
    if (result.semanticTags?.length) { area.semanticTags = result.semanticTags; changes.push("semantic tags added"); }
    if (result.adjacentPursuits?.length) { area.adjacentPursuits = result.adjacentPursuits; changes.push("adjacent pursuits suggested"); }
    if (result.suggestedActions?.length) { area.suggestedActions = result.suggestedActions; }
    if (result.clarity && ["emerging", "developing", "clear"].includes(result.clarity)) {
      area.clarity = result.clarity as FocusArea["clarity"];
    }
    if (result.refinedDescription && result.refinedDescription !== area.description) {
      area.description = result.refinedDescription;
      changes.push("description refined");
    }

    if (changes.length > 0) {
      area.updatedAt = now;
      area.refinements.push({
        date: now,
        source: "inference",
        change: `AI enrichment: ${changes.join(", ")}`,
      });
      saveFocusState(state);

      logAction({
        ts: Date.now(), type: "action", category: "focus-areas",
        message: `Enriched new focus "${area.title}": ${changes.join(", ")}`,
      });
    }
  } catch (err) {
    logError("focus-areas", `Failed to enrich focus "${area.title}"`, err);
  }
}

// ── Context for Agent ──

/**
 * Get a compact context block about focus areas for agent prompts.
 * Returns empty string if no focus areas exist.
 */
export function getFocusContextForAgent(userMessage?: string): string {
  const state = loadFocusState();
  if (!state?.areas.length) return "";

  const active = state.areas.filter(a => a.status === "active" || a.status === "emerging");
  if (active.length === 0) return "";

  // Check if current message maps to a specific focus
  const matchedFocus = userMessage ? mapActivityToFocus(userMessage) : null;

  const lines = active.map(a => {
    const marker = a.status === "emerging" ? "~emerging" : `${a.progress.trend}`;
    const intentStr = a.intent ? ` → ${a.intent}` : "";
    const deeperStr = a.deeperIntent ? ` (WHY: ${a.deeperIntent})` : "";
    const matched = matchedFocus?.id === a.id ? " ← CURRENT TOPIC" : "";
    return `- ${a.title} [${a.clarity}, ${marker}]: ${a.description}${intentStr}${deeperStr}${matched}`;
  });

  let block = `<focus_areas>\nUser's active focus areas (what matters to them right now):\n${lines.join("\n")}`;

  // If current message maps to an emerging focus, suggest clarifying
  if (matchedFocus && matchedFocus.clarity === "emerging") {
    block += `\n\nThe current topic relates to "${matchedFocus.title}" which is still EMERGING. Ask gentle clarifying questions — both WHAT they want to achieve AND WHY it matters to them personally. Understanding the deeper motivation helps you provide better guidance.`;
  } else if (matchedFocus && matchedFocus.clarity === "developing") {
    const deeperCtx = matchedFocus.deeperIntent ? `\nDeeper motivation: ${matchedFocus.deeperIntent}` : "\nThe deeper WHY isn't clear yet — when natural, explore what drives this focus.";
    const adjacentCtx = matchedFocus.adjacentPursuits?.length ? `\nAdjacent pursuits to consider: ${matchedFocus.adjacentPursuits.join("; ")}` : "";
    block += `\n\nThe current topic relates to "${matchedFocus.title}". Help the user make concrete progress.${deeperCtx}${adjacentCtx}`;
  } else if (matchedFocus && matchedFocus.clarity === "clear") {
    const deeperCtx = matchedFocus.deeperIntent ? ` Deeper drive: ${matchedFocus.deeperIntent}.` : "";
    const adjacentCtx = matchedFocus.adjacentPursuits?.length ? ` Also consider suggesting: ${matchedFocus.adjacentPursuits.join("; ")}` : "";
    block += `\n\nThe current topic relates to "${matchedFocus.title}". Goal: ${matchedFocus.intent}.${deeperCtx} Provide focused execution help.${matchedFocus.nextSteps?.length ? ` Planned steps: ${matchedFocus.nextSteps.join(", ")}` : ""}${adjacentCtx}`;
  }

  block += `\n</focus_areas>`;
  return block;
}

// ── Plan Generation for Orchestration ──

/**
 * Generate an orchestration goal prompt for a focus area.
 * Returns a string the client can use with orchestration.start.
 */
export function generateFocusPlan(focusId: string): { goal: string; focusTitle: string } | null {
  const state = loadFocusState();
  if (!state) return null;

  const area = state.areas.find(a => a.id === focusId);
  if (!area) return null;

  const evidenceStr = area.evidence.slice(0, 5).map(e => `- ${e}`).join("\n");
  const tagsStr = area.semanticTags.join(", ");

  const goal = `Analyze my focus area "${area.title}" and create a practical, actionable plan to make meaningful progress.

## Focus Area Details
- **Title**: ${area.title}
- **Description**: ${area.description}
- **Intent**: ${area.intent || "(still forming — help me clarify this)"}
- **Deeper motivation**: ${area.deeperIntent || "(not yet understood — help me explore this)"}
- **Current clarity**: ${area.clarity}
- **Activity trend**: ${area.progress.trend}
- **Related themes**: ${tagsStr}

## Evidence (what I've been doing)
${evidenceStr}
${area.adjacentPursuits?.length ? `\n## Adjacent Pursuits (AI-suggested expansions)\n${area.adjacentPursuits.map(p => `- ${p}`).join("\n")}` : ""}

## What I Need
1. **Gap analysis**: What knowledge, skills, or resources am I missing to advance this goal?
2. **Action plan**: 3-5 concrete next steps I can take THIS WEEK
3. **Deeper pursuit**: Given my deeper motivation${area.deeperIntent ? ` ("${area.deeperIntent}")` : ""}, what adjacent areas should I explore that I haven't considered?
4. **Enso capabilities**: What Enso tools (research, Cortex, apps, scheduled tasks) can help?
5. **Milestones**: Propose 3-4 milestones toward the goal
6. **Research needs**: What should I research to fill knowledge gaps?

Be specific and actionable. Reference my actual data. Consider the DEEPER motivation when suggesting directions — the surface goal may be building a tool, but the deeper drive shapes what kind of tool and how to approach it.`;

  return { goal, focusTitle: area.title };
}

// ── Focus Area Activity Detail ──

/**
 * Get relevant entities for a focus area using LLM analysis.
 * First does a fast keyword pre-filter, then uses LLM to judge relevance
 * and explain why each entity matters to the focus.
 */
export async function getFocusAreaActivity(focusId: string): Promise<{
  entities: Array<{ title: string; source: string; type: string; updatedAt: string; matchReason: string }>;
  total: number;
} | null> {
  const state = loadFocusState();
  if (!state) return null;

  const area = state.areas.find(a => a.id === focusId);
  if (!area) return null;

  try {
    const { llm } = await import("./llm.js");
    const { getEntityIndex } = await import("./entity-model.js");
    const entityIndex = getEntityIndex();

    // Build a compact inventory of all entities for LLM to judge
    const entityList: string[] = [];
    const entityLookup: Array<{ title: string; source: string; type: string; updatedAt: string }> = [];
    let idx = 0;
    for (const [, entry] of entityIndex) {
      if (idx >= 100) break; // cap for prompt size
      const tags = entry.semanticTags?.length ? ` [${entry.semanticTags.slice(0, 3).join(",")}]` : "";
      entityList.push(`${idx}: "${entry.title}" (${entry.source}, ${entry.type})${tags}`);
      entityLookup.push({ title: entry.title, source: entry.source, type: entry.type, updatedAt: entry.updatedAt || "" });
      idx++;
    }

    const prompt = `Given this focus area:
- **Title**: "${area.title}"
- **Description**: "${area.description}"
- **Intent**: "${area.intent || area.description}"
- **Deeper motivation**: "${area.deeperIntent || "(not set)"}"

Select the items from this inventory that are RELEVANT to this focus area. Think broadly — a book, a game, a YouTube channel, a project, or a movie can all be relevant if they connect to the focus's goal, theme, or deeper motivation.

## Inventory
${entityList.join("\n")}

Return JSON: { "matches": [{ "idx": <number>, "reason": "<brief 5-10 word explanation>" }] }
Select 10-30 most relevant items. Be inclusive but meaningful — don't force weak connections.`;

    const response = await llm({
      prompt,
      tier: "fast",
      maxOutputTokens: 4000,
      responseMimeType: "application/json",
      temperature: 0.2,
      timeoutMs: 45_000,
    });

    const parsed = JSON.parse(response) as { matches: Array<{ idx: number; reason: string }> };
    const results = (parsed.matches || [])
      .filter(m => typeof m.idx === "number" && m.idx >= 0 && m.idx < entityLookup.length)
      .map(m => ({
        ...entityLookup[m.idx],
        matchReason: m.reason || "relevant",
      }));

    return { entities: results, total: results.length };
  } catch (err) {
    logError("focus-areas", `Activity fetch failed for "${area.title}"`, err);
    return { entities: [], total: 0 };
  }
}
