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

    // Layer 0: Prepared briefing (from "Prepare" phase — comprehensive deep study)
    if (focus.preparedBriefing) {
      sections.push(`## Preparation Briefing (from deep study on ${focus.preparedAt?.slice(0, 10) || "unknown"})\n${focus.preparedBriefing}`);
    }

    // Layer 0.5: Sprint results (from last Evolve sprint — structured deliverables with pain points)
    if ((focus as any).lastSprintSummary) {
      var summary = (focus as any).lastSprintSummary as { sprintSummary: string; deliverables: Array<{ taskTitle: string; entityType: string; howItHelps: string; quickStart: string }>; recommendedFirstAction?: { deliverableIndex: number; reason: string }; nextSteps: string[] };
      sections.push(
        `## Last Sprint Results (${(focus as any).lastSprintDate?.slice(0, 10) || "recent"})\n` +
        `${summary.sprintSummary}\n\n` +
        `### Deliverables\n` +
        summary.deliverables.map((d, i) =>
          `${i + 1}. **${d.taskTitle}** (${d.entityType}): ${d.howItHelps}\n   Quick start: ${d.quickStart}`
        ).join("\n") +
        (summary.recommendedFirstAction ? `\n\n### Recommended First Action\n${summary.recommendedFirstAction.reason}` : "") +
        (summary.nextSteps.length ? `\n\n### Suggested Next Steps\n${summary.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "")
      );
    } else if ((focus as any).lastSprintResults) {
      // Fallback: raw sprint results (pre-structured-summary era)
      sections.push(`## Last Sprint Results (${(focus as any).lastSprintDate?.slice(0, 10) || "recent"})\n${((focus as any).lastSprintResults as string).slice(0, 3000)}`);
    }

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
      case "sprint.completed": {
        if (event.payload.focusId === this.focusId) {
          var sprintSummary = event.payload.sprintSummary as { sprintSummary: string; deliverables: Array<{ quickStart: string }>; recommendedFirstAction?: { deliverableIndex: number; reason: string }; nextSteps: string[] } | undefined;
          if (sprintSummary) {
            var recommended = sprintSummary.deliverables[sprintSummary.recommendedFirstAction?.deliverableIndex ?? 0];
            var startAction = recommended?.quickStart || "Open the Focus tab to review results.";
            return {
              text: `✅ Sprint complete for "${focus.title}"!\n\n${sprintSummary.sprintSummary}\n\n**Start here:** ${startAction}\n\n**Next steps:**\n${sprintSummary.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nReady to review the full results, or shall we plan the next cycle?`,
              priority: "high",
              dedupKey: `sprint-complete-${this.focusId}-${Date.now()}`,
            };
          }
          return {
            text: `✅ Sprint complete for "${focus.title}"! Open the Focus tab to review deliverables and decide on next steps.`,
            priority: "high",
            dedupKey: `sprint-complete-${this.focusId}-${Date.now()}`,
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
  // Determine the decision point — what does the user need from this conversation?
  var hasBriefing = !!focus.preparedBriefing;
  var hasSprint = !!(focus as any).lastSprintResults;
  var hasSprintSummary = !!(focus as any).lastSprintSummary;
  var daysSinceActivity = focus.progress.lastActiveAt
    ? Math.floor((Date.now() - new Date(focus.progress.lastActiveAt).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  var decisionContext = "";

  if (hasSprint && hasSprintSummary) {
    decisionContext = `### DECISION POINT: Post-Sprint Review
The last sprint produced concrete deliverables (see "Last Sprint Results" above). You should:
1. **Lead with impact** — "Your last sprint achieved [specific result]. Here's what changed."
2. **Highlight the most useful deliverable** — "The most valuable thing produced is X. Try it by [specific action]."
3. **Propose next cycle** — Present 2-3 options for what to focus on next, with your recommendation and why.
4. **Ask for a decision** — "Which direction do you want to go? I can launch a sprint on your word."`;
  } else if (hasSprint && !hasSprintSummary) {
    decisionContext = `### DECISION POINT: Sprint Results Available
A sprint has completed. Review the results above and:
1. **Summarize the impact** in 2-3 sentences — what changed, what matters
2. **Recommend the single most important thing** the user should do next
3. **Propose the next sprint direction** with clear options`;
  } else if (hasBriefing && !hasSprint) {
    decisionContext = `### DECISION POINT: Evaluation Complete, Ready to Act
The evaluation briefing is ready (see above). You should:
1. **Distill to key findings** — "From the evaluation, the 3 things that matter most are..."
2. **Present 2-3 action options** — Each with a clear tradeoff (effort vs impact, risk vs reward)
3. **State your recommendation** — "I recommend Option B because [specific reason]."
4. **Offer to launch** — "Say the word and I'll launch a sprint focused on [specific goal]."`;
  } else if (!hasBriefing && !hasSprint && daysSinceActivity > 7) {
    decisionContext = `### DECISION POINT: Stalled Goal
This focus area has been quiet for ${daysSinceActivity} days. You should:
1. **Acknowledge the gap** honestly — "It's been a while since we worked on this."
2. **Diagnose** — Ask ONE targeted question about what's blocking progress
3. **Propose a restart** — "I suggest we run an evaluation to see where things stand. Want me to start?"`;
  } else {
    decisionContext = `### DECISION POINT: Getting Started
This focus area hasn't been evaluated yet. You should:
1. **Show you understand the goal** — Reference specific evidence from their data
2. **Propose an evaluation** — "I recommend running a deep study on this to map the landscape and find the highest-leverage action."
3. **Explain what you'll do** — "I'll research [topic], analyze [data], and come back with concrete options."`;
  }

  return `## Your Role: Proactive Focus Agent

You are NOT a passive assistant waiting for questions. You are a **proactive co-strategist** who arrives at every conversation with a RECOMMENDATION.

**Core rules:**
- **Lead with a recommendation**, not an open question. "I think we should do X because Y" not "What would you like to discuss?"
- **Present options with tradeoffs** when decisions are needed. 2-3 concrete choices, each with effort/impact/risk.
- **State your pick and why.** The user can override, but they should never have to think from scratch.
- **End every response with a clear next action.** Either "Shall I proceed?" or "Which option do you prefer?"
- **Reference specific data** — sprint results, Cortex entities, evidence. Never be generic.
- **Keep it concise.** Decisions, not dissertations. The user's time is valuable.

The full conversation history will feed into an /Evolve orchestration — a multi-agent sprint that executes on agreed goals. Your job is to get to a clear, specific sprint brief as efficiently as possible.

${decisionContext}`;
}

// ── Expert Context Provider ──

/**
 * Context provider for expert conversations — makes the LLM behave as a specific
 * domain expert when chatting inside an expert's dedicated conversation.
 */
export class ExpertContextProvider implements ConversationContextProvider {
  type = "expert" as const;
  sourceId: string;
  private focusId: string;
  private expertId: string;

  constructor(focusId: string, expertId: string) {
    this.focusId = focusId;
    this.expertId = expertId;
    this.sourceId = `${focusId}:${expertId}`;
  }

  async getContextForPrompt(): Promise<string> {
    var focus: FocusArea | null = null;
    var expert: import("./project-manager.js").TeamAgent | null = null;
    try {
      const { loadFocusState } = await import("./focus-areas.js");
      var state = loadFocusState();
      focus = state?.areas.find(a => a.id === this.focusId) ?? null;
      expert = focus?.experts?.find(e => e.id === this.expertId) ?? null;
    } catch { return ""; }
    if (!focus || !expert) return "";

    // Build expert persona
    var sections: string[] = [];

    sections.push(`## You ARE ${expert.name}

**Role:** ${expert.role}
**Perspective:** ${expert.perspective}

${expert.responsibilities}

**Your goals for this focus area:**
${expert.goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}
${expert.painPoints?.length ? `\n**Pain points you watch for:**\n${expert.painPoints.map(p => `- ${p}`).join("\n")}` : ""}`);

    // Focus context — what the user is working on
    sections.push(`## Focus: ${focus.title}
${focus.description}
${focus.intent ? `**Goal:** ${focus.intent}` : ""}
${focus.deeperIntent ? `**Why it matters:** ${focus.deeperIntent}` : ""}`);

    // Other experts on the team — so this expert can reference/defer to them
    var otherExperts = focus.experts?.filter(e => e.id !== this.expertId) ?? [];
    if (otherExperts.length > 0) {
      sections.push(`## Your Team
You work alongside these experts on this focus area:
${otherExperts.map(e => `- **${e.name}** (${e.role}): ${e.perspective}`).join("\n")}
If a question falls outside your expertise, suggest the user talk to the appropriate team member.`);
    }

    // Related Cortex knowledge
    try {
      const { searchIndex } = await import("./cortex-tools.js");
      var hits = searchIndex(focus.title + " " + expert.role, 5);
      if (hits.length > 0) {
        sections.push(`## Relevant Knowledge
${hits.map(h => `- **${h.title}**: ${h.summary}`).join("\n")}`);
      }
    } catch { /* cortex not available */ }

    return `<expert_persona>
This conversation is with ${expert.name}, a domain expert for the focus area "${focus.title}".

CRITICAL INSTRUCTIONS:
- You ARE ${expert.name}. Respond in first person as this expert.
- You have deep domain knowledge in your area. Share opinions, push back on bad ideas, challenge assumptions.
- You are NOT a generic AI assistant. You are a specialist with a distinct perspective.
- Reference your specific expertise and the user's data when relevant.
- If asked about something outside your domain, acknowledge the boundary and suggest which team member might help.
- Be warm but direct. Experts have opinions — share yours.

${sections.join("\n\n")}
</expert_persona>`;
  }

  async getProactiveMessages(): Promise<ProactiveMessage[]> {
    return [];
  }

  async onEvent(_event: ContextEvent): Promise<ProactiveMessage | null> {
    return null;
  }
}
