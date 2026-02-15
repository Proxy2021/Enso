import React, { useMemo, useState } from "react";
import { compileComponent } from "../lib/sandbox";
import MarkdownText from "../components/MarkdownText";
import MediaGallery from "../components/MediaGallery";
import type { CardRendererProps } from "./types";

class UIErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
          <strong>Render error:</strong> {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DynamicUICard({ card, onAction }: CardRendererProps) {
  const [showSource, setShowSource] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const hasMedia = Boolean(card.mediaUrls?.length);

  // Redirect sendMessage calls from generated components to onAction,
  // so clicking buttons within a card updates it in-place instead of
  // creating a new chat message / new card.
  const sendMessageAsAction = useMemo(
    () => (text: string) => {
      console.log("[card] sendMessage redirected to onAction:", text);
      onAction("send_message", { text });
    },
    [onAction],
  );

  const result = useMemo(
    () => (card.generatedUI ? compileComponent(card.generatedUI) : null),
    [card.generatedUI],
  );

  if (!result) return null;

  if (result.error) {
    return (
      <div className="mb-3">
        <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between text-amber-300">
            <span>
              <strong>Compile error:</strong> {result.error}
            </span>
            <button
              onClick={() => setShowSource(!showSource)}
              className="text-xs underline ml-2 shrink-0"
            >
              {showSource ? "Hide source" : "Show source"}
            </button>
          </div>
          {showSource && (
            <pre className="mt-2 text-xs text-gray-400 overflow-auto max-h-48 bg-gray-900 p-2 rounded">
              {card.generatedUI}
            </pre>
          )}
        </div>
      </div>
    );
  }

  const Comp = result.Component!;

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[90%] w-full">
        <UIErrorBoundary>
          <Comp data={card.data ?? {}} sendMessage={sendMessageAsAction} onAction={onAction} theme="dark" />
        </UIErrorBoundary>
        {hasMedia && <MediaGallery urls={card.mediaUrls!} />}
        {card.text && (
          <div className="mt-1 px-1">
            <button
              onClick={() => setShowRawText(!showRawText)}
              className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
            >
              {showRawText ? "Hide response text" : "Show response text"}
            </button>
            {showRawText && (
              <div className="mt-1 bg-gray-800/50 rounded-lg px-3 py-2 text-sm text-gray-400 border border-gray-700/50">
                <MarkdownText text={card.text} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
