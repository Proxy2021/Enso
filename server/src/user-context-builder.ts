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
import { llm } from "./llm.js";
import { logAction, logError } from "./action-log.js";
import { DATA_SOURCES, readCache } from "./data-source-registry.js";
import { runPostScanPipeline } from "./data-source-pipeline.js";
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
  return llm({ prompt, tier: "fast", timeoutMs: 30_000 });
}

// ── Profile Builder ──────────────────────────────────────────────────────────

/**
 * Build or update the user context profile.
 * @param consent  Current consent settings
 * @param sources  Optional list of specific sources to scan (e.g. ["browserHistory", "email"]).
 *                 When omitted, scans ALL consented sources. When provided, only scans the
 *                 listed sources (still gated by consent — unconsented sources are skipped).
 */
export async function buildUserContextProfile(
  consent: ContextConsent,
  sources?: string[],
): Promise<{ sourcesScanned: string[]; interestCount: number; projectCount: number }> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const sourcesScanned: string[] = [];

  // If sources filter is provided, only scan those; otherwise scan everything consented
  const shouldScan = (key: string) =>
    consent[key as keyof ContextConsent] && (!sources || sources.includes(key));

  // Step 1: Run each consented scanner (collect fresh data)
  if (shouldScan("browserHistory")) {
    try {
      await executeLocalTool("enso_context_scan_browser_history", { browser: "all", limit: 500, sinceDays: 30 });
      sourcesScanned.push("browserHistory");
    } catch (err) { logError("user-context-builder", "Browser history scan failed", err); }
  }
  if (shouldScan("bookmarks")) {
    try {
      await executeLocalTool("enso_context_scan_bookmarks", {});
      sourcesScanned.push("bookmarks");
    } catch (err) { logError("user-context-builder", "Bookmark scan failed", err); }
  }
  if (shouldScan("email")) {
    try {
      await executeLocalTool("enso_context_scan_email", { folder: "INBOX", limit: 50 });
      sourcesScanned.push("email");
    } catch (err) { logError("user-context-builder", "Email scan failed", err); }
  }
  if (shouldScan("files")) {
    try {
      await executeLocalTool("enso_context_scan_files", { maxDepth: 3 });
      sourcesScanned.push("files");
    } catch (err) { logError("user-context-builder", "File scan failed", err); }
  }
  if (shouldScan("system")) {
    try {
      await executeLocalTool("enso_context_scan_system", { include: ["apps"] });
      sourcesScanned.push("system");
    } catch (err) { logError("user-context-builder", "System scan failed", err); }
  }

  // Step 2: Read cached scan results and build a reduced summary via registry
  // Even if no new scans ran, rebuild profile from existing caches
  const contextParts: string[] = [];
  for (const ds of DATA_SOURCES) {
    const cached = readCache(ds.cacheFile);
    if (!cached) continue;
    const part = ds.formatForProfile(cached);
    if (part) contextParts.push(part);
  }

  const contextSummary = contextParts.join("\n\n");

  // If no actual data was found across all sources, skip LLM synthesis
  if (contextParts.length === 0) {
    logAction({ ts: Date.now(), type: "action", category: "user-context-builder", message: "No data found in any scanned source — skipping profile synthesis" });
    return { sourcesScanned, interestCount: 0, projectCount: 0 };
  }

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
  "readingInterests": ["string — top reading themes/categories inferred from Kindle books, if present"],
  "summary": "A 2-3 sentence natural language summary of who this user is, what they work on, and what they read"
}

Rules:
- Infer interests from browsing patterns, searches, bookmarks, project types, AND Kindle books if present
- Kindle Library data reveals deep intellectual interests — weight these highly in the interests list
- Confidence should reflect how strongly the data supports each interest (0.5+ = moderate, 0.8+ = strong)
- List max 10 interests, 10 projects, 10 contacts
- readingInterests: extract 5-8 key themes from the Kindle library (e.g., "Evolutionary Biology", "Quantitative Finance")
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
      readingInterests?: string[];
      summary?: string;
    };

    // Build final profile
    const profile: UserContextProfile = {
      ...EMPTY_PROFILE,
      lastUpdated: Date.now(),
      interests: (synthesized.interests || []).map(i => ({
        ...i, lastSeen: Date.now(),
      })),
      workProjects: (synthesized.workProjects || (readCache("file-index.json") as { projects?: Array<{ name: string; path: string; technologies: string[] }> } | null)?.projects || []).map(p => ({
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
        installedApps: synthesized.installedApps || (readCache("system-info.json") as { installedApps?: string[] } | null)?.installedApps || [],
        frequentSites: synthesized.frequentSites || [],
        recentSearches: (synthesized.recentSearches || []).map(s => ({
          query: s.query, timestamp: Date.now(),
        })),
      },
      habits: {
        activeHours: synthesized.activeHoursEstimate || { start: 9, end: 22 },
        mostUsedFileTypes: synthesized.mostUsedFileTypes || [],
        topDirectories: (readCache("file-index.json") as { projects?: Array<{ path: string }> } | null)?.projects?.map(p => p.path).filter(Boolean) as string[] || [],
      },
    };

    // Populate reading field from Kindle cache if available
    const kindleCache = readCache("kindle-library.json") as { totalBooks?: number; books?: Array<{ title: string; author: string }> } | null;
    if (kindleCache?.books?.length) {
      profile.reading = {
        books: kindleCache.books.slice(0, 50).map(b => ({ title: b.title, author: b.author })),
        totalBooks: kindleCache.totalBooks ?? kindleCache.books.length,
      };
    }

    // DEPRECATED: profile.json — being replaced by Cortex page (synthesis/user-profile.md).
    // Kept during transition phase; will be removed once all consumers read from Cortex.
    writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));

    // Always update ENSO_USER.md to reflect the latest profile data
    try {
      const { writeEnsoUser } = await import("./memory-bridge.js");
      const userMd = buildUserMarkdown(profile, synthesized.summary, synthesized.readingInterests);
      if (userMd) {
        writeEnsoUser(userMd);
        // Also write directly to Cortex page as backup
        try {
          const cortexDir = join(homedir(), ".enso", "wiki", "synthesis");
          if (!existsSync(cortexDir)) mkdirSync(cortexDir, { recursive: true });
          writeFileSync(join(cortexDir, "user-profile.md"), userMd);
        } catch { /* ignore */ }
      }
    } catch { /* memory-bridge not available — skip */ }

    logAction({
      ts: Date.now(), type: "action", category: "user-context-builder",
      message: `Profile built: ${profile.interests.length} interests, ${profile.workProjects.length} projects, ${sourcesScanned.length} sources`,
    });

    // Auto-ingest changed data sources into Cortex (background, fire-and-forget)
    runPostScanPipeline(sourcesScanned).catch((err) =>
      logError("user-context-builder", "Post-scan pipeline failed", err)
    );

    return {
      sourcesScanned,
      interestCount: profile.interests.length,
      projectCount: profile.workProjects.length,
    };
  } catch (err) {
    logError("user-context-builder", "Profile synthesis failed", err);
    // If LLM fails, build a minimal profile from raw data
    const fbFileData = readCache("file-index.json") as { projects?: Array<{ name: string; path: string; type: string; technologies: string[] }>; topFileTypes?: Array<{ ext: string; count: number }> } | null;
    const fbSystemData = readCache("system-info.json") as { installedApps?: string[] } | null;
    const fbBrowserData = readCache("browser-history.json") as { topDomains?: Array<{ domain: string; visits: number }>; recentSearches?: Array<{ query: string }> } | null;
    const fallbackProfile: UserContextProfile = {
      ...EMPTY_PROFILE,
      lastUpdated: Date.now(),
      workProjects: (fbFileData?.projects || []).map(p => ({
        name: p.name, path: p.path, technologies: p.technologies, lastActivity: Date.now(),
      })),
      tools: {
        installedApps: fbSystemData?.installedApps || [],
        frequentSites: fbBrowserData?.topDomains?.slice(0, 20) || [],
        recentSearches: (fbBrowserData?.recentSearches || []).slice(0, 10).map(s => ({
          query: s.query, timestamp: Date.now(),
        })),
      },
      habits: {
        ...EMPTY_PROFILE.habits,
        mostUsedFileTypes: fbFileData?.topFileTypes?.map(f => f.ext) || [],
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
  // Primary source: Cortex page (single source of truth)
  try {
    const cortexPath = join(homedir(), ".enso", "wiki", "synthesis", "user-profile.md");
    if (existsSync(cortexPath)) {
      const content = readFileSync(cortexPath, "utf-8");
      if (content.trim().length > 10) {
        let text = `<user_context>\n${content}\n</user_context>`;
        if (text.length > maxChars) text = text.slice(0, maxChars - 20) + "\n</user_context>";
        return text;
      }
    }
  } catch { /* fall through to legacy */ }

  // Fallback: legacy profile.json (deprecated — will be removed once Cortex is fully adopted)
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

    // Kindle library reading interests
    const kindleSummary = readCache("kindle-library.json") as { totalBooks?: number; books?: Array<{ title: string; author: string }> } | null;
    if (kindleSummary?.books?.length) {
      const topTitles = kindleSummary.books.slice(0, 3).map(b => `"${b.title}"`).join(", ");
      parts.push(`**Reading**: ${kindleSummary.totalBooks ?? kindleSummary.books.length} Kindle books including ${topTitles}`);
    }

    if (parts.length === 0) return "";

    let summary = `<user_context>\n${parts.join("\n")}\n</user_context>`;
    if (summary.length > maxChars) {
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

// ── Auto-populate ENSO_USER.md from discovered context ──────────────────────

function buildUserMarkdown(profile: UserContextProfile, summary?: string, readingInterests?: string[]): string | null {
  const lines: string[] = ["# About Me", ""];

  if (summary) {
    lines.push(summary, "");
  }

  if (profile.interests.length > 0) {
    const top = profile.interests
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
      .map(i => i.topic);
    lines.push(`**Interests:** ${top.join(", ")}`, "");
  }

  if (profile.workProjects.length > 0) {
    lines.push("**Projects:**");
    for (const p of profile.workProjects.slice(0, 6)) {
      const tech = p.technologies.length > 0 ? ` (${p.technologies.slice(0, 3).join(", ")})` : "";
      lines.push(`- ${p.name}${tech}`);
    }
    lines.push("");
  }

  // Reading / Kindle library
  if (profile.reading?.totalBooks) {
    const topBooks = profile.reading.books.slice(0, 5).map(b => `"${b.title}"`).join(", ");
    lines.push(`**Reading:** ${profile.reading.totalBooks} Kindle books including ${topBooks}`, "");
    if (readingInterests?.length) {
      lines.push(`**Reading themes:** ${readingInterests.join(", ")}`, "");
    }
  }

  if (profile.tools.frequentSites.length > 0) {
    const sites = profile.tools.frequentSites.slice(0, 6).map(s => s.domain).join(", ");
    lines.push(`**Frequent sites:** ${sites}`, "");
  }

  if (profile.tools.recentSearches.length > 0) {
    const searches = profile.tools.recentSearches.slice(0, 5).map(s => s.query).join("; ");
    lines.push(`**Recent interests:** ${searches}`, "");
  }

  lines.push("*Auto-generated from desktop scan. Edit anytime in Settings > About You.*");

  // Only return if we have meaningful content beyond the header
  return lines.length > 4 ? lines.join("\n") : null;
}
