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
import { cleanJson } from "./json-utils.js";
import type { TeamAgent } from "./project-manager.js";

// ── Types ──

export type FocusType = "project" | "creative" | "learning" | "lifestyle" | "general";

export interface FocusArea {
  id: string;
  title: string;
  description: string;
  status: "active" | "paused" | "completed" | "emerging";

  /** Focus type — determines available capabilities */
  focusType?: FocusType;
  /** For project-type focuses: path to the codebase */
  codebasePath?: string;
  /** For project-type focuses: linked project ID */
  projectId?: string;
  /** Domain experts generated for this focus area */
  experts?: TeamAgent[];

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

  /** @deprecated Use assessment instead. Kept for backward compat during migration. */
  confidence?: number;

  /** TL's assessment of this focus area — updated after each examination */
  assessment?: {
    /** How well the TL understands this goal (0-100). Jumps after evaluations. */
    understanding: number;
    /** How far the focus is toward its goal (0-100). Moves after sprints/deliverables. */
    progress: number;
    /** When the assessment was last updated */
    assessedAt: string;
    /** Who updated it — "inference" | "tl-evaluate" | "tl-sprint-review" | "tl-morning" */
    assessedBy: string;
    /** Brief note on the assessment */
    notes: string;
  };

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

  /** Comprehensive briefing from the "Prepare" phase — injected into focus chat context */
  preparedBriefing?: string;
  /** When the briefing was last prepared */
  preparedAt?: string;
  /** Results from the last evolution sprint — carried into next Evaluate cycle */
  lastSprintResults?: string;
  /** When the last sprint completed */
  lastSprintDate?: string;
  /** Structured summary from the last evolution sprint — maps deliverables to pain points */
  lastSprintSummary?: import("../../shared/types.js").SprintResultsSummary;
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

export function clearFocusCache(): void {
  _cachedState = null;
}

export function saveFocusState(state: FocusState): void {
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

    // Write per-goal pages — comprehensive living documents
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
        `- **Clarity:** ${area.clarity}`,
        ...(area.assessment ? [
          `- **Understanding:** ${area.assessment.understanding}%`,
          `- **Progress:** ${area.assessment.progress}%`,
          `- **Last assessed:** ${area.assessment.assessedAt} (${area.assessment.assessedBy})`,
        ] : [
          `- **Confidence:** ${Math.round((area.confidence ?? 0.5) * 100)}%`,
        ]),
        `- **Trend:** ${area.progress.trend}`,
        `- **Last active:** ${area.progress.lastActiveAt}`,
        `- **Updated:** ${area.updatedAt}`,
        ``,
      ];

      // Core intent & motivation
      if (area.intent) {
        lines.push(`## Intent`, ``, area.intent, ``);
      }
      if (area.deeperIntent) {
        lines.push(`## Deeper Motivation — WHY`, ``, area.deeperIntent, ``);
      }

      // Prepared briefing — the most valuable content, from orchestration-powered evaluation
      if (area.preparedBriefing) {
        lines.push(`## Preparation Briefing`, ``);
        lines.push(`*Prepared: ${area.preparedAt?.slice(0, 10) || "unknown"}*`, ``);
        lines.push(area.preparedBriefing, ``);
      }

      // Next steps & suggested actions
      if (area.nextSteps?.length) {
        lines.push(`## Next Steps`, ``);
        for (const step of area.nextSteps) lines.push(`- ${step}`);
        lines.push(``);
      }
      if (area.adjacentPursuits?.length) {
        lines.push(`## Adjacent Pursuits`, ``);
        for (const p of area.adjacentPursuits) lines.push(`- ${p}`);
        lines.push(``);
      }
      if (area.suggestedActions.length) {
        lines.push(`## Suggested Actions`, ``);
        for (const a of area.suggestedActions) lines.push(`- ${a}`);
        lines.push(``);
      }

      // Evidence grounding
      lines.push(`## Evidence`, ``);
      for (const ev of area.evidence) lines.push(`- ${ev}`);
      lines.push(``);

      // Related entities (cross-reference links)
      if (area.relatedEntityIds.length > 0) {
        lines.push(`## Related Entities`, ``);
        for (const eid of area.relatedEntityIds) lines.push(`- ${eid}`);
        lines.push(``);
      }

      // Themes
      if (area.semanticTags.length) {
        lines.push(`## Themes`, ``, `Tags: ${area.semanticTags.join(", ")}`, ``);
      }

      // Recent activity
      if (area.progress.recentActivity.length > 0) {
        lines.push(`## Recent Activity`, ``);
        for (const act of area.progress.recentActivity) lines.push(`- ${act}`);
        lines.push(``);
      }

      // Full refinement history (all entries, not just last 5)
      if (area.refinements.length) {
        lines.push(`## Journey`, ``);
        for (const r of area.refinements.slice().reverse()) {
          lines.push(`- ${r.date.slice(0, 10)} [${r.source}]: ${r.change}`);
        }
        lines.push(``);
      }

      writeFileSync(pagePath, lines.join("\n"), "utf-8");
    }

    // Register focus pages in Cortex _index.md so they're searchable
    try {
      const indexPath = join(ENSO_HOME, "wiki", "_index.md");
      if (existsSync(indexPath)) {
        var indexContent = readFileSync(indexPath, "utf-8");
        var appendLines: string[] = [];

        for (const area of state.areas) {
          const pagePath = `focuses/${area.id}.md`;
          if (!indexContent.includes(pagePath)) {
            const summary = (area.intent || area.description).slice(0, 200);
            const tagStr = area.semanticTags.length > 0 ? `. Tags: ${area.semanticTags.join(", ")}` : "";
            appendLines.push(`## ${pagePath}`);
            appendLines.push(`**${area.title}** — ${summary}${tagStr}.`);
            appendLines.push(`Updated: ${area.updatedAt}`);
            appendLines.push(`Source: focus`);
            if (area.semanticTags.length) appendLines.push(`Themes: ${area.semanticTags.join(", ")}`);
            appendLines.push("");
          }
        }

        if (appendLines.length > 0) {
          writeFileSync(indexPath, indexContent + "\n" + appendLines.join("\n"), "utf-8");
        }
      }
    } catch { /* cortex index update best-effort */ }
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
9. **confidence**: 0-1 how confident you are this is a real focus (used for initial understanding assessment)
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

    const parsed = JSON.parse(cleanJson(response)) as { areas: Array<Record<string, unknown>> };
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
      assessment: {
        understanding: 10, // Just inferred — TL hasn't studied this yet
        progress: 0,
        assessedAt: now,
        assessedBy: "inference",
        notes: "Newly inferred — awaiting TL evaluation",
      },
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

// ── Conversation Context Registry Integration ──

/** Look up which focus area owns a given conversation */
export function getFocusAreaByConversationId(conversationId: string): FocusArea | null {
  const state = loadFocusState();
  if (!state?.areas.length) return null;
  return state.areas.find(a => a.conversationId === conversationId) ?? null;
}

/**
 * Register all focus areas that have a conversationId with the context registry.
 * Called on server startup and when a focus area gets a new conversationId.
 */
export async function registerFocusProviders(): Promise<void> {
  const state = loadFocusState();
  if (!state?.areas.length) return;

  const { contextRegistry } = await import("./conversation-context.js");
  const { FocusContextProvider } = await import("./focus-context-provider.js");

  for (const area of state.areas) {
    if (area.conversationId && !contextRegistry.getProvider(area.conversationId)) {
      contextRegistry.register(area.conversationId, new FocusContextProvider(area.id));
    }
    // Register expert conversation providers
    if (area.experts) {
      const { ExpertContextProvider } = await import("./focus-context-provider.js");
      for (const expert of area.experts) {
        if (expert.conversationId && !contextRegistry.getProvider(expert.conversationId)) {
          contextRegistry.register(expert.conversationId, new ExpertContextProvider(area.id, expert.id));
        }
      }
    }
  }
}

/** Register a single focus area's conversation with the context registry */
export async function registerFocusProvider(focusId: string, conversationId: string): Promise<void> {
  const { contextRegistry } = await import("./conversation-context.js");
  const { FocusContextProvider } = await import("./focus-context-provider.js");
  contextRegistry.register(conversationId, new FocusContextProvider(focusId));
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

    const result = JSON.parse(cleanJson(response)) as {
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
    const oldClarity = area.clarity;

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

    // Emit event for conversation context registry (proactive messages)
    if (area.clarity !== oldClarity) {
      import("./conversation-context.js").then(({ contextRegistry }) => {
        contextRegistry.emitEvent({
          type: "focus.refined",
          payload: { focusId, clarityChanged: true, oldClarity, newClarity: area.clarity },
          timestamp: Date.now(),
        }).catch(() => {});
      }).catch(() => {});
    }
  } catch (err) {
    logError("focus-areas", `Refinement failed for "${area.title}"`, err);
  }
}

// ── Preparation (Deep Study via Orchestration) ──

/** Gather fast, zero-LLM context about a focus area for use in planning prompts */
async function gatherFocusContext(area: FocusArea): Promise<string> {
  var sections: string[] = [];

  sections.push(`# Focus Area: ${area.title}
Description: ${area.description}
Clarity: ${area.clarity}
${area.intent ? `Intent: ${area.intent}` : ""}
${area.deeperIntent ? `Deeper motivation: ${area.deeperIntent}` : ""}
${area.adjacentPursuits?.length ? `Adjacent pursuits: ${area.adjacentPursuits.join("; ")}` : ""}
${area.nextSteps?.length ? `Next steps: ${area.nextSteps.join("; ")}` : ""}
Evidence: ${area.evidence.join(", ")}
Themes: ${area.semanticTags.join(", ")}`);

  // Previous sprint results — essential for building on what was already done
  if ((area as any).lastSprintResults) {
    sections.push(`\n# Previous Sprint Results (${(area as any).lastSprintDate?.slice(0, 10) || "recent"})\nThe following was produced in the last evolution sprint. The next evaluation should build on these results, identify gaps, and determine what to focus on next.\n\n${(area as any).lastSprintResults.slice(0, 4000)}`);
  }

  // Related entities (sprint deliverables, books, etc.)
  if (area.relatedEntityIds.length > 0) {
    sections.push(`\n# Related Entities (${area.relatedEntityIds.length})\n${area.relatedEntityIds.map(id => `- ${id}`).join("\n")}`);
  }

  // Related projects
  var projectIds = area.relatedEntityIds
    .filter(id => id.includes(":project:"))
    .map(id => id.split(":").pop()!);

  try {
    const { listProjects, loadProject } = await import("./project-manager.js");
    var allProjects = listProjects();
    var titleWords = area.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (var proj of allProjects) {
      if (titleWords.some(w => proj.name.toLowerCase().includes(w)) && !projectIds.includes(proj.id)) {
        projectIds.push(proj.id);
      }
    }
    for (var pid of projectIds) {
      var project = loadProject(pid);
      if (project) {
        sections.push(`\n# Project: ${project.name}\nVision: ${project.vision || "Not defined"}\nCodebase: ${project.codebasePath}\n${project.techStack ? `Tech: ${project.techStack}` : ""}`);
      }
    }
  } catch { /* ignore */ }

  // Cortex pages
  try {
    const { searchIndex } = await import("./cortex-tools.js");
    var hits = searchIndex(area.semanticTags.join(" ") + " " + area.title, 10);
    if (hits.length > 0) {
      sections.push(`\n# Related Knowledge (${hits.length} Cortex pages)\n${hits.map(e => `- ${e.title} (${e.source || "cortex"}): ${e.summary}`).join("\n")}`);
    }
  } catch { /* ignore */ }

  // Cross-source
  try {
    const { findRelatedContent } = await import("./cortex-synthesis.js");
    var related = findRelatedContent(area.title, 5);
    if (related.totalMatches > 0) {
      var lines: string[] = [];
      for (var [src, srcHits] of Object.entries(related.bySource)) {
        if (srcHits.length > 0) lines.push(`- ${src}: ${srcHits.map(h => h.title).join(", ")}`);
      }
      if (lines.length > 0) sections.push(`\n# Cross-Source Connections\n${lines.join("\n")}`);
    }
  } catch { /* ignore */ }

  return sections.join("\n\n");
}

/**
 * Launch an orchestration-powered deep evaluation of a focus area.
 * Multiple AI agents work in parallel: researcher (web + Cortex), codebase analyst,
 * knowledge synthesizer. Results are combined into a comprehensive briefing.
 *
 * The orchestration runs asynchronously — the UI shows progress in the Evolve tab.
 * When complete, the briefing is stored on the focus area and the chat button flashes.
 */
export async function prepareFocusArea(
  focusId: string,
  client?: import("./server.js").ConnectedClient,
  account?: import("./accounts.js").ResolvedEnsoAccount,
): Promise<{ briefing: string; orchestrated: boolean } | null> {
  const state = loadFocusState();
  if (!state) return null;
  const area = state.areas.find(a => a.id === focusId);
  if (!area) return null;

  logAction({ ts: Date.now(), type: "action", category: "focus-areas", message: `Preparing focus "${area.title}"...` });

  // Gather fast context for the planning prompt
  const focusContext = await gatherFocusContext(area);

  // Find related project codebase paths
  var codebasePaths: string[] = [];
  try {
    const { listProjects } = await import("./project-manager.js");
    var titleWords = area.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (var proj of listProjects()) {
      if (titleWords.some(w => proj.name.toLowerCase().includes(w)) && proj.codebasePath) {
        codebasePaths.push(`${proj.name}: ${proj.codebasePath}`);
      }
    }
  } catch { /* ignore */ }

  // If we have a client and account, launch a full orchestration
  if (client && account) {
    try {
      const { handleOrchestration } = await import("./orchestrator.js");

      await handleOrchestration({
        userMessage: `Focus Prepare: Deep evaluation of "${area.title}"`,
        classification: { complexity: "orchestrated", reasoning: "Focus area preparation — multi-agent deep evaluation" },
        client,
        account,
        skipApproval: true,
        maxConcurrency: 3,
        useGeminiPlanning: true,
        chatModel: "gemini-2.5-flash",
        planningPromptBuilder: (_orchId, planFilePath) => `You are planning a **Focus Area Evaluation** — a deep study to prepare for strategic discussion.

## Focus Area
${focusContext}

${codebasePaths.length > 0 ? `## Related Codebases\n${codebasePaths.join("\n")}` : ""}

## Your Task
Design 3-4 evaluation tasks that will produce a comprehensive understanding of this focus area. The output will be a briefing that enables an informed strategic conversation with the user.

Available agent roles:
- **researcher**: Web research, market analysis, competitive landscape, best practices, latest developments
- **architect**: Codebase analysis, technical audit, architecture review, sprint history analysis (reads project brain + code)
- **reviewer**: Cross-reference Cortex knowledge, identify patterns across data sources, find knowledge gaps

Task design principles:
- Each task should investigate a DIFFERENT dimension of the focus
- Tasks should be PARALLEL (no dependencies) for speed — the synthesizer runs last
- The final task MUST be a "reviewer" that synthesizes all findings into a structured briefing
- Include the focus area's semantic tags, evidence, and Cortex data in task descriptions so agents have context
${codebasePaths.length > 0 ? `- The architect task should analyze the codebase at the paths listed above` : "- No codebase paths found — skip codebase analysis, focus on research and knowledge synthesis"}

Suggested structure:
1. **External Research** (researcher): Research the latest developments, best practices, and competitive landscape relevant to "${area.title}". Search the web for 3-5 high-quality sources.
2. ${codebasePaths.length > 0 ? `**Codebase & Sprint Analysis** (architect): Analyze the project codebase, read the project brain (institutional memory), review recent sprint results, identify technical state and gaps.` : `**Domain Deep Dive** (researcher): Research the specific domain knowledge needed for this focus — frameworks, methodologies, case studies, expert opinions.`}
3. **Knowledge Synthesis** (reviewer): Read all upstream task results. Cross-reference with the user's Cortex knowledge (books, projects, research). Produce a comprehensive briefing with: Current State, Recent Progress, Key Insights, Knowledge Context, Open Questions, and Recommended Priorities. Be specific — reference actual data points.

Write the JSON plan to: ${planFilePath}
Format: {"tasks":[{"taskId":"...","title":"...","description":"...","agentRole":"researcher|architect|reviewer","dependsOn":[],"outputType":"research|document"}]}
The synthesizer task must dependsOn all other tasks.`,

        onComplete: async (orchId, status) => {
          logAction({ ts: Date.now(), type: "action", category: "focus-areas",
            message: `Focus Prepare orchestration ${status} for "${area.title}" (${orchId})` });

          if (status === "completed") {
            // Read task results from the persisted orchestration plan
            try {
              const { loadOrchestration } = await import("./orchestrator.js");
              const plan = loadOrchestration(orchId);
              var briefing = "";

              if (plan?.tasks) {
                // Combine all task result summaries, prioritizing the last (synthesizer) task
                var taskSummaries = plan.tasks
                  .filter((t: { resultSummary?: string }) => t.resultSummary)
                  .map((t: { title: string; resultSummary: string; agentRole: string }) =>
                    `## ${t.title} (${t.agentRole})\n\n${t.resultSummary}`
                  );
                briefing = taskSummaries.join("\n\n---\n\n");
              }

              if (!briefing.trim()) {
                briefing = "Evaluation completed but no task results found. Check the Evolve tab for details.";
              }

              // Store on focus area
              const freshState = loadFocusState();
              if (freshState) {
                const freshArea = freshState.areas.find(a => a.id === focusId);
                if (freshArea) {
                  freshArea.preparedBriefing = briefing.slice(0, 15000); // Cap at 15K chars
                  freshArea.preparedAt = new Date().toISOString();
                  freshArea.updatedAt = freshArea.preparedAt;
                  saveFocusState(freshState);
                  logAction({ ts: Date.now(), type: "action", category: "focus-areas",
                    message: `Stored briefing for "${area.title}": ${briefing.length} chars from orchestration` });

                  // Trigger TL: assess understanding + immediately queue next step
                  import("./team-leader.js").then(({ assessFocusUnderstanding, onFocusEvent }) => {
                    assessFocusUnderstanding(freshArea, updateFocusAssessment)
                      .then(() => onFocusEvent("evaluation.completed", focusId))
                      .catch(() => {});
                  }).catch(() => {});
                }
              }
            } catch (err) {
              logError("focus-areas", `Failed to read orchestration results for "${area.title}"`, err);
            }
          }
        },
      });

      return { briefing: "Orchestration launched — evaluation agents are working. Watch progress in the Evolve tab.", orchestrated: true };
    } catch (err) {
      logError("focus-areas", `Orchestration launch failed for "${area.title}", falling back to single LLM`, err);
      // Fall through to single-LLM fallback below
    }
  }

  // ── Fallback: single LLM call (no client/account, or orchestration failed) ──
  try {
    const { llm } = await import("./llm.js");
    var briefing = await llm({
      prompt: `You are preparing a comprehensive briefing for a strategic planning session about this focus area.

Here is ALL the data gathered from the user's knowledge base, projects, sprint history, and codebase:

${focusContext}

Write a comprehensive briefing covering:
1. **Current State**: What exists, what's been built, what's working
2. **Recent Progress**: What happened recently? What's the trajectory?
3. **Key Insights**: Patterns, failures, or breakthroughs from the data
4. **Knowledge Context**: What books, research, or resources relate to this focus?
5. **Open Questions**: Most important unresolved questions or decisions
6. **Recommended Priorities**: What should the user focus on next?

Be specific — reference actual project names, book titles, and concrete data points.`,
      tier: "utility",
      maxOutputTokens: 4000,
    });

    area.preparedBriefing = briefing;
    area.preparedAt = new Date().toISOString();
    area.updatedAt = area.preparedAt;
    saveFocusState(state);

    logAction({ ts: Date.now(), type: "action", category: "focus-areas",
      message: `Prepared focus "${area.title}" (fallback LLM): ${briefing.length} chars` });

    return { briefing, orchestrated: false };
  } catch (err) {
    logError("focus-areas", `Preparation failed for "${area.title}"`, err);
    return null;
  }
}

// ── Focus Evolution (using unified orchestration) ──

/**
 * Launch a goal-oriented evolution sprint for a focus area.
 * Uses the unified OrchestrationContext to drive a PL-planned sprint
 * that adapts to the focus type (research, creative, project, etc.)
 */
export async function launchFocusEvolve(params: {
  focusId: string;
  brief: string;
  client: import("./server.js").ConnectedClient;
  account: import("./accounts.js").ResolvedEnsoAccount;
}): Promise<void> {
  const { focusId, brief, client, account } = params;
  const state = loadFocusState();
  if (!state) return;
  const area = state.areas.find(a => a.id === focusId);
  if (!area) return;

  logAction({ ts: Date.now(), type: "action", category: "focus-areas",
    message: `Launching focus evolution for "${area.title}"` });

  // Gather transcript
  let discussion = "";
  try {
    if (area.conversationId) {
      const { loadCardHistory } = await import("./memory-bridge.js");
      const { readdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");
      const cardsRoot = join(homedir(), ".enso", "cards");
      let bestRecords: Array<{ text?: string; role?: string }> = [];
      for (const cid of readdirSync(cardsRoot)) {
        const records = loadCardHistory(cid, area.conversationId, 100);
        if (records.length > bestRecords.length) bestRecords = records;
      }
      if (bestRecords.length > 0) {
        discussion = bestRecords
          .filter(r => r.text?.trim())
          .map(r => `${r.role === "user" ? "User" : "Enso"}: ${r.text}`)
          .join("\n\n");
      }
    }
  } catch { /* ignore */ }

  const { handleOrchestration } = await import("./orchestrator.js");
  type OCtx = import("./orchestrator.js").OrchestrationContext;

  // Forward orchestration progress, task terminals, and card updates so the
  // Focus Evolve tab can render live task status + Claude Code output.
  // Only suppress regular chat text cards to avoid cluttering the conversation.
  const evolveClient = {
    ...client,
    send: (msg: unknown) => {
      const m = msg as Record<string, unknown>;
      if (
        m.orchestrationProgress || m.orchestrationPlan ||
        m.sessions || m.type === "settings" ||
        (m.toolMeta as Record<string, unknown>)?.toolId === "claude-code" ||
        (m.targetCardId as string)?.includes(":task:")
      ) {
        client.send(msg as Parameters<typeof client.send>[0]);
      }
    },
  };

  // Build expert team context for the orchestration planner
  const expertContext = area.experts?.length
    ? `\n\n## Expert Team\nThis focus area has ${area.experts.length} domain experts. Use them as agent roles in the sprint:\n${area.experts.map(e => `- **${e.name}** (${e.role}, agentRole: ${e.agentRole}): ${e.responsibilities}`).join("\n")}`
    : "";

  const context: OCtx = {
    type: "focus",
    goal: (brief || `Evolve focus area: ${area.title}\n\nGoal: ${area.intent || area.description}\nWhy: ${area.deeperIntent || ""}`) + expertContext,
    briefing: area.preparedBriefing,
    discussion: discussion || undefined,
    teamAgents: area.experts?.map(e => ({
      id: e.id, name: e.name, role: e.role,
      responsibilities: e.responsibilities, goals: e.goals,
      perspective: e.perspective, agentRole: e.agentRole,
    })),
    scale: "standard",
  };

  await handleOrchestration({
    userMessage: `Focus Evolution: ${area.title}`,
    classification: { complexity: "orchestrated" as const, reasoning: "Focus area evolution sprint" },
    client: evolveClient as typeof client,
    account,
    context,
    skipApproval: true,
    maxConcurrency: 4,
    planningModel: "opus",
    onComplete: async (orchId, status) => {
      logAction({ ts: Date.now(), type: "action", category: "focus-areas",
        message: `Focus evolution ${status} for "${area.title}" (${orchId})` });

      if (status === "completed") {
        try {
          // Read task results and store on focus area + Cortex
          const { loadOrchestration } = await import("./orchestrator.js");
          const plan = loadOrchestration(orchId);
          if (plan?.tasks) {
            const sprintResults = plan.tasks
              .filter((t: { resultSummary?: string }) => t.resultSummary)
              .map((t: { title: string; resultSummary: string; agentRole: string }) =>
                `## ${t.title} (${t.agentRole})\n\n${t.resultSummary}`)
              .join("\n\n---\n\n");

            // Store on focus area + reset workflow for next cycle
            const freshState = loadFocusState();
            if (freshState) {
              const freshArea = freshState.areas.find(a => a.id === focusId);
              if (freshArea) {
                freshArea.updatedAt = new Date().toISOString();
                freshArea.refinements.push({
                  date: freshArea.updatedAt,
                  source: "conversation" as const,
                  change: `Evolution sprint completed: ${plan.tasks.length} tasks`,
                });

                // Store sprint results for the next Evaluate cycle to reference
                (freshArea as any).lastSprintResults = sprintResults.slice(0, 8000);
                (freshArea as any).lastSprintDate = new Date().toISOString();

                // Reset workflow for next cycle — Evaluate and Discuss start fresh
                freshArea.preparedBriefing = undefined;
                freshArea.preparedAt = undefined;
                // Clear conversationId so Discuss creates a new conversation
                // (the old conversation is preserved in the sidebar for reference)
                freshArea.conversationId = undefined;

                saveFocusState(freshState);
              }
            }

            // Register each deliverable as a properly-typed Cortex entity
            try {
              const { ingestDiscoveredEntity } = await import("./cortex-direct-ingest.js");
              const { upsertEntityIndex, saveEntityIndex, lookupEntity } = await import("./entity-model.js");
              const createdEntityIds: string[] = [];
              const taskEntityMap: Array<{ taskTitle: string; entityType: string; entityId: string; resultSummary: string }> = [];

              // Classify each task output into the right entity type
              const typeMap: Record<string, string> = {
                "researcher": "article",   // research outputs → articles
                "architect": "idea",       // frameworks/methodologies/designs → ideas
                "builder": "app",          // built apps → app entities
                "reviewer": "synthesis",   // synthesis/reports → synthesis
                "coder": "article",        // code guides → articles
              };

              for (const t of plan.tasks) {
                if (!t.resultSummary) continue;
                const agentRole = (t as any).agentRole || "researcher";
                const entityType = typeMap[agentRole] || "article";
                const fullContent = (t as any).fullOutput || t.resultSummary;

                try {
                  const result = await ingestDiscoveredEntity({
                    title: t.title,
                    type: entityType,
                    source: "cortex",
                    description: t.resultSummary.slice(0, 500),
                  });

                  if (result.created || result.entityId) {
                    createdEntityIds.push(result.entityId);
                    taskEntityMap.push({ taskTitle: t.title, entityType, entityId: result.entityId, resultSummary: t.resultSummary! });

                    // Write full content to the wiki page (ingest only creates a stub)
                    if (fullContent.length > 600 && result.cortexPath) {
                      const { writeFileSync: writeFile2 } = await import("node:fs");
                      const { join: pathJoin2 } = await import("node:path");
                      const { homedir: home2 } = await import("node:os");
                      const fullPath = pathJoin2(home2(), ".enso", "wiki", result.cortexPath);
                      const page = `# ${t.title}\n\n*Created by Evolution Sprint — ${new Date().toISOString().slice(0, 10)}*\n*Focus: ${area.title}*\n\n${fullContent}`;
                      writeFile2(fullPath, page, "utf-8");
                    }

                    // Add cross-reference back to focus area
                    const entity = lookupEntity(result.entityId);
                    if (entity) {
                      const refs = entity.crossReferences || [];
                      const focusRef = `cortex:synthesis:${focusId}`;
                      if (!refs.some(r => r.entityId === focusRef)) {
                        refs.push({ entityId: focusRef, reason: `Created during evolution sprint for "${area.title}"` });
                        upsertEntityIndex({ ...entity, crossReferences: refs });
                      }
                    }
                  }
                  logAction({ ts: Date.now(), type: "action", category: "focus-areas",
                    message: `Registered deliverable as ${entityType}: "${t.title}" (${result.entityId})` });
                } catch (entityErr) {
                  logError("focus-areas", `Failed to register entity for "${t.title}"`, entityErr);
                }
              }

              // Save entity index with all new entries
              if (createdEntityIds.length > 0) {
                saveEntityIndex();

                // Link all created entities to the focus area
                const freshState2 = loadFocusState();
                if (freshState2) {
                  const freshArea2 = freshState2.areas.find(a => a.id === focusId);
                  if (freshArea2) {
                    for (const eid of createdEntityIds) {
                      if (!freshArea2.relatedEntityIds.includes(eid)) {
                        freshArea2.relatedEntityIds.push(eid);
                      }
                    }
                    saveFocusState(freshState2);
                  }
                }

                logAction({ ts: Date.now(), type: "action", category: "focus-areas",
                  message: `Linked ${createdEntityIds.length} deliverables to focus "${area.title}"` });

                // Run enrichment on sprint deliverables (semantic tags + cross-references)
                import("./cortex-enrichment.js").then(({ enrichNewEntities, crossReferenceNewEntities }) => {
                  enrichNewEntities(createdEntityIds)
                    .then(() => crossReferenceNewEntities(createdEntityIds))
                    .then(result => {
                      if (result.refsCreated > 0) {
                        logAction({ ts: Date.now(), type: "action", category: "focus-areas",
                          message: `Sprint deliverable enrichment: ${result.refsCreated} cross-references created` });
                      }
                    })
                    .catch(err => logError("focus-areas", "Sprint deliverable enrichment failed", err));
                }).catch(() => {});
              }

              logAction({ ts: Date.now(), type: "action", category: "focus-areas",
                message: `Stored sprint deliverables as Cortex entities for focus "${area.title}"` });

              // Generate structured sprint summary via LLM (maps deliverables to pain points)
              if (taskEntityMap.length > 0) {
                try {
                  const { llm: llmCall } = await import("./llm.js");
                  const deliverablesList = taskEntityMap.map((d, i) =>
                    `${i + 1}. Task: "${d.taskTitle}" | Type: ${d.entityType} | Entity ID: ${d.entityId}\n   Summary: ${d.resultSummary.slice(0, 600)}`
                  ).join("\n\n");

                  const summaryPrompt = `You are analyzing the results of a focus area evolution sprint.

FOCUS AREA: "${area.title}"
GOAL: ${area.intent || area.description}
${area.deeperIntent ? `WHY IT MATTERS: ${area.deeperIntent}` : ""}

SPRINT DELIVERABLES:
${deliverablesList}

Generate a structured JSON summary that maps each deliverable to a specific user pain point and provides clear usage instructions.

Return this exact JSON structure:
{
  "sprintSummary": "2-3 sentence overview of what this sprint accomplished and how it moves the user toward their goal",
  "deliverables": [
    {
      "taskTitle": "exact task title from above",
      "entityType": "the entity type from above (app, article, idea, or synthesis)",
      "entityId": "the exact entity ID from above",
      "painPoint": "which specific pain point or need this addresses",
      "howItHelps": "1-2 sentences on how this deliverable helps the user",
      "quickStart": "clear, specific instruction on how to use this RIGHT NOW (e.g., 'Open the article in Cortex and review the key frameworks' or 'Run the app from your Apps menu')",
      "actionType": "run for apps, read for articles, explore for ideas, review for synthesis"
    }
  ],
  "recommendedFirstAction": {
    "deliverableIndex": 0,
    "reason": "why this deliverable should be used first"
  },
  "nextSteps": ["2-3 suggested follow-up actions to build on these results"]
}

Rules:
- Use the EXACT taskTitle, entityType, and entityId from the deliverables list
- actionType must match entityType: app→run, article→read, idea→explore, synthesis→review
- quickStart must be specific and actionable, not generic
- painPoint should reference the user's actual goal/intent
- recommendedFirstAction.deliverableIndex is 0-based
- nextSteps should be forward-looking, building on what was produced`;

                  const summaryResponse = await llmCall({
                    prompt: summaryPrompt,
                    tier: "utility",
                    maxOutputTokens: 4000,
                    responseMimeType: "application/json",
                    temperature: 0.3,
                    timeoutMs: 30_000,
                  });

                  const sprintSummary = JSON.parse(summaryResponse) as import("../../shared/types.js").SprintResultsSummary;

                  // Validate and store the structured summary
                  if (sprintSummary.sprintSummary && Array.isArray(sprintSummary.deliverables)) {
                    const freshState3 = loadFocusState();
                    if (freshState3) {
                      const freshArea3 = freshState3.areas.find(a => a.id === focusId);
                      if (freshArea3) {
                        freshArea3.lastSprintSummary = sprintSummary;
                        saveFocusState(freshState3);
                      }
                    }

                    logAction({ ts: Date.now(), type: "action", category: "focus-areas",
                      message: `Generated structured sprint summary for "${area.title}": ${sprintSummary.deliverables.length} deliverables mapped to pain points` });

                    // Emit sprint.completed event to conversation context registry
                    // This triggers proactive messages in focus conversations
                    import("./conversation-context.js").then(({ contextRegistry }) => {
                      contextRegistry.emitEvent({
                        type: "sprint.completed",
                        payload: { focusId, sprintSummary, focusTitle: area.title },
                        timestamp: Date.now(),
                      });
                    }).catch(() => {});

                    // Track expert sprint participation
                    trackExpertSprintParticipation(focusId);

                    // Event-driven TL: immediately review results + assess progress
                    import("./team-leader.js").then(({ onFocusEvent }) => {
                      onFocusEvent("sprint.completed", focusId).catch(() => {});
                    }).catch(() => {});

                    // Deliver sprint results through all channels (email, WeChat)
                    import("./focus-agent.js").then(({ deliverSprintResults }) => {
                      deliverSprintResults(focusId, area.title, sprintSummary).catch(err => {
                        logError("focus-areas", "Multi-channel sprint delivery failed", err);
                      });
                    }).catch(() => {});
                  }
                } catch (summaryErr) {
                  logError("focus-areas", `Failed to generate structured sprint summary for "${area.title}" (falling back to raw results)`, summaryErr);
                }
              }
            } catch { /* best effort cortex persist */ }
          }
        } catch (err) {
          logError("focus-areas", `Failed to process evolution results for "${area.title}"`, err);
        }
      }
    },
  });
}

// ── Focus Type Detection ──

/**
 * Auto-detect focus type from existing data.
 * Checks project registry, semantic tags, and evidence.
 */
export async function detectFocusTypes(): Promise<number> {
  const state = loadFocusState();
  if (!state) return 0;

  let updated = 0;

  // Load projects for matching
  let projects: Array<{ id: string; name: string; codebasePath?: string }> = [];
  try {
    const { listProjects } = await import("./project-manager.js");
    projects = listProjects().map(p => ({ id: p.id, name: p.name, codebasePath: p.codebasePath }));
  } catch { /* no projects module */ }

  for (const area of state.areas) {
    if (area.focusType) continue; // Already typed

    // Check if this focus matches a project
    const titleWords = area.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchedProject = projects.find(p =>
      titleWords.some(w => p.name.toLowerCase().includes(w)) ||
      p.name.toLowerCase().split(/\s+/).some(w => w.length > 3 && area.title.toLowerCase().includes(w))
    );

    if (matchedProject) {
      area.focusType = "project";
      area.projectId = matchedProject.id;
      area.codebasePath = matchedProject.codebasePath;
      updated++;
      continue;
    }

    // Heuristic: detect type from semantic tags and evidence
    const tags = area.semanticTags.join(" ").toLowerCase();
    const desc = (area.description + " " + (area.intent || "")).toLowerCase();

    if (tags.match(/coding|software|development|programming|typescript|python|app|platform/) || desc.match(/build|develop|implement|codebase|repository/)) {
      area.focusType = "project";
    } else if (tags.match(/photography|art|music|writing|creative|design|film/) || desc.match(/creative|artistic|photograph|compose|paint|draw/)) {
      area.focusType = "creative";
    } else if (tags.match(/learning|study|course|education|skill|training/) || desc.match(/learn|study|master|understand|course/)) {
      area.focusType = "learning";
    } else if (tags.match(/fitness|health|gaming|travel|cooking|lifestyle/) || desc.match(/habit|routine|optimize|hobby|enjoy/)) {
      area.focusType = "lifestyle";
    } else {
      area.focusType = "general";
    }
    updated++;
  }

  if (updated > 0) {
    saveFocusState(state);
    clearFocusCache();
    logAction({ ts: Date.now(), type: "action", category: "focus-areas",
      message: `Auto-detected types for ${updated} focus area(s)` });
  }

  return updated;
}

// ── Backfill Sprint Summaries ──

/**
 * Backfill `lastSprintSummary` for focus areas that have raw sprint results
 * but no structured summary. This enables the activation cards UI and
 * the Focus Agent to deliver actionable sprint result notifications.
 */
export async function backfillSprintSummaries(): Promise<{ backfilled: number; errors: number }> {
  const state = loadFocusState();
  if (!state) return { backfilled: 0, errors: 0 };

  const { llm: llmCall } = await import("./llm.js");
  const { lookupEntity, getEntityIndex } = await import("./entity-model.js");

  let backfilled = 0;
  let errors = 0;

  for (const area of state.areas) {
    // Skip areas that already have a structured summary or no raw results
    if (area.lastSprintSummary || !area.lastSprintResults) continue;

    try {
      // Reconstruct taskEntityMap from relatedEntityIds
      const entityIndex = getEntityIndex();
      const taskEntityMap: Array<{ taskTitle: string; entityType: string; entityId: string; resultSummary: string }> = [];

      for (const eid of area.relatedEntityIds) {
        const entity = lookupEntity(eid);
        if (!entity) continue;

        // Map entity type to sprint deliverable type
        const typeMap: Record<string, string> = {
          article: "article", idea: "idea", app: "app", synthesis: "synthesis",
        };
        const entityType = typeMap[entity.type] || "article";

        taskEntityMap.push({
          taskTitle: entity.title,
          entityType,
          entityId: eid,
          resultSummary: `${entity.title} — ${entity.type} entity created during sprint`,
        });
      }

      // Also parse task info from the raw sprint results text
      const taskSections = area.lastSprintResults.split(/---\n\n/).filter(Boolean);
      for (const section of taskSections) {
        const titleMatch = section.match(/^## (.+?) \((\w+)\)/);
        if (!titleMatch) continue;
        const [, taskTitle, agentRole] = titleMatch;
        const roleTypeMap: Record<string, string> = {
          researcher: "article", architect: "idea", builder: "app", coder: "article", reviewer: "synthesis",
        };

        // Check if we already have this from entities
        const alreadyMapped = taskEntityMap.some(t =>
          t.taskTitle.toLowerCase().includes(taskTitle.toLowerCase().slice(0, 30)) ||
          taskTitle.toLowerCase().includes(t.taskTitle.toLowerCase().slice(0, 30))
        );

        if (!alreadyMapped) {
          taskEntityMap.push({
            taskTitle,
            entityType: roleTypeMap[agentRole] || "article",
            entityId: `cortex:${roleTypeMap[agentRole] || "article"}:${taskTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
            resultSummary: section.slice(0, 600),
          });
        } else {
          // Enrich existing entry with the actual result summary
          const existing = taskEntityMap.find(t =>
            t.taskTitle.toLowerCase().includes(taskTitle.toLowerCase().slice(0, 30)) ||
            taskTitle.toLowerCase().includes(t.taskTitle.toLowerCase().slice(0, 30))
          );
          if (existing && section.length > existing.resultSummary.length) {
            existing.resultSummary = section.slice(0, 600);
          }
        }
      }

      if (taskEntityMap.length === 0) {
        logAction({ ts: Date.now(), type: "action", category: "focus-areas",
          message: `Backfill skip: no deliverables found for "${area.title}"` });
        continue;
      }

      // Generate structured summary using the same prompt as the live sprint code
      const deliverablesList = taskEntityMap.map((d, i) =>
        `${i + 1}. Task: "${d.taskTitle}" | Type: ${d.entityType} | Entity ID: ${d.entityId}\n   Summary: ${d.resultSummary.slice(0, 600)}`
      ).join("\n\n");

      const summaryPrompt = `You are analyzing the results of a focus area evolution sprint.

FOCUS AREA: "${area.title}"
GOAL: ${area.intent || area.description}
${area.deeperIntent ? `WHY IT MATTERS: ${area.deeperIntent}` : ""}

SPRINT DELIVERABLES:
${deliverablesList}

Generate a structured JSON summary that maps each deliverable to a specific user pain point and provides clear usage instructions.

Return this exact JSON structure:
{
  "sprintSummary": "2-3 sentence overview of what this sprint accomplished and how it moves the user toward their goal",
  "deliverables": [
    {
      "taskTitle": "exact task title from above",
      "entityType": "the entity type from above (app, article, idea, or synthesis)",
      "entityId": "the exact entity ID from above",
      "painPoint": "which specific pain point or need this addresses",
      "howItHelps": "1-2 sentences on how this deliverable helps the user",
      "quickStart": "clear, specific instruction on how to use this RIGHT NOW",
      "actionType": "run for apps, read for articles, explore for ideas, review for synthesis"
    }
  ],
  "recommendedFirstAction": {
    "deliverableIndex": 0,
    "reason": "why this deliverable should be used first"
  },
  "nextSteps": ["2-3 suggested follow-up actions to build on these results"]
}

Rules:
- Use the EXACT taskTitle, entityType, and entityId from the deliverables list
- actionType must match entityType: app→run, article→read, idea→explore, synthesis→review
- quickStart must be specific and actionable, not generic
- painPoint should reference the user's actual goal/intent
- recommendedFirstAction.deliverableIndex is 0-based
- nextSteps should be forward-looking, building on what was produced`;

      const summaryResponse = await llmCall({
        prompt: summaryPrompt,
        tier: "utility",
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
        temperature: 0.3,
        timeoutMs: 30_000,
      });

      const sprintSummary = JSON.parse(summaryResponse) as import("../../shared/types.js").SprintResultsSummary;

      if (sprintSummary.sprintSummary && Array.isArray(sprintSummary.deliverables)) {
        area.lastSprintSummary = sprintSummary;
        backfilled++;
        logAction({ ts: Date.now(), type: "action", category: "focus-areas",
          message: `Backfilled sprint summary for "${area.title}": ${sprintSummary.deliverables.length} deliverables` });
      }
    } catch (err) {
      errors++;
      logError("focus-areas", `Backfill failed for "${area.title}"`, err);
    }
  }

  if (backfilled > 0) {
    saveFocusState(state);
    clearFocusCache();
  }

  return { backfilled, errors };
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
  // experts is a silent update — stored on focus area + persisted to Cortex separately
  if (updates.experts) {
    area.experts = updates.experts;
    saveFocusState(state);
    return area;
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

/**
 * Track expert activity — called when a conversation message is sent to an expert.
 * Increments conversation count and updates lastActiveAt.
 */
export function trackExpertActivity(focusId: string, expertId: string): void {
  const state = loadFocusState();
  if (!state) return;
  const area = state.areas.find(a => a.id === focusId);
  if (!area?.experts) return;
  const expert = area.experts.find(e => e.id === expertId);
  if (!expert) return;

  if (!expert.metrics) {
    expert.metrics = { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 };
  }
  expert.metrics.conversationCount++;
  expert.metrics.lastActiveAt = new Date().toISOString();
  saveFocusState(state);
}

/**
 * Track expert sprint participation — called when a sprint completes for this focus area.
 */
export function trackExpertSprintParticipation(focusId: string): void {
  const state = loadFocusState();
  if (!state) return;
  const area = state.areas.find(a => a.id === focusId);
  if (!area?.experts) return;

  for (const expert of area.experts) {
    if (!expert.metrics) {
      expert.metrics = { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 };
    }
    expert.metrics.sprintCount++;
    expert.metrics.lastActiveAt = new Date().toISOString();
  }
  saveFocusState(state);
}

/**
 * Get expert health summary for a focus area — used by TL dashboard.
 * Returns activity status per expert: active (convos in last 7d), idle (7-30d), stale (30d+/never).
 */
export function getExpertHealthSummary(focusId: string): Array<{
  id: string; name: string; role: string; status: "active" | "idle" | "stale";
  conversationCount: number; lastActiveAt: string | null; lastEvaluation?: string;
}> {
  const state = loadFocusState();
  if (!state) return [];
  const area = state.areas.find(a => a.id === focusId);
  if (!area?.experts) return [];

  const now = Date.now();
  return area.experts.map(e => {
    const m = e.metrics || { conversationCount: 0, lastActiveAt: null, sprintCount: 0, insightsGenerated: 0 };
    let status: "active" | "idle" | "stale" = "stale";
    if (m.lastActiveAt) {
      const daysSince = Math.floor((now - new Date(m.lastActiveAt).getTime()) / 86400000);
      if (daysSince <= 7) status = "active";
      else if (daysSince <= 30) status = "idle";
    }
    return {
      id: e.id, name: e.name, role: e.role, status,
      conversationCount: m.conversationCount,
      lastActiveAt: m.lastActiveAt,
      lastEvaluation: m.lastEvaluation,
    };
  });
}

/** Delete a focus area by ID */
export function deleteFocusArea(focusId: string): boolean {
  const state = loadFocusState();
  if (!state) return false;
  const idx = state.areas.findIndex(a => a.id === focusId);
  if (idx === -1) return false;
  const title = state.areas[idx].title;
  state.areas.splice(idx, 1);
  state.version++;
  saveFocusState(state);
  logAction({ ts: Date.now(), type: "action", category: "focus-areas", message: `Deleted focus area: "${title}"` });
  return true;
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
    confidence: 1.0,
    assessment: {
      understanding: 80, // user-created = high understanding
      progress: 0,
      assessedAt: now,
      assessedBy: "inference",
      notes: "User-created focus area",
    },
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
 * Update the TL's assessment of a focus area.
 * Called after evaluations, sprint reviews, and periodic morning assessments.
 */
export function updateFocusAssessment(
  focusId: string,
  update: { understanding?: number; progress?: number; assessedBy: string; notes: string },
): void {
  const state = loadFocusState();
  if (!state) return;
  const area = state.areas.find(a => a.id === focusId);
  if (!area) return;

  const now = new Date().toISOString();
  const prev = area.assessment || {
    understanding: Math.round((area.confidence ?? 0.5) * 100),
    progress: 0,
    assessedAt: area.createdAt,
    assessedBy: "inference",
    notes: "",
  };

  area.assessment = {
    understanding: update.understanding !== undefined ? Math.max(0, Math.min(100, update.understanding)) : prev.understanding,
    progress: update.progress !== undefined ? Math.max(0, Math.min(100, update.progress)) : prev.progress,
    assessedAt: now,
    assessedBy: update.assessedBy,
    notes: update.notes,
  };
  area.updatedAt = now;
  state.version++;
  saveFocusState(state);
}

/**
 * Migrate existing focus areas that have `confidence` but no `assessment`.
 * Called on server startup.
 */
export function migrateFocusAssessments(): void {
  const state = loadFocusState();
  if (!state?.areas.length) return;

  let changed = false;
  for (const area of state.areas) {
    // Migrate areas without assessment, or fix inflated values from v1 migration
    const needsMigration = !area.assessment
      || area.assessment.assessedBy === "inference"  // v1 used old confidence scores
      || (area.assessment.assessedBy === "migration" && area.assessment.understanding > 50); // fix inflated v1 migration
    if (needsMigration) {
      // Honest starting values — no inflated numbers
      // Understanding starts low: TL hasn't actually studied these yet
      const hasEval = !!area.preparedBriefing;
      const hasSprint = !!area.lastSprintResults;
      area.assessment = {
        understanding: hasEval ? 40 : 10,
        progress: hasSprint ? 15 : 0,
        assessedAt: area.updatedAt || area.createdAt,
        assessedBy: "migration",
        notes: "Awaiting TL examination for accurate assessment",
      };
      changed = true;
    }
  }
  if (changed) {
    state.version++;
    saveFocusState(state);
    logAction({ ts: Date.now(), type: "action", category: "focus-areas", message: `Migrated ${state.areas.length} focus areas to assessment system` });
  }
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

    const result = JSON.parse(cleanJson(response)) as {
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
    const expertStr = a.experts?.length
      ? `\n  Experts: ${a.experts.map(e => `${e.name} (${e.role})`).join(", ")}`
      : "";
    return `- ${a.title} [${a.focusType || "general"}, ${a.clarity}, ${marker}]: ${a.description}${intentStr}${deeperStr}${matched}${expertStr}`;
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

// ── Gap Analysis ──

export interface FocusGapAnalysis {
  currentState: string;
  gaps: Array<{
    area: string;
    description: string;
    severity: "critical" | "significant" | "minor";
    category: "knowledge" | "skill" | "resource" | "connection" | "time" | "clarity";
  }>;
  bottlenecks: Array<{
    description: string;
    impact: string;
  }>;
  solutions: Array<{
    gap: string;
    solution: string;
    ensoAction: string;  // what Enso can do: "research", "scheduled task", "build app", "cortex search"
    effort: "quick" | "medium" | "significant";
  }>;
  nextPriority: string;
}

/**
 * Analyze gaps and bottlenecks for a focus area.
 * Compares what the user HAS (evidence, entities, skills) against
 * what they NEED to achieve their goal, and suggests solutions
 * using Enso's capabilities.
 */
export async function analyzeFocusGaps(focusId: string): Promise<FocusGapAnalysis | null> {
  const state = loadFocusState();
  if (!state) return null;

  const area = state.areas.find(a => a.id === focusId);
  if (!area) return null;

  try {
    const { llm } = await import("./llm.js");
    const { buildDataInventory } = await import("./cortex-synthesis.js");
    const { getEntityIndex } = await import("./entity-model.js");
    const { getCortexContextSummary } = await import("./cortex-tools.js");

    const inventory = buildDataInventory(3000);
    const evidenceStr = area.evidence.map(e => `- ${e}`).join("\n");

    // Build concrete stats about what Enso Cortex ALREADY has
    const entityIndex = getEntityIndex();
    let withTags = 0, withCrossRefs = 0, withVideos = 0;
    const sourceCounts: Record<string, number> = {};
    for (const [, entry] of entityIndex) {
      sourceCounts[entry.source] = (sourceCounts[entry.source] || 0) + 1;
      if (entry.semanticTags?.length) withTags++;
      if (entry.crossReferences?.length) withCrossRefs++;
      if ((entry as any).recommendedVideos?.length) withVideos++;
    }
    const sourceBreakdown = Object.entries(sourceCounts).map(([s, c]) => `${s}: ${c}`).join(", ");
    const cortexSummary = getCortexContextSummary(1000);

    // Find entities specifically relevant to THIS focus area
    const { findRelatedContent } = await import("./cortex-synthesis.js");
    const related = findRelatedContent(area.title, 5);
    const relevantEntities = related.hits.slice(0, 15).map(h => `- "${h.title}" [${h.source}]`).join("\n");

    const prompt = `You are a focused analyst examining ONE SPECIFIC GOAL to identify what's missing and how to make progress.

## THE GOAL (analyze THIS and ONLY this)
**"${area.title}"**
${area.description}
${area.intent ? `Intent: ${area.intent}` : ""}
${area.deeperIntent ? `Deeper motivation: ${area.deeperIntent}` : ""}
Clarity: ${area.clarity} | Trend: ${area.progress.trend}

## Evidence of Activity for THIS Goal
${evidenceStr || "(none)"}

## Relevant Items in User's Library (specific to THIS goal)
${relevantEntities || "(no matching items found)"}

## User's Broader Data (for context only)
${inventory}

## Platform Capabilities (Enso)
The user has Enso — an AI platform with ${entityIndex.size} knowledge entities, cross-source connections, research tools, app building, scheduled tasks, and evolution sprints.

## RULES
1. Every gap and solution must be SPECIFICALLY about "${area.title}" — NOT about generic platform features
2. Do NOT analyze other goals or suggest generic "knowledge graph" improvements
3. Gaps should be practical obstacles to achieving THIS specific goal
4. Solutions should be concrete actions: "Research best camera settings for street photography in low light" NOT "Build a classification tool"
5. Reference the user's ACTUAL evidence when relevant
6. Each solution must name a specific action: /research [topic], scheduled task for [what], build app for [what], /evolve for [what]

Return JSON:

{
  "currentState": "1-2 sentence summary of where they are right now",
  "gaps": [
    {
      "area": "short label (e.g., 'Backtesting Framework')",
      "description": "what's missing and why it matters",
      "severity": "critical|significant|minor",
      "category": "knowledge|skill|resource|connection|time|clarity"
    }
  ],
  "bottlenecks": [
    {
      "description": "what's blocking progress right now",
      "impact": "what happens if this isn't resolved"
    }
  ],
  "solutions": [
    {
      "gap": "which gap this solves",
      "solution": "concrete action to take",
      "ensoAction": "research|scheduled_task|build_app|cortex_search|evolution|chat",
      "effort": "quick|medium|significant"
    }
  ],
  "nextPriority": "the single most important thing to do next (1 sentence)"
}

Remember: EVERY gap, bottleneck, and solution must be about "${area.title}" specifically.
For example, if the goal is about photography travel, gaps should be about photography techniques, travel planning, equipment, or creative vision — NOT about data classification or knowledge graphs.`;

    const response = await llm({
      prompt,
      tier: "utility",
      maxOutputTokens: 3000,
      responseMimeType: "application/json",
      temperature: 0.3,
      timeoutMs: 60_000,
    });

    const result = JSON.parse(cleanJson(response)) as FocusGapAnalysis;

    logAction({
      ts: Date.now(), type: "action", category: "focus-areas",
      message: `Gap analysis for "${area.title}": ${result.gaps?.length || 0} gaps, ${result.bottlenecks?.length || 0} bottlenecks`,
    });

    return result;
  } catch (err) {
    logError("focus-areas", `Gap analysis failed for "${area.title}"`, err);
    return null;
  }
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

    const parsed = JSON.parse(cleanJson(response)) as { matches: Array<{ idx: number; reason: string }> };
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
