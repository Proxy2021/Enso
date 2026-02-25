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

  const builtIn = apps.filter((a) => a.builtIn);
  const custom = apps.filter((a) => !a.builtIn);

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
              {/* Built-in apps */}
              {builtIn.length > 0 && (
                <>
                  <div className="px-3 py-1.5 border-b border-gray-700/50">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500">
                      Built-in
                    </span>
                  </div>
                  {builtIn.map((app) => (
                    <button
                      key={app.toolFamily}
                      onClick={() => handleRun(app.toolFamily)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700/50 transition-colors border-b border-gray-700/20 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base shrink-0">
                          {FAMILY_ICONS[app.toolFamily] ?? "\uD83D\uDD27"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-200 font-medium capitalize">
                              {app.toolFamily.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {app.toolCount} action{app.toolCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                            {app.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Custom apps */}
              {custom.length > 0 && (
                <>
                  <div className="px-3 py-1.5 border-b border-gray-700/50">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500">
                      Custom {custom.length > 0 && `(${custom.length})`}
                    </span>
                  </div>
                  {custom.map((app) => (
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
                            <span className="text-[10px] text-gray-500 bg-gray-900/60 px-1.5 py-0.5 rounded">
                              {app.toolCount} tool{app.toolCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                            {app.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
