import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { toMediaUrl } from "./server.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Types ──

interface Bookmark {
  name: string;
  url: string;
  folder: string;
  source: "chrome" | "edge";
}

interface BrowserState {
  url: string;
  title: string;
  screenshotUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  canGoBack: boolean;
  canGoForward: boolean;
}

type OpenParams = { url?: string };
type NavigateParams = { url: string };
type ClickParams = { x: number; y: number };
type ScrollParams = { direction: "up" | "down"; amount?: number };
type BackParams = { forward?: boolean };
type TypeParams = { text: string; submit?: boolean };

// ── Constants ──

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const SCREENSHOT_DIR = join(tmpdir(), "enso-browser");
const PAGE_TIMEOUT = 15_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min page idle timeout

// ── Helpers ──

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

// ── Bookmark Reading ──

interface ChromeBookmarkNode {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

function parseBookmarkTree(node: ChromeBookmarkNode, folder: string, source: "chrome" | "edge", out: Bookmark[]): void {
  if (node.type === "url" && node.url && node.name) {
    out.push({ name: node.name, url: node.url, folder, source });
  }
  if (node.children) {
    const folderName = node.name || folder;
    for (const child of node.children) {
      parseBookmarkTree(child, folderName, source, out);
    }
  }
}

function readBrowserBookmarks(source: "chrome" | "edge"): Bookmark[] {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const path = source === "chrome"
    ? join(localAppData, "Google", "Chrome", "User Data", "Default", "Bookmarks")
    : join(localAppData, "Microsoft", "Edge", "User Data", "Default", "Bookmarks");

  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as { roots?: Record<string, ChromeBookmarkNode> };
    const bookmarks: Bookmark[] = [];
    if (raw.roots) {
      for (const root of Object.values(raw.roots)) {
        parseBookmarkTree(root, "", source, bookmarks);
      }
    }
    return bookmarks;
  } catch {
    return [];
  }
}

function getAllBookmarks(): Bookmark[] {
  return [...readBrowserBookmarks("chrome"), ...readBrowserBookmarks("edge")];
}

// ── Browser Session Management ──

// Puppeteer types (dynamic import to avoid requiring puppeteer at module load)
type PuppeteerBrowser = { close: () => Promise<void>; newPage: () => Promise<PuppeteerPage> };
type PuppeteerPage = {
  setViewport: (v: { width: number; height: number }) => Promise<void>;
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  screenshot: (opts?: { path?: string; type?: string; fullPage?: boolean }) => Promise<Buffer>;
  click: (selector: string, opts?: Record<string, unknown>) => Promise<void>;
  evaluate: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
  goBack: (opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  goForward: (opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  url: () => string;
  title: () => Promise<string>;
  close: () => Promise<void>;
  keyboard: { type: (text: string) => Promise<void>; press: (key: string) => Promise<void> };
  mouse: { click: (x: number, y: number) => Promise<void> };
  isClosed: () => boolean;
};

let browser: PuppeteerBrowser | null = null;
let activePage: PuppeteerPage | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function launchBrowser(): Promise<PuppeteerBrowser> {
  if (browser) return browser;
  const puppeteer = await import("puppeteer");
  browser = await puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      `--window-size=${VIEWPORT_WIDTH},${VIEWPORT_HEIGHT}`,
    ],
  }) as unknown as PuppeteerBrowser;
  console.log("[enso:browser] Launched headless browser");
  return browser;
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    console.log("[enso:browser] Idle timeout — closing browser");
    await closeBrowser();
  }, IDLE_TIMEOUT_MS);
}

async function getPage(): Promise<PuppeteerPage> {
  const b = await launchBrowser();
  if (activePage && !activePage.isClosed()) {
    resetIdleTimer();
    return activePage;
  }
  activePage = await b.newPage() as unknown as PuppeteerPage;
  await activePage.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  resetIdleTimer();
  console.log("[enso:browser] Created new page");
  return activePage;
}

async function closeBrowser(): Promise<void> {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (activePage && !activePage.isClosed()) {
    try { await activePage.close(); } catch { /* ignore */ }
  }
  activePage = null;
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
    console.log("[enso:browser] Browser closed");
  }
}

// ── Screenshot Capture ──

function ensureScreenshotDir(): void {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function cleanOldScreenshots(): void {
  try {
    const files = readdirSync(SCREENSHOT_DIR).filter((f) => f.startsWith("enso-browser-") && f.endsWith(".png"));
    // Keep only the 5 most recent
    if (files.length <= 5) return;
    const sorted = files.sort();
    for (const f of sorted.slice(0, sorted.length - 5)) {
      try { unlinkSync(join(SCREENSHOT_DIR, f)); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function takeScreenshot(page: PuppeteerPage): Promise<string> {
  ensureScreenshotDir();
  cleanOldScreenshots();
  const filename = `enso-browser-${Date.now()}.png`;
  const filePath = join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, type: "png" });
  return toMediaUrl(filePath);
}

// ── Build Result ──

async function buildBrowserResult(page: PuppeteerPage, tool: string, bookmarks: Bookmark[]): Promise<BrowserState & { tool: string; bookmarks: Bookmark[] }> {
  const screenshotUrl = await takeScreenshot(page);
  const url = page.url();
  const title = await page.title();

  // Check navigation history
  const navState = await page.evaluate(() => ({
    canGoBack: window.history.length > 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canGoForward: (window as any).__ensoForwardAvailable ?? false,
  })) as { canGoBack: boolean; canGoForward: boolean };

  return {
    tool,
    url,
    title,
    screenshotUrl,
    viewportWidth: VIEWPORT_WIDTH,
    viewportHeight: VIEWPORT_HEIGHT,
    canGoBack: navState.canGoBack,
    canGoForward: navState.canGoForward,
    bookmarks,
  };
}

// ── Tool Functions ──

async function browserOpen(params: OpenParams): Promise<AgentToolResult> {
  try {
    const bookmarks = getAllBookmarks();
    const page = await getPage();

    if (params.url) {
      const url = ensureProtocol(params.url);
      await page.goto(url, { waitUntil: "networkidle2" as string, timeout: PAGE_TIMEOUT }).catch(() => {});
      return jsonResult(await buildBrowserResult(page, "enso_browser_open", bookmarks));
    }

    // No URL — return bookmarks-only view
    return jsonResult({
      tool: "enso_browser_open",
      url: "",
      title: "",
      screenshotUrl: "",
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      canGoBack: false,
      canGoForward: false,
      bookmarks,
    });
  } catch (err) {
    return errorResult(`Failed to open browser: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function browserNavigate(params: NavigateParams): Promise<AgentToolResult> {
  try {
    const page = await getPage();
    const url = ensureProtocol(params.url);
    await page.goto(url, { waitUntil: "networkidle2" as string, timeout: PAGE_TIMEOUT }).catch(() => {});
    const bookmarks = getAllBookmarks();
    return jsonResult(await buildBrowserResult(page, "enso_browser_navigate", bookmarks));
  } catch (err) {
    return errorResult(`Failed to navigate: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function browserClick(params: ClickParams): Promise<AgentToolResult> {
  try {
    const page = await getPage();
    const urlBefore = page.url();

    // Start waiting for navigation BEFORE clicking (click triggers it)
    const navPromise = (page as unknown as { waitForNavigation: (opts: Record<string, unknown>) => Promise<unknown> })
      .waitForNavigation({ waitUntil: "networkidle2", timeout: PAGE_TIMEOUT })
      .catch(() => null); // swallow — not every click navigates

    await page.mouse.click(params.x, params.y);

    // If URL changed or navigation happened, wait for it; otherwise brief delay for JS reactions
    const navResult = await Promise.race([
      navPromise,
      new Promise((r) => setTimeout(r, 2000)),
    ]);

    // If the URL changed but race timed out, give extra time for the page to settle
    const urlAfter = page.url();
    if (urlAfter !== urlBefore && !navResult) {
      await new Promise((r) => setTimeout(r, 2000));
    }

    const bookmarks = getAllBookmarks();
    return jsonResult(await buildBrowserResult(page, "enso_browser_click", bookmarks));
  } catch (err) {
    return errorResult(`Failed to click: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function browserScroll(params: ScrollParams): Promise<AgentToolResult> {
  try {
    const page = await getPage();
    const amount = params.amount ?? 400;
    const delta = params.direction === "up" ? -amount : amount;
    await page.evaluate((d: unknown) => window.scrollBy(0, d as number), delta);
    await new Promise((r) => setTimeout(r, 300));
    const bookmarks = getAllBookmarks();
    return jsonResult(await buildBrowserResult(page, "enso_browser_scroll", bookmarks));
  } catch (err) {
    return errorResult(`Failed to scroll: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function browserBack(params: BackParams): Promise<AgentToolResult> {
  try {
    const page = await getPage();
    if (params.forward) {
      await page.goForward({ waitUntil: "networkidle2" as string, timeout: PAGE_TIMEOUT }).catch(() => {});
    } else {
      await page.goBack({ waitUntil: "networkidle2" as string, timeout: PAGE_TIMEOUT }).catch(() => {});
    }
    const bookmarks = getAllBookmarks();
    return jsonResult(await buildBrowserResult(page, "enso_browser_back", bookmarks));
  } catch (err) {
    return errorResult(`Failed to go ${params.forward ? "forward" : "back"}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function browserType(params: TypeParams): Promise<AgentToolResult> {
  try {
    const page = await getPage();
    await page.keyboard.type(params.text);
    if (params.submit) {
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 1500));
    }
    const bookmarks = getAllBookmarks();
    return jsonResult(await buildBrowserResult(page, "enso_browser_type", bookmarks));
  } catch (err) {
    return errorResult(`Failed to type: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function ensureProtocol(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

// ── Tool Registration ──

export function createBrowserTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_browser_open",
      label: "Browser Open",
      description: "Open the remote browser. Optionally navigate to a URL. Returns bookmarks from Chrome/Edge.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string", description: "Optional URL to navigate to on open." },
        },
        required: [],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        browserOpen(params as OpenParams),
    } as AnyAgentTool,
    {
      name: "enso_browser_navigate",
      label: "Browser Navigate",
      description: "Navigate the remote browser to a URL.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string", description: "URL to navigate to." },
        },
        required: ["url"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        browserNavigate(params as NavigateParams),
    } as AnyAgentTool,
    {
      name: "enso_browser_click",
      label: "Browser Click",
      description: "Click at specific viewport coordinates in the remote browser.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "number", description: "X coordinate (pixels from left)." },
          y: { type: "number", description: "Y coordinate (pixels from top)." },
        },
        required: ["x", "y"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        browserClick(params as ClickParams),
    } as AnyAgentTool,
    {
      name: "enso_browser_scroll",
      label: "Browser Scroll",
      description: "Scroll the remote browser page up or down.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          direction: { type: "string", enum: ["up", "down"], description: "Scroll direction." },
          amount: { type: "number", description: "Pixels to scroll (default 400)." },
        },
        required: ["direction"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        browserScroll(params as ScrollParams),
    } as AnyAgentTool,
    {
      name: "enso_browser_back",
      label: "Browser Back/Forward",
      description: "Navigate back or forward in browser history.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          forward: { type: "boolean", description: "If true, go forward instead of back." },
        },
        required: [],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        browserBack(params as BackParams),
    } as AnyAgentTool,
    {
      name: "enso_browser_type",
      label: "Browser Type Text",
      description: "Type text at the current cursor position in the remote browser. Click a field first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", description: "Text to type." },
          submit: { type: "boolean", description: "If true, press Enter after typing." },
        },
        required: ["text"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        browserType(params as TypeParams),
    } as AnyAgentTool,
  ];
}

export function registerBrowserTools(api: OpenClawPluginApi): void {
  for (const tool of createBrowserTools()) {
    api.registerTool(tool);
  }
}
