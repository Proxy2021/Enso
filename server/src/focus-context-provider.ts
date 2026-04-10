/**
 * Focus Context Provider — First consumer of the Conversation Context Registry.
 *
 * When a user chats inside a focus area, this provider:
 *   1. Injects rich, zero-LLM context into the system prompt (focus state + Cortex + cross-source)
 *   2. Generates proactive messages when state changes (quiet focus, new related content, clarity upgrades)
 *   3. Handles events from Cortex ingest, sprints, and research to surface relevant insights
 */

import type { ConversationContextProvider, ProactiveMessage, ContextEvent } from "./conversation-context.js";
import type { FocusArea } from "./focus-areas.js";
import { logAction } from "./action-log.js";

// ── Provider Implementation ──

export class FocusContextProvider implements ConversationContextProvider {
  type = "focus" as const;
  sourceId: string;
  private focusId: string;
  /** Timestamp of last proactive check (for change detection) */
  private lastCheckedAt: number = Date.now();
  /** Cached entity count at last check (for new-content detection) */
  private lastKnownEntityCount = 0;

  constructor(focusId: string) {
    this.focusId = focusId;
    this.sourceId = focusId;
  }

  // ── 1. System Prompt Context ──

  async getContextForPrompt(): Promise<string> {
    var focus: FocusArea | null = null;
    try {
      const { loadFocusState } = await import("./focus-areas.js");
      const state = loadFocusState();
      focus = state?.areas.find(a => a.id === this.focusId) ?? null;
    } catch { /* focus areas not available */ }
    if (!focus) return "";

    var sections: string[] = [];

    // Layer 1: Focus state (instant)
    sections.push(buildFocusStateBlock(focus));

    // Layer 2: Related Cortex pages (instant, zero LLM)
    try {
      const { searchIndex } = await import("./cortex-tools.js");
      if (focus.semanticTags.length > 0) {
        var cortexHits = searchIndex(focus.semanticTags.join(" "), 8);
        // Also search by title keywords for broader coverage
        var titleHits = searchIndex(focus.title, 5);
        // Merge and deduplicate
        var seen = new Set(cortexHits.map(e => e.path));
        for (var hit of titleHits) {
          if (!seen.has(hit.path)) {
            cortexHits.push(hit);
            seen.add(hit.path);
          }
        }
        if (cortexHits.length > 0) {
          sections.push(
            "## From Your Knowledge Base\n" +
            cortexHits.slice(0, 10).map(e =>
              `- **${e.title}** (${e.source || "cortex"}): ${e.summary}`
            ).join("\n")
          );
        }
      }
    } catch { /* cortex not available */ }

    // Layer 3: Cross-source hits (instant, zero LLM)
    try {
      const { findRelatedContent } = await import("./cortex-synthesis.js");
      var related = findRelatedContent(focus.title, 3);
      if (related.totalMatches > 0) {
        var sourceLines: string[] = [];
        for (var [src, hits] of Object.entries(related.bySource)) {
          if (hits.length > 0) {
            sourceLines.push(`- **${src}**: ${hits.map(h => h.title).join(", ")}`);
          }
        }
        if (sourceLines.length > 0) {
          sections.push("## Related Across Your World\n" + sourceLines.join("\n"));
        }
      }
    } catch { /* synthesis not available */ }

    // Behavioral instructions based on clarity
    sections.push(buildBehavioralInstructions(focus));

    return `<active_focus_area>\nThis conversation is DEDICATED to the user's focus area: "${focus.title}"\nAll your responses should be grounded in helping with this specific focus.\n\n${sections.join("\n\n")}\n</active_focus_area>`;
  }

  // ── 2. Proactive Messages ──

  async getProactiveMessages(): Promise<ProactiveMessage[]> {
    var focus: FocusArea | null = null;
    try {
      const { loadFocusState } = await import("./focus-areas.js");
      var state = loadFocusState();
      focus = state?.areas.find(a => a.id === this.focusId) ?? null;
    } catch { return []; }
    if (!focus) return [];

    var messages: ProactiveMessage[] = [];
    var now = Date.now();

    // Check: focus going quiet (no activity in 7+ days)
    if (focus.progress.lastActiveAt) {
      var daysSinceActive = (now - new Date(focus.progress.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActive > 7 && focus.status === "active") {
        messages.push({
          text: `It's been about ${Math.floor(daysSinceActive)} days since any activity on "${focus.title}". ${focus.nextSteps?.length ? `Your next planned step was: "${focus.nextSteps[0]}". Still relevant?` : "Want to talk about what's blocking progress, or has your focus shifted?"}`,
          priority: "medium",
          dedupKey: `focus-quiet-${this.focusId}`,
        });
      }
    }

    // Check: stale next steps (defined but no recent activity)
    if (focus.nextSteps?.length && focus.progress.trend === "quiet") {
      messages.push({
        text: `You had these next steps for "${focus.title}":\n${focus.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nAny progress on these, or should we reprioritize?`,
        priority: "low",
        dedupKey: `focus-stale-steps-${this.focusId}`,
      });
    }

    // Check: new related Cortex entities since last check
    try {
      const { searchIndex } = await import("./cortex-tools.js");
      if (focus.semanticTags.length > 0) {
        var hits = searchIndex(focus.semanticTags.join(" "), 20);
        if (hits.length > this.lastKnownEntityCount && this.lastKnownEntityCount > 0) {
          var newCount = hits.length - this.lastKnownEntityCount;
          var newest = hits.slice(0, newCount);
          messages.push({
            text: `I noticed ${newCount} new item${newCount > 1 ? "s" : ""} in your knowledge base related to "${focus.title}": ${newest.map(e => e.title).join(", ")}. Want to discuss how ${newCount > 1 ? "they connect" : "it connects"} to your goals?`,
            priority: "low",
            dedupKey: `focus-new-content-${this.focusId}-${hits.length}`,
          });
        }
        this.lastKnownEntityCount = hits.length;
      }
    } catch { /* cortex not available */ }

    this.lastCheckedAt = now;
    return messages;
  }

  // ── 3. Event Handling ──

  async onEvent(event: ContextEvent): Promise<ProactiveMessage | null> {
    var focus: FocusArea | null = null;
    try {
      const { loadFocusState } = await import("./focus-areas.js");
      var state = loadFocusState();
      focus = state?.areas.find(a => a.id === this.focusId) ?? null;
    } catch { return null; }
    if (!focus) return null;

    switch (event.type) {
      case "cortex.entity.created": {
        var entityTags = (event.payload.semanticTags as string[]) ?? [];
        var entityTitle = (event.payload.title as string) ?? "";
        // Check if entity's tags overlap with focus
        var overlap = entityTags.filter(t => focus!.semanticTags.includes(t));
        if (overlap.length >= 2) {
          return {
            text: `New in your knowledge base: "${entityTitle}" — this relates to your focus on "${focus.title}" through shared themes: ${overlap.join(", ")}. Anything you'd like to explore about this connection?`,
            priority: "low",
            dedupKey: `focus-entity-${this.focusId}-${entityTitle.slice(0, 30)}`,
          };
        }
        break;
      }
      case "research.completed": {
        var topic = (event.payload.topic as string) ?? "";
        // Check if research topic relates to focus
        var focusWords = focus.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        var topicLower = topic.toLowerCase();
        var matchCount = focusWords.filter(w => topicLower.includes(w)).length;
        if (matchCount >= 2) {
          return {
            text: `Your recent research on "${topic}" seems relevant to your focus on "${focus.title}". Want me to connect the findings to your goals?`,
            priority: "medium",
            dedupKey: `focus-research-${this.focusId}-${topic.slice(0, 30)}`,
          };
        }
        break;
      }
      case "focus.refined": {
        if (event.payload.focusId === this.focusId && event.payload.clarityChanged) {
          var newClarity = event.payload.newClarity as string;
          return {
            text: `Your focus "${focus.title}" has evolved to **${newClarity}** clarity! ${newClarity === "clear" ? "You have a well-defined goal now. Ready to plan concrete next steps?" : "We're getting closer to a clear direction. What else can I help clarify?"}`,
            priority: "high",
            dedupKey: `focus-clarity-${this.focusId}-${newClarity}`,
          };
        }
        break;
      }
    }
    return null;
  }
}

// ── Helpers ──

function buildFocusStateBlock(focus: FocusArea): string {
  var lines: string[] = [];
  lines.push(`## Focus: ${focus.title}`);
  lines.push(`**Status:** ${focus.status} | **Clarity:** ${focus.clarity} | **Trend:** ${focus.progress.trend}`);
  lines.push(`**Description:** ${focus.description}`);

  if (focus.intent) lines.push(`**Goal:** ${focus.intent}`);
  if (focus.deeperIntent) lines.push(`**Deeper motivation (WHY):** ${focus.deeperIntent}`);
  if (focus.adjacentPursuits?.length) {
    lines.push(`**Adjacent pursuits to explore:** ${focus.adjacentPursuits.join("; ")}`);
  }
  if (focus.nextSteps?.length) {
    lines.push(`**Planned next steps:** ${focus.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("; ")}`);
  }
  if (focus.evidence.length > 0) {
    lines.push(`**Evidence (from user's data):** ${focus.evidence.join(", ")}`);
  }
  if (focus.progress.recentActivity.length > 0) {
    lines.push(`**Recent activity:** ${focus.progress.recentActivity.join(", ")}`);
  }
  if (focus.refinements.length > 0) {
    var recent = focus.refinements.slice(-3);
    lines.push(`**Recent refinements:** ${recent.map(r => `${r.date.slice(0, 10)}: ${r.change}`).join("; ")}`);
  }
  if (focus.semanticTags.length > 0) {
    lines.push(`**Themes:** ${focus.semanticTags.join(", ")}`);
  }
  return lines.join("\n");
}

function buildBehavioralInstructions(focus: FocusArea): string {
  var base = `## Your Role: Strategic Focus Partner

This conversation is a **strategic planning dialogue**. Your goal is to help the user flesh out all aspects of this focus area until there's a clear, well-defined vision and plan of attack. The full conversation history will eventually feed into an /Evolve orchestration — a multi-agent sprint with an AI team (Architect, Engineer, QA, Marketing, etc.) that will execute on whatever is agreed here.

So think of yourself as a co-strategist helping the user build a comprehensive brief. Be opinionated — offer your perspective, challenge vague thinking, and push for specificity. But always defer to the user's judgment on what matters.`;

  switch (focus.clarity) {
    case "emerging":
      return `${base}

### Phase: DISCOVERY (emerging clarity)
The user hasn't fully defined what they want. Your priorities:
1. **Explore the problem space** — What are they trying to solve? What's the current pain?
2. **Uncover the WHY** — What personal motivation drives this? (financial freedom, intellectual mastery, creative expression, career growth)
3. **Map the landscape** — What exists already? What have they tried? What are the constraints?
4. **Surface connections** — Reference items from their knowledge base that relate to this focus
5. **Propose a frame** — Once you have enough signal, suggest a concrete problem statement and vision for them to react to

Don't just ask questions — offer hypotheses for the user to refine. "Based on what you've described, it sounds like the core challenge is X. Is that right, or is it more about Y?"`;

    case "developing":
      return `${base}

### Phase: DEFINITION (developing clarity)
The user has direction but needs to get concrete. Your priorities:
1. **Define success criteria** — What does "done" look like? How will they know it's working?
2. **Break down the problem** — What are the key dimensions/workstreams?
3. **Identify priorities** — What should be tackled first? What's the highest-leverage action?
4. **Surface risks and gaps** — What could go wrong? What's missing?
5. **Build toward an Evolve brief** — Help the user articulate a clear goal statement that could be handed to the AI team

When it feels like there's enough clarity, suggest: "I think we have a solid understanding now. When you're ready, you could launch an /Evolve sprint with this as the brief — the AI team would focus on [specific goals]. Want to refine anything first?"`;

    case "clear":
      return `${base}

### Phase: EXECUTION PLANNING (clear goal)
The user has a well-defined goal. Your priorities:
1. **Plan the next sprint** — What specific improvements should the AI team focus on?
2. **Review progress** — What's changed since last time? What worked, what didn't?
3. **Prioritize backlog** — The user has next steps defined — help them pick the right ones
4. **Challenge assumptions** — Are the current priorities still right? Has anything changed?
5. **Prep for Evolve** — Help craft a focused sprint brief: "Fix X, improve Y, add Z"

The user can launch /Evolve at any time. Help them make sure the sprint goals are specific, measurable, and achievable in a single sprint cycle.`;
  }
}
