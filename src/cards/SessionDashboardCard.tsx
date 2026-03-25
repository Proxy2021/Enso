import { useState, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import type { CardRendererProps } from "./types";

// ── Types (mirrors session-registry.ts) ──

interface SessionInfo {
  sessionId: string;
  runId: string;
  type: string;
  orchestrationId?: string;
  taskId?: string;
  agentRole?: string;
  description: string;
  startedAt: number;
  status: string;
  model?: string;
}

interface OrchestrationInfo {
  orchestrationId: string;
  type: string;
  goal: string;
  status: string;
  startedAt: number;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  runningCount: number;
}

interface SystemStatus {
  sessions: SessionInfo[];
  orchestrations: OrchestrationInfo[];
}

// ── Helpers ──

function formatElapsedTime(startedAt: number): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  return `${h}h ${m}m`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function typeBadgeColor(type: string): string {
  switch (type) {
    case "evolution": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "discovery": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "orchestration": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "claude-code": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "build": return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    case "deep-research": return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
    case "orchestration-task": return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    default: return "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "running":
    case "executing": return "text-green-400";
    case "paused": return "text-yellow-400";
    case "completed":
    case "complete": return "text-zinc-500";
    case "failed":
    case "cancelled": return "text-red-400";
    case "planning":
    case "reviewing": return "text-blue-400";
    default: return "text-zinc-400";
  }
}

// ── Component ──

export default function SessionDashboardCard({ card }: CardRendererProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/sessions`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch session status");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const doAction = useCallback(async (method: string, path: string, actionKey: string) => {
    setActionInFlight(actionKey);
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Refresh immediately after action
      await fetchStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionInFlight(null);
    }
  }, [fetchStatus]);

  const stopSession = (runId: string) => doAction("DELETE", `/api/sessions/${runId}`, `stop-${runId}`);
  const cancelOrch = (id: string) => doAction("DELETE", `/api/orchestrations/${id}`, `cancel-${id}`);
  const pauseOrch = (id: string) => doAction("POST", `/api/orchestrations/${id}/pause`, `pause-${id}`);

  const stopAll = useCallback(async () => {
    if (!status) return;
    setActionInFlight("stop-all");
    const baseUrl = getBackendBaseUrl();
    const headers = authHeaders();
    const promises: Promise<any>[] = [];
    for (const s of status.sessions.filter((s) => s.status === "running")) {
      promises.push(fetch(`${baseUrl}/api/sessions/${s.runId}`, { method: "DELETE", headers }).catch(() => {}));
    }
    for (const o of status.orchestrations.filter((o) => ["executing", "planning", "reviewing", "paused"].includes(o.status))) {
      promises.push(fetch(`${baseUrl}/api/orchestrations/${o.orchestrationId}`, { method: "DELETE", headers }).catch(() => {}));
    }
    await Promise.allSettled(promises);
    await fetchStatus();
    setActionInFlight(null);
  }, [status, fetchStatus]);

  const activeSessions = status?.sessions.filter((s) => s.status === "running") ?? [];
  const activeOrchs = status?.orchestrations.filter((o) =>
    ["planning", "reviewing", "executing", "paused"].includes(o.status),
  ) ?? [];
  const hasAnything = activeSessions.length > 0 || activeOrchs.length > 0;

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/90 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-zinc-100">Session Dashboard</span>
          {status && (
            <span className="text-[10px] text-zinc-500 tabular-nums">
              {activeSessions.length} session{activeSessions.length !== 1 ? "s" : ""} / {activeOrchs.length} orchestration{activeOrchs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {hasAnything && (
          <button
            onClick={stopAll}
            disabled={actionInFlight === "stop-all"}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {actionInFlight === "stop-all" ? "Stopping..." : "Stop All"}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Empty state */}
        {status && !hasAnything && (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
            <svg className="w-8 h-8 mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
            </svg>
            <span className="text-sm">No active sessions</span>
            <span className="text-[11px] mt-1">Sessions and orchestrations will appear here when running</span>
          </div>
        )}

        {/* Active Orchestrations */}
        {activeOrchs.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-2">
              Active Orchestrations
            </div>
            <div className="space-y-2">
              {activeOrchs.map((o) => (
                <div
                  key={o.orchestrationId}
                  className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadgeColor(o.type)}`}>
                          {o.type}
                        </span>
                        <span className={`text-[10px] font-medium ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                        <span className="text-[10px] text-zinc-500 tabular-nums">
                          {formatElapsedTime(o.startedAt)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-300 truncate">{truncate(o.goal, 80)}</div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-zinc-500">
                          {o.completedCount}/{o.taskCount} completed
                        </span>
                        {o.runningCount > 0 && (
                          <span className="text-[10px] text-green-400">
                            {o.runningCount} running
                          </span>
                        )}
                        {o.failedCount > 0 && (
                          <span className="text-[10px] text-red-400">
                            {o.failedCount} failed
                          </span>
                        )}
                        {/* Progress bar */}
                        <div className="flex-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                            style={{ width: o.taskCount > 0 ? `${(o.completedCount / o.taskCount) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {o.status === "executing" && (
                        <button
                          onClick={() => pauseOrch(o.orchestrationId)}
                          disabled={actionInFlight === `pause-${o.orchestrationId}`}
                          className="px-2 py-1 text-[10px] font-medium rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 hover:bg-yellow-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Pause
                        </button>
                      )}
                      <button
                        onClick={() => cancelOrch(o.orchestrationId)}
                        disabled={actionInFlight === `cancel-${o.orchestrationId}`}
                        className="px-2 py-1 text-[10px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-2">
              Active Sessions
            </div>
            <div className="space-y-2">
              {activeSessions.map((s) => (
                <div
                  key={s.runId}
                  className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadgeColor(s.type)}`}>
                          {s.type}
                        </span>
                        <span className="text-[10px] text-zinc-500 tabular-nums">
                          {formatElapsedTime(s.startedAt)}
                        </span>
                        {s.model && (
                          <span className="text-[10px] text-zinc-600">{s.model}</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-300 truncate">{truncate(s.description, 80)}</div>
                    </div>
                    <button
                      onClick={() => stopSession(s.runId)}
                      disabled={actionInFlight === `stop-${s.runId}`}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {!status && !error && (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-zinc-600 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
