/**
 * card-persistence.ts — Disk persistence for CardContext.
 *
 * Cards are serialized to ~/.enso/cards/<cardId>.json so they survive
 * server restarts. Writes are debounced (500ms) to avoid thrashing
 * on rapid action sequences. Cards older than 7 days auto-expire on load.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logAction, logError } from "../action-log.js";
import type { CardContext } from "./card-context.js";

// ── Constants ──

const CARDS_DIR = join(homedir(), ".enso", "cards");
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEBOUNCE_MS = 500;

// ── Serializable card record ──

/** Fields persisted to disk — strips functions, circular refs, and non-serializable account data. */
interface PersistedCardRecord {
  cardId: string;
  originalPrompt: string;
  originalResponse: string;
  currentData: unknown;
  mode: "im" | "ui" | "full";
  actionHistory: Array<{ action: string; payload: unknown; timestamp: number }>;
  appToolHint?: {
    toolName: string;
    params: Record<string, unknown>;
    handlerPrefix: string;
  };
  interactionMode: "llm" | "tool";
  toolFamily?: string;
  signatureId?: string;
  coverageStatus?: "covered" | "partial";
  allowedRoot?: string;
  navStack?: Array<{ data: unknown; generatedUI?: string; title: string; focusEntity?: string }>;
  currentGeneratedUI?: string;
  /** ISO timestamp of when this record was persisted */
  persistedAt: string;
  /** Account ID for reconstruction */
  accountId: string;
}

// ── Debounce timers ──

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

// ── Ensure directory ──

function ensureCardsDir(): void {
  if (!existsSync(CARDS_DIR)) {
    mkdirSync(CARDS_DIR, { recursive: true });
  }
}

// ── Public API ──

/**
 * Persist a card context to disk. Writes are debounced — multiple calls
 * within 500ms for the same cardId coalesce into a single write.
 */
export function persistCardContext(cardId: string, ctx: CardContext): void {
  // Cancel any pending write for this card
  const existing = pendingWrites.get(cardId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingWrites.delete(cardId);
    try {
      ensureCardsDir();
      const record: PersistedCardRecord = {
        cardId: ctx.cardId,
        originalPrompt: ctx.originalPrompt,
        originalResponse: ctx.originalResponse,
        currentData: ctx.currentData,
        mode: ctx.mode,
        actionHistory: ctx.actionHistory,
        appToolHint: ctx.appToolHint,
        interactionMode: ctx.interactionMode,
        toolFamily: ctx.toolFamily,
        signatureId: ctx.signatureId,
        coverageStatus: ctx.coverageStatus,
        allowedRoot: ctx.allowedRoot,
        navStack: ctx.navStack,
        currentGeneratedUI: ctx.currentGeneratedUI,
        persistedAt: new Date().toISOString(),
        accountId: ctx.account.accountId,
      };
      const filePath = join(CARDS_DIR, `${cardId}.json`);
      writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
    } catch (err) {
      logError("card-persistence", `Failed to persist card ${cardId}`, err);
    }
  }, DEBOUNCE_MS);

  pendingWrites.set(cardId, timer);
}

/**
 * Load a single persisted card from disk. Returns null if not found,
 * expired (older than 7 days), or unreadable.
 *
 * The caller must supply a `resolveAccount` function to reconstruct
 * the full `ResolvedEnsoAccount` from the persisted accountId.
 */
export function loadPersistedCard(
  cardId: string,
  resolveAccount: (accountId: string) => import("../accounts.js").ResolvedEnsoAccount | null,
): CardContext | null {
  const filePath = join(CARDS_DIR, `${cardId}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const record = JSON.parse(raw) as PersistedCardRecord;

    // TTL check — expire cards older than 7 days
    if (record.persistedAt) {
      const age = Date.now() - new Date(record.persistedAt).getTime();
      if (age > TTL_MS) {
        logAction({ ts: Date.now(), type: "action", category: "card-persistence", message: `Expired card ${cardId} (${Math.floor(age / 86400000)}d old)` });
        deletePersistedCard(cardId);
        return null;
      }
    }

    // Resolve the account
    const account = resolveAccount(record.accountId);
    if (!account) {
      logAction({ ts: Date.now(), type: "action", category: "card-persistence", message: `Cannot resolve account for card ${cardId} (accountId=${record.accountId})` });
      return null;
    }

    const ctx: CardContext = {
      cardId: record.cardId,
      originalPrompt: record.originalPrompt,
      originalResponse: record.originalResponse,
      currentData: record.currentData,
      account,
      geminiApiKey: account.geminiApiKey,
      mode: record.mode,
      actionHistory: record.actionHistory ?? [],
      appToolHint: record.appToolHint,
      interactionMode: record.interactionMode,
      toolFamily: record.toolFamily,
      signatureId: record.signatureId,
      coverageStatus: record.coverageStatus,
      allowedRoot: record.allowedRoot,
      navStack: record.navStack,
      currentGeneratedUI: record.currentGeneratedUI,
    };

    logAction({ ts: Date.now(), type: "action", category: "card-persistence", message: `Loaded card ${cardId} from disk` });
    return ctx;
  } catch (err) {
    logError("card-persistence", `Failed to load card ${cardId}`, err);
    return null;
  }
}

/**
 * Bulk-load all persisted cards. Used at server startup to warm the
 * in-memory cache. Expired cards are cleaned up during load.
 */
export function loadAllPersistedCards(
  resolveAccount: (accountId: string) => import("../accounts.js").ResolvedEnsoAccount | null,
): Map<string, CardContext> {
  const result = new Map<string, CardContext>();
  ensureCardsDir();

  let files: string[];
  try {
    files = readdirSync(CARDS_DIR).filter(f => f.endsWith(".json"));
  } catch {
    return result;
  }

  let loaded = 0;
  let expired = 0;
  for (const file of files) {
    const cardId = file.replace(/\.json$/, "");
    const ctx = loadPersistedCard(cardId, resolveAccount);
    if (ctx) {
      result.set(cardId, ctx);
      loaded++;
    } else {
      expired++;
    }
  }

  if (loaded > 0 || expired > 0) {
    logAction({ ts: Date.now(), type: "action", category: "card-persistence", message: `Startup load: ${loaded} cards restored, ${expired} expired/invalid` });
  }

  return result;
}

/**
 * Delete a persisted card from disk.
 */
export function deletePersistedCard(cardId: string): void {
  const filePath = join(CARDS_DIR, `${cardId}.json`);
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch (err) {
    logError("card-persistence", `Failed to delete card ${cardId}`, err);
  }
}
