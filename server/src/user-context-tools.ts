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
  existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync, unlinkSync,
} from "fs";
import { join, basename, extname, resolve } from "path";
import { homedir, tmpdir, platform, hostname } from "os";
import { execSync } from "child_process";
import { createRequire } from "module";

const esmRequire = createRequire(import.meta.url);
import { logAction, logError } from "./action-log.js";
import type {
  ContextConsent, BrowserHistoryEntry, BookmarkEntry, EmailSummary,
  FileEntry, DetectedProject, SystemInfo, ScanLog, ContextStatus, KindleBook,
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
    Database = esmRequire("better-sqlite3");
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
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
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
    try { unlinkSync(psPath); } catch { /* ignore */ }

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

// ── Kindle Library (Puppeteer) ─────────────────────────────────────────────

const KINDLE_BROWSER_DIR = join(homedir(), ".enso", "data", "kindle-browser");
const KINDLE_LIBRARY_URL = "https://read.amazon.com/kindle-library";

async function scanKindleLibrary(): Promise<KindleBook[]> {
  mkdirSync(KINDLE_BROWSER_DIR, { recursive: true });

  // Overall timeout — 60 seconds max
  const SCAN_TIMEOUT = 60_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Kindle scan timed out after 60s. Amazon may require login — try /browser → read.amazon.com first.")), SCAN_TIMEOUT)
  );

  return Promise.race([timeoutPromise, (async () => {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      userDataDir: KINDLE_BROWSER_DIR,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,900",
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });

      // Use domcontentloaded instead of networkidle2 (Amazon pages do continuous network activity)
      await page.goto(KINDLE_LIBRARY_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
      // Give page extra time to render JS
      await new Promise(r => setTimeout(r, 3000));

      // Check if we're on a login/landing page (not the actual library)
      const url = page.url();
      if (url.includes("signin") || url.includes("ap/signin") || url.includes("auth") || url.includes("ap/mfa") || url.includes("/landing") || !url.includes("kindle-library")) {
        throw new Error(
          "Amazon login required. Please log in first:\n" +
          "1. In Enso, type: /browser\n" +
          "2. Navigate to https://read.amazon.com\n" +
          "3. Log in to your Amazon account\n" +
          "4. Then come back to Settings > Data Sources and scan again.\n\n" +
          "(Landed on: " + url + ")"
        );
      }

      // Wait for page JS to render
      await new Promise(r => setTimeout(r, 3000));

      // Extract first page from the embedded JSON script tag
      const firstPage = await page.evaluate(() => {
        const el = document.getElementById("itemViewResponse");
        if (!el) return { items: [], token: null };
        try {
          const data = JSON.parse(el.textContent || "");
          return { items: data.itemsList || [], token: data.paginationToken || null };
        } catch { return { items: [], token: null }; }
      });

      type KindleItem = { asin: string; title: string; authors?: string[]; productUrl?: string; webReaderUrl?: string; percentageRead?: number; resourceType?: string; originType?: string };
      const allItems: KindleItem[] = [...firstPage.items];
      let nextToken = firstPage.token;

      // Paginate through the API to get all books (50 per page, cap at 500 total)
      const MAX_BOOKS = 500;
      while (nextToken && allItems.length < MAX_BOOKS) {
        const pageData = await page.evaluate(async (token: string) => {
          try {
            const res = await fetch(`/kindle-library/search?query=&libraryType=BOOKS&paginationToken=${token}&sortType=recency&querySize=50`);
            const data = await res.json();
            return { items: data.itemsList || [], token: data.paginationToken || null };
          } catch { return { items: [], token: null }; }
        }, nextToken);
        if (pageData.items.length === 0) break;
        allItems.push(...pageData.items);
        nextToken = pageData.token;
      }

      // Map to KindleBook format — only actual books, not periodicals/docs
      const books: KindleBook[] = allItems
        .filter((item: KindleItem) => item.title && (!item.resourceType || item.resourceType === "EBOOK"))
        .map((item: KindleItem) => ({
          title: item.title,
          author: (Array.isArray(item.authors) ? item.authors.join(", ") : String(item.authors || "")).replace(/:$/g, "").replace(/,\s*$/, "").trim(),
          asin: item.asin || undefined,
          coverUrl: (item.productUrl as string) || undefined,
          readerUrl: (item.webReaderUrl as string) || undefined,
          percentageRead: typeof item.percentageRead === "number" ? item.percentageRead : undefined,
          originType: (item.originType as string) || undefined,
        }));

      // Log what page we ended up on for debugging
      logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Kindle scan: landed on ${url}, found ${books.length} books` });

      return books;
    } finally {
      await browser.close();
    }
  })()]);
}

// ── Kindle Metadata Enrichment (background) ────────────────────────────────

let _enrichmentRunning = false;

/**
 * Background-enrich Kindle books with metadata from Amazon product pages.
 * Only processes books without `enrichedAt`. Saves incrementally every 10 books.
 * Rate-limited: 2-second delay between requests to avoid Amazon blocking.
 */
export async function enrichKindleMetadata(): Promise<{ enriched: number; total: number; errors: number }> {
  if (_enrichmentRunning) return { enriched: 0, total: 0, errors: 0 };
  _enrichmentRunning = true;

  const cachePath = join(CACHE_DIR, "kindle-library.json");
  let cacheData: { source: string; totalBooks: number; books: KindleBook[]; scannedAt: string };
  try {
    cacheData = JSON.parse(readFileSync(cachePath, "utf-8"));
  } catch {
    _enrichmentRunning = false;
    return { enriched: 0, total: 0, errors: 0 };
  }

  const unenriched = cacheData.books.filter((b) => !b.enrichedAt && b.asin);
  if (unenriched.length === 0) {
    _enrichmentRunning = false;
    return { enriched: 0, total: cacheData.books.length, errors: 0 };
  }

  logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Kindle enrichment starting: ${unenriched.length} books to enrich` });

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    userDataDir: KINDLE_BROWSER_DIR,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  let enriched = 0;
  let errors = 0;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    for (const book of unenriched) {
      try {
        await page.goto(`https://www.amazon.com/dp/${book.asin}`, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await new Promise((r) => setTimeout(r, 1500));

        // Use string-based evaluate to avoid tsx __name injection issue
        const meta = await page.evaluate(`(() => {
          var get = function(sel) { return (document.querySelector(sel) || {}).textContent?.trim() || ""; };
          var detailBullets = Array.from(document.querySelectorAll("#detailBullets_feature_div li span span"))
            .map(function(s) { return s.textContent?.trim() || ""; });
          var findDetail = function(key) {
            for (var i = 0; i < detailBullets.length - 1; i++) {
              if (detailBullets[i].toLowerCase().includes(key)) return detailBullets[i + 1];
            }
            return "";
          };
          var ratingText = get("#acrPopover .a-size-base") || get("#acrPopover");
          var ratingMatch = ratingText.match(/([\\d.]+)\\s*out\\s*of/) || ratingText.match(/([\\d.]+)/);
          var reviewText = get("#acrCustomerReviewText") || get("#acrCustomerReviewLink");
          var reviewMatch = reviewText.match(/([\\d,]+)/);
          var pagesText = findDetail("print length") || findDetail("pages");
          var pagesMatch = pagesText.match(/([\\d,]+)/);
          var categories = detailBullets.filter(function(t) { return t.startsWith("#"); })
            .map(function(t) { return t.replace(/^#\\d+\\s+in\\s+/, "").trim(); });
          return {
            description: (get("#bookDescription_feature_div span") || get("#bookDesc_override_CSS span") || "").slice(0, 500),
            publisher: findDetail("publisher"),
            publicationDate: findDetail("publication date"),
            language: findDetail("language"),
            isbn: findDetail("isbn-13") || findDetail("isbn"),
            pageCount: pagesMatch ? parseInt(pagesMatch[1].replace(/,/g, ""), 10) : undefined,
            rating: ratingMatch ? parseFloat(ratingMatch[1]) : undefined,
            reviewCount: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ""), 10) : undefined,
            categories: categories.length > 0 ? categories : undefined,
          };
        })()`) as Record<string, unknown>;

        // Apply metadata to book
        if (meta.description) book.description = meta.description.slice(0, 500);
        if (meta.publisher) book.publisher = meta.publisher;
        if (meta.publicationDate) book.publicationDate = meta.publicationDate;
        if (meta.language) book.language = meta.language;
        if (meta.isbn) book.isbn = meta.isbn;
        if (meta.pageCount) book.pageCount = meta.pageCount;
        if (meta.rating) book.rating = meta.rating;
        if (meta.reviewCount) book.reviewCount = meta.reviewCount;
        if (meta.categories) book.categories = meta.categories;
        book.enrichedAt = Date.now();
        enriched++;

        // Save incrementally every 10 books
        if (enriched % 10 === 0) {
          writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
          logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Kindle enrichment progress: ${enriched}/${unenriched.length}` });
        }

        // Rate limit — 2 second delay between requests
        await new Promise((r) => setTimeout(r, 2000));
      } catch (bookErr) {
        errors++;
        logError("user-context", `Kindle enrich failed for "${book.title}"`, bookErr);
        book.enrichedAt = Date.now(); // Mark as attempted to avoid retrying failed ones
      }
    }
  } finally {
    await browser.close();
    // Final save
    writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    _enrichmentRunning = false;
    logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Kindle enrichment complete: ${enriched} enriched, ${errors} errors` });
  }

  return { enriched, total: cacheData.books.length, errors };
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

    // ── Kindle Library (Puppeteer scrape) ──────────────────────────────────────
    {
      name: "enso_context_scan_kindle_library",
      label: "Scan Kindle Library",
      description: "Scrape your Amazon Kindle library via read.amazon.com. Requires consent and an active Amazon login session.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
      async execute(_callId: string, _params: Record<string, unknown>): Promise<AgentToolResult> {
        const denied = checkConsent("kindleLibrary");
        if (denied) return denied;
        ensureDirs();

        try {
          const books = await scanKindleLibrary();

          // Merge with existing enriched data — preserve metadata for books we already enriched
          const cachePath = join(CACHE_DIR, "kindle-library.json");
          let existingBooks: KindleBook[] = [];
          try {
            const existing = JSON.parse(readFileSync(cachePath, "utf-8"));
            existingBooks = existing.books || [];
          } catch { /* no existing cache */ }
          const enrichedByAsin = new Map<string, KindleBook>();
          for (const b of existingBooks) {
            if (b.asin && b.enrichedAt) enrichedByAsin.set(b.asin, b);
          }
          // Merge: keep fresh scan data but overlay enriched metadata
          for (const book of books) {
            const prev = book.asin ? enrichedByAsin.get(book.asin) : undefined;
            if (prev) {
              book.description = prev.description;
              book.publisher = prev.publisher;
              book.publicationDate = prev.publicationDate;
              book.pageCount = prev.pageCount;
              book.rating = prev.rating;
              book.reviewCount = prev.reviewCount;
              book.categories = prev.categories;
              book.language = prev.language;
              book.isbn = prev.isbn;
              book.enrichedAt = prev.enrichedAt;
            }
          }

          const newBooks = books.filter((b) => b.asin && !enrichedByAsin.has(b.asin));
          const result = {
            source: "kindle-library",
            totalBooks: books.length,
            books,
            scannedAt: new Date().toISOString(),
          };
          writeFileSync(cachePath, JSON.stringify(result, null, 2));
          updateScanLog("kindleLibrary");
          logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Kindle library scanned: ${books.length} books (${newBooks.length} new)` });

          // Auto-trigger background enrichment for unenriched books
          const unenrichedCount = books.filter((b) => !b.enrichedAt && b.asin).length;
          if (unenrichedCount > 0) {
            logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Starting background Kindle enrichment for ${unenrichedCount} books...` });
            enrichKindleMetadata().catch((err) =>
              logError("user-context", "Background Kindle enrichment failed", err)
            );
          }

          return jsonResult({ ...result, enrichmentStarted: unenrichedCount > 0, unenrichedCount });
        } catch (err) {
          logError("user-context", "Kindle library scan failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    // ── YouTube Data (API fetch + cache) ──────────────────────────────────────
    {
      name: "enso_context_scan_youtube",
      label: "Scan YouTube Data",
      description: "Fetch YouTube subscriptions, liked videos, and feed via API. Caches for Cortex ingestion.",
      parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
      async execute(_callId: string, _params: Record<string, unknown>): Promise<AgentToolResult> {
        const denied = checkConsent("youtube" as keyof ContextConsent);
        if (denied) return denied;
        ensureDirs();

        try {
          const { createYouTubeTools } = await import("./youtube-tools.js");
          const ytTools = createYouTubeTools();

          let subscriptions: unknown[] = [];
          let likedVideos: unknown[] = [];
          let feed: unknown[] = [];

          // Fetch subscriptions (all pages)
          try {
            const subTool = ytTools.find(t => t.name === "enso_youtube_subscriptions");
            if (subTool) {
              const r = JSON.parse((await subTool.execute("yt-scan", { all: true })).content[0].text!);
              subscriptions = r.channels || [];
            }
          } catch { /* subscriptions not available */ }

          // Fetch liked videos
          try {
            const likedTool = ytTools.find(t => t.name === "enso_youtube_liked_videos");
            if (likedTool) {
              const r = JSON.parse((await likedTool.execute("yt-scan", { maxResults: 50 })).content[0].text!);
              likedVideos = r.videos || [];
            }
          } catch { /* liked not available */ }

          // Fetch feed
          try {
            const feedTool = ytTools.find(t => t.name === "enso_youtube_my_feed");
            if (feedTool) {
              const r = JSON.parse((await feedTool.execute("yt-scan", { maxResults: 50 })).content[0].text!);
              feed = r.videos || [];
            }
          } catch { /* feed not available */ }

          const cacheData = {
            source: "youtube", subscriptions, likedVideos, feed,
            totalSubscriptions: subscriptions.length,
            totalLikedVideos: likedVideos.length,
            totalFeedVideos: feed.length,
            scannedAt: new Date().toISOString(),
          };

          writeFileSync(join(CACHE_DIR, "youtube-data.json"), JSON.stringify(cacheData, null, 2));
          updateScanLog("youtube" as keyof ScanLog);
          logAction({ ts: Date.now(), type: "action", category: "user-context", message: `YouTube scanned: ${subscriptions.length} subs, ${likedVideos.length} liked, ${feed.length} feed` });
          return jsonResult(cacheData);
        } catch (err) {
          logError("user-context", "YouTube scan failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    // ── Steam Games (ACF manifest parse) ──────────────────────────────────────
    {
      name: "enso_context_scan_steam",
      label: "Scan Steam Library",
      description: "Scan local Steam installation for installed games by parsing ACF manifest files.",
      parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
      async execute(_callId: string, _params: Record<string, unknown>): Promise<AgentToolResult> {
        const denied = checkConsent("steam" as keyof ContextConsent);
        if (denied) return denied;
        ensureDirs();

        try {
          // Find Steam directory
          const steamPaths = [
            "F:\\Steam\\steamapps",
            "C:\\Program Files (x86)\\Steam\\steamapps",
            "C:\\Program Files\\Steam\\steamapps",
            join(homedir(), ".steam", "steam", "steamapps"),
            join(homedir(), "Library", "Application Support", "Steam", "steamapps"),
          ];
          let steamDir = steamPaths.find(p => existsSync(p));
          if (!steamDir) return errorResult("Steam installation not found. Checked common paths.");

          // Parse ACF manifests
          const acfFiles = readdirSync(steamDir).filter(f => f.startsWith("appmanifest_") && f.endsWith(".acf"));
          const games: Array<Record<string, unknown>> = [];

          for (const acfFile of acfFiles) {
            try {
              const content = readFileSync(join(steamDir, acfFile), "utf-8");
              const kv: Record<string, string> = {};
              for (const line of content.split("\n")) {
                const match = line.match(/^\s*"(\w+)"\s+"(.+)"\s*$/);
                if (match) kv[match[1]] = match[2];
              }
              if (kv.appid && kv.name) {
                games.push({
                  appId: kv.appid,
                  name: kv.name,
                  sizeOnDisk: kv.SizeOnDisk ? parseInt(kv.SizeOnDisk, 10) : 0,
                  lastPlayed: kv.LastPlayed ? parseInt(kv.LastPlayed, 10) * 1000 : 0,
                  installDir: kv.installdir || "",
                  buildId: kv.buildid || "",
                });
              }
            } catch { /* skip bad ACF */ }
          }

          // Merge with existing enriched data
          const cachePath = join(CACHE_DIR, "steam-games.json");
          let existing: Record<string, unknown>[] = [];
          try {
            const prev = JSON.parse(readFileSync(cachePath, "utf-8"));
            existing = prev.games || [];
          } catch { /* no cache */ }
          const enrichedById = new Map<string, Record<string, unknown>>();
          for (const g of existing) {
            if (g.appId && g.enrichedAt) enrichedById.set(g.appId as string, g);
          }
          for (const game of games) {
            const prev = enrichedById.get(game.appId as string);
            if (prev) {
              Object.assign(game, {
                description: prev.description, headerImage: prev.headerImage,
                genres: prev.genres, categories: prev.categories,
                metacritic: prev.metacritic, releaseDate: prev.releaseDate,
                developers: prev.developers, publishers: prev.publishers,
                screenshots: prev.screenshots, enrichedAt: prev.enrichedAt,
              });
            }
          }

          const result = { source: "steam-games", games, totalGames: games.length, steamDir, scannedAt: new Date().toISOString() };
          writeFileSync(cachePath, JSON.stringify(result, null, 2));
          updateScanLog("steam" as keyof ScanLog);
          logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Steam library scanned: ${games.length} games` });
          return jsonResult(result);
        } catch (err) {
          logError("user-context", "Steam scan failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    // ── Movies & TV (Filesystem scan) ─────────────────────────────────────────
    {
      name: "enso_context_scan_movies_tv",
      label: "Scan Movies & TV",
      description: "Scan local filesystem directories for video files and extract titles from filenames.",
      parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
      async execute(_callId: string, _params: Record<string, unknown>): Promise<AgentToolResult> {
        const denied = checkConsent("moviesTv" as keyof ContextConsent);
        if (denied) return denied;
        ensureDirs();

        try {
          const VIDEO_EXTS = new Set([".mkv", ".mp4", ".avi", ".mov", ".m4v", ".mts", ".mpeg", ".mpg", ".wmv"]);
          const scanDirs: Array<{ path: string; category: string }> = [
            { path: "F:\\迅雷下载\\Movies", category: "movies" },
            { path: "F:\\迅雷下载\\TV Series", category: "tv" },
            { path: "F:\\迅雷下载\\Movie Series", category: "movie_series" },
            { path: "F:\\迅雷下载\\Documentaries", category: "documentaries" },
            { path: "F:\\迅雷下载\\Concerts", category: "concerts" },
            { path: "F:\\迅雷下载\\Comedy Specials", category: "comedy" },
            { path: "H:\\moves", category: "movies" },
          ];

          // Also scan loose files in F:\迅雷下载\ root
          scanDirs.push({ path: "F:\\迅雷下载", category: "movies" });

          function extractTitle(filename: string): { title: string; year: string | null } {
            let name = filename.replace(/\.[^.]+$/, ""); // strip extension
            name = name.replace(/\[.*?\]/g, ""); // remove bracket tags
            name = name.replace(/\(.*?\)/g, ""); // remove paren tags
            // Find year
            const yearMatch = name.match(/[.\s_-]((?:19|20)\d{2})[.\s_-]/);
            const year = yearMatch ? yearMatch[1] : null;
            if (yearMatch) name = name.slice(0, name.indexOf(yearMatch[0]));
            // Strip quality/codec tags
            name = name.replace(/\b(1080p|2160p|4K|720p|480p|BD|BluRay|WEB[-.]?DL|WEBRip|HDTV|DVDRip|HDRip|BRRip|NF|AMZN|COMPLETE)\b/gi, "");
            name = name.replace(/\b(x264|x265|H\.?264|H\.?265|HEVC|AVC|10bit|8bit)\b/gi, "");
            name = name.replace(/\b(AAC|DDP|DDP5\.?1|AC3|FLAC|TrueHD|Atmos|DD2\.?0|DD5\.?1|DTS)\b/gi, "");
            name = name.replace(/\b(SPARKS|NukeHD|SONYHD|RARBG|YTS\.?MX|QuickIO|DreamHD|BDYS|YJYS|XLYS|HHWEB|MiniHD|TheMrG|LOST|B2B|NTb|TEPES|BONE|WAR|GalaxyTV|TGx|ION10|TRUMP|HANDJOB|rartv|CAMPEONES|i_c)\b/gi, "");
            name = name.replace(/[._]/g, " ");
            name = name.replace(/-+/g, " ");
            name = name.replace(/\s{2,}/g, " ").trim();
            return { title: name, year };
          }

          const items: Array<Record<string, unknown>> = [];
          const seenPaths = new Set<string>();

          for (const { path: dirPath, category } of scanDirs) {
            if (!existsSync(dirPath)) continue;

            function scanDir(dir: string, cat: string, depth: number): void {
              if (depth > 3) return;
              try {
                const entries = readdirSync(dir);
                for (const entry of entries) {
                  const fullPath = join(dir, entry);
                  try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) {
                      // For root scan dir, skip non-video subdirs
                      if (dir === "F:\\迅雷下载" && scanDirs.some(sd => sd.path === fullPath)) continue;
                      scanDir(fullPath, cat, depth + 1);
                    } else if (stat.isFile()) {
                      const ext = extname(entry).toLowerCase();
                      if (VIDEO_EXTS.has(ext) && !seenPaths.has(fullPath)) {
                        seenPaths.add(fullPath);
                        const { title, year } = extractTitle(entry);
                        items.push({
                          title, year, category: cat,
                          filePath: fullPath,
                          fileName: entry,
                          fileSize: stat.size,
                          ext,
                        });
                      }
                    }
                  } catch { /* skip */ }
                }
              } catch { /* skip */ }
            }

            if (dirPath === "F:\\迅雷下载") {
              // Only scan loose files in root, not subdirs (handled by specific entries)
              try {
                for (const entry of readdirSync(dirPath)) {
                  const fullPath = join(dirPath, entry);
                  try {
                    const stat = statSync(fullPath);
                    if (stat.isFile()) {
                      const ext = extname(entry).toLowerCase();
                      if (VIDEO_EXTS.has(ext) && !seenPaths.has(fullPath)) {
                        seenPaths.add(fullPath);
                        const { title, year } = extractTitle(entry);
                        items.push({ title, year, category, filePath: fullPath, fileName: entry, fileSize: stat.size, ext });
                      }
                    }
                  } catch { /* skip */ }
                }
              } catch { /* skip */ }
            } else {
              scanDir(dirPath, category, 0);
            }
          }

          // Merge with existing enriched data
          const cachePath = join(CACHE_DIR, "movies-tv.json");
          let existingItems: Array<Record<string, unknown>> = [];
          try {
            const prev = JSON.parse(readFileSync(cachePath, "utf-8"));
            existingItems = prev.items || [];
          } catch { /* no cache */ }
          const enrichedByPath = new Map<string, Record<string, unknown>>();
          for (const m of existingItems) {
            if (m.filePath && m.enrichedAt) enrichedByPath.set(m.filePath as string, m);
          }
          for (const item of items) {
            const prev = enrichedByPath.get(item.filePath as string);
            if (prev) {
              Object.assign(item, {
                tmdbId: prev.tmdbId, overview: prev.overview, rating: prev.rating,
                voteCount: prev.voteCount, posterPath: prev.posterPath, backdropPath: prev.backdropPath,
                genres: prev.genres, runtime: prev.runtime, imdbId: prev.imdbId,
                cast: prev.cast, directors: prev.directors, tagline: prev.tagline,
                releaseDate: prev.releaseDate, numberOfSeasons: prev.numberOfSeasons,
                enrichedAt: prev.enrichedAt, originalLanguage: prev.originalLanguage,
              });
            }
          }

          const result = { source: "movies-tv", items, totalItems: items.length, scannedAt: new Date().toISOString() };
          writeFileSync(cachePath, JSON.stringify(result, null, 2));
          updateScanLog("moviesTv" as keyof ScanLog);
          logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Movies/TV scanned: ${items.length} items` });
          return jsonResult(result);
        } catch (err) {
          logError("user-context", "Movies/TV scan failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    // ── Photo Library (Filesystem scan + EXIF) ────────────────────────────────
    {
      name: "enso_context_scan_photos",
      label: "Scan Photo Library",
      description: "Scan configured directories for photos and extract EXIF metadata, organized by album.",
      parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
      async execute(_callId: string, _params: Record<string, unknown>): Promise<AgentToolResult> {
        const denied = checkConsent("photos" as keyof ContextConsent);
        if (denied) return denied;
        ensureDirs();

        try {
          const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif", ".cr2", ".nef", ".arw", ".dng", ".raf", ".orf", ".rw2"]);
          const scanPaths = [
            "H:\\Picture Base",
            "H:\\5 Stars",
            "H:\\Photographers",
            join(homedir(), "Pictures"),
          ].filter(p => existsSync(p));

          interface AlbumData {
            name: string;
            path: string;
            parentPath: string;
            photoCount: number;
            dateRange: { from: string | null; to: string | null };
            cameras: string[];
            extensions: Record<string, number>;
          }

          const albumMap = new Map<string, AlbumData>();
          let totalPhotos = 0;
          const allCameras = new Set<string>();
          let minDate: string | null = null;
          let maxDate: string | null = null;

          for (const rootPath of scanPaths) {
            function walkAlbums(dir: string, depth: number): void {
              if (depth > 5) return;
              try {
                const entries = readdirSync(dir);
                let photoCount = 0;
                const extCounts: Record<string, number> = {};

                for (const entry of entries) {
                  const fullPath = join(dir, entry);
                  try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) {
                      walkAlbums(fullPath, depth + 1);
                    } else if (stat.isFile()) {
                      const ext = extname(entry).toLowerCase();
                      if (IMAGE_EXTS.has(ext)) {
                        photoCount++;
                        extCounts[ext] = (extCounts[ext] || 0) + 1;
                      }
                    }
                  } catch { /* skip */ }
                }

                if (photoCount > 0) {
                  const albumName = basename(dir);
                  const parentDir = basename(resolve(dir, ".."));
                  albumMap.set(dir, {
                    name: albumName,
                    path: dir,
                    parentPath: parentDir,
                    photoCount,
                    dateRange: { from: null, to: null },
                    cameras: [],
                    extensions: extCounts,
                  });
                  totalPhotos += photoCount;
                }
              } catch { /* skip */ }
            }

            walkAlbums(rootPath, 0);
          }

          // Sample EXIF from top albums (up to 3 photos per album, max 50 albums)
          const { parseImageMeta } = await import("./exif-parser.js");
          const sortedAlbums = [...albumMap.values()].sort((a, b) => b.photoCount - a.photoCount);

          for (const album of sortedAlbums.slice(0, 50)) {
            try {
              const files = readdirSync(album.path)
                .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
                .slice(0, 3);

              for (const file of files) {
                try {
                  const meta = parseImageMeta(join(album.path, file));
                  if (meta?.dateTaken) {
                    const d = meta.dateTaken.replace(/:/g, "-").slice(0, 10);
                    if (!album.dateRange.from || d < album.dateRange.from) album.dateRange.from = d;
                    if (!album.dateRange.to || d > album.dateRange.to) album.dateRange.to = d;
                    if (!minDate || d < minDate) minDate = d;
                    if (!maxDate || d > maxDate) maxDate = d;
                  }
                  if (meta?.cameraModel) {
                    const cam = `${meta.cameraMake || ""} ${meta.cameraModel}`.trim();
                    if (!album.cameras.includes(cam)) album.cameras.push(cam);
                    allCameras.add(cam);
                  }
                } catch { /* skip */ }
              }
            } catch { /* skip */ }
          }

          const albums = sortedAlbums.map(a => ({
            name: a.name,
            path: a.path,
            parentPath: a.parentPath,
            photoCount: a.photoCount,
            dateRange: a.dateRange,
            cameras: a.cameras,
            extensions: a.extensions,
          }));

          const result = {
            source: "photo-library",
            albums,
            totalPhotos,
            totalAlbums: albums.length,
            cameras: [...allCameras].sort(),
            yearRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
            scanPaths,
            scannedAt: new Date().toISOString(),
          };

          writeFileSync(join(CACHE_DIR, "photo-library.json"), JSON.stringify(result, null, 2));
          updateScanLog("photos" as keyof ScanLog);
          logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Photo library scanned: ${totalPhotos} photos in ${albums.length} albums` });
          return jsonResult(result);
        } catch (err) {
          logError("user-context", "Photo scan failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    // ── Twitter/X Following (Puppeteer scrape) ────────────────────────────────
    {
      name: "enso_context_scan_twitter",
      label: "Scan Twitter/X Following",
      description: "Scrape your Twitter/X following list using a persistent browser session. Requires manual login first: run with headless=false to open a visible browser for login.",
      parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
      async execute(_callId: string, _params: Record<string, unknown>): Promise<AgentToolResult> {
        const denied = checkConsent("twitterFollowing" as keyof ContextConsent);
        if (denied) return denied;
        ensureDirs();

        const TWITTER_BROWSER_DIR = join(homedir(), ".enso", "data", "twitter-browser");
        mkdirSync(TWITTER_BROWSER_DIR, { recursive: true });

        const SCAN_TIMEOUT = 90_000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Twitter scan timed out after 90s. You may need to log in first — use /browser → x.com")), SCAN_TIMEOUT)
        );

        try {
          return await Promise.race([timeoutPromise, (async () => {
            const puppeteer = await import("puppeteer");
            const browser = await puppeteer.default.launch({
              headless: "new" as unknown as boolean,
              userDataDir: TWITTER_BROWSER_DIR,
              args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1280,900"],
            });

            try {
              const page = await browser.newPage();
              await page.setViewport({ width: 1280, height: 900 });
              await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

              // First navigate to home to verify login
              await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 20000 });
              await new Promise(r => setTimeout(r, 4000)); // Wait for JS render

              // Check if logged in
              const homeUrl = page.url();
              logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Twitter home URL: ${homeUrl}` });
              if (homeUrl.includes("/login") || homeUrl.includes("/i/flow/login") || homeUrl.includes("/i/flow/signup")) {
                await browser.close();
                return errorResult("Not logged in to Twitter/X. Use /browser to navigate to x.com and log in first, then retry the scan.");
              }

              // Get the user's own handle from the home page
              const myHandle = await page.evaluate(`(() => {
                // Try to find the user's handle from the nav/sidebar
                var navLinks = document.querySelectorAll('a[href^="/"]');
                for (var i = 0; i < navLinks.length; i++) {
                  var href = navLinks[i].getAttribute('href');
                  if (href && href.match(/^\\/[a-zA-Z0-9_]+$/) && !['/', '/home', '/explore', '/search', '/notifications', '/messages', '/settings', '/compose', '/i'].some(function(p) { return href === p || href.startsWith('/i/'); })) {
                    return href.substring(1);
                  }
                }
                return null;
              })()`);

              logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Twitter detected handle: ${myHandle || "unknown"}` });

              // Navigate to following page
              const followingUrl = myHandle ? `https://x.com/${myHandle}/following` : "https://x.com/following";
              await page.goto(followingUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
              await new Promise(r => setTimeout(r, 4000));

              // Scroll and collect accounts
              const accounts: Array<{ handle: string; displayName: string; bio: string; verified: boolean }> = [];
              const seenHandles = new Set<string>();
              let noNewCount = 0;

              for (let scroll = 0; scroll < 60 && noNewCount < 5; scroll++) {
                const newAccounts = await page.evaluate(`(() => {
                  var cells = document.querySelectorAll('[data-testid="UserCell"]');
                  var results = [];
                  cells.forEach(function(cell) {
                    try {
                      // Find handle from profile links
                      var links = cell.querySelectorAll('a[role="link"]');
                      var handle = "";
                      for (var i = 0; i < links.length; i++) {
                        var href = links[i].getAttribute("href") || "";
                        // Profile links are like /username (single segment, no slashes after the first)
                        if (href.match(/^\\/[a-zA-Z0-9_]+$/)) {
                          handle = href.substring(1);
                          break;
                        }
                      }

                      // Find display name
                      var displayName = "";
                      var nameSpans = cell.querySelectorAll('a[role="link"] span');
                      for (var j = 0; j < nameSpans.length; j++) {
                        var text = nameSpans[j].textContent || "";
                        if (text && !text.startsWith("@") && text.length > 0 && text.length < 50) {
                          displayName = text;
                          break;
                        }
                      }

                      // Find bio text
                      var bio = "";
                      var bioDiv = cell.querySelector('[data-testid="UserDescription"]');
                      if (bioDiv) bio = bioDiv.textContent || "";

                      // Check verified
                      var verified = !!cell.querySelector('[data-testid="icon-verified"], svg[aria-label="Verified account"]');

                      if (handle) results.push({ handle: handle, displayName: displayName || handle, bio: bio, verified: verified });
                    } catch(e) {}
                  });
                  return results;
                })()`);

                let addedNew = false;
                for (const acc of (newAccounts as typeof accounts)) {
                  if (acc.handle && !seenHandles.has(acc.handle)) {
                    seenHandles.add(acc.handle);
                    accounts.push(acc);
                    addedNew = true;
                  }
                }

                if (!addedNew) noNewCount++;
                else noNewCount = 0;

                // Scroll down
                await page.evaluate("window.scrollBy(0, 800)");
                await new Promise(r => setTimeout(r, 1500));

                if (accounts.length >= 500) break;

                // Log progress every 10 scrolls
                if (scroll > 0 && scroll % 10 === 0) {
                  logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Twitter following scan progress: ${accounts.length} accounts after ${scroll} scrolls` });
                }
              }

              await browser.close();

              const result = {
                source: "twitter-following",
                accounts,
                totalFollowing: accounts.length,
                scannedAt: new Date().toISOString(),
              };

              writeFileSync(join(CACHE_DIR, "twitter-following.json"), JSON.stringify(result, null, 2));
              updateScanLog("twitterFollowing" as keyof ScanLog);
              logAction({ ts: Date.now(), type: "action", category: "user-context", message: `Twitter following scanned: ${accounts.length} accounts` });
              return jsonResult(result);
            } catch (innerErr) {
              try { await browser.close(); } catch { /* ignore */ }
              throw innerErr;
            }
          })()]);
        } catch (err) {
          logError("user-context", "Twitter scan failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    // ── QQ Music (Puppeteer + local files) ────────────────────────────────────
    {
      name: "enso_context_scan_qq_music",
      label: "Scan QQ Music",
      description: "Scan QQ Music online profile and local audio files.",
      parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
      async execute(_callId: string, _params: Record<string, unknown>): Promise<AgentToolResult> {
        const denied = checkConsent("qqMusic" as keyof ContextConsent);
        if (denied) return denied;
        ensureDirs();

        try {
          const AUDIO_EXTS = new Set([".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".wma", ".ape"]);
          const localDirs = [
            join(homedir(), "Music"),
            join(homedir(), "AppData", "Local", "QQMusic", "Media"),
            "D:\\Music",
            "F:\\Music",
          ].filter(p => existsSync(p));

          const localFiles: Array<{ title: string; artist: string; filePath: string; ext: string; size: number }> = [];

          for (const dir of localDirs) {
            try {
              function walkMusic(d: string, depth: number): void {
                if (depth > 3) return;
                try {
                  for (const entry of readdirSync(d)) {
                    const fullPath = join(d, entry);
                    try {
                      const stat = statSync(fullPath);
                      if (stat.isDirectory()) walkMusic(fullPath, depth + 1);
                      else if (stat.isFile()) {
                        const ext = extname(entry).toLowerCase();
                        if (AUDIO_EXTS.has(ext)) {
                          // Parse "Artist - Title" from filename
                          const name = entry.replace(/\.[^.]+$/, "");
                          const parts = name.split(" - ");
                          const artist = parts.length > 1 ? parts[0].trim() : "Unknown";
                          const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : name;
                          localFiles.push({ title, artist, filePath: fullPath, ext, size: stat.size });
                        }
                      }
                    } catch { /* skip */ }
                  }
                } catch { /* skip */ }
              }
              walkMusic(dir, 0);
            } catch { /* skip */ }
          }

          // Online scraping — QQ Music liked songs
          const playlists: Array<{ name: string; trackCount: number; tracks: Array<{ title: string; artist: string; album: string }> }> = [];
          const favorites: Array<{ title: string; artist: string; album: string }> = [];

          const QQ_BROWSER_DIR = join(homedir(), ".enso", "data", "qqmusic-browser");
          mkdirSync(QQ_BROWSER_DIR, { recursive: true });
          try {
            const puppeteer = await import("puppeteer");
            const browser = await puppeteer.default.launch({
              headless: "new" as unknown as boolean, // New headless mode — more compatible with auth
              userDataDir: QQ_BROWSER_DIR,
              args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1280,900"],
            });
            try {
              const page = await browser.newPage();
              await page.setViewport({ width: 1280, height: 900 });
              await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
              // Navigate to liked songs page
              await page.goto("https://y.qq.com/n/ryqq_v2/profile/like/song", { waitUntil: "domcontentloaded", timeout: 20000 });
              await new Promise(r => setTimeout(r, 6000)); // Wait for SPA to render

              // Step 1: Get the user's liked playlist ID from profile API
              const profileData = await page.evaluate(`(async () => {
                try {
                  var uin = document.cookie.match(/uin=(\\d+)/);
                  var loginUin = uin ? uin[1] : '';
                  if (!loginUin) return { loggedIn: false };
                  var url = 'https://c6.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?cv=4747474&ct=20&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=' + loginUin + '&cid=205360838&userid=' + loginUin + '&reqfrom=1&reqtype=0';
                  var resp = await fetch(url, { credentials: 'include' });
                  var data = await resp.json();
                  if (data.data && data.data.mymusic && data.data.mymusic[0]) {
                    return { loggedIn: true, playlistId: data.data.mymusic[0].id, totalSongs: data.data.mymusic[0].num0 };
                  }
                  return { loggedIn: true, playlistId: null };
                } catch(e) { return { loggedIn: false, error: e.message }; }
              })()`);

              const profile = profileData as { loggedIn: boolean; playlistId?: string; totalSongs?: number };

              if (!profile.loggedIn) {
                logAction({ ts: Date.now(), type: "action", category: "user-context", message: "QQ Music: not logged in. Use the Enso browser to log in at y.qq.com first." });
              } else if (profile.playlistId) {
                // Step 2: Fetch all songs via the playlist API (supports up to 300 per request)
                const songData = await page.evaluate(`(async () => {
                  var playlistId = '${profile.playlistId}';
                  var url = 'https://c6.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=' + playlistId + '&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&song_begin=0&song_num=500';
                  var resp = await fetch(url, { credentials: 'include' });
                  var data = await resp.json();
                  if (data.cdlist && data.cdlist[0] && data.cdlist[0].songlist) {
                    return data.cdlist[0].songlist.map(function(s) {
                      return {
                        title: s.songname || s.name || '',
                        artist: (s.singer || []).map(function(si) { return si.name; }).join(', '),
                        album: s.albumname || '',
                        mid: s.songmid || '',
                        duration: s.interval ? (Math.floor(s.interval / 60) + ':' + ('0' + (s.interval % 60)).slice(-2)) : ''
                      };
                    });
                  }
                  return [];
                })()`);

                const songs = songData as Array<{ title: string; artist: string; album: string; mid?: string; duration?: string }>;
                logAction({ ts: Date.now(), type: "action", category: "user-context", message: `QQ Music: fetched ${songs.length} songs via playlist API (playlist ${profile.playlistId})` });
                favorites.push(...songs);
              }

              await browser.close();
            } catch (innerErr) {
              try { await browser.close(); } catch { /* ignore */ }
              logError("user-context", "QQ Music browser scraping failed", innerErr);
            }
          } catch (outerErr) {
            logError("user-context", "QQ Music browser launch failed", outerErr);
          }

          const result = {
            source: "qq-music",
            playlists,
            favorites,
            localFiles,
            totalTracks: favorites.length + localFiles.length,
            totalPlaylists: playlists.length,
            localDirsScanned: localDirs,
            scannedAt: new Date().toISOString(),
          };

          writeFileSync(join(CACHE_DIR, "qq-music.json"), JSON.stringify(result, null, 2));
          updateScanLog("qqMusic" as keyof ScanLog);
          logAction({ ts: Date.now(), type: "action", category: "user-context", message: `QQ Music scanned: ${favorites.length} favorites, ${localFiles.length} local files` });
          return jsonResult(result);
        } catch (err) {
          logError("user-context", "QQ Music scan failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,
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
