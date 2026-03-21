/**
 * Action Log — persistent NDJSON log + bug fix tracker
 *
 * Files:
 *   ~/.enso/action.log   — NDJSON, all actions/errors/tools (rotate at 1000 lines)
 *   ~/.enso/fixes.json   — JSON array of bug fix records
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";

// ── Types ──

export type LogEntryType = "action" | "error" | "fix" | "build" | "system" | "claude-code";

export interface LogEntry {
  ts: number;
  type: LogEntryType;
  category: string;
  message: string;
  error?: string;
  cardId?: string;
  toolFamily?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface FixEntry {
  id: string;
  timestamp: number;
  description: string;
  error: string;
  resolution: string;
  category: string;
  acknowledged: boolean;
}

// ── Paths ──

const BASE_DIR = join(homedir(), ".enso");
const LOG_PATH = join(BASE_DIR, "action.log");
const FIXES_PATH = join(BASE_DIR, "fixes.json");

const MAX_LINES = 1000;
const KEEP_LINES = 800;

function ensureDir(): void {
  if (!existsSync(BASE_DIR)) {
    mkdirSync(BASE_DIR, { recursive: true });
  }
}

// ── Rotation ──

function rotateIfNeeded(): void {
  try {
    if (!existsSync(LOG_PATH)) return;
    const content = readFileSync(LOG_PATH, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > MAX_LINES) {
      const kept = lines.slice(lines.length - KEEP_LINES);
      writeFileSync(LOG_PATH, kept.join("\n") + "\n");
    }
  } catch {
    // Best-effort rotation
  }
}

// ── Core Logging ──

export function logAction(entry: LogEntry): void {
  try {
    ensureDir();
    const line = JSON.stringify(entry);
    appendFileSync(LOG_PATH, line + "\n");
    console.log(`[enso:${entry.category}] ${entry.message}`);
    rotateIfNeeded();
  } catch (err) {
    console.error(`[enso:action-log] write failed:`, err);
  }
}

export function logError(category: string, message: string, error?: unknown, extra?: Partial<LogEntry>): void {
  const errStr = error instanceof Error ? error.message : error != null ? String(error) : undefined;
  logAction({
    ts: Date.now(),
    type: "error",
    category,
    message,
    error: errStr,
    ...extra,
  });
  if (errStr) console.error(`[enso:${category}] ${message}: ${errStr}`);
}

// ── Fix Tracking ──

function readFixes(): FixEntry[] {
  try {
    if (!existsSync(FIXES_PATH)) return [];
    const raw = readFileSync(FIXES_PATH, "utf-8");
    return JSON.parse(raw) as FixEntry[];
  } catch {
    return [];
  }
}

function writeFixes(fixes: FixEntry[]): void {
  ensureDir();
  writeFileSync(FIXES_PATH, JSON.stringify(fixes, null, 2));
}

/** Optional callback fired when a fix is logged — used by server.ts to broadcast in real-time. */
let _onFix: ((entry: FixEntry) => void) | null = null;

/** Register a callback to be notified when logFix() is called. */
export function onFixLogged(cb: (entry: FixEntry) => void): void {
  _onFix = cb;
}

export function logFix(fix: Omit<FixEntry, "id" | "timestamp" | "acknowledged">): void {
  const entry: FixEntry = {
    id: randomUUID(),
    timestamp: Date.now(),
    acknowledged: false,
    ...fix,
  };

  // Write to fixes file
  const fixes = readFixes();
  fixes.push(entry);
  writeFixes(fixes);

  // Also log to action log
  logAction({
    ts: entry.timestamp,
    type: "fix",
    category: entry.category,
    message: `Fix: ${entry.description} → ${entry.resolution}`,
    error: entry.error,
  });

  // Notify listener for real-time broadcasting
  _onFix?.(entry);
}

export function getUnacknowledgedFixes(): FixEntry[] {
  return readFixes().filter((f) => !f.acknowledged);
}

export function acknowledgeFixes(ids: string[]): void {
  const fixes = readFixes();
  const idSet = new Set(ids);
  let changed = false;
  for (const fix of fixes) {
    if (idSet.has(fix.id) && !fix.acknowledged) {
      fix.acknowledged = true;
      changed = true;
    }
  }
  if (changed) writeFixes(fixes);
}

// ── Recent Log Reader ──

export function getRecentLog(count = 100, typeFilter?: string): LogEntry[] {
  try {
    if (!existsSync(LOG_PATH)) return [];
    const content = readFileSync(LOG_PATH, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const entries: LogEntry[] = [];
    // Read from end for most recent first
    for (let i = lines.length - 1; i >= 0 && entries.length < count; i--) {
      try {
        const entry = JSON.parse(lines[i]) as LogEntry;
        if (!typeFilter || entry.type === typeFilter) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}
