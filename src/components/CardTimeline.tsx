import { useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import CardContainer from "./CardContainer";

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-900/80 border border-gray-700/70 rounded-2xl px-4 py-3 flex items-center gap-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
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
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center border border-gray-800/80 bg-gray-900/60 backdrop-blur rounded-2xl px-6 py-5 shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
          <p className="text-lg font-medium text-gray-200">Enso</p>
          <p className="text-sm mt-1 text-gray-400">
            Every answer is an app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-5">
      <div className="max-w-5xl mx-auto">
        {cardOrder.map((id) => {
          const card = cards[id];
          if (!card) return null;
          return (
            <CardContainer
              key={id}
              card={card}
              isActive={id === lastCardId}
            />
          );
        })}
        {isWaiting && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
