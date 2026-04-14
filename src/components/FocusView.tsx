import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { getClientId } from "../lib/ws-client";
import { TabHeader, MobileViewHeader } from "./TabNavigation";
import { API } from "../lib/constants";
const MarkdownText = lazy(() => import("./MarkdownText"));

// ── Types ──

interface FocusArea {
  id: string;
  title: string;
  description: string;
  status: "active" | "paused" | "completed" | "emerging";
  clarity: "emerging" | "developing" | "clear";
  focusType?: "project" | "creative" | "learning" | "lifestyle" | "general";
  codebasePath?: string;
  projectId?: string;
  experts?: Array<{
    id: string; name: string; role: string; responsibilities: string;
    goals: string[]; perspective: string;
    agentRole: "researcher" | "architect" | "builder" | "coder" | "reviewer";
    conversationId?: string;
    metrics?: {
      conversationCount: number;
      lastActiveAt: string | null;
      sprintCount: number;
      insightsGenerated: number;
      lastEvaluation?: string;
      lastEvaluatedAt?: string;
    };
  }>;
  intent?: string;
  deeperIntent?: string;
  adjacentPursuits?: string[];
  nextSteps?: string[];
  conversationId?: string;
  confidence: number;
  evidence: string[];
  semanticTags: string[];
  progress: {
    trend: "growing" | "steady" | "quiet";
    recentActivity: string[];
    lastActiveAt: string;
  };
  refinements: Array<{ date: string; source: string; change: string }>;
  suggestedActions: string[];
  createdAt: string;
  updatedAt: string;
  preparedBriefing?: string;
  preparedAt?: string;
  relatedEntityIds?: string[];
  lastSprintResults?: string;
  lastSprintDate?: string;
  lastSprintSummary?: {
    sprintSummary: string;
    deliverables: Array<{
      taskTitle: string;
      entityType: "app" | "article" | "idea" | "synthesis";
      entityId: string;
      painPoint: string;
      howItHelps: string;
      quickStart: string;
      actionType: "run" | "read" | "explore" | "review";
    }>;
    recommendedFirstAction: { deliverableIndex: number; reason: string };
    nextSteps: string[];
  };
}

interface FocusState {
  areas: FocusArea[];
  lastInferredAt: string;
  version: number;
}

interface ActivityData {
  entities: Array<{ title: string; source: string; type: string; updatedAt: string; matchReason?: string }>;
  total: number;
}

interface GapAnalysis {
  currentState: string;
  gaps: Array<{ area: string; description: string; severity: "critical" | "significant" | "minor"; category: string }>;
  bottlenecks: Array<{ description: string; impact: string }>;
  solutions: Array<{ gap: string; solution: string; ensoAction: string; effort: string }>;
  nextPriority: string;
}

type View = "list" | "detail";
type DetailTab = "work" | "cortex" | "experts" | "evolve" | "overview" | "activity" | "plan"; // legacy names kept for backward compat

// ── Source icons ──
const SOURCE_ICONS: Record<string, string> = {
  kindle: "\uD83D\uDCDA", steam: "\uD83C\uDFAE", movies_tv: "\uD83C\uDFAC",
  youtube: "\uD83D\uDCFA", photos: "\uD83D\uDCF7", projects: "\uD83D\uDCBB",
  articles: "\uD83D\uDCF0", travel: "\u2708\uFE0F", qq_music: "\uD83C\uDFB5",
};

// ── Main Component ──

export default function FocusView() {
  const { t } = useT();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const startNewChat = useChatStore((s) => s.startNewChat);
  const conversationsList = useChatStore((s) => s.conversationsList);
  const pendingFocusNav = useChatStore((s) => s.pendingFocusNavigation);

  const [view, setView] = useState<View>("list");
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  // Handle pending navigation from TL dashboard or chat cards
  useEffect(() => {
    if (pendingFocusNav && focusState?.areas.length) {
      const area = focusState.areas.find(a => a.id === pendingFocusNav.focusId);
      if (area) {
        setSelectedId(area.id);
        setView("detail");
        if (pendingFocusNav.tab) setDetailTab(pendingFocusNav.tab as DetailTab);
        else setDetailTab("work");
      }
      useChatStore.setState({ pendingFocusNavigation: null });
    }
  }, [pendingFocusNav, focusState]);
  const [loading, setLoading] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addIntent, setAddIntent] = useState("");
  const [planGoal, setPlanGoal] = useState<string | null>(null);
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);
  const [analyzingGaps, setAnalyzingGaps] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [chatReady, setChatReady] = useState(false);
  const [showEvolveBrief, setShowEvolveBrief] = useState(false);
  const [evolveBrief, setEvolveBrief] = useState("");
  const [sprintLaunched, setSprintLaunched] = useState(false);
  const [generatingExperts, setGeneratingExperts] = useState(false);
  const [expandedDeliverable, setExpandedDeliverable] = useState<string | null>(null);
  const [deliverableContent, setDeliverableContent] = useState("");
  const [exploredDeliverables, setExploredDeliverables] = useState<Set<string>>(new Set());

  // Editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchFocusAreas = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS}`, { headers: authHeaders() });
      const data = await resp.json();
      setFocusState(data as FocusState);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFocusAreas();
    // Sync focus conversations to current client so they appear in sidebar
    const clientId = getClientId();
    if (clientId) {
      fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS}/sync-conversations`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      }).then(() => useChatStore.getState().refreshConversationsList()).catch(() => {});
    }
  }, [fetchFocusAreas]);

  // Auto-refresh when viewing a focus area that hasn't been enriched yet (waiting for async enrichment)
  useEffect(() => {
    if (view !== "detail" || !selectedId || !focusState) return;
    const area = focusState.areas.find(a => a.id === selectedId);
    if (!area) return;
    // If evidence is just "User-created focus area" and no deeperIntent, enrichment hasn't completed
    const needsRefresh = area.evidence.length === 1 && area.evidence[0] === "User-created focus area" && !area.deeperIntent;
    if (!needsRefresh) return;
    const timer = setInterval(() => { fetchFocusAreas(); }, 5000);
    return () => clearInterval(timer);
  }, [view, selectedId, focusState, fetchFocusAreas]);

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this focus area?")) return;
    try {
      await fetch(`${getBackendBaseUrl()}/api/focus-areas/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      setView("list");
      setSelectedId(null);
      fetchFocusAreas();
    } catch { /* ignore */ }
  };

  const handleInfer = async () => {
    setInferring(true);
    try {
      const resp = await fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS_INFER}`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const data = await resp.json();
      setFocusState(data as FocusState);
    } catch { /* ignore */ }
    setInferring(false);
  };

  /**
   * Open a dedicated chat conversation for a focus area.
   * If the focus already has a conversationId, switch to it.
   * Otherwise, create a new conversation titled after the focus and save the ID.
   */
  const chatAboutFocus = async (area: FocusArea, initialMessage?: string) => {
    // If focus area already has a conversation, switch to it directly
    // (trust the stored conversationId — don't verify against stale local list)
    if (area.conversationId) {
      await useChatStore.getState().refreshConversationsList();
      selectConversation(area.conversationId);
      setActiveTab("chat");
      if (initialMessage) {
        setTimeout(() => sendMessage(initialMessage), 300);
      }
      return;
    }

    // Create a new conversation for this focus area
    try {
      const clientId = getClientId();
      const res = await fetch(`${getBackendBaseUrl()}${API.CONVERSATIONS}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, title: area.title, context: { type: "focus", sourceId: area.id, label: "Focus" } }),
      });
      if (!res.ok) return;
      const created = (await res.json()) as { id: string };

      // Save conversation ID on the focus area
      handleUpdate(area.id, { conversationId: created.id } as any);

      // Update local state
      setFocusState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          areas: prev.areas.map(a => a.id === area.id ? { ...a, conversationId: created.id } : a),
        };
      });

      await useChatStore.getState().refreshConversationsList();
      selectConversation(created.id);
      setActiveTab("chat");
      if (initialMessage) {
        setTimeout(() => sendMessage(initialMessage), 300);
      }
    } catch { /* ignore */ }
  };

  const handleUpdate = async (id: string, updates: Partial<FocusArea>) => {
    try {
      await fetch(`${getBackendBaseUrl()}/api/focus-areas/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      fetchFocusAreas();
    } catch { /* ignore */ }
  };

  const handleAdd = async () => {
    if (!addTitle.trim()) return;
    try {
      await fetch(`${getBackendBaseUrl()}/api/focus-areas`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: addTitle, description: addDesc || addTitle, intent: addIntent || undefined }),
      });
      setAddTitle(""); setAddDesc(""); setAddIntent("");
      setShowAddForm(false);
      fetchFocusAreas();
    } catch { /* ignore */ }
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailTab("overview");
    setView("detail");
    setEvolveBrief("");
    setShowEvolveBrief(false);
    setSprintLaunched(false);
    // Fetch activity data
    try {
      const resp = await fetch(`${getBackendBaseUrl()}/api/focus-areas/${id}/activity`, { headers: authHeaders() });
      setActivity(await resp.json());
    } catch { setActivity(null); }
  };

  const handleGapAnalysis = async (id: string) => {
    setAnalyzingGaps(true);
    try {
      const resp = await fetch(`${getBackendBaseUrl()}/api/focus-areas/${id}/gaps`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (data?.gaps) setGapAnalysis(data);
    } catch { /* ignore */ }
    setAnalyzingGaps(false);
  };

  const handlePlan = async (id: string) => {
    try {
      const resp = await fetch(`${getBackendBaseUrl()}/api/focus-areas/${id}/plan`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (data?.goal) {
        setPlanGoal(data.goal);
      }
    } catch { /* ignore */ }
  };

  const launchPlanOrchestration = () => {
    if (!planGoal || !selected) return;
    chatAboutFocus(selected, planGoal);
    setPlanGoal(null);
  };

  const selected = focusState?.areas.find(a => a.id === selectedId);

  // Save inline edit
  const saveEdit = (field: string) => {
    if (!selectedId || !editValue.trim()) { setEditingField(null); return; }
    handleUpdate(selectedId, { [field]: editValue });
    setEditingField(null);
  };

  // ── List View ──
  if (view === "list") {
    return (
      <>
        <MobileViewHeader title={t("tab.focus")} />
        <TabHeader>
          <button
            onClick={handleInfer}
            disabled={inferring}
            className="text-xs px-2.5 py-1 rounded bg-violet-600/60 text-violet-100 hover:bg-violet-500/60 disabled:opacity-50"
          >
            {inferring ? "Analyzing..." : "Refresh from Cortex"}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="text-xs px-2.5 py-1 rounded bg-gray-700/60 text-gray-200 hover:bg-gray-600/60"
          >
            + Add
          </button>
        </TabHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Add form */}
          {showAddForm && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-4 space-y-2">
              <input value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="Focus area title (e.g., 'Build AlphaRank v2')"
                className="w-full text-sm bg-gray-900/60 border border-gray-700/40 rounded px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50" />
              <input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="What does success look like?"
                className="w-full text-sm bg-gray-900/60 border border-gray-700/40 rounded px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50" />
              <input value={addIntent} onChange={e => setAddIntent(e.target.value)} placeholder="Specific outcome you're working toward (optional)"
                className="w-full text-sm bg-gray-900/60 border border-gray-700/40 rounded px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50" />
              <div className="flex gap-2">
                <button onClick={handleAdd} className="text-xs px-3 py-1.5 rounded bg-violet-600 text-white hover:bg-violet-500">Add</button>
                <button onClick={() => setShowAddForm(false)} className="text-xs px-3 py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600">Cancel</button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && (!focusState?.areas.length) && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">{"\uD83C\uDFAF"}</div>
              <h3 className="text-lg font-medium text-gray-200 mb-2">Discover Your Focus Areas</h3>
              <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                Enso can analyze your Cortex — books, projects, videos, browsing patterns — to identify
                what you're actively working toward. These become the organizing principle for proactive assistance.
              </p>
              <button onClick={handleInfer} disabled={inferring}
                className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
                {inferring ? "Analyzing your Cortex..." : "Discover My Focus Areas"}
              </button>
            </div>
          )}

          {/* Focus area cards */}
          {focusState?.areas.filter(a => a.status !== "completed").map(area => (
            <button key={area.id} onClick={() => openDetail(area.id)}
              className="w-full text-left rounded-lg border border-gray-700/40 bg-gray-900/30 p-4 hover:border-gray-600/60 hover:bg-gray-800/30 transition-all group">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2 pr-2">
                  <h3 className="text-sm font-medium text-gray-100">{area.title}</h3>
                  {area.focusType && area.focusType !== "general" && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${
                      area.focusType === "project" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      area.focusType === "creative" ? "bg-pink-500/10 text-pink-400 border-pink-500/20" :
                      area.focusType === "learning" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                      "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}>{area.focusType}</span>
                  )}
                </div>
                <WorkflowBadge area={area} />
              </div>
              <p className="text-xs text-gray-400 mb-2 line-clamp-2">{area.intent || area.description}</p>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                {area.codebasePath && <span className="text-emerald-500/70">📁 {area.codebasePath.split("/").pop()}</span>}
                {area.evidence.length > 0 && <span>{area.evidence.length} evidence points</span>}
                {area.semanticTags.length > 0 && <span>{area.semanticTags.slice(0, 2).join(", ")}</span>}
                <span>{Math.round(area.confidence * 100)}% confidence</span>
              </div>
              {/* Action buttons — what the user can do next */}
              {(() => {
                const actions: Array<{ emoji: string; label: string; bg: string; border: string; text: string; tab: DetailTab }> = [];
                // Unreviewed sprint results
                if (area.lastSprintResults && area.lastSprintDate) {
                  const lastActive = area.progress?.lastActiveAt ? new Date(area.progress.lastActiveAt).getTime() : 0;
                  const sprintTime = new Date(area.lastSprintDate).getTime();
                  const sprintAge = Math.floor((Date.now() - sprintTime) / 86400000);
                  if (lastActive < sprintTime || sprintAge <= 7) {
                    actions.push({ emoji: "📬", label: "Review Sprint Results →", bg: "bg-amber-500/10", border: "border-amber-500/25", text: "text-amber-300", tab: "cortex" });
                  }
                }
                // Evaluated but no discussion yet
                if (area.preparedBriefing && !area.conversationId && !area.lastSprintResults) {
                  actions.push({ emoji: "💬", label: "Start Discussion →", bg: "bg-violet-500/10", border: "border-violet-500/25", text: "text-violet-300", tab: "work" });
                }
                // Has discussion but no sprint yet
                if (area.conversationId && !area.lastSprintResults && area.preparedBriefing) {
                  actions.push({ emoji: "⚡", label: "Launch Evolve Sprint →", bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-300", tab: "evolve" });
                }
                // New — not yet evaluated
                if (!area.preparedBriefing && !area.lastSprintResults) {
                  actions.push({ emoji: "🔍", label: "Run Evaluation →", bg: "bg-gray-500/10", border: "border-gray-700/30", text: "text-gray-400", tab: "work" });
                }
                if (actions.length === 0) return null;
                return (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {actions.map((a, i) => (
                      <span
                        key={i}
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedId(area.id); setView("detail"); setDetailTab(a.tab); }}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border ${a.bg} ${a.border} ${a.text} hover:brightness-125 transition-all cursor-pointer`}
                      >{a.emoji} {a.label}</span>
                    ))}
                  </div>
                );
              })()}
              {area.status === "emerging" && area.suggestedActions[0] && (
                <p className="text-[11px] text-amber-500/70 mt-2 italic">{area.suggestedActions[0]}</p>
              )}
              {area.progress.trend === "quiet" && area.status === "active" && !area.lastSprintResults && (
                <p className="text-[11px] text-gray-600 mt-2">Haven't seen activity recently</p>
              )}
            </button>
          ))}

          {/* Completed areas (collapsed) */}
          {focusState?.areas.filter(a => a.status === "completed").length ? (
            <details className="mt-4">
              <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
                {focusState.areas.filter(a => a.status === "completed").length} completed
              </summary>
              <div className="mt-2 space-y-2">
                {focusState.areas.filter(a => a.status === "completed").map(area => (
                  <div key={area.id} className="rounded-lg border border-gray-800/40 bg-gray-950/30 p-3 opacity-60">
                    <span className="text-xs text-gray-400">{area.title}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {/* Footer info */}
          {focusState?.lastInferredAt && (
            <p className="text-[10px] text-gray-600 text-center pt-2">
              Last analyzed: {new Date(focusState.lastInferredAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </>
    );
  }

  // ── Detail View ──
  if (!selected) {
    setView("list");
    return null;
  }

  return (
    <>
      <MobileViewHeader title={selected.title}>
        <button onClick={() => setView("list")} className="text-xs text-gray-400 hover:text-gray-200">{"\u2190"} Back</button>
      </MobileViewHeader>
      <TabHeader>
        <button onClick={() => setView("list")} className="text-xs text-gray-400 hover:text-gray-200">{"\u2190"} Back</button>
      </TabHeader>

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-800/60">
          <div className="flex items-start justify-between mb-2">
            {editingField === "title" ? (
              <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                onBlur={() => saveEdit("title")} onKeyDown={e => e.key === "Enter" && saveEdit("title")}
                className="text-lg font-semibold text-gray-100 bg-transparent border-b border-violet-500 focus:outline-none flex-1 mr-2" />
            ) : (
              <h2 className="text-lg font-semibold text-gray-100 cursor-pointer hover:text-violet-300"
                onClick={() => { setEditingField("title"); setEditValue(selected.title); }}>
                {selected.title}
              </h2>
            )}
            <WorkflowBadge area={selected} />
          </div>
          {editingField === "description" ? (
            <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
              onBlur={() => saveEdit("description")} onKeyDown={e => e.key === "Enter" && saveEdit("description")}
              className="text-sm text-gray-400 bg-transparent border-b border-violet-500 focus:outline-none w-full" />
          ) : (
            <p className="text-sm text-gray-400 cursor-pointer hover:text-gray-300"
              onClick={() => { setEditingField("description"); setEditValue(selected.description); }}>
              {selected.description}
            </p>
          )}
          {/* Remove button (subtle) */}
          <div className="flex items-center mt-2">
            <div className="flex flex-wrap gap-1.5">
              {selected.semanticTags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-gray-800/60 border border-gray-700/40 text-gray-400">{tag}</span>
              ))}
            </div>
            <div className="flex-1" />
            <button onClick={() => handleDelete(selected.id)}
              className="text-[10px] px-2 py-1 rounded text-gray-600 hover:text-red-300 hover:bg-red-500/10 transition-colors">
              Remove
            </button>
          </div>
        </div>

        {/* Detail tabs */}
        <div className="flex border-b border-gray-800/60 px-5">
          {(["work", "cortex", "experts", "evolve"] as const).map(tab => (
            <button key={tab} onClick={() => { setDetailTab(tab as DetailTab); if (tab === "cortex" && !activity) openDetail(selected.id); }}
              className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                (detailTab === "overview" || detailTab === "activity" ? "work" : detailTab) === tab ? "border-violet-500 text-violet-300" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}>
              {tab === "work" ? "Work" : tab === "cortex" ? "Cortex" : tab === "experts" ? `Experts${selected.experts?.length ? ` (${selected.experts.length})` : ""}` : "Evolve"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-5 py-4">
          {(detailTab === "overview" || detailTab === "work") && (
            <div className="space-y-5">
              {/* Context bar: intent + deeper WHY (compact, editable) */}
              <div className="rounded-lg border border-gray-800/40 bg-gray-900/20 p-4 space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1 block">Goal</label>
                  {editingField === "intent" ? (
                    <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                      onBlur={() => saveEdit("intent")} onKeyDown={e => e.key === "Enter" && saveEdit("intent")}
                      className="text-sm text-gray-200 bg-transparent border-b border-violet-500 focus:outline-none w-full" />
                  ) : (
                    <p className="text-sm text-gray-300 cursor-pointer hover:text-violet-300"
                      onClick={() => { setEditingField("intent"); setEditValue(selected.intent || ""); }}>
                      {selected.intent || <span className="text-gray-600 italic">Click to define...</span>}
                    </p>
                  )}
                </div>
                {(selected.deeperIntent || !selected.intent) && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1 block">Why this matters</label>
                    {editingField === "deeperIntent" ? (
                      <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                        onBlur={() => saveEdit("deeperIntent")}
                        className="text-xs text-gray-300 bg-gray-900/60 border border-violet-500/50 rounded px-3 py-2 focus:outline-none w-full min-h-[40px]" />
                    ) : (
                      <p className="text-xs text-gray-400 cursor-pointer hover:text-violet-300"
                        onClick={() => { setEditingField("deeperIntent"); setEditValue(selected.deeperIntent || ""); }}>
                        {selected.deeperIntent || <span className="text-gray-600 italic">Click to explore your deeper motivation...</span>}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[10px] text-gray-600 pt-1 border-t border-gray-800/30">
                  <span>{selected.evidence.length} evidence points</span>
                  {selected.preparedAt && <><span>{"\u00B7"}</span><span className="text-amber-400/60">prepared {selected.preparedAt.slice(0, 10)}</span></>}
                </div>
              </div>

              {/* === THE WORKFLOW: Evaluate → Discuss → Evolve === */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-wider text-gray-600 block">Workflow</label>

                {/* Step 1: Evaluate */}
                <button
                  disabled={preparing}
                  onClick={async () => {
                    setPreparing(true);
                    setChatReady(false);
                    try {
                      const resp = await fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS}/${selected.id}/prepare`, {
                        method: "POST",
                        headers: authHeaders(),
                      });
                      if (resp.ok) {
                        const result = await resp.json() as { briefing: string; orchestrated?: boolean };
                        if (result.orchestrated) {
                          // Orchestration launched — switch to Evolve tab to show progress
                          setDetailTab("evolve" as DetailTab);
                          setPreparing(false);
                          // Poll for completion: check every 10s if briefing has been stored
                          const pollInterval = setInterval(async () => {
                            await fetchFocusAreas();
                            const fresh = focusState?.areas.find(a => a.id === selected.id);
                            if (fresh?.preparedBriefing && fresh.preparedAt !== selected.preparedAt) {
                              clearInterval(pollInterval);
                              setChatReady(true);
                              setTimeout(() => {
                                chatAboutFocus(selected, `I've reviewed the preparation briefing. Based on your comprehensive study of this focus area, what's the most important question or decision we should address first?`);
                                setChatReady(false);
                              }, 2000);
                            }
                          }, 10000);
                          // Stop polling after 10 minutes
                          setTimeout(() => clearInterval(pollInterval), 600000);
                          return;
                        }
                        // Non-orchestrated (fallback LLM) — briefing is ready immediately
                        await fetchFocusAreas();
                        setChatReady(true);
                        setTimeout(() => {
                          chatAboutFocus(selected, `I've reviewed the preparation briefing. Based on your comprehensive study of this focus area, what's the most important question or decision we should address first?`);
                          setChatReady(false);
                        }, 2000);
                      }
                    } catch { /* preparation failed */ }
                    setPreparing(false);
                  }}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${
                    preparing ? "border-amber-500/40 bg-amber-950/20 animate-pulse"
                    : selected.preparedBriefing ? "border-emerald-500/30 bg-emerald-950/10 hover:border-emerald-500/50"
                    : "border-gray-700/40 bg-gray-900/20 hover:border-amber-500/40 hover:bg-amber-950/10"
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{preparing ? "\u23F3" : selected.preparedBriefing ? "\u2705" : "\uD83D\uDD0D"}</span>
                    <span className={`text-xs font-medium ${preparing ? "text-amber-300" : selected.preparedBriefing ? "text-emerald-300" : "text-gray-300"}`}>
                      {preparing ? "Evaluating everything about this focus..." : selected.preparedBriefing ? "Evaluated — AI has studied your data" : "Evaluate — Deep study before discussion"}
                    </span>
                  </div>
                  {!preparing && !selected.preparedBriefing && (
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">AI team researches, analyzes codebase, and synthesizes all knowledge about this focus</p>
                  )}
                  {selected.preparedBriefing && !preparing && (
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">Click to re-evaluate with latest data</p>
                  )}
                </button>

                {/* Step 2: Discuss */}
                {(() => {
                  const hasConversation = selected.conversationId && conversationsList.some(c => c.id === selected.conversationId);
                  return (
                    <button
                      onClick={() => chatAboutFocus(selected, selected.preparedBriefing
                        ? `I've reviewed the preparation briefing. Based on your comprehensive study of this focus area, what's the most important question or decision we should address first?`
                        : `Let's discuss my focus: ${selected.title}. Where do I stand and what should I prioritize next?`)}
                      className={`w-full text-left rounded-lg border p-3 transition-all ${
                        chatReady ? "border-violet-500 bg-violet-950/30 animate-pulse shadow-lg shadow-violet-500/20"
                        : hasConversation ? "border-emerald-500/30 bg-emerald-950/10 hover:border-emerald-500/50"
                        : "border-gray-700/40 bg-gray-900/20 hover:border-violet-500/40 hover:bg-violet-950/10"
                      }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{chatReady ? "\uD83D\uDCAC" : hasConversation ? "\u2705" : "\uD83D\uDCAC"}</span>
                        <span className={`text-xs font-medium ${chatReady ? "text-violet-200" : hasConversation ? "text-emerald-300" : "text-gray-300"}`}>
                          {chatReady ? "Ready — Start the strategic dialogue" : hasConversation ? "Discussed — Continue the dialogue" : "Discuss — Strategic dialogue with AI"}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 ml-6">
                        {hasConversation ? "Click to continue the conversation, or move on to Evolve when ready" : "Flesh out the problem space, agree on priorities, build an Evolve-ready brief"}
                      </p>
                    </button>
                  );
                })()}

                {/* Step 3: Evolve */}
                {selected.lastSprintDate ? (
                  <button
                    onClick={() => setDetailTab("evolve" as DetailTab)}
                    className={`w-full text-left rounded-lg border p-3 transition-all border-emerald-500/30 bg-emerald-950/10 hover:border-emerald-500/50`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{"\u2705"}</span>
                      <span className="text-xs font-medium text-emerald-300">Evolved — Sprint completed {selected.lastSprintDate.slice(0, 10)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">Click to view sprint results and deliverables</p>
                  </button>
                ) : (
                <div className="rounded-lg border border-gray-700/40 bg-gray-900/20 p-3 space-y-3">
                  <button
                    onClick={async () => {
                      if (!evolveBrief) {
                        try {
                          const absorbResp = await fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS}/${selected.id}/absorb-conversation`, {
                            method: "POST", headers: authHeaders(),
                          });
                          if (absorbResp.ok) {
                            const { updated, area: revisedArea } = await absorbResp.json() as { updated: boolean; area?: FocusArea };
                            if (updated && revisedArea) {
                              setFocusState(prev => prev ? {
                                ...prev,
                                areas: prev.areas.map(a => a.id === selected.id ? { ...a, ...revisedArea } : a),
                              } : prev);
                              Object.assign(selected, revisedArea);
                            }
                          }
                        } catch { /* absorption failed */ }

                        const lines: string[] = [];
                        lines.push(`Focus: ${selected.title}`);
                        if (selected.intent) lines.push(`Goal: ${selected.intent}`);
                        if (selected.deeperIntent) lines.push(`Why: ${selected.deeperIntent}`);

                        try {
                          const resp = await fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS}/${selected.id}/transcript`, { headers: authHeaders() });
                          if (resp.ok) {
                            const { transcript } = await resp.json() as { transcript: string };
                            if (transcript.trim()) {
                              const recent = transcript.length > 4000 ? transcript.slice(-4000) : transcript;
                              lines.push(`\n--- Strategic Discussion ---`);
                              lines.push(recent);
                            }
                          }
                        } catch { /* transcript fetch failed */ }

                        if (selected.nextSteps?.length) {
                          lines.push(`\n--- Priorities ---`);
                          selected.nextSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
                        }
                        if (selected.preparedBriefing) {
                          lines.push(`\n--- Key findings from evaluation ---`);
                          lines.push(selected.preparedBriefing.slice(0, 800).trim());
                        }
                        setEvolveBrief(lines.join("\n"));
                      }
                      setShowEvolveBrief(true);
                    }}
                    className="w-full text-left hover:opacity-90 transition-opacity">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{"\uD83D\uDE80"}</span>
                      <span className="text-xs font-medium text-gray-300">Evolve — Launch AI team sprint</span>
                      {showEvolveBrief && <span className="text-[10px] text-gray-600 ml-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); setShowEvolveBrief(false); }}>{"\u25B2"} Collapse</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">Full team of AI agents executes on the agreed goals from your discussion</p>
                  </button>

                  {showEvolveBrief && (
                    <div className="space-y-2 pt-2 border-t border-gray-800/40">
                      <label className="text-[10px] uppercase tracking-wider text-gray-600 block">Sprint Brief — what the AI team will work on</label>
                      <textarea
                        value={evolveBrief}
                        onChange={e => setEvolveBrief(e.target.value)}
                        className="w-full bg-gray-950/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-violet-500/50 min-h-[120px] max-h-[300px] resize-y"
                        placeholder="Describe what the AI team should focus on..."
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            useChatStore.getState().sendFocusEvolve(selected.id, evolveBrief);
                            setSprintLaunched(true);
                            setDetailTab("evolve" as DetailTab);
                          }}
                          className="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                          Launch Sprint
                        </button>
                        <span className="text-[10px] text-gray-600">{evolveBrief.length} chars</span>
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* Next steps / suggested actions (if any) */}
              {(selected.nextSteps?.length || selected.suggestedActions.length > 0) && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">
                    {selected.nextSteps?.length ? "Next Steps" : "Suggested Actions"}
                  </label>
                  <div className="space-y-1.5">
                    {(selected.nextSteps || selected.suggestedActions).map((item, i) => (
                      <button key={i} onClick={() => chatAboutFocus(selected, item)}
                        className="w-full text-left text-xs text-gray-300 px-3 py-2 rounded bg-gray-800/40 border border-gray-700/30 hover:border-violet-500/30 hover:text-violet-300 transition-colors">
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Adjacent pursuits */}
              {selected.adjacentPursuits && selected.adjacentPursuits.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">Adjacent Pursuits</label>
                  <div className="space-y-1.5">
                    {selected.adjacentPursuits.map((pursuit, i) => (
                      <button key={i} onClick={() => chatAboutFocus(selected, `Let's explore: ${pursuit}`)}
                        className="w-full text-left text-xs text-amber-300/80 px-3 py-2 rounded bg-amber-900/10 border border-amber-500/15 hover:border-amber-500/30 hover:bg-amber-900/20 transition-colors">
                        {"\u2728"} {pursuit}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(detailTab === "cortex" || detailTab === "activity") && (
            <div className="space-y-5">
              {/* Stats bar */}
              <div className="flex items-center gap-3 text-[11px] flex-wrap">
                {selected.relatedEntityIds && selected.relatedEntityIds.length > 0 && (
                  <span className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{selected.relatedEntityIds.length} deliverables</span>
                )}
                <span className="px-2 py-1 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">{selected.evidence.length} evidence</span>
                {activity && <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">{activity.total} related</span>}
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{selected.refinements.length} refinements</span>
                <span className="px-2 py-1 rounded bg-gray-500/10 text-gray-400 border border-gray-700/30">{selected.semanticTags.join(", ")}</span>
              </div>

              {/* Sprint Results Summary Header — when structured summary exists */}
              {selected.lastSprintSummary && (
                <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{"\uD83C\uDFAF"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-violet-400/70">Sprint Results</label>
                    <span className="text-[10px] text-gray-500 ml-auto">
                      {exploredDeliverables.size} of {selected.lastSprintSummary.deliverables.length} explored
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed mb-3">{selected.lastSprintSummary.sprintSummary}</p>
                  {selected.lastSprintSummary.nextSteps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.lastSprintSummary.nextSteps.map((step, i) => (
                        <button key={i} onClick={() => chatAboutFocus(selected, step)}
                          className="text-[10px] px-2 py-1 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/20 transition-colors">
                          {step}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sprint Deliverables — activation cards (structured) or fallback (plain) */}
              {selected.relatedEntityIds && selected.relatedEntityIds.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{"\uD83D\uDCE6"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-gray-600">Sprint Deliverables ({selected.relatedEntityIds.length})</label>
                  </div>
                  <div className="space-y-2">
                    {selected.relatedEntityIds.map((eid, i) => {
                      // Parse entity ID: "cortex:article:elite-photographer-gallery"
                      const parts = eid.split(":");
                      const entityType = parts[1] || "unknown";
                      const slug = parts.slice(2).join(":");
                      const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                      const typeIcons: Record<string, string> = {
                        idea: "\u2728", article: "\uD83D\uDCF0", app: "\uD83D\uDCBB", project: "\uD83D\uDCC1",
                        synthesis: "\uD83D\uDCCA", book: "\uD83D\uDCDA", game: "\uD83C\uDFAE",
                        movie: "\uD83C\uDFAC", channel: "\uD83D\uDCFA", place: "\u2708\uFE0F",
                      };

                      // Try to find matching deliverable from structured summary
                      const summaryDeliverable = selected.lastSprintSummary?.deliverables.find(d => d.entityId === eid);
                      const isRecommended = selected.lastSprintSummary?.recommendedFirstAction.deliverableIndex ===
                        selected.lastSprintSummary?.deliverables.findIndex(d => d.entityId === eid);
                      const isExpanded = expandedDeliverable === eid;
                      const isExplored = exploredDeliverables.has(eid);

                      // Activation card colors by entity type
                      const activationColors: Record<string, { border: string; bg: string; badge: string; badgeText: string; actionBtn: string }> = {
                        app: { border: "border-blue-500/25", bg: "bg-blue-950/15", badge: "bg-blue-500/20", badgeText: "text-blue-300", actionBtn: "bg-blue-600 hover:bg-blue-500 text-white" },
                        article: { border: "border-emerald-500/25", bg: "bg-emerald-950/15", badge: "bg-emerald-500/20", badgeText: "text-emerald-300", actionBtn: "bg-emerald-600 hover:bg-emerald-500 text-white" },
                        idea: { border: "border-purple-500/25", bg: "bg-purple-950/15", badge: "bg-purple-500/20", badgeText: "text-purple-300", actionBtn: "bg-purple-600 hover:bg-purple-500 text-white" },
                        synthesis: { border: "border-amber-500/25", bg: "bg-amber-950/15", badge: "bg-amber-500/20", badgeText: "text-amber-300", actionBtn: "bg-amber-600 hover:bg-amber-500 text-white" },
                      };

                      const loadContent = async () => {
                        setExpandedDeliverable(eid);
                        setDeliverableContent("Loading...");
                        setExploredDeliverables(prev => new Set(prev).add(eid));
                        try {
                          const entityResp = await fetch(`${getBackendBaseUrl()}/api/cortex/action`, {
                            method: "POST",
                            headers: { ...authHeaders(), "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "view_entity", payload: { entityId: eid }, appFamily: "cortex" }),
                          });
                          const entityData = await entityResp.json();
                          const content = entityData?.data?.cortexContent || entityData?.cortexContent;
                          if (content) {
                            setDeliverableContent(content);
                          } else {
                            const paths = [`synthesis/${slug}.md`, `synthesis/article-${slug}.md`, `entities/${slug}.md`];
                            let found = false;
                            for (const p of paths) {
                              const r = await fetch(`${getBackendBaseUrl()}/api/cortex/action`, {
                                method: "POST",
                                headers: { ...authHeaders(), "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "read", payload: { path: p }, appFamily: "cortex" }),
                              });
                              const d = await r.json();
                              const c = d?.data?.content || d?.content;
                              if (c && c !== "Page not found") { setDeliverableContent(c); found = true; break; }
                            }
                            if (!found) setDeliverableContent("Content not found in Cortex");
                          }
                        } catch { setDeliverableContent("Failed to load content"); }
                      };

                      // ── Structured activation card (when summary exists for this deliverable) ──
                      if (summaryDeliverable) {
                        const colors = activationColors[summaryDeliverable.entityType] || activationColors.synthesis;
                        const actionLabels: Record<string, string> = { run: "Run App", read: "Read", explore: "Explore", review: "Review" };
                        const actionLabel = actionLabels[summaryDeliverable.actionType] || "View";

                        return (
                          <div key={i} className={`rounded-lg border ${colors.border} ${colors.bg} p-3 transition-all ${isRecommended ? "ring-1 ring-violet-400/30" : ""}`}>
                            {/* Header row */}
                            <div className="flex items-start gap-2 mb-2">
                              <span className="text-base shrink-0">{typeIcons[entityType] || "\uD83D\uDCC4"}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-medium text-gray-200 leading-snug">{title}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${colors.badge} ${colors.badgeText}`}>
                                    {summaryDeliverable.entityType}
                                  </span>
                                  {isRecommended && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                                      Start Here
                                    </span>
                                  )}
                                  {isExplored && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-500/20 text-gray-400">{"\u2713"}</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1 leading-snug">{summaryDeliverable.painPoint}</p>
                              </div>
                            </div>

                            {/* How it helps */}
                            <p className="text-[11px] text-gray-300 leading-relaxed mb-2 pl-7">{summaryDeliverable.howItHelps}</p>

                            {/* Quick start hint + action button */}
                            <div className="flex items-center gap-2 pl-7">
                              <span className="text-[10px] text-gray-500 flex-1 truncate">{summaryDeliverable.quickStart}</span>
                              {summaryDeliverable.actionType === "run" ? (
                                <button
                                  onClick={() => {
                                    setExploredDeliverables(prev => new Set(prev).add(eid));
                                    useChatStore.getState().runApp(slug);
                                  }}
                                  className={`text-[11px] px-3 py-1 rounded-md ${colors.actionBtn} transition-colors shrink-0`}
                                >
                                  {actionLabel}
                                </button>
                              ) : (
                                <button
                                  onClick={() => { isExpanded ? setExpandedDeliverable(null) : loadContent(); }}
                                  className={`text-[11px] px-3 py-1 rounded-md ${colors.actionBtn} transition-colors shrink-0`}
                                >
                                  {isExpanded ? "Collapse" : actionLabel}
                                </button>
                              )}
                            </div>

                            {/* Expanded content */}
                            {isExpanded && (
                              <div className="mt-2 ml-7 rounded-lg border border-gray-700/30 bg-gray-900/30 p-3 max-h-[400px] overflow-y-auto">
                                <Suspense fallback={<div className="text-xs text-gray-500">Loading...</div>}>
                                  <div className="text-sm"><MarkdownText text={deliverableContent || "Loading..."} /></div>
                                </Suspense>
                              </div>
                            )}
                          </div>
                        );
                      }

                      // ── Fallback: plain expandable card (no structured summary for this entity) ──
                      const fallbackColors: Record<string, string> = {
                        idea: "border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40",
                        article: "border-blue-500/20 bg-blue-950/10 hover:border-blue-500/40",
                        app: "border-indigo-500/20 bg-indigo-950/10 hover:border-indigo-500/40",
                        project: "border-violet-500/20 bg-violet-950/10 hover:border-violet-500/40",
                        synthesis: "border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500/40",
                      };
                      return (
                        <div key={i}>
                          <button className={`rounded-lg border p-3 transition-colors cursor-pointer text-left w-full ${fallbackColors[entityType] || "border-gray-700/30 bg-gray-900/20"}`}
                            onClick={() => { isExpanded ? setExpandedDeliverable(null) : loadContent(); }}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-sm shrink-0">{typeIcons[entityType] || "\uD83D\uDCC4"}</span>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs text-gray-200 block leading-snug">{title}</span>
                                <span className="text-[10px] text-gray-500">{entityType}</span>
                              </div>
                              <span className="text-[10px] text-gray-500 ml-auto shrink-0">{isExpanded ? "\u25BC" : "\u25B6"}</span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="mt-1 rounded-lg border border-gray-700/30 bg-gray-900/30 p-4 max-h-[500px] overflow-y-auto">
                              <Suspense fallback={<div className="text-xs text-gray-500">Loading...</div>}>
                                <div className="text-sm"><MarkdownText text={deliverableContent || "Loading..."} /></div>
                              </Suspense>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preparation Briefing — the centerpiece */}
              {selected.preparedBriefing && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm">{"\uD83D\uDCCB"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-amber-400/70">Preparation Briefing</label>
                    {selected.preparedAt && <span className="text-[10px] text-gray-600 ml-auto">{selected.preparedAt.slice(0, 10)}</span>}
                  </div>
                  <div className="text-sm text-gray-300 leading-relaxed max-h-80 overflow-y-auto pr-2">
                    <Suspense fallback={<div className="text-xs text-gray-500">Loading...</div>}>
                      <MarkdownText text={selected.preparedBriefing} />
                    </Suspense>
                  </div>
                </div>
              )}

              {/* Deeper Motivation */}
              {selected.deeperIntent && (
                <div className="rounded-lg border border-violet-500/15 bg-violet-950/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{"\uD83D\uDCA1"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-violet-400/60">Why This Matters</label>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{selected.deeperIntent}</p>
                </div>
              )}

              {/* Evidence — grouped by source type */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{"\uD83D\uDCDA"}</span>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600">Evidence & Sources</label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {selected.evidence.map((ev, i) => {
                    const sourceMatch = ev.match(/^(Project|Reading|YouTube|Game|Movie|Photo|Email|Browser|System):\s*/i);
                    const source = sourceMatch ? sourceMatch[1].toLowerCase() : "";
                    const icon = SOURCE_ICONS[source === "reading" ? "kindle" : source === "game" ? "steam" : source === "movie" ? "movies_tv" : source === "youtube" ? "youtube" : source === "project" ? "projects" : source] || "\uD83D\uDCC4";
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-800/40 hover:border-gray-700/60 transition-colors">
                        <span className="shrink-0">{icon}</span>
                        <span className="text-gray-300 truncate">{ev}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Related Knowledge from Cortex */}
              {activity && activity.entities.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{"\uD83E\uDDE0"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-gray-600">Related in Cortex ({activity.total})</label>
                  </div>
                  {(() => {
                    // Group by source
                    const groups = new Map<string, typeof activity.entities>();
                    for (const ent of activity.entities) {
                      if (!groups.has(ent.source)) groups.set(ent.source, []);
                      groups.get(ent.source)!.push(ent);
                    }
                    return Array.from(groups.entries()).map(([src, ents]) => (
                      <div key={src} className="mb-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs">{SOURCE_ICONS[src] || "\uD83D\uDCC4"}</span>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider">{src}</span>
                          <span className="text-[10px] text-gray-600">({ents.length})</span>
                        </div>
                        <div className="space-y-0.5 ml-5">
                          {ents.map((ent, i) => (
                            <div key={i} className="text-xs text-gray-400 py-1 flex items-start gap-2">
                              <span className="text-gray-300 truncate">{ent.title}</span>
                              {ent.matchReason && <span className="text-[10px] text-gray-600 italic shrink-0">{ent.matchReason}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Adjacent pursuits */}
              {selected.adjacentPursuits && selected.adjacentPursuits.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{"\u2728"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-gray-600">Adjacent Pursuits</label>
                  </div>
                  <div className="space-y-1.5">
                    {selected.adjacentPursuits.map((pursuit, i) => (
                      <div key={i} className="text-xs text-amber-300/70 px-3 py-2 rounded-lg bg-amber-900/10 border border-amber-500/10">
                        {pursuit}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Journey timeline */}
              {selected.refinements.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{"\uD83D\uDDD3\uFE0F"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-gray-600">Journey ({selected.refinements.length} milestones)</label>
                  </div>
                  <div className="space-y-1 border-l-2 border-gray-800/60 pl-3 ml-1">
                    {selected.refinements.slice().reverse().map((r, i) => (
                      <div key={i} className="text-[11px] text-gray-500 relative">
                        <span className={`absolute -left-[17px] top-1.5 w-2 h-2 rounded-full ${
                          r.source === "conversation" ? "bg-blue-500/60" : r.source === "user_edit" ? "bg-emerald-500/60" : "bg-gray-600"
                        }`} />
                        <span className="text-gray-600">{r.date.slice(0, 10)}</span>
                        <span className="text-gray-700 mx-1">{"\u00B7"}</span>
                        <span className={r.source === "conversation" ? "text-blue-400/70" : r.source === "user_edit" ? "text-emerald-400/70" : "text-gray-500"}>{r.source}</span>
                        <span className="text-gray-700 mx-1">{"\u00B7"}</span>
                        {r.change}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {detailTab === "experts" && (
            <div className="space-y-4 px-5 py-4">
              {(!selected.experts || selected.experts.length === 0) ? (
                <div className="text-center py-10">
                  <div className="text-3xl mb-3">{"\uD83E\uDDD1\u200D\uD83D\uDD2C"}</div>
                  <h3 className="text-sm font-medium text-gray-200 mb-2">No experts yet</h3>
                  <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
                    Generate a team of domain-specific experts who can help you make progress on "{selected.title}".
                    Each expert has a unique perspective and can be consulted directly via chat.
                  </p>
                  <button
                    onClick={async () => {
                      setGeneratingExperts(true);
                      try {
                        const res = await fetch(`${getBackendBaseUrl()}/api/focus-areas/${selected.id}/generate-experts`, {
                          method: "POST", headers: authHeaders(),
                        });
                        if (res.ok) { await fetchFocusAreas(); }
                      } catch { /* ignore */ }
                      setGeneratingExperts(false);
                    }}
                    disabled={generatingExperts}
                    className="text-sm px-4 py-2 rounded-lg bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 disabled:opacity-50"
                  >
                    {generatingExperts ? "Generating team..." : "Generate Expert Team"}
                  </button>
                </div>
              ) : (
                <>
                  {/* Team health summary */}
                  {(() => {
                    const experts = selected.experts!;
                    const active = experts.filter(e => {
                      if (!e.metrics?.lastActiveAt) return false;
                      return (Date.now() - new Date(e.metrics.lastActiveAt).getTime()) / 86400000 <= 7;
                    }).length;
                    const idle = experts.filter(e => {
                      if (!e.metrics?.lastActiveAt) return false;
                      const d = (Date.now() - new Date(e.metrics.lastActiveAt).getTime()) / 86400000;
                      return d > 7 && d <= 30;
                    }).length;
                    const stale = experts.length - active - idle;
                    const totalConvos = experts.reduce((sum, e) => sum + (e.metrics?.conversationCount || 0), 0);
                    const totalSprints = experts.reduce((sum, e) => sum + (e.metrics?.sprintCount || 0), 0);
                    return (
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/30 mb-3">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-[10px] text-gray-400">{active}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span className="text-[10px] text-gray-400">{idle}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500/60" /><span className="text-[10px] text-gray-400">{stale}</span>
                        </div>
                        <span className="text-[9px] text-gray-600 mx-1">|</span>
                        <span className="text-[10px] text-gray-500">💬 {totalConvos}</span>
                        <span className="text-[10px] text-gray-500">⚡ {totalSprints}</span>
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Expert Team ({selected.experts.length})</p>
                    <button
                      onClick={async () => {
                        setGeneratingExperts(true);
                        try {
                          const res = await fetch(`${getBackendBaseUrl()}/api/focus-areas/${selected.id}/generate-experts`, {
                            method: "POST", headers: authHeaders(),
                          });
                          if (res.ok) await fetchFocusAreas();
                        } catch { /* ignore */ }
                        setGeneratingExperts(false);
                      }}
                      disabled={generatingExperts}
                      className="text-[10px] px-2 py-1 rounded bg-gray-800/60 text-gray-400 border border-gray-700/40 hover:text-amber-300 hover:border-amber-500/30 disabled:opacity-50"
                    >
                      {generatingExperts ? "..." : "Regenerate"}
                    </button>
                  </div>
                  {selected.experts.map(expert => {
                    const roleColors: Record<string, string> = {
                      architect: "bg-blue-500", reviewer: "bg-amber-500", researcher: "bg-emerald-500",
                      coder: "bg-violet-500", builder: "bg-orange-500",
                    };
                    // Activity status indicator
                    const m = expert.metrics;
                    let activityStatus: "active" | "idle" | "stale" = "stale";
                    let activityLabel = "Never active";
                    if (m?.lastActiveAt) {
                      const daysSince = Math.floor((Date.now() - new Date(m.lastActiveAt).getTime()) / 86400000);
                      if (daysSince <= 7) { activityStatus = "active"; activityLabel = daysSince === 0 ? "Active today" : `Active ${daysSince}d ago`; }
                      else if (daysSince <= 30) { activityStatus = "idle"; activityLabel = `Idle ${daysSince}d`; }
                      else { activityLabel = `Stale ${daysSince}d`; }
                    }
                    const statusColors = { active: "bg-emerald-500", idle: "bg-amber-500", stale: "bg-red-500/60" };
                    const statusBorder = { active: "border-emerald-500/20", idle: "border-amber-500/20", stale: "border-red-500/10" };

                    return (
                      <div key={expert.id} className={`rounded-xl border ${statusBorder[activityStatus]} bg-gray-900/30 p-4`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${roleColors[expert.agentRole] || "bg-gray-500"}`} />
                          <span className="text-sm font-medium text-gray-100">{expert.name}</span>
                          <span className="text-[10px] text-gray-500">{expert.role}</span>
                          <div className="ml-auto flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${statusColors[activityStatus]}`} />
                            <span className={`text-[9px] ${activityStatus === "active" ? "text-emerald-400" : activityStatus === "idle" ? "text-amber-400" : "text-gray-500"}`}>
                              {activityLabel}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-2 leading-relaxed">{expert.responsibilities}</p>
                        <p className="text-[11px] text-amber-400/70 italic mb-3">"{expert.perspective}"</p>

                        {/* Activity metrics row */}
                        {m && (m.conversationCount > 0 || m.sprintCount > 0) && (
                          <div className="flex gap-3 mb-2">
                            <span className="text-[10px] text-gray-500">💬 {m.conversationCount} convos</span>
                            <span className="text-[10px] text-gray-500">⚡ {m.sprintCount} sprints</span>
                            {m.insightsGenerated > 0 && <span className="text-[10px] text-gray-500">💡 {m.insightsGenerated} insights</span>}
                          </div>
                        )}

                        {/* TL evaluation note */}
                        {m?.lastEvaluation && (
                          <div className="mb-2 px-2 py-1.5 rounded-lg bg-indigo-950/30 border border-indigo-500/10">
                            <span className="text-[9px] text-indigo-400/60 uppercase tracking-wider">TL Review</span>
                            <p className="text-[10px] text-indigo-300/80 mt-0.5">{m.lastEvaluation}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1 mb-3">
                          {expert.goals.map((g, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800/60 text-gray-400 border border-gray-700/40">{g}</span>
                          ))}
                        </div>
                        <button
                          onClick={async () => {
                            if (expert.conversationId) {
                              selectConversation(expert.conversationId);
                              setActiveTab("chat");
                              setChatViewOpen(true);
                              return;
                            }
                            // Create new conversation for this expert
                            try {
                              const convRes = await fetch(`${getBackendBaseUrl()}/api/conversations`, {
                                method: "POST",
                                headers: { ...authHeaders(), "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  clientId: getClientId(),
                                  title: `${expert.name} — ${selected.title}`,
                                  context: { type: "expert", sourceId: `${selected.id}:${expert.id}`, label: "Expert" },
                                }),
                              });
                              if (!convRes.ok) return;
                              const created = await convRes.json();
                              // Save conversationId on expert
                              const updatedExperts = selected.experts!.map(e =>
                                e.id === expert.id ? { ...e, conversationId: created.id } : e
                              );
                              await fetch(`${getBackendBaseUrl()}/api/focus-areas/${selected.id}`, {
                                method: "PATCH",
                                headers: { ...authHeaders(), "Content-Type": "application/json" },
                                body: JSON.stringify({ experts: updatedExperts }),
                              });
                              await fetchFocusAreas();
                              selectConversation(created.id);
                              setActiveTab("chat");
                              setChatViewOpen(true);
                            } catch { /* ignore */ }
                          }}
                          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          Chat with {expert.name.split(" ")[0]} →
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {detailTab === "evolve" && (
            <EvolveTab focusArea={selected} sprintLaunched={sprintLaunched} onNavigateToChat={() => {
              if (selected.conversationId) {
                selectConversation(selected.conversationId);
                setActiveTab("chat");
              }
            }} />
          )}

        </div>
      </div>
    </>
  );
}

// ── Evolve Tab ──

const ROLE_EMOJI: Record<string, string> = {
  researcher: "\uD83D\uDD0D",
  architect: "\uD83D\uDCD0",
  builder: "\uD83D\uDD28",
  coder: "\uD83D\uDCBB",
  reviewer: "\u2705",
};

function EvolveTab({ focusArea, sprintLaunched, onNavigateToChat }: { focusArea: FocusArea; sprintLaunched?: boolean; onNavigateToChat: () => void }) {
  const cards = useChatStore((s) => s.cards);
  const [tick, setTick] = useState(0);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll terminal when expanded task updates
  useEffect(() => {
    if (expandedTask && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expandedTask, tick]);

  // Find the most recent orchestration card (prefer streaming, fall back to complete)
  const allOrchCards = Object.values(cards).filter(c => c.type === "orchestration");
  const orchCard = allOrchCards.find(c => c.status === "streaming")
    || allOrchCards.sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const orchData = orchCard?.data as { orchestrationProgress?: { plan?: { tasks: Array<{ taskId: string; title: string; agentRole: string; status: string; resultSummary?: string }>; goal?: string; status?: string } }; orchestrationPlan?: { tasks: Array<{ taskId: string; title: string; agentRole: string; status: string; resultSummary?: string }>; goal?: string; status?: string } } | undefined;
  const plan = orchData?.orchestrationProgress?.plan || orchData?.orchestrationPlan;
  const tasks = plan?.tasks || [];
  const taskTerminals = orchCard?.taskTerminals || {};
  const completed = tasks.filter(t => t.status === "completed").length;
  const running = tasks.filter(t => t.status === "running");
  const failed = tasks.filter(t => t.status === "failed").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const elapsed = orchCard ? Math.round((Date.now() - orchCard.createdAt) / 60000) : 0;

  if (!orchCard || total === 0) {
    if (sprintLaunched) {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm animate-pulse">{"\u26A1"}</span>
              <span className="text-xs font-medium text-indigo-200">Planning Sprint...</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full w-[15%] rounded-full bg-indigo-500 animate-pulse" />
            </div>
            <p className="text-[11px] text-gray-500">AI is analyzing your focus area and designing the task plan. This typically takes 1-2 minutes.</p>
          </div>
        </div>
      );
    }
    if (focusArea.lastSprintResults) {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">{"\u2705"}</span>
              <span className="text-xs font-medium text-emerald-200">Last Sprint — {focusArea.lastSprintDate?.slice(0, 10)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-gray-800/40 bg-gray-950/30 p-4 text-xs text-gray-300 overflow-y-auto max-h-[500px]">
            <Suspense fallback={<p className="text-gray-500">Loading...</p>}>
              <MarkdownText text={focusArea.lastSprintResults} />
            </Suspense>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <span className="text-3xl mb-3 block">{"\uD83D\uDE80"}</span>
          <p className="text-sm text-gray-400 mb-2">No evolution sprint running</p>
          <p className="text-xs text-gray-600 mb-4">Use the <strong>Evaluate → Discuss → Evolve</strong> workflow in the Work tab to launch a sprint</p>
          <button onClick={onNavigateToChat}
            className="text-xs px-4 py-2 rounded-lg bg-violet-600/60 text-violet-100 hover:bg-violet-500/60 transition-colors">
            Open focus conversation
          </button>
        </div>
      </div>
    );
  }

  void tick;

  const isComplete = completed === total && total > 0;
  const isRunning = running.length > 0;
  const goal = plan?.goal || "";
  const isEvolution = goal.includes("Evolution") || sprintLaunched;

  return (
    <div className="space-y-4">
      {/* Sprint header + progress */}
      <div className={`rounded-lg border p-4 space-y-3 ${
        isComplete ? "border-emerald-500/30 bg-emerald-950/10" : "border-indigo-500/30 bg-indigo-950/10"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isRunning ? "animate-pulse" : ""}`}>
            {isComplete ? "\u2705" : "\u26A1"}
          </span>
          <span className={`text-xs font-medium ${isComplete ? "text-emerald-200" : "text-indigo-200"}`}>
            {isComplete
              ? (isEvolution ? "Evolution Complete" : "Evaluation Complete")
              : (isEvolution ? "Evolution Sprint" : "Evaluation Sprint")}
          </span>
          <span className="text-[10px] text-gray-500 tabular-nums">{elapsed}m</span>
          <span className="text-[10px] text-gray-500 ml-auto">{completed}/{total} tasks</span>
          {failed > 0 && <span className="text-[10px] text-red-400">{failed} failed</span>}
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${
            isComplete ? "bg-emerald-500" : isRunning ? "bg-blue-500 animate-pulse" : "bg-blue-500"
          }`} style={{ width: `${Math.max(pct, isRunning ? 3 : 0)}%` }} />
        </div>
      </div>

      {/* Live task list with expandable terminals */}
      <div className="space-y-0.5">
        {tasks.map(task => {
          const terminal = taskTerminals[task.taskId];
          const hasTerminal = !!terminal?.text;
          const hasSummary = !!task.resultSummary;
          const isExpanded = expandedTask === task.taskId;
          const canExpand = hasTerminal || hasSummary || (task.status === "running");

          return (
            <div key={task.taskId}>
              <button
                onClick={() => canExpand && setExpandedTask(isExpanded ? null : task.taskId)}
                className={`w-full flex items-center gap-2 text-xs px-3 py-2 rounded transition-all text-left ${
                  task.status === "running" ? "bg-blue-500/10 border border-blue-500/20" :
                  task.status === "completed" ? "bg-gray-800/20 text-gray-400" :
                  task.status === "failed" ? "bg-red-500/5 text-red-400/80" :
                  task.status === "blocked" ? "opacity-30" :
                  "text-gray-500"
                } ${canExpand ? "cursor-pointer hover:bg-gray-800/40" : "cursor-default"}`}
              >
                <span className="w-4 text-center shrink-0">
                  {task.status === "completed" ? <span className="text-green-400">{"\u2713"}</span> :
                   task.status === "failed" ? <span className="text-red-400">{"\u2717"}</span> :
                   task.status === "running" ? <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" /> :
                   task.status === "blocked" ? <span>{"\u2298"}</span> :
                   <span className="text-gray-600">{"\u25CB"}</span>}
                </span>
                <span className="shrink-0">{ROLE_EMOJI[task.agentRole] || "\uD83E\uDD16"}</span>
                <span className="truncate flex-1">{task.title}</span>
                {canExpand && (
                  <span className="text-[10px] text-gray-600 shrink-0">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                )}
              </button>

              {/* Expanded terminal output */}
              {isExpanded && hasTerminal && (
                <div className="mx-1 mt-0.5 mb-1 rounded-lg bg-[#0d1117] border border-gray-800/60 overflow-hidden">
                  <pre className="p-3 text-[11px] leading-relaxed text-gray-300 font-mono whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
                    {terminal.text.slice(-3000)}
                    <div ref={terminalEndRef} />
                  </pre>
                </div>
              )}
              {isExpanded && !hasTerminal && hasSummary && (
                <div className="mx-1 mt-0.5 mb-1 rounded-lg bg-[#0d1117] border border-gray-800/60 p-3">
                  <p className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap">{task.resultSummary}</p>
                </div>
              )}
              {isExpanded && !hasTerminal && !hasSummary && task.status === "running" && (
                <div className="mx-1 mt-0.5 mb-1 rounded-lg bg-[#0d1117] border border-gray-800/60 p-3">
                  <p className="text-[11px] text-gray-500 font-mono animate-pulse">Agent starting...</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigate to full view */}
      <button onClick={onNavigateToChat}
        className="w-full text-left rounded-lg border border-gray-700/40 bg-gray-900/20 p-3 hover:border-violet-500/40 hover:bg-violet-950/10 transition-all">
        <div className="flex items-center gap-2">
          <span className="text-sm">{"\uD83D\uDCAC"}</span>
          <span className="text-xs font-medium text-gray-300">View in conversation</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1 ml-6">See full orchestration card with terminals and agent outputs</p>
      </button>
    </div>
  );
}

// ── Helper Components ──

function WorkflowBadge({ area }: { area: FocusArea }) {
  const phase = area.lastSprintDate
    ? { label: "Evolved", bg: "bg-emerald-900/30 text-emerald-400" }
    : area.conversationId
    ? { label: "In Discussion", bg: "bg-emerald-900/30 text-emerald-400" }
    : area.preparedBriefing
    ? { label: "Evaluated", bg: "bg-emerald-900/30 text-emerald-400" }
    : { label: "New", bg: "bg-gray-800/40 text-gray-500" };

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${phase.bg}`}>{phase.label}</span>
  );
}
