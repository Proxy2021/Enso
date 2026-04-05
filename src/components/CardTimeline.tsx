import React, { useEffect, useRef, useMemo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useChatStore } from "../store/chat";
import type { Card } from "../cards/types";
import { isOrchestrationCardData } from "@shared/types";
import CardContainer from "./CardContainer";
import WelcomeCard from "./WelcomeCard";
import { useElapsedTime, formatElapsed } from "../lib/useElapsedTime";
import { useT } from "../lib/i18n";
import { Search, X } from "lucide-react";

/**
 * Returns true when the only streaming activity is background tasks
 * (terminal, orchestration, shell, deep research builds) which have
 * their own progress UI. In that case the typing indicator is hidden
 * so the chat feels available.
 */
function hasOnlyBackgroundTasks(
  cards: Record<string, Card>,
  cardOrder: string[],
): boolean {
  let hasAnyStreaming = false;
  let hasForegroundStreaming = false;
  for (const id of cardOrder) {
    const c = cards[id];
    if (!c || c.status !== "streaming") continue;
    hasAnyStreaming = true;
    if (
      c.type === "terminal" ||
      c.type === "shell" ||
      c.type === "orchestration" ||
      c.deepResearchStatus === "building"
    ) {
      continue; // background task — skip
    }
    hasForegroundStreaming = true;
  }
  // Only suppress the typing indicator when there ARE streaming cards
  // and all of them are background tasks. If nothing is streaming yet,
  // return false so the typing indicator still shows during initial wait.
  return hasAnyStreaming && !hasForegroundStreaming;
}

function TypingIndicator() {
  const elapsed = useElapsedTime();
  const { t } = useT();
  return (
    <div className="flex justify-start mb-4">
      <div className="w-full max-w-2xl bg-gray-900/80 border border-gray-700/70 rounded-2xl px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </span>
          <span className="text-xs text-gray-400">
            {elapsed < 2 ? t("chat.thinking") : elapsed < 6 ? t("chat.working") : elapsed < 15 ? t("chat.researching") : t("chat.stillWorking")}
          </span>
          {elapsed >= 2 && (
            <span className="text-[11px] text-gray-500 tabular-nums ml-auto">{formatElapsed(elapsed)}</span>
          )}
        </div>
        {/* Skeleton lines */}
        <div className="space-y-2.5">
          <div className="h-3 bg-gray-700/50 rounded-full w-[85%] animate-pulse" />
          <div className="h-3 bg-gray-700/50 rounded-full w-[70%] animate-pulse [animation-delay:75ms]" />
          <div className="h-3 bg-gray-700/50 rounded-full w-[55%] animate-pulse [animation-delay:150ms]" />
        </div>
      </div>
    </div>
  );
}

function cardMatchesSearch(card: Card, query: string): boolean {
  const q = query.toLowerCase();
  if (card.text && card.text.toLowerCase().includes(q)) return true;
  if (card.type && card.type.toLowerCase().includes(q)) return true;
  if (card.data) {
    try {
      const dataStr = typeof card.data === "string" ? card.data : JSON.stringify(card.data);
      if (dataStr.toLowerCase().includes(q)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

function SearchBar() {
  const { t } = useT();
  const searchQuery = useChatStore((s) => s.cardSearchQuery);
  const searchVisible = useChatStore((s) => s.cardSearchVisible);
  const setQuery = useChatStore((s) => s.setCardSearchQuery);
  const setVisible = useChatStore((s) => s.setCardSearchVisible);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchVisible) inputRef.current?.focus();
  }, [searchVisible]);

  if (!searchVisible) return null;

  return (
    <div className="sticky top-0 z-20 px-4 pt-2 pb-1">
      <div className="max-w-5xl mx-auto flex items-center gap-2 bg-gray-900/95 border border-gray-700/60 rounded-lg px-3 py-1.5 backdrop-blur-sm shadow-lg">
        <Search size={14} className="text-gray-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("cardTimeline.searchPlaceholder")}
          className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none"
          onKeyDown={(e) => { if (e.key === "Escape") setVisible(false); }}
        />
        {searchQuery && (
          <button
            onClick={() => setQuery("")}
            className="text-gray-500 hover:text-gray-300 active:scale-[0.9] transition-all cursor-pointer"
          >
            <X size={13} />
          </button>
        )}
        <button
          onClick={() => setVisible(false)}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer px-1"
        >
          ESC
        </button>
      </div>
    </div>
  );
}

const CardItem = React.memo(function CardItem({ cardId, isActive }: { cardId: string; isActive: boolean }) {
  const card = useChatStore((s) => s.cards[cardId]);
  if (!card) return null;
  return <CardContainer card={card} isActive={isActive} />;
});

export default function CardTimeline() {
  const { cardOrder, cards, isWaiting, searchQuery } = useChatStore(
    useShallow((s) => ({
      cardOrder: s.cardOrder,
      cards: s.cards,
      isWaiting: s.isWaiting,
      searchQuery: s.cardSearchQuery,
    }))
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const lastCardId = cardOrder[cardOrder.length - 1];
  const cardCount = cardOrder.length;

  const lastCardStatus = useChatStore(useCallback(
    (s) => {
      const id = s.cardOrder[s.cardOrder.length - 1];
      return id ? s.cards[id]?.status : undefined;
    }, []
  ));
  const lastCardUpdatedAt = useChatStore(useCallback(
    (s) => {
      const id = s.cardOrder[s.cardOrder.length - 1];
      return id ? s.cards[id]?.updatedAt : undefined;
    }, []
  ));
  const isStreaming = lastCardStatus === "streaming";

  // Build render items: detect orchestration+terminal pairs for side-by-side layout
  const renderItems: Array<
    | { type: "single"; id: string }
    | { type: "orch-pair"; orchId: string; termId: string }
  > = useMemo(() => {
    const items: Array<
      | { type: "single"; id: string }
      | { type: "orch-pair"; orchId: string; termId: string }
    > = [];
    const pairedTerminals = new Set<string>();

    for (let i = 0; i < cardOrder.length; i++) {
      const id = cardOrder[i];
      const card = cards[id];
      if (!card) continue;

      if (card.type === "orchestration") {
        const orchData = isOrchestrationCardData(card.data) ? card.data : undefined;
        const progress = orchData?.orchestrationProgress;
        const plan = progress?.plan || orchData?.orchestrationPlan;
        const isExecuting = plan?.status === "executing" || plan?.status === "paused";

        if (isExecuting) {
          const nextId = cardOrder[i + 1];
          const nextCard = nextId ? cards[nextId] : undefined;
          if (nextCard && nextCard.type === "terminal") {
            items.push({ type: "orch-pair", orchId: id, termId: nextId });
            pairedTerminals.add(nextId);
            continue;
          }
        }
      }

      if (pairedTerminals.has(id)) continue;
      items.push({ type: "single", id });
    }
    return items;
  }, [cardOrder, cards]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return renderItems;
    return renderItems.filter((item) => {
      if (item.type === "orch-pair") {
        const orchCard = cards[item.orchId];
        const termCard = cards[item.termId];
        return (orchCard && cardMatchesSearch(orchCard, searchQuery)) ||
               (termCard && cardMatchesSearch(termCard, searchQuery));
      }
      const card = cards[item.id];
      return card ? cardMatchesSearch(card, searchQuery) : false;
    });
  }, [renderItems, searchQuery, cards]);

  const matchCount = searchQuery.trim() ? filteredItems.length : 0;
  const showTyping = isWaiting && !hasOnlyBackgroundTasks(cards, cardOrder);
  const totalCount = filteredItems.length + (showTyping ? 1 : 0);

  const rowVirtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 200,
    overscan: 3,
  });

  // Auto-scroll to bottom when new cards arrive or during streaming
  useEffect(() => {
    if (totalCount > 0) {
      rowVirtualizer.scrollToIndex(totalCount - 1, { align: "end" });
    }
  }, [cardCount, isWaiting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isStreaming || !containerRef.current) return;
    const el = containerRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom && totalCount > 0) {
      rowVirtualizer.scrollToIndex(totalCount - 1, { align: "end" });
    }
  }, [isStreaming, lastCardUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose a scroll-to-card helper via a stable element id → index map
  const cardIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((item, idx) => {
      if (item.type === "orch-pair") {
        map.set(item.orchId, idx);
        map.set(item.termId, idx);
      } else {
        map.set(item.id, idx);
      }
    });
    return map;
  }, [filteredItems]);

  // Patch global scrollToCard: BackgroundTaskBar uses getElementById,
  // but virtualized rows may not be in DOM. Override with scrollToIndex.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const orig = w.__ensoScrollToCard as ((id: string) => void) | undefined;
    w.__ensoScrollToCard = (cardId: string) => {
      const idx = cardIdToIndex.get(cardId);
      if (idx != null) {
        rowVirtualizer.scrollToIndex(idx, { align: "center", behavior: "smooth" });
      } else {
        const el = document.getElementById(`card-${cardId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    return () => {
      w.__ensoScrollToCard = orig;
    };
  }, [cardIdToIndex, rowVirtualizer]);

  if (cardOrder.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <WelcomeCard />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto gpu-scroll">
      <SearchBar />
      {searchQuery.trim() && (
        <div className="px-4 pb-1">
          <div className="max-w-5xl mx-auto">
            <span className="text-[10px] text-gray-500">{matchCount} card{matchCount !== 1 ? "s" : ""} matching "{searchQuery}"</span>
          </div>
        </div>
      )}
      <div className="px-2 sm:px-4 py-3 sm:py-5">
        <div
          className="max-w-5xl mx-auto relative"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const idx = virtualRow.index;

            if (idx >= filteredItems.length) {
              return (
                <div
                  key="typing"
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TypingIndicator />
                </div>
              );
            }

            const item = filteredItems[idx];
            const isLastItem = idx === filteredItems.length - 1;
            const containClass = isLastItem && isStreaming ? "" : "card-contain";

            if (item.type === "orch-pair") {
              return (
                <div
                  key={item.orchId}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={`${containClass} flex flex-col sm:flex-row gap-3 sm:items-stretch`}
                  id={`card-${item.orchId}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="sm:w-[220px] sm:flex-shrink-0">
                    <CardItem cardId={item.orchId} isActive={item.orchId === lastCardId} />
                  </div>
                  <div className="flex-1 min-w-0" id={`card-${item.termId}`}>
                    <CardItem cardId={item.termId} isActive={item.termId === lastCardId} />
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={containClass}
                id={`card-${item.id}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <CardItem cardId={item.id} isActive={item.id === lastCardId} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
