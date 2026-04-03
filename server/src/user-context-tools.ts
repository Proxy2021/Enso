/**
 * User Context Discovery — Scanner Tools
 *
 * Consent-gated tools that scan the user's desktop environment to build
 * a rich profile for personalized assistance.
 *
 * Tools:
 *   enso_context_scan_browser_history  — Chrome/Edge history (SQLite)
 *   enso_context_scan_bookmarks        — Chrome/Edge bookmarks (JSON)
 *   enso_context_scan_email            — Email via Himalaya CLI
 *   enso_context_scan_files            — Documents, projects, recent files
 *   enso_context_scan_system           — Installed apps, running processes
 *   enso_context_get_profile           — Read aggregated profile
 *   enso_context_refresh               — Trigger full profile rebuild
 */

import type { EnsoAgentTool } from "./local-types.js";
import {
  existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync,
} from "fs";
import { join, basename, extname, resolve } from "path";
import { homedir, tmpdir, platform, hostname } from "os";
import { execSync } from "child_process";
import { logAction, logError } from "./action-log.js";
import type {
  ContextConsent, BrowserHistoryEntry, BookmarkEntry, EmailSummary,
  FileEntry, DetectedProject, SystemInfo, ScanLog, ContextStatus,
} from "./user-context-types.js";
import { DEFAULT_CONSENT } from "./user-context-types.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const ENSO_HOME = join(homedir(), ".enso");
const CONTEXT_DIR = join(ENSO_HOME, "data", "user-context");
const CACHE_DIR = join(CONTEXT_DIR, "cache");
const CONSENT_PATH = join(CONTEXT_DIR, "consent.json");
const PROFILE_PATH = join(CONTEXT_DIR, "profile.json");
const SCAN_LOG_PATH = join(CONTEXT_DIR, "scan-log.json");

function ensureDirs(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// ── Result helpers (match browser-tools.ts pattern) ─────────────────────────

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

// ── Consent ──────────────────────────────────────────────────────────────────

export function readConsent(): ContextConsent {
  try {
    if (existsSync(CONSENT_PATH)) {
      return { ...DEFAULT_CONSENT, ...JSON.parse(readFileSync(CONSENT_PATH, "utf-8")) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONSENT };
}

export function writeConsent(consent: ContextConsent): void {
  ensureDirs();
  writeFileSync(CONSENT_PATH, JSON.stringify(consent, null, 2));
}

function checkConsent(source: keyof ContextConsent): AgentToolResult | null {
  const consent = readConsent();
  if (!consent[source]) {
    return errorResult(
      `${source} scanning is not enabled. The user can enable it in Settings > Data Sources.`
    );
  }
  return null;
}

// ── Scan Log ─────────────────────────────────────────────────────────────────

function readScanLog(): ScanLog {
  try {
    if (existsSync(SCAN_LOG_PATH)) return JSON.parse(readFileSync(SCAN_LOG_PATH, "utf-8"));
  } catch { /* ignore */ }
  return {};
}

function writeScanLog(log: ScanLog): void {
  ensureDirs();
  writeFileSync(SCAN_LOG_PATH, JSON.stringify(log, null, 2));
}

function updateScanLog(source: keyof ScanLog): void {
  const log = readScanLog();
  log[source] = Date.now();
  writeScanLog(log);
}

// ── Browser History (SQLite) ─────────────────────────────────────────────────

function getBrowserHistoryPaths(): Array<{ browser: "chrome" | "edge"; path: string }> {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const paths: Array<{ browser: "chrome" | "edge"; path: string }> = [];

  const chromePath = join(localAppData, "Google", "Chrome", "User Data", "Default", "History");
  if (existsSync(chromePath)) paths.push({ browser: "chrome", path: chromePath });

  const edgePath = join(localAppData, "Microsoft", "Edge", "User Data", "Default", "History");
  if (existsSync(edgePath)) paths.push({ browser: "edge", path: edgePath });

  return paths;
}

function scanBrowserHistory(
  browsers: ("chrome" | "edge" | "all")[],
  limit: number,
  sinceDays: number,
): BrowserHistoryEntry[] {
  // Dynamic import of better-sqlite3 (it's an optional native module)
  let Database: typeof import("better-sqlite3").default;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Database = require("better-sqlite3");
  } catch (err) {
    logError("user-context", "better-sqlite3 not available", err);
    return [];
  }

  const wantAll = browsers.includes("all");
  const historyPaths = getBrowserHistoryPaths();
  const results: BrowserHistoryEntry[] = [];

  // Chrome timestamps: microseconds since 1601-01-01
  const CHROME_EPOCH_OFFSET = 11644473600000000n;
  const sinceTimestamp = BigInt(Date.now() - sinceDays * 86400000) * 1000n + CHROME_EPOCH_OFFSET;

  for (const { browser, path: histPath } of historyPaths) {
    if (!wantAll && !browsers.includes(browser)) continue;

    // Chrome locks its History file — copy to temp before reading
    const tmpPath = join(tmpdir(), `enso-history-${browser}-${Date.now()}.db`);
    try {
      copyFileSync(histPath, tmpPath);
      const db = new Database(tmpPath, { readonly: true, fileMustExist: true });
      try {
        const rows = db.prepare(`
          SELECT url, title, visit_count, last_visit_time
          FROM urls
          WHERE last_visit_time > ?
          ORDER BY last_visit_time DESC
          LIMIT ?
        `).all(sinceTimestamp.toString(), limit) as Array<{
          url: string; title: string; visit_count: number; last_visit_time: string;
        }>;

        for (const row of rows) {
          const chromeTs = BigInt(row.last_visit_time);
          const epochMs = Number((chromeTs - CHROME_EPOCH_OFFSET) / 1000n);
          results.push({
            url: row.url,
            title: row.title || "",
            visitCount: row.visit_count,
            lastVisit: epochMs,
            browser,
          });
        }
      } finally {
        db.close();
      }
    } catch (err) {
      logError("user-context", `Failed to read ${browser} history`, err);
    } finally {
      // Clean up temp file
      try { require("fs").unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  return results;
}

/** Extract search queries from browser history URLs */
function extractSearchQueries(entries: BrowserHistoryEntry[]): Array<{ query: string; timestamp: number }> {
  const queries: Array<{ query: string; timestamp: number }> = [];
  const patterns = [
    /google\.com\/search\?.*?q=([^&]+)/,
    /bing\.com\/search\?.*?q=([^&]+)/,
    /duckduckgo\.com\/\?.*?q=([^&]+)/,
    /search\.yahoo\.com\/search.*?p=([^&]+)/,
  ];

  for (const entry of entries) {
    for (const pattern of patterns) {
      const match = entry.url.match(pattern);
      if (match?.[1]) {
        queries.push({
          query: decodeURIComponent(match[1].replace(/\+/g, " ")),
          timestamp: entry.lastVisit,
        });
        break;
      }
    }
  }
  return queries;
}

/** Aggregate top domains from history */
function aggregateDomains(entries: BrowserHistoryEntry[]): Array<{ domain: string; visits: number }> {
  const domainMap = new Map<string, number>();
  for (const e of entries) {
    try {
      const domain = new URL(e.url).hostname.replace(/^www\./, "");
      domainMap.set(domain, (domainMap.get(domain) || 0) + e.visitCount);
    } catch { /* skip malformed URLs */ }
  }
  return [...domainMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([domain, visits]) => ({ domain, visits }));
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

interface ChromeBookmarkNode {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

function parseBookmarkTree(
  node: ChromeBookmarkNode, folder: string, browser: "chrome" | "edge", out: BookmarkEntry[],
): void {
  if (node.type === "url" && node.url && node.name) {
    out.push({ title: node.name, url: node.url, folder, browser });
  }
  if (node.children) {
    const folderName = node.name || folder;
    for (const child of node.children) parseBookmarkTree(child, folderName, browser, out);
  }
}

function scanBookmarks(): BookmarkEntry[] {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const bookmarks: BookmarkEntry[] = [];

  for (const browser of ["chrome", "edge"] as const) {
    const path = browser === "chrome"
      ? join(localAppData, "Google", "Chrome", "User Data", "Default", "Bookmarks")
      : join(localAppData, "Microsoft", "Edge", "User Data", "Default", "Bookmarks");

    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as { roots?: Record<string, ChromeBookmarkNode> };
      if (raw.roots) {
        for (const root of Object.values(raw.roots)) {
          parseBookmarkTree(root, "", browser, bookmarks);
        }
      }
    } catch { /* ignore */ }
  }

  return bookmarks;
}

// ── Email ────────────────────────────────────────────────────────────────────

/**
 * Scan email using the best available method:
 * 1. Outlook COM automation (Windows only, uses locally logged-in Outlook — richest data)
 * 2. Himalaya CLI (cross-platform IMAP client)
 */
function scanEmail(folder: string, limit: number): EmailSummary[] {
  // Try Outlook COM first (Windows with Outlook desktop installed and logged in)
  if (platform() === "win32") {
    const outlookResults = scanEmailViaOutlookCOM(folder, limit);
    if (outlookResults.length > 0) return outlookResults;
  }

  // Fallback: Himalaya CLI
  return scanEmailViaHimalaya(folder, limit);
}

/** Read email via PowerShell Outlook COM automation — works when Outlook is installed & configured */
function scanEmailViaOutlookCOM(folder: string, limit: number): EmailSummary[] {
  const results: EmailSummary[] = [];

  // Map folder names to Outlook folder constants
  const folderMap: Record<string, number> = {
    "INBOX": 6, "inbox": 6,
    "SENT": 5, "sent": 5, "Sent Items": 5,
    "DRAFTS": 16, "drafts": 16,
    "TRASH": 3, "trash": 3, "Deleted Items": 3,
    "JUNK": 23, "junk": 23, "Junk Email": 23,
  };
  const folderConst = folderMap[folder] ?? 6; // Default to Inbox

  try {
    // PowerShell script to read Outlook via COM
    // Write PS1 script to temp file to avoid quoting issues and support Unicode
    const psPath = join(tmpdir(), `enso-outlook-scan-${Date.now()}.ps1`);
    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
try {
  $outlook = New-Object -ComObject Outlook.Application
  $ns = $outlook.GetNamespace('MAPI')
  $folder = $ns.GetDefaultFolder(${folderConst})
  $items = $folder.Items
  $items.Sort('[ReceivedTime]', $true)
  $count = [Math]::Min(${limit}, $items.Count)
  $results = @()
  for ($i = 1; $i -le $count; $i++) {
    $mail = $items.Item($i)
    $results += @{
      from = $mail.SenderName
      senderEmail = $mail.SenderEmailAddress
      subject = $mail.Subject
      date = $mail.ReceivedTime.ToString('o')
      folder = '${folder}'
    }
  }
  $results | ConvertTo-Json -Depth 3 -Compress
} catch {
  Write-Error $_.Exception.Message
  exit 1
}`;
    writeFileSync(psPath, psScript, "utf-8");

    const raw = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${psPath}"`,
      { timeout: 30000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );

    // Clean up temp script
    try { require("fs").unlinkSync(psPath); } catch { /* ignore */ }

    const parsed = JSON.parse(raw.trim());
    const envelopes = Array.isArray(parsed) ? parsed : [parsed];

    for (const env of envelopes) {
      const fromStr = env.senderEmail && env.from !== env.senderEmail
        ? `${env.from} <${env.senderEmail}>`
        : (env.from || "unknown");
      results.push({
        from: fromStr,
        subject: (env.subject || "(no subject)").replace(/^\[External Mail\]/, "").trim(),
        date: env.date ? new Date(env.date).getTime() : Date.now(),
        folder: env.folder || folder,
      });
    }

    logAction({
      ts: Date.now(), type: "action", category: "user-context",
      message: `Email scanned via Outlook COM: ${results.length} emails from ${folder}`,
    });
  } catch (err) {
    // Outlook COM not available — will fall back to himalaya
    logAction({
      ts: Date.now(), type: "action", category: "user-context",
      message: `Outlook COM not available, falling back to himalaya`,
    });
  }
  return results;
}

/** Read email via Himalaya CLI (IMAP) */
function scanEmailViaHimalaya(folder: string, limit: number): EmailSummary[] {
  const results: EmailSummary[] = [];
  try {
    execSync("himalaya --version", { timeout: 5000, stdio: "pipe" });

    const raw = execSync(
      `himalaya envelope list -f "${folder}" -s ${limit} -o json`,
      { timeout: 30000, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8" },
    );
    const envelopes = JSON.parse(raw) as Array<{
      from?: { name?: string; addr?: string };
      subject?: string;
      date?: string;
    }>;

    for (const env of envelopes) {
      const fromStr = env.from?.name
        ? `${env.from.name} <${env.from.addr || ""}>`
        : (env.from?.addr || "unknown");
      results.push({
        from: fromStr,
        subject: env.subject || "(no subject)",
        date: env.date ? new Date(env.date).getTime() : Date.now(),
        folder,
      });
    }
  } catch {
    logAction({
      ts: Date.now(), type: "action", category: "user-context",
      message: `Email scan skipped: neither Outlook COM nor himalaya available`,
    });
  }
  return results;
}

// ── File Scanning ────────────────────────────────────────────────────────────

const PROJECT_MARKERS: Record<string, string> = {
  "package.json": "node",
  "Cargo.toml": "rust",
  "requirements.txt": "python",
  "setup.py": "python",
  "pyproject.toml": "python",
  "go.mod": "go",
  "pom.xml": "java",
  "build.gradle": "java",
  "*.sln": "dotnet",
  "*.csproj": "dotnet",
  "Gemfile": "ruby",
  "composer.json": "php",
};

function detectProjectType(dirPath: string): DetectedProject | null {
  try {
    const entries = readdirSync(dirPath);
    for (const [marker, type] of Object.entries(PROJECT_MARKERS)) {
      if (marker.startsWith("*")) {
        const ext = marker.slice(1);
        if (entries.some(e => e.endsWith(ext))) {
          return buildProject(dirPath, type, entries);
        }
      } else if (entries.includes(marker)) {
        return buildProject(dirPath, type, entries);
      }
    }
  } catch { /* permission denied, etc. */ }
  return null;
}

function buildProject(dirPath: string, type: string, entries: string[]): DetectedProject {
  const technologies: string[] = [type];
  // Detect additional tech from file presence
  if (entries.includes("tsconfig.json")) technologies.push("typescript");
  if (entries.includes("Dockerfile") || entries.includes("docker-compose.yml")) technologies.push("docker");
  if (entries.includes(".github")) technologies.push("github-actions");
  if (entries.includes("tailwind.config.js") || entries.includes("tailwind.config.ts")) technologies.push("tailwind");
  if (entries.includes("vite.config.ts") || entries.includes("vite.config.js")) technologies.push("vite");
  if (entries.includes("next.config.js") || entries.includes("next.config.mjs")) technologies.push("nextjs");

  let lastModified = 0;
  try {
    const stat = statSync(dirPath);
    lastModified = stat.mtimeMs;
  } catch { /* ignore */ }

  return {
    name: basename(dirPath),
    path: dirPath,
    type,
    technologies,
    lastModified,
  };
}

function scanFiles(
  directories: string[],
  maxDepth: number,
  extensions?: string[],
): { recentFiles: FileEntry[]; projects: DetectedProject[] } {
  const recentFiles: FileEntry[] = [];
  const projects: DetectedProject[] = [];
  const seen = new Set<string>();

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth || seen.has(dir)) return;
    seen.add(dir);

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      // Check for project markers at this level
      const proj = detectProjectType(dir);
      if (proj) projects.push(proj);

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;

        if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (extensions && !extensions.includes(ext)) continue;

          try {
            const stat = statSync(fullPath);
            recentFiles.push({
              path: fullPath,
              name: entry.name,
              ext,
              size: stat.size,
              modified: stat.mtimeMs,
              isDirectory: false,
            });
          } catch { /* skip */ }
        } else if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      }
    } catch { /* permission denied */ }
  }

  for (const dir of directories) {
    if (existsSync(dir)) walk(resolve(dir), 0);
  }

  // Sort by most recently modified, take top 100
  recentFiles.sort((a, b) => b.modified - a.modified);
  return { recentFiles: recentFiles.slice(0, 100), projects };
}

function getDefaultScanDirs(): string[] {
  const home = homedir();
  const dirs: string[] = [];
  const candidates = [
    join(home, "Documents"),
    join(home, "Desktop"),
    join(home, "Downloads"),
    // Common code directories
    join(home, "Projects"),
    join(home, "Code"),
    join(home, "Github"),
    // Check non-C drives for code directories (common on Windows multi-drive setups)
    ..."DEFGH".split("").map(letter => `${letter}:/Github`),
  ];
  for (const d of candidates) {
    if (existsSync(d)) dirs.push(d);
  }
  return dirs;
}

// ── System Info ──────────────────────────────────────────────────────────────

function scanSystem(include: string[]): SystemInfo {
  const info: SystemInfo = {
    installedApps: [],
    runningProcesses: [],
    platform: platform(),
    hostname: hostname(),
  };

  if (include.includes("apps") && platform() === "win32") {
    try {
      // Scan Program Files directories
      const dirs = [
        process.env.PROGRAMFILES || "C:\\Program Files",
        process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
      ];
      for (const dir of dirs) {
        if (existsSync(dir)) {
          const apps = readdirSync(dir).filter(n => !n.startsWith("."));
          info.installedApps.push(...apps);
        }
      }
      // Deduplicate
      info.installedApps = [...new Set(info.installedApps)].sort();
    } catch { /* ignore */ }
  }

  if (include.includes("processes") && platform() === "win32") {
    try {
      const raw = execSync("tasklist /fo csv /nh", { timeout: 10000, encoding: "utf-8", stdio: "pipe" });
      const names = new Set<string>();
      for (const line of raw.split("\n")) {
        const match = line.match(/^"([^"]+)"/);
        if (match?.[1]) names.add(match[1]);
      }
      info.runningProcesses = [...names].sort();
    } catch { /* ignore */ }
  }

  return info;
}

// ── Tool Factory ─────────────────────────────────────────────────────────────

export function createUserContextTools(): EnsoAgentTool[] {
  return [
    // ── Browser History ──
    {
      name: "enso_context_scan_browser_history",
      label: "Scan Browser History",
      description: "Scan Chrome/Edge browsing history to understand user interests, frequent sites, and search queries. Requires user consent.",
      parameters: {
        type: "object",
        properties: {
          browser: {
            type: "string",
            enum: ["chrome", "edge", "all"],
            description: "Which browser to scan (default: all)",
          },
          limit: {
            type: "number",
            description: "Max entries to return (default: 500)",
          },
          sinceDays: {
            type: "number",
            description: "Only include history from the last N days (default: 30)",
          },
        },
        additionalProperties: false,
      },
      async execute(_callId, params) {
        const blocked = checkConsent("browserHistory");
        if (blocked) return blocked;

        ensureDirs();
        const browser = (params.browser as string) || "all";
        const limit = (params.limit as number) || 500;
        const sinceDays = (params.sinceDays as number) || 30;

        const entries = scanBrowserHistory(
          [browser as "chrome" | "edge" | "all"], limit, sinceDays,
        );
        const searchQueries = extractSearchQueries(entries);
        const topDomains = aggregateDomains(entries);

        const result = {
          tool: "enso_context_scan_browser_history",
          totalEntries: entries.length,
          topDomains: topDomains.slice(0, 30),
          recentSearches: searchQueries.slice(0, 30),
          recentPages: entries.slice(0, 20).map(e => ({
            title: e.title, domain: new URL(e.url).hostname, visits: e.visitCount,
          })),
        };

        // Cache reduced result
        writeFileSync(join(CACHE_DIR, "browser-history.json"), JSON.stringify(result, null, 2));
        updateScanLog("browserHistory");
        logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Browser history scanned: ${entries.length} entries, ${topDomains.length} domains` });

        return jsonResult(result);
      },
    },

    // ── Bookmarks ──
    {
      name: "enso_context_scan_bookmarks",
      label: "Scan Bookmarks",
      description: "Scan Chrome/Edge bookmarks to understand user interests and saved resources. Requires user consent.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async execute() {
        const blocked = checkConsent("bookmarks");
        if (blocked) return blocked;

        ensureDirs();
        const bookmarks = scanBookmarks();

        // Group by folder
        const byFolder = new Map<string, BookmarkEntry[]>();
        for (const b of bookmarks) {
          const folder = b.folder || "Unsorted";
          if (!byFolder.has(folder)) byFolder.set(folder, []);
          byFolder.get(folder)!.push(b);
        }

        const result = {
          tool: "enso_context_scan_bookmarks",
          totalBookmarks: bookmarks.length,
          folders: [...byFolder.entries()].map(([folder, items]) => ({
            folder,
            count: items.length,
            bookmarks: items.map(b => ({ title: b.title, url: b.url, browser: b.browser })),
          })),
        };

        writeFileSync(join(CACHE_DIR, "bookmarks.json"), JSON.stringify(result, null, 2));
        updateScanLog("bookmarks");
        logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Bookmarks scanned: ${bookmarks.length} bookmarks in ${byFolder.size} folders` });

        return jsonResult(result);
      },
    },

    // ── Email ──
    {
      name: "enso_context_scan_email",
      label: "Scan Email",
      description: "Scan email subjects and senders to understand communication patterns. Uses Himalaya CLI. Requires user consent.",
      parameters: {
        type: "object",
        properties: {
          folder: {
            type: "string",
            description: "Email folder to scan (default: INBOX)",
          },
          limit: {
            type: "number",
            description: "Max emails to scan (default: 50)",
          },
        },
        additionalProperties: false,
      },
      async execute(_callId, params) {
        const blocked = checkConsent("email");
        if (blocked) return blocked;

        ensureDirs();
        const folder = (params.folder as string) || "INBOX";
        const limit = (params.limit as number) || 50;

        const emails = scanEmail(folder, limit);

        // Aggregate senders
        const senderMap = new Map<string, number>();
        for (const e of emails) {
          senderMap.set(e.from, (senderMap.get(e.from) || 0) + 1);
        }
        const topSenders = [...senderMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([from, count]) => ({ from, count }));

        const result = {
          tool: "enso_context_scan_email",
          totalEmails: emails.length,
          folder,
          topSenders,
          recentSubjects: emails.slice(0, 20).map(e => ({
            from: e.from, subject: e.subject, date: new Date(e.date).toISOString(),
          })),
        };

        writeFileSync(join(CACHE_DIR, "email-summary.json"), JSON.stringify(result, null, 2));
        updateScanLog("email");
        logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Email scanned: ${emails.length} emails, ${topSenders.length} senders` });

        return jsonResult(result);
      },
    },

    // ── Files ──
    {
      name: "enso_context_scan_files",
      label: "Scan Files & Projects",
      description: "Scan Documents, Desktop, Downloads, and code directories to detect projects and recent activity. Requires user consent.",
      parameters: {
        type: "object",
        properties: {
          directories: {
            type: "array",
            items: { type: "string" },
            description: "Directories to scan (default: Documents, Desktop, Downloads, common code dirs)",
          },
          maxDepth: {
            type: "number",
            description: "Max directory depth (default: 3)",
          },
        },
        additionalProperties: false,
      },
      async execute(_callId, params) {
        const blocked = checkConsent("files");
        if (blocked) return blocked;

        ensureDirs();
        const directories = (params.directories as string[]) || getDefaultScanDirs();
        const maxDepth = (params.maxDepth as number) || 3;

        const { recentFiles, projects } = scanFiles(directories, maxDepth);

        // Aggregate file types
        const extMap = new Map<string, number>();
        for (const f of recentFiles) {
          if (f.ext) extMap.set(f.ext, (extMap.get(f.ext) || 0) + 1);
        }
        const topExtensions = [...extMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([ext, count]) => ({ ext, count }));

        const result = {
          tool: "enso_context_scan_files",
          directoriesScanned: directories,
          totalRecentFiles: recentFiles.length,
          projects: projects.map(p => ({
            name: p.name, path: p.path, type: p.type, technologies: p.technologies,
            lastModified: new Date(p.lastModified).toISOString(),
          })),
          topFileTypes: topExtensions,
          recentFiles: recentFiles.slice(0, 20).map(f => ({
            name: f.name, path: f.path, size: f.size,
            modified: new Date(f.modified).toISOString(),
          })),
        };

        writeFileSync(join(CACHE_DIR, "file-index.json"), JSON.stringify(result, null, 2));
        updateScanLog("files");
        logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Files scanned: ${recentFiles.length} files, ${projects.length} projects` });

        return jsonResult(result);
      },
    },

    // ── System ──
    {
      name: "enso_context_scan_system",
      label: "Scan System Info",
      description: "Scan installed applications and running processes to understand the user's toolchain. Requires user consent.",
      parameters: {
        type: "object",
        properties: {
          include: {
            type: "array",
            items: { type: "string", enum: ["apps", "processes"] },
            description: "What to scan (default: [\"apps\"])",
          },
        },
        additionalProperties: false,
      },
      async execute(_callId, params) {
        const blocked = checkConsent("system");
        if (blocked) return blocked;

        ensureDirs();
        const include = (params.include as string[]) || ["apps"];
        const info = scanSystem(include);

        const result = {
          tool: "enso_context_scan_system",
          platform: info.platform,
          hostname: info.hostname,
          installedApps: info.installedApps,
          runningProcesses: info.runningProcesses,
        };

        writeFileSync(join(CACHE_DIR, "system-info.json"), JSON.stringify(result, null, 2));
        updateScanLog("system");
        logAction({ ts: Date.now(), type: "action", category: "user-context", message: `System scanned: ${info.installedApps.length} apps, ${info.runningProcesses.length} processes` });

        return jsonResult(result);
      },
    },

    // ── Get Profile ──
    {
      name: "enso_context_get_profile",
      label: "Get User Context Profile",
      description: "Read the aggregated user context profile built from all scanned sources. Returns interests, projects, contacts, tools, and habits.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async execute() {
        if (!existsSync(PROFILE_PATH)) {
          return jsonResult({
            tool: "enso_context_get_profile",
            status: "no_profile",
            message: "No user context profile exists yet. Enable data sources in Settings and run a scan first.",
          });
        }
        try {
          const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
          return jsonResult({ tool: "enso_context_get_profile", ...profile });
        } catch (err) {
          return errorResult(`Failed to read profile: ${err}`);
        }
      },
    },

    // ── Refresh Profile ──
    {
      name: "enso_context_refresh",
      label: "Refresh User Context",
      description: "Trigger a full scan of all consented data sources and rebuild the user context profile.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async execute() {
        // Defer to the builder module (will be created in Phase 2)
        try {
          const { buildUserContextProfile } = await import("./user-context-builder.js");
          const consent = readConsent();
          const result = await buildUserContextProfile(consent);
          return jsonResult({
            tool: "enso_context_refresh",
            status: "success",
            ...result,
          });
        } catch (err) {
          return errorResult(`Profile rebuild failed: ${err}`);
        }
      },
    },
  ];
}

// ── Public accessors (for other modules) ─────────────────────────────────────

export function getContextDir(): string { return CONTEXT_DIR; }
export function getCachDir(): string { return CACHE_DIR; }
export function getProfilePath(): string { return PROFILE_PATH; }

export function getContextStatus(): ContextStatus {
  const consent = readConsent();
  const scanLog = readScanLog();
  let profileAge = Infinity;
  try {
    if (existsSync(PROFILE_PATH)) {
      const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
      profileAge = (Date.now() - (profile.lastUpdated || 0)) / 1000;
    }
  } catch { /* ignore */ }

  return {
    consent,
    scanLog,
    profileExists: existsSync(PROFILE_PATH),
    profileAge: Math.round(profileAge),
  };
}
