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
  /** Concrete next actions (filled at "clear") */
  nextSteps?: string[];

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
    const dir = dirname(CORTEX_FOCUS_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const lines = [`# Focus Areas`, ``, `Last updated: ${new Date().toISOString()}`, ``];
    for (const area of state.areas) {
      const statusIcon = area.status === "emerging" ? "~" : area.status === "active" ? "●" : "○";
      lines.push(`## ${statusIcon} ${area.title}`);
      lines.push(area.description);
      if (area.intent) lines.push(`**Intent:** ${area.intent}`);
      lines.push(`**Clarity:** ${area.clarity} | **Trend:** ${area.progress.trend}`);
      if (area.evidence.length) lines.push(`**Evidence:** ${area.evidence.slice(0, 3).join("; ")}`);
      if (area.nextSteps?.length) lines.push(`**Next:** ${area.nextSteps.join(", ")}`);
      lines.push(``);
    }
    writeFileSync(CORTEX_FOCUS_PATH, lines.join("\n"), "utf-8");
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

  const prompt = `You are analyzing someone's complete digital footprint to identify their ACTIVE FOCUS AREAS — practical things they're investing time and attention in right now.

Focus areas are diverse and personal. Examples: "Ship a coding project", "Get better at photography", "Learn Mandarin", "Exercise more consistently", "Build investment knowledge", "Explore Korean cinema", "Develop a side business".

They are NOT passive interests — they are areas where the person is ACTIVELY doing something.

## User Profile
${profile || "(not available)"}

## Their Data Inventory
${inventory}

## Strongest Semantic Themes (from AI-enriched entity tags)
${topClusters || "(not yet enriched)"}
${existingContext}

## Task
Identify 4-7 focus areas from this data. For each:

1. **id**: kebab-case slug (e.g., "photography-practice")
2. **title**: 2-5 word label (e.g., "Photography Practice")
3. **description**: One sentence describing what they're doing in this area
4. **status**: "active" (clear ongoing activity) or "emerging" (growing but not yet crystallized)
5. **clarity**: "emerging" (vague interest), "developing" (direction clear), or "clear" (specific goal visible)
6. **intent**: What they might be trying to achieve (your best inference)
7. **confidence**: 0-1 how confident you are this is a real focus
8. **evidence**: 3-5 specific data points from the inventory (titles, project names, channels)
9. **semanticTags**: 2-4 relevant theme tags
10. **trend**: "growing" (increasing activity), "steady" (consistent), or "quiet" (declining/paused)
11. **suggestedActions**: 2-3 concrete next steps. For "emerging" areas, these should be CLARIFYING QUESTIONS to help the user articulate what they want.

Sort by confidence (highest first). Be specific — reference actual titles.

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

They just said: "${userMessage.slice(0, 500)}"

Did they reveal anything that SHARPENS this focus area? Look for:
- A specific goal or outcome they want
- A deadline or timeframe
- Concrete next steps they mentioned
- A correction to the description

Return JSON:
{
  "hasRefinement": true/false,
  "newClarity": "emerging"|"developing"|"clear" (upgrade only, never downgrade),
  "updatedIntent": "..." or null,
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

/** Add a new user-created focus area */
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

  return newArea;
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
    const matched = matchedFocus?.id === a.id ? " ← CURRENT TOPIC" : "";
    return `- ${a.title} [${a.clarity}, ${marker}]: ${a.description}${intentStr}${matched}`;
  });

  let block = `<focus_areas>\nUser's active focus areas (what matters to them right now):\n${lines.join("\n")}`;

  // If current message maps to an emerging focus, suggest clarifying
  if (matchedFocus && matchedFocus.clarity === "emerging") {
    block += `\n\nThe current topic relates to "${matchedFocus.title}" which is still EMERGING. When natural, ask a gentle clarifying question to help the user articulate what they want to achieve in this area.`;
  } else if (matchedFocus && matchedFocus.clarity === "developing") {
    block += `\n\nThe current topic relates to "${matchedFocus.title}". Help the user make concrete progress. Their intent: ${matchedFocus.intent || "(still forming)"}`;
  } else if (matchedFocus && matchedFocus.clarity === "clear") {
    block += `\n\nThe current topic relates to "${matchedFocus.title}". Goal: ${matchedFocus.intent}. Provide focused execution help.${matchedFocus.nextSteps?.length ? ` Planned steps: ${matchedFocus.nextSteps.join(", ")}` : ""}`;
  }

  block += `\n</focus_areas>`;
  return block;
}
