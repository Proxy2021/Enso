/**
 * Data Source Registry — Centralized descriptor for all user-context data sources.
 *
 * Each data source declares how it formats data for both the user profile builder
 * and the Cortex wiki ingest pipeline. Adding a new data source means adding ONE
 * entry here — the profile builder, wiki ingest, post-scan pipeline, and proactive
 * engine all pick it up automatically through the registry loop.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

// ── Paths ──

const CACHE_DIR = join(homedir(), ".enso", "data", "user-context", "cache");
const HASHES_PATH = join(CACHE_DIR, "_hashes.json");

// ── Types ──

export interface WikiSourceBlock {
  text: string;
  topic: string;
  label: string;
}

export interface DataSourceDescriptor {
  /** Unique key — matches ContextConsent key */
  id: string;
  /** Cache filename under ~/.enso/data/user-context/cache/ */
  cacheFile: string;
  /** Scanner tool name to invoke */
  scannerToolName: string;
  /** Default params for scanner invocation */
  scannerParams: Record<string, unknown>;

  /**
   * Format cached data for profile building (contextParts string).
   * Returns null if no useful data.
   */
  formatForProfile: (cached: unknown) => string | null;

  /**
   * Format cached data for Cortex wiki ingestion.
   * Returns { text, topic, label } or null if no useful data.
   */
  formatForWiki: (cached: unknown) => WikiSourceBlock | null;

  /** Priority for ingestion ordering (lower = first). Default 50. */
  ingestPriority?: number;

  /** Whether this source fetches live data (not from cache) during wiki import */
  liveSource?: boolean;
}

// ── Shared Cache Reader ──

export function readCache(filename: string): unknown | null {
  const path = join(CACHE_DIR, filename);
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch { /* ignore */ }
  return null;
}

// ── Ingest Hashes (for change detection) ──

interface IngestHashEntry {
  hash: string;
  ingestedAt: number;
}

export function readIngestHashes(): Record<string, IngestHashEntry> {
  try {
    if (existsSync(HASHES_PATH)) return JSON.parse(readFileSync(HASHES_PATH, "utf-8"));
  } catch { /* ignore */ }
  return {};
}

export function writeIngestHashes(hashes: Record<string, IngestHashEntry>): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(HASHES_PATH, JSON.stringify(hashes, null, 2));
}

export function computeCacheHash(filename: string): string | null {
  const path = join(CACHE_DIR, filename);
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path);
    return createHash("sha256").update(content).digest("hex");
  } catch { return null; }
}

// ── Registry ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export const DATA_SOURCES: DataSourceDescriptor[] = [
  // ── Files & Projects (most knowledge-rich — ingest first) ──
  {
    id: "files",
    cacheFile: "file-index.json",
    scannerToolName: "enso_context_scan_files",
    scannerParams: {},
    ingestPriority: 10,
    formatForProfile: (cached: A) => {
      const parts: string[] = [];
      if (cached?.projects?.length) parts.push(`Projects: ${cached.projects.map((p: A) => `${p.name} (${p.technologies.join(", ")})`).join(", ")}`);
      if (cached?.topFileTypes?.length) parts.push(`File types: ${cached.topFileTypes.map((f: A) => `${f.ext} (${f.count})`).join(", ")}`);
      return parts.length ? `## Projects & Files\n${parts.join("\n")}` : null;
    },
    formatForWiki: (cached: A) => {
      if (!cached?.projects?.length) return null;
      const lines = ["# Software Projects on this machine\n"];
      const byType = new Map<string, A[]>();
      for (const p of cached.projects) {
        const list = byType.get(p.type) ?? [];
        list.push(p);
        byType.set(p.type, list);
      }
      for (const [type, projects] of byType) {
        lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)} Projects (${projects.length})`);
        for (const p of projects) lines.push(`- **${p.name}**: ${p.technologies.join(", ")}. Path: ${p.path}`);
      }
      if (cached.topFileTypes?.length) {
        lines.push("\n## Most Used File Types");
        for (const f of cached.topFileTypes.slice(0, 10)) lines.push(`- ${f.ext}: ${f.count} files`);
      }
      return { text: lines.join("\n"), topic: "Software Projects", label: "File system project scan" };
    },
  },

  // ── Browser History ──
  {
    id: "browserHistory",
    cacheFile: "browser-history.json",
    scannerToolName: "enso_context_scan_browser_history",
    scannerParams: { browser: "all", limit: 500, sinceDays: 30 },
    ingestPriority: 20,
    formatForProfile: (cached: A) => {
      const parts: string[] = [];
      if (cached?.topDomains?.length) parts.push(`Top sites: ${cached.topDomains.slice(0, 20).map((d: A) => `${d.domain} (${d.visits} visits)`).join(", ")}`);
      if (cached?.recentSearches?.length) parts.push(`Recent searches: ${cached.recentSearches.slice(0, 15).map((s: A) => s.query).join(", ")}`);
      return parts.length ? `## Browser Activity\n${parts.join("\n")}` : null;
    },
    formatForWiki: (cached: A) => {
      if (!cached?.topDomains?.length && !cached?.recentSearches?.length) return null;
      const lines = ["# Browser Activity\n"];
      if (cached.topDomains?.length) {
        lines.push("## Frequently Visited Sites");
        for (const d of cached.topDomains.slice(0, 25)) lines.push(`- ${d.domain} (${d.visits} visits)`);
      }
      if (cached.recentSearches?.length) {
        lines.push("\n## Recent Search Queries");
        for (const s of cached.recentSearches.slice(0, 20)) lines.push(`- ${s.query}`);
      }
      if (cached.recentPages?.length) {
        lines.push("\n## Recent Pages Visited");
        for (const p of cached.recentPages.slice(0, 20)) lines.push(`- ${p.title} (${p.domain})`);
      }
      return { text: lines.join("\n"), topic: "Browser Activity", label: "Browser history scan" };
    },
  },

  // ── Bookmarks ──
  {
    id: "bookmarks",
    cacheFile: "bookmarks.json",
    scannerToolName: "enso_context_scan_bookmarks",
    scannerParams: {},
    ingestPriority: 30,
    formatForProfile: (cached: A) => {
      if (!cached?.folders?.length) return null;
      return `## Bookmarks\nFolders: ${cached.folders.slice(0, 10).map((f: A) => `${f.folder} (${f.count})`).join(", ")}`;
    },
    formatForWiki: (cached: A) => {
      if (!cached?.folders?.length) return null;
      const lines = [`# Browser Bookmarks (${cached.totalBookmarks ?? "?"} total)\n`];
      for (const folder of cached.folders.slice(0, 15)) {
        lines.push(`## ${folder.folder} (${folder.count} items)`);
        for (const bm of folder.bookmarks.slice(0, 10)) lines.push(`- ${bm.title}: ${bm.url}`);
      }
      return { text: lines.join("\n"), topic: "Browser Bookmarks", label: "Bookmarks scan" };
    },
  },

  // ── Email ──
  {
    id: "email",
    cacheFile: "email-summary.json",
    scannerToolName: "enso_context_scan_email",
    scannerParams: { folder: "inbox", limit: 100 },
    ingestPriority: 40,
    formatForProfile: (cached: A) => {
      const parts: string[] = [];
      if (cached?.topSenders?.length) parts.push(`Top senders: ${cached.topSenders.slice(0, 10).map((s: A) => `${s.from} (${s.count}x)`).join(", ")}`);
      if (cached?.recentSubjects?.length) parts.push(`Recent subjects: ${cached.recentSubjects.slice(0, 10).map((s: A) => s.subject).join("; ")}`);
      return parts.length ? `## Email\n${parts.join("\n")}` : null;
    },
    formatForWiki: (cached: A) => {
      if (!cached?.topSenders?.length && !cached?.recentSubjects?.length) return null;
      const lines = ["# Email Communication\n"];
      if (cached.topSenders?.length) {
        lines.push("## Key Contacts");
        for (const s of cached.topSenders.slice(0, 15)) lines.push(`- ${s.from} (${s.count} messages)`);
      }
      if (cached.recentSubjects?.length) {
        lines.push("\n## Recent Email Topics");
        for (const e of cached.recentSubjects.slice(0, 15)) lines.push(`- ${e.subject} (from: ${e.from})`);
      }
      return { text: lines.join("\n"), topic: "Email Communication", label: "Email scan" };
    },
  },

  // ── System Info ──
  {
    id: "system",
    cacheFile: "system-info.json",
    scannerToolName: "enso_context_scan_system",
    scannerParams: { include: ["apps", "processes"] },
    ingestPriority: 60,
    formatForProfile: (cached: A) => {
      if (!cached?.installedApps?.length) return null;
      return `## Installed Software\n${cached.installedApps.slice(0, 30).join(", ")}`;
    },
    formatForWiki: (cached: A) => {
      if (!cached?.installedApps?.length) return null;
      const lines = ["# Development Environment\n"];
      if (cached.platform) lines.push(`Platform: ${cached.platform}`);
      lines.push("\n## Installed Applications");
      for (const app of cached.installedApps.slice(0, 50)) lines.push(`- ${app}`);
      return { text: lines.join("\n"), topic: "Development Environment", label: "System scan" };
    },
  },

  // ── Kindle Library ──
  {
    id: "kindleLibrary",
    cacheFile: "kindle-library.json",
    scannerToolName: "enso_context_scan_kindle_library",
    scannerParams: {},
    ingestPriority: 50,
    formatForProfile: (cached: A) => {
      if (!cached?.books?.length) return null;
      const bookList = cached.books.slice(0, 20).map((b: A) => `- "${b.title}" by ${b.author}`).join("\n");
      return `## Kindle Library (${cached.totalBooks ?? cached.books.length} books)\n${bookList}`;
    },
    formatForWiki: (cached: A) => {
      if (!cached?.books?.length) return null;
      const lines = [
        `# Kindle Library (${cached.totalBooks ?? cached.books.length} books)\n`,
        "Books owned by this user on Amazon Kindle, revealing reading interests and knowledge domains.\n",
      ];
      for (const b of cached.books.slice(0, 100)) {
        let line = `- **${b.title}** by ${b.author}`;
        if (b.categories?.length) line += ` [${b.categories.join(", ")}]`;
        if (b.description) line += `: ${b.description.slice(0, 150)}`;
        lines.push(line);
      }
      return { text: lines.join("\n"), topic: "Kindle Library", label: "Kindle library scan" };
    },
  },
];

// ── Lookup ──

const _byId = new Map(DATA_SOURCES.map((ds) => [ds.id, ds]));

export function getDataSource(id: string): DataSourceDescriptor | undefined {
  return _byId.get(id);
}

export function getDataSourceIds(): string[] {
  return DATA_SOURCES.map((ds) => ds.id);
}
