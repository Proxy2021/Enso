import React, { useMemo, useState } from "react";
import { compileComponent } from "../lib/sandbox";
import MarkdownText from "../components/MarkdownText";
import MediaGallery from "../components/MediaGallery";
import { resolveMediaUrl } from "../lib/connection";
import { reportError } from "../lib/error-reporter";
import type { CardRendererProps } from "./types";

/** Recursively resolve all `/media/...` strings in data to absolute URLs for remote backends. */
function resolveMediaUrlsInData(data: unknown): unknown {
  if (typeof data === "string" && data.startsWith("/media/")) return resolveMediaUrl(data);
  if (Array.isArray(data)) return data.map(resolveMediaUrlsInData);
  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) result[k] = resolveMediaUrlsInData(v);
    return result;
  }
  return data;
}

// ── Fix Button (single path: Claude Code) ──

function FixButton({
  error,
  errorType,
  onAction,
}: {
  error: string;
  errorType: "compile" | "runtime";
  onAction: (action: string, payload?: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={() => onAction("fix_with_code", { error, errorType })}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-indigo-500/50 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 transition-colors"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        Fix with Code
      </button>
    </div>
  );
}

// ── Error Boundary ──

class UIErrorBoundary extends React.Component<
  { children: React.ReactNode; onAction: (action: string, payload?: unknown) => void },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(`Card render error: ${error.message}`, "card_render", {
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
          <strong>Render error:</strong> {this.state.error}
          <FixButton
            error={this.state.error}
            errorType="runtime"
            onAction={this.props.onAction}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main Component ──

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
    reportError(`Card compile error: ${result.error}`, "sandbox");
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
          <FixButton
            error={result.error}
            errorType="compile"
            onAction={onAction}
          />
        </div>
      </div>
    );
  }

  const Comp = result.Component!;

  return (
    <div className="flex justify-start p-2">
      <div className="w-full min-w-0">
        <UIErrorBoundary onAction={onAction}>
          <Comp data={resolveMediaUrlsInData(card.data ?? {})} sendMessage={sendMessageAsAction} onAction={onAction} theme="dark" />
        </UIErrorBoundary>
        {hasMedia && <MediaGallery urls={card.mediaUrls!.map(u => resolveMediaUrl(u))} />}
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
