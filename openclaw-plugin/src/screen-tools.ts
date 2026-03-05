import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { mkdirSync, readdirSync, unlinkSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { toMediaUrl } from "./server.js";
import { logAction } from "./action-log.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Types ────────────────────────────────────────────────────────────────

type CaptureParams = { monitor?: number };
type ClickParams = { x: number; y: number; button?: string };
type TypeParams = { text: string };
type ScrollParams = { x: number; y: number; direction: string; amount?: number };
type KeyParams = { combo: string };

// ── Constants ────────────────────────────────────────────────────────────

const CACHE_DIR = join(homedir(), ".openclaw", "enso-apps", "remote_desktop", "cache");
const MAX_CACHED = 10;

/** Cached DPI scale factor (physical pixels / logical pixels). */
let _scaleFactor = 1;

// ── Lazy-loaded modules ──────────────────────────────────────────────────

let _nodeScreenshots: typeof import("node-screenshots") | null = null;
let _nutJs: typeof import("@nut-tree-fork/nut-js") | null = null;

async function getScreenshots() {
  if (!_nodeScreenshots) {
    _nodeScreenshots = await import("node-screenshots");
  }
  return _nodeScreenshots;
}

async function getNutJs() {
  if (!_nutJs) {
    _nutJs = await import("@nut-tree-fork/nut-js");
    // Disable nut.js built-in image matching (we don't need it)
    _nutJs.mouse.config.autoDelayMs = 0;
    _nutJs.mouse.config.mouseSpeed = 2000;
  }
  return _nutJs;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

/** Clean old screenshots, keeping only the last MAX_CACHED files. */
function cleanupCache(): void {
  try {
    const files = readdirSync(CACHE_DIR)
      .filter((f) => f.startsWith("rdp-") && f.endsWith(".jpg"))
      .sort();
    while (files.length >= MAX_CACHED) {
      const oldest = files.shift()!;
      try {
        unlinkSync(join(CACHE_DIR, oldest));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* cache dir may not exist yet */
  }
}

/** Capture a screenshot, save as JPEG, return metadata + media URL. */
async function captureScreen(
  _monitor?: number,
): Promise<{ screenshot: string; width: number; height: number; timestamp: number }> {
  mkdirSync(CACHE_DIR, { recursive: true });
  cleanupCache();

  const ns = await getScreenshots();
  const monitors = ns.Monitor.all();
  const monitorIdx = _monitor ?? 0;
  const monitor = monitors[monitorIdx];
  if (!monitor) {
    throw new Error(`Monitor ${monitorIdx} not found (${monitors.length} available)`);
  }

  // Cache DPI scale factor — Monitor methods need () call, Image has getter props
  const sf = (monitor as any).scaleFactor();
  if (sf && sf > 0) _scaleFactor = sf;

  const image = monitor.captureImageSync();
  // node-screenshots: Image has getter properties, Monitor has methods
  const width: number = typeof image.width === "function" ? (image as any).width() : image.width;
  const height: number = typeof image.height === "function" ? (image as any).height() : image.height;
  const timestamp = Date.now();
  const filename = `rdp-${timestamp}.jpg`;
  const filepath = join(CACHE_DIR, filename);

  // node-screenshots returns JPEG buffer (default quality ~75)
  const jpegBuffer = image.toJpegSync();
  await writeFile(filepath, jpegBuffer);

  logAction({ ts: Date.now(), type: "action", category: "screen", message: `Captured ${width}x${height} → ${(jpegBuffer.length / 1024).toFixed(0)} KB` });

  return {
    screenshot: toMediaUrl(filepath),
    width,
    height,
    timestamp,
  };
}

// ── Key combo parser ─────────────────────────────────────────────────────

async function parseKeyCombo(combo: string): Promise<number[]> {
  const nut = await getNutJs();
  const K = nut.Key;
  const keyMap: Record<string, number> = {
    control: K.LeftControl,
    ctrl: K.LeftControl,
    alt: K.LeftAlt,
    shift: K.LeftShift,
    meta: K.LeftSuper,
    win: K.LeftSuper,
    super: K.LeftSuper,
    enter: K.Enter,
    return: K.Enter,
    escape: K.Escape,
    esc: K.Escape,
    tab: K.Tab,
    delete: K.Delete,
    backspace: K.Backspace,
    space: K.Space,
    up: K.Up,
    down: K.Down,
    left: K.Left,
    right: K.Right,
    home: K.Home,
    end: K.End,
    pageup: K.PageUp,
    pagedown: K.PageDown,
    f1: K.F1,
    f2: K.F2,
    f3: K.F3,
    f4: K.F4,
    f5: K.F5,
    f6: K.F6,
    f7: K.F7,
    f8: K.F8,
    f9: K.F9,
    f10: K.F10,
    f11: K.F11,
    f12: K.F12,
  };

  // Add single letters a-z
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i); // 'a' to 'z'
    const keyName = String.fromCharCode(65 + i) as keyof typeof K; // 'A' to 'Z'
    if (K[keyName] !== undefined) {
      keyMap[letter] = K[keyName] as number;
    }
  }

  // Add digits 0-9
  for (let i = 0; i <= 9; i++) {
    const keyName = `Num${i}` as keyof typeof K;
    if (K[keyName] !== undefined) {
      keyMap[String(i)] = K[keyName] as number;
    }
  }

  return combo
    .toLowerCase()
    .split("+")
    .map((k) => {
      const trimmed = k.trim();
      const mapped = keyMap[trimmed];
      if (mapped !== undefined) return mapped;
      throw new Error(`Unknown key: "${trimmed}"`);
    });
}

// ── Tool implementations ─────────────────────────────────────────────────

async function toolCapture(params: CaptureParams): Promise<AgentToolResult> {
  try {
    const result = await captureScreen(params.monitor);
    return jsonResult(result);
  } catch (err: unknown) {
    return errorResult(`Screen capture failed: ${(err as Error).message}`);
  }
}

async function toolClick(params: ClickParams): Promise<AgentToolResult> {
  try {
    const { x, y, button } = params;
    if (typeof x !== "number" || typeof y !== "number") {
      return errorResult("x and y coordinates are required");
    }

    // Convert physical pixel coords (from screenshot) to logical coords (for nut.js)
    const logicalX = Math.round(x / _scaleFactor);
    const logicalY = Math.round(y / _scaleFactor);

    const nut = await getNutJs();
    const point = new nut.Point(logicalX, logicalY);
    await nut.mouse.setPosition(point);

    if (button === "right") {
      await nut.mouse.rightClick();
    } else if (button === "double") {
      await nut.mouse.doubleClick(nut.Button.LEFT);
    } else {
      await nut.mouse.leftClick();
    }

    // Small delay for UI to respond, then capture
    await new Promise((r) => setTimeout(r, 150));
    const result = await captureScreen();
    return jsonResult(result);
  } catch (err: unknown) {
    return errorResult(`Click failed: ${(err as Error).message}`);
  }
}

async function toolType(params: TypeParams): Promise<AgentToolResult> {
  try {
    const { text } = params;
    if (!text) return errorResult("text is required");

    const nut = await getNutJs();
    await nut.keyboard.type(text);

    await new Promise((r) => setTimeout(r, 150));
    const result = await captureScreen();
    return jsonResult(result);
  } catch (err: unknown) {
    return errorResult(`Type failed: ${(err as Error).message}`);
  }
}

async function toolScroll(params: ScrollParams): Promise<AgentToolResult> {
  try {
    const { x, y, direction, amount } = params;
    if (typeof x !== "number" || typeof y !== "number") {
      return errorResult("x and y coordinates are required");
    }

    // Convert physical pixel coords to logical coords
    const logicalX = Math.round(x / _scaleFactor);
    const logicalY = Math.round(y / _scaleFactor);

    const nut = await getNutJs();
    await nut.mouse.setPosition(new nut.Point(logicalX, logicalY));

    const scrollAmount = amount ?? 3;
    for (let i = 0; i < scrollAmount; i++) {
      if (direction === "up") await nut.mouse.scrollUp(1);
      else if (direction === "down") await nut.mouse.scrollDown(1);
      else if (direction === "left") await nut.mouse.scrollLeft(1);
      else if (direction === "right") await nut.mouse.scrollRight(1);
      else return errorResult(`Unknown scroll direction: ${direction}`);
    }

    await new Promise((r) => setTimeout(r, 200));
    const result = await captureScreen();
    return jsonResult(result);
  } catch (err: unknown) {
    return errorResult(`Scroll failed: ${(err as Error).message}`);
  }
}

async function toolKey(params: KeyParams): Promise<AgentToolResult> {
  try {
    const { combo } = params;
    if (!combo) return errorResult("combo is required");

    const keys = await parseKeyCombo(combo);
    const nut = await getNutJs();

    // Press all keys in order, then release in reverse
    for (const key of keys) {
      await nut.keyboard.pressKey(key);
    }
    for (const key of [...keys].reverse()) {
      await nut.keyboard.releaseKey(key);
    }

    await new Promise((r) => setTimeout(r, 200));
    const result = await captureScreen();
    return jsonResult(result);
  } catch (err: unknown) {
    return errorResult(`Key combo failed: ${(err as Error).message}`);
  }
}

// ── Tool registration ────────────────────────────────────────────────────

export function createScreenTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_screen_capture",
      label: "Screen Capture",
      description: "Capture a screenshot of the desktop and return it as a media URL.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          monitor: { type: "number", description: "Monitor index (default 0 = primary)" },
        },
        required: [],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        toolCapture(params as CaptureParams),
    } as AnyAgentTool,
    {
      name: "enso_screen_click",
      label: "Screen Click",
      description: "Click at screen coordinates, then capture a new screenshot.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "number", description: "Screen X coordinate" },
          y: { type: "number", description: "Screen Y coordinate" },
          button: { type: "string", description: "left (default), right, or double" },
        },
        required: ["x", "y"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        toolClick(params as ClickParams),
    } as AnyAgentTool,
    {
      name: "enso_screen_type",
      label: "Screen Type",
      description: "Type text on the desktop, then capture a new screenshot.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", description: "Text to type" },
        },
        required: ["text"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        toolType(params as TypeParams),
    } as AnyAgentTool,
    {
      name: "enso_screen_scroll",
      label: "Screen Scroll",
      description: "Scroll at screen coordinates, then capture a new screenshot.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "number", description: "Screen X coordinate" },
          y: { type: "number", description: "Screen Y coordinate" },
          direction: { type: "string", description: "up, down, left, or right" },
          amount: { type: "number", description: "Scroll ticks (default 3)" },
        },
        required: ["x", "y", "direction"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        toolScroll(params as ScrollParams),
    } as AnyAgentTool,
    {
      name: "enso_screen_key",
      label: "Screen Key Combo",
      description: "Send a key combination (e.g. control+c, alt+tab, enter), then capture a new screenshot.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          combo: { type: "string", description: "Key combo like control+c, alt+tab, enter, escape" },
        },
        required: ["combo"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        toolKey(params as KeyParams),
    } as AnyAgentTool,
  ];
}

export function registerScreenTools(api: OpenClawPluginApi): void {
  for (const tool of createScreenTools()) {
    api.registerTool(tool);
  }
  logAction({ ts: Date.now(), type: "system", category: "screen", message: "Registered 5 screen control tools" });
}
