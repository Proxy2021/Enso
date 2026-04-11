/**
 * Data Source Registry — Centralized descriptor for all user-context data sources.
 *
 * Each data source declares how it formats data for both the user profile builder
 * and the Cortex ingest pipeline. Adding a new data source means adding ONE
 * entry here — the profile builder, cortex ingest, post-scan pipeline, and proactive
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

export interface CortexSourceBlock {
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
   * Format cached data for Cortex ingestion.
   * Returns { text, topic, label } or null if no useful data.
   */
  formatForCortex: (cached: unknown) => CortexSourceBlock | null;

  /** Priority for ingestion ordering (lower = first). Default 50. */
  ingestPriority?: number;

  /** Whether this source fetches live data (not from cache) during cortex import */
  liveSource?: boolean;

  /**
   * Generate per-item cortex pages directly (no LLM cost).
   * Returns an array of cortex pages to write. Each page becomes a first-class
   * Cortex entity that supports all actions (read, research, podcast, etc.).
   */
  getDirectIngestPages?: (cached: unknown) => DirectIngestPage[];
}

export interface DirectIngestPage {
  /** Cortex path, e.g. "entities/the-story-of-the-human-body.md" */
  path: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  /** Stable entity identifier linking to entity-model.ts, e.g. "kindle:book:sapiens" */
  entityId?: string;
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
    formatForCortex: (cached: A) => {
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
        for (const f of cached.topFileTypes) lines.push(`- ${f.ext}: ${f.count} files`);
      }
      return { text: lines.join("\n"), topic: "Software Projects", label: "File system project scan" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.projects?.length) return [];
      return cached.projects.map((p: A) => {
        const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
        const lines = [`# ${p.name}\n`];
        lines.push(`A **${p.type}** project located at \`${p.path}\`.\n`);
        if (p.technologies?.length) {
          lines.push("## Tech Stack");
          for (const t of p.technologies) lines.push(`- [[${t.toLowerCase()}]]`);
        }
        lines.push(`\n## Details`);
        lines.push(`- **Type**: ${p.type}`);
        lines.push(`- **Path**: \`${p.path}\``);
        return {
          path: `entities/${slug}.md`,
          title: p.name,
          content: lines.join("\n"),
          summary: `${p.name} — a ${p.type} project using ${(p.technologies || []).join(", ")}`,
          tags: ["project", p.type, ...(p.technologies || []).map((t: string) => t.toLowerCase())],
          entityId: `files:project:${slug}`,
        };
      });
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
    formatForCortex: (cached: A) => {
      if (!cached?.topDomains?.length && !cached?.recentSearches?.length) return null;
      const lines = ["# Browser Activity\n"];
      if (cached.topDomains?.length) {
        lines.push("## Frequently Visited Sites");
        for (const d of cached.topDomains) lines.push(`- ${d.domain} (${d.visits} visits)`);
      }
      if (cached.recentSearches?.length) {
        lines.push("\n## Recent Search Queries");
        for (const s of cached.recentSearches) lines.push(`- ${s.query}`);
      }
      if (cached.recentPages?.length) {
        lines.push("\n## Recent Pages Visited");
        for (const p of cached.recentPages) lines.push(`- ${p.title} (${p.domain})`);
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
    formatForCortex: (cached: A) => {
      if (!cached?.folders?.length) return null;
      const lines = [`# Browser Bookmarks (${cached.totalBookmarks ?? "?"} total)\n`];
      for (const folder of cached.folders) {
        lines.push(`## ${folder.folder} (${folder.count} items)`);
        for (const bm of folder.bookmarks) lines.push(`- ${bm.title}: ${bm.url}`);
      }
      return { text: lines.join("\n"), topic: "Browser Bookmarks", label: "Bookmarks scan" };
    },
  },

  // ── Email ──
  {
    id: "email",
    cacheFile: "email-summary.json",
    scannerToolName: "enso_context_scan_email",
    scannerParams: { folder: "inbox", limit: 500 },
    ingestPriority: 40,
    formatForProfile: (cached: A) => {
      const parts: string[] = [];
      if (cached?.topSenders?.length) parts.push(`Top senders: ${cached.topSenders.slice(0, 10).map((s: A) => `${s.from} (${s.count}x)`).join(", ")}`);
      if (cached?.recentSubjects?.length) parts.push(`Recent subjects: ${cached.recentSubjects.slice(0, 10).map((s: A) => s.subject).join("; ")}`);
      return parts.length ? `## Email\n${parts.join("\n")}` : null;
    },
    formatForCortex: (cached: A) => {
      if (!cached?.topSenders?.length && !cached?.recentSubjects?.length) return null;
      const lines = ["# Email Communication\n"];
      if (cached.topSenders?.length) {
        lines.push("## Key Contacts");
        for (const s of cached.topSenders) lines.push(`- ${s.from} (${s.count} messages)`);
      }
      if (cached.recentSubjects?.length) {
        lines.push("\n## Recent Email Topics");
        for (const e of cached.recentSubjects) lines.push(`- ${e.subject} (from: ${e.from})`);
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
    formatForCortex: (cached: A) => {
      if (!cached?.installedApps?.length) return null;
      const lines = ["# Development Environment\n"];
      if (cached.platform) lines.push(`Platform: ${cached.platform}`);
      lines.push("\n## Installed Applications");
      for (const app of cached.installedApps) lines.push(`- ${app}`);
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
    formatForCortex: (cached: A) => {
      if (!cached?.books?.length) return null;
      // Group books by category for a more structured, LLM-friendly format
      const categorized = new Map<string, Array<{ title: string; author: string; description?: string }>>();
      const uncategorized: Array<{ title: string; author: string; description?: string }> = [];
      for (const b of cached.books) {
        if (b.categories?.length) {
          for (const cat of b.categories) {
            const list = categorized.get(cat) ?? [];
            list.push(b);
            categorized.set(cat, list);
          }
        } else {
          uncategorized.push(b);
        }
      }
      const lines = [
        `# Kindle Library (${cached.totalBooks ?? cached.books.length} books)\n`,
        "Complete book collection revealing reading interests and knowledge domains.\n",
      ];
      // Top categories with their books
      const sortedCats = [...categorized.entries()].sort((a, b) => b[1].length - a[1].length);
      for (const [cat, books] of sortedCats.slice(0, 30)) {
        lines.push(`\n## ${cat} (${books.length} books)`);
        for (const b of books.slice(0, 15)) {
          let line = `- **${b.title}** by ${b.author}`;
          if (b.description) line += `: ${b.description.slice(0, 100)}`;
          lines.push(line);
        }
        if (books.length > 15) lines.push(`- ... and ${books.length - 15} more in this category`);
      }
      if (uncategorized.length > 0) {
        lines.push(`\n## Other Books (${uncategorized.length})`);
        for (const b of uncategorized.slice(0, 20)) {
          lines.push(`- **${b.title}** by ${b.author}`);
        }
        if (uncategorized.length > 20) lines.push(`- ... and ${uncategorized.length - 20} more`);
      }
      return { text: lines.join("\n"), topic: "Kindle Library", label: "Kindle library scan" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.books?.length) return [];
      const pages: DirectIngestPage[] = [];
      for (const b of cached.books) {
        if (!b.title) continue;
        const slug = b.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
        if (!slug) continue;
        const ratingStr = b.rating ? `⭐ ${b.rating}${b.reviewCount ? ` (${b.reviewCount.toLocaleString()} reviews)` : ""}` : "";
        const catLinks = (b.categories || []).map((c: string) => `[[${c.toLowerCase().replace(/[^a-z0-9]+/g, "-")}]]`).join(", ");
        const lines = [`# ${b.title}\n`];
        lines.push(`By **${b.author}**.${b.publisher ? ` Published by ${b.publisher}` : ""}${b.publicationDate ? `, ${b.publicationDate}` : ""}.${b.pageCount ? ` ${b.pageCount} pages.` : ""}\n`);
        if (ratingStr) lines.push(`${ratingStr}${catLinks ? ` · Categories: ${catLinks}` : ""}\n`);
        if (b.description) lines.push(`${b.description}\n`);
        lines.push("## Details");
        lines.push(`- **Author**: ${b.author}`);
        if (b.publisher) lines.push(`- **Publisher**: ${b.publisher}`);
        if (b.isbn) lines.push(`- **ISBN**: ${b.isbn}`);
        if (b.language) lines.push(`- **Language**: ${b.language}`);
        if (b.asin) lines.push(`- **ASIN**: ${b.asin}`);
        if (b.readerUrl) lines.push(`- **Amazon**: [Read on Kindle](${b.readerUrl})`);
        if (b.coverUrl) lines.push(`- **Cover**: ![cover](${b.coverUrl})`);
        if (b.categories?.length) {
          lines.push("\n## Categories");
          for (const c of b.categories) lines.push(`- [[${c.toLowerCase().replace(/[^a-z0-9]+/g, "-")}]]`);
        }
        pages.push({
          path: `entities/${slug}.md`,
          title: b.title,
          content: lines.join("\n"),
          summary: b.description?.slice(0, 200) || `${b.title} by ${b.author}`,
          tags: ["book", "kindle", ...(b.categories || []).map((c: string) => c.toLowerCase())],
          entityId: `kindle:book:${slug}`,
        });
      }
      return pages;
    },
  },

  // ── WeRead (微信读书) ──
  {
    id: "wereadLibrary",
    cacheFile: "weread-library.json",
    scannerToolName: "enso_context_scan_weread",
    scannerParams: {},
    ingestPriority: 49,
    formatForProfile: (cached: A) => {
      if (!cached?.books?.length) return null;
      const bookList = cached.books.slice(0, 20).map((b: A) => `- "${b.title}" by ${b.author}`).join("\n");
      return `## WeRead Library (${cached.totalBooks ?? cached.books.length} books)\n${bookList}`;
    },
    formatForCortex: (cached: A) => {
      if (!cached?.books?.length) return null;
      const lines = [
        `# WeRead Library (${cached.totalBooks ?? cached.books.length} books)\n`,
        "Books from WeRead (微信读书) — Chinese digital reading platform.\n",
      ];
      for (const b of cached.books.slice(0, 50)) {
        let line = `- **${b.title}** by ${b.author}`;
        if (b.description) line += `: ${b.description.slice(0, 100)}`;
        lines.push(line);
      }
      if (cached.books.length > 50) lines.push(`- ... and ${cached.books.length - 50} more`);
      return { text: lines.join("\n"), topic: "WeRead Library", label: "WeRead library scan" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.books?.length) return [];
      const pages: DirectIngestPage[] = [];
      for (const b of cached.books) {
        if (!b.title) continue;
        const slug = b.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80);
        if (!slug) continue;
        const lines = [`# ${b.title}\n`];
        lines.push(`By **${b.author || "Unknown"}**.${b.publisher ? ` Published by ${b.publisher}` : ""}${b.publishTime ? `, ${b.publishTime}` : ""}\n`);
        if (b.rating) lines.push(`⭐ ${b.rating}\n`);
        if (b.description) lines.push(`${b.description}\n`);
        lines.push("## Details");
        lines.push(`- **Author**: ${b.author || "Unknown"}`);
        lines.push(`- **Source**: WeRead (微信读书)`);
        if (b.publisher) lines.push(`- **Publisher**: ${b.publisher}`);
        if (b.isbn) lines.push(`- **ISBN**: ${b.isbn}`);
        if (b.wereadBookId) lines.push(`- **WeRead ID**: ${b.wereadBookId}`);
        if (b.readingProgress) lines.push(`- **Reading Progress**: ${b.readingProgress}%`);
        if (b.noteCount) lines.push(`- **Notes/Highlights**: ${b.noteCount}`);
        if (b.coverUrl) lines.push(`- **Cover**: ![cover](${b.coverUrl})`);
        if (b.categories?.length) {
          lines.push("\n## Categories");
          for (const c of b.categories) lines.push(`- [[${c.toLowerCase().replace(/[^a-z0-9]+/g, "-")}]]`);
        }
        pages.push({
          path: `entities/weread-${slug}.md`,
          title: b.title,
          content: lines.join("\n"),
          summary: b.description?.slice(0, 200) || `${b.title} by ${b.author || "Unknown"} (WeRead)`,
          tags: ["book", "weread", ...(b.categories || []).map((c: string) => c.toLowerCase())],
          entityId: `weread:book:${slug}`,
        });
      }
      return pages;
    },
  },

  // ── Files & Projects — per-project pages ──
  // (The 'files' descriptor is above; add getDirectIngestPages to it)

  // ── YouTube ──
  {
    id: "youtube",
    cacheFile: "youtube-data.json",
    scannerToolName: "enso_context_scan_youtube",  // YouTube scanner in user-context-tools
    scannerParams: {},
    ingestPriority: 45,
    formatForProfile: (cached: A) => {
      const parts: string[] = [];
      if (cached?.subscriptions?.length) parts.push(`YouTube subscriptions: ${cached.subscriptions.slice(0, 15).map((c: A) => c.title).join(", ")}`);
      if (cached?.likedVideos?.length) parts.push(`Liked: ${cached.likedVideos.slice(0, 10).map((v: A) => v.title).join(", ")}`);
      return parts.length ? `## YouTube\n${parts.join("\n")}` : null;
    },
    formatForCortex: (cached: A) => {
      if (!cached?.subscriptions?.length && !cached?.likedVideos?.length && !cached?.feed?.length) return null;
      const lines = ["# YouTube Activity\n", "Subscriptions, liked videos, and recent feed revealing content interests.\n"];
      if (cached.subscriptions?.length) {
        lines.push("## Subscriptions (" + cached.subscriptions.length + " channels)");
        for (const ch of cached.subscriptions) lines.push(`- **${ch.title}**: ${ch.description?.slice(0, 120) || "No description"}`);
      }
      if (cached.likedVideos?.length) {
        lines.push("\n## Liked Videos (" + cached.likedVideos.length + ")");
        for (const v of cached.likedVideos) lines.push(`- **${v.title}** by ${v.channelTitle || "unknown"}`);
      }
      if (cached.feed?.length) {
        lines.push("\n## Recent Feed (" + cached.feed.length + ")");
        for (const v of cached.feed) lines.push(`- **${v.title}** by ${v.channelTitle || "unknown"}`);
      }
      return { text: lines.join("\n"), topic: "YouTube Activity", label: "YouTube API data" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.subscriptions?.length) return [];
      // Create pages for top subscribed channels (by engagement, not all)
      return cached.subscriptions.slice(0, 30).map((ch: A) => {
        const slug = (ch.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (!slug) return null;
        return {
          path: `entities/${slug}.md`,
          entityId: `youtube:channel:${slug}`,
          title: ch.title,
          content: `# ${ch.title}\n\nA YouTube channel you subscribe to.\n\n${ch.description || ""}\n\n## Details\n- **Channel**: ${ch.title}\n- **Source**: YouTube subscription`,
          summary: ch.description?.slice(0, 200) || `YouTube channel: ${ch.title}`,
          tags: ["youtube", "channel", "subscription"],
        };
      }).filter(Boolean) as DirectIngestPage[];
    },
  },
  // ── Steam Games ──
  {
    id: "steam",
    cacheFile: "steam-games.json",
    scannerToolName: "enso_context_scan_steam",
    scannerParams: {},
    ingestPriority: 55,
    formatForProfile: (cached: A) => {
      if (!cached?.games?.length) return null;
      const gameList = cached.games.slice(0, 15).map((g: A) => g.name).join(", ");
      return `## Steam Games (${cached.games.length} installed)\n${gameList}`;
    },
    formatForCortex: (cached: A) => {
      if (!cached?.games?.length) return null;
      const lines = [`# Steam Game Library (${cached.games.length} games)\n`];
      const byGenre = new Map<string, A[]>();
      const noGenre: A[] = [];
      for (const g of cached.games) {
        if (g.genres?.length) {
          for (const genre of g.genres) {
            const list = byGenre.get(genre) ?? [];
            list.push(g);
            byGenre.set(genre, list);
          }
        } else {
          noGenre.push(g);
        }
      }
      const sorted = [...byGenre.entries()].sort((a, b) => b[1].length - a[1].length);
      for (const [genre, games] of sorted.slice(0, 15)) {
        lines.push(`## ${genre} (${games.length})`);
        for (const g of games) lines.push(`- **${g.name}**${g.metacritic ? ` (Metacritic: ${g.metacritic})` : ""}${g.description ? `: ${g.description.slice(0, 100)}` : ""}`);
      }
      if (noGenre.length) {
        lines.push(`\n## Other Games (${noGenre.length})`);
        for (const g of noGenre) lines.push(`- ${g.name}`);
      }
      return { text: lines.join("\n"), topic: "Steam Game Library", label: "Steam library scan" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.games?.length) return [];
      return cached.games.filter((g: A) => g.name).map((g: A) => {
        const slug = g.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (!slug) return null;
        const lines = [`# ${g.name}\n`];
        if (g.description) lines.push(`${g.description}\n`);
        if (g.genres?.length) lines.push(`**Genres**: ${g.genres.join(", ")}`);
        if (g.metacritic) lines.push(`**Metacritic**: ${g.metacritic}`);
        if (g.developers?.length) lines.push(`**Developer**: ${g.developers.join(", ")}`);
        if (g.releaseDate) lines.push(`**Release**: ${g.releaseDate}`);
        const sizeGB = g.sizeOnDisk ? (g.sizeOnDisk / (1024 * 1024 * 1024)).toFixed(1) + " GB" : null;
        if (sizeGB) lines.push(`**Size**: ${sizeGB}`);
        if (g.lastPlayed) lines.push(`**Last Played**: ${new Date(g.lastPlayed).toISOString().slice(0, 10)}`);
        if (g.headerImage) lines.push(`\n![header](${g.headerImage})`);
        lines.push(`\n- **Steam**: [Store Page](https://store.steampowered.com/app/${g.appId})`);
        return {
          path: `entities/game-${slug}.md`,
          entityId: `steam:game:${slug}`,
          title: g.name,
          content: lines.join("\n"),
          summary: g.description?.slice(0, 200) || `${g.name} — Steam game`,
          tags: ["game", "steam", ...(g.genres || []).map((genre: string) => genre.toLowerCase())],
        };
      }).filter(Boolean) as DirectIngestPage[];
    },
  },

  // ── Movies & TV ──
  {
    id: "moviesTv",
    cacheFile: "movies-tv.json",
    scannerToolName: "enso_context_scan_movies_tv",
    scannerParams: {},
    ingestPriority: 56,
    formatForProfile: (cached: A) => {
      if (!cached?.items?.length) return null;
      const movies = cached.items.filter((m: A) => m.category === "movies").length;
      const tv = cached.items.filter((m: A) => m.category === "tv").length;
      const docs = cached.items.filter((m: A) => m.category === "documentaries").length;
      const titles = cached.items.slice(0, 15).map((m: A) => `${m.title}${m.year ? ` (${m.year})` : ""}`).join(", ");
      return `## Movies & TV (${cached.items.length} total: ${movies} movies, ${tv} TV, ${docs} docs)\n${titles}`;
    },
    formatForCortex: (cached: A) => {
      if (!cached?.items?.length) return null;
      const lines = [`# Movie & TV Collection (${cached.items.length} items)\n`];
      const byCat = new Map<string, A[]>();
      for (const m of cached.items) {
        const list = byCat.get(m.category) ?? [];
        list.push(m);
        byCat.set(m.category, list);
      }
      for (const [cat, items] of byCat) {
        lines.push(`\n## ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${items.length})`);
        for (const m of items.slice(0, 20)) {
          let line = `- **${m.title}**${m.year ? ` (${m.year})` : ""}`;
          if (m.rating) line += ` ⭐ ${m.rating.toFixed(1)}`;
          if (m.genres?.length) line += ` — ${m.genres.join(", ")}`;
          lines.push(line);
        }
        if (items.length > 20) lines.push(`- ... and ${items.length - 20} more`);
      }
      return { text: lines.join("\n"), topic: "Movie & TV Collection", label: "Video collection scan" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.items?.length) return [];
      return cached.items.map((m: A) => {
        const prefix = m.category === "tv" ? "tv-" : "movie-";
        const slug = m.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (!slug) return null;
        const lines = [`# ${m.title}${m.year ? ` (${m.year})` : ""}\n`];
        if (m.tagline) lines.push(`*${m.tagline}*\n`);
        if (m.rating) lines.push(`⭐ ${m.rating.toFixed(1)}/10${m.voteCount ? ` (${m.voteCount.toLocaleString()} votes)` : ""}`);
        if (m.genres?.length) lines.push(`**Genres**: ${m.genres.join(", ")}`);
        if (m.runtime) lines.push(`**Runtime**: ${m.runtime} min`);
        if (m.directors?.length) lines.push(`**Director**: ${m.directors.join(", ")}`);
        if (m.cast?.length) lines.push(`**Cast**: ${m.cast.join(", ")}`);
        if (m.overview) lines.push(`\n${m.overview}`);
        if (m.posterPath) lines.push(`\n![poster](${m.posterPath})`);
        lines.push(`\n## Details`);
        if (m.imdbId) lines.push(`- **IMDB**: [${m.imdbId}](https://www.imdb.com/title/${m.imdbId})`);
        lines.push(`- **Category**: ${m.category}`);
        lines.push(`- **File**: \`${m.filePath}\``);
        return {
          path: `entities/${prefix}${slug}.md`,
          entityId: `movies_tv:${m.category === "tv" ? "tv-series" : "movie"}:${slug}`,
          title: m.title,
          content: lines.join("\n"),
          summary: m.overview?.slice(0, 200) || `${m.title} (${m.year || "?"}) — ${m.category}`,
          tags: [m.category === "tv" ? "tv-series" : "movie", "video", ...(m.genres || []).map((g: string) => g.toLowerCase())],
        };
      }).filter(Boolean) as DirectIngestPage[];
    },
  },

  // ── Photo Library ──
  {
    id: "photos",
    cacheFile: "photo-library.json",
    scannerToolName: "enso_context_scan_photos",
    scannerParams: {},
    ingestPriority: 58,
    formatForProfile: (cached: A) => {
      if (!cached?.albums?.length) return null;
      const topAlbums = cached.albums.slice(0, 10).map((a: A) => `${a.name} (${a.photoCount})`).join(", ");
      return `## Photo Library (${cached.totalPhotos || 0} photos in ${cached.albums.length} albums)\nTop albums: ${topAlbums}`;
    },
    formatForCortex: (cached: A) => {
      if (!cached?.albums?.length) return null;
      const lines = [`# Photo Library (${cached.totalPhotos || 0} photos, ${cached.albums.length} albums)\n`];
      if (cached.yearRange) lines.push(`Spanning ${cached.yearRange.from} to ${cached.yearRange.to}\n`);
      if (cached.cameras?.length) lines.push(`**Cameras**: ${cached.cameras.join(", ")}\n`);
      // Group by year (from parentPath)
      const byYear = new Map<string, A[]>();
      for (const a of cached.albums) {
        const year = a.dateRange?.from?.substring(0, 4) || a.parentPath || "Unknown";
        const list = byYear.get(year) ?? [];
        list.push(a);
        byYear.set(year, list);
      }
      const sortedYears = [...byYear.keys()].sort().reverse();
      for (const year of sortedYears.slice(0, 15)) {
        const albums = byYear.get(year)!;
        const totalPhotos = albums.reduce((s: number, a: A) => s + a.photoCount, 0);
        lines.push(`\n## ${year} (${albums.length} albums, ${totalPhotos} photos)`);
        for (const a of albums.slice(0, 10)) lines.push(`- **${a.name}**: ${a.photoCount} photos${a.cameras?.length ? ` (${a.cameras[0]})` : ""}`);
      }
      return { text: lines.join("\n"), topic: "Photo Library", label: "Photo library scan" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.albums?.length) return [];
      return cached.albums.filter((a: A) => a.photoCount >= 3).map((a: A) => {
        const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (!slug) return null;
        const lines = [`# Photo Album: ${a.name}\n`];
        lines.push(`**${a.photoCount} photos**`);
        if (a.dateRange?.from) lines.push(`**Date Range**: ${a.dateRange.from} to ${a.dateRange.to || "present"}`);
        if (a.cameras?.length) lines.push(`**Camera**: ${a.cameras.join(", ")}`);
        lines.push(`**Path**: \`${a.path}\``);
        return {
          path: `entities/photo-album-${slug}.md`,
          entityId: `photos:album:${slug}`,
          title: `Photo Album: ${a.name}`,
          content: lines.join("\n"),
          summary: `${a.name} — ${a.photoCount} photos${a.dateRange?.from ? ` from ${a.dateRange.from}` : ""}`,
          tags: ["photo", "album", ...(a.cameras || []).map((c: string) => c.toLowerCase())],
        };
      }).filter(Boolean) as DirectIngestPage[];
    },
  },

  // ── Twitter/X Following ──
  {
    id: "twitterFollowing",
    cacheFile: "twitter-following.json",
    scannerToolName: "enso_context_scan_twitter",
    scannerParams: {},
    ingestPriority: 57,
    formatForProfile: (cached: A) => {
      if (!cached?.accounts?.length) return null;
      const names = cached.accounts.slice(0, 15).map((a: A) => `@${a.handle}`).join(", ");
      return `## Twitter/X Following (${cached.accounts.length} accounts)\n${names}`;
    },
    formatForCortex: (cached: A) => {
      if (!cached?.accounts?.length) return null;
      const lines = [`# Twitter/X Following (${cached.accounts.length} accounts)\n`];
      for (const a of cached.accounts) {
        let line = `- **${a.displayName}** (@${a.handle})`;
        if (a.verified) line += " ✓";
        if (a.bio) line += `: ${a.bio.slice(0, 120)}`;
        lines.push(line);
      }
      return { text: lines.join("\n"), topic: "Twitter/X Following", label: "Twitter following list" };
    },
    getDirectIngestPages: (cached: A) => {
      if (!cached?.accounts?.length) return [];
      return cached.accounts.map((a: A) => {
        const slug = a.handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (!slug) return null;
        const lines = [`# @${a.handle}\n`];
        lines.push(`**${a.displayName}**${a.verified ? " ✓ Verified" : ""}\n`);
        if (a.bio) lines.push(`${a.bio}\n`);
        lines.push(`- **Handle**: @${a.handle}`);
        lines.push(`- **Profile**: [x.com/${a.handle}](https://x.com/${a.handle})`);
        lines.push(`- **Source**: Twitter following list`);
        return {
          path: `entities/twitter-${slug}.md`,
          entityId: `twitter:twitter-account:${slug}`,
          title: `@${a.handle} (${a.displayName})`,
          content: lines.join("\n"),
          summary: `${a.displayName} (@${a.handle})${a.bio ? ` — ${a.bio.slice(0, 150)}` : ""}`,
          tags: ["twitter", "social-media", "following"],
        };
      }).filter(Boolean) as DirectIngestPage[];
    },
  },

  // ── QQ Music ──
  {
    id: "qqMusic",
    cacheFile: "qq-music.json",
    scannerToolName: "enso_context_scan_qq_music",
    scannerParams: {},
    ingestPriority: 59,
    formatForProfile: (cached: A) => {
      const parts: string[] = [];
      if (cached?.favorites?.length) parts.push(`Favorites: ${cached.favorites.slice(0, 10).map((f: A) => `${f.title} by ${f.artist}`).join(", ")}`);
      if (cached?.localFiles?.length) parts.push(`Local files: ${cached.localFiles.length} tracks`);
      if (cached?.playlists?.length) parts.push(`Playlists: ${cached.playlists.map((p: A) => p.name).join(", ")}`);
      return parts.length ? `## Music (QQ Music)\n${parts.join("\n")}` : null;
    },
    formatForCortex: (cached: A) => {
      const total = (cached?.favorites?.length || 0) + (cached?.localFiles?.length || 0);
      if (total === 0) return null;
      const lines = [`# Music Library (${total} tracks)\n`];
      if (cached.playlists?.length) {
        lines.push("## Playlists");
        for (const p of cached.playlists) lines.push(`- **${p.name}** (${p.trackCount || p.tracks?.length || 0} tracks)`);
      }
      if (cached.favorites?.length) {
        lines.push("\n## Favorite Songs");
        for (const f of cached.favorites.slice(0, 30)) lines.push(`- **${f.title}** by ${f.artist}`);
      }
      // Aggregate artists
      const artistMap = new Map<string, number>();
      for (const t of [...(cached.favorites || []), ...(cached.localFiles || [])]) {
        if (t.artist && t.artist !== "Unknown") artistMap.set(t.artist, (artistMap.get(t.artist) || 0) + 1);
      }
      const topArtists = [...artistMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      if (topArtists.length) {
        lines.push("\n## Top Artists");
        for (const [artist, count] of topArtists) lines.push(`- **${artist}** (${count} tracks)`);
      }
      return { text: lines.join("\n"), topic: "Music Library", label: "QQ Music scan" };
    },
    getDirectIngestPages: (cached: A) => {
      // Create per-artist pages (aggregated from all sources)
      const artistMap = new Map<string, { tracks: string[]; albums: Set<string> }>();
      for (const t of [...(cached?.favorites || []), ...(cached?.localFiles || [])]) {
        if (t.artist && t.artist !== "Unknown") {
          if (!artistMap.has(t.artist)) artistMap.set(t.artist, { tracks: [], albums: new Set() });
          const entry = artistMap.get(t.artist)!;
          if (entry.tracks.length < 20) entry.tracks.push(t.title);
          if (t.album) entry.albums.add(t.album);
        }
      }
      const pages: DirectIngestPage[] = [];
      for (const [artist, data] of artistMap) {
        if (data.tracks.length < 2) continue; // skip one-off artists
        const slug = artist.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (!slug) continue;
        const lines = [`# ${artist}\n`, `A music artist in your library with ${data.tracks.length} tracks.\n`];
        lines.push("## Tracks");
        for (const t of data.tracks) lines.push(`- ${t}`);
        if (data.albums.size > 0) {
          lines.push("\n## Albums");
          for (const a of data.albums) lines.push(`- ${a}`);
        }
        pages.push({
          path: `entities/artist-${slug}.md`,
          entityId: `qq_music:artist:${slug}`,
          title: artist,
          content: lines.join("\n"),
          summary: `${artist} — music artist with ${data.tracks.length} tracks in your library`,
          tags: ["music", "artist", "qq-music"],
        });
      }
      return pages;
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
