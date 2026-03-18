import { useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import type { Card } from "../cards/types";
import CardContainer from "./CardContainer";
import WelcomeCard from "./WelcomeCard";
import { useElapsedTime, formatElapsed } from "../lib/useElapsedTime";

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
  let hasStreamingAgent = false;
  for (const id of cardOrder) {
    const c = cards[id];
    if (!c || c.status !== "streaming") continue;
    if (
      c.type === "terminal" ||
      c.type === "shell" ||
      c.type === "orchestration" ||
      c.deepResearchStatus === "building"
    ) {
      continue; // background task — skip
    }
    hasStreamingAgent = true;
  }
  return !hasStreamingAgent;
}

function TypingIndicator() {
  const elapsed = useElapsedTime();
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-900/80 border border-gray-700/70 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </span>
        {elapsed >= 3 && (
          <span className="text-[11px] text-gray-500 tabular-nums">{formatElapsed(elapsed)}</span>
        )}
      </div>
    </div>
  );
}

export default function CardTimeline() {
  const cardOrder = useChatStore((s) => s.cardOrder);
  const cards = useChatStore((s) => s.cards);
  const isWaiting = useChatStore((s) => s.isWaiting);
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

    const el = containerRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  if (cardOrder.length === 0) {
    return <WelcomeCard />;
  }

  // Build render items: detect orchestration+terminal pairs for side-by-side layout
  const renderItems: Array<
    | { type: "single"; id: string }
    | { type: "orch-pair"; orchId: string; termId: string }
  > = [];
  const pairedTerminals = new Set<string>();

  for (let i = 0; i < cardOrder.length; i++) {
    const id = cardOrder[i];
    const card = cards[id];
    if (!card) continue;

    // Detect orchestration card in executing/paused state followed by its terminal card
    if (card.type === "orchestration") {
      const progress = (card.data as any)?.orchestrationProgress;
      const plan = progress?.plan || (card.data as any)?.orchestrationPlan;
      const isExecuting = plan?.status === "executing" || plan?.status === "paused";

      if (isExecuting) {
        // Look for the next terminal card (should be the one right after)
        const nextId = cardOrder[i + 1];
        const nextCard = nextId ? cards[nextId] : undefined;
        if (nextCard && nextCard.type === "terminal") {
          renderItems.push({ type: "orch-pair", orchId: id, termId: nextId });
          pairedTerminals.add(nextId);
          continue;
        }
      }
    }

    // Skip terminals that are already paired
    if (pairedTerminals.has(id)) continue;

    renderItems.push({ type: "single", id });
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-5">
      <div className="max-w-5xl mx-auto">
        {renderItems.map((item) => {
          if (item.type === "orch-pair") {
            const orchCard = cards[item.orchId];
            const termCard = cards[item.termId];
            if (!orchCard || !termCard) return null;
            return (
              <div key={item.orchId} className="flex gap-3 items-stretch" id={`card-${item.orchId}`}>
                <div className="w-[220px] flex-shrink-0">
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
            <div key={item.id} id={`card-${item.id}`}>
              <CardContainer card={card} isActive={item.id === lastCardId} />
            </div>
          );
        })}
        {isWaiting && !hasOnlyBackgroundTasks(cards, cardOrder) && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
