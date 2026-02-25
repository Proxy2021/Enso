import React, { useMemo, useState, useEffect } from "react";
import { compileComponent } from "../lib/sandbox";
import MarkdownText from "../components/MarkdownText";
import MediaGallery from "../components/MediaGallery";
import type { CardRendererProps } from "./types";

// ── Fix Buttons ──

function FixButtons({
  error,
  errorType,
  onAction,
  autoHealStatus,
}: {
  error: string;
  errorType: "compile" | "runtime";
  onAction: (action: string, payload?: unknown) => void;
  autoHealStatus?: "fixing" | "fixed" | "failed";
}) {
  const isFixing = autoHealStatus === "fixing";
  const isFixed = autoHealStatus === "fixed";

  return (
    <div className="flex items-center gap-2 mt-2">
      {isFixed ? (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Fixed!
        </span>
      ) : (
        <>
          <button
            onClick={() => onAction("auto_heal_template", { error, errorType })}
            disabled={isFixing}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {isFixing ? (
              <>
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Fixing...
              </>
            ) : (
              <>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                </svg>
                Fix
              </>
            )}
          </button>
          <button
            onClick={() => onAction("fix_with_code", { error, toolName: "" })}
            disabled={isFixing}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-gray-600/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            Debug with Code
          </button>
        </>
      )}
    </div>
  );
}

// ── Error Boundary (with fix buttons) ──

class UIErrorBoundary extends React.Component<
  { children: React.ReactNode; onAction: (action: string, payload?: unknown) => void; autoHealStatus?: string },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  // Reset error state when auto-heal completes (new template will be compiled)
  componentDidUpdate(prevProps: UIErrorBoundary["props"]) {
    if (prevProps.autoHealStatus === "fixing" && this.props.autoHealStatus === "fixed") {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
          <strong>Render error:</strong> {this.state.error}
          <FixButtons
            error={this.state.error}
            errorType="runtime"
            onAction={this.props.onAction}
            autoHealStatus={this.props.autoHealStatus as "fixing" | "fixed" | "failed" | undefined}
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
  const [showFixedFlash, setShowFixedFlash] = useState(false);
  const hasMedia = Boolean(card.mediaUrls?.length);

  // Brief green flash when auto-heal succeeds
  useEffect(() => {
    if (card.autoHealStatus === "fixed") {
      setShowFixedFlash(true);
      const timer = setTimeout(() => setShowFixedFlash(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [card.autoHealStatus]);

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
          <FixButtons
            error={result.error}
            errorType="compile"
            onAction={onAction}
            autoHealStatus={card.autoHealStatus}
          />
        </div>
      </div>
    );
  }

  const Comp = result.Component!;

  return (
    <div className="flex justify-start p-2">
      <div className="w-full">
        {showFixedFlash && (
          <div className="mb-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs animate-pulse">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Auto-healed successfully
          </div>
        )}
        <UIErrorBoundary onAction={onAction} autoHealStatus={card.autoHealStatus}>
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
