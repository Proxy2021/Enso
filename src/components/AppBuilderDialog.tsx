import { useState, useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";

interface AppBuilderDialogProps {
  cardId: string;
  cardText: string;
  onClose: () => void;
}

/** Gather recent conversation context from the store for proposal generation. */
function getConversationContext(): string {
  const { cardOrder, cards } = useChatStore.getState();
  const recent = cardOrder.slice(-6).map((id) => cards[id]).filter(Boolean);
  return recent
    .map((c) => `[${c.role}] ${(c.text ?? "").slice(0, 400)}`)
    .join("\n\n");
}

export function AppBuilderDialog({ cardId, cardText, onClose }: AppBuilderDialogProps) {
  const [definition, setDefinition] = useState("");
  const [isGenerating, setIsGenerating] = useState(true);
  const buildApp = useChatStore((s) => s.buildApp);
  const proposeApp = useChatStore((s) => s.proposeApp);
  const pendingProposal = useChatStore((s) => s.cards[cardId]?.pendingProposal);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // On mount, request an auto-generated proposal from the server
  useEffect(() => {
    proposeApp(cardId, cardText, getConversationContext());
  }, [cardId, cardText, proposeApp]);

  // When proposal arrives from server, populate the textarea
  useEffect(() => {
    if (pendingProposal && isGenerating) {
      setDefinition(pendingProposal);
      setIsGenerating(false);
      // Focus textarea after proposal loads
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [pendingProposal, isGenerating]);

  const handleSubmit = () => {
    const trimmed = definition.trim();
    if (!trimmed) return;
    buildApp(cardId, cardText, trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <div className="px-4 py-3 border-b border-gray-700/70">
          <h3 className="text-sm font-semibold text-gray-100">Build New App</h3>
          <p className="text-xs text-gray-400 mt-1">
            {isGenerating
              ? "Analyzing conversation to propose an app..."
              : "Review and refine the app proposal below. This will become the app's skill definition."}
          </p>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400 block">App proposal</label>
            {isGenerating && (
              <span className="flex items-center gap-1.5 text-[10px] text-amber-400/70">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400/60 animate-pulse" />
                Generating...
              </span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isGenerating ? "" : "Describe the app, its tools, and what scenarios it supports..."}
            rows={12}
            disabled={isGenerating}
            className="w-full bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500/50 resize-none disabled:opacity-50 disabled:cursor-wait font-mono leading-relaxed"
          />
          {!isGenerating && (
            <div className="text-[10px] text-gray-500">
              Cmd+Enter to submit
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-700/70 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isGenerating || !definition.trim()}
            className="px-3 py-1.5 text-xs rounded-md border border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Build App
          </button>
        </div>
      </div>
    </div>
  );
}
