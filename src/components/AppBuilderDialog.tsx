import { useState, useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";


interface AppBuilderDialogProps {
  cardId: string;
  cardText: string;
  initialProposal: string;
  onClose: () => void;
}

export function AppBuilderDialog({ cardId, cardText, initialProposal, onClose }: AppBuilderDialogProps) {
  const [definition, setDefinition] = useState(initialProposal);
  const buildApp = useChatStore((s) => s.buildApp);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

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
            Review and refine the app proposal below. This will become the app's skill definition.
          </p>
        </div>
        <div className="px-4 py-3 space-y-2">
          <label className="text-xs text-gray-400 block">App proposal</label>
          <textarea
            ref={textareaRef}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the app, its tools, and what scenarios it supports..."
            rows={12}
            className="w-full bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500/50 resize-none font-mono leading-relaxed"
          />
          <div className="text-[10px] text-gray-500">
            Cmd+Enter to submit
          </div>
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
            disabled={!definition.trim()}
            className="px-3 py-1.5 text-xs rounded-md border border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Build App
          </button>
        </div>
      </div>
    </div>
  );
}
