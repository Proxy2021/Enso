/**
 * Action Log — persistent NDJSON log + bug fix tracker
 *
 * Files:
 *   ~/.enso/action.log   — NDJSON, all actions/errors/tools (rotate at 1000 lines)
 *   ~/.enso/errors.log   — NDJSON, errors only (rotate at 5000 lines, extended retention)
 *   ~/.enso/fixes.json   — JSON array of bug fix records
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomUUID, createHash } from "crypto";
import { getEnsoPath, ENSO_HOME } from "./utils/home.js";
import { getRequestId } from "./request-context.js";
import type { Response } from "express";
import * as errorRateMonitor from "./error-rate-monitor.js";

// ── Types ──

export type LogEntryType = "action" | "error" | "fix" | "build" | "system" | "claude-code";
export type ErrorSeverity = "critical" | "error" | "warning" | "info";

export interface LogEntry {
  ts: number;
  type: LogEntryType;
  category: string;
  message: string;
  error?: string;
  stack?: string;
  severity?: ErrorSeverity;
  code?: string;
  fingerprint?: string;
  dedupCount?: number;
  requestId?: string;
  orchestrationId?: string;
  taskId?: string;
  cardId?: string;
  toolFamily?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
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

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    category?: string;
  };
}

// ── Paths ──

const LOG_PATH = getEnsoPath("action.log");
const ERROR_LOG_PATH = getEnsoPath("errors.log");
const FIXES_PATH = getEnsoPath("fixes.json");

const MAX_LINES = 1000;
const KEEP_LINES = 800;
const ERROR_MAX_LINES = 5000;
const ERROR_KEEP_LINES = 4000;

function ensureDir(): void {
  if (!existsSync(ENSO_HOME)) {
    mkdirSync(ENSO_HOME, { recursive: true });
  }
}

// ── Rotation ──

function rotateFile(path: string, maxLines: number, keepLines: number): void {
  try {
    if (!existsSync(path)) return;
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > maxLines) {
      const kept = lines.slice(lines.length - keepLines);
      writeFileSync(path, kept.join("\n") + "\n");
    }
  } catch {
    // Best-effort rotation
  }
}

// ── Stack Trace Truncation ──

function truncateStack(stack: string | undefined, maxFrames = 15): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split("\n");
  const header = lines[0];
  const frames = lines.slice(1).filter(l => l.trim().startsWith("at "));
  const meaningful = frames.filter(f => !f.includes("node_modules"));
  if (meaningful.length <= maxFrames) return [header, ...meaningful].join("\n");
  const head = meaningful.slice(0, 5);
  const tail = meaningful.slice(-5);
  return [header, ...head, `    ... ${meaningful.length - 10} frames omitted ...`, ...tail].join("\n");
}

// ── Error Fingerprinting & Deduplication ──

function errorFingerprint(category: string, message: string): string {
  const normalized = message
    .replace(/[0-9a-f]{8,}/gi, "<ID>")
    .replace(/\/[\w/.\-\\]+\.\w+/g, "<PATH>")
    .replace(/\d{10,}/g, "<TS>")
    .replace(/:\d{2,5}/g, ":<PORT>")
    .replace(/\d+ms/g, "<DUR>");
  return createHash("md5").update(`${category}:${normalized}`).digest("hex").slice(0, 12);
}

const dedupWindow = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const DEDUP_THRESHOLDS = [10, 100, 1000];

function dedupGate(fingerprint: string): { write: boolean; dedupCount?: number } {
  const now = Date.now();
  const existing = dedupWindow.get(fingerprint);

  if (!existing || now - existing.lastSeen > DEDUP_WINDOW_MS) {
    dedupWindow.set(fingerprint, { count: 1, firstSeen: now, lastSeen: now });
    return { write: true };
  }

  existing.count++;
  existing.lastSeen = now;

  if (DEDUP_THRESHOLDS.includes(existing.count)) {
    return { write: true, dedupCount: existing.count };
  }

  return { write: false };
}

setInterval(() => {
  const now = Date.now();
  for (const [fp, entry] of dedupWindow) {
    if (now - entry.lastSeen > DEDUP_WINDOW_MS * 2) {
      dedupWindow.delete(fp);
    }
  }
}, 10 * 60 * 1000).unref();

// ── Category Validation ──

const VALID_PREFIXES = new Set([
  "system", "agent", "llm", "cortex", "orchestration",
  "build", "ws", "client", "action", "focus", "evolution",
  "discovery", "team-leader", "claude-code", "deep-research-build",
  "card-release", "action-api", "content-enrich", "error-rate-monitor",
  "wechat", "onboarding", "tunnel", "shell", "researcher",
  "data-source", "email", "mission", "task-router", "ui-gen",
  "circuit-breaker", "external",
]);

function validateCategory(category: string): void {
  const prefix = category.split(/[:\-]/)[0];
  if (prefix && !VALID_PREFIXES.has(prefix)) {
    console.warn(`[enso:action-log] Unknown category prefix "${prefix}" in "${category}".`);
  }
}

// ── Core Logging ──

export function logAction(entry: LogEntry): void {
  try {
    validateCategory(entry.category);
    ensureDir();
    const line = JSON.stringify(entry);
    appendFileSync(LOG_PATH, line + "\n");
    console.log(`[enso:${entry.category}] ${entry.message}`);
    rotateFile(LOG_PATH, MAX_LINES, KEEP_LINES);

    if (entry.type === "error") {
      try {
        appendFileSync(ERROR_LOG_PATH, line + "\n");
        rotateFile(ERROR_LOG_PATH, ERROR_MAX_LINES, ERROR_KEEP_LINES);
      } catch { /* best-effort */ }
    }
  } catch (err) {
    console.error(`[enso:action-log] write failed:`, err);
  }
}

export function logError(category: string, message: string, error?: unknown, extra?: Partial<LogEntry>): void {
  const err = error instanceof Error ? error : error != null ? new Error(String(error)) : undefined;
  const errStr = err?.message;
  const stack = truncateStack(err?.stack);
  const severity: ErrorSeverity = (extra?.severity as ErrorSeverity) ?? "error";
  const requestId = extra?.requestId ?? getRequestId();

  const isEnsoError = err && err.name === "EnsoError";
  const code = isEnsoError ? (err as any).code as string : extra?.code as string | undefined;

  const fp = errorFingerprint(category, message);
  const { write, dedupCount } = dedupGate(fp);

  if (write) {
    logAction({
      ts: Date.now(),
      type: "error",
      category,
      message: dedupCount ? `${message} (×${dedupCount} in 5min)` : message,
      error: errStr,
      stack,
      severity,
      code,
      fingerprint: fp,
      dedupCount,
      requestId,
      ...extra,
    });
  }

  errorRateMonitor.record(severity, category);

  const prefix = severity === "critical" ? "CRITICAL" : severity === "warning" ? "WARN" : severity === "info" ? "INFO" : "ERROR";
  const ridTag = requestId ? ` [${requestId}]` : "";
  if (errStr && write) console.error(`[${prefix}:${category}]${ridTag} ${message}: ${errStr}`);
}

// ── Standardized HTTP Error Response ──

function categoryToCode(category: string): string {
  return category.toUpperCase().replace(/-/g, "_") + "_ERROR";
}

export function errorResponse(
  res: Response,
  status: number,
  category: string,
  message: string,
  err?: unknown,
  severity?: ErrorSeverity,
): void {
  const requestId = getRequestId();
  const errMsg = err instanceof Error ? err.message : err != null ? String(err) : message;

  logError(category, message, err, { requestId, severity });

  res.status(status).json({
    error: {
      code: categoryToCode(category),
      message: errMsg,
      requestId,
      category,
    },
  } satisfies ErrorResponseBody);
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

function readLogFile(path: string): string[] {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function getRecentLog(count = 100, typeFilter?: string, source?: "all" | "errors"): LogEntry[] {
  const lines = readLogFile(source === "errors" ? ERROR_LOG_PATH : LOG_PATH);
  const entries: LogEntry[] = [];
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
}

// ── Error Summary ──

export interface ErrorSummary {
  period: { from: number; to: number };
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Array<{ category: string; count: number; lastSeen: number }>;
  recentErrors: LogEntry[];
}

export function getErrorSummary(hours = 24): ErrorSummary {
  const now = Date.now();
  const from = now - hours * 60 * 60 * 1000;
  const lines = readLogFile(ERROR_LOG_PATH);

  const bySeverity: Record<string, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  const categoryMap = new Map<string, { count: number; lastSeen: number }>();
  const filtered: LogEntry[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.ts < from) continue;
      filtered.push(entry);
      const sev = entry.severity ?? "error";
      bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
      const cat = categoryMap.get(entry.category);
      if (cat) {
        cat.count++;
        if (entry.ts > cat.lastSeen) cat.lastSeen = entry.ts;
      } else {
        categoryMap.set(entry.category, { count: 1, lastSeen: entry.ts });
      }
    } catch { /* skip */ }
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.count - a.count);

  return {
    period: { from, to: now },
    total: filtered.length,
    bySeverity,
    byCategory,
    recentErrors: filtered.slice(-10).reverse(),
  };
}
