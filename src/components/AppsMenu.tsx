import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../store/chat";

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
              <div className="text-gray-500 text-sm">No apps yet</div>
              <div className="text-gray-600 text-xs mt-1">
                Build an app from any assistant response using the Build App button.
              </div>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <div className="px-3 py-2 border-b border-gray-700/50">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">
                  {apps.length} app{apps.length !== 1 ? "s" : ""}
                </span>
              </div>
              {apps.map((app) => (
                <button
                  key={app.toolFamily}
                  onClick={() => handleRun(app.toolFamily)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-700/50 transition-colors border-b border-gray-700/30 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-200 font-medium">
                      {app.toolFamily.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <span className="text-[10px] text-gray-500 bg-gray-900/60 px-1.5 py-0.5 rounded">
                      {app.toolCount} tool{app.toolCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                    {app.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
