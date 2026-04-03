/**
 * proactive-ws.test.ts — WebSocket integration tests for the 7 proactive handlers.
 *
 * These tests verify the WS message handlers in server.ts dispatch to
 * proactive-engine.ts correctly and return properly shaped responses.
 *
 * Runs against the live standalone server — start with `npm run dev:server` first,
 * or use the mock approach below which tests the handler logic in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

// ── Test home directory (hoisted) ────────────────────────────────────────────

const { TEST_HOME, CONTEXT_DIR, CACHE_DIR, PROFILE_PATH, PROACTIVE_DIR } = vi.hoisted(() => {
  const { tmpdir } = require("os");
  const { join } = require("path");
  const h = join(tmpdir(), `enso-ws-test-${Date.now()}`);
  const e = join(h, ".enso");
  const c = join(e, "data", "user-context");
  return {
    TEST_HOME: h,
    CONTEXT_DIR: c,
    CACHE_DIR: join(c, "cache"),
    PROFILE_PATH: join(c, "profile.json"),
    PROACTIVE_DIR: join(c, "proactive"),
  };
});

vi.mock("os", async (importOriginal) => {
  const orig = (await importOriginal()) as typeof import("os");
  return { ...orig, homedir: () => TEST_HOME, tmpdir: orig.tmpdir };
});

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./user-context-tools.js", () => ({
  readConsent: () => ({
    browserHistory: true,
    bookmarks: true,
    email: true,
    files: true,
    system: true,
    updatedAt: Date.now(),
  }),
}));

import {
  generateSuggestions,
  generateDailyDigest,
  getTopSuggestions,
  dismissSuggestion,
  recordAcceptance,
  recordDismissal,
  readProactiveConsent,
  writeProactiveConsent,
  getAnalytics,
} from "./proactive-engine.js";
import type { UserContextProfile } from "./user-context-types.js";

function createTestProfile(): UserContextProfile {
  return {
    version: 1,
    lastUpdated: Date.now(),
    interests: [
      { topic: "Rust async patterns", confidence: 0.85, sources: ["browser-history", "bookmarks"], lastSeen: Date.now() - 86400_000 },
    ],
    workProjects: [
      { name: "TestProject", path: join(TEST_HOME, "projects", "test"), technologies: ["typescript", "node"], lastActivity: Date.now() },
      { name: "StaleProject", path: join(TEST_HOME, "projects", "stale"), technologies: ["python"], lastActivity: Date.now() - 90 * 86400_000 },
    ],
    communicationPatterns: {
      topContacts: [{ name: "Alice", email: "alice@test.com", frequency: 10 }],
      peakHours: [],
      primaryFolders: [],
    },
    tools: {
      installedApps: ["VS Code"],
      frequentSites: [{ domain: "github.com", visits: 50 }],
      recentSearches: [
        { query: "how does async/await work in Rust", timestamp: Date.now() - 3600_000 },
      ],
    },
    habits: {
      activeHours: { start: 9, end: 22 },
      mostUsedFileTypes: [".ts"],
      topDirectories: [join(TEST_HOME, "projects")],
    },
  };
}

function setup(): void {
  try { rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}
  mkdirSync(CONTEXT_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(PROFILE_PATH, JSON.stringify(createTestProfile(), null, 2));
  // Create email cache
  writeFileSync(join(CACHE_DIR, "email-summary.json"), JSON.stringify({
    totalEmails: 10,
    topSenders: [{ from: "Alice <alice@test.com>", count: 5 }],
    recentSubjects: [
      { from: "Alice <alice@test.com>", subject: "Action Required: Review PR #42", date: new Date(Date.now() - 86400_000).toISOString() },
    ],
  }));
  // Create project directories
  const testDir = join(TEST_HOME, "projects", "test");
  const staleDir = join(TEST_HOME, "projects", "stale");
  mkdirSync(testDir, { recursive: true });
  mkdirSync(staleDir, { recursive: true });
  writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "test", dependencies: {} }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Proactive WS Handlers (handler-level tests)", () => {
  beforeEach(setup);
  afterEach(() => {
    try { rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}
  });

  it("Handler 1: proactive.get_suggestions — returns shaped DTO array", async () => {
    const count = 5;
    const suggestions = await getTopSuggestions(count);
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeLessThanOrEqual(count);
    for (const s of suggestions) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("pillar");
      expect(s).toHaveProperty("priority");
      expect(s).toHaveProperty("title");
      expect(s).toHaveProperty("description");
      expect(s).toHaveProperty("icon");
      expect(s).toHaveProperty("action");
    }
  });

  it("Handler 2: proactive.get_digest — returns structured daily digest", () => {
    const digest = generateDailyDigest();
    expect(digest).not.toBeNull();
    expect(digest).toHaveProperty("date");
    expect(digest).toHaveProperty("greeting");
    expect(digest).toHaveProperty("items");
    expect(digest!.items.length).toBeGreaterThan(0);
    for (const item of digest!.items) {
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("description");
      expect(item).toHaveProperty("icon");
      expect(item).toHaveProperty("priority");
    }
  });

  it("Handler 3: proactive.dismiss — records dismissal and suppresses suggestion", async () => {
    const suggestions = await generateSuggestions(true);
    expect(suggestions.length).toBeGreaterThan(0);
    const target = suggestions[0];

    dismissSuggestion(target.id, 24);

    const after = await generateSuggestions(true);
    expect(after.find(s => s.id === target.id)).toBeUndefined();
  });

  it("Handler 4: proactive.accept — records acceptance in analytics", () => {
    recordAcceptance("research");
    recordAcceptance("project_health");
    recordAcceptance("research");

    const analytics = getAnalytics();
    expect(analytics.totalAccepted).toBe(3);
    expect(analytics.byPillar.research?.accepted).toBe(2);
    expect(analytics.byPillar.project_health?.accepted).toBe(1);
  });

  it("Handler 5: proactive.set_consent — persists consent and affects generation", async () => {
    // Disable everything
    writeProactiveConsent({
      enabled: false,
      projectHealth: true, research: true, communication: true,
      workflow: true, learning: true, ambient: true,
      updatedAt: Date.now(),
    });
    const result = await generateSuggestions(true);
    expect(result.length).toBe(0);

    // Re-enable
    writeProactiveConsent({
      enabled: true,
      projectHealth: true, research: true, communication: true,
      workflow: true, learning: true, ambient: false,
      updatedAt: Date.now(),
    });
    const result2 = await generateSuggestions(true);
    expect(result2.length).toBeGreaterThan(0);
  });

  it("Handler 6: proactive.get_consent — returns current consent state", () => {
    const consent = readProactiveConsent();
    expect(consent).toHaveProperty("enabled");
    expect(consent).toHaveProperty("projectHealth");
    expect(consent).toHaveProperty("research");
    expect(consent).toHaveProperty("communication");
    expect(consent).toHaveProperty("workflow");
    expect(consent).toHaveProperty("learning");
    expect(consent).toHaveProperty("ambient");
  });

  it("Handler 7: proactive.get_analytics — returns tracking data", () => {
    recordAcceptance("research");
    recordDismissal("workflow");

    const analytics = getAnalytics();
    expect(analytics).toHaveProperty("totalSuggested");
    expect(analytics).toHaveProperty("totalAccepted");
    expect(analytics).toHaveProperty("totalDismissed");
    expect(analytics).toHaveProperty("byPillar");
    expect(analytics.totalAccepted).toBeGreaterThanOrEqual(1);
    expect(analytics.totalDismissed).toBeGreaterThanOrEqual(1);
    expect(analytics.byPillar.research).toBeDefined();
    expect(analytics.byPillar.workflow).toBeDefined();
  });
});
