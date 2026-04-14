import { useState, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";

// ── Types (mirrors server/src/agent-artifacts.ts) ──

interface ArtifactAction {
  id: string;
  label: string;
  type: "approve" | "reject" | "execute" | "navigate" | "dismiss";
  payload?: Record<string, unknown>;
}

interface AgentArtifact {
  id: string;
  type: "action" | "deliverable" | "insight" | "report" | "recommendation" | "alert";
  agentId: string;
  agentName: string;
  focusId?: string;
  title: string;
  body: string;
  status: "pending" | "in-progress" | "done" | "dismissed";
  actions?: ArtifactAction[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

// ── Styling ──

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  action: { bg: "bg-blue-950/20", border: "border-blue-500/25", text: "text-blue-400", icon: "⚡" },
  deliverable: { bg: "bg-emerald-950/20", border: "border-emerald-500/25", text: "text-emerald-400", icon: "📦" },
  insight: { bg: "bg-gray-900/30", border: "border-gray-600/25", text: "text-gray-400", icon: "💡" },
  report: { bg: "bg-violet-950/20", border: "border-violet-500/25", text: "text-violet-400", icon: "📊" },
  recommendation: { bg: "bg-amber-950/20", border: "border-amber-500/25", text: "text-amber-400", icon: "💬" },
  alert: { bg: "bg-red-950/20", border: "border-red-500/25", text: "text-red-400", icon: "⚠️" },
};

const STATUS_DOTS: Record<string, string> = {
  pending: "bg-amber-400 animate-pulse",
  "in-progress": "bg-blue-400 animate-pulse",
  done: "bg-emerald-400",
  dismissed: "bg-gray-500",
};

// ── Component ──

export function ActivityFeed({ focusId, limit = 20, showResolved = false }: {
  focusId?: string;
  limit?: number;
  showResolved?: boolean;
}) {
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchArtifacts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (focusId) params.set("focusId", focusId);
      if (!showResolved) params.set("status", "pending,in-progress");
      if (limit) params.set("limit", String(limit));
      const resp = await fetch(`${getBackendBaseUrl()}/api/artifacts?${params}`, { headers: authHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        setArtifacts(data.artifacts || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [focusId, limit, showResolved]);

  useEffect(() => {
    fetchArtifacts();
    // Poll every 10s for updates
    const interval = setInterval(fetchArtifacts, 10_000);
    return () => clearInterval(interval);
  }, [fetchArtifacts]);

  const handleAction = async (artifactId: string, actionId: string) => {
    try {
      const resp = await fetch(`${getBackendBaseUrl()}/api/artifacts/${artifactId}/action`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ actionId }),
      });
      if (resp.ok) {
        // Refresh after action
        fetchArtifacts();
      }
    } catch { /* ignore */ }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="text-xs text-gray-600 py-2">Loading activity...</div>;
  if (artifacts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800/30 bg-gray-900/20 px-4 py-3">
        <p className="text-xs text-gray-500">✅ No pending items — agents are working autonomously.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map(artifact => {
        const style = TYPE_STYLES[artifact.type] || TYPE_STYLES.insight;
        const isExpanded = expanded.has(artifact.id);
        const isActive = artifact.status === "pending" || artifact.status === "in-progress";
        const timeAgo = formatTimeAgo(artifact.createdAt);

        return (
          <div key={artifact.id}
            className={`rounded-lg border px-3 py-2.5 ${style.bg} ${style.border} ${
              !isActive ? "opacity-60" : ""
            } transition-all`}>
            {/* Header row */}
            <div className="flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${STATUS_DOTS[artifact.status]}`} />
              <button onClick={() => toggleExpand(artifact.id)} className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">{style.icon}</span>
                  <span className={`text-[10px] font-medium ${style.text}`}>{artifact.agentName}</span>
                  <span className="text-[9px] text-gray-600">·</span>
                  <span className="text-[9px] text-gray-600">{timeAgo}</span>
                </div>
                <p className="text-xs text-gray-200 mt-0.5 line-clamp-2">{artifact.title}</p>
              </button>
            </div>

            {/* Expanded body */}
            {isExpanded && artifact.body && (
              <div className="mt-2 pl-4 text-[11px] text-gray-400 leading-relaxed border-l border-gray-700/30 ml-1">
                {artifact.body.split("\n").map((line, i) => (
                  <p key={i} className={line.startsWith("- ") ? "ml-2" : ""}>{line}</p>
                ))}
              </div>
            )}

            {/* Resolution */}
            {artifact.resolution && isExpanded && (
              <div className="mt-1.5 pl-4 ml-1">
                <span className="text-[9px] text-gray-600">Resolution: {artifact.resolution}</span>
              </div>
            )}

            {/* Action buttons */}
            {isActive && artifact.actions && artifact.actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 pl-4 ml-1">
                {artifact.actions.map(action => (
                  <button key={action.id}
                    onClick={(e) => { e.stopPropagation(); handleAction(artifact.id, action.id); }}
                    className={`text-[10px] px-2.5 py-1 rounded transition-colors ${
                      action.type === "approve" || action.type === "execute"
                        ? "bg-emerald-600/30 text-emerald-300 hover:bg-emerald-500/40 border border-emerald-500/20"
                        : action.type === "dismiss" || action.type === "reject"
                        ? "bg-gray-700/30 text-gray-400 hover:bg-gray-600/40 border border-gray-600/20"
                        : "bg-violet-600/30 text-violet-300 hover:bg-violet-500/40 border border-violet-500/20"
                    }`}>
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default ActivityFeed;
