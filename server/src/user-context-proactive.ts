/**
 * User Context — Proactive Assistance
 *
 * Generates daily briefings and contextual suggestions based on the
 * user's context profile. Injected into agent system prompts on
 * the first message of a session.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { logAction } from "./action-log.js";
import type { UserContextProfile } from "./user-context-types.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const ENSO_HOME = join(homedir(), ".enso");
const CONTEXT_DIR = join(ENSO_HOME, "data", "user-context");
const PROFILE_PATH = join(CONTEXT_DIR, "profile.json");
const CACHE_DIR = join(CONTEXT_DIR, "cache");

// ── Daily Briefing Cache ─────────────────────────────────────────────────────

let _cachedBriefing: { text: string; date: string } | null = null;

/**
 * Generate a daily briefing block for the agent's system prompt.
 * Only produced on the first message of a session (when history is empty).
 * Cached per day to avoid repeated generation.
 *
 * Returns null if no profile or no interesting context to share.
 */
export function getDailyBriefing(): string | null {
  const today = new Date().toISOString().slice(0, 10);

  // Return cached if still same day
  if (_cachedBriefing?.date === today) return _cachedBriefing.text;

  if (!existsSync(PROFILE_PATH)) return null;

  try {
    const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8")) as UserContextProfile;

    // Don't generate briefings from stale profiles (>3 days)
    if (Date.now() - profile.lastUpdated > 3 * 86400000) return null;

    const parts: string[] = [];

    // Recent projects
    if (profile.workProjects.length > 0) {
      const recentProjects = profile.workProjects.slice(0, 3);
      const projectList = recentProjects
        .map(p => `${p.name} (${p.technologies.slice(0, 2).join(", ")})`)
        .join(", ");
      parts.push(`Active projects: ${projectList}`);
    }

    // Recent search interests
    if (profile.tools.recentSearches.length > 0) {
      const searches = profile.tools.recentSearches
        .slice(0, 5)
        .map(s => s.query)
        .join("; ");
      parts.push(`Recent research topics: ${searches}`);
    }

    // Email highlights (from cache)
    try {
      const emailCache = join(CACHE_DIR, "email-summary.json");
      if (existsSync(emailCache)) {
        const emailData = JSON.parse(readFileSync(emailCache, "utf-8")) as {
          totalEmails?: number;
          recentSubjects?: Array<{ from: string; subject: string; date: string }>;
        };
        if (emailData.recentSubjects && emailData.recentSubjects.length > 0) {
          const highlights = emailData.recentSubjects.slice(0, 3)
            .map(e => `"${e.subject}" from ${e.from.split("<")[0].trim()}`)
            .join("; ");
          parts.push(`Recent emails: ${highlights}`);
        }
      }
    } catch { /* ignore */ }

    // Top interests
    if (profile.interests.length > 0) {
      const topInterests = profile.interests
        .filter(i => i.confidence >= 0.6)
        .slice(0, 5)
        .map(i => i.topic)
        .join(", ");
      if (topInterests) parts.push(`Key interests: ${topInterests}`);
    }

    if (parts.length === 0) return null;

    const briefing = `The user's current context (from their desktop environment — browser, email, projects):\n${parts.join("\n")}`;

    _cachedBriefing = { text: briefing, date: today };
    logAction({
      ts: Date.now(), type: "action", category: "user-context-proactive",
      message: `Daily briefing generated: ${parts.length} sections`,
    });

    return briefing;
  } catch {
    return null;
  }
}
