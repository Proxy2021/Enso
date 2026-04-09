/**
 * Proactive Task Engine
 *
 * Transforms the passive user context profile into actionable suggestions.
 * Reads the structured UserContextProfile and produces ranked ProactiveSuggestion[]
 * across 7 pillars: project health, research continuation, communication intelligence,
 * workflow automation, learning paths, daily digest, and ambient tasks.
 *
 * All analysis runs locally — no raw data is sent to LLMs.
 * Suggestions are generated from the structured profile, not raw scan data.
 * Consent is respected: pillars only activate for consented data sources.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { logAction } from "./action-log.js";
import type { UserContextProfile, ContextConsent } from "./user-context-types.js";

// Lazy-loaded modules (ESM-compatible, avoids require())
let _readIndex: (() => Array<{ path: string; title: string; summary: string; tags: string[]; updated: string }>) | null = null;
let _lintCortex: (() => { brokenLinks: Array<{ page: string; link: string }>; stalePages: string[]; stats: { totalPages: number } }) | null = null;
let _readCache: ((f: string) => unknown) | null = null;
let _getUningestedSources: (() => string[]) | null = null;
let _getStaleIngestSources: (() => string[]) | null = null;
let _getEntityIndex: (() => ReadonlyMap<string, { title: string; source: string; type: string; semanticTags?: string[]; crossReferences?: Array<{ entityId: string; reason: string }>; recommendedVideos?: unknown[] }>) | null = null;

async function ensureModules(): Promise<void> {
  if (!_readIndex) {
    try {
      const cortex = await import("./cortex-tools.js");
      _readIndex = cortex.readIndex;
      _lintCortex = cortex.lintCortex;
    } catch { /* cortex-tools not available */ }
  }
  if (!_readCache) {
    try {
      const reg = await import("./data-source-registry.js");
      _readCache = reg.readCache;
    } catch { /* data-source-registry not available */ }
  }
  if (!_getUningestedSources) {
    try {
      const pipe = await import("./data-source-pipeline.js");
      _getUningestedSources = pipe.getUningestedSources;
      _getStaleIngestSources = pipe.getStaleIngestSources;
    } catch { /* pipeline not available */ }
  }
  if (!_getEntityIndex) {
    try {
      const em = await import("./entity-model.js");
      _getEntityIndex = em.getEntityIndex;
    } catch { /* entity-model not available */ }
  }
}

// ── Paths ────────────────────────────────────────────────────────────────────

const ENSO_HOME = join(homedir(), ".enso");
const CONTEXT_DIR = join(ENSO_HOME, "data", "user-context");
const PROFILE_PATH = join(CONTEXT_DIR, "profile.json");
const CACHE_DIR = join(CONTEXT_DIR, "cache");
const SNAPSHOT_PATH = join(CONTEXT_DIR, "profile-snapshot.json");
const PROACTIVE_DIR = join(CONTEXT_DIR, "proactive");

// ── Types ────────────────────────────────────────────────────────────────────

export type SuggestionPillar =
  | "project_health"
  | "research"
  | "communication"
  | "workflow"
  | "learning"
  | "digest"
  | "knowledge"
  | "ambient";

export type SuggestionPriority = "urgent" | "high" | "medium" | "low";

export type SuggestionAction =
  | { type: "send_message"; message: string }
  | { type: "run_app"; appId: string }
  | { type: "deep_research"; topic: string }
  | { type: "open_project"; path: string }
  | { type: "dismiss" };

export interface ProactiveSuggestion {
  id: string;
  pillar: SuggestionPillar;
  priority: SuggestionPriority;
  score: number;
  title: string;
  description: string;
  icon: string;
  action: SuggestionAction;
  /** Which consent source(s) powered this suggestion */
  requiredConsent: Array<keyof ContextConsent>;
  createdAt: number;
  /** If set, suggestion should not be shown again until this time */
  suppressUntil?: number;
}

export interface DigestItem {
  category: "project" | "research" | "communication" | "workflow" | "learning" | "change";
  title: string;
  description: string;
  icon: string;
  priority: SuggestionPriority;
  action?: SuggestionAction;
}

export interface DailyDigest {
  date: string;
  greeting: string;
  items: DigestItem[];
  generatedAt: number;
}

export interface ProactiveConsent {
  enabled: boolean;
  projectHealth: boolean;
  research: boolean;
  communication: boolean;
  workflow: boolean;
  learning: boolean;
  ambient: boolean;
  updatedAt: number;
}

export const DEFAULT_PROACTIVE_CONSENT: ProactiveConsent = {
  enabled: true,
  projectHealth: true,
  research: true,
  communication: true,
  workflow: true,
  learning: true,
  ambient: false,
  updatedAt: 0,
};

// ── Consent persistence ──────────────────────────────────────────────────────

const PROACTIVE_CONSENT_PATH = join(PROACTIVE_DIR, "consent.json");

export function readProactiveConsent(): ProactiveConsent {
  try {
    if (existsSync(PROACTIVE_CONSENT_PATH)) {
      return { ...DEFAULT_PROACTIVE_CONSENT, ...JSON.parse(readFileSync(PROACTIVE_CONSENT_PATH, "utf-8")) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_PROACTIVE_CONSENT };
}

export function writeProactiveConsent(consent: ProactiveConsent): void {
  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(PROACTIVE_CONSENT_PATH, JSON.stringify(consent, null, 2));
}

// ── Dismissed suggestions ────────────────────────────────────────────────────

const DISMISSED_PATH = join(PROACTIVE_DIR, "dismissed.json");

function readDismissed(): Record<string, number> {
  try {
    if (existsSync(DISMISSED_PATH)) return JSON.parse(readFileSync(DISMISSED_PATH, "utf-8"));
  } catch { /* ignore */ }
  return {};
}

function writeDismissed(dismissed: Record<string, number>): void {
  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(DISMISSED_PATH, JSON.stringify(dismissed, null, 2));
}

export function dismissSuggestion(id: string, suppressHours: number = 24): void {
  const dismissed = readDismissed();
  dismissed[id] = Date.now() + suppressHours * 3600_000;
  writeDismissed(dismissed);
}

// ── Acceptance tracking ──────────────────────────────────────────────────────

const ANALYTICS_PATH = join(PROACTIVE_DIR, "analytics.json");

interface SuggestionAnalytics {
  totalSuggested: number;
  totalAccepted: number;
  totalDismissed: number;
  byPillar: Record<string, { suggested: number; accepted: number; dismissed: number }>;
}

function readAnalytics(): SuggestionAnalytics {
  try {
    if (existsSync(ANALYTICS_PATH)) return JSON.parse(readFileSync(ANALYTICS_PATH, "utf-8"));
  } catch { /* ignore */ }
  return { totalSuggested: 0, totalAccepted: 0, totalDismissed: 0, byPillar: {} };
}

export function recordAcceptance(pillar: SuggestionPillar): void {
  const a = readAnalytics();
  a.totalAccepted++;
  if (!a.byPillar[pillar]) a.byPillar[pillar] = { suggested: 0, accepted: 0, dismissed: 0 };
  a.byPillar[pillar].accepted++;
  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(ANALYTICS_PATH, JSON.stringify(a, null, 2));
}

export function recordDismissal(pillar: SuggestionPillar): void {
  const a = readAnalytics();
  a.totalDismissed++;
  if (!a.byPillar[pillar]) a.byPillar[pillar] = { suggested: 0, accepted: 0, dismissed: 0 };
  a.byPillar[pillar].dismissed++;
  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(ANALYTICS_PATH, JSON.stringify(a, null, 2));
}

export function getAnalytics(): SuggestionAnalytics {
  return readAnalytics();
}

// ── Profile loading ──────────────────────────────────────────────────────────

function loadProfile(): UserContextProfile | null {
  try {
    if (!existsSync(PROFILE_PATH)) return null;
    const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8")) as UserContextProfile;
    if (Date.now() - profile.lastUpdated > 7 * 86400_000) return null;
    return profile;
  } catch { return null; }
}

function loadCache(filename: string): unknown | null {
  try {
    const p = join(CACHE_DIR, filename);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  } catch { /* ignore */ }
  return null;
}

// ── Snapshot differ ──────────────────────────────────────────────────────────

interface ProfileDelta {
  newInterests: string[];
  lostInterests: string[];
  newProjects: string[];
  staleProjects: Array<{ name: string; daysSinceActive: number }>;
  newContacts: string[];
  newSearches: string[];
}

function computeProfileDelta(current: UserContextProfile): ProfileDelta {
  const delta: ProfileDelta = {
    newInterests: [], lostInterests: [], newProjects: [],
    staleProjects: [], newContacts: [], newSearches: [],
  };

  let prev: UserContextProfile | null = null;
  try {
    if (existsSync(SNAPSHOT_PATH)) {
      prev = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as UserContextProfile;
    }
  } catch { /* ignore */ }

  // Stale project detection runs regardless of snapshot existence
  const now = Date.now();
  for (const p of current.workProjects) {
    const days = (now - p.lastActivity) / 86400_000;
    if (days > 30) delta.staleProjects.push({ name: p.name, daysSinceActive: Math.round(days) });
  }

  if (!prev) {
    delta.newInterests = current.interests.map(i => i.topic);
    delta.newProjects = current.workProjects.map(p => p.name);
    delta.newSearches = current.tools.recentSearches.map(s => s.query);
    return delta;
  }

  const prevTopics = new Set(prev.interests.map(i => i.topic));
  const currTopics = new Set(current.interests.map(i => i.topic));
  for (const t of currTopics) if (!prevTopics.has(t)) delta.newInterests.push(t);
  for (const t of prevTopics) if (!currTopics.has(t)) delta.lostInterests.push(t);

  const prevProjects = new Set(prev.workProjects.map(p => p.name));
  for (const p of current.workProjects) {
    if (!prevProjects.has(p.name)) delta.newProjects.push(p.name);
  }

  const prevContacts = new Set(prev.communicationPatterns.topContacts.map(c => c.name || c.email));
  for (const c of current.communicationPatterns.topContacts) {
    const key = c.name || c.email;
    if (key && !prevContacts.has(key)) delta.newContacts.push(key);
  }

  const prevSearches = new Set(prev.tools.recentSearches.map(s => s.query));
  for (const s of current.tools.recentSearches) {
    if (!prevSearches.has(s.query)) delta.newSearches.push(s.query);
  }

  return delta;
}

function saveSnapshot(profile: UserContextProfile): void {
  try {
    mkdirSync(CONTEXT_DIR, { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(profile, null, 2));
  } catch { /* ignore */ }
}

// ── Pillar 1: Project Health ─────────────────────────────────────────────────

function analyzeProjectHealth(profile: UserContextProfile, delta: ProfileDelta): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const now = Date.now();

  // Stale project detection
  for (const stale of delta.staleProjects) {
    suggestions.push({
      id: `stale-project-${stale.name}`,
      pillar: "project_health",
      priority: stale.daysSinceActive > 90 ? "low" : "medium",
      score: Math.min(0.8, stale.daysSinceActive / 120),
      title: `Inactive project: ${stale.name}`,
      description: `No activity in ${stale.daysSinceActive} days. Review, archive, or pick it back up?`,
      icon: "archive",
      action: { type: "open_project", path: profile.workProjects.find(p => p.name === stale.name)?.path || "" },
      requiredConsent: ["files"],
      createdAt: now,
    });
  }

  // Dependency audit hints for Node projects
  for (const project of profile.workProjects) {
    if (!project.path || !project.technologies.some(t => /node|typescript|react|next|vite/i.test(t))) continue;
    const pkgPath = join(project.path, "package.json");
    try {
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depCount = Object.keys(deps).length;
      if (depCount > 20) {
        suggestions.push({
          id: `dep-audit-${project.name}`,
          pillar: "project_health",
          priority: "medium",
          score: 0.5,
          title: `Audit ${project.name} dependencies`,
          description: `${depCount} packages — want me to check for outdated or vulnerable deps?`,
          icon: "shield",
          action: { type: "send_message", message: `Check for outdated or vulnerable dependencies in ${project.name} at ${project.path}` },
          requiredConsent: ["files"],
          createdAt: now,
        });
      }
    } catch { /* ignore */ }
  }

  // Tech stack + browsing cross-reference
  const projectTech = new Set(profile.workProjects.flatMap(p => p.technologies.map(t => t.toLowerCase())));
  for (const search of profile.tools.recentSearches) {
    const q = search.query.toLowerCase();
    const migrationMatch = q.match(/migrat(?:e|ion|ing)\s+(?:from\s+)?(\w+)\s+to\s+(\w+)/i);
    if (migrationMatch) {
      const [, from, to] = migrationMatch;
      if (projectTech.has(from.toLowerCase())) {
        suggestions.push({
          id: `migration-${from}-${to}`,
          pillar: "project_health",
          priority: "high",
          score: 0.85,
          title: `Plan ${from} to ${to} migration`,
          description: `You've been researching this migration and have ${from} projects. Want a migration plan?`,
          icon: "arrow-right",
          action: { type: "send_message", message: `Create a detailed migration plan from ${from} to ${to} for my projects` },
          requiredConsent: ["files", "browserHistory"],
          createdAt: now,
        });
      }
    }
  }

  // README freshness — check if code changed but README didn't
  for (const project of profile.workProjects.slice(0, 5)) {
    if (!project.path) continue;
    try {
      const readmePath = join(project.path, "README.md");
      if (!existsSync(readmePath)) {
        suggestions.push({
          id: `missing-readme-${project.name}`,
          pillar: "project_health",
          priority: "low",
          score: 0.3,
          title: `Missing README for ${project.name}`,
          description: `No README.md found. Want me to generate one based on the project structure?`,
          icon: "file-text",
          action: { type: "send_message", message: `Generate a README.md for my project ${project.name} at ${project.path}` },
          requiredConsent: ["files"],
          createdAt: now,
        });
        continue;
      }
      const readmeStat = statSync(readmePath);
      const daysSinceReadmeUpdate = (now - readmeStat.mtimeMs) / 86400_000;
      const daysSinceProjectActivity = (now - project.lastActivity) / 86400_000;
      if (daysSinceReadmeUpdate > 60 && daysSinceProjectActivity < 7) {
        suggestions.push({
          id: `stale-readme-${project.name}`,
          pillar: "project_health",
          priority: "low",
          score: 0.35,
          title: `Outdated README for ${project.name}`,
          description: `Code changed recently but README hasn't been updated in ${Math.round(daysSinceReadmeUpdate)} days.`,
          icon: "file-text",
          action: { type: "send_message", message: `Review and update the README.md for ${project.name} at ${project.path}` },
          requiredConsent: ["files"],
          createdAt: now,
        });
      }
    } catch { /* ignore */ }
  }

  return suggestions;
}

// ── Pillar 2: Research Continuation ──────────────────────────────────────────

function analyzeResearchOpportunities(profile: UserContextProfile, delta: ProfileDelta): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const now = Date.now();

  // Research momentum: high-confidence interests with recent activity
  for (const interest of profile.interests) {
    if (interest.confidence < 0.6) continue;
    const daysSinceSeen = (now - interest.lastSeen) / 86400_000;
    if (daysSinceSeen > 14) continue;

    const hasMultipleSources = interest.sources.length >= 2;
    if (hasMultipleSources) {
      suggestions.push({
        id: `research-momentum-${interest.topic.replace(/\s+/g, "-").toLowerCase()}`,
        pillar: "research",
        priority: interest.confidence >= 0.8 ? "high" : "medium",
        score: interest.confidence * (hasMultipleSources ? 1.2 : 1.0),
        title: `Deep dive: ${interest.topic}`,
        description: `You've been actively researching this across ${interest.sources.join(" and ")}. Want a comprehensive analysis?`,
        icon: "microscope",
        action: { type: "deep_research", topic: interest.topic },
        requiredConsent: ["browserHistory"],
        createdAt: now,
      });
    }
  }

  // Search follow-up: unanswered questions from recent searches
  for (const search of profile.tools.recentSearches.slice(0, 8)) {
    const q = search.query;
    if (/^(how|what|why|when|where|can|should|is|does|which)\b/i.test(q) && q.length > 15) {
      suggestions.push({
        id: `search-followup-${q.slice(0, 30).replace(/\s+/g, "-").toLowerCase()}`,
        pillar: "research",
        priority: "medium",
        score: 0.55,
        title: `Research: "${q.slice(0, 50)}"`,
        description: `You searched for this recently. Want a thorough answer with sources?`,
        icon: "search",
        action: { type: "send_message", message: `/research ${q}` },
        requiredConsent: ["browserHistory"],
        createdAt: now,
      });
    }
  }

  // Knowledge gap: interests that don't match project technologies
  const projectTech = new Set(profile.workProjects.flatMap(p => p.technologies.map(t => t.toLowerCase())));
  for (const interest of profile.interests) {
    if (interest.confidence < 0.5) continue;
    const topicLower = interest.topic.toLowerCase();
    const isKnownTech = /^(react|vue|angular|svelte|rust|go|python|java|kotlin|swift|typescript|node|docker|kubernetes|graphql|mongodb|postgresql|redis|aws|azure|gcp)/i.test(topicLower);
    if (isKnownTech && !projectTech.has(topicLower)) {
      suggestions.push({
        id: `knowledge-gap-${topicLower}`,
        pillar: "research",
        priority: "low",
        score: 0.4 * interest.confidence,
        title: `Explore ${interest.topic} for your stack`,
        description: `You're interested in ${interest.topic} but don't use it yet. Want to see how it could fit your projects?`,
        icon: "lightbulb",
        action: { type: "deep_research", topic: `How ${interest.topic} could improve my current tech stack` },
        requiredConsent: ["browserHistory", "files"],
        createdAt: now,
      });
    }
  }

  // Bookmark cluster detection
  const bookmarkData = loadCache("bookmarks.json") as {
    folders?: Array<{ folder: string; count: number; bookmarks: Array<{ title: string; url: string }> }>;
  } | null;
  if (bookmarkData?.folders) {
    for (const folder of bookmarkData.folders) {
      if (folder.count >= 8 && folder.folder !== "Bookmarks bar" && folder.folder !== "Other bookmarks") {
        suggestions.push({
          id: `bookmark-cluster-${folder.folder.replace(/\s+/g, "-").toLowerCase()}`,
          pillar: "research",
          priority: "low",
          score: 0.35,
          title: `Organize "${folder.folder}" bookmarks`,
          description: `${folder.count} bookmarks in this folder. Want me to create a curated reading list with summaries?`,
          icon: "bookmark",
          action: { type: "send_message", message: `Create a curated reading list from my ${folder.count} bookmarks in "${folder.folder}"` },
          requiredConsent: ["bookmarks"],
          createdAt: now,
        });
      }
    }
  }

  return suggestions;
}

// ── Pillar 3: Communication Intelligence ─────────────────────────────────────

function analyzeCommunication(profile: UserContextProfile): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const now = Date.now();

  const emailData = loadCache("email-summary.json") as {
    totalEmails?: number;
    recentSubjects?: Array<{ from: string; subject: string; date: string }>;
    topSenders?: Array<{ from: string; count: number }>;
  } | null;

  if (!emailData?.recentSubjects) return suggestions;

  // Action-intent email detection
  const actionPatterns = /\b(action required|please review|urgent|deadline|asap|follow up|respond|approve|sign off|feedback needed)\b/i;
  for (const email of emailData.recentSubjects.slice(0, 15)) {
    if (actionPatterns.test(email.subject)) {
      const fromName = email.from.split("<")[0].trim() || email.from;
      const emailDate = new Date(email.date);
      const daysAgo = Math.round((now - emailDate.getTime()) / 86400_000);
      if (daysAgo > 7) continue;

      suggestions.push({
        id: `email-action-${email.subject.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}-${daysAgo}`,
        pillar: "communication",
        priority: daysAgo >= 3 ? "high" : "medium",
        score: daysAgo >= 3 ? 0.8 : 0.6,
        title: `Email needs attention`,
        description: `"${email.subject.slice(0, 60)}" from ${fromName} (${daysAgo}d ago). Draft a response?`,
        icon: "mail",
        action: { type: "send_message", message: `Help me draft a response to the email "${email.subject}" from ${fromName}` },
        requiredConsent: ["email"],
        createdAt: now,
      });
    }
  }

  // Meeting prep detection
  const meetingPatterns = /\b(sync|1[:-]1|standup|sprint|review|retro|planning|kickoff|demo|presentation)\b/i;
  for (const email of emailData.recentSubjects.slice(0, 10)) {
    if (meetingPatterns.test(email.subject)) {
      const fromName = email.from.split("<")[0].trim() || email.from;
      suggestions.push({
        id: `meeting-prep-${email.subject.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`,
        pillar: "communication",
        priority: "medium",
        score: 0.5,
        title: `Prepare for: ${email.subject.slice(0, 50)}`,
        description: `Meeting-related email from ${fromName}. Want me to prepare a briefing?`,
        icon: "calendar",
        action: { type: "send_message", message: `Prepare a briefing document for my meeting: "${email.subject}"` },
        requiredConsent: ["email"],
        createdAt: now,
      });
    }
  }

  // Peak hours analysis (populate the currently-empty field)
  if (emailData.recentSubjects.length >= 5) {
    const hourCounts: Record<number, number> = {};
    for (const e of emailData.recentSubjects) {
      try {
        const hour = new Date(e.date).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      } catch { /* ignore */ }
    }
    const sortedHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h]) => Number(h));

    if (sortedHours.length >= 2 && profile.communicationPatterns.peakHours.length === 0) {
      profile.communicationPatterns.peakHours = sortedHours;
    }
  }

  return suggestions;
}

// ── Pillar 4: Workflow Automation ────────────────────────────────────────────

interface WorkflowRule {
  id: string;
  match: (profile: UserContextProfile) => boolean;
  generate: (profile: UserContextProfile) => ProactiveSuggestion;
}

const WORKFLOW_RULES: WorkflowRule[] = [
  {
    id: "dockerize-node",
    match: (p) =>
      p.tools.installedApps.some(a => /docker/i.test(a)) &&
      p.workProjects.some(pr => pr.technologies.some(t => /node|typescript/i.test(t))) &&
      p.workProjects.some(pr => {
        try { return pr.path && !existsSync(join(pr.path, "Dockerfile")); } catch { return false; }
      }),
    generate: (p) => {
      const project = p.workProjects.find(pr => {
        try { return pr.path && pr.technologies.some(t => /node|typescript/i.test(t)) && !existsSync(join(pr.path, "Dockerfile")); } catch { return false; }
      })!;
      return {
        id: "dockerize-node",
        pillar: "workflow", priority: "medium", score: 0.55,
        title: `Dockerize ${project.name}`,
        description: `You have Docker installed but ${project.name} doesn't have a Dockerfile. Want me to create one?`,
        icon: "container",
        action: { type: "send_message", message: `Create a Dockerfile and docker-compose.yml for my project ${project.name} at ${project.path}` },
        requiredConsent: ["files", "system"],
        createdAt: Date.now(),
      };
    },
  },
  {
    id: "github-actions",
    match: (p) =>
      p.tools.frequentSites.some(s => /github\.com/i.test(s.domain)) &&
      p.workProjects.some(pr => {
        try { return pr.path && existsSync(join(pr.path, ".git")) && !existsSync(join(pr.path, ".github", "workflows")); } catch { return false; }
      }),
    generate: (p) => {
      const projects = p.workProjects.filter(pr => {
        try { return pr.path && existsSync(join(pr.path, ".git")) && !existsSync(join(pr.path, ".github", "workflows")); } catch { return false; }
      });
      return {
        id: "github-actions",
        pillar: "workflow", priority: "medium", score: 0.5,
        title: `Set up CI/CD for ${projects.length} project${projects.length > 1 ? "s" : ""}`,
        description: `Git repos without GitHub Actions. Want me to set up CI workflows?`,
        icon: "git-branch",
        action: { type: "send_message", message: `Set up GitHub Actions CI workflows for: ${projects.map(p => p.name).join(", ")}` },
        requiredConsent: ["files", "browserHistory"],
        createdAt: Date.now(),
      };
    },
  },
  {
    id: "git-no-remote",
    match: (p) =>
      p.workProjects.some(pr => {
        try {
          if (!pr.path || !existsSync(join(pr.path, ".git"))) return false;
          const configPath = join(pr.path, ".git", "config");
          if (!existsSync(configPath)) return false;
          const config = readFileSync(configPath, "utf-8");
          return !config.includes("[remote");
        } catch { return false; }
      }),
    generate: (p) => {
      const project = p.workProjects.find(pr => {
        try {
          if (!pr.path || !existsSync(join(pr.path, ".git"))) return false;
          const config = readFileSync(join(pr.path, ".git", "config"), "utf-8");
          return !config.includes("[remote");
        } catch { return false; }
      })!;
      return {
        id: "git-no-remote",
        pillar: "workflow", priority: "medium", score: 0.6,
        title: `${project.name} has no remote`,
        description: `This git repository has no remote configured. Want to push it to GitHub?`,
        icon: "upload-cloud",
        action: { type: "send_message", message: `Help me create a GitHub repository and push ${project.name} from ${project.path}` },
        requiredConsent: ["files"],
        createdAt: Date.now(),
      };
    },
  },
  {
    id: "env-setup-python",
    match: (p) =>
      p.workProjects.some(pr =>
        pr.technologies.some(t => /python/i.test(t)) &&
        pr.path &&
        existsSync(join(pr.path, "requirements.txt")) &&
        !existsSync(join(pr.path, "pyproject.toml")),
      ),
    generate: (p) => {
      const project = p.workProjects.find(pr =>
        pr.technologies.some(t => /python/i.test(t)) &&
        pr.path && existsSync(join(pr.path, "requirements.txt")) &&
        !existsSync(join(pr.path, "pyproject.toml")),
      )!;
      return {
        id: "env-setup-python",
        pillar: "workflow", priority: "low", score: 0.4,
        title: `Modernize ${project.name} packaging`,
        description: `Still using requirements.txt. Want to migrate to pyproject.toml + uv?`,
        icon: "package",
        action: { type: "send_message", message: `Migrate ${project.name} at ${project.path} from requirements.txt to pyproject.toml with uv` },
        requiredConsent: ["files"],
        createdAt: Date.now(),
      };
    },
  },
];

function analyzeWorkflowOpportunities(profile: UserContextProfile): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  for (const rule of WORKFLOW_RULES) {
    try {
      if (rule.match(profile)) {
        suggestions.push(rule.generate(profile));
      }
    } catch { /* ignore individual rule failures */ }
  }
  return suggestions;
}

// ── Pillar 5: Learning Path ──────────────────────────────────────────────────

function analyzeLearningOpportunities(profile: UserContextProfile): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const now = Date.now();

  const projectTech = new Set(profile.workProjects.flatMap(p => p.technologies.map(t => t.toLowerCase())));

  // Skill gap: searching for tutorials/guides in technologies not in project stack
  const learningPatterns = /\b(tutorial|learn|course|guide|getting started|beginner|introduction to|how to use)\b/i;
  for (const search of profile.tools.recentSearches) {
    if (!learningPatterns.test(search.query)) continue;
    const techMatch = search.query.match(/(?:tutorial|learn|course|guide|getting started|introduction to|how to use)\s+(?:for\s+|with\s+|in\s+)?(\w+(?:\s+\w+)?)/i);
    if (techMatch) {
      const tech = techMatch[1].trim();
      if (!projectTech.has(tech.toLowerCase())) {
        suggestions.push({
          id: `learning-${tech.replace(/\s+/g, "-").toLowerCase()}`,
          pillar: "learning",
          priority: "medium",
          score: 0.6,
          title: `Learn ${tech}`,
          description: `You've been looking into ${tech} tutorials. Want a structured learning path with exercises?`,
          icon: "graduation-cap",
          action: { type: "send_message", message: `Create a structured learning path for ${tech}, including key concepts, exercises, and project ideas` },
          requiredConsent: ["browserHistory"],
          createdAt: now,
        });
      }
    }
  }

  // Technology radar: suggest updates for current stack
  const stackUpgrades: Array<{ from: string; to: string; reason: string }> = [
    { from: "webpack", to: "Vite", reason: "10x faster builds and HMR" },
    { from: "create-react-app", to: "Vite or Next.js", reason: "CRA is deprecated" },
    { from: "moment", to: "date-fns or dayjs", reason: "Moment.js is in maintenance mode" },
    { from: "enzyme", to: "React Testing Library", reason: "Enzyme has no React 18+ support" },
    { from: "tslint", to: "ESLint with typescript-eslint", reason: "TSLint is deprecated" },
  ];

  for (const upgrade of stackUpgrades) {
    if (projectTech.has(upgrade.from.toLowerCase())) {
      suggestions.push({
        id: `tech-radar-${upgrade.from.toLowerCase()}`,
        pillar: "learning",
        priority: "low",
        score: 0.45,
        title: `Upgrade from ${upgrade.from}`,
        description: `Consider ${upgrade.to}: ${upgrade.reason}. Want a migration guide?`,
        icon: "trending-up",
        action: { type: "send_message", message: `Create a migration guide from ${upgrade.from} to ${upgrade.to} for my projects` },
        requiredConsent: ["files"],
        createdAt: now,
      });
    }
  }

  // Best practices: detect common antipatterns in project structure
  for (const project of profile.workProjects.slice(0, 5)) {
    if (!project.path) continue;
    try {
      if (project.technologies.some(t => /node|typescript/i.test(t))) {
        const hasEslint = existsSync(join(project.path, ".eslintrc.json")) ||
          existsSync(join(project.path, ".eslintrc.js")) ||
          existsSync(join(project.path, "eslint.config.js")) ||
          existsSync(join(project.path, "eslint.config.mjs"));
        if (!hasEslint) {
          suggestions.push({
            id: `lint-setup-${project.name}`,
            pillar: "learning",
            priority: "low",
            score: 0.35,
            title: `Add linting to ${project.name}`,
            description: `No ESLint config found. Want me to set up linting with recommended rules?`,
            icon: "check-circle",
            action: { type: "send_message", message: `Set up ESLint with TypeScript support and recommended rules for ${project.name} at ${project.path}` },
            requiredConsent: ["files"],
            createdAt: now,
          });
        }
      }
    } catch { /* ignore */ }
  }

  return suggestions;
}

// ── Pillar 7: Ambient Background Tasks ───────────────────────────────────────

export interface AmbientTask {
  id: string;
  name: string;
  description: string;
  pillar: "ambient";
  intervalHours: number;
  lastRun?: number;
  enabled: boolean;
  execute: (profile: UserContextProfile) => ProactiveSuggestion[];
}

const AMBIENT_TASKS: AmbientTask[] = [
  {
    id: "stale-branch-cleanup",
    name: "Stale Branch Cleanup",
    description: "Detect merged or stale git branches in your projects",
    pillar: "ambient",
    intervalHours: 168, // weekly
    enabled: false,
    execute: (profile) => {
      const suggestions: ProactiveSuggestion[] = [];
      for (const project of profile.workProjects.slice(0, 5)) {
        if (!project.path) continue;
        try {
          const gitDir = join(project.path, ".git", "refs", "heads");
          if (!existsSync(gitDir)) continue;
          const branches = readdirSync(gitDir).filter(b => b !== "main" && b !== "master");
          if (branches.length >= 5) {
            suggestions.push({
              id: `stale-branches-${project.name}`,
              pillar: "ambient", priority: "low", score: 0.3,
              title: `${branches.length} branches in ${project.name}`,
              description: `Consider cleaning up stale branches: ${branches.slice(0, 3).join(", ")}...`,
              icon: "git-branch",
              action: { type: "send_message", message: `List and help me clean up stale git branches in ${project.name} at ${project.path}` },
              requiredConsent: ["files"],
              createdAt: Date.now(),
            });
          }
        } catch { /* ignore */ }
      }
      return suggestions;
    },
  },
  {
    id: "backup-reminder",
    name: "Backup Reminder",
    description: "Detect projects without recent git commits or remote backup",
    pillar: "ambient",
    intervalHours: 72,
    enabled: false,
    execute: (profile) => {
      const suggestions: ProactiveSuggestion[] = [];
      for (const project of profile.workProjects.slice(0, 5)) {
        if (!project.path) continue;
        try {
          if (!existsSync(join(project.path, ".git"))) {
            suggestions.push({
              id: `no-git-${project.name}`,
              pillar: "ambient", priority: "medium", score: 0.6,
              title: `${project.name} has no version control`,
              description: `This project isn't tracked by git. Want to initialize a repository?`,
              icon: "alert-triangle",
              action: { type: "send_message", message: `Initialize git in ${project.name} at ${project.path} and create an initial commit` },
              requiredConsent: ["files"],
              createdAt: Date.now(),
            });
          }
        } catch { /* ignore */ }
      }
      return suggestions;
    },
  },
  {
    id: "disk-usage",
    name: "Disk Usage Monitor",
    description: "Track disk usage of project directories and node_modules",
    pillar: "ambient",
    intervalHours: 168,
    enabled: false,
    execute: (profile) => {
      const suggestions: ProactiveSuggestion[] = [];
      const largeNodeModules: Array<{ name: string; path: string }> = [];
      for (const project of profile.workProjects.slice(0, 8)) {
        if (!project.path) continue;
        try {
          const nmPath = join(project.path, "node_modules");
          if (existsSync(nmPath)) {
            largeNodeModules.push({ name: project.name, path: nmPath });
          }
        } catch { /* ignore */ }
      }
      if (largeNodeModules.length >= 3) {
        suggestions.push({
          id: "node-modules-cleanup",
          pillar: "ambient", priority: "low", score: 0.25,
          title: `${largeNodeModules.length} node_modules directories`,
          description: `Found across your projects. Want to clean up inactive ones to free disk space?`,
          icon: "hard-drive",
          action: { type: "send_message", message: `List disk usage of node_modules across my projects and suggest which ones to clean up` },
          requiredConsent: ["files"],
          createdAt: Date.now(),
        });
      }
      return suggestions;
    },
  },
];

function runAmbientTasks(profile: UserContextProfile): ProactiveSuggestion[] {
  const pconsent = readProactiveConsent();
  if (!pconsent.ambient) return [];

  const suggestions: ProactiveSuggestion[] = [];
  const now = Date.now();
  const scheduleFile = join(PROACTIVE_DIR, "ambient-schedule.json");
  let schedule: Record<string, number> = {};
  try {
    if (existsSync(scheduleFile)) schedule = JSON.parse(readFileSync(scheduleFile, "utf-8"));
  } catch { /* ignore */ }

  for (const task of AMBIENT_TASKS) {
    if (!task.enabled) continue;
    const lastRun = schedule[task.id] || 0;
    if (now - lastRun < task.intervalHours * 3600_000) continue;

    try {
      const results = task.execute(profile);
      suggestions.push(...results);
      schedule[task.id] = now;
    } catch { /* ignore */ }
  }

  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(scheduleFile, JSON.stringify(schedule, null, 2));
  return suggestions;
}

// ── Priority Ranker ──────────────────────────────────────────────────────────

function rankSuggestions(
  suggestions: ProactiveSuggestion[],
  consent: ContextConsent,
  pconsent: ProactiveConsent,
): ProactiveSuggestion[] {
  if (!pconsent.enabled) return [];

  const dismissed = readDismissed();
  const now = Date.now();

  // Filter: consent-gated, pillar-gated, not dismissed
  const filtered = suggestions.filter(s => {
    // Check data source consent
    const hasConsent = s.requiredConsent.every(c =>
      c === "updatedAt" || consent[c as keyof ContextConsent],
    );
    if (!hasConsent) return false;

    // Check pillar consent
    const pillarKey = s.pillar === "project_health" ? "projectHealth" : s.pillar;
    if (pillarKey in pconsent && !pconsent[pillarKey as keyof ProactiveConsent]) return false;

    // Check dismissal
    const suppressUntil = dismissed[s.id];
    if (suppressUntil && suppressUntil > now) return false;

    return true;
  });

  // Boost scores based on acceptance history
  const analytics = readAnalytics();
  for (const s of filtered) {
    const pillarStats = analytics.byPillar[s.pillar];
    if (pillarStats && pillarStats.suggested > 0) {
      const acceptRate = pillarStats.accepted / pillarStats.suggested;
      s.score *= 0.7 + 0.6 * acceptRate; // 0.7x to 1.3x based on historic acceptance
    }
  }

  // Sort by priority tier, then score
  const priorityOrder: Record<SuggestionPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return filtered
    .sort((a, b) => {
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pd !== 0) return pd;
      return b.score - a.score;
    });
}

// ── Main Engine ──────────────────────────────────────────────────────────────

let _cachedSuggestions: { items: ProactiveSuggestion[]; generatedAt: number } | null = null;
const CACHE_TTL = 3600_000; // 1 hour

let _consentReader: (() => ContextConsent) | null = null;

async function resolveConsentReader(): Promise<() => ContextConsent> {
  if (!_consentReader) {
    const mod = await import("./user-context-tools.js");
    _consentReader = mod.readConsent;
  }
  return _consentReader;
}

/** Knowledge Cortex suggestions: stale pages, gaps, broken links. */
function generateCortexSuggestions(profile: UserContextProfile): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  try {
    if (!_readIndex || !_lintCortex) return suggestions;
    const index = _readIndex();
    if (index.length === 0) return suggestions;
    const lint = _lintCortex();

    // Stale pages (30+ days old)
    for (const page of lint.stalePages.slice(0, 2)) {
      const entry = index.find(e => e.path === page);
      const title = entry?.title ?? page.replace(/.*\//, "").replace(/\.md$/, "").replace(/-/g, " ");
      suggestions.push({
        id: `cortex-stale-${page}`, pillar: "knowledge", priority: "low", score: 0.5,
        title: `Refresh: ${title}`, description: `Your Cortex page on "${title}" hasn't been updated in 30+ days. Research new developments?`,
        icon: "RefreshCw", action: { type: "deep_research", topic: title }, requiredConsent: [], createdAt: Date.now(),
      });
    }

    // Broken links — referenced but missing topics
    const gapSeen: Record<string, boolean> = {};
    for (const bl of lint.brokenLinks.slice(0, 5)) {
      if (gapSeen[bl.link]) continue;
      gapSeen[bl.link] = true;
      const name = bl.link.replace(/-/g, " ");
      suggestions.push({
        id: `cortex-gap-${bl.link}`, pillar: "knowledge", priority: "medium", score: 0.65,
        title: `Knowledge gap: ${name}`, description: `Your Cortex references "${name}" but has no page. Explore this topic?`,
        icon: "BookOpen", action: { type: "send_message", message: `Research ${name} and add it to my Knowledge Cortex` }, requiredConsent: [], createdAt: Date.now(),
      });
    }

    // Interest without cortex page
    const indexSlugs = new Set(index.map(e => e.path.replace(/.*\//, "").replace(/\.md$/, "")));
    for (const interest of (profile.interests ?? []).slice(0, 8)) {
      const slug = interest.topic.toLowerCase().replace(/\s+/g, "-");
      if (!indexSlugs.has(slug) && interest.confidence > 0.6) {
        suggestions.push({
          id: `cortex-interest-${slug}`, pillar: "knowledge", priority: "low", score: 0.55,
          title: `Document: ${interest.topic}`, description: `You're interested in "${interest.topic}" (confidence: ${Math.round(interest.confidence * 100)}%) but have no Cortex page. Create one?`,
          icon: "PlusCircle", action: { type: "send_message", message: `Create a Knowledge Cortex page about ${interest.topic}` }, requiredConsent: [], createdAt: Date.now(),
        });
        if (suggestions.length > 8) break;
      }
    }

    // Enrichment-aware suggestions using entity index data
    try {
      if (!_getEntityIndex) throw new Error("not loaded");
      const entityIndex = _getEntityIndex();
      if (entityIndex.size > 0) {
        let withTags = 0, withCrossRefs = 0, withVideos = 0;
        let maxCrossRefs = 0;
        let mostConnectedEntity: { title: string; source: string; count: number } | null = null;
        const tagClusters: Record<string, { count: number; sources: Set<string> }> = {};

        for (const [, entry] of entityIndex) {
          if (entry.semanticTags?.length) withTags++;
          if (entry.crossReferences?.length) {
            withCrossRefs++;
            if (entry.crossReferences.length > maxCrossRefs) {
              maxCrossRefs = entry.crossReferences.length;
              mostConnectedEntity = { title: entry.title, source: entry.source, count: entry.crossReferences.length };
            }
          }
          if ((entry as any).recommendedVideos?.length) withVideos++;

          // Track semantic tag clusters across sources
          for (const tag of entry.semanticTags || []) {
            if (!tagClusters[tag]) tagClusters[tag] = { count: 0, sources: new Set() };
            tagClusters[tag].count++;
            tagClusters[tag].sources.add(entry.source);
          }
        }

        const total = entityIndex.size;
        const unenrichedTags = total - withTags;
        const unenrichedRefs = total - withCrossRefs;

        // Enrichment gap: many entities lack semantic tags
        if (unenrichedTags > 100) {
          suggestions.push({
            id: "enrichment-semantic-tags", pillar: "knowledge", priority: "medium", score: 0.7,
            title: `${unenrichedTags} entities need semantic tagging`,
            description: `${withTags}/${total} entities have universal theme tags. Run enrichment to unlock cross-source discovery for the remaining ${unenrichedTags}.`,
            icon: "Tags", action: { type: "send_message", message: "Run cortex enrichment to add semantic tags to all entities" },
            requiredConsent: [], createdAt: Date.now(),
          });
        }

        // Enrichment gap: many entities lack cross-references
        if (unenrichedRefs > 100) {
          suggestions.push({
            id: "enrichment-cross-refs", pillar: "knowledge", priority: "medium", score: 0.7,
            title: `${unenrichedRefs} entities await cross-source linking`,
            description: `${withCrossRefs}/${total} entities have cross-source connections. Enrich the rest to discover hidden relationships across your library.`,
            icon: "Link", action: { type: "send_message", message: "Run cortex enrichment to discover cross-source connections" },
            requiredConsent: [], createdAt: Date.now(),
          });
        }

        // Most connected entity highlight
        if (mostConnectedEntity && mostConnectedEntity.count >= 3) {
          suggestions.push({
            id: "enrichment-most-connected", pillar: "knowledge", priority: "low", score: 0.6,
            title: `Most connected: "${mostConnectedEntity.title}"`,
            description: `"${mostConnectedEntity.title}" (${mostConnectedEntity.source}) connects to ${mostConnectedEntity.count} items across your library. Explore these connections?`,
            icon: "Network", action: { type: "send_message", message: `Cross-reference "${mostConnectedEntity.title}" across all my data sources` },
            requiredConsent: [], createdAt: Date.now(),
          });
        }

        // Cross-source semantic tag cluster
        const crossSourceTags = Object.entries(tagClusters)
          .filter(([, data]) => data.sources.size >= 3 && data.count >= 5)
          .sort((a, b) => b[1].count - a[1].count);
        if (crossSourceTags.length > 0) {
          const [tag, data] = crossSourceTags[0];
          suggestions.push({
            id: `enrichment-cluster-${tag}`, pillar: "knowledge", priority: "medium", score: 0.75,
            title: `Theme "${tag}" spans ${data.sources.size} sources`,
            description: `${data.count} items across ${[...data.sources].join(", ")} share the "${tag}" theme. Synthesize them into a unified view?`,
            icon: "Sparkles", action: { type: "send_message", message: `Synthesize everything in my library tagged with "${tag}"` },
            requiredConsent: [], createdAt: Date.now(),
          });
        }
      }
    } catch { /* entity model not available */ }

    // Data sources scanned but not yet ingested into Cortex
    try {
      if (!_getUningestedSources || !_getStaleIngestSources) throw new Error("not loaded");
      const uningestedIds = _getUningestedSources();
      if (uningestedIds.length > 0) {
        suggestions.push({
          id: "cortex-unimported-data", pillar: "knowledge", priority: "high", score: 0.8,
          title: `Import ${uningestedIds.length} data source(s) to Cortex`,
          description: `Your ${uningestedIds.join(", ")} data has been scanned but not imported into the Knowledge Cortex. Import to enhance your knowledge base?`,
          icon: "Database", action: { type: "send_message", message: "Import all my data sources into the Knowledge Cortex" },
          requiredConsent: [], createdAt: Date.now(),
        });
      }
      const staleIds = _getStaleIngestSources!();
      if (staleIds.length > 0) {
        suggestions.push({
          id: "cortex-stale-import", pillar: "knowledge", priority: "medium", score: 0.65,
          title: `Update ${staleIds.length} stale Cortex import(s)`,
          description: `Data for ${staleIds.join(", ")} has changed since last Cortex import. Re-import to keep knowledge current?`,
          icon: "RefreshCw", action: { type: "send_message", message: "Re-import my changed data sources into the Knowledge Cortex" },
          requiredConsent: [], createdAt: Date.now(),
        });
      }
    } catch { /* pipeline module not available */ }
  } catch { /* cortex-tools not available */ }
  return suggestions;
}

/**
 * Cross-App Intelligence — LLM-powered suggestions that find patterns
 * across data sources. Detects convergences, connections, and gaps
 * that span books, movies, games, YouTube, projects, and photos.
 */
function generateCrossAppIntelligence(profile: UserContextProfile): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];

  try {
    if (!_readCache) return suggestions;
    const readCache = _readCache;

    // 1. Trending Convergence — when YouTube channels post about the same topic
    try {
      const ytCache = readCache("youtube-data.json") as { feed?: Array<{ title: string; channelTitle: string }> } | null;
      if (ytCache?.feed?.length) {
        // Find topic clusters in recent feed
        const wordCounts: Record<string, { count: number; channels: Set<string>; titles: string[] }> = {};
        const stopwords = new Set(["the", "a", "an", "how", "why", "what", "new", "my", "your", "this", "with", "for", "and", "from", "that"]);
        for (const v of ytCache.feed.slice(0, 50)) {
          const words = (v.title || "").toLowerCase().split(/[\s\-:!?|,()[\]]+/).filter(w => w.length > 3 && !stopwords.has(w));
          for (const w of words) {
            if (!wordCounts[w]) wordCounts[w] = { count: 0, channels: new Set(), titles: [] };
            wordCounts[w].count++;
            wordCounts[w].channels.add(v.channelTitle || "");
            if (wordCounts[w].titles.length < 3) wordCounts[w].titles.push(v.title);
          }
        }
        // Find topics where 3+ different channels converge
        for (const [word, data] of Object.entries(wordCounts)) {
          if (data.channels.size >= 3 && data.count >= 3) {
            suggestions.push({
              id: `crossapp-trending-${word}`, pillar: "knowledge", priority: "medium", score: 0.7,
              title: `Trending: "${word}" across ${data.channels.size} channels`,
              description: `${data.channels.size} YouTube channels you follow are discussing "${word}": ${data.titles.slice(0, 2).join("; ")}. This may signal an emerging trend worth exploring.`,
              icon: "TrendingUp", action: { type: "deep_research", topic: word }, requiredConsent: ["youtube" as keyof ContextConsent], createdAt: Date.now(),
            });
            break; // Only one trending suggestion
          }
        }
      }
    } catch { /* YouTube not available */ }

    // 2. Knowledge Gap — you have many items in a domain but no synthesis
    try {
      if (!_readIndex) throw new Error("not loaded");
      const index = _readIndex();

      // Count entities by source type
      const sourceCounts: Record<string, number> = {};
      for (const e of index) {
        const p = e.path;
        if (p.startsWith("entities/game-")) sourceCounts.steam = (sourceCounts.steam || 0) + 1;
        else if (p.startsWith("entities/movie-") || p.startsWith("entities/tv-")) sourceCounts.movies = (sourceCounts.movies || 0) + 1;
        else if (p.startsWith("entities/photo-album-")) sourceCounts.photos = (sourceCounts.photos || 0) + 1;
        else if (p.includes("kindle") || e.tags.includes("book")) sourceCounts.kindle = (sourceCounts.kindle || 0) + 1;
      }

      // Count synthesis pages
      const synthPages = index.filter(e => e.path.startsWith("synthesis/")).length;
      const totalEntities = index.filter(e => e.path.startsWith("entities/")).length;

      // If we have many entities but few synthesis pages, suggest synthesis
      if (totalEntities > 50 && synthPages < 5) {
        suggestions.push({
          id: "crossapp-synthesis-needed", pillar: "knowledge", priority: "high", score: 0.8,
          title: `Your Cortex has ${totalEntities} entities but only ${synthPages} synthesis pages`,
          description: `You have rich data across ${Object.keys(sourceCounts).length} sources, but the Cortex hasn't deeply connected them yet. Generate a Thematic Map to discover cross-cutting patterns?`,
          icon: "Sparkles", action: { type: "send_message", message: "Generate a thematic map of my Knowledge Cortex to find cross-cutting themes" }, requiredConsent: [], createdAt: Date.now(),
        });
      }

      // 3. Cross-Source Connection — find specific cross-domain insights
      // Check if user's top interests have content in multiple sources
      const interests = (profile.interests ?? []).slice(0, 5);
      for (const interest of interests) {
        const topic = interest.topic.toLowerCase();
        let sourceHits = 0;
        const matchedSources: string[] = [];

        // Check each source for this interest
        const kindleCache = readCache("kindle-library.json") as { books?: Array<{ title: string; categories?: string[] }> } | null;
        if (kindleCache?.books?.some(b => b.title.toLowerCase().includes(topic) || (b.categories || []).some(c => c.toLowerCase().includes(topic)))) {
          sourceHits++; matchedSources.push("books");
        }
        const movieCache = readCache("movies-tv.json") as { items?: Array<{ title: string; genres?: string[] }> } | null;
        if (movieCache?.items?.some(m => m.title.toLowerCase().includes(topic) || (m.genres || []).some(g => g.toLowerCase().includes(topic)))) {
          sourceHits++; matchedSources.push("movies/TV");
        }
        const ytCache = readCache("youtube-data.json") as { subscriptions?: Array<{ title: string; description?: string }> } | null;
        if (ytCache?.subscriptions?.some(c => c.title.toLowerCase().includes(topic) || (c.description || "").toLowerCase().includes(topic))) {
          sourceHits++; matchedSources.push("YouTube");
        }
        const steamCache = readCache("steam-games.json") as { games?: Array<{ name: string; genres?: string[] }> } | null;
        if (steamCache?.games?.some(g => g.name.toLowerCase().includes(topic) || (g.genres || []).some(ge => ge.toLowerCase().includes(topic)))) {
          sourceHits++; matchedSources.push("games");
        }

        // If this interest spans 3+ sources, it's a cross-source pattern worth highlighting
        if (sourceHits >= 3) {
          suggestions.push({
            id: `crossapp-connection-${topic.replace(/\s+/g, "-")}`, pillar: "knowledge", priority: "high", score: 0.85,
            title: `"${interest.topic}" spans ${sourceHits} sources`,
            description: `Your interest in "${interest.topic}" appears across ${matchedSources.join(", ")}. Cross-reference to discover deeper connections?`,
            icon: "Network", action: { type: "send_message", message: `Cross-reference "${interest.topic}" across all my data sources` }, requiredConsent: [], createdAt: Date.now(),
          });
          break; // Only one connection suggestion
        }
      }
    } catch { /* cortex or data not available */ }

    // 4. Photo Memory — "On This Day" prompt
    try {
      const photoCache = readCache("photo-library.json") as { albums?: Array<{ name: string; dateRange?: { from?: string }; photoCount: number }> } | null;
      if (photoCache?.albums) {
        const today = new Date();
        const monthDay = (today.getMonth() + 1).toString().padStart(2, "0") + "-" + today.getDate().toString().padStart(2, "0");
        const thisYear = today.getFullYear();
        const memories = photoCache.albums.filter(a => {
          if (!a.dateRange?.from) return false;
          return a.dateRange.from.substring(5, 10) === monthDay && parseInt(a.dateRange.from.substring(0, 4)) < thisYear;
        });
        if (memories.length > 0) {
          const oldest = memories.sort((a, b) => (a.dateRange!.from! > b.dateRange!.from! ? 1 : -1))[0];
          const yearsAgo = thisYear - parseInt(oldest.dateRange!.from!.substring(0, 4));
          suggestions.push({
            id: `crossapp-memory-${monthDay}`, pillar: "ambient" as SuggestionPillar, priority: "low", score: 0.6,
            title: `📅 ${yearsAgo} year${yearsAgo > 1 ? "s" : ""} ago: ${oldest.name}`,
            description: `On this day ${yearsAgo} year${yearsAgo > 1 ? "s" : ""} ago, you captured ${oldest.photoCount} photos in "${oldest.name}".`,
            icon: "Camera", action: { type: "run_app", appId: "photo_library" }, requiredConsent: ["photos" as keyof ContextConsent], createdAt: Date.now(),
          });
        }
      }
    } catch { /* photos not available */ }

    // 5. Stale Project Alert — projects with no activity for 30+ days
    try {
      const fileCache = readCache("file-index.json") as { projects?: Array<{ name: string; lastModified?: string; technologies: string[] }> } | null;
      if (fileCache?.projects) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const staleProjects = fileCache.projects.filter(p => p.lastModified && p.lastModified < thirtyDaysAgo);
        if (staleProjects.length >= 3) {
          suggestions.push({
            id: "crossapp-stale-projects", pillar: "project_health", priority: "medium", score: 0.6,
            title: `${staleProjects.length} projects haven't been touched in 30+ days`,
            description: `Projects going stale: ${staleProjects.slice(0, 3).map(p => p.name).join(", ")}${staleProjects.length > 3 ? ` (+${staleProjects.length - 3} more)` : ""}. Time to revisit or archive?`,
            icon: "Archive", action: { type: "run_app", appId: "projects" }, requiredConsent: ["files" as keyof ContextConsent], createdAt: Date.now(),
          });
        }
      }
    } catch { /* files not available */ }
  } catch (err) {
    logAction({ ts: Date.now(), type: "action", category: "proactive-engine", message: `Cross-app intelligence error: ${err}` });
  }

  return suggestions;
}

export async function generateSuggestions(forceRefresh: boolean = false): Promise<ProactiveSuggestion[]> {
  if (!forceRefresh && _cachedSuggestions && Date.now() - _cachedSuggestions.generatedAt < CACHE_TTL) {
    return _cachedSuggestions.items;
  }

  // Ensure lazy-loaded modules are ready
  await ensureModules();

  const profile = loadProfile();
  if (!profile) return [];

  let consent: ContextConsent;
  try {
    const readConsent = await resolveConsentReader();
    consent = readConsent();
  } catch { return []; }

  const pconsent = readProactiveConsent();
  if (!pconsent.enabled) return [];

  const delta = computeProfileDelta(profile);

  const allSuggestions: ProactiveSuggestion[] = [
    ...(pconsent.projectHealth ? analyzeProjectHealth(profile, delta) : []),
    ...(pconsent.research ? analyzeResearchOpportunities(profile, delta) : []),
    ...(pconsent.communication ? analyzeCommunication(profile) : []),
    ...(pconsent.workflow ? analyzeWorkflowOpportunities(profile) : []),
    ...(pconsent.learning ? analyzeLearningOpportunities(profile) : []),
    ...runAmbientTasks(profile),
    ...generateCortexSuggestions(profile),
    ...generateCrossAppIntelligence(profile),
  ];

  // Record suggestion count for analytics
  const analytics = readAnalytics();
  analytics.totalSuggested += allSuggestions.length;
  for (const s of allSuggestions) {
    if (!analytics.byPillar[s.pillar]) analytics.byPillar[s.pillar] = { suggested: 0, accepted: 0, dismissed: 0 };
    analytics.byPillar[s.pillar].suggested++;
  }
  mkdirSync(PROACTIVE_DIR, { recursive: true });
  writeFileSync(ANALYTICS_PATH, JSON.stringify(analytics, null, 2));

  const ranked = rankSuggestions(allSuggestions, consent, pconsent);

  // Save snapshot for next delta comparison
  saveSnapshot(profile);

  _cachedSuggestions = { items: ranked, generatedAt: Date.now() };

  logAction({
    ts: Date.now(), type: "action", category: "proactive-engine",
    message: `Generated ${allSuggestions.length} suggestions, ${ranked.length} after filtering`,
  });

  return ranked;
}

/** Top N suggestions suitable for Welcome Card or nudge banner. */
export async function getTopSuggestions(count: number = 3): Promise<ProactiveSuggestion[]> {
  return (await generateSuggestions()).slice(0, count);
}

// ── Daily Digest ─────────────────────────────────────────────────────────────

let _cachedDigest: DailyDigest | null = null;

export function generateDailyDigest(): DailyDigest | null {
  const today = new Date().toISOString().slice(0, 10);
  if (_cachedDigest?.date === today) return _cachedDigest;

  const profile = loadProfile();
  if (!profile) return null;

  const delta = computeProfileDelta(profile);
  const items: DigestItem[] = [];

  // Changes since last snapshot
  if (delta.newProjects.length > 0) {
    items.push({
      category: "change",
      title: `${delta.newProjects.length} new project${delta.newProjects.length > 1 ? "s" : ""} detected`,
      description: delta.newProjects.join(", "),
      icon: "folder-plus",
      priority: "medium",
    });
  }

  if (delta.newInterests.length > 0) {
    items.push({
      category: "change",
      title: "New interests detected",
      description: delta.newInterests.slice(0, 5).join(", "),
      icon: "sparkles",
      priority: "low",
    });
  }

  // Stale projects
  for (const stale of delta.staleProjects.slice(0, 2)) {
    items.push({
      category: "project",
      title: `${stale.name} inactive (${stale.daysSinceActive}d)`,
      description: "Consider archiving or revisiting this project",
      icon: "archive",
      priority: "low",
      action: { type: "open_project", path: profile.workProjects.find(p => p.name === stale.name)?.path || "" },
    });
  }

  // Top research opportunities
  const researchSuggestions = analyzeResearchOpportunities(profile, delta);
  for (const rs of researchSuggestions.filter(s => s.score > 0.5).slice(0, 2)) {
    items.push({
      category: "research",
      title: rs.title,
      description: rs.description,
      icon: rs.icon,
      priority: rs.priority,
      action: rs.action,
    });
  }

  // Email items
  const commSuggestions = analyzeCommunication(profile);
  for (const cs of commSuggestions.filter(s => s.priority === "high" || s.priority === "urgent").slice(0, 2)) {
    items.push({
      category: "communication",
      title: cs.title,
      description: cs.description,
      icon: cs.icon,
      priority: cs.priority,
      action: cs.action,
    });
  }

  // Learning nudges
  const learningSuggestions = analyzeLearningOpportunities(profile);
  for (const ls of learningSuggestions.slice(0, 1)) {
    items.push({
      category: "learning",
      title: ls.title,
      description: ls.description,
      icon: ls.icon,
      priority: ls.priority,
      action: ls.action,
    });
  }

  if (items.length === 0) return null;

  // Sort: urgent > high > medium > low
  const priorityOrder: Record<SuggestionPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Context-aware greeting
  const hour = new Date().getHours();
  let timeGreeting = "Hello";
  if (hour < 12) timeGreeting = "Good morning";
  else if (hour < 17) timeGreeting = "Good afternoon";
  else timeGreeting = "Good evening";

  const topProject = profile.workProjects[0];
  const greeting = topProject
    ? `${timeGreeting}. Here's what's happening with your projects and interests today.`
    : `${timeGreeting}. Here's your daily update.`;

  const digest: DailyDigest = {
    date: today,
    greeting,
    items,
    generatedAt: Date.now(),
  };

  _cachedDigest = digest;

  logAction({
    ts: Date.now(), type: "action", category: "proactive-engine",
    message: `Daily digest generated: ${items.length} items`,
  });

  return digest;
}

/** Legacy compatibility: returns the old-style briefing text */
export function getDailyBriefingCompat(): string | null {
  const digest = generateDailyDigest();
  if (!digest) return null;

  const parts = [digest.greeting];
  for (const item of digest.items.slice(0, 6)) {
    parts.push(`- ${item.title}: ${item.description}`);
  }
  return parts.join("\n");
}
