import { randomUUID } from "crypto";
import { normalize, resolve, sep } from "path";
import type { ResolvedEnsoAccount } from "../accounts.js";
import {
  getGeneratedTemplateCodeBySignature,
  getToolTemplate,
  getToolTemplateCode,
  type ToolTemplateCoverageStatus,
} from "../native-tools/registry.js";
import { logAction } from "../action-log.js";
import { persistCardContext, loadPersistedCard } from "./card-persistence.js";

// ── Card Interaction Context ──

/** Entry in the card navigation stack — saved when drilling into an entity */
export interface NavStackEntry {
  data: unknown;
  generatedUI?: string;
  title: string;
  focusEntity?: string;  // EntityId of what was being shown
}

export interface CardContext {
  cardId: string;
  originalPrompt: string;
  originalResponse: string;
  currentData: unknown;
  geminiApiKey?: string;
  account: ResolvedEnsoAccount;
  mode: "im" | "ui" | "full";
  actionHistory: Array<{
    action: string;
    payload: unknown;
    timestamp: number;
  }>;
  /**
   * Present when the agent used a tool from a co-loaded plugin
   * to produce this card's data. Enables card actions to bypass the agent
   * and call the tool directly via the plugin registry.
   */
  appToolHint?: {
    /** The full tool name that produced the original data, e.g. "alpharank_latest_predictions" */
    toolName: string;
    /** The params the agent passed to the tool */
    params: Record<string, unknown>;
    /** The action map prefix, used to look up the handler, e.g. "alpharank_" */
    handlerPrefix: string;
  };
  interactionMode: "llm" | "tool";
  toolFamily?: string;
  signatureId?: string;
  coverageStatus?: ToolTemplateCoverageStatus;
  /** When set, restricts all path-based tool actions to this directory and its children. */
  allowedRoot?: string;
  /** Navigation stack for entity drill-down. Each entry is a snapshot of the card before navigating deeper. */
  navStack?: NavStackEntry[];
  /** Current generatedUI template (tracked so nav_back can restore it). */
  currentGeneratedUI?: string;
}

export const cardContexts = new Map<string, CardContext>();

/** Resolver for account reconstruction from persisted cards. Set at startup. */
let accountResolver: ((accountId: string) => ResolvedEnsoAccount | null) | null = null;

/** Set the account resolver used by the persistence fallback. Call once at startup. */
export function setCardAccountResolver(resolver: (accountId: string) => ResolvedEnsoAccount | null): void {
  accountResolver = resolver;
}

/** Register a card context externally (used by tool-factory). */
export function registerCardContext(cardId: string, ctx: {
  cardId: string;
  originalPrompt: string;
  originalResponse: string;
  currentData: unknown;
  geminiApiKey?: string;
  account: ResolvedEnsoAccount;
  mode: "im" | "ui" | "full";
  actionHistory: Array<{ action: string; payload: unknown; timestamp: number }>;
  appToolHint?: { toolName: string; params: Record<string, unknown>; handlerPrefix: string };
  interactionMode: "llm" | "tool";
  toolFamily?: string;
  signatureId?: string;
  coverageStatus?: "covered" | "partial";
  allowedRoot?: string;
}): void {
  cardContexts.set(cardId, ctx as CardContext);
  persistCardContext(cardId, ctx as CardContext);
}

/**
 * Look up a card context by ID — checks in-memory first, then falls back
 * to disk persistence. Returns undefined if not found anywhere.
 */
export function getCardContext(cardId: string): CardContext | undefined {
  const cached = cardContexts.get(cardId);
  if (cached) return cached;

  // Fallback: try loading from disk
  if (accountResolver) {
    const loaded = loadPersistedCard(cardId, accountResolver);
    if (loaded) {
      cardContexts.set(cardId, loaded);
      return loaded;
    }
  }
  return undefined;
}

/**
 * Return the public state of a card context (data, template, metadata).
 * Used by the /api/card/:cardId/state endpoint for share-link loading.
 */
export function getCardState(cardId: string): {
  data: unknown;
  generatedUI?: string;
  toolFamily?: string;
  signatureId?: string;
  coverageStatus?: string;
  toolMeta?: { toolId?: string };
} | null {
  const ctx = getCardContext(cardId);
  if (!ctx) return null;

  // Resolve the template JSX
  let generatedUI: string | undefined;
  if (ctx.signatureId) {
    generatedUI = getGeneratedTemplateCodeBySignature(ctx.signatureId) ?? undefined;
    if (!generatedUI) {
      const template = getToolTemplate(ctx.toolFamily ?? "", ctx.signatureId);
      if (template) generatedUI = getToolTemplateCode(template) ?? undefined;
    }
  }

  return {
    data: ctx.currentData,
    generatedUI,
    toolFamily: ctx.toolFamily,
    signatureId: ctx.signatureId,
    coverageStatus: ctx.coverageStatus,
    toolMeta: ctx.appToolHint ? { toolId: ctx.appToolHint.toolName } : undefined,
  };
}

// ── Path-scoped sharing helpers ──

/** Check whether `candidatePath` is equal to or a subdirectory of `allowedRoot`. */
export function isPathWithinRoot(candidatePath: string, allowedRoot: string): boolean {
  const normCandidate = normalize(resolve(candidatePath)).replace(/[/\\]+$/, "");
  const normRoot = normalize(resolve(allowedRoot)).replace(/[/\\]+$/, "");
  const isWin = sep === "\\";
  const a = isWin ? normCandidate.toLowerCase() : normCandidate;
  const b = isWin ? normRoot.toLowerCase() : normRoot;
  return a === b || a.startsWith(b + sep);
}

const SCOPED_SHARE_BLOCKED_ACTIONS = new Set(["bookmark_folder"]);

/** Validate action payload paths against the card's allowedRoot. Returns error string or null. */
export function validateScopedAction(
  ctx: CardContext,
  action: string,
  payload: unknown,
): string | null {
  if (!ctx.allowedRoot) return null;
  if (SCOPED_SHARE_BLOCKED_ACTIONS.has(action)) {
    return `Action "${action}" is not available for shared galleries.`;
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.path === "string" && p.path.trim()) {
    if (!isPathWithinRoot(p.path, ctx.allowedRoot)) {
      return `Path is outside the shared folder.`;
    }
  }
  if (typeof p.photoPath === "string" && p.photoPath.trim()) {
    if (!isPathWithinRoot(p.photoPath, ctx.allowedRoot)) {
      return `Photo path is outside the shared folder.`;
    }
  }
  return null;
}

/**
 * Create a scoped copy of a card context for sharing.
 * Returns a new card ID that restricts actions to the given root path.
 */
export function createScopedShareContext(
  sourceCardId: string,
  allowedRoot: string,
): { ok: true; shareCardId: string; normalizedRoot: string } | { ok: false; error: string } {
  const sourceCtx = getCardContext(sourceCardId);
  if (!sourceCtx) return { ok: false, error: "Source card context not found" };

  const normalizedRoot = normalize(resolve(allowedRoot)).replace(/[/\\]+$/, "");
  const shareCardId = randomUUID();
  cardContexts.set(shareCardId, {
    ...sourceCtx,
    cardId: shareCardId,
    actionHistory: [],
    currentData: structuredClone(sourceCtx.currentData),
    allowedRoot: normalizedRoot,
  });

  logAction({ ts: Date.now(), type: "action", category: "share", message: `Scoped context: shareCardId=${shareCardId}, root="${normalizedRoot}", source=${sourceCardId}` });
  return { ok: true, shareCardId, normalizedRoot };
}
