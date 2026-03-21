import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "../store/chat";
import { useT, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n";

interface ModelPreset {
  id: string;
  model: string;
  thinking: "adaptive" | "disabled";
  label: string;
  subKey: string;
  color: string;
}

const PRESETS: ModelPreset[] = [
  { id: "opus-thinking", model: "claude-opus-4-6", thinking: "adaptive", label: "Opus", subKey: "settings.thinking", color: "text-purple-400" },
  { id: "opus-fast", model: "claude-opus-4-6", thinking: "disabled", label: "Opus", subKey: "settings.fast", color: "text-purple-400" },
  { id: "sonnet-thinking", model: "claude-sonnet-4-6", thinking: "adaptive", label: "Sonnet", subKey: "settings.thinking", color: "text-blue-400" },
  { id: "sonnet-fast", model: "claude-sonnet-4-6", thinking: "disabled", label: "Sonnet", subKey: "settings.fast", color: "text-blue-400" },
  { id: "haiku", model: "claude-haiku-4-5", thinking: "disabled", label: "Haiku", subKey: "settings.fastest", color: "text-green-400" },
];

function findPreset(model: string, thinking: string): ModelPreset {
  return PRESETS.find((p) => p.model === model && p.thinking === thinking) ?? PRESETS[0];
}

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const claudeModel = useChatStore((s) => s.claudeModel);
  const claudeThinking = useChatStore((s) => s.claudeThinking);
  const setClaudeModel = useChatStore((s) => s.setClaudeModel);
  const language = useChatStore((s) => s.language);
  const setLanguage = useChatStore((s) => s.setLanguage);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const { t } = useT();

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

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium hover:bg-gray-800 transition-all duration-150 text-gray-400"
        title={t("settings.title")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Language section */}
          <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-700/50">
            {t("settings.language")}
          </div>
          <div className="flex gap-1 px-3 py-2">
            {SUPPORTED_LOCALES.map((loc: Locale) => (
              <button
                key={loc}
                onClick={() => setLanguage(loc)}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all duration-150 ${
                  language === loc
                    ? "bg-indigo-500/20 border border-indigo-500/50 text-indigo-300"
                    : "bg-gray-700/40 border border-gray-700 text-gray-400 hover:bg-gray-700/60"
                }`}
              >
                {LOCALE_LABELS[loc]}
              </button>
            ))}
          </div>

          {/* Model section */}
          <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-700/50 border-t border-gray-700/50">
            {t("settings.claudeModel")}
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
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700/60 transition-all duration-150 flex items-center gap-2 ${
                  isActive ? "bg-gray-700/40" : ""
                }`}
              >
                <span className={`font-semibold w-14 ${p.color}`}>{p.label}</span>
                <span className="text-gray-400 text-[10px] flex-1">
                  {p.thinking === "adaptive" ? (
                    <span className="inline-flex items-center gap-0.5">
                      <span className="text-amber-400">{"\u2728"}</span> {t(p.subKey)}
                    </span>
                  ) : (
                    <span>{t(p.subKey)}</span>
                  )}
                </span>
                {isActive && (
                  <span className="text-green-400 text-[10px]">{"\u2713"}</span>
                )}
              </button>
            );
          })}
          <div className="px-3 py-1.5 text-[9px] text-gray-600 border-t border-gray-700/50">
            {t("settings.thinkingHint")}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
