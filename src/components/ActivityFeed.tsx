import { useState, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { pushToast } from "../lib/notifications";

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
  action: { bg: "bg-blue-950/20", border: "border-blue-500/25", text: "text-blue-400", icon: "\u26A1" },
  deliverable: { bg: "bg-emerald-950/20", border: "border-emerald-500/25", text: "text-emerald-400", icon: "\uD83D\uDCE6" },
  insight: { bg: "bg-gray-900/30", border: "border-gray-600/25", text: "text-gray-400", icon: "\uD83D\uDCA1" },
  report: { bg: "bg-violet-950/20", border: "border-violet-500/25", text: "text-violet-400", icon: "\uD83D\uDCCA" },
  recommendation: { bg: "bg-amber-950/20", border: "border-amber-500/25", text: "text-amber-400", icon: "\uD83D\uDCAC" },
  alert: { bg: "bg-red-950/20", border: "border-red-500/25", text: "text-red-400", icon: "\u26A0\uFE0F" },
};

const STATUS_DOTS: Record<string, string> = {
  pending: "bg-amber-400 animate-pulse",
  "in-progress": "bg-blue-400 animate-pulse",
  done: "bg-emerald-400",
  dismissed: "bg-gray-500",
};

// ── Component ──

export function ActivityFeed({ focusId, limit = 20, showResolved = false, focusAreas, onReact }: {
  focusId?: string;
  limit?: number;
  showResolved?: boolean;
  /** Focus area names for grouping — passed from parent to avoid extra fetch */
  focusAreas?: Array<{ id: string; title: string }>;
  /** Called when user wants to respond to an artifact */
  onReact?: (context: { type: "card"; summary: string; focusId?: string; detail?: string }) => void;
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
      if (resp.ok) fetchArtifacts();
    } catch { /* ignore */ }
  };

  const dismissAllResolved = async () => {
    const resolved = artifacts.filter(a => a.status === "done");
    if (resolved.length === 0) return;
    for (const a of resolved) {
      const dismissAction = a.actions?.find(act => act.type === "dismiss");
      if (dismissAction) await handleAction(a.id, dismissAction.id);
    }
    pushToast("Cleared", `${resolved.length} resolved items dismissed`, true, 2000);
    fetchArtifacts();
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
        <p className="text-xs text-gray-500">{"\u2705"} No pending items — agents are working autonomously.</p>
      </div>
    );
  }

  // Group by focus area (only when focusAreas provided and not already filtered by focusId)
  const shouldGroup = !focusId && focusAreas && focusAreas.length > 0;
  const focusMap = new Map(focusAreas?.map(f => [f.id, f.title]) || []);

  // Stats
  const pending = artifacts.filter(a => a.status === "pending" || a.status === "in-progress").length;
  const resolved = artifacts.filter(a => a.status === "done").length;

  // Group artifacts
  const groups: Array<{ label: string; focusId?: string; items: AgentArtifact[] }> = [];
  if (shouldGroup) {
    const byFocus = new Map<string, AgentArtifact[]>();
    for (const a of artifacts) {
      const key = a.focusId || "_general";
      if (!byFocus.has(key)) byFocus.set(key, []);
      byFocus.get(key)!.push(a);
    }
    // Focus-specific groups first (sorted by pending count desc), then general
    const focusKeys = [...byFocus.keys()].filter(k => k !== "_general").sort((a, b) => {
      const ap = byFocus.get(a)!.filter(x => x.status === "pending" || x.status === "in-progress").length;
      const bp = byFocus.get(b)!.filter(x => x.status === "pending" || x.status === "in-progress").length;
      return bp - ap;
    });
    for (const key of focusKeys) {
      groups.push({ label: focusMap.get(key) || key, focusId: key, items: byFocus.get(key)! });
    }
    if (byFocus.has("_general")) {
      groups.push({ label: "General", items: byFocus.get("_general")! });
    }
  } else {
    groups.push({ label: "", items: artifacts });
  }

  return (
    <div className="space-y-3">
      {/* Stats bar + batch actions */}
      <div className="flex items-center gap-2 text-[10px]">
        {pending > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
            {pending} pending
          </span>
        )}
        {resolved > 0 && (
          <>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {resolved} done
            </span>
            <button
              onClick={dismissAllResolved}
              className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear resolved
            </button>
          </>
        )}
      </div>

      {groups.map((group, gi) => (
        <div key={gi}>
          {/* Group header (only when grouping) */}
          {shouldGroup && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-medium text-gray-400">{"\uD83C\uDFAF"} {group.label}</span>
              <span className="text-[9px] text-gray-600">
                {group.items.filter(a => a.status === "pending" || a.status === "in-progress").length} active
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            {group.items.map(artifact => {
              const style = TYPE_STYLES[artifact.type] || TYPE_STYLES.insight;
              const isExpanded = expanded.has(artifact.id);
              const isActive = artifact.status === "pending" || artifact.status === "in-progress";
              const age = formatTimeAgo(artifact.createdAt);

              return (
                <div key={artifact.id}
                  className={`rounded-lg border px-3 py-2.5 ${style.bg} ${style.border} ${
                    !isActive ? "opacity-50" : ""
                  } transition-all`}>
                  {/* Header row */}
                  <div className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${STATUS_DOTS[artifact.status]}`} />
                    <button onClick={() => toggleExpand(artifact.id)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px]">{style.icon}</span>
                        <span className={`text-[10px] font-medium ${style.text}`}>{artifact.agentName}</span>
                        <span className="text-[9px] text-gray-600">{"\u00B7"}</span>
                        <span className="text-[9px] text-gray-600">{age}</span>
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

                  {/* Action buttons + respond */}
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-4 ml-1">
                    {isActive && artifact.actions?.map(action => (
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
                    {/* Respond button — always available on active items */}
                    {isActive && onReact && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReact({
                            type: "card",
                            summary: `${artifact.type}: ${artifact.title.slice(0, 60)}`,
                            focusId: artifact.focusId,
                            detail: artifact.body?.slice(0, 150),
                          });
                        }}
                        className="text-[10px] px-2 py-1 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-colors"
                      >
                        Respond
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
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
