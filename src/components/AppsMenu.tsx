import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../store/chat";

const FAMILY_ICONS: Record<string, string> = {
  alpharank: "\uD83D\uDCC8",
  filesystem: "\uD83D\uDCC1",
  code_workspace: "\uD83D\uDCBB",
  multimedia: "\uD83C\uDFA5",
  travel_planner: "\u2708\uFE0F",
  meal_planner: "\uD83C\uDF7D\uFE0F",
};

export default function AppsMenu() {
  const apps = useChatStore((s) => s.apps);
  const fetchApps = useChatStore((s) => s.fetchApps);
  const runApp = useChatStore((s) => s.runApp);
  const saveAppToCodebase = useChatStore((s) => s.saveAppToCodebase);
  const restartServer = useChatStore((s) => s.restartServer);
  const launchEnsoCode = useChatStore((s) => s.launchEnsoCode);
  const ensoProjectPath = useChatStore((s) => s.ensoProjectPath);
  const connectionState = useChatStore((s) => s.connectionState);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const disabled = connectionState !== "connected";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleOpen() {
    if (disabled) return;
    if (!open) fetchApps();
    setOpen(!open);
  }

  function handleRun(toolFamily: string) {
    runApp(toolFamily);
    setOpen(false);
  }

  function handleSaveToCodebase(e: React.MouseEvent, toolFamily: string) {
    e.stopPropagation();
    saveAppToCodebase(toolFamily);
    setOpen(false);
  }

  function handleRestart() {
    restartServer();
    setOpen(false);
  }

  function handleCode() {
    launchEnsoCode();
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border transition-colors ${
          disabled
            ? "border-gray-700 text-gray-600 cursor-not-allowed"
            : "border-gray-700 text-gray-300 hover:border-gray-600 hover:text-gray-200"
        }`}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Apps
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-lg border border-gray-700 bg-gray-800 shadow-lg z-50 overflow-hidden">
          {apps.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="text-gray-500 text-sm">No apps available</div>
              <div className="text-gray-600 text-xs mt-1">
                Apps will appear here once the server is connected.
              </div>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {apps.map((app) => (
                <button
                  key={app.toolFamily}
                  onClick={() => handleRun(app.toolFamily)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-700/50 transition-colors border-b border-gray-700/20 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">
                      {FAMILY_ICONS[app.toolFamily] ?? "\u2728"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-200 font-medium capitalize">
                          {app.toolFamily.replace(/_/g, " ")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {/* Save to codebase — only for user-local apps */}
                          {!app.builtIn && !app.codebase && (
                            <span
                              role="button"
                              title="Save to codebase"
                              onClick={(e) => handleSaveToCodebase(e, app.toolFamily)}
                              className="text-gray-500 hover:text-blue-400 transition-colors cursor-pointer p-0.5"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                              </svg>
                            </span>
                          )}
                          {/* Codebase indicator */}
                          {app.codebase && (
                            <span className="text-[9px] text-emerald-500/70" title="Saved in codebase">
                              in repo
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500">
                            {app.toolCount} tool{app.toolCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                        {app.description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* Footer actions */}
          <div className="border-t border-gray-700/50 flex">
            {ensoProjectPath && (
              <button
                onClick={handleCode}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors border-r border-gray-700/50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                Code
              </button>
            )}
            <button
              onClick={handleRestart}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
