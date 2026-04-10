import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { getClientId } from "../lib/ws-client";
import { TabHeader, MobileViewHeader } from "./TabNavigation";
import { API } from "../lib/constants";

// ── Types ──

interface FocusArea {
  id: string;
  title: string;
  description: string;
  status: "active" | "paused" | "completed" | "emerging";
  clarity: "emerging" | "developing" | "clear";
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
type DetailTab = "work" | "cortex" | "evolve" | "overview" | "activity" | "plan"; // legacy names kept for backward compat

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
  const selectConversation = useChatStore((s) => s.selectConversation);
  const startNewChat = useChatStore((s) => s.startNewChat);
  const conversationsList = useChatStore((s) => s.conversationsList);

  const [view, setView] = useState<View>("list");
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
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

  useEffect(() => { fetchFocusAreas(); }, [fetchFocusAreas]);

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
    // If focus area already has a conversation, switch to it
    if (area.conversationId) {
      // Verify conversation still exists
      const exists = conversationsList.some(c => c.id === area.conversationId);
      if (exists) {
        selectConversation(area.conversationId);
        setActiveTab("chat");
        if (initialMessage) {
          // Small delay to let conversation load before sending
          setTimeout(() => sendMessage(initialMessage), 300);
        }
        return;
      }
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
                <h3 className="text-sm font-medium text-gray-100 pr-2">{area.title}</h3>
                <div className="flex items-center gap-2 shrink-0">
                  <TrendBadge trend={area.progress.trend} />
                  <ClarityBadge clarity={area.clarity} />
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-2 line-clamp-2">{area.intent || area.description}</p>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                {area.evidence.length > 0 && <span>{area.evidence.length} evidence points</span>}
                {area.semanticTags.length > 0 && <span>{area.semanticTags.slice(0, 2).join(", ")}</span>}
                <span>{Math.round(area.confidence * 100)}% confidence</span>
              </div>
              {area.status === "emerging" && area.suggestedActions[0] && (
                <p className="text-[11px] text-amber-500/70 mt-2 italic">{area.suggestedActions[0]}</p>
              )}
              {area.progress.trend === "quiet" && area.status === "active" && (
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
            <div className="flex items-center gap-2 shrink-0">
              <TrendBadge trend={selected.progress.trend} />
              <ClarityBadge clarity={selected.clarity} />
            </div>
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
          {(["work", "cortex", "evolve"] as const).map(tab => (
            <button key={tab} onClick={() => { setDetailTab(tab as DetailTab); if (tab === "cortex" && !activity) openDetail(selected.id); }}
              className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                (detailTab === "overview" || detailTab === "activity" ? "work" : detailTab) === tab ? "border-violet-500 text-violet-300" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}>
              {tab === "work" ? "Work" : tab === "cortex" ? "Cortex" : "Evolve"}
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
                  <span>{selected.clarity}</span>
                  <span>{"\u00B7"}</span>
                  <span>{selected.progress.trend}</span>
                  <span>{"\u00B7"}</span>
                  <span>{selected.evidence.length} evidence points</span>
                  {selected.preparedAt && <><span>{"\u00B7"}</span><span className="text-amber-400/60">prepared {selected.preparedAt.slice(0, 10)}</span></>}
                </div>
              </div>

              {/* === THE WORKFLOW: Prepare → Discuss → Evolve === */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-wider text-gray-600 block">Workflow</label>

                {/* Step 1: Prepare */}
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
                      {preparing ? "Studying everything about this focus..." : selected.preparedBriefing ? "Prepared — AI has studied your data" : "Prepare — Deep study before discussion"}
                    </span>
                  </div>
                  {!preparing && !selected.preparedBriefing && (
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">Gathers project data, sprint history, Cortex knowledge, and cross-source connections</p>
                  )}
                  {selected.preparedBriefing && !preparing && (
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">Click to re-prepare with latest data</p>
                  )}
                </button>

                {/* Step 2: Discuss */}
                <button
                  onClick={() => chatAboutFocus(selected, selected.preparedBriefing
                    ? `I've reviewed the preparation briefing. Based on your comprehensive study of this focus area, what's the most important question or decision we should address first?`
                    : `Let's discuss my focus: ${selected.title}. Where do I stand and what should I prioritize next?`)}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${
                    chatReady ? "border-violet-500 bg-violet-950/30 animate-pulse shadow-lg shadow-violet-500/20"
                    : "border-gray-700/40 bg-gray-900/20 hover:border-violet-500/40 hover:bg-violet-950/10"
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{"\uD83D\uDCAC"}</span>
                    <span className={`text-xs font-medium ${chatReady ? "text-violet-200" : "text-gray-300"}`}>
                      {chatReady ? "Ready — Start the strategic dialogue" : "Discuss — Strategic dialogue with AI"}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 ml-6">Flesh out the problem space, agree on priorities, build an Evolve-ready brief</p>
                </button>

                {/* Step 3: Evolve */}
                <button
                  onClick={() => {
                    // TODO: launch /evolve with focus conversation context as brief
                    chatAboutFocus(selected, `/evolve`);
                  }}
                  className="w-full text-left rounded-lg border border-gray-700/40 bg-gray-900/20 p-3 hover:border-indigo-500/40 hover:bg-indigo-950/10 transition-all">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{"\uD83D\uDE80"}</span>
                    <span className="text-xs font-medium text-gray-300">Evolve — Launch AI team sprint</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 ml-6">Full team of AI agents executes on the agreed goals from your discussion</p>
                </button>
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
              <div className="flex items-center gap-3 text-[11px]">
                <span className="px-2 py-1 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">{selected.evidence.length} evidence</span>
                {activity && <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">{activity.total} related</span>}
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{selected.refinements.length} refinements</span>
                <span className="px-2 py-1 rounded bg-gray-500/10 text-gray-400 border border-gray-700/30">{selected.semanticTags.join(", ")}</span>
              </div>

              {/* Preparation Briefing — the centerpiece */}
              {selected.preparedBriefing && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm">{"\uD83D\uDCCB"}</span>
                    <label className="text-[10px] uppercase tracking-wider text-amber-400/70">Preparation Briefing</label>
                    {selected.preparedAt && <span className="text-[10px] text-gray-600 ml-auto">{selected.preparedAt.slice(0, 10)}</span>}
                  </div>
                  <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto pr-2">
                    {selected.preparedBriefing}
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

          {detailTab === "evolve" && (
            <EvolveTab focusArea={selected} onNavigateToChat={() => {
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

function EvolveTab({ focusArea, onNavigateToChat }: { focusArea: FocusArea; onNavigateToChat: () => void }) {
  const [sessions, setSessions] = useState<{ orchestrations: Array<{ orchestrationId: string; goal: string; status: string; taskCount: number; completedCount: number; startedAt: number }>; sessions: Array<{ runId: string; label: string; status: string; startedAt: number }> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const resp = await fetch(`${getBackendBaseUrl()}${API.SESSIONS}`, { headers: authHeaders() });
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          setSessions(data);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) return <p className="text-sm text-gray-500 text-center py-8">Checking for active sessions...</p>;

  const activeOrchs = sessions?.orchestrations?.filter(o => o.status === "running" || o.status === "planning") || [];
  const activeSessions = sessions?.sessions?.filter(s => s.status === "running") || [];

  if (activeOrchs.length === 0 && activeSessions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <span className="text-3xl mb-3 block">{"\uD83D\uDE80"}</span>
          <p className="text-sm text-gray-400 mb-2">No evolution sprint running</p>
          <p className="text-xs text-gray-600 mb-4">Use the <strong>Prepare → Discuss → Evolve</strong> workflow in the Work tab to launch a sprint</p>
          <button onClick={onNavigateToChat}
            className="text-xs px-4 py-2 rounded-lg bg-violet-600/60 text-violet-100 hover:bg-violet-500/60 transition-colors">
            Open focus conversation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active orchestrations */}
      {activeOrchs.map(orch => {
        const progress = orch.taskCount > 0 ? Math.round((orch.completedCount / orch.taskCount) * 100) : 0;
        const elapsed = Math.round((Date.now() - orch.startedAt) / 60000);
        return (
          <div key={orch.orchestrationId} className="rounded-lg border border-indigo-500/30 bg-indigo-950/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm animate-pulse">{"\uD83D\uDE80"}</span>
              <span className="text-xs font-medium text-indigo-200">Evolution Sprint</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 ml-auto">{orch.status}</span>
            </div>
            <p className="text-xs text-gray-300">{orch.goal.slice(0, 200)}</p>
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>{orch.completedCount}/{orch.taskCount} tasks</span>
                <span>{elapsed}m elapsed</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Active Claude Code sessions */}
      {activeSessions.length > 0 && (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">Active Agents ({activeSessions.length})</label>
          <div className="space-y-1.5">
            {activeSessions.map(s => {
              const elapsed = Math.round((Date.now() - s.startedAt) / 1000);
              return (
                <div key={s.runId} className="flex items-center gap-2 text-xs px-3 py-2 rounded bg-gray-800/40 border border-gray-700/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="text-gray-300 truncate flex-1">{s.label || "Claude Code session"}</span>
                  <span className="text-[10px] text-gray-600 shrink-0">{elapsed}s</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigate to conversation */}
      <button onClick={onNavigateToChat}
        className="w-full text-left rounded-lg border border-gray-700/40 bg-gray-900/20 p-3 hover:border-violet-500/40 hover:bg-violet-950/10 transition-all">
        <div className="flex items-center gap-2">
          <span className="text-sm">{"\uD83D\uDCAC"}</span>
          <span className="text-xs font-medium text-gray-300">View in conversation</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1 ml-6">See the full orchestration card with task graph and agent outputs</p>
      </button>
    </div>
  );
}

// ── Helper Components ──

function TrendBadge({ trend }: { trend: string }) {
  const config = {
    growing: { icon: "\u25B2", color: "text-emerald-400", label: "growing" },
    steady: { icon: "\u25CF", color: "text-blue-400", label: "steady" },
    quiet: { icon: "\u25CB", color: "text-gray-500", label: "quiet" },
  }[trend] || { icon: "\u25CF", color: "text-gray-500", label: trend };

  return (
    <span className={`text-[10px] ${config.color}`}>
      {config.icon} {config.label}
    </span>
  );
}

function ClarityBadge({ clarity }: { clarity: string }) {
  const config = {
    clear: { bg: "bg-emerald-900/30 text-emerald-400", label: "clear" },
    developing: { bg: "bg-blue-900/30 text-blue-400", label: "developing" },
    emerging: { bg: "bg-amber-900/30 text-amber-400", label: "emerging" },
  }[clarity] || { bg: "bg-gray-900/30 text-gray-400", label: clarity };

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${config.bg}`}>{config.label}</span>
  );
}
