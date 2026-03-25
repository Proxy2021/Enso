import { useState, useEffect, useCallback, useMemo } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import type { Card } from "../cards/types";
import { isOrchestrationCardData } from "@shared/types";
import { formatElapsed } from "../lib/useElapsedTime";
import { TOOL_ID_CLAUDE_CODE } from "../lib/constants";

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

interface RecoverableInfo {
  orchestrationId: string;
  goal: string;
  startedAt: number;
  taskCount: number;
  completedCount: number;
}

// ── Completed task derivation (from card state, like ResultsInbox) ──

interface CompletedTask {
  cardId: string;
  type: "claude_code" | "orchestration" | "build" | "deep_research" | "research";
  title: string;
  subtitle: string;
  completedAt: number;
  success: boolean;
}

function isCompletedLongRunning(card: Card): boolean {
  if (card.role !== "assistant") return false;
  if (card.status !== "complete" && card.status !== "error") return false;
  if (card.type === "terminal" && card.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) return true;
  if (card.type === "orchestration") {
    const orchData = isOrchestrationCardData(card.data) ? card.data : undefined;
    const plan = orchData?.orchestrationProgress?.plan || orchData?.orchestrationPlan;
    return plan?.status === "completed" || plan?.status === "failed";
  }
  if (card.appGeneratedUI && card.standardDataSnapshot) return true;
  const toolName = (card.data && typeof card.data === "object" && "tool" in card.data)
    ? (card.data as { tool?: string }).tool : undefined;
  if (toolName?.includes("research") && card.generatedUI) return true;
  return false;
}

function deriveCompleted(cards: Record<string, Card>, cardOrder: string[]): CompletedTask[] {
  const results: CompletedTask[] = [];
  for (const id of cardOrder) {
    const card = cards[id];
    if (!card || !isCompletedLongRunning(card)) continue;
    let type: CompletedTask["type"] = "claude_code";
    let title = "Task";
    let subtitle = "";
    if (card.type === "terminal") {
      type = "claude_code";
      title = "Claude Code";
      subtitle = card.text?.slice(0, 80) || "Session completed";
    } else if (card.type === "orchestration") {
      type = "orchestration";
      const od = isOrchestrationCardData(card.data) ? card.data : undefined;
      title = "Orchestration";
      subtitle = od?.orchestrationProgress?.plan?.goal?.slice(0, 80) || "Multi-agent task";
    } else if (card.appGeneratedUI) {
      type = "deep_research";
      title = "Deep Research";
      subtitle = card.text?.slice(0, 80) || "";
    } else {
      type = "research";
      title = "Research";
      subtitle = card.text?.slice(0, 80) || "";
    }
    results.push({
      cardId: id, type, title, subtitle,
      completedAt: card.updatedAt ?? card.createdAt ?? Date.now(),
      success: card.status !== "error",
    });
  }
  return results.reverse().slice(0, 50);
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

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function typeBadge(type: string): string {
  switch (type) {
    case "evolution": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "discovery": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "orchestration": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "claude-code":
    case "claude_code": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "build": return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    case "deep-research":
    case "deep_research": return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
    case "research": return "bg-teal-500/20 text-teal-300 border-teal-500/30";
    default: return "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

// ── Component ──

export default function TasksView() {
  const { t } = useT();
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);
  const cardOrder = useChatStore((s) => s.cardOrder);
  const cards = useChatStore((s) => s.cards);
  const resumeOrchestration = useChatStore((s) => s.resumeOrchestration);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [orchestrations, setOrchestrations] = useState<OrchestrationInfo[]>([]);
  const [recoverables, setRecoverables] = useState<RecoverableInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const baseUrl = getBackendBaseUrl();
      const headers = authHeaders();
      const [sessRes, recRes] = await Promise.all([
        fetch(`${baseUrl}/api/sessions`, { headers }),
        fetch(`${baseUrl}/api/orchestrations/recoverable`, { headers }).catch(() => null),
      ]);
      if (!sessRes.ok) throw new Error(`HTTP ${sessRes.status}`);
      const data = await sessRes.json();
      setSessions(data.sessions ?? []);
      setOrchestrations(data.orchestrations ?? []);
      if (recRes?.ok) {
        const recData = await recRes.json();
        setRecoverables(recData.recoverable ?? []);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const doAction = useCallback(async (method: string, path: string, key: string) => {
    setActionInFlight(key);
    try {
      const res = await fetch(`${getBackendBaseUrl()}${path}`, { method, headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionInFlight(null);
    }
  }, [fetchStatus]);

  const navigateToCard = useCallback((cardId: string) => {
    setActiveTab("chat");
    setChatViewOpen(true);
    setTimeout(() => {
      const el = document.getElementById(`card-${cardId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [setActiveTab, setChatViewOpen]);

  const activeSessions = sessions.filter((s) => s.status === "running");
  const activeOrchs = orchestrations.filter((o) =>
    ["planning", "reviewing", "executing", "paused"].includes(o.status),
  );

  const completedTasks = useMemo(() => deriveCompleted(cards, cardOrder), [cards, cardOrder]);

  const hasActive = activeSessions.length > 0 || activeOrchs.length > 0;

  return (
    <div className="flex-1 overflow-y-auto mobile-view-enter">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-100">{t("tab.tasks")}</h1>
          {hasActive && (
            <button
              onClick={() => {
                setActionInFlight("stop-all");
                const baseUrl = getBackendBaseUrl();
                const headers = authHeaders();
                const promises: Promise<any>[] = [];
                for (const s of activeSessions) {
                  promises.push(fetch(`${baseUrl}/api/sessions/${s.runId}`, { method: "DELETE", headers }).catch(() => {}));
                }
                for (const o of activeOrchs) {
                  promises.push(fetch(`${baseUrl}/api/orchestrations/${o.orchestrationId}`, { method: "DELETE", headers }).catch(() => {}));
                }
                Promise.allSettled(promises).then(() => fetchStatus()).finally(() => setActionInFlight(null));
              }}
              disabled={actionInFlight === "stop-all"}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {actionInFlight === "stop-all" ? "Stopping..." : "Stop All"}
            </button>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
        )}

        {/* Active Orchestrations */}
        {activeOrchs.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Active Orchestrations</h2>
            <div className="space-y-2">
              {activeOrchs.map((o) => (
                <div key={o.orchestrationId} className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadge(o.type)}`}>{o.type}</span>
                        <span className={`text-[10px] font-medium ${o.status === "executing" || o.status === "running" ? "text-green-400" : o.status === "paused" ? "text-yellow-400" : "text-blue-400"}`}>{o.status}</span>
                        <span className="text-[10px] text-gray-500 tabular-nums">{formatElapsedTime(o.startedAt)}</span>
                      </div>
                      <p className="text-sm text-gray-300 leading-snug">{truncate(o.goal, 120)}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-gray-500">{o.completedCount}/{o.taskCount} completed</span>
                        {o.runningCount > 0 && <span className="text-[10px] text-green-400">{o.runningCount} running</span>}
                        {o.failedCount > 0 && <span className="text-[10px] text-red-400">{o.failedCount} failed</span>}
                        <div className="flex-1 h-1 rounded-full bg-gray-700 overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: o.taskCount > 0 ? `${(o.completedCount / o.taskCount) * 100}%` : "0%" }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {o.status === "executing" && (
                        <button onClick={() => doAction("POST", `/api/orchestrations/${o.orchestrationId}/pause`, `pause-${o.orchestrationId}`)} disabled={!!actionInFlight} className="px-2 py-1 text-[10px] font-medium rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 hover:bg-yellow-500/20 transition-colors disabled:opacity-50 cursor-pointer">Pause</button>
                      )}
                      <button onClick={() => doAction("DELETE", `/api/orchestrations/${o.orchestrationId}`, `cancel-${o.orchestrationId}`)} disabled={!!actionInFlight} className="px-2 py-1 text-[10px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer">Cancel</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Active Sessions</h2>
            <div className="space-y-2">
              {activeSessions.map((s) => (
                <div key={s.runId} className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadge(s.type)}`}>{s.type}</span>
                      <span className="text-[10px] text-gray-500 tabular-nums">{formatElapsedTime(s.startedAt)}</span>
                      {s.model && <span className="text-[10px] text-gray-600">{s.model}</span>}
                    </div>
                    <p className="text-sm text-gray-300 truncate">{truncate(s.description, 100)}</p>
                  </div>
                  <button onClick={() => doAction("DELETE", `/api/sessions/${s.runId}`, `stop-${s.runId}`)} disabled={!!actionInFlight} className="px-2.5 py-1 text-[10px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors disabled:opacity-50 shrink-0 cursor-pointer">Stop</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recoverable Orchestrations */}
        {recoverables.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Recoverable</h2>
            <div className="space-y-2">
              {recoverables.map((r) => (
                <div key={r.orchestrationId} className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 leading-snug">{truncate(r.goal, 100)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{r.completedCount}/{r.taskCount} completed · {timeAgo(r.startedAt)}</p>
                  </div>
                  <button
                    onClick={() => resumeOrchestration(r.orchestrationId)}
                    className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer"
                  >
                    Resume
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty active state */}
        {!hasActive && recoverables.length === 0 && completedTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <p className="text-sm font-medium">No tasks</p>
            <p className="text-xs mt-1 text-gray-600">Active sessions, orchestrations, and completed tasks will appear here</p>
          </div>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Completed</h2>
            <div className="space-y-1.5">
              {completedTasks.map((task) => (
                <button
                  key={task.cardId}
                  onClick={() => navigateToCard(task.cardId)}
                  className="w-full text-left rounded-xl border border-gray-800/50 bg-gray-900/30 hover:bg-gray-800/40 px-4 py-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadge(task.type)}`}>{task.title}</span>
                    <span className={`text-[10px] font-medium ${task.success ? "text-emerald-400" : "text-red-400"}`}>{task.success ? "completed" : "failed"}</span>
                    <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(task.completedAt)}</span>
                  </div>
                  {task.subtitle && <p className="text-xs text-gray-500 truncate">{task.subtitle}</p>}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
