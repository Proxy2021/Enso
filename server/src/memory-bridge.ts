/**
 * Memory Bridge — Enso's local memory and card persistence.
 *
 * Three responsibilities:
 *   1. Card History:     persist cards to disk, replay on reconnect
 *   2. Context Injection: feed Enso usage data into agent prompts
 *   3. Memory Surface:   Cortex wiki pages for user profile + memory (with flat-file fallback)
 *
 * Storage (primary — Cortex wiki):
 *   ~/.enso/wiki/synthesis/user-profile.md         — user profile (editable)
 *   ~/.enso/wiki/synthesis/conversation-memory.md   — accumulated conversation memory
 *
 * Storage (backward compat — old flat files):
 *   ~/.enso/memory/ENSO_USER.md        — user profile (written alongside Cortex)
 *   ~/.enso/memory/ENSO_MEMORY.md      — conversation memory (written alongside Cortex)
 *
 * Card journals:
 *   ~/.enso/cards/<clientId>/conversations.json — thread metadata (id, title, timestamps)
 *   ~/.enso/cards/<clientId>/<conversationId>.jsonl — per-thread card journal
 *
 * Cross-platform: uses os.homedir() + path.join() for Windows/macOS/Linux.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type { AgentStep, CardModeDetail } from "@shared/types";
import { APP_CATALOG } from "./app-catalog.js";

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
  // Summary & podcast (persisted so they survive page reload)
  cardSummary?: { overview: string; keyOutcomes: string[]; narrative: string };
  cardAudioUrl?: string;
  cardPodcastScript?: string;
  /** Cortex wiki page path (set when card is auto-persisted to Cortex) */
  cortexPath?: string;
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

const CONVERSATIONS_INDEX = "conversations.json";
/** Migrated legacy single-file journals use this thread id. */
export const DEFAULT_CONVERSATION_ID = "default";

function sanitizeClientDirSegment(clientId: string): string {
  return clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Only allow safe conversation ids (UUID, default, alphanumeric). */
export function isSafeConversationId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function clientCardsRoot(clientId: string): string {
  return join(CARDS_DIR, sanitizeClientDirSegment(clientId));
}

function conversationJournalPath(clientId: string, conversationId: string): string {
  return join(clientCardsRoot(clientId), `${conversationId}.jsonl`);
}

export interface ConversationContext {
  type: string;       // "focus", "project", "data-source", etc.
  sourceId: string;   // focusId, projectId, etc.
  label?: string;     // short display label, e.g. "Focus" or "Project"
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  context?: ConversationContext;
}

function readConversationsIndex(root: string): ConversationSummary[] {
  try {
    const p = join(root, CONVERSATIONS_INDEX);
    if (!existsSync(p)) return [];
    const raw = JSON.parse(readFileSync(p, "utf-8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (x): x is ConversationSummary =>
        x && typeof x === "object" && typeof (x as ConversationSummary).id === "string",
    ) as ConversationSummary[];
  } catch {
    return [];
  }
}

function writeConversationsIndex(root: string, list: ConversationSummary[]): void {
  writeFileSync(join(root, CONVERSATIONS_INDEX), JSON.stringify(list, null, 2), "utf-8");
}

/**
 * Ensure per-client folder + conversations index exist; migrate legacy flat `.jsonl` if present.
 */
export function ensureConversationLayout(clientId: string): string {
  ensureCardsDir();
  const safe = sanitizeClientDirSegment(clientId);
  const root = join(CARDS_DIR, safe);
  const legacyFlat = join(CARDS_DIR, `${safe}.jsonl`);

  if (!existsSync(root)) {
    if (existsSync(legacyFlat)) {
      mkdirSync(root, { recursive: true });
      renameSync(legacyFlat, join(root, `${DEFAULT_CONVERSATION_ID}.jsonl`));
      const now = Date.now();
      writeConversationsIndex(root, [
        { id: DEFAULT_CONVERSATION_ID, title: "Chat", createdAt: now, updatedAt: now },
      ]);
    } else {
      mkdirSync(root, { recursive: true });
      const now = Date.now();
      writeConversationsIndex(root, [
        { id: DEFAULT_CONVERSATION_ID, title: "New chat", createdAt: now, updatedAt: now },
      ]);
    }
  } else {
    const idxPath = join(root, CONVERSATIONS_INDEX);
    if (!existsSync(idxPath)) {
      const jsonlFiles = readdirSync(root).filter((f) => f.endsWith(".jsonl"));
      const now = Date.now();
      const rebuilt: ConversationSummary[] = jsonlFiles.map((f) => {
        const id = f.replace(/\.jsonl$/, "");
        return { id, title: "Chat", createdAt: now, updatedAt: now };
      });
      if (rebuilt.length === 0) {
        rebuilt.push({ id: DEFAULT_CONVERSATION_ID, title: "New chat", createdAt: now, updatedAt: now });
      }
      writeConversationsIndex(root, rebuilt);
    }
  }

  return root;
}

/** Sidebar titles we replace with the first user message (ChatGPT-style). */
const GENERIC_THREAD_TITLES = new Set(["new chat", "chat", ""]);

function readFirstUserBubbleText(clientId: string, conversationId: string): string | null {
  try {
    if (!isSafeConversationId(conversationId)) return null;
    ensureConversationLayout(clientId);
    const path = conversationJournalPath(clientId, conversationId);
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as CardRecord;
        if (r.role === "user" && typeof r.text === "string" && r.text.trim()) return r.text.trim();
      } catch {
        /* skip */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Derive a short sidebar title from the user's first message (ChatGPT-style).
 */
export function conversationTitleFromUserMessage(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!s) return "";
  let line = s.split("\n")[0]?.trim() ?? s;
  line = line.replace(/^#+\s*/, "").replace(/^\s*[-*•]\s+/, "").trim();
  if (!line) return "";
  if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) {
    line = line.slice(1, -1).trim();
  } else if (line.startsWith("\u201c") && line.endsWith("\u201d")) {
    line = line.slice(1, -1).trim();
  }
  if (!line) return "";
  const maxChars = 48;
  const chars = Array.from(line);
  if (chars.length <= maxChars) return line;
  let out = chars.slice(0, maxChars).join("");
  const lastSpace = out.lastIndexOf(" ");
  if (lastSpace > 24) out = out.slice(0, lastSpace).trimEnd();
  return `${out}…`;
}

export function listConversations(clientId: string): ConversationSummary[] {
  ensureConversationLayout(clientId);
  const root = clientCardsRoot(clientId);
  let list = readConversationsIndex(root);
  let changed = false;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!GENERIC_THREAD_TITLES.has(c.title.trim().toLowerCase())) continue;
    const first = readFirstUserBubbleText(clientId, c.id);
    if (!first) continue;
    const derived = conversationTitleFromUserMessage(first).trim();
    if (!derived || GENERIC_THREAD_TITLES.has(derived.toLowerCase())) continue;
    list[i] = { ...c, title: derived.slice(0, 200), updatedAt: Date.now() };
    changed = true;
  }
  if (changed) writeConversationsIndex(root, list);
  return readConversationsIndex(root).sort((a, b) => b.updatedAt - a.updatedAt);
}

function touchConversationUpdatedAt(clientId: string, conversationId: string): void {
  try {
    const root = clientCardsRoot(clientId);
    const list = readConversationsIndex(root);
    const now = Date.now();
    const idx = list.findIndex((c) => c.id === conversationId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], updatedAt: now };
    writeConversationsIndex(root, list);
  } catch {
    // best-effort
  }
}

export function createConversation(clientId: string, title?: string, context?: ConversationContext): ConversationSummary {
  ensureConversationLayout(clientId);
  const root = clientCardsRoot(clientId);
  const id = randomUUID();
  const now = Date.now();
  const entry: ConversationSummary = {
    id,
    title: (title?.trim() || "New chat").slice(0, 200),
    createdAt: now,
    updatedAt: now,
    ...(context ? { context } : {}),
  };
  const list = readConversationsIndex(root);
  list.push(entry);
  writeConversationsIndex(root, list);
  return entry;
}

/** Update a conversation's context metadata */
export function setConversationContext(clientId: string, conversationId: string, context: ConversationContext): boolean {
  ensureConversationLayout(clientId);
  const root = clientCardsRoot(clientId);
  const list = readConversationsIndex(root);
  const conv = list.find(c => c.id === conversationId);
  if (!conv) return false;
  conv.context = context;
  writeConversationsIndex(root, list);
  return true;
}

/** True if this thread's journal already has at least one persisted user message. */
export function conversationJournalHasUserMessage(clientId: string, conversationId: string): boolean {
  try {
    if (!isSafeConversationId(conversationId)) return false;
    ensureConversationLayout(clientId);
    const path = conversationJournalPath(clientId, conversationId);
    if (!existsSync(path)) return false;
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as { role?: string };
        if (r.role === "user") return true;
      } catch {
        /* skip */
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * If the thread still has a generic title, set it from the first user message.
 * Call only when this message is the first user turn in the journal (caller checks).
 */
export function maybeAutotitleConversation(clientId: string, conversationId: string, userMessageText: string): boolean {
  try {
    ensureConversationLayout(clientId);
    const root = clientCardsRoot(clientId);
    const list = readConversationsIndex(root);
    const idx = list.findIndex((c) => c.id === conversationId);
    if (idx < 0) return false;
    const cur = list[idx].title.trim();
    if (!GENERIC_THREAD_TITLES.has(cur.toLowerCase())) return false;
    const derived = conversationTitleFromUserMessage(userMessageText).trim();
    if (!derived || GENERIC_THREAD_TITLES.has(derived.toLowerCase())) return false;
    list[idx] = { ...list[idx], title: derived.slice(0, 200), updatedAt: Date.now() };
    writeConversationsIndex(root, list);
    return true;
  } catch {
    return false;
  }
}

export function renameConversation(clientId: string, conversationId: string, title: string): boolean {
  try {
    ensureConversationLayout(clientId);
    const root = clientCardsRoot(clientId);
    const list = readConversationsIndex(root);
    const idx = list.findIndex((c) => c.id === conversationId);
    if (idx < 0) return false;
    list[idx] = { ...list[idx], title: title.trim().slice(0, 200) || "Chat", updatedAt: Date.now() };
    writeConversationsIndex(root, list);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete one conversation journal. If it was the last thread, creates a fresh empty default.
 */
export function deleteConversation(clientId: string, conversationId: string): boolean {
  try {
    ensureConversationLayout(clientId);
    const root = clientCardsRoot(clientId);
    let list = readConversationsIndex(root);
    list = list.filter((c) => c.id !== conversationId);
    const journal = join(root, `${conversationId}.jsonl`);
    if (existsSync(journal)) unlinkSync(journal);

    if (list.length === 0) {
      const now = Date.now();
      list = [{ id: DEFAULT_CONVERSATION_ID, title: "New chat", createdAt: now, updatedAt: now }];
    }
    writeConversationsIndex(root, list);
    return true;
  } catch {
    return false;
  }
}

/** Remove all threads and journals for a client; recreate a single empty default chat. */
export function clearCardHistory(clientId: string): boolean {
  try {
    const safe = sanitizeClientDirSegment(clientId);
    const root = join(CARDS_DIR, safe);
    const legacyFlat = join(CARDS_DIR, `${safe}.jsonl`);
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true });
    }
    if (existsSync(legacyFlat)) {
      unlinkSync(legacyFlat);
    }
    ensureConversationLayout(clientId);
    return true;
  } catch {
    return false;
  }
}

// ── Part 1: Card History ──

/**
 * Append a card record to a conversation journal.
 * If the card ID already exists (enhance update), replace the existing entry.
 */
export function persistCard(clientId: string, conversationId: string, record: CardRecord): void {
  try {
    if (!isSafeConversationId(conversationId)) return;
    ensureConversationLayout(clientId);
    const path = conversationJournalPath(clientId, conversationId);

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
        const existing = JSON.parse(lines[existingIdx]) as CardRecord;
        const merged: CardRecord = { ...existing, ...record, timestamp: record.timestamp || existing.timestamp };
        lines[existingIdx] = JSON.stringify(merged);
        writeFileSync(path, lines.join("\n") + "\n");
        touchConversationUpdatedAt(clientId, conversationId);
        return;
      }
    }

    appendFileSync(path, JSON.stringify(record) + "\n");
    rotateJournal(path);
    touchConversationUpdatedAt(clientId, conversationId);

    // Auto-persist app cards to Cortex (fire-and-forget)
    try {
      const { writeCortexPageFromCard } = require("./card-to-cortex.js") as { writeCortexPageFromCard: (r: CardRecord) => string | null };
      const cortexPath = writeCortexPageFromCard(record);
      if (cortexPath) {
        // Store the cortex path back on the record for future reference
        record.cortexPath = cortexPath;
        // Re-write the line with cortexPath added
        const content = readFileSync(path, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const idx = lines.findIndex((l) => { try { return JSON.parse(l).id === record.id; } catch { return false; } });
        if (idx >= 0) {
          lines[idx] = JSON.stringify(record);
          writeFileSync(path, lines.join("\n") + "\n");
        }
      }
    } catch { /* card-to-cortex not available — skip */ }
  } catch {
    // Never let history persistence break the main flow
  }
}

/**
 * Load recent cards for a conversation. Returns entries in chronological order.
 */
export function loadCardHistory(clientId: string, conversationId: string, count: number): CardRecord[] {
  try {
    if (!isSafeConversationId(conversationId)) return [];
    ensureConversationLayout(clientId);
    const path = conversationJournalPath(clientId, conversationId);
    if (!existsSync(path)) return [];

    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const records: CardRecord[] = [];
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

    for (const name of readdirSync(CARDS_DIR)) {
      const filePath = join(CARDS_DIR, name);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(filePath);
      } catch {
        continue;
      }
      if (stat.isFile() && name.endsWith(".jsonl")) {
        if (now - stat.mtimeMs > cutoff) unlinkSync(filePath);
        continue;
      }
      if (!stat.isDirectory()) continue;
      for (const j of readdirSync(filePath)) {
        if (!j.endsWith(".jsonl")) continue;
        const jp = join(filePath, j);
        try {
          const st = statSync(jp);
          if (now - st.mtimeMs > cutoff) unlinkSync(jp);
        } catch {
          // skip
        }
      }
    }
  } catch {
    // Best-effort pruning
  }
}

// ── Part 2: Context Injection ──

let cachedContext: { text: string; timestamp: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

/** Topic hint — set before agent dispatch so buildEnsoContext can inject relevant entities */
let _topicHint: string | null = null;

/**
 * Set the current user message as a topic hint for Cortex-aware context injection.
 * Invalidates the context cache so the next buildEnsoContext() call includes
 * topic-relevant entities from the user's knowledge base.
 */
export function setTopicHint(message: string): void {
  _topicHint = message;
  cachedContext = null; // force rebuild with topic context
}

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

  // 1. Read user profile from Cortex (falls back to old flat file)
  const userProfile = readCortexPage(CORTEX_USER_PROFILE) ?? safeReadFile(join(MEMORY_DIR, USER_FILE));
  if (userProfile) {
    sections.push(`<user_profile>\n${userProfile.slice(0, 1000)}\n</user_profile>`);
  }

  // 2. Read conversation memory from Cortex (falls back to old flat file)
  const memory = readCortexPage(CORTEX_CONVERSATION_MEMORY) ?? safeReadFile(join(MEMORY_DIR, MEMORY_FILE));
  if (memory) {
    // Take the last 1500 chars (most recent entries)
    const recent = memory.length > 1500 ? memory.slice(-1500) : memory;
    sections.push(`<memory>\n${recent}\n</memory>`);
  }

  // 3. Cortex knowledge summary (entities, concepts, sources)
  try {
    const { getCortexContextSummary } = await import("./cortex-tools.js");
    const cortex = getCortexContextSummary(2000);
    if (cortex) sections.push(cortex);
  } catch { /* cortex not available */ }

  // 3.5 Topic-relevant Cortex entities (injected per-message via setTopicHint)
  if (_topicHint && _topicHint.length > 3) {
    try {
      const { findRelatedContent } = await import("./cortex-synthesis.js");
      const { getEntityIndex } = await import("./entity-model.js");
      const related = findRelatedContent(_topicHint, 3);
      const topicHintConsumed = _topicHint;
      _topicHint = null; // consume once

      if (related.totalMatches > 0) {
        const entityIndex = getEntityIndex();
        const lines: string[] = [];
        // Include top hits from data sources
        const topHits = related.hits.slice(0, 8);
        for (const hit of topHits) {
          let extra = "";
          // Enrich with entity index data (semantic tags, cross-refs)
          for (const [, entry] of entityIndex) {
            if (entry.title === hit.title && entry.source === hit.source) {
              if (entry.semanticTags?.length) extra += ` themes:[${entry.semanticTags.join(",")}]`;
              if (entry.crossReferences?.length) extra += ` cross-refs:${entry.crossReferences.length}`;
              break;
            }
          }
          lines.push(`- "${hit.title}" [${hit.source}]${extra}`);
        }
        // Include matching Cortex wiki pages
        for (const page of related.cortexPages.slice(0, 3)) {
          lines.push(`- wiki: "${page.title}" [${page.path}]`);
        }
        if (lines.length > 0) {
          sections.push(`<topic_relevant_knowledge>\nThe user is asking about "${topicHintConsumed.slice(0, 80)}". Related items in their personal knowledge base:\n${lines.join("\n")}\nLeverage this knowledge — reference what the user already knows. Use enso_cortex_synthesize(topic) for deep cross-source analysis.\n</topic_relevant_knowledge>`);
        }
      } else {
        _topicHint = null;
      }
    } catch {
      _topicHint = null;
    }
  }

  // 3.7 Focus areas — user's active priorities
  try {
    const { getFocusContextForAgent } = await import("./focus-areas.js");
    const focusCtx = getFocusContextForAgent(_topicHint ?? undefined);
    if (focusCtx) sections.push(focusCtx);
  } catch { /* focus areas not available */ }

  // 4. Data source inventory — compact summary of what the user has across all sources
  try {
    const { readCache } = await import("./data-source-registry.js");
    const inventory: string[] = [];
    const kindle = readCache("kindle-library.json") as { totalBooks?: number } | null;
    if (kindle?.totalBooks) inventory.push(`📚 ${kindle.totalBooks} Kindle books`);
    const yt = readCache("youtube-data.json") as { totalSubscriptions?: number } | null;
    if (yt?.totalSubscriptions) inventory.push(`📺 ${yt.totalSubscriptions} YouTube subs`);
    const movies = readCache("movies-tv.json") as { totalItems?: number } | null;
    if (movies?.totalItems) inventory.push(`🎬 ${movies.totalItems} movies/TV`);
    const steam = readCache("steam-games.json") as { totalGames?: number } | null;
    if (steam?.totalGames) inventory.push(`🎮 ${steam.totalGames} Steam games`);
    const photos = readCache("photo-library.json") as { totalPhotos?: number; totalAlbums?: number } | null;
    if (photos?.totalPhotos) inventory.push(`📷 ${photos.totalPhotos} photos (${photos.totalAlbums} albums)`);
    const projects = readCache("file-index.json") as { projects?: unknown[] } | null;
    if (projects?.projects?.length) inventory.push(`💻 ${projects.projects.length} projects`);
    if (inventory.length > 0) {
      sections.push(`<data_sources>\nUser's digital life: ${inventory.join(", ")}.\nUse enso_cross_reference(topic) to semantically search ALL sources at once and synthesize connections. Use enso_wiki_search(query, source, theme) for targeted wiki retrieval.\n</data_sources>`);
    }
  } catch { /* data sources not available */ }

  // 5. Proactive suggestions
  try {
    const { getTopSuggestions } = await import("./proactive-engine.js");
    const suggestions = await getTopSuggestions(5);
    if (suggestions.length > 0) {
      const lines = suggestions.map(s => `- ${s.title}: ${s.description}`);
      sections.push(`<proactive_insights>\n${lines.join("\n")}\n</proactive_insights>`);
    }
  } catch { /* proactive not available */ }

  // 5. Available apps
  const apps = buildAvailableAppsSummary();
  if (apps) sections.push(apps);

  if (sections.length === 0) return "";

  const text = `<enso_context>\n${sections.join("\n\n")}\n</enso_context>`;
  cachedContext = { text, timestamp: Date.now() };
  return text;
}

/**
 * Get topic-relevant Cortex context for standalone agent mode.
 * Reads and consumes the topic hint set by setTopicHint().
 * Returns a formatted context block or empty string.
 */
export async function getTopicRelevantCortex(): Promise<string> {
  if (!_topicHint || _topicHint.length <= 3) {
    _topicHint = null;
    return "";
  }

  try {
    const { findRelatedContent } = await import("./cortex-synthesis.js");
    const { getEntityIndex } = await import("./entity-model.js");

    const topicText = _topicHint;
    _topicHint = null; // consume

    const related = findRelatedContent(topicText, 3);
    if (related.totalMatches === 0) return "";

    const entityIndex = getEntityIndex();
    const lines: string[] = [];

    const topHits = related.hits.slice(0, 8);
    for (const hit of topHits) {
      let extra = "";
      for (const [, entry] of entityIndex) {
        if (entry.title === hit.title && entry.source === hit.source) {
          if (entry.semanticTags?.length) extra += ` themes:[${entry.semanticTags.join(",")}]`;
          if (entry.crossReferences?.length) extra += ` cross-refs:${entry.crossReferences.length}`;
          break;
        }
      }
      lines.push(`- "${hit.title}" [${hit.source}]${extra}`);
    }
    for (const page of related.cortexPages.slice(0, 3)) {
      lines.push(`- wiki: "${page.title}" [${page.path}]`);
    }

    if (lines.length === 0) return "";

    return `\n\n## Topic-Relevant Knowledge\nThe user is asking about "${topicText.slice(0, 80)}". Related items in their knowledge base:\n${lines.join("\n")}\nLeverage this — reference what the user already knows. Use enso_cortex_synthesize(topic) for deep cross-source analysis.`;
  } catch {
    _topicHint = null;
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

// ── Part 3: Enso Memory (local, independent of OpenClaw workspace) ──

const MEMORY_DIR = join(homedir(), ".enso", "memory");
const DAILY_DIR = join(MEMORY_DIR, "daily");
const USER_FILE = "ENSO_USER.md";
const MEMORY_FILE = "ENSO_MEMORY.md";

// ── Cortex paths (primary storage) ──
const CORTEX_DIR = join(homedir(), ".enso", "wiki");
const CORTEX_USER_PROFILE = "synthesis/user-profile.md";
const CORTEX_CONVERSATION_MEMORY = "synthesis/conversation-memory.md";

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

/** Read a page from the Cortex by relative path. */
function readCortexPage(pagePath: string): string | null {
  try {
    const fullPath = join(CORTEX_DIR, pagePath);
    if (existsSync(fullPath)) return readFileSync(fullPath, "utf-8");
  } catch { /* ignore */ }
  return null;
}

/** Write a page to the Cortex, ensuring directory exists. */
function writeCortexPage(pagePath: string, content: string): void {
  const fullPath = join(CORTEX_DIR, pagePath);
  const dir = join(fullPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

/** Update the Cortex _index.md with an entry for a page. */
function updateCortexIndex(pagePath: string, title: string, summary: string): void {
  try {
    const indexPath = join(CORTEX_DIR, "_index.md");
    const existing = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "<!-- WIKI INDEX — machine-maintained, do not hand-edit -->\n";
    const ts = new Date().toISOString();
    const entryBlock = `## ${pagePath}\n**${title}** — ${summary}.\nUpdated: ${ts}\n`;

    // Replace existing entry or append
    const entryPattern = new RegExp(`## ${pagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?(?=\\n## |$)`);
    if (entryPattern.test(existing)) {
      writeFileSync(indexPath, existing.replace(entryPattern, entryBlock), "utf-8");
    } else {
      writeFileSync(indexPath, existing.trimEnd() + "\n\n" + entryBlock, "utf-8");
    }
  } catch { /* best-effort index update */ }
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

/** Read Enso's user profile and memory. Cortex is primary, falls back to old flat files. */
export function readEnsoMemory(): { user: string | null; memory: string | null } {
  ensureMemoryDir();
  const user = readCortexPage(CORTEX_USER_PROFILE) ?? safeReadFile(join(MEMORY_DIR, USER_FILE));
  const memory = readCortexPage(CORTEX_CONVERSATION_MEMORY) ?? safeReadFile(join(MEMORY_DIR, MEMORY_FILE));
  return { user, memory };
}

/** Write user profile. Primary: Cortex. Also writes to old path for backward compat. */
export function writeEnsoUser(content: string): boolean {
  try {
    // Primary: Cortex
    writeCortexPage(CORTEX_USER_PROFILE, content);
    updateCortexIndex(CORTEX_USER_PROFILE, "User Profile", "Enso user identity, preferences, and personalization data");
    // Backward compat: old flat file
    ensureMemoryDir();
    writeFileSync(join(MEMORY_DIR, USER_FILE), content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Write conversation memory. Primary: Cortex. Also writes to old path for backward compat. */
export function writeEnsoMemory(content: string): boolean {
  try {
    // Primary: Cortex
    writeCortexPage(CORTEX_CONVERSATION_MEMORY, content);
    updateCortexIndex(CORTEX_CONVERSATION_MEMORY, "Conversation Memory", "Accumulated cross-conversation memory and learned facts");
    // Backward compat: old flat file
    ensureMemoryDir();
    writeFileSync(join(MEMORY_DIR, MEMORY_FILE), content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Append a new entry to conversation memory with a timestamp header. Writes to Cortex + old path. */
export function appendEnsoMemory(entry: string): boolean {
  try {
    const date = new Date().toISOString().slice(0, 10);

    // Read from Cortex first, fall back to old file
    const existing = readCortexPage(CORTEX_CONVERSATION_MEMORY)
      ?? safeReadFile(join(MEMORY_DIR, MEMORY_FILE))
      ?? "";

    const newContent = existing
      ? `${existing.trimEnd()}\n\n## ${date}\n${entry.trim()}\n`
      : `# Enso Memory\n\n## ${date}\n${entry.trim()}\n`;

    // Primary: Cortex
    writeCortexPage(CORTEX_CONVERSATION_MEMORY, newContent);
    updateCortexIndex(CORTEX_CONVERSATION_MEMORY, "Conversation Memory", "Accumulated cross-conversation memory and learned facts");

    // Backward compat: old flat file
    ensureMemoryDir();
    writeFileSync(join(MEMORY_DIR, MEMORY_FILE), newContent, "utf-8");
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
 * Search across all memory files and Cortex pages
 * using keyword matching. Returns ranked snippets.
 */
export function searchMemory(query: string, maxResults = 5): MemorySearchResult[] {
  const results: MemorySearchResult[] = [];
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return [];

  // Collect all searchable files
  const files: Array<{ name: string; content: string }> = [];

  // Cortex pages (primary)
  const cortexProfile = readCortexPage(CORTEX_USER_PROFILE);
  if (cortexProfile) files.push({ name: "cortex/user-profile.md", content: cortexProfile });

  const cortexMemory = readCortexPage(CORTEX_CONVERSATION_MEMORY);
  if (cortexMemory) files.push({ name: "cortex/conversation-memory.md", content: cortexMemory });

  // Scan other Cortex pages (entities, concepts, synthesis, sources)
  try {
    const WIKI_SUBDIRS = ["entities", "concepts", "synthesis", "sources"];
    for (const sub of WIKI_SUBDIRS) {
      const subDir = join(CORTEX_DIR, sub);
      if (!existsSync(subDir)) continue;
      for (const f of readdirSync(subDir)) {
        if (!f.endsWith(".md")) continue;
        // Skip pages we already added above
        if (sub === "synthesis" && (f === "user-profile.md" || f === "conversation-memory.md")) continue;
        const content = safeReadFile(join(subDir, f));
        if (content) files.push({ name: `cortex/${sub}/${f}`, content });
      }
    }
  } catch { /* best-effort cortex scan */ }

  // Legacy flat memory files (fallback / additional content)
  const memContent = safeReadFile(join(MEMORY_DIR, MEMORY_FILE));
  if (memContent && !cortexMemory) files.push({ name: "ENSO_MEMORY.md", content: memContent });

  const userContent = safeReadFile(join(MEMORY_DIR, USER_FILE));
  if (userContent && !cortexProfile) files.push({ name: "ENSO_USER.md", content: userContent });

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

const MAX_USER_CHARS = 1000;

/**
 * Returns only the user profile context (no cross-conversation memory).
 * Reads from Cortex first, falls back to old flat file.
 * Use this in system prompts for chat agents to avoid context contamination
 * where the LLM hallucinates prior interactions based on memory from other conversations.
 * Cross-conversation memory should only be accessed on-demand via memory search tools.
 */
export function getUserProfileContext(): string {
  const user = readCortexPage(CORTEX_USER_PROFILE) ?? safeReadFile(join(MEMORY_DIR, USER_FILE));
  if (!user) return "";

  const trimmed = user.length > MAX_USER_CHARS
    ? user.slice(0, MAX_USER_CHARS) + "\n... (truncated)"
    : user;
  return `<user_profile>\n${trimmed}\n</user_profile>`;
}

/**
 * Find a card record by id, preferring the active conversation then scanning other threads.
 */
export function findCardRecordForClient(
  clientId: string,
  cardId: string,
  preferredConversationId?: string,
): CardRecord | null {
  if (preferredConversationId && isSafeConversationId(preferredConversationId)) {
    const hit = loadCardHistory(clientId, preferredConversationId, 500).find((r) => r.id === cardId);
    if (hit) return hit;
  }
  ensureConversationLayout(clientId);
  for (const c of listConversations(clientId)) {
    const hit = loadCardHistory(clientId, c.id, 500).find((r) => r.id === cardId);
    if (hit) return hit;
  }
  return null;
}

// ── Part 4: Recent Conversation Topics ──

interface RecentTopic {
  topic: string;
  lastMessage: string;
  timestamp: number;
  cardId: string;
}

/**
 * Extract recent conversation topics from one thread's card history.
 * Groups cards into "sessions" (gap > 30 min = new session).
 * Returns the most recent `count` topics for display on WelcomeCard.
 */
export function getRecentConversationTopics(clientId: string, conversationId: string, count = 5): RecentTopic[] {
  const records = loadCardHistory(clientId, conversationId, 100);
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
