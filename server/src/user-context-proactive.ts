/**
 * User Context — Proactive Assistance
 *
 * Generates daily briefings and contextual suggestions based on the
 * user's context profile. Injected into agent system prompts on
 * the first message of a session.
 *
 * Now delegates to the proactive engine for structured digest generation
 * while maintaining the legacy getDailyBriefing() text interface.
 */

import { getDailyBriefingCompat, generateDailyDigest } from "./proactive-engine.js";
export type { DailyDigest, DigestItem } from "./proactive-engine.js";

/**
 * Generate a daily briefing block for the agent's system prompt.
 * Now powered by the proactive engine for richer analysis.
 * Cached per day to avoid repeated generation.
 *
 * Returns null if no profile or no interesting context to share.
 */
export function getDailyBriefing(): string | null {
  return getDailyBriefingCompat();
}

/**
 * Generate a structured daily digest with categorized items.
 * Used by the DailyDigestCard frontend component.
 */
export { generateDailyDigest };
