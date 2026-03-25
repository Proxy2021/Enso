import { useState, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { getActiveBackend } from "../lib/connection";
import { useMemoryApi } from "../hooks/useMemoryApi";
import { MemorySection } from "./SettingsPanel";
import SettingsPanel from "./SettingsPanel";
import DebugReporter from "./DebugReporter";
import { useTheme } from "../lib/theme";

export default function SettingsView() {
  const { t } = useT();
  const state = useChatStore((s) => s.connectionState);
  const setShowPicker = useChatStore((s) => s.setShowConnectionPicker);
  const active = getActiveBackend();
  const cardCount = useChatStore((s) => s.cardOrder.length);
  const chatModel = useChatStore((s) => s.chatModel);
  const { theme, toggleTheme } = useTheme();

  const { memory, fetchMemory } = useMemoryApi();
  const [profileExpanded, setProfileExpanded] = useState(false);

  useEffect(() => { fetchMemory(); }, [fetchMemory]);

  const userName = extractName(memory?.user ?? null);
  const userInitial = userName ? userName.charAt(0).toUpperCase() : "E";
  const userRole = extractRole(memory?.user ?? null);

  return (
    <div className="flex-1 overflow-y-auto mobile-view-enter">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-4 sm:py-6">

        <div className="space-y-3">
          {/* Profile card — shows real user data from memory API */}
          <button
            onClick={() => setProfileExpanded((v) => !v)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-900/60 border border-gray-800/60 hover:bg-gray-800/40 transition-all cursor-pointer text-left"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <span className="text-white text-xl font-bold">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-100">{userName || "Enso User"}</p>
              <p className="text-xs text-gray-500">{userRole || "Tap to set up your profile"}</p>
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-gray-600 transition-transform duration-200 ${profileExpanded ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Expandable profile editor — About You + Memory + History */}
          {profileExpanded && (
            <div className="rounded-2xl bg-gray-900/40 border border-gray-800/50 p-4">
              <MemorySection />
            </div>
          )}

          {/* Dark mode toggle */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gray-900/40 border border-gray-800/50">
            <div className="w-9 h-9 rounded-xl bg-gray-800/60 flex items-center justify-center shrink-0">
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200">Appearance</p>
              <p className="text-xs text-gray-500">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                theme === "dark" ? "bg-indigo-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  theme === "dark" ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Connection */}
          <button
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-900/40 border border-gray-800/50 hover:bg-gray-800/40 active:bg-gray-800/60 transition-all cursor-pointer"
          >
            <div className={`w-3 h-3 rounded-full shrink-0 ${state === "connected" ? "bg-emerald-400" : state === "connecting" ? "bg-amber-400 animate-pulse" : "bg-red-400"}`} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-gray-200">{state === "connected" ? (active?.name || "Enso Server") : "Not connected"}</p>
              <p className="text-xs text-gray-500 capitalize">{state}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600"><polyline points="9 18 15 12 9 6" /></svg>
          </button>

          {/* Settings */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gray-900/40 border border-gray-800/50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200">{t("settings.title")}</p>
              <p className="text-xs text-gray-500 mt-0.5">{chatModel ? `Model: ${chatModel}` : ""}</p>
            </div>
            <SettingsPanel />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-gray-900/40 border border-gray-800/50">
              <p className="text-2xl font-bold text-gray-200">{cardCount}</p>
              <p className="text-xs text-gray-500 mt-1">{t("settings.cardsInSession")}</p>
            </div>
            <div className="p-4 rounded-2xl bg-gray-900/40 border border-gray-800/50">
              <p className="text-2xl font-bold text-gray-200">{state === "connected" ? "Online" : "Offline"}</p>
              <p className="text-xs text-gray-500 mt-1">Status</p>
            </div>
          </div>

          {/* Debug reporter */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gray-900/40 border border-gray-800/50">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-200">Debug</p>
              <p className="text-xs text-gray-500">Report issues & view logs</p>
            </div>
            <DebugReporter />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Extract a name from the ENSO_USER.md markdown content.
 *  Looks for "Name: X" lines or "# About Me" then the first non-empty line. */
function extractName(text: string | null): string | null {
  if (!text) return null;
  const nameMatch = text.match(/^name\s*[:：]\s*(.+)/mi);
  if (nameMatch) return nameMatch[1].trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    if (line.length > 2 && line.length < 60) return line;
  }
  return null;
}

/** Extract a role/title from the markdown content. */
function extractRole(text: string | null): string | null {
  if (!text) return null;
  const roleMatch = text.match(/^(?:role|Role|title|Title|profession|Profession|what.*do)\s*[:：]\s*(.+)/m);
  if (roleMatch) return roleMatch[1].trim();
  return null;
}
