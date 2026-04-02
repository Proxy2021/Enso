import { useState, useEffect } from "react";
import type { CardRendererProps } from "../cards/types";

export function ThinkingCard({ card }: CardRendererProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - card.createdAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [card.createdAt]);

  const message =
    elapsed >= 60
      ? "This is taking longer than expected…"
      : elapsed >= 30
        ? "Still working on your request…"
        : "Processing your request…";

  return (
    <div className="bg-gray-900/50 rounded-xl px-4 py-3 my-2 border border-gray-700/50 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
        <span className="text-sm text-gray-400">{message}</span>
        {elapsed >= 15 && (
          <span className="text-xs text-gray-500 ml-auto tabular-nums">{elapsed}s</span>
        )}
      </div>
    </div>
  );
}
