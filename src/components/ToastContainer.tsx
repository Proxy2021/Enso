import { useEffect, useState } from "react";
import { subscribeToasts, dismissToast, type ToastEntry } from "../lib/notifications";

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-[max(3.5rem,calc(env(safe-area-inset-top)+3rem))] right-3 left-3 sm:left-auto sm:w-80 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl shadow-lg border backdrop-blur-sm animate-[slideDown_0.25s_ease-out] ${
            toast.success
              ? "bg-gray-900/90 border-emerald-500/30"
              : "bg-gray-900/90 border-red-500/30"
          }`}
          onClick={() => dismissToast(toast.id)}
          role="alert"
        >
          <div className={`mt-0.5 text-sm flex-shrink-0 ${toast.success ? "text-emerald-400" : "text-red-400"}`}>
            {toast.success ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-100 truncate">{toast.title}</div>
            <div className="text-xs text-gray-400 truncate mt-0.5">{toast.body}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}
            className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 mt-0.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
