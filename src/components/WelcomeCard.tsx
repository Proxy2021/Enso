import { useState, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { API, STORAGE_KEYS, TIMINGS } from "../lib/constants";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import type { ProactiveSuggestionAction, DailyDigestDTO, DigestItemDTO, ScheduledTaskDef } from "@shared/types";

// ── Pillar styling (for proactive suggestions) ──

const PILLAR_ICONS: Record<string, string> = {
  project_health: "\uD83D\uDEE1\uFE0F",
  research: "\uD83D\uDD2C",
  communication: "\u2709\uFE0F",
  workflow: "\u26A1",
  learning: "\uD83C\uDF93",
  digest: "\uD83D\uDCCB",
  ambient: "\u2699\uFE0F",
  knowledge: "\uD83E\uDDE0",
};

const PILLAR_COLORS: Record<string, string> = {
  project_health: "border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20",
  research: "border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20",
  communication: "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20",
  workflow: "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20",
  learning: "border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20",
  digest: "border-zinc-500/40 bg-zinc-500/10 hover:bg-zinc-500/20",
  ambient: "border-zinc-500/40 bg-zinc-500/10 hover:bg-zinc-500/20",
  knowledge: "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20",
};

// ── Digest category styling ──

const DIGEST_CATEGORY_ICONS: Record<string, string> = {
  project: "\uD83D\uDEE0\uFE0F",
  research: "\uD83D\uDD2C",
  communication: "\u2709\uFE0F",
  workflow: "\u26A1",
  learning: "\uD83C\uDF93",
  change: "\uD83D\uDD04",
};

const DIGEST_CATEGORY_COLORS: Record<string, string> = {
  project: "text-blue-400",
  research: "text-purple-400",
  communication: "text-amber-400",
  workflow: "text-emerald-400",
  learning: "text-cyan-400",
  change: "text-zinc-400",
};

// ── Quick actions (replaces old 12-tile grid) ──

const QUICK_ACTIONS = [
  { icon: "\uD83D\uDD0D", labelKey: "welcome.tile.researcher", command: "/research " },
  { icon: "\uD83D\uDCBB", labelKey: "welcome.tile.codeAssistant", command: "/code " },
  { icon: "\u26A1", labelKey: "welcome.tile.orchestrate", command: "/orchestrate " },
  { icon: "\uD83D\uDDA5\uFE0F", labelKey: "welcome.tile.terminal", command: "/shell" },
  { icon: "\uD83E\uDDE0", labelKey: "welcome.tile.cortex", family: "cortex" },
];

// ── Cortex stats type ──

interface CortexStats {
  totalPages: number;
  categories: Record<string, number>;
  recentPages: Array<{ path: string; title: string; summary: string; updated: string }>;
}

interface CortexPulse {
  totalEntities: number;
  enriched: { withSemanticTags: number; withCrossRefs: number; withVideos: number };
  topConnection: { from: string; to: string; reason: string } | null;
  recentActivity: string[];
  topSemanticTags: Array<{ tag: string; count: number }>;
}

// ── Main component ──

export default function WelcomeCard() {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const runApp = useChatStore((s) => s.runApp);
  const connectionState = useChatStore((s) => s.connectionState);
  const proactiveSuggestions = useChatStore((s) => s.proactiveSuggestions);
  const disabled = connectionState !== "connected";
  const { t } = useT();

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (localStorage.getItem(STORAGE_KEYS.ONBOARDING_DISMISSED)) return false;
    if (localStorage.getItem("enso_onboarded")) return false;
    return true;
  });

  // Request proactive suggestions + daily digest on mount when connected
  useEffect(() => {
    if (connectionState !== "connected") return;
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.get_suggestions", suggestionCount: 3 } as never);
    ws?.send({ type: "proactive.get_digest" } as never);
  }, [connectionState]);

  useEffect(() => {
    if (showOnboarding) {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_DISMISSED, "1");
      const timer = setTimeout(() => setShowOnboarding(false), TIMINGS.ONBOARDING_HIDE);
      return () => clearTimeout(timer);
    }
  }, [showOnboarding]);

  function handleSuggestionAction(action: ProactiveSuggestionAction, pillar: string) {
    if (disabled) return;
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.accept", suggestionPillar: pillar } as never);
    switch (action.type) {
      case "send_message": sendMessage(action.message); break;
      case "run_app": runApp(action.appId); break;
      case "deep_research": sendMessage(`/research ${action.topic}`); break;
      case "open_project": sendMessage(`Open project at ${action.path}`); break;
    }
  }

  function handleDismissSuggestion(id: string, pillar: string) {
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.dismiss", suggestionId: id, suggestionPillar: pillar } as never);
    useChatStore.setState((s) => ({
      proactiveSuggestions: s.proactiveSuggestions.filter(sg => sg.id !== id),
    }));
  }

  const topSuggestions = proactiveSuggestions.slice(0, 3);

  return (
    <div className="flex flex-col items-center min-h-full px-4 py-4 overflow-y-auto">
      {/* A: Tagline (condensed) */}
      <h2 className="text-lg font-semibold text-gray-200 mb-4">{t("welcome.tagline")}</h2>

      {/* B: Onboarding banner */}
      {showOnboarding && (
        <div className="w-full max-w-lg mb-4 px-3 py-2.5 rounded-lg bg-indigo-900/40 border border-indigo-700/40 text-sm text-indigo-200 animate-in fade-in">
          <div className="flex items-start justify-between gap-2">
            <p>{t("welcome.onboarding")}</p>
            <button onClick={() => setShowOnboarding(false)} className="text-indigo-400 hover:text-indigo-200 text-xs shrink-0 mt-0.5">&#x2715;</button>
          </div>
        </div>
      )}

      {/* B2: Focus Areas */}
      <FocusAreasPanel disabled={disabled} />

      {/* C: Proactive suggestions */}
      {topSuggestions.length > 0 && (
        <div className="w-full max-w-lg mb-5">
          <p className="text-xs text-gray-500 mb-2 px-1">{t("welcome.suggestedForYou")}</p>
          <div className="space-y-1.5">
            {topSuggestions.map((s) => (
              <div
                key={s.id}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all duration-150 group ${PILLAR_COLORS[s.pillar] || PILLAR_COLORS.ambient}`}
              >
                <span className="text-sm shrink-0 mt-0.5">{PILLAR_ICONS[s.pillar] || "\u2022"}</span>
                <button
                  onClick={() => handleSuggestionAction(s.action as ProactiveSuggestionAction, s.pillar)}
                  disabled={disabled}
                  className="flex-1 text-left min-w-0 disabled:opacity-50"
                >
                  <div className="text-xs font-medium text-gray-200">{s.title}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{s.description}</div>
                </button>
                <button
                  onClick={() => handleDismissSuggestion(s.id, s.pillar)}
                  className="shrink-0 text-gray-600 hover:text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                  title={t("common.dismiss")}
                >&#x2715;</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* D: Daily Briefing */}
      <DailyBriefing disabled={disabled} />

      {/* E: Active Work */}
      <ActiveWork disabled={disabled} />

      {/* F: Knowledge Pulse */}
      <KnowledgePulse disabled={disabled} />

      {/* G: Quick Actions */}
      <div className="w-full max-w-lg mt-1">
        <p className="text-xs text-gray-500 mb-2 px-1">{t("welcome.quickActions")}</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.labelKey}
              onClick={() => {
                if (disabled) return;
                if (qa.family) runApp(qa.family);
                else if (qa.command) sendMessage(qa.command);
              }}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/70 hover:border-indigo-500/40 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 text-xs text-gray-300"
            >
              <span>{qa.icon}</span>
              <span>{t(qa.labelKey)}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 text-center mt-2">
          {t("welcome.quickActions.hint")}
        </p>
      </div>
    </div>
  );
}

// ── Daily Briefing ──

function DailyBriefing({ disabled }: { disabled: boolean }) {
  const proactiveUpdate = useChatStore((s) => s._proactiveUpdate);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const runApp = useChatStore((s) => s.runApp);
  const { t } = useT();

  const digest = proactiveUpdate?.digest as DailyDigestDTO | undefined;
  if (!digest || digest.items.length === 0) return null;

  const items = digest.items.slice(0, 3);

  function handleDigestAction(item: DigestItemDTO) {
    if (disabled || !item.action) return;
    switch (item.action.type) {
      case "send_message": sendMessage(item.action.message); break;
      case "run_app": runApp(item.action.appId); break;
      case "deep_research": sendMessage(`/research ${item.action.topic}`); break;
      case "open_project": sendMessage(`Open project at ${item.action.path}`); break;
    }
  }

  return (
    <div className="w-full max-w-lg mb-5">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs">&#x1F4CB;</span>
        <p className="text-xs text-gray-500">{t("welcome.briefing")}</p>
      </div>
      <div className="rounded-lg border border-gray-700/40 bg-gray-900/40 divide-y divide-gray-800/60">
        {digest.greeting && (
          <p className="px-3 py-2 text-xs text-gray-400">{digest.greeting}</p>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 group">
            <span className={`text-sm shrink-0 ${DIGEST_CATEGORY_COLORS[item.category] || "text-gray-400"}`}>
              {item.icon || DIGEST_CATEGORY_ICONS[item.category] || "\u2022"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-200 truncate">{item.title}</div>
              <div className="text-[10px] text-gray-500 truncate">{item.description}</div>
            </div>
            {item.action && (
              <button
                onClick={() => handleDigestAction(item)}
                disabled={disabled}
                className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
              >
                {t("welcome.briefing.go")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Active Work ──

function ActiveWork({ disabled }: { disabled: boolean }) {
  const conversationsList = useChatStore((s) => s.conversationsList);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const scheduledTasks = useChatStore((s) => s.scheduledTasks);
  const triggerScheduledTask = useChatStore((s) => s.triggerScheduledTask);
  const connectionState = useChatStore((s) => s.connectionState);
  const { t } = useT();

  // Fetch scheduled tasks on mount
  useEffect(() => {
    if (connectionState !== "connected") return;
    useChatStore.getState().fetchScheduledTasks();
  }, [connectionState]);

  const recentConvos = [...conversationsList]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  const enabledTasks = scheduledTasks.filter((t) => t.enabled).slice(0, 3);

  if (recentConvos.length === 0 && enabledTasks.length === 0) return null;

  return (
    <div className="w-full max-w-lg mb-5">
      <p className="text-xs text-gray-500 mb-2 px-1">{t("welcome.activeWork")}</p>

      {/* Recent conversations */}
      {recentConvos.length > 0 && (
        <div className="rounded-lg border border-gray-700/40 bg-gray-900/40 divide-y divide-gray-800/60 mb-3">
          {recentConvos.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                if (disabled) return;
                selectConversation(c.id);
                useChatStore.setState({ chatViewOpen: true, activeTab: "chat" });
              }}
              disabled={disabled}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-800/40 transition-colors disabled:opacity-50"
            >
              <span className="text-sm shrink-0 text-gray-600">{"\uD83D\uDCAC"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-200 truncate">{c.title || "New chat"}</div>
                {c.preview && <div className="text-[10px] text-gray-500 truncate">{c.preview}</div>}
              </div>
              <span className="text-[10px] text-gray-600 shrink-0 tabular-nums">
                {formatTimeAgo(c.updatedAt, t)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Scheduled tasks */}
      {enabledTasks.length > 0 && (
        <>
          <p className="text-[10px] text-gray-500 mb-1.5 px-1 uppercase tracking-wider">{t("welcome.activeWork.tasks")}</p>
          <div className="rounded-lg border border-gray-700/40 bg-gray-900/40 divide-y divide-gray-800/60">
            {enabledTasks.map((task) => (
              <ScheduledTaskRow key={task.taskId} task={task} disabled={disabled} onTrigger={triggerScheduledTask} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ScheduledTaskRow({ task, disabled, onTrigger, t }: { task: ScheduledTaskDef; disabled: boolean; onTrigger: (id: string) => void; t: (key: string) => string }) {
  const statusColor = task.lastRunStatus === "success" ? "bg-emerald-500" : task.lastRunStatus === "failed" ? "bg-red-500" : task.lastRunStatus === "running" ? "bg-amber-500 animate-pulse" : "bg-gray-600";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-200 truncate">{task.name || task.taskId}</div>
        <div className="text-[10px] text-gray-500">
          {task.nextFireAt && <span>{t("welcome.activeWork.nextRun")} {formatTimeUntil(task.nextFireAt, t)}</span>}
        </div>
      </div>
      <button
        onClick={() => { if (!disabled) onTrigger(task.taskId); }}
        disabled={disabled}
        className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-gray-700/40 border border-gray-600/40 text-gray-400 hover:text-gray-200 hover:bg-gray-700/60 transition-colors disabled:opacity-50"
        title={t("tasks.runNow")}
      >
        &#x25B6;
      </button>
    </div>
  );
}

// ── Knowledge Pulse ──

function KnowledgePulse({ disabled }: { disabled: boolean }) {
  const [stats, setStats] = useState<CortexStats | null>(null);
  const [pulse, setPulse] = useState<CortexPulse | null>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const { t } = useT();

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${getBackendBaseUrl()}${API.CORTEX_STATS}`, {
      headers: authHeaders(),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => setStats(data as CortexStats))
      .catch(() => {});
    fetch(`${getBackendBaseUrl()}${API.CORTEX_PULSE}`, {
      headers: authHeaders(),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => setPulse(data as CortexPulse))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!stats || stats.totalPages === 0) return null;

  const categories = stats.categories ?? {};
  const entities = categories["entities"] ?? 0;
  const concepts = categories["concepts"] ?? 0;

  return (
    <div className="w-full max-w-lg mb-5">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs">{"\uD83E\uDDE0"}</span>
        <p className="text-xs text-gray-500">{t("welcome.knowledge.title")}</p>
      </div>
      <div className="rounded-lg border border-gray-700/40 bg-gray-900/40 px-3 py-3">
        {/* Stats line */}
        <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-2.5">
          <span>{t("welcome.knowledge.pages").replace("{n}", String(stats.totalPages))}</span>
          {entities > 0 && (
            <>
              <span className="text-gray-700">&middot;</span>
              <span>{t("welcome.knowledge.entities").replace("{n}", String(entities))}</span>
            </>
          )}
          {concepts > 0 && (
            <>
              <span className="text-gray-700">&middot;</span>
              <span>{t("welcome.knowledge.concepts").replace("{n}", String(concepts))}</span>
            </>
          )}
        </div>

        {/* Enrichment progress bars */}
        {pulse && pulse.totalEntities > 0 && (
          <div className="mb-2.5">
            <p className="text-[10px] text-gray-500 mb-1.5">Cortex Intelligence</p>
            <div className="grid grid-cols-3 gap-2">
              <EnrichmentBar label="Tagged" value={pulse.enriched.withSemanticTags} total={pulse.totalEntities} color="violet" />
              <EnrichmentBar label="Linked" value={pulse.enriched.withCrossRefs} total={pulse.totalEntities} color="blue" />
              <EnrichmentBar label="Videos" value={pulse.enriched.withVideos} total={pulse.totalEntities} color="emerald" />
            </div>
          </div>
        )}

        {/* Top connection highlight */}
        {pulse?.topConnection && (
          <div className="mb-2.5 p-2 rounded-md bg-violet-500/5 border border-violet-500/15">
            <p className="text-[10px] text-gray-500 mb-1">Top Connection</p>
            <p className="text-[11px] text-violet-300">
              <span className="font-medium">{pulse.topConnection.from}</span>
              <span className="text-gray-500 mx-1">&harr;</span>
              <span className="font-medium">{pulse.topConnection.to}</span>
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5 italic">{pulse.topConnection.reason}</p>
          </div>
        )}

        {/* Top semantic tags */}
        {pulse?.topSemanticTags && pulse.topSemanticTags.length > 0 && (
          <div className="mb-2.5">
            <p className="text-[10px] text-gray-500 mb-1.5">Top Themes</p>
            <div className="flex flex-wrap gap-1">
              {pulse.topSemanticTags.slice(0, 8).map((t) => (
                <button
                  key={t.tag}
                  onClick={() => { if (!disabled) sendMessage(`Cross-reference "${t.tag}" across all my data sources`); }}
                  disabled={disabled}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:text-violet-300 hover:border-violet-500/30 transition-colors"
                >
                  {t.tag} <span className="text-gray-600">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent updates */}
        {stats.recentPages.length > 0 && (
          <>
            <p className="text-[10px] text-gray-500 mb-1.5">{t("welcome.knowledge.recentUpdates")}</p>
            <div className="flex flex-wrap gap-1.5">
              {stats.recentPages.slice(0, 5).map((page) => (
                <button
                  key={page.path}
                  onClick={() => { if (!disabled) sendMessage(`/wiki read ${page.path}`); }}
                  disabled={disabled}
                  className="text-[11px] px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/30 transition-colors disabled:opacity-50 truncate max-w-[160px]"
                  title={page.summary}
                >
                  {page.title}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Mini progress bar for enrichment stats */
function EnrichmentBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.round((value / total) * 100);
  const colorMap: Record<string, string> = {
    violet: "bg-violet-500",
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
  };
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${colorMap[color] ?? "bg-violet-500"} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Focus Areas Panel ──

interface FocusAreaData {
  id: string;
  title: string;
  description: string;
  status: "active" | "paused" | "completed" | "emerging";
  clarity: "emerging" | "developing" | "clear";
  intent?: string;
  confidence?: number;
  assessment?: { understanding: number; progress: number; assessedAt: string; assessedBy: string; notes: string };
  progress: { trend: "growing" | "steady" | "quiet"; recentActivity: string[] };
  suggestedActions: string[];
}

function FocusAreasPanel({ disabled }: { disabled: boolean }) {
  const [areas, setAreas] = useState<FocusAreaData[]>([]);
  const [loading, setLoading] = useState(false);
  const sendMessage = useChatStore((s) => s.sendMessage);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS}`, {
      headers: authHeaders(),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data: { areas?: FocusAreaData[] }) => {
        if (data?.areas?.length) setAreas(data.areas);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const handleInfer = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${getBackendBaseUrl()}${API.FOCUS_AREAS_INFER}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (data?.areas?.length) setAreas(data.areas);
    } catch { /* ignore */ }
    setLoading(false);
  };

  // Show "Discover" button if no focus areas yet
  if (areas.length === 0) {
    return (
      <div className="w-full max-w-lg mb-5">
        <div className="rounded-lg border border-gray-700/40 bg-gray-900/40 px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Your Focus Areas</p>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Enso can analyze your Cortex to identify what you're actively focused on — projects, skills, hobbies, habits — so every conversation is more relevant.
          </p>
          <button
            onClick={handleInfer}
            disabled={disabled || loading}
            className="text-xs px-3 py-1.5 rounded-md bg-violet-600/80 text-white hover:bg-violet-500/80 transition-colors disabled:opacity-50"
          >
            {loading ? "Analyzing your Cortex..." : "Discover My Focus Areas"}
          </button>
        </div>
      </div>
    );
  }

  const trendIcon = (trend: string) => {
    if (trend === "growing") return "\u25B2";
    if (trend === "steady") return "\u25CF";
    return "\u25CB";
  };

  const trendColor = (trend: string) => {
    if (trend === "growing") return "text-emerald-400";
    if (trend === "steady") return "text-blue-400";
    return "text-gray-500";
  };

  const clarityLabel = (c: string) => {
    if (c === "clear") return "clear";
    if (c === "developing") return "developing";
    return "emerging";
  };

  return (
    <div className="w-full max-w-lg mb-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs text-gray-400">Your Focus Areas</p>
        <button
          onClick={handleInfer}
          disabled={disabled || loading}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Update"}
        </button>
      </div>
      <div className="space-y-1.5">
        {areas.filter(a => a.status !== "completed" && a.status !== "paused").map((area) => (
          <button
            key={area.id}
            onClick={() => { if (!disabled) sendMessage(`Help me make progress on: ${area.title}`); }}
            disabled={disabled}
            className="w-full text-left rounded-lg border border-gray-700/40 bg-gray-900/40 px-3 py-2.5 hover:border-gray-600/60 hover:bg-gray-800/40 transition-all disabled:opacity-50 group"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-gray-200">{area.title}</span>
              <span className={`text-[10px] ${trendColor(area.progress.trend)}`}>
                {trendIcon(area.progress.trend)} {area.progress.trend}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 line-clamp-1">
              {area.intent || area.description}
            </p>
            {area.status === "emerging" && (
              <p className="text-[10px] text-amber-500/70 mt-1 italic">
                {area.suggestedActions[0] || "New interest detected"}
              </p>
            )}
            {area.progress.trend === "quiet" && area.status !== "emerging" && (
              <p className="text-[10px] text-gray-600 mt-1">
                Haven't seen activity recently
              </p>
            )}
            {area.progress.recentActivity.length > 0 && area.progress.trend !== "quiet" && (
              <p className="text-[10px] text-gray-600 mt-1 truncate">
                Recent: {area.progress.recentActivity[0]}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                area.clarity === "clear" ? "bg-emerald-900/30 text-emerald-400" :
                area.clarity === "developing" ? "bg-blue-900/30 text-blue-400" :
                "bg-amber-900/30 text-amber-400"
              }`}>{clarityLabel(area.clarity)}</span>
              {area.assessment ? (
                <span className="flex items-center gap-1.5 text-[9px]">
                  <span className="text-blue-400/60">🧠{area.assessment.understanding}%</span>
                  <span className="text-emerald-400/60">📈{area.assessment.progress}%</span>
                </span>
              ) : area.confidence !== undefined && area.confidence < 0.6 ? (
                <span className="text-[9px] text-gray-600">low confidence</span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Time formatting helpers ──

function formatTimeAgo(ts: number, t: (key: string) => string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("recent.justNow");
  if (mins < 60) return t("recent.minsAgo").replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("recent.hoursAgo").replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  if (days === 1) return t("recent.yesterday");
  return t("recent.daysAgo").replace("{n}", String(days));
}

function formatTimeUntil(ts: number, _t: (key: string) => string): string {
  const diff = ts - Date.now();
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
