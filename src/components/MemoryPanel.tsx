import { useState, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";

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
  const [activeTab, setActiveTab] = useState<"user" | "memory">("user");

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
      // Silently fail — workspace may not be available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show) {
      fetchMemory();
      setEditing(false);
    }
  }, [show, fetchMemory]);

  if (!show) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${getBackendBaseUrl()}/api/memory`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ user: editText }),
      });
      setData((prev) => (prev ? { ...prev, user: editText } : prev));
      setEditing(false);
    } catch {
      // Show inline error if needed
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    setEditText(data?.user ?? "");
    setEditing(true);
  };

  const content = activeTab === "user" ? data?.user : data?.memory;
  const tabLabel = activeTab === "user" ? "About You" : "Agent Memory";

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
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          <button
            onClick={() => { setActiveTab("user"); setEditing(false); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === "user" ? "bg-violet-500/20 text-violet-300 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
          >
            About You
          </button>
          <button
            onClick={() => { setActiveTab("memory"); setEditing(false); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === "memory" ? "bg-violet-500/20 text-violet-300 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
          >
            Agent Memory
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !data || (!data.user && !data.memory) ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">Memory not available yet.</p>
              <p className="text-gray-600 text-xs mt-1">Send a message first so the agent can initialize.</p>
            </div>
          ) : editing ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Edit your profile information below. This is what the agent knows about you.</p>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full h-64 bg-gray-800 text-gray-200 text-sm rounded-lg border border-gray-700 p-3 focus:outline-none focus:border-violet-500/50 resize-none font-mono"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-800 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">{tabLabel}</h3>
                {activeTab === "user" && data.user && (
                  <button onClick={startEdit} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                    Edit
                  </button>
                )}
              </div>
              {content ? (
                <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 p-4">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  {activeTab === "user" ? "No user profile found." : "No agent memory found."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">
            {activeTab === "user"
              ? "Your profile is stored locally and used to personalize the agent's responses."
              : "Agent memory is built from conversations and persists across sessions."}
          </p>
        </div>
      </div>
    </div>
  );
}
