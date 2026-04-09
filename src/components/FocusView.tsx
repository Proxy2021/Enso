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
}

interface FocusState {
  areas: FocusArea[];
  lastInferredAt: string;
  version: number;
}

interface ActivityData {
  entities: Array<{ title: string; source: string; type: string; updatedAt: string }>;
  total: number;
}

type View = "list" | "detail";
type DetailTab = "overview" | "activity" | "plan";

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
        body: JSON.stringify({ clientId, title: area.title }),
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
          {/* Status controls */}
          <div className="flex items-center gap-2 mt-3">
            {(["active", "paused", "completed"] as const).map(s => (
              <button key={s} onClick={() => handleUpdate(selected.id, { status: s })}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  selected.status === s
                    ? s === "active" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : s === "paused" ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300"
                    : "bg-gray-500/20 border-gray-500/40 text-gray-300"
                    : "border-gray-700/40 text-gray-500 hover:text-gray-300"
                }`}>
                {s}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={() => chatAboutFocus(selected, `Help me make progress on: ${selected.title}`)}
              className="text-[11px] px-3 py-1 rounded bg-violet-600/60 text-violet-100 hover:bg-violet-500/60">
              Chat about this
            </button>
          </div>
        </div>

        {/* Detail tabs */}
        <div className="flex border-b border-gray-800/60 px-5">
          {(["overview", "activity", "plan"] as const).map(tab => (
            <button key={tab} onClick={() => { setDetailTab(tab); if (tab === "activity" && !activity) openDetail(selected.id); }}
              className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                detailTab === tab ? "border-violet-500 text-violet-300" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-5 py-4">
          {detailTab === "overview" && (
            <div className="space-y-5">
              {/* Intent */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1 block">Intent</label>
                {editingField === "intent" ? (
                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={() => saveEdit("intent")} onKeyDown={e => e.key === "Enter" && saveEdit("intent")}
                    className="text-sm text-gray-200 bg-transparent border-b border-violet-500 focus:outline-none w-full" />
                ) : (
                  <p className="text-sm text-gray-300 cursor-pointer hover:text-violet-300"
                    onClick={() => { setEditingField("intent"); setEditValue(selected.intent || ""); }}>
                    {selected.intent || <span className="text-gray-600 italic">Click to define your intent...</span>}
                  </p>
                )}
              </div>

              {/* Deeper Motivation */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1 block">Deeper Motivation — WHY</label>
                {editingField === "deeperIntent" ? (
                  <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={() => saveEdit("deeperIntent")}
                    className="text-sm text-gray-200 bg-gray-900/60 border border-violet-500/50 rounded px-3 py-2 focus:outline-none w-full min-h-[60px]"
                    placeholder="What deeper need drives this focus? (e.g., financial independence, creative expression, intellectual mastery...)" />
                ) : (
                  <p className="text-sm text-gray-300 cursor-pointer hover:text-violet-300 px-3 py-2 rounded bg-gray-800/20 border border-gray-800/40 hover:border-violet-500/20 transition-colors"
                    onClick={() => { setEditingField("deeperIntent"); setEditValue(selected.deeperIntent || ""); }}>
                    {selected.deeperIntent || <span className="text-gray-600 italic">Click to explore your deeper motivation...</span>}
                  </p>
                )}
              </div>

              {/* Adjacent Pursuits */}
              {selected.adjacentPursuits && selected.adjacentPursuits.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">Adjacent Pursuits — expand your horizon</label>
                  <div className="space-y-1.5">
                    {selected.adjacentPursuits.map((pursuit, i) => (
                      <button key={i} onClick={() => chatAboutFocus(selected, `Research: ${pursuit}`)}
                        className="w-full text-left text-xs text-amber-300/80 px-3 py-2 rounded bg-amber-900/10 border border-amber-500/15 hover:border-amber-500/30 hover:bg-amber-900/20 transition-colors">
                        {"\u2728"} {pursuit}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">Evidence</label>
                <div className="space-y-1">
                  {selected.evidence.map((ev, i) => (
                    <div key={i} className="text-xs text-gray-400 flex items-start gap-2">
                      <span className="text-gray-600 shrink-0">{"\u2022"}</span>
                      <span>{ev}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Semantic tags */}
              {selected.semanticTags.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">Related Themes</label>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.semanticTags.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-gray-800/60 border border-gray-700/40 text-gray-400">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested actions */}
              {selected.suggestedActions.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">Suggested Actions</label>
                  <div className="space-y-1.5">
                    {selected.suggestedActions.map((action, i) => (
                      <button key={i} onClick={() => chatAboutFocus(selected, action)}
                        className="w-full text-left text-xs text-gray-300 px-3 py-2 rounded bg-gray-800/40 border border-gray-700/30 hover:border-violet-500/30 hover:text-violet-300 transition-colors">
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Refinement history */}
              {selected.refinements.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 block">History</label>
                  <div className="space-y-1">
                    {selected.refinements.slice(-5).reverse().map((r, i) => (
                      <div key={i} className="text-[11px] text-gray-500">
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

              {/* Confidence + meta */}
              <div className="flex items-center gap-4 text-[11px] text-gray-600 pt-2 border-t border-gray-800/40">
                <span>Confidence: {Math.round(selected.confidence * 100)}%</span>
                <span>Created: {selected.createdAt.slice(0, 10)}</span>
                <span>Updated: {selected.updatedAt.slice(0, 10)}</span>
              </div>
            </div>
          )}

          {detailTab === "activity" && (
            <div>
              {!activity || activity.entities.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No matching entities found in Cortex</p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">{activity.total} entities match this focus area's themes</p>
                  <div className="space-y-1.5">
                    {activity.entities.map((ent, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded hover:bg-gray-800/30">
                        <span className="shrink-0">{SOURCE_ICONS[ent.source] || "\uD83D\uDCC4"}</span>
                        <span className="text-gray-300 flex-1 truncate">{ent.title}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">{ent.source}</span>
                        {ent.updatedAt && <span className="text-[10px] text-gray-700 shrink-0">{ent.updatedAt.slice(0, 10)}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {detailTab === "plan" && (
            <div>
              {planGoal ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-4">
                    <p className="text-xs text-gray-400 mb-2">Orchestration goal prepared:</p>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap max-h-60 overflow-y-auto">{planGoal.slice(0, 500)}...</p>
                  </div>
                  <button onClick={launchPlanOrchestration}
                    className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500">
                    Launch Plan Orchestration
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-3xl mb-3">{"\uD83D\uDCCB"}</div>
                  <h3 className="text-sm font-medium text-gray-200 mb-2">Create an Action Plan</h3>
                  <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
                    Enso will analyze this focus area and create a practical plan — identifying knowledge gaps,
                    concrete next steps, and which Enso capabilities can help you make progress.
                  </p>
                  <button onClick={() => handlePlan(selected.id)}
                    className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500">
                    Create a Plan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
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
