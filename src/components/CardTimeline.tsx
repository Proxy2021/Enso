import { useEffect, useRef, useMemo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
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
          placeholder="Search cards..."
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

export default function CardTimeline() {
  const { cardOrder, cards, isWaiting, searchQuery } = useChatStore(
    useShallow((s) => ({
      cardOrder: s.cardOrder,
      cards: s.cards,
      isWaiting: s.isWaiting,
      searchQuery: s.cardSearchQuery,
    }))
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const lastCardId = cardOrder[cardOrder.length - 1];

  // Scroll to bottom only when new cards are added or waiting state changes.
  // Avoid scrolling on every delta (which changes `cards` ref constantly).
  const cardCount = cardOrder.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cardCount, isWaiting]);

  // For streaming content: keep scrolled to bottom if already near bottom.
  // Use a separate effect that watches the last card's status.
  const lastCard = lastCardId ? cards[lastCardId] : undefined;
  const isStreaming = lastCard?.status === "streaming";
  useEffect(() => {
    if (!isStreaming || !containerRef.current) return;

    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        if (isNearBottom) {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      });
    };

    // Initial scroll check
    onScroll();

    // Use MutationObserver to watch for content changes during streaming
    const observer = new MutationObserver(onScroll);
    observer.observe(containerRef.current, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [isStreaming]);

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

  if (cardOrder.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <WelcomeCard />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <SearchBar />
      {searchQuery.trim() && (
        <div className="px-4 pb-1">
          <div className="max-w-5xl mx-auto">
            <span className="text-[10px] text-gray-500">{matchCount} card{matchCount !== 1 ? "s" : ""} matching "{searchQuery}"</span>
          </div>
        </div>
      )}
      <div className="px-2 sm:px-4 py-3 sm:py-5">
      <div className="max-w-5xl mx-auto">
        {filteredItems.map((item, idx) => {
          const isLastItem = idx === filteredItems.length - 1;
          const containClass = isLastItem && isStreaming ? "card-contain-streaming" : "card-contain";

          if (item.type === "orch-pair") {
            const orchCard = cards[item.orchId];
            const termCard = cards[item.termId];
            if (!orchCard || !termCard) return null;
            return (
              <div key={item.orchId} className={`${containClass} flex flex-col sm:flex-row gap-3 sm:items-stretch`} id={`card-${item.orchId}`}>
                <div className="sm:w-[220px] sm:flex-shrink-0">
                  <CardContainer card={orchCard} isActive={item.orchId === lastCardId} />
                </div>
                <div className="flex-1 min-w-0" id={`card-${item.termId}`}>
                  <CardContainer card={termCard} isActive={item.termId === lastCardId} />
                </div>
              </div>
            );
          }
          const card = cards[item.id];
          if (!card) return null;
          return (
            <div key={item.id} className={containClass} id={`card-${item.id}`}>
              <CardContainer card={card} isActive={item.id === lastCardId} />
            </div>
          );
        })}
        {isWaiting && !hasOnlyBackgroundTasks(cards, cardOrder) && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
      </div>
    </div>
  );
}
