/**
 * Interaction Tracker — per-app interaction history for Living Apps.
 *
 * Records every app interaction (actions, enhance, refine, errors) to a
 * per-family document collection. This data powers:
 *   - Personalized executor behavior (apps that learn from usage)
 *   - Contextual debugging (failure trails for auto-heal & fix_with_code)
 *   - Cross-session continuity (recent apps, morning briefing)
 *   - Cross-app intelligence (relationship detection)
 *
 * Storage: ~/.openclaw/enso-data/<family>/interactions/
 *   Uses the existing DocCollection infrastructure (indexed, auto-pruned).
 */

import { randomUUID } from "node:crypto";
import { getDocCollection, type DocMeta } from "./persistence.js";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export type InteractionType = "action" | "enhance" | "refine" | "view" | "error";

export interface AppInteraction {
  type: InteractionType;
  action?: string;                      // card action name (for type=action)
  payload?: unknown;                    // sanitized, max 1KB
  toolName?: string;                    // which executor ran
  params?: Record<string, unknown>;     // executor params
  resultSummary?: string;               // first 200 chars of result
  error?: string;                       // error message (for type=error)
  cardId?: string;
  timestamp: number;
}

export interface InteractionMeta extends DocMeta {
  type: string;
  action: string;
}

export interface FailureContext {
  /** Recent interactions leading up to the failure (newest first) */
  interactionTrail: AppInteraction[];
  /** Human-readable action sequence */
  actionSequence: string;
  /** Whether this error has occurred before recently */
  isRecurring: boolean;
  /** Number of times this error appeared in recent interactions */
  occurrenceCount: number;
  /** Formatted context string ready for injection into debug prompts */
  formatted: string;
}

// ── Constants ──

const MAX_INTERACTIONS = 200;
const MAX_PAYLOAD_SIZE = 1024; // 1KB
const MAX_RESULT_SUMMARY = 200;

// ── Helpers ──

/** Truncate payload to max size for storage efficiency. */
function sanitizePayload(payload: unknown): unknown {
  if (payload == null) return undefined;
  try {
    const json = JSON.stringify(payload);
    if (json.length <= MAX_PAYLOAD_SIZE) return payload;
    // Truncate: return a summary object
    return { _truncated: true, _preview: json.slice(0, MAX_PAYLOAD_SIZE) };
  } catch {
    return { _error: "unserializable" };
  }
}

/** Generate a short ID from timestamp + random suffix. */
function interactionId(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

// ── Core API ──

/**
 * Record an app interaction to the per-family interaction history.
 * Safe to call from any context — errors are swallowed and logged.
 */
export function recordAppInteraction(toolFamily: string | undefined, interaction: AppInteraction): void {
  if (!toolFamily) return;

  try {
    const coll = getDocCollection<AppInteraction, InteractionMeta>(
      toolFamily,
      "interactions",
      { maxEntries: MAX_INTERACTIONS },
    );

    const sanitized: AppInteraction = {
      ...interaction,
      payload: sanitizePayload(interaction.payload),
      resultSummary: interaction.resultSummary?.slice(0, MAX_RESULT_SUMMARY),
      timestamp: interaction.timestamp || Date.now(),
    };

    coll.save(interactionId(), sanitized, {
      type: interaction.type,
      action: interaction.action ?? interaction.toolName ?? interaction.type,
    });
  } catch (err) {
    // Never let interaction tracking break the main flow
    logError("interaction-tracker", `Failed to record interaction for ${toolFamily}`, err);
  }
}

/**
 * Get recent interactions for a given app family.
 * Returns newest first, up to `count` entries.
 */
export function getRecentInteractions(toolFamily: string, count = 20): AppInteraction[] {
  try {
    const coll = getDocCollection<AppInteraction, InteractionMeta>(
      toolFamily,
      "interactions",
      { maxEntries: MAX_INTERACTIONS },
    );

    const entries = coll.list().slice(0, count);
    const interactions: AppInteraction[] = [];

    for (const entry of entries) {
      const doc = coll.load(entry.id);
      if (doc) interactions.push(doc);
    }

    return interactions;
  } catch (err) {
    logError("interaction-tracker", `Failed to read interactions for ${toolFamily}`, err);
    return [];
  }
}

/**
 * Detect whether the same error has occurred multiple times in recent interactions.
 * Returns the count of similar errors.
 */
function detectRepeatFailures(interactions: AppInteraction[], currentError: string): number {
  // Normalize error for comparison (strip line numbers, memory addresses, UUIDs)
  const normalize = (e: string) =>
    e.replace(/\b\d+\b/g, "N")
      .replace(/[0-9a-f]{8,}/gi, "ID")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

  const normalizedCurrent = normalize(currentError);

  return interactions.filter(
    (i) => i.type === "error" && i.error && normalize(i.error) === normalizedCurrent,
  ).length;
}

/**
 * Build a failure context object with the full interaction trail and analysis.
 * Used by autoHealExecutor() and fix_with_code to provide debugging context.
 */
export function buildFailureContext(
  toolFamily: string,
  error: string,
  count = 10,
): FailureContext {
  const trail = getRecentInteractions(toolFamily, count);
  const occurrenceCount = detectRepeatFailures(trail, error);
  const isRecurring = occurrenceCount >= 2;

  // Build human-readable action sequence (oldest first for chronological reading)
  const chronological = [...trail].reverse();
  const actionSequence = chronological
    .map((i) => `${i.type}:${i.action ?? i.toolName ?? "?"}`)
    .join(" → ");

  // Build formatted context for prompt injection
  const lines: string[] = [
    `## Recent Interaction Trail (last ${trail.length} actions, chronological)`,
    "",
  ];

  for (let idx = 0; idx < chronological.length; idx++) {
    const i = chronological[idx];
    const num = idx + 1;
    const label = i.action ?? i.toolName ?? i.type;
    const params = i.params ? ` (params: ${JSON.stringify(i.params).slice(0, 200)})` : "";
    const errSuffix = i.type === "error" ? `  ← FAILED: ${i.error?.slice(0, 100)}` : "";
    lines.push(`  ${num}. ${i.type} → ${label}${params}${errSuffix}`);
  }

  lines.push("");

  if (isRecurring) {
    lines.push(
      `⚠️ RECURRING FAILURE: This exact error has occurred ${occurrenceCount} times in the last ${trail.length} interactions.`,
      `This suggests a systematic bug (not an edge case). The executor likely needs`,
      `structural changes, not just a null check.`,
    );
  } else {
    lines.push(
      `Pattern: First occurrence of this error in recent history.`,
      `This may be an edge case triggered by the specific action sequence above.`,
    );
  }

  return {
    interactionTrail: trail,
    actionSequence,
    isRecurring,
    occurrenceCount,
    formatted: lines.join("\n"),
  };
}
