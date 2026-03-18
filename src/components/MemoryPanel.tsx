import { useState, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { isNative } from "../lib/platform";
import { useChatStore } from "../store/chat";

interface MemoryData {
  user: string | null;
  memory: string | null;
}

export default function MemoryPanel({ show, onClose }: { show: boolean; onClose: () => void }) {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"user" | "memory" | "history">("user");
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const cardOrder = useChatStore((s) => s.cardOrder);

  const fetchMemory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/memory`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show) {
      fetchMemory();
      setEditing(false);
      setClearConfirm(false);
    }
  }, [show, fetchMemory]);

  if (!show) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const field = activeTab === "user" ? "user" : "memory";
      await fetch(`${getBackendBaseUrl()}/api/memory`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ [field]: editText }),
      });
      setData((prev) => (prev ? { ...prev, [field]: editText || null } : prev));
      setEditing(false);
    } catch {
      // Show inline error if needed
    } finally {
      setSaving(false);
    }
  };

  const handleClearHistory = async () => {
    setClearing(true);
    try {
      const storage = isNative ? localStorage : sessionStorage;
      const clientId = storage.getItem("enso-clientId");
      if (clientId) {
        await fetch(`${getBackendBaseUrl()}/api/history?clientId=${encodeURIComponent(clientId)}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
      }
      useChatStore.setState({ cardOrder: [], cards: {} });
      setClearConfirm(false);
      onClose();
    } catch {
      // Silently fail
    } finally {
      setClearing(false);
    }
  };

  const startEdit = () => {
    const current = activeTab === "user" ? data?.user : data?.memory;
    setEditText(current ?? "");
    setEditing(true);
  };

  const content = activeTab === "user" ? data?.user : activeTab === "memory" ? data?.memory : null;
  const tabLabel = activeTab === "user" ? "About You" : activeTab === "memory" ? "Memory" : "Chat History";
  const editableTab = activeTab === "user" || activeTab === "memory";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[80vh] mx-4 bg-gray-900 rounded-xl border border-gray-700/80 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
              <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Z" />
              <path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-100">Memory</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-all duration-150">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          <button
            onClick={() => { setActiveTab("user"); setEditing(false); setClearConfirm(false); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-all duration-150 ${activeTab === "user" ? "bg-violet-500/20 text-violet-300 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
          >
            About You
          </button>
          <button
            onClick={() => { setActiveTab("memory"); setEditing(false); setClearConfirm(false); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-all duration-150 ${activeTab === "memory" ? "bg-violet-500/20 text-violet-300 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
          >
            Memory
          </button>
          <button
            onClick={() => { setActiveTab("history"); setEditing(false); setClearConfirm(false); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-all duration-150 ${activeTab === "history" ? "bg-violet-500/20 text-violet-300 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
          >
            Chat History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "history" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">Chat History</h3>
              </div>
              <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0">
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-300">{cardOrder.length} cards in current session</p>
                    <p className="text-xs text-gray-500 mt-0.5">History is restored automatically when you refresh the page.</p>
                  </div>
                </div>
              </div>

              {/* Clear button with confirmation */}
              <div className="pt-2">
                {clearConfirm ? (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                    <p className="text-sm text-red-300">Are you sure? This will clear all chat history and cannot be undone.</p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setClearConfirm(false)}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-800 transition-all duration-150"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleClearHistory}
                        disabled={clearing}
                        className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded-md transition-all duration-150 disabled:opacity-50"
                      >
                        {clearing ? "Clearing..." : "Yes, Clear All"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setClearConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all duration-150 border border-red-500/20"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    Clear Chat History
                  </button>
                )}
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : editing ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {activeTab === "user"
                  ? "Tell Enso about yourself — your name, preferences, interests, work. This personalizes all responses."
                  : "Edit Enso's memory. This is what Enso remembers from your conversations."}
              </p>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full h-64 bg-gray-800 text-gray-200 text-sm rounded-lg border border-gray-700 p-3 focus:outline-none focus:border-violet-500/50 resize-none font-mono"
                placeholder={activeTab === "user"
                  ? "# About Me\n\nName: ...\nRole: ...\nInterests: ...\nPreferences: ..."
                  : "# Memory\n\nEnso will accumulate notes here over time..."}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-800 transition-all duration-150">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-all duration-150 disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">{tabLabel}</h3>
                {editableTab && (
                  <button onClick={startEdit} className="text-xs text-violet-400 hover:text-violet-300 transition-all duration-150">
                    {content ? "Edit" : "Create"}
                  </button>
                )}
              </div>
              {content ? (
                <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 p-4">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 italic">
                    {activeTab === "user"
                      ? "No profile set yet. Click \"Create\" to tell Enso about yourself."
                      : "No memory yet. Enso will accumulate notes here as you chat."}
                  </p>
                  <button
                    onClick={startEdit}
                    className="mt-3 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-all duration-150"
                  >
                    {activeTab === "user" ? "Create Profile" : "Add Memory"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">
            {activeTab === "user"
              ? "Your profile is stored locally in ~/.enso/ and personalizes all of Enso's responses."
              : activeTab === "memory"
                ? "Memory is stored locally in ~/.enso/ and persists across sessions."
                : "Chat history is saved locally and restored when you refresh the page."}
          </p>
        </div>
      </div>
    </div>
  );
}
