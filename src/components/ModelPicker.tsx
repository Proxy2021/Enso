import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "../store/chat";

interface ModelPreset {
  id: string;
  model: string;
  thinking: "adaptive" | "disabled";
  label: string;
  sub: string;
  color: string;
}

const PRESETS: ModelPreset[] = [
  { id: "opus-thinking", model: "claude-opus-4-6", thinking: "adaptive", label: "Opus", sub: "Thinking", color: "text-purple-400" },
  { id: "opus-fast", model: "claude-opus-4-6", thinking: "disabled", label: "Opus", sub: "Fast", color: "text-purple-400" },
  { id: "sonnet-thinking", model: "claude-sonnet-4-6", thinking: "adaptive", label: "Sonnet", sub: "Thinking", color: "text-blue-400" },
  { id: "sonnet-fast", model: "claude-sonnet-4-6", thinking: "disabled", label: "Sonnet", sub: "Fast", color: "text-blue-400" },
  { id: "haiku", model: "claude-haiku-4-5", thinking: "disabled", label: "Haiku", sub: "Fastest", color: "text-green-400" },
];

function findPreset(model: string, thinking: string): ModelPreset {
  return PRESETS.find((p) => p.model === model && p.thinking === thinking) ?? PRESETS[0];
}

export default function ModelPicker() {
  const [open, setOpen] = useState(false);
  const claudeModel = useChatStore((s) => s.claudeModel);
  const claudeThinking = useChatStore((s) => s.claudeThinking);
  const setClaudeModel = useChatStore((s) => s.setClaudeModel);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const active = findPreset(claudeModel, claudeThinking);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(4, rect.left) });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const buttonLabel = active.thinking === "adaptive"
    ? `${active.label} \u2728`
    : active.label;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium hover:bg-gray-800 transition-colors ${active.color}`}
        title={`${active.model} (${active.thinking === "adaptive" ? "thinking" : "fast"})`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span>{buttonLabel}</span>
        <span className="text-[8px] opacity-60">{"\u25BC"}</span>
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-700/50">
            Claude Code Model
          </div>
          {PRESETS.map((p) => {
            const isActive = p.id === active.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setClaudeModel(p.model, p.thinking);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700/60 transition-colors flex items-center gap-2 ${
                  isActive ? "bg-gray-700/40" : ""
                }`}
              >
                <span className={`font-semibold w-14 ${p.color}`}>{p.label}</span>
                <span className="text-gray-400 text-[10px] flex-1">
                  {p.thinking === "adaptive" ? (
                    <span className="inline-flex items-center gap-0.5">
                      <span className="text-amber-400">{"\u2728"}</span> Thinking
                    </span>
                  ) : (
                    <span>{p.sub}</span>
                  )}
                </span>
                {isActive && (
                  <span className="text-green-400 text-[10px]">{"\u2713"}</span>
                )}
              </button>
            );
          })}
          <div className="px-3 py-1.5 text-[9px] text-gray-600 border-t border-gray-700/50">
            Thinking shows Claude's reasoning process
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
