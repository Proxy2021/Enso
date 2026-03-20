import type { CardRendererProps } from "../cards/types";

export function ThinkingCard(_props: CardRendererProps) {
  return (
    <div className="bg-gray-900/50 rounded-xl px-4 py-3 my-2 border border-gray-700/50 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
        <span className="text-sm text-gray-400">Processing your request...</span>
      </div>
    </div>
  );
}
