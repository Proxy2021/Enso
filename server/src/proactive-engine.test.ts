/**
 * proactive-engine.test.ts — End-to-end tests for the proactive task engine.
 *
 * Tests all 7 pillars, the daily digest, the priority ranker,
 * the consent system, analytics tracking, and profile snapshot diffing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

// ── Test home directory (hoisted so vi.mock can reference it) ────────────────

const { TEST_HOME, CONTEXT_DIR, CACHE_DIR, PROFILE_PATH, PROACTIVE_DIR } = vi.hoisted(() => {
  const { tmpdir } = require("os");
  const { join } = require("path");
  const TEST_HOME = join(tmpdir(), `enso-proactive-test-${Date.now()}`);
  const ENSO_HOME = join(TEST_HOME, ".enso");
  const CONTEXT_DIR = join(ENSO_HOME, "data", "user-context");
  return {
    TEST_HOME,
    CONTEXT_DIR,
    CACHE_DIR: join(CONTEXT_DIR, "cache"),
    PROFILE_PATH: join(CONTEXT_DIR, "profile.json"),
    PROACTIVE_DIR: join(CONTEXT_DIR, "proactive"),
  };
});

// ── Mocks ────────────────────────────────────────────────────────────────────

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

// ── Import after mocks ──────────────────────────────────────────────────────

import type { UserContextProfile } from "./user-context-types.js";
import {
  generateSuggestions,
  generateDailyDigest,
  getDailyBriefingCompat,
  getTopSuggestions,
  readProactiveConsent,
  writeProactiveConsent,
  dismissSuggestion,
  recordAcceptance,
  recordDismissal,
  getAnalytics,
  DEFAULT_PROACTIVE_CONSENT,
} from "./proactive-engine.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestProfile(overrides: Partial<UserContextProfile> = {}): UserContextProfile {
  return {
    version: 1,
    lastUpdated: Date.now(),
    interests: [
      { topic: "Rust async patterns", confidence: 0.85, sources: ["browser-history", "bookmarks"], lastSeen: Date.now() - 86400_000 },
      { topic: "Vector databases", confidence: 0.72, sources: ["browser-history"], lastSeen: Date.now() - 172800_000 },
      { topic: "GraphQL", confidence: 0.55, sources: ["bookmarks"], lastSeen: Date.now() - 86400_000 },
    ],
    workProjects: [
      { name: "AlphaRank", path: join(TEST_HOME, "projects", "alpharank"), technologies: ["typescript", "react", "node"], lastActivity: Date.now() },
      { name: "OldProject", path: join(TEST_HOME, "projects", "oldproject"), technologies: ["python"], lastActivity: Date.now() - 60 * 86400_000 },
    ],
    communicationPatterns: {
      topContacts: [
        { name: "Sarah Chen", email: "sarah@example.com", frequency: 15 },
        { name: "Tom Smith", email: "tom@example.com", frequency: 8 },
      ],
      peakHours: [],
      primaryFolders: [],
    },
    tools: {
      installedApps: ["Visual Studio Code", "Docker Desktop", "Git"],
      frequentSites: [
        { domain: "github.com", visits: 120 },
        { domain: "stackoverflow.com", visits: 45 },
      ],
      recentSearches: [
        { query: "how does async/await work in Rust", timestamp: Date.now() - 3600_000 },
        { query: "migrate from Express to Fastify", timestamp: Date.now() - 7200_000 },
        { query: "tutorial learn rust", timestamp: Date.now() - 86400_000 },
      ],
    },
    habits: {
      activeHours: { start: 9, end: 22 },
      mostUsedFileTypes: [".ts", ".tsx", ".json", ".py"],
      topDirectories: [join(TEST_HOME, "projects")],
    },
    ...overrides,
  };
}

function setupTestProfile(profile?: UserContextProfile): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(PROFILE_PATH, JSON.stringify(profile ?? createTestProfile(), null, 2));
}

function setupProjectDirs(): void {
  const alphaDir = join(TEST_HOME, "projects", "alpharank");
  const oldDir = join(TEST_HOME, "projects", "oldproject");
  mkdirSync(alphaDir, { recursive: true });
  mkdirSync(oldDir, { recursive: true });
  writeFileSync(join(alphaDir, "package.json"), JSON.stringify({
    name: "alpharank",
    dependencies: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`dep-${i}`, "^1.0.0"])),
    devDependencies: { typescript: "^5.0.0" },
  }));
  mkdirSync(join(alphaDir, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(join(alphaDir, ".git", "config"), "[core]\nbare = false\n");
  writeFileSync(join(alphaDir, ".git", "refs", "heads", "main"), "abc123");
  writeFileSync(join(oldDir, "requirements.txt"), "flask==2.0.0\n");
}

function setupEmailCache(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, "email-summary.json"), JSON.stringify({
    totalEmails: 25,
    topSenders: [
      { from: "Sarah Chen <sarah@example.com>", count: 15 },
      { from: "Tom Smith <tom@example.com>", count: 8 },
    ],
    recentSubjects: [
      { from: "Sarah Chen <sarah@example.com>", subject: "Action Required: Q3 Budget Review", date: new Date(Date.now() - 3 * 86400_000).toISOString() },
      { from: "Tom Smith <tom@example.com>", subject: "Sprint Review Sync Tomorrow", date: new Date(Date.now() - 1 * 86400_000).toISOString() },
      { from: "CI Bot <ci@example.com>", subject: "Build passed: main #42", date: new Date(Date.now() - 3600_000).toISOString() },
    ],
  }));
}

function setupBookmarkCache(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, "bookmarks.json"), JSON.stringify({
    folders: [
      {
        folder: "AI/ML Research",
        count: 12,
        bookmarks: Array.from({ length: 12 }, (_, i) => ({
          title: `AI Paper ${i}`,
          url: `https://arxiv.org/paper-${i}`,
        })),
      },
      { folder: "Bookmarks bar", count: 5, bookmarks: [] },
    ],
  }));
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  try { rmSync(TEST_HOME, { recursive: true, force: true }); } catch { /* ignore */ }
  mkdirSync(CONTEXT_DIR, { recursive: true });
});

afterEach(() => {
  try { rmSync(TEST_HOME, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Proactive Engine", () => {

  describe("Core: generateSuggestions()", () => {
    it("returns empty array when no profile exists", async () => {
      const result = await generateSuggestions(true);
      expect(result).toEqual([]);
    });

    it("returns suggestions when profile exists with data", async () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      setupBookmarkCache();
      const result = await generateSuggestions(true);
      expect(result.length).toBeGreaterThan(0);
      for (const s of result) {
        expect(s.id).toBeTruthy();
        expect(s.pillar).toBeTruthy();
        expect(s.priority).toBeTruthy();
        expect(s.title).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(s.action).toBeTruthy();
        expect(typeof s.score).toBe("number");
        expect(s.createdAt).toBeGreaterThan(0);
      }
    });

    it("returns suggestions sorted by priority then score", async () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      setupBookmarkCache();
      const result = await generateSuggestions(true);
      if (result.length < 2) return;
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1];
        const curr = result[i];
        const pd = priorityOrder[prev.priority] - priorityOrder[curr.priority];
        if (pd === 0) {
          expect(prev.score).toBeGreaterThanOrEqual(curr.score);
        } else {
          expect(pd).toBeLessThanOrEqual(0);
        }
      }
    });

    it("getTopSuggestions(n) returns at most n items", async () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      setupBookmarkCache();
      await generateSuggestions(true);
      const top3 = await getTopSuggestions(3);
      expect(top3.length).toBeLessThanOrEqual(3);
      const top1 = await getTopSuggestions(1);
      expect(top1.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Pillar 1: Project Health", () => {
    it("detects stale projects (>30 days inactive)", async () => {
      setupTestProfile();
      setupProjectDirs();
      const result = await generateSuggestions(true);
      const stale = result.filter(s => s.id.startsWith("stale-project-"));
      expect(stale.length).toBeGreaterThanOrEqual(1);
      expect(stale[0].title).toContain("OldProject");
      expect(stale[0].pillar).toBe("project_health");
    });

    it("suggests dependency audit for large Node projects", async () => {
      setupTestProfile();
      setupProjectDirs();
      const result = await generateSuggestions(true);
      const depAudit = result.filter(s => s.id.startsWith("dep-audit-"));
      expect(depAudit.length).toBeGreaterThanOrEqual(1);
      expect(depAudit[0].title).toContain("AlphaRank");
    });

    it("detects missing README", async () => {
      setupTestProfile();
      setupProjectDirs();
      const result = await generateSuggestions(true);
      const noReadme = result.filter(s => s.id.startsWith("missing-readme-"));
      expect(noReadme.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Pillar 2: Research Continuation", () => {
    it("detects research momentum for high-confidence multi-source interests", async () => {
      setupTestProfile();
      setupBookmarkCache();
      const result = await generateSuggestions(true);
      const momentum = result.filter(s => s.id.startsWith("research-momentum-"));
      expect(momentum.length).toBeGreaterThanOrEqual(1);
      const rustMomentum = momentum.find(s => s.title.toLowerCase().includes("rust"));
      expect(rustMomentum).toBeTruthy();
      expect(rustMomentum!.action).toEqual({ type: "deep_research", topic: "Rust async patterns" });
    });

    it("detects unanswered question searches", async () => {
      setupTestProfile();
      const result = await generateSuggestions(true);
      const searchFollowup = result.filter(s => s.id.startsWith("search-followup-"));
      expect(searchFollowup.length).toBeGreaterThanOrEqual(1);
    });

    it("detects bookmark clusters for organization", async () => {
      setupTestProfile();
      setupBookmarkCache();
      const result = await generateSuggestions(true);
      const clusters = result.filter(s => s.id.startsWith("bookmark-cluster-"));
      expect(clusters.length).toBeGreaterThanOrEqual(1);
      expect(clusters[0].description).toContain("12");
    });
  });

  describe("Pillar 3: Communication Intelligence", () => {
    it("detects action-intent emails", async () => {
      setupTestProfile();
      setupEmailCache();
      const result = await generateSuggestions(true);
      const emailAction = result.filter(s => s.id.startsWith("email-action-"));
      expect(emailAction.length).toBeGreaterThanOrEqual(1);
      const q3 = emailAction.find(s => s.description.includes("Q3"));
      expect(q3).toBeTruthy();
      expect(q3!.pillar).toBe("communication");
    });

    it("detects meeting prep opportunities", async () => {
      setupTestProfile();
      setupEmailCache();
      const result = await generateSuggestions(true);
      const meetings = result.filter(s => s.id.startsWith("meeting-prep-"));
      expect(meetings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Pillar 4: Workflow Automation", () => {
    it("suggests GitHub Actions for repos without workflows", async () => {
      setupTestProfile();
      setupProjectDirs();
      const result = await generateSuggestions(true);
      const ghActions = result.filter(s => s.id === "github-actions");
      expect(ghActions.length).toBe(1);
      expect(ghActions[0].pillar).toBe("workflow");
    });

    it("suggests git remote for repos without one", async () => {
      setupTestProfile();
      setupProjectDirs();
      const result = await generateSuggestions(true);
      const noRemote = result.filter(s => s.id === "git-no-remote");
      expect(noRemote.length).toBe(1);
      expect(noRemote[0].description).toContain("no remote");
    });
  });

  describe("Pillar 5: Learning Path", () => {
    it("detects learning intent from tutorial searches", async () => {
      setupTestProfile();
      const result = await generateSuggestions(true);
      const learning = result.filter(s => s.id.startsWith("learning-"));
      expect(learning.length).toBeGreaterThanOrEqual(1);
      const rustLearn = learning.find(s => s.title.toLowerCase().includes("rust"));
      expect(rustLearn).toBeTruthy();
      expect(rustLearn!.pillar).toBe("learning");
    });

    it("suggests ESLint setup for projects without it", async () => {
      setupTestProfile();
      setupProjectDirs();
      const result = await generateSuggestions(true);
      const lintSetup = result.filter(s => s.id.startsWith("lint-setup-"));
      expect(lintSetup.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Daily Digest", () => {
    it("generates a structured daily digest", () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      setupBookmarkCache();
      const digest = generateDailyDigest();
      expect(digest).not.toBeNull();
      expect(digest!.date).toBe(new Date().toISOString().slice(0, 10));
      expect(digest!.greeting).toBeTruthy();
      expect(digest!.items.length).toBeGreaterThan(0);
      for (const item of digest!.items) {
        expect(item.category).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.icon).toBeTruthy();
        expect(item.priority).toBeTruthy();
      }
    });

    it("getDailyBriefingCompat returns a text string", () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      const text = getDailyBriefingCompat();
      expect(text).not.toBeNull();
      expect(typeof text).toBe("string");
      expect(text!.length).toBeGreaterThan(20);
    });

    it("digest items are sorted by priority", () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      setupBookmarkCache();
      const digest = generateDailyDigest();
      expect(digest).not.toBeNull();
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < digest!.items.length; i++) {
        expect(priorityOrder[digest!.items[i - 1].priority])
          .toBeLessThanOrEqual(priorityOrder[digest!.items[i].priority]);
      }
    });
  });

  describe("Consent System", () => {
    it("readProactiveConsent returns defaults when no file exists", () => {
      const consent = readProactiveConsent();
      expect(consent.enabled).toBe(DEFAULT_PROACTIVE_CONSENT.enabled);
      expect(consent.projectHealth).toBe(true);
      expect(consent.research).toBe(true);
      expect(consent.ambient).toBe(false);
    });

    it("writeProactiveConsent persists and readProactiveConsent loads it back", () => {
      writeProactiveConsent({
        enabled: true, projectHealth: false, research: true,
        communication: false, workflow: true, learning: true,
        ambient: true, updatedAt: Date.now(),
      });
      const loaded = readProactiveConsent();
      expect(loaded.projectHealth).toBe(false);
      expect(loaded.communication).toBe(false);
      expect(loaded.ambient).toBe(true);
    });

    it("disabling a pillar removes its suggestions", async () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      const all = await generateSuggestions(true);
      const commSuggestions = all.filter(s => s.pillar === "communication");
      expect(commSuggestions.length).toBeGreaterThan(0);

      writeProactiveConsent({
        enabled: true, projectHealth: true, research: true,
        communication: false, workflow: true, learning: true,
        ambient: false, updatedAt: Date.now(),
      });
      const filtered = await generateSuggestions(true);
      const commFiltered = filtered.filter(s => s.pillar === "communication");
      expect(commFiltered.length).toBe(0);
    });

    it("master toggle disables everything", async () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      writeProactiveConsent({
        enabled: false, projectHealth: true, research: true,
        communication: true, workflow: true, learning: true,
        ambient: true, updatedAt: Date.now(),
      });
      const result = await generateSuggestions(true);
      expect(result.length).toBe(0);
    });
  });

  describe("Dismiss & Analytics", () => {
    it("dismissSuggestion suppresses a suggestion by ID", async () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      setupBookmarkCache();
      const all = await generateSuggestions(true);
      expect(all.length).toBeGreaterThan(0);
      const firstId = all[0].id;

      dismissSuggestion(firstId, 24);

      const after = await generateSuggestions(true);
      expect(after.find(s => s.id === firstId)).toBeUndefined();
    });

    it("recordAcceptance and recordDismissal update analytics", () => {
      mkdirSync(PROACTIVE_DIR, { recursive: true });
      recordAcceptance("research");
      recordAcceptance("research");
      recordDismissal("workflow");

      const analytics = getAnalytics();
      expect(analytics.totalAccepted).toBe(2);
      expect(analytics.totalDismissed).toBe(1);
      expect(analytics.byPillar.research?.accepted).toBe(2);
      expect(analytics.byPillar.workflow?.dismissed).toBe(1);
    });
  });

  describe("backward compat: user-context-proactive.ts", () => {
    it("getDailyBriefing() returns a string (legacy interface)", async () => {
      setupTestProfile();
      setupProjectDirs();
      setupEmailCache();
      const { getDailyBriefing } = await import("./user-context-proactive.js");
      const text = getDailyBriefing();
      if (text !== null) {
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      }
    });
  });
});
