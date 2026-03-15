/**
 * Memory Bridge — unified memory integration between Enso and OpenClaw.
 *
 * Three responsibilities:
 *   1. Card History:     persist cards to disk, replay on reconnect
 *   2. Context Injection: feed Enso usage data into agent prompts
 *   3. Memory Surface:   expose OpenClaw workspace memory to frontend
 *
 * Storage: ~/.openclaw/enso-cards/<clientId>.jsonl
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentStep, CardModeDetail } from "@shared/types";
import { APP_CATALOG } from "./app-catalog.js";
import { getRecentInteractions } from "./interaction-tracker.js";
import { getRecentLog } from "./action-log.js";

// ── Types ──

export interface CardRecord {
  id: string;
  runId: string;
  type: string;
  role: "user" | "assistant";
  text?: string;
  data?: unknown;
  generatedUI?: string;
  mediaUrls?: string[];
  steps?: AgentStep[];
  toolMeta?: { toolId: string; toolSessionId?: string; cwd?: string };
  cardMode?: CardModeDetail;
  // App enhancement state
  appData?: unknown;
  appGeneratedUI?: string;
  appCardMode?: CardModeDetail;
  timestamp: number;
}

// ── Paths ──

const CARDS_DIR = join(homedir(), ".openclaw", "enso-cards");

const MAX_ENTRIES = 200;
const KEEP_ENTRIES = 150;
const STALE_DAYS = 30;

function ensureCardsDir(): void {
  if (!existsSync(CARDS_DIR)) {
    mkdirSync(CARDS_DIR, { recursive: true });
  }
}

function journalPath(clientId: string): string {
  // Sanitize clientId for filesystem safety
  const safe = clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(CARDS_DIR, `${safe}.jsonl`);
}

// ── Part 1: Card History ──

/**
 * Append a card record to the client's JSONL journal.
 * If the card ID already exists (enhance update), replace the existing entry.
 */
export function persistCard(clientId: string, record: CardRecord): void {
  try {
    ensureCardsDir();
    const path = journalPath(clientId);

    // Check if this card already exists (for enhance updates to existing cards)
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      const existingIdx = lines.findIndex((line) => {
        try {
          const parsed = JSON.parse(line) as CardRecord;
          return parsed.id === record.id;
        } catch {
          return false;
        }
      });

      if (existingIdx >= 0) {
        // Merge: keep existing fields, overlay new ones
        const existing = JSON.parse(lines[existingIdx]) as CardRecord;
        const merged: CardRecord = { ...existing, ...record, timestamp: record.timestamp || existing.timestamp };
        lines[existingIdx] = JSON.stringify(merged);
        writeFileSync(path, lines.join("\n") + "\n");
        return;
      }
    }

    // Append new entry
    appendFileSync(path, JSON.stringify(record) + "\n");

    // Rotate if needed
    rotateJournal(path);
  } catch {
    // Never let history persistence break the main flow
  }
}

/**
 * Load recent cards for a client. Returns entries in chronological order.
 */
export function loadCardHistory(clientId: string, count: number): CardRecord[] {
  try {
    const path = journalPath(clientId);
    if (!existsSync(path)) return [];

    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const records: CardRecord[] = [];

    // Take last N entries (they're already in chronological order)
    const start = Math.max(0, lines.length - count);
    for (let i = start; i < lines.length; i++) {
      try {
        records.push(JSON.parse(lines[i]) as CardRecord);
      } catch {
        // Skip malformed lines
      }
    }

    return records;
  } catch {
    return [];
  }
}

/** Rotate a journal file to keep it bounded. */
function rotateJournal(path: string): void {
  try {
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > MAX_ENTRIES) {
      const kept = lines.slice(lines.length - KEEP_ENTRIES);
      writeFileSync(path, kept.join("\n") + "\n");
    }
  } catch {
    // Best-effort rotation
  }
}

/**
 * Remove journal files older than STALE_DAYS.
 * Call on server startup.
 */
export function pruneStaleJournals(): void {
  try {
    ensureCardsDir();
    const now = Date.now();
    const cutoff = STALE_DAYS * 24 * 60 * 60 * 1000;

    for (const file of readdirSync(CARDS_DIR)) {
      if (!file.endsWith(".jsonl")) continue;
      const filePath = join(CARDS_DIR, file);
      try {
        const stat = statSync(filePath);
        if (now - stat.mtimeMs > cutoff) {
          unlinkSync(filePath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Best-effort pruning
  }
}

// ── Part 2: Context Injection ──

let cachedContext: { text: string; timestamp: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

/**
 * Build a compact Enso context block for injection into the agent prompt.
 * Cached for CACHE_TTL to avoid recomputing on every turn.
 */
export async function buildEnsoContext(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.timestamp < CACHE_TTL) {
    return cachedContext.text;
  }

  const sections: string[] = [];

  const usage = buildAppUsageSummary();
  if (usage) sections.push(usage);

  const errors = buildRecentErrorsSummary();
  if (errors) sections.push(errors);

  const apps = buildAvailableAppsSummary();
  if (apps) sections.push(apps);

  if (sections.length === 0) return "";

  const text = `<enso_context>\n${sections.join("\n")}\n</enso_context>`;
  cachedContext = { text, timestamp: Date.now() };
  return text;
}

/** Summarize top used apps from interaction tracker. */
function buildAppUsageSummary(): string {
  try {
    const familyCounts: Array<{ family: string; count: number }> = [];

    for (const app of APP_CATALOG) {
      const interactions = getRecentInteractions(app.appId, 200);
      if (interactions.length > 0) {
        familyCounts.push({ family: app.appId, count: interactions.length });
      }
    }

    if (familyCounts.length === 0) return "";

    familyCounts.sort((a, b) => b.count - a.count);
    const top = familyCounts.slice(0, 7);
    const items = top.map((f) => `${f.family} (${f.count})`).join(", ");
    return `User's most-used Enso apps: ${items}`;
  } catch {
    return "";
  }
}

/** Summarize recent errors from action log. */
function buildRecentErrorsSummary(): string {
  try {
    const errors = getRecentLog(5, "error");
    if (errors.length === 0) return "";

    const items = errors.map((e) => {
      const ago = formatTimeAgo(e.ts);
      return `[${ago}] ${e.category}: ${e.message.slice(0, 100)}`;
    });
    return `Recent issues:\n${items.join("\n")}`;
  } catch {
    return "";
  }
}

/** List available Enso apps. */
function buildAvailableAppsSummary(): string {
  try {
    const appIds = APP_CATALOG.map((a) => a.appId);
    if (appIds.length === 0) return "";
    return `Available Enso apps: ${appIds.join(", ")}`;
  } catch {
    return "";
  }
}

/** Format a timestamp as a human-readable relative time. */
function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Part 3: Memory Surface ──

let workspaceDir: string | null = null;

/** Store the OpenClaw workspace directory (captured from hook context). */
export function setWorkspaceDir(dir: string): void {
  if (!workspaceDir && dir) workspaceDir = dir;
}

/** Get the stored workspace directory. */
export function getWorkspaceDir(): string | null {
  return workspaceDir;
}

/** Safely read a file, returning null if it doesn't exist or errors. */
export function safeReadFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/** Read the user's USER.md and MEMORY.md from the OpenClaw workspace. */
export function readWorkspaceMemory(): { user: string | null; memory: string | null } {
  if (!workspaceDir) return { user: null, memory: null };
  return {
    user: safeReadFile(join(workspaceDir, "USER.md")),
    memory: safeReadFile(join(workspaceDir, "MEMORY.md")),
  };
}

/** Write updated USER.md content. */
export function writeUserProfile(content: string): boolean {
  if (!workspaceDir) return false;
  try {
    writeFileSync(join(workspaceDir, "USER.md"), content, "utf-8");
    return true;
  } catch {
    return false;
  }
}
