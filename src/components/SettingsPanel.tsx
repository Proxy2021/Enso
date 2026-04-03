import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "../store/chat";
import { useT, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n";
import { useMemoryApi } from "../hooks/useMemoryApi";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { useTheme } from "../lib/theme";

// ── Claude Code Presets ─────────────────────────────────────────────────────

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

const OLLAMA_CODE_PRESETS: ModelPreset[] = [
  { id: "ollama-qwen3-32b", model: "ollama:qwen3:32b", thinking: "disabled", label: "Qwen 3 32B", subKey: "32B", color: "text-orange-400" },
  { id: "ollama-codestral", model: "ollama:codestral", thinking: "disabled", label: "Codestral", subKey: "22B", color: "text-orange-400" },
];

function findPreset(model: string, thinking: string): ModelPreset {
  return [...PRESETS, ...OLLAMA_CODE_PRESETS].find((p) => p.model === model && p.thinking === thinking) ?? PRESETS[0];
}

// ── Tabs ────────────────────────────────────────────────────────────────────

type SettingsTab = "appearance" | "chatModel" | "claudeCode" | "memory" | "apiKeys" | "dataSources";

// ── Memory sub-tabs ─────────────────────────────────────────────────────────

type MemoryTab = "user" | "memory" | "history";

// ── Main Component ──────────────────────────────────────────────────────────

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("chatModel");
  const btnRef = useRef<HTMLButtonElement>(null);
  const { t } = useT();

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center gap-1 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:px-1.5 sm:py-0.5 rounded text-xs font-medium hover:bg-gray-800 transition-all duration-150 text-gray-400"
        title={t("settings.title")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="relative w-full sm:max-w-xl h-[85dvh] sm:h-auto sm:max-h-[85vh] mx-0 sm:mx-4 bg-gray-900 rounded-t-2xl sm:rounded-xl border-t sm:border border-gray-700/80 shadow-2xl flex flex-col animate-[slideUp_0.2s_ease-out] sm:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div className="sm:hidden flex justify-center pt-2 pb-0 shrink-0">
              <div className="w-8 h-1 rounded-full bg-gray-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3 border-b border-gray-800 shrink-0">
              <h2 className="text-sm font-semibold text-gray-100">{t("settings.title")}</h2>
              <button onClick={() => setOpen(false)} className="p-2 sm:p-1 text-gray-400 hover:text-gray-200 active:scale-[0.9] rounded hover:bg-gray-800 transition-all duration-150">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-0.5 sm:gap-1 px-3 sm:px-4 pt-2 sm:pt-3 pb-1 shrink-0 border-b border-gray-800/50 overflow-x-auto scrollbar-hide">
              {([
                { id: "chatModel" as const, label: t("settings.chatModel") },
                { id: "claudeCode" as const, label: t("settings.claudeCodeModel") },
                { id: "apiKeys" as const, label: t("settings.apiKeys") },
                { id: "memory" as const, label: t("settings.memory") },
                { id: "dataSources" as const, label: t("settings.dataSources") },
                { id: "appearance" as const, label: t("settings.language") },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 sm:py-1.5 text-xs rounded-md transition-all duration-150 whitespace-nowrap flex-shrink-0 active:scale-[0.95] ${
                    activeTab === tab.id
                      ? "bg-indigo-500/20 text-indigo-300 font-medium"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {activeTab === "dataSources" && <DataSourcesSection />}
              {activeTab === "appearance" && <AppearanceSection />}
              {activeTab === "chatModel" && <ChatModelSection onClose={() => setOpen(false)} />}
              {activeTab === "claudeCode" && <ClaudeCodeSection onClose={() => setOpen(false)} />}
              {activeTab === "apiKeys" && <ServiceKeysSection />}
              {activeTab === "memory" && <MemorySection />}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Appearance Section ───────────────────────────────────────────────────────

function AppearanceSection() {
  const language = useChatStore((s) => s.language);
  const setLanguage = useChatStore((s) => s.setLanguage);
  const { theme, toggleTheme } = useTheme();
  const { t } = useT();

  return (
    <div className="space-y-5">
      {/* Dark mode toggle */}
      <div>
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <div className="flex items-center gap-2.5">
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
            <div>
              <p className="text-xs font-medium text-gray-200">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
              theme === "dark" ? "bg-indigo-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                theme === "dark" ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Language */}
      <div>
        <p className="text-xs text-gray-500 mb-3">{t("settings.languageHint")}</p>
        <div className="flex gap-2">
          {SUPPORTED_LOCALES.map((loc: Locale) => (
            <button
              key={loc}
              onClick={() => setLanguage(loc)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                language === loc
                  ? "bg-indigo-500/20 border border-indigo-500/50 text-indigo-300"
                  : "bg-gray-800/60 border border-gray-700 text-gray-400 hover:bg-gray-700/60"
              }`}
            >
              {LOCALE_LABELS[loc]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Chat Model Section ──────────────────────────────────────────────────────

function ChatModelSection({ onClose }: { onClose: () => void }) {
  const chatModel = useChatStore((s) => s.chatModel);
  const setChatModel = useChatStore((s) => s.setChatModel);
  const providers = useChatStore((s) => s.providers);
  const configureProvider = useChatStore((s) => s.configureProvider);
  const { t } = useT();
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

  const handleSaveKey = (providerId: string) => {
    if (keyInput.trim()) {
      configureProvider(providerId, keyInput.trim());
      setKeyInput("");
      setConfiguringId(null);
    }
  };

  const handleSelectModel = (modelId: string, providerId: string) => {
    const prov = providers.find((p) => p.id === providerId);
    if (prov && !prov.configured && providerId !== "ollama") {
      setConfiguringId(providerId);
      return;
    }
    setChatModel(modelId);
  };

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 mb-3">{t("settings.chatModelHint")}</p>
      {providers.map((prov) => (
        <div key={prov.id} className="mb-3">
          {/* Provider header */}
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{prov.name}</span>
            <span className="flex-1" />
            {prov.configured ? (
              <span className="text-[10px] text-green-500 flex items-center gap-0.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                {t("settings.configured")}
              </span>
            ) : (
              <button
                onClick={() => { setConfiguringId(prov.id); setKeyInput(""); }}
                className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
              >
                {t("settings.setUp")}
              </button>
            )}
          </div>

          {/* Models */}
          {prov.models.map((m) => {
            const isActive = chatModel === m.id;
            const isDimmed = !prov.configured && prov.id !== "ollama";
            return (
              <button
                key={m.id}
                onClick={() => handleSelectModel(m.id, prov.id)}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-all duration-150 flex items-center gap-2 ${
                  isActive ? "bg-indigo-500/15 border border-indigo-500/30" : "hover:bg-gray-800/60"
                } ${isDimmed ? "opacity-40" : ""}`}
              >
                <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isActive ? "border-indigo-400" : "border-gray-600"
                }`}>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                </span>
                <span className="font-medium text-gray-200">{m.name}</span>
                {m.description && <span className="text-gray-500 text-[10px]">{m.description}</span>}
              </button>
            );
          })}

          {/* Inline API key setup */}
          {configuringId === prov.id && (
            <div className="mt-2 mx-1 p-3 bg-gray-800/80 rounded-lg border border-gray-700/60 space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={t("settings.apiKeyPlaceholder")}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/50"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveKey(prov.id)}
                />
                <button
                  onClick={() => handleSaveKey(prov.id)}
                  disabled={!keyInput.trim()}
                  className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-40"
                >
                  {t("settings.save")}
                </button>
              </div>
              {prov.setupUrl && (
                <a
                  href={prov.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  {prov.setupHint}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </a>
              )}
              <button onClick={() => setConfiguringId(null)} className="text-[10px] text-gray-500 hover:text-gray-400">
                {t("settings.cancel")}
              </button>
            </div>
          )}
        </div>
      ))}

      {providers.length === 0 && (
        <p className="text-xs text-gray-600 italic py-4 text-center">{t("settings.loadingProviders")}</p>
      )}
    </div>
  );
}

// ── Claude Code Section ─────────────────────────────────────────────────────

function ClaudeCodeSection({ onClose }: { onClose: () => void }) {
  const claudeModel = useChatStore((s) => s.claudeModel);
  const claudeThinking = useChatStore((s) => s.claudeThinking);
  const setClaudeModel = useChatStore((s) => s.setClaudeModel);
  const { t } = useT();

  const active = findPreset(claudeModel, claudeThinking);

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 mb-3">{t("settings.claudeCodeHint")}</p>

      {/* Anthropic models */}
      <div className="px-1 mb-1">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Anthropic</span>
      </div>
      {PRESETS.map((p) => {
        const isActive = p.id === active.id;
        return (
          <button
            key={p.id}
            onClick={() => setClaudeModel(p.model, p.thinking)}
            className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-all duration-150 flex items-center gap-2 ${
              isActive ? "bg-indigo-500/15 border border-indigo-500/30" : "hover:bg-gray-800/60"
            }`}
          >
            <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
              isActive ? "border-indigo-400" : "border-gray-600"
            }`}>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
            </span>
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
          </button>
        );
      })}

      {/* Ollama models */}
      <div className="px-1 mt-4 mb-1 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ollama ({t("settings.local")})</span>
      </div>
      {OLLAMA_CODE_PRESETS.map((p) => {
        const isActive = p.id === active.id;
        return (
          <button
            key={p.id}
            onClick={() => setClaudeModel(p.model, p.thinking)}
            className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-all duration-150 flex items-center gap-2 ${
              isActive ? "bg-indigo-500/15 border border-indigo-500/30" : "hover:bg-gray-800/60"
            }`}
          >
            <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
              isActive ? "border-indigo-400" : "border-gray-600"
            }`}>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
            </span>
            <span className={`font-semibold ${p.color}`}>{p.label}</span>
            <span className="text-gray-500 text-[10px]">{p.subKey}</span>
          </button>
        );
      })}
      <p className="px-1 text-[10px] text-gray-600 mt-1">{t("settings.ollamaCodeHint")}</p>

      <div className="mt-4 px-1 pt-3 border-t border-gray-800">
        <p className="text-[10px] text-gray-600">{t("settings.thinkingHint")}</p>
      </div>
    </div>
  );
}

// ── Memory Section (absorbed from MemoryPanel) ──────────────────────────────

export function MemorySection() {
  const [memTab, setMemTab] = useState<MemoryTab>("user");
  const { memory, loading, saving, clearing, historyCount, fetchMemory, saveMemory, clearHistory } = useMemoryApi();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const { t } = useT();

  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  const handleSave = async () => {
    const field = memTab === "user" ? "user" : "memory";
    const ok = await saveMemory(field, editText);
    if (ok) setEditing(false);
  };

  const handleClearHistory = async () => {
    const ok = await clearHistory();
    if (ok) setClearConfirm(false);
  };

  const startEdit = () => {
    const current = memTab === "user" ? memory?.user : memory?.memory;
    setEditText(current ?? "");
    setEditing(true);
  };

  const content = memTab === "user" ? memory?.user : memTab === "memory" ? memory?.memory : null;
  const editableTab = memTab === "user" || memTab === "memory";

  return (
    <div className="space-y-3">
      {/* Memory sub-tabs */}
      <div className="flex gap-1">
        {([
          { id: "user" as const, label: t("settings.aboutYou") },
          { id: "memory" as const, label: t("settings.memory") },
          { id: "history" as const, label: t("settings.chatHistory") },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setMemTab(tab.id); setEditing(false); setClearConfirm(false); }}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-all duration-150 ${
              memTab === tab.id
                ? "bg-violet-500/20 text-violet-300 font-medium"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* History tab */}
      {memTab === "history" && (
        <div className="space-y-3">
          <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 p-3 flex items-center gap-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0">
              <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
            </svg>
            <div>
              <p className="text-xs text-gray-300">{historyCount} {t("settings.cardsInSession")}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{t("settings.historyRestoredHint")}</p>
            </div>
          </div>
          {clearConfirm ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2">
              <p className="text-xs text-red-300">{t("settings.clearConfirm")}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setClearConfirm(false)} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800 transition-colors">{t("settings.cancel")}</button>
                <button onClick={handleClearHistory} disabled={clearing} className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50">
                  {clearing ? t("settings.clearing") : t("settings.yesClear")}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setClearConfirm(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              {t("settings.clearHistory")}
            </button>
          )}
        </div>
      )}

      {/* User/Memory view */}
      {editableTab && (
        loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : editing ? (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500">
              {memTab === "user" ? t("settings.aboutYouHint") : t("settings.memoryHint")}
            </p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full h-48 bg-gray-800 text-gray-200 text-xs rounded-lg border border-gray-700 p-3 focus:outline-none focus:border-violet-500/50 resize-none font-mono"
              placeholder={memTab === "user" ? "# About Me\n\nName: ...\nRole: ..." : "# Memory\n\nEnso will accumulate notes here..."}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800 transition-colors">{t("settings.cancel")}</button>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors disabled:opacity-50">
                {saving ? t("settings.saving") : t("settings.save")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-gray-300">
                {memTab === "user" ? t("settings.aboutYou") : t("settings.memory")}
              </h3>
              {editableTab && (
                <button onClick={startEdit} className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors">
                  {content ? t("settings.edit") : t("settings.create")}
                </button>
              )}
            </div>
            {content ? (
              <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 p-3">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-gray-500 italic">
                  {memTab === "user" ? t("settings.noProfile") : t("settings.noMemory")}
                </p>
                <button onClick={startEdit} className="mt-2 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors">
                  {memTab === "user" ? t("settings.createProfile") : t("settings.addMemory")}
                </button>
              </div>
            )}
          </div>
        )
      )}

      <p className="text-[10px] text-gray-600 text-center pt-2">
        {memTab === "history" ? t("settings.historyStorageHint") : t("settings.memoryStorageHint")}
      </p>
    </div>
  );
}

// ── Service API Keys Section ─────────────────────────────────────────────────

interface ServiceKey {
  id: string;
  envVar: string;
  label: string;
  description: string;
  setupUrl: string;
  configured: boolean;
  maskedValue: string;
}

function ServiceKeysSection() {
  const [keys, setKeys] = useState<ServiceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();

  const fetchKeys = useCallback(async () => {
    try {
      setError(null);
      const base = getBackendBaseUrl();
      const res = await fetch(`${base}/api/service-keys`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      } else {
        setError(`Failed to load keys (${res.status})`);
      }
    } catch {
      setError("Could not connect to server");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleSave = async (id: string) => {
    setSaving(true);
    try {
      const base = getBackendBaseUrl();
      const res = await fetch(`${base}/api/service-keys/${id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ value: keyInput.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        setKeyInput("");
        setError(null);
        await fetchKeys();
      } else {
        setError(`Failed to save key (${res.status})`);
      }
    } catch {
      setError("Could not connect to server");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const base = getBackendBaseUrl();
      const res = await fetch(`${base}/api/service-keys/${id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ value: "" }),
      });
      if (res.ok) {
        setEditingId(null);
        setKeyInput("");
        setError(null);
        await fetchKeys();
      } else {
        setError(`Failed to remove key (${res.status})`);
      }
    } catch {
      setError("Could not connect to server");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && keys.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={fetchKeys} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-3">{t("settings.apiKeysHint")}</p>

      {keys.map((sk) => (
        <div key={sk.id} className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-3 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-200">{sk.label}</span>
              <p className="text-[10px] text-gray-500">{sk.description}</p>
            </div>
            {sk.configured ? (
              <span className="text-[10px] text-green-500 flex items-center gap-0.5 shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                {t("settings.configured")}
              </span>
            ) : (
              <span className="text-[10px] text-gray-600 shrink-0">{t("settings.notConfigured")}</span>
            )}
          </div>

          {/* Current value or env var */}
          <div className="flex items-center gap-2">
            <code className="text-[10px] text-gray-500 bg-gray-900/60 px-1.5 py-0.5 rounded font-mono">{sk.envVar}</code>
            {sk.configured && editingId !== sk.id && (
              <span className="text-[10px] text-gray-400 font-mono">{sk.maskedValue}</span>
            )}
            <span className="flex-1" />
            {editingId !== sk.id && (
              <button
                onClick={() => { setEditingId(sk.id); setKeyInput(""); }}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {sk.configured ? t("settings.edit") : t("settings.setUp")}
              </button>
            )}
          </div>

          {/* Edit form */}
          {editingId === sk.id && (
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={t("settings.apiKeyPlaceholder")}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/50 font-mono"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && keyInput.trim() && handleSave(sk.id)}
                />
                <button
                  onClick={() => handleSave(sk.id)}
                  disabled={!keyInput.trim() || saving}
                  className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-40"
                >
                  {saving ? "..." : t("settings.save")}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <a
                  href={sk.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  {t("settings.getApiKey")}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </a>
                <div className="flex items-center gap-2">
                  {sk.configured && (
                    <button onClick={() => handleDelete(sk.id)} disabled={saving} className="text-[10px] text-red-400 hover:text-red-300 transition-colors disabled:opacity-40">
                      {t("settings.remove")}
                    </button>
                  )}
                  <button onClick={() => setEditingId(null)} className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors">
                    {t("settings.cancel")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <p className="text-[10px] text-gray-600 text-center pt-2">{t("settings.apiKeysStorageHint")}</p>
    </div>
  );
}

// ── Data Sources Section ─────────────────────────────────────────────────────

interface SourceConfig {
  key: string;
  icon: string;
  label: string;
  description: string;
}

const DATA_SOURCES: SourceConfig[] = [
  { key: "browserHistory", icon: "🌐", label: "Browser History", description: "Learn from your browsing patterns, frequent sites, and search queries" },
  { key: "bookmarks", icon: "🔖", label: "Bookmarks", description: "Understand your saved resources and categorized interests" },
  { key: "email", icon: "📧", label: "Email", description: "Analyze email subjects and contacts to understand your communication" },
  { key: "files", icon: "📁", label: "Files & Projects", description: "Detect your code projects, recently modified files, and work patterns" },
  { key: "system", icon: "💻", label: "System Info", description: "Know your installed applications and development tools" },
];

export function DataSourcesSection() {
  const { t } = useT();
  const wsClient = useChatStore((s) => s._wsClient);
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState(false);
  const [scanningSources, setScanningSources] = useState<string[] | null>(null);
  const [lastScan, setLastScan] = useState<Record<string, number>>({});
  const [profileExists, setProfileExists] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Fetch current status on mount
  useEffect(() => {
    if (!wsClient) return;
    const base = getBackendBaseUrl();
    const headers = authHeaders();
    // Use a custom fetch to get status since there's no dedicated REST endpoint
    // We'll send a WS message instead
    wsClient.send({ type: "settings.get_context_status" } as never);
  }, [wsClient]);

  // Listen for status responses
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      // Check for context status updates in the latest card data
      const cards = Object.values(state.cards);
      for (const card of cards) {
        const data = card.data as Record<string, unknown> | undefined;
        if (data?.contextStatus) {
          const status = data.contextStatus as {
            consent: Record<string, boolean>;
            scanLog: Record<string, number>;
            profileExists: boolean;
          };
          setConsent(status.consent || {});
          setLastScan(status.scanLog || {});
          setProfileExists(status.profileExists);
        }
        if (data?.contextConsent) {
          setConsent(data.contextConsent as Record<string, boolean>);
        }
        if (data?.contextScanStatus) {
          const scanStatus = data.contextScanStatus as { scanning: boolean; sources?: string[] | null; result?: unknown };
          setScanning(scanStatus.scanning);
          setScanningSources(scanStatus.scanning ? (scanStatus.sources || null) : null);
          if (scanStatus.result) setProfileExists(true);
        }
        if (data?.contextCleared) {
          setProfileExists(false);
          setLastScan({});
        }
      }
    });
    return unsub;
  }, []);

  const toggleSource = (key: string) => {
    const newValue = !consent[key];
    setConsent((prev) => ({ ...prev, [key]: newValue }));
    wsClient?.send({ type: "settings.set_context_consent", source: key, enabled: newValue } as never);
  };

  const scanNow = (sources?: string[]) => {
    setScanning(true);
    setScanningSources(sources || null);
    wsClient?.send({ type: "settings.context_scan_now", ...(sources ? { sources } : {}) } as never);
  };

  const clearData = () => {
    wsClient?.send({ type: "settings.context_clear_data" } as never);
    setClearConfirm(false);
  };

  const anyEnabled = Object.values(consent).some(Boolean);

  return (
    <div className="space-y-4">
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3">
        <p className="text-xs text-indigo-300 leading-relaxed">
          {t("settings.dataSourcesHint")}
        </p>
      </div>

      {DATA_SOURCES.map((source) => {
        const isEnabled = !!consent[source.key];
        const isThisScanning = scanning && scanningSources?.includes(source.key);
        return (
          <div
            key={source.key}
            className="flex items-center justify-between py-2 border-b border-gray-800/40 last:border-0"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg flex-shrink-0">{source.icon}</span>
              <div className="min-w-0">
                <p className="text-sm text-gray-200 font-medium">{source.label}</p>
                <p className="text-xs text-gray-500 truncate">{source.description}</p>
                {lastScan[source.key] && (
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    Last scan: {new Date(lastScan[source.key]).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => scanNow([source.key])}
                disabled={!isEnabled || scanning}
                title={isEnabled ? `Scan ${source.label}` : "Enable this source first"}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  isThisScanning
                    ? "bg-indigo-500/30 text-indigo-300 animate-pulse"
                    : isEnabled && !scanning
                      ? "bg-gray-700/60 text-gray-400 hover:bg-indigo-500/20 hover:text-indigo-300"
                      : "bg-gray-800/30 text-gray-600 cursor-not-allowed"
                }`}
              >
                {isThisScanning ? "Scanning..." : "Scan"}
              </button>
              <button
                onClick={() => toggleSource(source.key)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  isEnabled ? "bg-indigo-500" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    isEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        );
      })}

      {/* Scan All & Status */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => scanNow()}
          disabled={!anyEnabled || scanning}
          className="px-4 py-1.5 text-xs rounded-md bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {scanning && !scanningSources ? "Scanning All..." : "Scan All"}
        </button>
        {profileExists && (
          <span className="text-[10px] text-green-500">Profile built</span>
        )}
        {scanning && scanningSources && (
          <span className="text-[10px] text-indigo-400 animate-pulse">
            Scanning {scanningSources.length === 1
              ? DATA_SOURCES.find(s => s.key === scanningSources[0])?.label || scanningSources[0]
              : `${scanningSources.length} sources`}...
          </span>
        )}
      </div>

      {/* Clear Data */}
      <div className="pt-2 border-t border-gray-800/50">
        {!clearConfirm ? (
          <button
            onClick={() => setClearConfirm(true)}
            className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
          >
            Clear All Scanned Data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Delete all cached scans and profile?</span>
            <button
              onClick={clearData}
              className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
            >
              Yes, Clear
            </button>
            <button
              onClick={() => setClearConfirm(false)}
              className="px-2 py-1 text-xs rounded text-gray-500 hover:text-gray-400"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-600 text-center pt-1">
        {t("settings.dataSourcesPrivacy")}
      </p>
    </div>
  );
}
