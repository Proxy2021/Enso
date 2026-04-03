/**
 * User Context Builder — Profile Synthesis
 *
 * Orchestrates scanning of consented data sources, reduces the raw data locally,
 * then uses Gemini Flash to synthesize a structured user context profile.
 * The profile is injected into agent prompts via memory-bridge.ts.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { callGeminiLLMWithRetry, GEMINI_MODEL_FAST } from "./ui-generator.js";
import { callChatLLM } from "./llm-provider.js";
import { logAction, logError } from "./action-log.js";
import type { ContextConsent, UserContextProfile } from "./user-context-types.js";
import { EMPTY_PROFILE } from "./user-context-types.js";
import { executeLocalTool } from "./tool-registry-local.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const ENSO_HOME = join(homedir(), ".enso");
const CONTEXT_DIR = join(ENSO_HOME, "data", "user-context");
const CACHE_DIR = join(CONTEXT_DIR, "cache");
const PROFILE_PATH = join(CONTEXT_DIR, "profile.json");

// ── LLM caller (same pattern as memory-extractor.ts) ─────────────────────────

async function callContextLLM(prompt: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return callGeminiLLMWithRetry(prompt, geminiKey, GEMINI_MODEL_FAST, 30_000);
  }
  // Fallback to any configured provider
  return callChatLLM({ prompt, model: GEMINI_MODEL_FAST, timeoutMs: 30_000 });
}

// ── Cache readers ────────────────────────────────────────────────────────────

function readCache(filename: string): unknown | null {
  const path = join(CACHE_DIR, filename);
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch { /* ignore */ }
  return null;
}

// ── Profile Builder ──────────────────────────────────────────────────────────

export async function buildUserContextProfile(
  consent: ContextConsent,
): Promise<{ sourcesScanned: string[]; interestCount: number; projectCount: number }> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const sourcesScanned: string[] = [];

  // Step 1: Run each consented scanner (collect fresh data)
  if (consent.browserHistory) {
    try {
      await executeLocalTool("enso_context_scan_browser_history", { browser: "all", limit: 500, sinceDays: 30 });
      sourcesScanned.push("browserHistory");
    } catch (err) { logError("user-context-builder", "Browser history scan failed", err); }
  }
  if (consent.bookmarks) {
    try {
      await executeLocalTool("enso_context_scan_bookmarks", {});
      sourcesScanned.push("bookmarks");
    } catch (err) { logError("user-context-builder", "Bookmark scan failed", err); }
  }
  if (consent.email) {
    try {
      await executeLocalTool("enso_context_scan_email", { folder: "INBOX", limit: 50 });
      sourcesScanned.push("email");
    } catch (err) { logError("user-context-builder", "Email scan failed", err); }
  }
  if (consent.files) {
    try {
      await executeLocalTool("enso_context_scan_files", { maxDepth: 3 });
      sourcesScanned.push("files");
    } catch (err) { logError("user-context-builder", "File scan failed", err); }
  }
  if (consent.system) {
    try {
      await executeLocalTool("enso_context_scan_system", { include: ["apps"] });
      sourcesScanned.push("system");
    } catch (err) { logError("user-context-builder", "System scan failed", err); }
  }

  if (sourcesScanned.length === 0) {
    return { sourcesScanned, interestCount: 0, projectCount: 0 };
  }

  // Step 2: Read cached scan results and build a reduced summary
  const browserData = readCache("browser-history.json") as { topDomains?: Array<{ domain: string; visits: number }>; recentSearches?: Array<{ query: string }> } | null;
  const bookmarkData = readCache("bookmarks.json") as { folders?: Array<{ folder: string; count: number; bookmarks: Array<{ title: string }> }> } | null;
  const emailData = readCache("email-summary.json") as { topSenders?: Array<{ from: string; count: number }>; recentSubjects?: Array<{ subject: string }> } | null;
  const fileData = readCache("file-index.json") as { projects?: Array<{ name: string; path: string; type: string; technologies: string[] }>; topFileTypes?: Array<{ ext: string; count: number }> } | null;
  const systemData = readCache("system-info.json") as { installedApps?: string[] } | null;

  // Build reduced context for LLM (only summaries, never raw URLs or file paths)
  const contextParts: string[] = [];

  if (browserData) {
    const domains = browserData.topDomains?.slice(0, 20).map(d => `${d.domain} (${d.visits} visits)`).join(", ") || "none";
    const searches = browserData.recentSearches?.slice(0, 15).map(s => s.query).join(", ") || "none";
    contextParts.push(`## Browser Activity\nTop sites: ${domains}\nRecent searches: ${searches}`);
  }
  if (bookmarkData) {
    const folders = bookmarkData.folders?.slice(0, 10).map(f => `${f.folder} (${f.count})`).join(", ") || "none";
    contextParts.push(`## Bookmarks\nFolders: ${folders}`);
  }
  if (emailData) {
    const senders = emailData.topSenders?.slice(0, 10).map(s => `${s.from} (${s.count}x)`).join(", ") || "none";
    const subjects = emailData.recentSubjects?.slice(0, 10).map(s => s.subject).join("; ") || "none";
    contextParts.push(`## Email\nTop senders: ${senders}\nRecent subjects: ${subjects}`);
  }
  if (fileData) {
    const projects = fileData.projects?.map(p => `${p.name} (${p.technologies.join(", ")})`).join(", ") || "none";
    const fileTypes = fileData.topFileTypes?.map(f => `${f.ext} (${f.count})`).join(", ") || "none";
    contextParts.push(`## Projects & Files\nProjects: ${projects}\nFile types: ${fileTypes}`);
  }
  if (systemData) {
    const apps = systemData.installedApps?.slice(0, 30).join(", ") || "none";
    contextParts.push(`## Installed Software\n${apps}`);
  }

  const contextSummary = contextParts.join("\n\n");

  // Step 3: Ask LLM to synthesize into structured profile
  const synthesisPrompt = `You are analyzing a user's desktop environment to build a profile for personalized AI assistance.

Here is a summary of their digital activity:

${contextSummary}

Based on this data, produce a JSON object with this exact schema (no markdown, just JSON):
{
  "interests": [{"topic": "string", "confidence": 0.0-1.0, "sources": ["browserHistory"|"bookmarks"|"email"|"files"|"system"]}],
  "workProjects": [{"name": "string", "technologies": ["string"]}],
  "topContacts": [{"name": "string", "email": "string (if visible)", "frequency": number}],
  "frequentSites": [{"domain": "string", "visits": number}],
  "recentSearches": [{"query": "string"}],
  "installedApps": ["string"],
  "mostUsedFileTypes": ["string"],
  "activeHoursEstimate": {"start": number, "end": number},
  "summary": "A 2-3 sentence natural language summary of who this user is and what they work on"
}

Rules:
- Infer interests from browsing patterns, searches, bookmarks, and project types
- Confidence should reflect how strongly the data supports each interest (0.5+ = moderate, 0.8+ = strong)
- List max 10 interests, 10 projects, 10 contacts
- Be concise but accurate
- Return ONLY valid JSON, no markdown fences`;

  try {
    const raw = await callContextLLM(synthesisPrompt);

    // Parse LLM output — strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const synthesized = JSON.parse(cleaned) as {
      interests?: Array<{ topic: string; confidence: number; sources: string[] }>;
      workProjects?: Array<{ name: string; technologies: string[] }>;
      topContacts?: Array<{ name: string; email: string; frequency: number }>;
      frequentSites?: Array<{ domain: string; visits: number }>;
      recentSearches?: Array<{ query: string }>;
      installedApps?: string[];
      mostUsedFileTypes?: string[];
      activeHoursEstimate?: { start: number; end: number };
      summary?: string;
    };

    // Build final profile
    const profile: UserContextProfile = {
      ...EMPTY_PROFILE,
      lastUpdated: Date.now(),
      interests: (synthesized.interests || []).map(i => ({
        ...i, lastSeen: Date.now(),
      })),
      workProjects: (synthesized.workProjects || fileData?.projects || []).map(p => ({
        name: p.name,
        path: ("path" in p ? (p as { path?: string }).path : undefined) || "",
        technologies: p.technologies || [],
        lastActivity: Date.now(),
      })),
      communicationPatterns: {
        topContacts: synthesized.topContacts || [],
        peakHours: [],
        primaryFolders: [],
      },
      tools: {
        installedApps: synthesized.installedApps || systemData?.installedApps || [],
        frequentSites: synthesized.frequentSites || [],
        recentSearches: (synthesized.recentSearches || []).map(s => ({
          query: s.query, timestamp: Date.now(),
        })),
      },
      habits: {
        activeHours: synthesized.activeHoursEstimate || { start: 9, end: 22 },
        mostUsedFileTypes: synthesized.mostUsedFileTypes || [],
        topDirectories: fileData?.projects?.map(p => p.path).filter(Boolean) as string[] || [],
      },
    };

    writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));

    logAction({
      ts: Date.now(), type: "action", category: "user-context-builder",
      message: `Profile built: ${profile.interests.length} interests, ${profile.workProjects.length} projects, ${sourcesScanned.length} sources`,
    });

    return {
      sourcesScanned,
      interestCount: profile.interests.length,
      projectCount: profile.workProjects.length,
    };
  } catch (err) {
    logError("user-context-builder", "Profile synthesis failed", err);
    // If LLM fails, build a minimal profile from raw data
    const fallbackProfile: UserContextProfile = {
      ...EMPTY_PROFILE,
      lastUpdated: Date.now(),
      workProjects: (fileData?.projects || []).map(p => ({
        name: p.name, path: p.path, technologies: p.technologies, lastActivity: Date.now(),
      })),
      tools: {
        installedApps: systemData?.installedApps || [],
        frequentSites: browserData?.topDomains?.slice(0, 20) || [],
        recentSearches: (browserData?.recentSearches || []).slice(0, 10).map(s => ({
          query: s.query, timestamp: Date.now(),
        })),
      },
      habits: {
        ...EMPTY_PROFILE.habits,
        mostUsedFileTypes: fileData?.topFileTypes?.map(f => f.ext) || [],
      },
    };
    writeFileSync(PROFILE_PATH, JSON.stringify(fallbackProfile, null, 2));
    return { sourcesScanned, interestCount: 0, projectCount: fallbackProfile.workProjects.length };
  }
}

// ── Context Summary for Prompt Injection ─────────────────────────────────────

/**
 * Returns a compact text summary of the user context profile,
 * suitable for injection into agent system prompts.
 * Returns empty string if no profile exists or consent is empty.
 */
export function getContextProfileSummary(maxChars: number = 800): string {
  if (!existsSync(PROFILE_PATH)) return "";

  try {
    const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8")) as UserContextProfile;

    // Don't inject stale profiles (> 7 days)
    if (Date.now() - profile.lastUpdated > 7 * 86400000) return "";

    const parts: string[] = [];

    if (profile.interests.length > 0) {
      const topics = profile.interests
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 8)
        .map(i => i.topic)
        .join(", ");
      parts.push(`**Interests**: ${topics}`);
    }

    if (profile.workProjects.length > 0) {
      const projects = profile.workProjects
        .slice(0, 5)
        .map(p => `${p.name} (${p.technologies.slice(0, 3).join(", ")})`)
        .join(", ");
      parts.push(`**Active projects**: ${projects}`);
    }

    if (profile.communicationPatterns.topContacts.length > 0) {
      const contacts = profile.communicationPatterns.topContacts
        .slice(0, 5)
        .map(c => c.name || c.email)
        .join(", ");
      parts.push(`**Key contacts**: ${contacts}`);
    }

    if (profile.tools.installedApps.length > 0) {
      // Pick notable dev tools
      const notable = profile.tools.installedApps
        .filter(a => /code|studio|docker|git|node|python|java|android|slack|teams|discord|notion/i.test(a))
        .slice(0, 8);
      if (notable.length > 0) parts.push(`**Tools**: ${notable.join(", ")}`);
    }

    if (profile.tools.frequentSites.length > 0) {
      const sites = profile.tools.frequentSites.slice(0, 5).map(s => s.domain).join(", ");
      parts.push(`**Frequent sites**: ${sites}`);
    }

    if (profile.tools.recentSearches.length > 0) {
      const searches = profile.tools.recentSearches.slice(0, 5).map(s => s.query).join("; ");
      parts.push(`**Recent interests**: ${searches}`);
    }

    if (parts.length === 0) return "";

    let summary = `<user_context>\n${parts.join("\n")}\n</user_context>`;
    if (summary.length > maxChars) {
      // Trim from the bottom
      while (summary.length > maxChars && parts.length > 1) {
        parts.pop();
        summary = `<user_context>\n${parts.join("\n")}\n</user_context>`;
      }
    }
    return summary;
  } catch {
    return "";
  }
}

// ── Staleness Check (called from buildEnsoContext) ───────────────────────────

let _refreshInProgress = false;

/**
 * Check if the profile needs refreshing (>24h old) and trigger a
 * background rebuild if so. Fire-and-forget — never blocks the caller.
 */
export function maybeRefreshProfile(): void {
  if (_refreshInProgress) return;

  try {
    const { readConsent } = require("./user-context-tools.js") as { readConsent: () => ContextConsent };
    const consent = readConsent();

    // No sources consented — nothing to refresh
    const anyConsented = consent.browserHistory || consent.bookmarks || consent.email || consent.files || consent.system;
    if (!anyConsented) return;

    // Check profile age
    let age = Infinity;
    if (existsSync(PROFILE_PATH)) {
      try {
        const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
        age = (Date.now() - (profile.lastUpdated || 0)) / 1000;
      } catch { /* ignore */ }
    }

    // Refresh if older than 24 hours or doesn't exist
    if (age > 86400) {
      _refreshInProgress = true;
      buildUserContextProfile(consent)
        .then(() => logAction({
          ts: Date.now(), type: "action", category: "user-context-builder",
          message: "Background profile refresh completed",
        }))
        .catch((err) => logError("user-context-builder", "Background refresh failed", err))
        .finally(() => { _refreshInProgress = false; });
    }
  } catch { /* ignore */ }
}
