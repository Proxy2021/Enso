/**
 * Sprint proposal check — after TL completes a Claude Code task triggered by a
 * user react on a focus area, decide whether the intent is now concrete enough
 * to warrant a multi-agent sprint. If yes, emit a "sprint-proposal" card into
 * the focus conversation with scope, estimated cost/time, deliverables preview,
 * and a Launch Sprint button.
 *
 * Fires AFTER the TL Claude Code task completes, so the "response to user"
 * is available as grounding. Uses the unified llm() layer.
 */
import { randomUUID } from "node:crypto";
import { logAction, logError } from "./action-log.js";
import { llm } from "./llm.js";
import { cleanJson } from "./json-utils.js";
import { loadFocusState } from "./focus-areas.js";
import { getAllClients } from "./server.js";
import type { ServerMessage } from "../../shared/types.js";

export interface SprintProposalData {
  kind: "sprint-proposal";
  focusId: string;
  focusTitle: string;
  scope: string;
  deliverables: string[];
  briefing: string;
  estimatedCost: string;
  estimatedHours: string;
  reasoning: string;
}

/**
 * Check if a sprint should be proposed given the conversation context, and if so
 * deliver a proposal card into the focus's conversation.
 */
export async function maybeProposeSprintAfterTask(params: {
  focusId: string;
  userRequest: string;
  tlResponse: string;
  conversationId: string;
}): Promise<void> {
  const { focusId, userRequest, tlResponse, conversationId } = params;

  const state = loadFocusState();
  const area = state?.areas.find(a => a.id === focusId);
  if (!area) return;

  const prompt = `You are the Team Leader of Enso. You just answered a user question about the focus area "${area.title}".

Now decide whether the user's intent is concrete enough to justify launching a multi-agent sprint — a roughly 1-hour, $8-12 orchestration where 4-6 Claude Code agents work in parallel to produce tangible deliverables (research docs, built apps, analyses, plans, code changes).

FOCUS AREA: ${area.title}
FOCUS INTENT: ${area.intent || area.description || "(not set)"}
${area.deeperIntent ? `DEEPER WHY: ${area.deeperIntent}` : ""}

USER'S REQUEST:
"""
${userRequest.slice(0, 2500)}
"""

YOUR RESPONSE (summary of what you just told the user):
"""
${tlResponse.slice(0, 2500)}
"""

Criteria for proposing a sprint:
- The user's intent is concrete and actionable — there is clear work to do
- The work would genuinely benefit from parallel agents (research + analysis + builds + synthesis)
- Your response revealed or confirmed a clear direction worth executing on
- Scope fits a ~1hr sprint — not a trivial fix, not a multi-day project
- It is NOT just a question, a clarification, or open-ended discussion

If a sprint is NOT warranted, return:
{"propose": false, "reason": "<one sentence why — e.g. 'User was just asking a question, no concrete work to do' or 'Scope too ambiguous — needs more discussion'"}

If a sprint IS warranted, return:
{
  "propose": true,
  "scope": "<one-sentence description of what the sprint will accomplish>",
  "deliverables": ["<deliverable 1>", "<deliverable 2>", "..."],
  "briefing": "<2-3 paragraph sprint briefing that synthesizes the user's intent, any decisions from your response, and the specific work to be done. This feeds the sprint planner as the goal.>",
  "reasoning": "<one sentence on why this is the right moment to launch>"
}

Deliverables should be concrete outputs (3-6 items), e.g. "Research doc on MusicBrainz integration patterns", "Unified media library schema design", "Working import script for Kindle → Cortex".

Return JSON only, no markdown.`;

  let response: string;
  try {
    response = await llm({
      prompt,
      tier: "utility",
      maxOutputTokens: 1500,
      temperature: 0.3,
      timeoutMs: 30_000,
    });
  } catch (err) {
    logError("sprint-proposal", `LLM call failed for focus "${area.title}"`, err);
    return;
  }

  let parsed: {
    propose: boolean;
    scope?: string;
    deliverables?: string[];
    briefing?: string;
    reasoning?: string;
    reason?: string;
  };
  try {
    parsed = JSON.parse(cleanJson(response));
  } catch {
    logAction({ ts: Date.now(), type: "action", category: "sprint-proposal",
      message: `LLM returned unparseable response for focus "${area.title}"` });
    return;
  }

  if (!parsed.propose) {
    logAction({ ts: Date.now(), type: "action", category: "sprint-proposal",
      message: `Sprint not proposed for "${area.title}": ${parsed.reason || "no reason given"}` });
    return;
  }

  if (!parsed.briefing || !parsed.scope) {
    logAction({ ts: Date.now(), type: "action", category: "sprint-proposal",
      message: `Sprint proposal incomplete for "${area.title}" — missing briefing/scope` });
    return;
  }

  const deliverables = Array.isArray(parsed.deliverables) ? parsed.deliverables.slice(0, 6) : [];

  const proposalData: SprintProposalData = {
    kind: "sprint-proposal",
    focusId: area.id,
    focusTitle: area.title,
    scope: parsed.scope,
    deliverables,
    briefing: parsed.briefing,
    estimatedCost: "$8-12",
    estimatedHours: "~1 hour",
    reasoning: parsed.reasoning || "",
  };

  // Deliver card to every connected client — frontend filters by conversationId.
  const clients = getAllClients();
  if (clients.length === 0) {
    logAction({ ts: Date.now(), type: "action", category: "sprint-proposal",
      message: `No connected clients to deliver proposal for "${area.title}"` });
    return;
  }

  const cardId = randomUUID();
  const runId = randomUUID();
  const text = `**Ready to launch a sprint on "${area.title}"?**\n\n${parsed.scope}`;
  const timestamp = Date.now();

  const { persistCard } = await import("./memory-bridge.js");

  for (const client of clients) {
    const msg: ServerMessage = {
      id: cardId,
      runId,
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      conversationId,
      cardType: "sprint-proposal",
      text,
      data: proposalData,
      timestamp,
    };
    try {
      client.send(msg);
    } catch (err) {
      logError("sprint-proposal", "Failed to deliver proposal card", err);
    }

    // Persist to each client's journal so the card survives page reloads.
    try {
      persistCard(client.id, conversationId, {
        id: cardId,
        runId,
        type: "sprint-proposal",
        role: "assistant",
        text,
        data: proposalData as unknown,
        timestamp,
      });
    } catch (err) {
      logError("sprint-proposal", "Failed to persist proposal card", err);
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "sprint-proposal",
    message: `Proposed sprint for "${area.title}": ${parsed.scope}` });
}
