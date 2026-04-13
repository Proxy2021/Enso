/**
 * Onboarding — First-run detection and data source setup orchestration.
 *
 * Detects whether this is a first run (no consent given, no scan history).
 * Orchestrates the onboarding flow: enable consent → scan → build profile → create tasks.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { logAction } from "./action-log.js";

const CONTEXT_DIR = join(homedir(), ".enso", "data", "user-context");
const CONSENT_PATH = join(CONTEXT_DIR, "consent.json");
const SCAN_LOG_PATH = join(CONTEXT_DIR, "scan-log.json");
const ONBOARDING_DONE_PATH = join(CONTEXT_DIR, "onboarding-done.json");

/**
 * Check if this is a first-run scenario (no data sources ever consented/scanned).
 */
export function isFirstRun(): boolean {
  // If we've marked onboarding as done, it's not a first run
  if (existsSync(ONBOARDING_DONE_PATH)) return false;

  // Check consent — if any source is enabled, not a first run
  try {
    if (existsSync(CONSENT_PATH)) {
      const consent = JSON.parse(readFileSync(CONSENT_PATH, "utf-8"));
      for (const [key, val] of Object.entries(consent)) {
        if (key !== "updatedAt" && val === true) return false;
      }
    }
  } catch { /* ignore */ }

  // Check scan log — if any source has been scanned, not a first run
  try {
    if (existsSync(SCAN_LOG_PATH)) {
      const log = JSON.parse(readFileSync(SCAN_LOG_PATH, "utf-8"));
      if (Object.keys(log).length > 0) return false;
    }
  } catch { /* ignore */ }

  return true;
}

/**
 * Mark onboarding as complete so it doesn't show again.
 */
export function markOnboardingDone(): void {
  const { mkdirSync, writeFileSync } = require("fs") as typeof import("fs");
  mkdirSync(CONTEXT_DIR, { recursive: true });
  writeFileSync(ONBOARDING_DONE_PATH, JSON.stringify({
    completedAt: Date.now(),
    version: "0.4.0",
  }));
  logAction({ ts: Date.now(), type: "action", category: "onboarding", message: "Onboarding marked as complete" });
}

/**
 * Available data sources for the onboarding UI.
 */
export const ONBOARDING_SOURCES = [
  { id: "browserHistory", icon: "🌐", label: "Browser", description: "History + bookmarks from Chrome/Edge", defaultEnabled: true },
  { id: "bookmarks", icon: "🔖", label: "Bookmarks", description: "Saved sites organized by folder", defaultEnabled: true },
  { id: "files", icon: "📁", label: "Projects", description: "Detect software projects and tech stacks", defaultEnabled: true },
  { id: "email", icon: "📧", label: "Email", description: "Communication patterns from Outlook/IMAP", defaultEnabled: false },
  { id: "system", icon: "💻", label: "System", description: "Installed apps and environment", defaultEnabled: true },
  { id: "kindleLibrary", icon: "📚", label: "Kindle", description: "Amazon Kindle book collection (requires login)", defaultEnabled: false },
  { id: "youtube", icon: "📺", label: "YouTube", description: "Subscriptions, liked videos, and feed (requires OAuth)", defaultEnabled: false },
  { id: "steam", icon: "🎮", label: "Steam", description: "Installed Steam games and play history", defaultEnabled: false },
  { id: "moviesTv", icon: "🎬", label: "Movies & TV", description: "Local video collection with TMDB metadata", defaultEnabled: false },
  { id: "photos", icon: "📷", label: "Photos", description: "Photo library with EXIF metadata and album organization", defaultEnabled: false },
  { id: "twitterFollowing", icon: "🐦", label: "Twitter/X", description: "Accounts you follow on Twitter/X (requires login)", defaultEnabled: false },
  { id: "qqMusic", icon: "🎵", label: "QQ Music", description: "Playlists, favorites, and local audio files", defaultEnabled: false },
];

/**
 * Default scheduled tasks to create during onboarding.
 */
export function getDefaultScheduledTasks(): Array<{
  taskId: string;
  name: string;
  description: string;
  cron: string;
  action: { type: "prompt"; prompt: string };
  enabled: boolean;
  recurring: boolean;
}> {
  return [
    {
      taskId: "cortex-daily-discovery",
      name: "Cortex Daily Discovery",
      description: "Search the web for your top Cortex topics and email an intelligence briefing",
      cron: "0 8 * * *",
      action: {
        type: "prompt" as const,
        prompt: "Run the Cortex daily discovery: search the web for updates on my top knowledge topics, analyze findings, ingest significant results into the Cortex, and email me an intelligence briefing.",
      },
      enabled: true,
      recurring: true,
    },
    {
      taskId: "weekly-profile-refresh",
      name: "Weekly Profile Refresh",
      description: "Re-scan all data sources and rebuild the Cortex profile weekly",
      cron: "0 9 * * 1",
      action: {
        type: "prompt" as const,
        prompt: "Scan all enabled data sources (browser history, bookmarks, email, files, system) to refresh the user profile and auto-ingest any changes into the Cortex.",
      },
      enabled: true,
      recurring: true,
    },
    {
      taskId: "daily-data-source-update",
      name: "Daily Data Source Update",
      description: "Update all active data sources early morning — fetch new books, videos, emails, and ingest changes into the Cortex",
      cron: "0 5 * * *",
      action: {
        type: "prompt" as const,
        prompt: `Update all active data sources and refresh the Cortex:

1. For each enabled data source, run its update tool to fetch new data:
   - Browser: scan last 3 days of history + refresh bookmarks
   - Email: scan recent inbox messages
   - Files: re-scan for new/changed projects
   - Kindle: check for new book purchases
   - YouTube: fetch latest subscriptions, liked videos, and feed
   - System: refresh installed apps
   - Steam: check for newly installed games
   - Movies/TV: scan for new video files
   - Photos: detect new photo albums
   - Twitter/X: refresh following list
   - QQ Music: scan for new tracks

2. After all scans complete, rebuild the user profile from the updated caches.

3. Run direct ingest to create Cortex pages for any new items (books, channels, projects).

4. Log what changed: new items found, pages created, profile updated.

Use the available scanner tools: enso_context_scan_browser_history, enso_context_scan_bookmarks, enso_context_scan_email, enso_context_scan_files, enso_context_scan_system, enso_context_scan_kindle_library, enso_context_scan_youtube, enso_context_scan_steam, enso_context_scan_movies_tv, enso_context_scan_photos, enso_context_scan_twitter, enso_context_scan_qq_music.`,
      },
      enabled: true,
      recurring: true,
    },
  ];
}

/**
 * Run the onboarding setup: enable consent, scan, build profile, create tasks.
 * Returns progress updates via the callback.
 */
export async function runOnboardingSetup(
  sources: string[],
  options: { createTasks: boolean },
  onProgress: (update: { step: string; status: "pending" | "running" | "done" | "error"; detail?: string }) => void,
): Promise<{ pagesCreated: number; interestsFound: number; tasksCreated: number }> {

  let pagesCreated = 0;
  let interestsFound = 0;
  let tasksCreated = 0;

  // Step 1: Enable consent for selected sources
  onProgress({ step: "consent", status: "running", detail: `Enabling ${sources.length} data sources` });
  try {
    const { writeConsent, readConsent } = await import("./user-context-tools.js");
    const consent = readConsent();
    for (const src of sources) {
      (consent as Record<string, boolean | number>)[src] = true;
    }
    consent.updatedAt = Date.now();
    writeConsent(consent);
    onProgress({ step: "consent", status: "done", detail: `${sources.length} sources enabled` });
  } catch (err) {
    onProgress({ step: "consent", status: "error", detail: String(err) });
  }

  // Step 2: Scan each source
  for (const srcId of sources) {
    const src = ONBOARDING_SOURCES.find(s => s.id === srcId);
    onProgress({ step: `scan-${srcId}`, status: "running", detail: `Scanning ${src?.label || srcId}...` });
    try {
      const { executeLocalTool } = await import("./tool-registry-local.js");
      // Map source IDs to scanner tool names
      const toolMap: Record<string, string> = {
        browserHistory: "enso_context_scan_browser_history",
        bookmarks: "enso_context_scan_bookmarks",
        email: "enso_context_scan_email",
        files: "enso_context_scan_files",
        system: "enso_context_scan_system",
        kindleLibrary: "enso_context_scan_kindle_library",
        youtube: "enso_youtube_manager_scan",
        steam: "enso_context_scan_steam",
        moviesTv: "enso_context_scan_movies_tv",
        photos: "enso_context_scan_photos",
        twitterFollowing: "enso_context_scan_twitter",
        qqMusic: "enso_context_scan_qq_music",
      };
      const toolName = toolMap[srcId];
      if (toolName) {
        await executeLocalTool(toolName, {});
        onProgress({ step: `scan-${srcId}`, status: "done", detail: `${src?.label || srcId} scanned` });
      }
    } catch (err) {
      onProgress({ step: `scan-${srcId}`, status: "error", detail: `${src?.label || srcId}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Step 3: Build profile + auto-ingest to Cortex
  onProgress({ step: "profile", status: "running", detail: "Building profile and populating Cortex..." });
  try {
    const { buildUserContextProfile } = await import("./user-context-builder.js");
    const { readConsent } = await import("./user-context-tools.js");
    const consent = readConsent();
    const result = await buildUserContextProfile(consent, sources);
    interestsFound = result.interestCount;
    onProgress({ step: "profile", status: "done", detail: `${interestsFound} interests discovered` });
  } catch (err) {
    onProgress({ step: "profile", status: "error", detail: String(err) });
  }

  // Step 4: Direct ingest to create per-item Cortex pages
  onProgress({ step: "cortex", status: "running", detail: "Creating knowledge pages..." });
  try {
    const { directIngestFromSources } = await import("./cortex-direct-ingest.js");
    const directResult = await directIngestFromSources({ sourceIds: sources });
    pagesCreated = directResult.created;
    onProgress({ step: "cortex", status: "done", detail: `${pagesCreated} pages created` });
  } catch (err) {
    onProgress({ step: "cortex", status: "error", detail: String(err) });
  }

  // Step 5: Create default scheduled tasks
  if (options.createTasks) {
    onProgress({ step: "tasks", status: "running", detail: "Setting up scheduled tasks..." });
    try {
      const { createTask } = await import("./scheduled-tasks.js");
      const defaultTasks = getDefaultScheduledTasks();
      for (const taskDef of defaultTasks) {
        try {
          createTask(taskDef as never);
          tasksCreated++;
        } catch { /* task may already exist */ }
      }
      onProgress({ step: "tasks", status: "done", detail: `${tasksCreated} tasks created` });
    } catch (err) {
      onProgress({ step: "tasks", status: "error", detail: String(err) });
    }
  }

  // Mark onboarding complete
  markOnboardingDone();

  logAction({
    ts: Date.now(), type: "action", category: "onboarding",
    message: `Onboarding complete: ${sources.length} sources, ${pagesCreated} pages, ${interestsFound} interests, ${tasksCreated} tasks`,
  });

  return { pagesCreated, interestsFound, tasksCreated };
}
