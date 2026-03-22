/**
 * ResultsInbox — slide-up sheet showing recently completed long-running tasks.
 * Tracks which results the user has seen. Provides one-tap navigation to cards.
 */

import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chat";
import type { Card } from "../cards/types";
import { isOrchestrationCardData } from "@shared/types";
import { formatElapsed } from "../lib/useElapsedTime";
import { TOOL_ID_CLAUDE_CODE, TIMINGS } from "../lib/constants";

// ── Seen tracking (persisted to localStorage) ──

const SEEN_KEY = "enso_results_seen";

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>) {
  // Keep last 200 to avoid unbounded growth
  const arr = [...ids].slice(-200);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

// ── Result derivation ──

interface ResultEntry {
  cardId: string;
  type: "claude_code" | "orchestration" | "build" | "deep_research" | "research";
  title: string;
  subtitle: string;
  completedAt: number;
  success: boolean;
  seen: boolean;
}

function isLongRunningResult(card: Card): boolean {
  if (card.role !== "assistant") return false;
  if (card.status !== "complete" && card.status !== "error") return false;

  // Terminal (Claude Code)
  if (card.type === "terminal" && card.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) return true;

  // Orchestration
  if (card.type === "orchestration") {
    const orchData = isOrchestrationCardData(card.data) ? card.data : undefined;
    const plan = orchData?.orchestrationProgress?.plan || orchData?.orchestrationPlan;
    return plan?.status === "completed" || plan?.status === "failed";
  }

  // Deep research (has app view with generated UI, came from deep build)
  if (card.appGeneratedUI && card.standardDataSnapshot) return true;

  // Research with data
  const toolName = (card.data && typeof card.data === "object" && "tool" in card.data)
    ? (card.data as { tool?: string }).tool
    : undefined;
  if (toolName?.includes("research") && card.generatedUI) return true;

  return false;
}

function deriveResults(
  cards: Record<string, Card>,
  cardOrder: string[],
  seen: Set<string>,
): ResultEntry[] {
  const results: ResultEntry[] = [];

  for (const id of cardOrder) {
    const card = cards[id];
    if (!card || !isLongRunningResult(card)) continue;

    let type: ResultEntry["type"] = "claude_code";
    let title = "Claude Code";
    let subtitle = "";
    let success = card.status === "complete";

    if (card.type === "terminal") {
      title = "Claude Code session";
      subtitle = card.toolMeta?.cwd || "";
    } else if (card.type === "orchestration") {
      type = "orchestration";
      const oData = isOrchestrationCardData(card.data) ? card.data : undefined;
      const plan = oData?.orchestrationProgress?.plan || oData?.orchestrationPlan;
      title = "Mission";
      subtitle = plan?.goal ? (plan.goal.length > 60 ? plan.goal.slice(0, 57) + "..." : plan.goal) : "";
      success = plan?.status === "completed";
    } else if (card.appGeneratedUI && card.standardDataSnapshot) {
      type = "deep_research";
      title = "Deep research";
      subtitle = (card.text ?? "").slice(0, 60).replace(/\n/g, " ");
    } else {
      type = "research";
      title = "Research";
      subtitle = (card.text ?? "").slice(0, 60).replace(/\n/g, " ");
    }

    results.push({
      cardId: id,
      type,
      title,
      subtitle,
      completedAt: card.updatedAt,
      success,
      seen: seen.has(id),
    });
  }

  // Most recent first
  return results.reverse().slice(0, 50);
}

// ── Components ──

const TYPE_COLORS: Record<string, string> = {
  claude_code: "text-violet-400",
  orchestration: "text-blue-400",
  build: "text-amber-400",
  deep_research: "text-cyan-400",
  research: "text-emerald-400",
};

const TYPE_ICONS: Record<string, string> = {
  claude_code: "\uD83D\uDCBB",
  orchestration: "\u26A1",
  build: "\uD83D\uDD28",
  deep_research: "\uD83D\uDD2C",
  research: "\uD83D\uDD0D",
};

function scrollToCard(cardId: string) {
  const el = document.getElementById(`card-${cardId}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Main exports ──

export function useUnseenCount(): number {
  const cards = useChatStore((s) => s.cards);
  const cardOrder = useChatStore((s) => s.cardOrder);
  const [seen, setSeen] = useState(loadSeen);

  // Refresh seen set when cards change (in case markSeen was called)
  useEffect(() => {
    const interval = setInterval(() => setSeen(loadSeen()), TIMINGS.SEEN_POLL);
    return () => clearInterval(interval);
  }, []);

  let count = 0;
  for (const id of cardOrder) {
    const card = cards[id];
    if (card && isLongRunningResult(card) && !seen.has(id)) count++;
  }
  return count;
}

interface ResultsInboxProps {
  show: boolean;
  onClose: () => void;
}

export default function ResultsInbox({ show, onClose }: ResultsInboxProps) {
  const cards = useChatStore((s) => s.cards);
  const cardOrder = useChatStore((s) => s.cardOrder);
  const [seen, setSeen] = useState(loadSeen);

  const results = deriveResults(cards, cardOrder, seen);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveSeen(next);
      return next;
    });
  }, []);

  const markAllSeen = useCallback(() => {
    setSeen((prev) => {
      const next = new Set(prev);
      for (const r of results) next.add(r.cardId);
      saveSeen(next);
      return next;
    });
  }, [results]);

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 border-t border-gray-800 rounded-t-2xl max-h-[70vh] flex flex-col animate-[slideUp_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 shrink-0">
          <h2 className="text-sm font-semibold text-gray-200">Completed Tasks</h2>
          <div className="flex items-center gap-3">
            {results.some((r) => !r.seen) && (
              <button
                onClick={markAllSeen}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none transition-colors"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-600 text-sm">
              <span className="text-2xl mb-2">&#x1f4ed;</span>
              No completed tasks yet
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.cardId}
                onClick={() => {
                  markSeen(r.cardId);
                  scrollToCard(r.cardId);
                  onClose();
                }}
                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-gray-800/40 hover:bg-gray-900/60 active:bg-gray-800/60 transition-all duration-150 text-left ${
                  !r.seen ? "bg-gray-900/40" : ""
                }`}
              >
                {/* Unseen dot */}
                <div className="mt-1.5 w-2 flex-shrink-0">
                  {!r.seen && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                </div>

                {/* Icon */}
                <span className="text-base mt-0.5 flex-shrink-0">{TYPE_ICONS[r.type]}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${r.success ? "text-gray-200" : "text-red-400"}`}>
                      {r.title}
                    </span>
                    <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{timeAgo(r.completedAt)}</span>
                  </div>
                  {r.subtitle && (
                    <div className="text-[11px] text-gray-500 truncate mt-0.5">{r.subtitle}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
