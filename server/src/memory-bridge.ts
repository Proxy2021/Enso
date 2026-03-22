/**
 * Memory Bridge — Enso's local memory and card persistence.
 *
 * Three responsibilities:
 *   1. Card History:     persist cards to disk, replay on reconnect
 *   2. Context Injection: feed Enso usage data into agent prompts
 *   3. Memory Surface:   local ENSO_USER.md + ENSO_MEMORY.md for personalization
 *
 * Storage:
 *   ~/.enso/cards/<clientId>.jsonl     — card history journals
 *   ~/.enso/memory/ENSO_USER.md        — user profile (editable)
 *   ~/.enso/memory/ENSO_MEMORY.md      — accumulated conversation memory
 *
 * Cross-platform: uses os.homedir() + path.join() for Windows/macOS/Linux.
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

/**
 * Resolve the correct card type from a CardRecord's fields.
 * Mirrors the logic in src/cards/index.ts registry matching.
 */
export function resolveCardType(record: Partial<CardRecord>): string {
  if (record.toolMeta?.toolId === "shell") return "shell";
  if (record.toolMeta?.toolId === "claude-code") return "terminal";
  if (record.generatedUI) return "dynamic-ui";
  if (record.role === "user") return "user-bubble";
  return "chat";
}

// ── Paths ──

const ENSO_HOME = join(homedir(), ".enso");
const CARDS_DIR = join(ENSO_HOME, "cards");
const OLD_CARDS_DIR = join(homedir(), ".openclaw", "enso-cards"); // legacy location

const MAX_ENTRIES = 200;
const KEEP_ENTRIES = 150;
const STALE_DAYS = 30;

function ensureCardsDir(): void {
  if (!existsSync(CARDS_DIR)) {
    mkdirSync(CARDS_DIR, { recursive: true });
  }
}

/**
 * Migrate card journals from ~/.openclaw/enso-cards/ to ~/.enso/cards/.
 * Call once on server startup. Safe to call multiple times (no-op if already migrated).
 */
export function migrateCardJournals(): void {
  try {
    if (!existsSync(OLD_CARDS_DIR)) return;
    ensureCardsDir();
    for (const file of readdirSync(OLD_CARDS_DIR)) {
      if (!file.endsWith(".jsonl")) continue;
      const oldPath = join(OLD_CARDS_DIR, file);
      const newPath = join(CARDS_DIR, file);
      if (!existsSync(newPath)) {
        writeFileSync(newPath, readFileSync(oldPath));
      }
    }
  } catch {
    // Best-effort migration
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

/**
 * Clear all card history for a client.
 * Deletes the JSONL journal file.
 */
export function clearCardHistory(clientId: string): boolean {
  try {
    const path = journalPath(clientId);
    if (existsSync(path)) {
      unlinkSync(path);
    }
    return true;
  } catch {
    return false;
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

/** Invalidate the context cache so the next prompt picks up new memory. */
export function invalidateContextCache(): void {
  cachedContext = null;
}

/**
 * Build a compact Enso context block for injection into the agent prompt.
 * Cached for CACHE_TTL to avoid recomputing on every turn.
 */
export async function buildEnsoContext(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.timestamp < CACHE_TTL) {
    return cachedContext.text;
  }

  const sections: string[] = [];

  // Include user profile + memory
  const memCtx = getMemoryContext();
  if (memCtx) sections.push(memCtx);

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

// ── Part 3: Enso Memory (local, independent of OpenClaw workspace) ──

const MEMORY_DIR = join(homedir(), ".enso", "memory");
const DAILY_DIR = join(MEMORY_DIR, "daily");
const USER_FILE = "ENSO_USER.md";
const MEMORY_FILE = "ENSO_MEMORY.md";

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function ensureDailyDir(): void {
  if (!existsSync(DAILY_DIR)) {
    mkdirSync(DAILY_DIR, { recursive: true });
  }
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

/** Read Enso's local ENSO_USER.md and ENSO_MEMORY.md. */
export function readEnsoMemory(): { user: string | null; memory: string | null } {
  ensureMemoryDir();
  return {
    user: safeReadFile(join(MEMORY_DIR, USER_FILE)),
    memory: safeReadFile(join(MEMORY_DIR, MEMORY_FILE)),
  };
}

/** Write ENSO_USER.md content. */
export function writeEnsoUser(content: string): boolean {
  try {
    ensureMemoryDir();
    writeFileSync(join(MEMORY_DIR, USER_FILE), content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Write ENSO_MEMORY.md content. */
export function writeEnsoMemory(content: string): boolean {
  try {
    ensureMemoryDir();
    writeFileSync(join(MEMORY_DIR, MEMORY_FILE), content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Append a new entry to ENSO_MEMORY.md with a timestamp header. */
export function appendEnsoMemory(entry: string): boolean {
  try {
    ensureMemoryDir();
    const filePath = join(MEMORY_DIR, MEMORY_FILE);
    const existing = safeReadFile(filePath) ?? "";
    const date = new Date().toISOString().slice(0, 10);
    const newContent = existing
      ? `${existing.trimEnd()}\n\n## ${date}\n${entry.trim()}\n`
      : `# Enso Memory\n\n## ${date}\n${entry.trim()}\n`;
    writeFileSync(filePath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ── Daily Memory Logs ──

/** Get today's date as YYYY-MM-DD. */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Append an entry to today's daily memory log. */
export function appendDailyMemory(entry: string): boolean {
  try {
    ensureDailyDir();
    const filePath = join(DAILY_DIR, `${todayDate()}.md`);
    const existing = safeReadFile(filePath) ?? "";
    const time = new Date().toTimeString().slice(0, 5);
    const line = `- [${time}] ${entry.trim()}`;
    const newContent = existing
      ? `${existing.trimEnd()}\n${line}\n`
      : `# ${todayDate()}\n\n${line}\n`;
    writeFileSync(filePath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Read recent daily logs (last N days). Returns concatenated content. */
export function readRecentDailyLogs(days = 3): string {
  try {
    ensureDailyDir();
    const files = readdirSync(DAILY_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .slice(-days);
    if (files.length === 0) return "";
    return files
      .map((f) => safeReadFile(join(DAILY_DIR, f)) ?? "")
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return "";
  }
}

/** List all daily log files with paths. */
export function listDailyLogFiles(): Array<{ name: string; path: string; size: number }> {
  try {
    ensureDailyDir();
    return readdirSync(DAILY_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => {
        const p = join(DAILY_DIR, f);
        const s = statSync(p);
        return { name: f, path: p, size: s.size };
      });
  } catch {
    return [];
  }
}

// ── Memory Search & Get (agent-driven recall) ──

interface MemorySearchResult {
  file: string;
  snippet: string;
  score: number;
}

/**
 * Search across all memory files (MEMORY.md, ENSO_USER.md, daily logs)
 * using keyword matching. Returns ranked snippets.
 */
export function searchMemory(query: string, maxResults = 5): MemorySearchResult[] {
  const results: MemorySearchResult[] = [];
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return [];

  // Collect all memory files
  const files: Array<{ name: string; content: string }> = [];

  const memContent = safeReadFile(join(MEMORY_DIR, MEMORY_FILE));
  if (memContent) files.push({ name: "ENSO_MEMORY.md", content: memContent });

  const userContent = safeReadFile(join(MEMORY_DIR, USER_FILE));
  if (userContent) files.push({ name: "ENSO_USER.md", content: userContent });

  // Add daily logs
  for (const f of listDailyLogFiles()) {
    const content = safeReadFile(f.path);
    if (content) files.push({ name: `daily/${f.name}`, content });
  }

  // Search each file by paragraphs/sections
  for (const file of files) {
    const sections = file.content.split(/\n(?=##?\s|\n- )/).filter((s) => s.trim().length > 10);
    for (const section of sections) {
      const sectionLower = section.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (sectionLower.includes(term)) {
          score += 1;
          // Boost exact phrase matches
          if (sectionLower.includes(query.toLowerCase())) score += 2;
        }
      }
      if (score > 0) {
        results.push({
          file: file.name,
          snippet: section.trim().slice(0, 300),
          score: score / queryTerms.length,
        });
      }
    }
  }

  // Sort by score descending, take top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

/**
 * Read a specific memory file by name. Supports line range.
 */
export function getMemoryFile(fileName: string, fromLine?: number, lineCount?: number): string | null {
  // Resolve path safely — only allow files within memory dir
  let filePath: string;
  if (fileName.startsWith("daily/")) {
    filePath = join(DAILY_DIR, fileName.slice(6));
  } else {
    filePath = join(MEMORY_DIR, fileName);
  }

  // Security: ensure resolved path is within memory dir
  const resolved = join(filePath);
  if (!resolved.startsWith(MEMORY_DIR)) return null;

  const content = safeReadFile(resolved);
  if (!content) return null;

  if (fromLine !== undefined || lineCount !== undefined) {
    const lines = content.split("\n");
    const start = Math.max(0, (fromLine ?? 1) - 1);
    const count = lineCount ?? lines.length;
    return lines.slice(start, start + count).join("\n");
  }

  return content;
}

/** List all memory files available for search/read. */
export function listMemoryFiles(): Array<{ name: string; size: number }> {
  const files: Array<{ name: string; size: number }> = [];
  try {
    ensureMemoryDir();
    // Main memory files
    for (const name of [MEMORY_FILE, USER_FILE]) {
      const p = join(MEMORY_DIR, name);
      if (existsSync(p)) {
        files.push({ name, size: statSync(p).size });
      }
    }
    // Daily logs
    for (const f of listDailyLogFiles()) {
      files.push({ name: `daily/${f.name}`, size: f.size });
    }
  } catch { /* best effort */ }
  return files;
}

/**
 * Build a compact memory context block for injection into LLM prompts.
 * Includes user profile and recent memory entries (truncated to budget).
 */
const MAX_MEMORY_CHARS = 2000;
const MAX_USER_CHARS = 1000;

export function getMemoryContext(): string {
  const { user, memory } = readEnsoMemory();
  if (!user && !memory) return "";

  const sections: string[] = [];

  if (user) {
    const trimmed = user.length > MAX_USER_CHARS
      ? user.slice(0, MAX_USER_CHARS) + "\n... (truncated)"
      : user;
    sections.push(`<user_profile>\n${trimmed}\n</user_profile>`);
  }

  if (memory) {
    const trimmed = memory.length > MAX_MEMORY_CHARS
      ? memory.slice(memory.length - MAX_MEMORY_CHARS) // Keep most recent entries
      : memory;
    sections.push(`<memory>\n${trimmed}\n</memory>`);
  }

  return sections.join("\n");
}

// ── Part 4: Recent Conversation Topics ──

interface RecentTopic {
  topic: string;
  lastMessage: string;
  timestamp: number;
  cardId: string;
}

/**
 * Extract recent conversation topics from card history.
 * Groups cards into "conversations" (gap > 30 min = new conversation).
 * Returns the most recent `count` topics for display on WelcomeCard.
 */
export function getRecentConversationTopics(clientId: string, count = 5): RecentTopic[] {
  const records = loadCardHistory(clientId, 100);
  if (records.length === 0) return [];

  // Group into conversations (gap > 30 min = new conversation)
  const GAP_MS = 30 * 60 * 1000;
  const conversations: CardRecord[][] = [];
  let currentGroup: CardRecord[] = [];

  for (const rec of records) {
    if (currentGroup.length > 0) {
      const lastTs = currentGroup[currentGroup.length - 1].timestamp;
      if (rec.timestamp - lastTs > GAP_MS) {
        conversations.push(currentGroup);
        currentGroup = [];
      }
    }
    currentGroup.push(rec);
  }
  if (currentGroup.length > 0) conversations.push(currentGroup);

  // Extract topic from each conversation
  const topics: RecentTopic[] = [];
  const seen = new Set<string>();

  // Process most recent first
  for (let i = conversations.length - 1; i >= 0 && topics.length < count; i--) {
    const conv = conversations[i];
    const userMessages = conv.filter((r) => r.role === "user" && r.text);
    if (userMessages.length === 0) continue;

    const firstUserMsg = userMessages[0].text!;
    const lastUserMsg = userMessages[userMessages.length - 1].text!;

    // Topic = first user message, truncated
    const topic = firstUserMsg.length > 60 ? firstUserMsg.slice(0, 57) + "..." : firstUserMsg;

    // Deduplicate by first 30 chars
    const dedupeKey = topic.slice(0, 30).toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    topics.push({
      topic,
      lastMessage: lastUserMsg,
      timestamp: conv[conv.length - 1].timestamp,
      cardId: conv[0].id,
    });
  }

  return topics;
}

// ── Legacy compatibility (OpenClaw workspace hooks) ──

let workspaceDir: string | null = null;

export function setWorkspaceDir(dir: string): void {
  if (!workspaceDir && dir) workspaceDir = dir;
}
