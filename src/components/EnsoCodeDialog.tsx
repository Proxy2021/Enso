import { useState, useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import { useVoiceInput } from "./VoiceMicButton";


interface EnsoCodeDialogProps {
  onClose: () => void;
}

export function EnsoCodeDialog({ onClose }: EnsoCodeDialogProps) {
  const [instruction, setInstruction] = useState("");
  const launchEnsoCode = useChatStore((s) => s.launchEnsoCode);
  const inputRef = useRef<HTMLInputElement>(null);
  const { VoiceMic } = useVoiceInput(setInstruction);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    launchEnsoCode(trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
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
          <h3 className="text-sm font-semibold text-gray-100">Code with Claude</h3>
          <p className="text-xs text-gray-400 mt-1">
            What would you like Claude Code to work on?
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., add a new tool to the filesystem family, fix the WebSocket reconnection..."
              className="flex-1 bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
            />
            <VoiceMic />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-700/70 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!instruction.trim()}
            className="px-3 py-1.5 text-xs rounded-md border border-indigo-500/60 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
