import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getBackendBaseUrl, authHeaders, resolveMediaUrl } from "../lib/connection";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { TabHeader, MobileViewHeader } from "./TabNavigation";
import type { Card } from "../cards/types";
import { isOrchestrationCardData } from "@shared/types";
import type { ScheduledTaskDef } from "@shared/types";
import { TOOL_ID_CLAUDE_CODE } from "../lib/constants";
import { ActivityFeed } from "./ActivityFeed";
import { timeAgo, timeUntil, formatElapsedTime } from "../lib/time-utils";
import { ScheduledTaskDialog } from "./ScheduledTaskDialog";
import { Clock, Play, Pause, Trash2, Pencil, Plus, RefreshCw, Send, ChevronDown, ChevronRight, Square } from "lucide-react";
import ReactToTL from "./ReactToTL";
import type { ReactContext, DiscussRequest } from "./ReactToTL";
import TerminalContent from "./TerminalContent";
import DiscussModal from "./DiscussModal";

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
  // Deep research: must have the standardGeneratedUISnapshot (set only by deep research build),
  // not just appGeneratedUI which is set by card evolution / auto-enhance
  if (card.standardGeneratedUISnapshot && card.appGeneratedUI) return true;
  // Phase-based research with generated UI (researcher tool)
  const toolName = (card.data && typeof card.data === "object" && "tool" in card.data)
    ? (card.data as { tool?: string }).tool : undefined;
  if (toolName === "enso_researcher_search" && card.generatedUI) return true;
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

// ── TL Live Terminals (collapsible) ──

function TLLiveTerminals({ sessions, cards, sessionToCard, onStop }: {
  sessions: SessionInfo[];
  cards: Record<string, Card>;
  sessionToCard: Record<string, string>;
  onStop: (runId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [autoExpandedIds] = useState<Set<string>>(() => new Set());

  // Find TL-launched sessions: description contains "Team Leader Task" or "TL auto-fix"
  const tlSessions = sessions.filter(s =>
    s.type === "claude-code" && (
      s.description.includes("Team Leader Task") ||
      s.description.includes("TL auto-fix") ||
      s.description.includes("User react")
    )
  );

  // Auto-expand new sessions on first appearance
  useEffect(() => {
    for (const s of tlSessions) {
      if (!autoExpandedIds.has(s.runId)) {
        autoExpandedIds.add(s.runId);
        setExpanded(prev => new Set(prev).add(s.runId));
      }
    }
  }, [tlSessions, autoExpandedIds]);

  if (tlSessions.length === 0) return null;

  return (
    <div className="space-y-2">
      {tlSessions.map(session => {
        const cardId = sessionToCard[session.sessionId] || sessionToCard[session.runId];
        const card = cardId ? cards[cardId] : undefined;
        const isExpanded = expanded.has(session.runId);
        const elapsed = formatElapsedTime(session.startedAt);
        const title = session.description
          .replace(/^\[Team Leader Task:\s*/, "")
          .replace(/\]$/, "")
          .slice(0, 80);

        return (
          <div key={session.runId} className="rounded-xl border border-violet-500/30 bg-violet-950/15 overflow-hidden">
            {/* Header — always visible */}
            <button
              onClick={() => setExpanded(prev => {
                const next = new Set(prev);
                if (next.has(session.runId)) next.delete(session.runId); else next.add(session.runId);
                return next;
              })}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-violet-500/5 transition-colors"
            >
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              }
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
              <span className="text-[10px] font-medium text-violet-300">{"\uD83D\uDC54"} TL Working</span>
              <span className="text-[10px] text-gray-500">{"\u00B7"}</span>
              <span className="text-[10px] text-gray-400 truncate flex-1 min-w-0">{title}</span>
              <span className="text-[9px] text-gray-500 tabular-nums shrink-0">{elapsed}</span>
            </button>

            {/* Expanded terminal */}
            {isExpanded && (
              <div className="border-t border-violet-500/15">
                {card?.text ? (
                  <div className="max-h-[300px] overflow-y-auto">
                    <TerminalContent
                      text={card.text}
                      status={card.status ?? "streaming"}
                      accentColor="violet"
                      maxHeightClass="max-h-[300px]"
                    />
                  </div>
                ) : (
                  <div className="px-3 py-4 text-center">
                    <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-[10px] text-gray-500">Initializing session...</p>
                  </div>
                )}
                {/* Stop button */}
                <div className="px-3 py-1.5 border-t border-violet-500/10 flex justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); onStop(session.runId); }}
                    className="text-[10px] px-2 py-1 rounded flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  >
                    <Square className="w-2.5 h-2.5" />
                    Stop
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Component ──

export default function TasksView() {
  const { t } = useT();
  const { cardOrder, cards } = useChatStore(
    useShallow((s) => ({ cardOrder: s.cardOrder, cards: s.cards }))
  );
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);
  const resumeOrchestration = useChatStore((s) => s.resumeOrchestration);
  const navigateToFocus = useChatStore((s) => s.navigateToFocus);

  const scheduledTasks = useChatStore((s) => s.scheduledTasks);
  const fetchScheduledTasks = useChatStore((s) => s.fetchScheduledTasks);
  const createScheduledTask = useChatStore((s) => s.createScheduledTask);
  const updateScheduledTask = useChatStore((s) => s.updateScheduledTask);
  const deleteScheduledTask = useChatStore((s) => s.deleteScheduledTask);
  const triggerScheduledTask = useChatStore((s) => s.triggerScheduledTask);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [orchestrations, setOrchestrations] = useState<OrchestrationInfo[]>([]);
  const [recoverables, setRecoverables] = useState<RecoverableInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTaskDef | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Focus areas (for TL action → focus navigation)
  const [focusAreas, setFocusAreas] = useState<Array<{ id: string; title: string }>>([]);

  // Team Leader state
  const [tlBriefing, setTlBriefing] = useState<{ headline: string; timestamp: string; sections: Array<{ emoji: string; title: string; items: string[] }>; proposedActions: Array<{ id: string; priority: string; type: string; title: string; reasoning: string; delegation: string; estimatedEffort: string; autoExecute: boolean; needsUserInput?: boolean; status: string }> } | null>(null);
  const [tlState, setTlState] = useState<{ lastMorningRoutineAt: string | null; lastCheckInAt: string | null } | null>(null);
  const [tlReacts, setTlReacts] = useState<Array<{ id: string; channel: string; text: string; action?: string; imageUrls?: string[]; timestamp: string; processed: boolean; processedAt?: string; resolution?: string; resultingTaskId?: string; context: { type: string; summary: string; focusId?: string } }>>([]);
  const [tlTab, setTlTab] = useState<"briefing" | "actions" | "reacts">("actions");
  const [tlRunning, setTlRunning] = useState(false);
  const [reactInput, setReactInput] = useState<{ actionId: string; text: string } | null>(null);
  const [reactFromActivity, setReactFromActivity] = useState<{ type: "card"; summary: string; focusId?: string; detail?: string } | null>(null);
  const [discussRequest, setDiscussRequest] = useState<DiscussRequest | null>(null);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    }
  }, []);

  const fetchTL = useCallback(async () => {
    try {
      const baseUrl = getBackendBaseUrl();
      const headers = authHeaders();
      const [stateRes, briefingRes, reactsRes, focusRes] = await Promise.all([
        fetch(`${baseUrl}/api/team-leader/state`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/team-leader/briefing`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/reacts`, { headers }).catch(() => null),
        fetch(`${baseUrl}/api/focus-areas`, { headers }).catch(() => null),
      ]);
      if (stateRes?.ok) setTlState(await stateRes.json());
      if (briefingRes?.ok) {
        const b = await briefingRes.json();
        if (b.headline) setTlBriefing(b);
      }
      if (reactsRes?.ok) {
        const r = await reactsRes.json();
        setTlReacts(r.reacts || []);
      }
      if (focusRes?.ok) {
        const f = await focusRes.json();
        setFocusAreas((f.areas || []).map((a: { id: string; title: string }) => ({ id: a.id, title: a.title })));
      }
    } catch { /* TL not available */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchScheduledTasks();
    fetchTL();
    const interval = setInterval(() => { fetchStatus(); fetchScheduledTasks(); fetchTL(); }, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchScheduledTasks, fetchTL]);

  const doAction = useCallback(async (method: string, path: string, key: string) => {
    setActionInFlight(key);
    try {
      const res = await fetch(`${getBackendBaseUrl()}${path}`, { method, headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionInFlight(null);
    }
  }, [fetchStatus]);

  const navigateToCard = useCallback((cardId: string) => {
    setActiveTab("chat");
    setChatViewOpen(true);
    setTimeout(() => {
      const globalScroll = (window as unknown as Record<string, unknown>).__ensoScrollToCard as ((id: string) => void) | undefined;
      if (globalScroll) {
        globalScroll(cardId);
      } else {
        const el = document.getElementById(`card-${cardId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  }, [setActiveTab, setChatViewOpen]);

  const activeSessions = sessions.filter((s) => s.status === "running");

  // Auto-switch to Activity tab when a TL session starts
  const hasTLSession = activeSessions.some(s =>
    s.type === "claude-code" && (s.description.includes("Team Leader Task") || s.description.includes("TL auto-fix"))
  );
  const prevHadTLSession = useRef(false);
  useEffect(() => {
    if (hasTLSession && !prevHadTLSession.current) {
      setTlTab("actions"); // Switch to Activity tab to show the live terminal
    }
    prevHadTLSession.current = hasTLSession;
  }, [hasTLSession]);

  const activeOrchs = orchestrations.filter((o) =>
    ["planning", "reviewing", "executing", "paused"].includes(o.status),
  );

  const completedTasks = useMemo(() => deriveCompleted(cards, cardOrder), [cards, cardOrder]);

  // Build lookup maps: session runId → cardId, orchestrationId → cardId
  const { sessionToCard, orchToCard } = useMemo(() => {
    const s2c: Record<string, string> = {};
    const o2c: Record<string, string> = {};
    for (const cid of cardOrder) {
      const c = cards[cid];
      if (!c) continue;
      // Terminal cards store their session's toolSessionId
      if (c.type === "terminal" && c.toolMeta?.toolSessionId) {
        s2c[c.toolMeta.toolSessionId] = cid;
      }
      // Orchestration cards store orchestrationId in data
      if (c.type === "orchestration") {
        const od = isOrchestrationCardData(c.data) ? c.data : undefined;
        const oid = od?.orchestrationProgress?.orchestrationId || od?.orchestrationPlan?.orchestrationId;
        if (oid) o2c[oid] = cid;
      }
    }
    return { sessionToCard: s2c, orchToCard: o2c };
  }, [cards, cardOrder]);

  const hasActive = activeSessions.length > 0 || activeOrchs.length > 0;

  const stopAllButton = hasActive ? (
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
  ) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 mobile-view-enter">
      <MobileViewHeader title={t("tab.tasks")}>{stopAllButton}</MobileViewHeader>
      <TabHeader>{stopAllButton}</TabHeader>
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-4 pb-6 space-y-6">

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
        )}

        {/* ═══ Team Leader Dashboard ═══ */}
        <section className="rounded-xl border border-violet-500/20 bg-gray-950/60 overflow-hidden">
          {/* TL Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-violet-950/40 to-indigo-950/40 border-b border-violet-500/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-violet-200 flex items-center gap-2">
                  <span>👔</span> Team Leader
                </h2>
                {tlState?.lastMorningRoutineAt && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Last routine: {timeAgo(new Date(tlState.lastMorningRoutineAt).getTime())}
                    {tlState.lastCheckInAt && ` · Check-in: ${timeAgo(new Date(tlState.lastCheckInAt).getTime())}`}
                  </p>
                )}
              </div>
              <button
                onClick={async () => {
                  setTlRunning(true);
                  try {
                    await fetch(`${getBackendBaseUrl()}/api/team-leader/morning`, { method: "POST", headers: authHeaders() });
                    await fetchTL();
                  } catch { /* ignore */ }
                  setTlRunning(false);
                }}
                disabled={tlRunning}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${tlRunning ? "animate-spin" : ""}`} />
                {tlRunning ? "Running..." : "Run Routine"}
              </button>
            </div>
          </div>

          {/* Inline React Input — direct command to any agent */}
          <div className="px-4 py-2 border-b border-gray-800/20">
            <ReactToTL
              context={{ type: "direct", summary: "Direct instruction from command center" }}
              onClose={() => {}}
              mode="inline"
              onDiscuss={(req) => setDiscussRequest(req)}
            />
          </div>

          {/* TL Tabs */}
          <div className="flex border-b border-gray-800/40">
            {(["actions", "briefing", "reacts"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTlTab(tab)}
                className={`flex-1 py-2 text-[11px] font-medium transition-colors ${tlTab === tab ? "text-violet-300 border-b-2 border-violet-500" : "text-gray-500 hover:text-gray-300"}`}
              >
                {tab === "actions" ? "Activity" : tab === "briefing" ? "Briefing" : `Reacts (${tlReacts.length})`}
              </button>
            ))}
          </div>

          {/* TL Activity Tab — live terminals + agent artifacts */}
          {tlTab === "actions" && (
            <div className="p-3 max-h-[400px] overflow-y-auto space-y-3">
              {/* Live TL Claude Code sessions */}
              <TLLiveTerminals
                sessions={activeSessions}
                cards={cards}
                sessionToCard={sessionToCard}
                onStop={(runId) => doAction("DELETE", `/api/sessions/${runId}`, `stop-${runId}`)}
              />
              <ActivityFeed
                showResolved
                limit={30}
                focusAreas={focusAreas}
                onReact={(ctx) => setReactFromActivity(ctx)}
              />
            </div>
          )}

          {/* TL Briefing Tab */}
          {tlTab === "briefing" && (
            <div className="p-3 max-h-[400px] overflow-y-auto">
              {!tlBriefing ? (
                <p className="text-gray-500 text-xs text-center py-6">No briefing yet. TL runs a morning routine daily — or click "Run Routine" above.</p>
              ) : (() => {
                const briefingAge = timeAgo(new Date(tlBriefing.timestamp).getTime());
                const isToday = new Date(tlBriefing.timestamp).toDateString() === new Date().toDateString();
                // Sections that need user action get special styling
                const needsInputKeywords = ["input", "review", "authorize", "approve", "decision", "attention"];
                const isActionSection = (title: string) => needsInputKeywords.some(k => title.toLowerCase().includes(k));

                return (
                  <div className="space-y-3">
                    {/* Headline + age */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-violet-300 leading-snug">{tlBriefing.headline}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isToday ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-300 border border-amber-500/20"}`}>
                            {isToday ? "Today" : "Stale"}
                          </span>
                          <span className="text-[10px] text-gray-500">{briefingAge}</span>
                        </div>
                      </div>
                    </div>

                    {/* Sections */}
                    {tlBriefing.sections.map((s, i) => {
                      const needsAction = isActionSection(s.title);
                      return (
                        <div key={i} className={`rounded-lg border p-2.5 ${
                          needsAction
                            ? "border-amber-500/25 bg-amber-950/10"
                            : "border-gray-800/30 bg-gray-900/30"
                        }`}>
                          <h4 className={`text-xs font-medium mb-1.5 ${needsAction ? "text-amber-300" : "text-gray-300"}`}>
                            {s.emoji} {s.title}
                          </h4>
                          {s.items.map((item, j) => (
                            <div key={j} className="flex items-start gap-2 group">
                              <p className={`text-[11px] leading-relaxed flex-1 ${needsAction ? "text-amber-200/80" : "text-gray-400"}`}>{item}</p>
                              {/* Quick respond button on actionable items */}
                              {needsAction && (
                                <button
                                  onClick={() => setReactFromActivity({
                                    type: "card",
                                    summary: `Briefing: ${s.title}`,
                                    detail: item.slice(0, 150),
                                  })}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-all"
                                >
                                  Respond
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}

                    {/* Proposed actions summary */}
                    {tlBriefing.proposedActions && tlBriefing.proposedActions.length > 0 && (
                      <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-2.5">
                        <h4 className="text-xs font-medium text-violet-300 mb-1.5">{"\uD83C\uDFAF"} TL's Planned Actions ({tlBriefing.proposedActions.length})</h4>
                        {tlBriefing.proposedActions.map((a, j) => {
                          const priorityStyle: Record<string, string> = {
                            critical: "text-red-400 bg-red-500/10 border-red-500/20",
                            high: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                            medium: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                            low: "text-gray-400 bg-gray-500/10 border-gray-500/20",
                          };
                          const statusIcon = a.status === "completed" ? "\u2705" : a.status === "executing" ? "\u26A1" : a.needsUserInput ? "\uD83D\uDC41" : "\u23F3";
                          return (
                            <div key={j} className="flex items-start gap-2 py-1 group">
                              <span className="text-[10px] mt-0.5">{statusIcon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-gray-200">{a.title}</span>
                                  <span className={`text-[8px] px-1 py-0.5 rounded border ${priorityStyle[a.priority] || priorityStyle.low}`}>{a.priority}</span>
                                </div>
                                <p className="text-[10px] text-gray-500 leading-snug">{a.reasoning}</p>
                              </div>
                              {a.needsUserInput && (
                                <button
                                  onClick={() => setReactFromActivity({
                                    type: "card",
                                    summary: `TL Action: ${a.title}`,
                                    detail: a.reasoning,
                                  })}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-all"
                                >
                                  Respond
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TL Reacts Tab — user instructions + agent follow-ups */}
          {tlTab === "reacts" && (
            <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
              {tlReacts.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-6">No reacts yet. Send instructions to agents using the input above, or via card menus and focus buttons.</p>
              ) : (
                tlReacts.map(r => {
                  const contextIcon = { card: "\uD83C\uDFB4", focus: "\uD83C\uDFAF", sprint: "\uD83D\uDE80", deliverable: "\uD83D\uDCE6", entity: "\uD83D\uDCD6", direct: "\uD83D\uDCE8", briefing: "\uD83D\uDCCB", pulse: "\uD83D\uDCCA", alert: "\u26A0\uFE0F", checkin: "\uD83D\uDD0D", discovery: "\uD83C\uDF1F" }[r.context?.type] || "\uD83D\uDCAC";
                  const channelLabel = { "in-app": "App", email: "Email", wechat: "WeChat", web: "Web" }[r.channel] || r.channel;
                  return (
                  <div key={r.id} className={`rounded-xl border p-3 transition-colors ${r.processed ? "border-gray-800/30 bg-gray-900/20" : "border-violet-500/20 bg-violet-950/10"}`}>
                    {/* Header: context + channel + time + status */}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className="text-xs">{contextIcon}</span>
                      <span className="text-[10px] text-gray-400 font-medium truncate max-w-[200px]">{r.context?.summary || "General"}</span>
                      <span className="text-gray-700 text-[10px]">{"\u00B7"}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-500 border border-gray-700/30">{channelLabel}</span>
                      <span className="text-[10px] text-gray-600">{timeAgo(new Date(r.timestamp).getTime())}</span>
                      <span className="ml-auto">
                        {r.processed
                          ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{"\u2713"} Done</span>
                          : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse">Pending</span>
                        }
                      </span>
                    </div>

                    {/* User's instruction */}
                    <div className="rounded-lg bg-gray-800/40 px-3 py-2 mb-1.5">
                      <p className="text-[11px] text-gray-200 leading-relaxed">{r.text}</p>
                      {/* Attached images */}
                      {r.imageUrls && r.imageUrls.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {r.imageUrls.map((url, idx) => (
                            <a key={idx} href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer"
                              className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-700 hover:border-violet-500/50 transition-colors">
                              <img src={resolveMediaUrl(url)} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Agent's follow-up */}
                    {r.resolution && (
                      <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] text-violet-400 font-medium">{"\uD83D\uDC54"} Agent Response</span>
                          {r.processedAt && <span className="text-[9px] text-gray-600">{"\u00B7"} {timeAgo(new Date(r.processedAt).getTime())}</span>}
                        </div>
                        <p className="text-[11px] text-violet-300/90 leading-relaxed">{r.resolution}</p>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        {/* React overlay from Activity tab */}
        {reactFromActivity && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => setReactFromActivity(null)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <ReactToTL
                context={reactFromActivity}
                onClose={() => setReactFromActivity(null)}
                mode="inline"
              />
            </div>
          </div>
        )}

        {/* Discuss modal */}
        {discussRequest && (
          <DiscussModal
            request={discussRequest}
            onClose={() => setDiscussRequest(null)}
            onExecute={async (enrichedText, detail, imageUrls) => {
              setDiscussRequest(null);
              // Submit as react with full discussion context
              const selected = discussRequest.agent;
              let agentTarget: { agent: "tl" } | { agent: "expert"; focusId: string; expertId: string } | undefined;
              if (selected.type === "expert" && selected.focusId && selected.expertId) {
                agentTarget = { agent: "expert", focusId: selected.focusId, expertId: selected.expertId };
              }
              try {
                await fetch(`${getBackendBaseUrl()}/api/reacts`, {
                  method: "POST",
                  headers: { ...authHeaders(), "Content-Type": "application/json" },
                  body: JSON.stringify({
                    text: enrichedText,
                    action: "custom",
                    context: { type: discussRequest.context.type, summary: discussRequest.context.summary, focusId: discussRequest.context.focusId },
                    imageUrls: imageUrls.length ? imageUrls : undefined,
                    agentTarget,
                    detail,
                  }),
                });
              } catch { /* toast already shown by DiscussModal */ }
            }}
          />
        )}

        {/* Active Orchestrations */}
        {activeOrchs.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">{t("tasks.activeOrch")}</h2>
            <div className="space-y-2">
              {activeOrchs.map((o) => {
                const cardId = orchToCard[o.orchestrationId];
                return (
                <div key={o.orchestrationId} className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`flex-1 min-w-0 ${cardId ? "cursor-pointer" : ""}`}
                      onClick={cardId ? () => navigateToCard(cardId) : undefined}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadge(o.type)}`}>{o.type}</span>
                        <span className={`text-[10px] font-medium ${o.status === "executing" || o.status === "running" ? "text-green-400" : o.status === "paused" ? "text-yellow-400" : "text-blue-400"}`}>{o.status}</span>
                        <span className="text-[10px] text-gray-500 tabular-nums">{formatElapsedTime(o.startedAt)}</span>
                        {cardId && <span className="text-[10px] text-indigo-400/60 ml-auto">↗ view</span>}
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
                        <button onClick={() => doAction("POST", `/api/orchestrations/${o.orchestrationId}/pause`, `pause-${o.orchestrationId}`)} disabled={!!actionInFlight} className="px-2 py-1 text-[10px] font-medium rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 hover:bg-yellow-500/20 transition-colors disabled:opacity-50 cursor-pointer">{t("common.pause")}</button>
                      )}
                      <button onClick={() => doAction("DELETE", `/api/orchestrations/${o.orchestrationId}`, `cancel-${o.orchestrationId}`)} disabled={!!actionInFlight} className="px-2 py-1 text-[10px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer">{t("common.cancel")}</button>
                    </div>
                  </div>
                </div>
              );})}
            </div>
          </section>
        )}

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">{t("tasks.activeSess")}</h2>
            <div className="space-y-2">
              {activeSessions.map((s) => {
                // Find card: direct session match, or via parent orchestration
                const cardId = sessionToCard[s.sessionId] || sessionToCard[s.runId]
                  || (s.orchestrationId ? orchToCard[s.orchestrationId] : undefined);
                return (
                <div key={s.runId} className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-4 py-3 flex items-center justify-between gap-3">
                  <div
                    className={`flex-1 min-w-0 ${cardId ? "cursor-pointer" : ""}`}
                    onClick={cardId ? () => navigateToCard(cardId) : undefined}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${typeBadge(s.type)}`}>{s.type}</span>
                      <span className="text-[10px] text-gray-500 tabular-nums">{formatElapsedTime(s.startedAt)}</span>
                      {s.model && <span className="text-[10px] text-gray-600">{s.model}</span>}
                      {cardId && <span className="text-[10px] text-indigo-400/60 ml-auto">↗ view</span>}
                    </div>
                    <p className="text-sm text-gray-300 truncate">{truncate(s.description, 100)}</p>
                  </div>
                  <button onClick={() => doAction("DELETE", `/api/sessions/${s.runId}`, `stop-${s.runId}`)} disabled={!!actionInFlight} className="px-2.5 py-1 text-[10px] font-medium rounded bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors disabled:opacity-50 shrink-0 cursor-pointer">{t("common.stop")}</button>
                </div>
              );})}
            </div>
          </section>
        )}

        {/* Scheduled Tasks */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{t("tasks.scheduledTasks")}</h2>
              {scheduledTasks.length > 0 && (
                <span className="text-[10px] text-gray-600">({scheduledTasks.filter((t) => t.enabled).length} active)</span>
              )}
            </div>
            <button
              onClick={() => { setEditingTask(null); setShowTaskDialog(true); }}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {scheduledTasks.length === 0 ? (
            <div className="rounded-xl border border-gray-800/50 bg-gray-900/30 px-4 py-6 text-center">
              <Clock className="w-6 h-6 mx-auto mb-2 text-gray-600" />
              <p className="text-xs text-gray-500">{t("tasks.noScheduled")}</p>
              <p className="text-[10px] text-gray-600 mt-1">{t("tasks.noScheduledHint")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scheduledTasks.map((task) => (
                <div key={task.taskId} className={`rounded-xl border px-4 py-3 ${task.enabled ? "border-gray-700/50 bg-gray-800/40" : "border-gray-800/30 bg-gray-900/30 opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-200">{task.name}</span>
                        {task.lastRunStatus === "running" && (
                          <span className="flex items-center gap-1 text-[10px] text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> running
                          </span>
                        )}
                        {!task.enabled && <span className="text-[10px] text-gray-600">paused</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <span className="font-mono">{task.cron || (task.fireAt ? `at ${new Date(task.fireAt).toLocaleString()}` : "manual")}</span>
                        {task.recurring && <span className="text-blue-400/60">recurring</span>}
                        {!task.recurring && <span className="text-amber-400/60">one-shot</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                        {task.nextFireAt && (
                          <span>Next: <span className="text-gray-400">{timeUntil(task.nextFireAt)}</span></span>
                        )}
                        {task.lastFiredAt && (
                          <span>Last: <span className={task.lastRunStatus === "success" ? "text-emerald-400" : task.lastRunStatus === "failed" ? "text-red-400" : "text-gray-400"}>
                            {task.lastRunStatus === "success" ? "\u2713" : task.lastRunStatus === "failed" ? "\u2717" : "\u2026"} {timeAgo(task.lastFiredAt)}
                          </span></span>
                        )}
                      </div>
                      {task.description && <p className="text-[10px] text-gray-600 mt-0.5 truncate">{task.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {task.lastRunStatus !== "running" && (
                        <button
                          onClick={() => triggerScheduledTask(task.taskId)}
                          title={t("tasks.runNow")}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-green-500/10 transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => updateScheduledTask(task.taskId, { enabled: !task.enabled })}
                        title={task.enabled ? "Pause" : "Resume"}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors cursor-pointer"
                      >
                        {task.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => { setEditingTask(task); setShowTaskDialog(true); }}
                        title={t("common.edit")}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {deleteConfirm === task.taskId ? (
                        <button
                          onClick={() => { deleteScheduledTask(task.taskId); setDeleteConfirm(null); }}
                          className="px-2 py-1 text-[10px] font-medium rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors cursor-pointer"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(task.taskId)}
                          title={t("common.delete")}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Task creation dialog */}
        <ScheduledTaskDialog
          open={showTaskDialog}
          onClose={() => { setShowTaskDialog(false); setEditingTask(null); }}
          onSave={(def) => {
            if (editingTask) {
              updateScheduledTask(editingTask.taskId, def);
            } else {
              createScheduledTask(def);
            }
          }}
          editTask={editingTask}
        />

        {/* Recoverable Orchestrations */}
        {recoverables.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">{t("tasks.recoverableTitle")}</h2>
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
        {!hasActive && recoverables.length === 0 && completedTasks.length === 0 && scheduledTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <p className="text-sm font-medium">{t("tasks.noTasks")}</p>
            <p className="text-xs mt-1 text-gray-600">{t("tasks.noTasksHint")}</p>
          </div>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">{t("tasks.completedTitle")}</h2>
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
    </div>
  );
}
