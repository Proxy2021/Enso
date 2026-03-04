import { useState, useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";

interface SystemEnhanceDialogProps {
  onClose: () => void;
}

export function SystemEnhanceDialog({ onClose }: SystemEnhanceDialogProps) {
  const [instruction, setInstruction] = useState("");
  const launchSystemEnhance = useChatStore((s) => s.launchSystemEnhance);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    launchSystemEnhance(trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
          <h3 className="text-sm font-semibold text-gray-100">System Enhance</h3>
          <p className="text-xs text-gray-400 mt-1">
            Describe what you want to improve across the Enso system. Claude Code will analyze and implement changes.
          </p>
        </div>
        <div className="px-4 py-3">
          <textarea
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="e.g., improve error handling across all tool families, add better loading states, optimize WebSocket reconnection..."
            className="w-full bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 resize-none"
          />
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
            disabled={!instruction.trim()}
            className="px-3 py-1.5 text-xs rounded-md border border-indigo-500/60 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Enhance
          </button>
        </div>
      </div>
    </div>
  );
}
