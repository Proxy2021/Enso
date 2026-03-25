import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { getActiveBackend } from "../lib/connection";
import SettingsPanel from "./SettingsPanel";
import DebugReporter from "./DebugReporter";

export default function SettingsView() {
  const { t } = useT();
  const state = useChatStore((s) => s.connectionState);
  const setShowPicker = useChatStore((s) => s.setShowConnectionPicker);
  const active = getActiveBackend();
  const cardCount = useChatStore((s) => s.cardOrder.length);
  const chatModel = useChatStore((s) => s.chatModel);

  return (
    <div className="flex-1 overflow-y-auto mobile-view-enter">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <h1 className="text-lg font-semibold text-gray-100 mb-5">{t("tab.me")}</h1>

        <div className="space-y-3">
          {/* Profile card */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gray-900/60 border border-gray-800/60">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white text-xl font-bold">E</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-100">Enso</p>
              <p className="text-xs text-gray-500">AI Sandbox</p>
            </div>
          </div>

          {/* Connection */}
          <button
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-900/40 border border-gray-800/50 hover:bg-gray-800/40 active:bg-gray-800/60 transition-all cursor-pointer"
          >
            <div className={`w-3 h-3 rounded-full shrink-0 ${state === "connected" ? "bg-emerald-400" : state === "connecting" ? "bg-amber-400 animate-pulse" : "bg-red-400"}`} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-gray-200">{active ? active.name : "Not connected"}</p>
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
