import { useState, useEffect, useMemo, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { compileComponent } from "../lib/sandbox";
import { MobileViewHeader } from "./TabNavigation";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";

interface CortexApp {
  family: string;
  label: string;
  icon: string;
  order: number;
  templateJSX: string;
  primaryTool: string;
  primaryParams: Record<string, unknown>;
}

interface NavEntry {
  data: unknown;
  title: string;
}

interface AppState {
  data: unknown;
  loading: boolean;
  error?: string;
  navStack?: NavEntry[];
}

const STORAGE_KEY = "enso_cortex_subtab";

export default function CortexView() {
  const { t } = useT();
  const [apps, setApps] = useState<CortexApp[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<string>(
    localStorage.getItem(STORAGE_KEY) || "overview"
  );
  const [appStates, setAppStates] = useState<Record<string, AppState>>({});
  const [cortexStats, setCortexStats] = useState<Record<string, unknown> | null>(null);

  // Load app templates from backend
  useEffect(() => {
    const url = `${getBackendBaseUrl()}/api/apps/templates`;
    fetch(url, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.apps) setApps(data.apps);
      })
      .catch(() => {});
  }, []);

  // Load cortex stats for overview
  useEffect(() => {
    const url = `${getBackendBaseUrl()}/api/cortex-stats`;
    fetch(url, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCortexStats(data))
      .catch(() => {});
  }, []);

  // Load entity index stats
  const [entityStats, setEntityStats] = useState<Record<string, number>>({});
  const [totalEntities, setTotalEntities] = useState(0);
  useEffect(() => {
    const url = `${getBackendBaseUrl()}/api/entities`;
    fetch(url, { headers: authHeaders() })
      .then(r => r.json())
      .then((data: { totalEntities?: number; bySource?: Record<string, number>; byType?: Record<string, number> } | Array<{ type: string }>) => {
        if (Array.isArray(data)) {
          // Array format — count by type
          const counts: Record<string, number> = {};
          for (const e of data) counts[e.type] = (counts[e.type] || 0) + 1;
          setEntityStats(counts);
          setTotalEntities(data.length);
        } else if (data.bySource) {
          // Dict format with bySource — map source names to entity types
          const sourceToType: Record<string, string> = {
            kindle: "book", weread: "book", steam: "game", movies_tv: "movie",
            youtube: "channel", photos: "photo", qq_music: "song", files: "project",
            research: "research", twitter: "twitter-account",
          };
          const counts: Record<string, number> = {};
          for (const [src, count] of Object.entries(data.bySource)) {
            const type = sourceToType[src] || src;
            counts[type] = (counts[type] || 0) + count;
          }
          setEntityStats(counts);
          setTotalEntities(data.totalEntities || Object.values(data.bySource).reduce((a, b) => a + b, 0));
        }
      })
      .catch(() => {});
  }, []);

  // Persist active sub-tab
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, activeSubTab);
  }, [activeSubTab]);

  // Run app's primary tool via REST API to get initial data
  const loadAppData = useCallback((app: CortexApp) => {
    setAppStates(prev => ({ ...prev, [app.family]: { data: prev[app.family]?.data || null, loading: true } }));

    const baseUrl = getBackendBaseUrl();
    fetch(`${baseUrl}/api/apps/run?tool=${encodeURIComponent(app.primaryTool)}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(app.primaryParams),
    })
      .then(r => r.json())
      .then(data => {
        setAppStates(prev => ({ ...prev, [app.family]: { data, loading: false } }));
      })
      .catch(err => {
        setAppStates(prev => ({ ...prev, [app.family]: { data: null, loading: false, error: String(err) } }));
      });
  }, []);

  // No virtual cards needed — actions go through REST /api/cortex/action

  // Load data when switching to an app sub-tab (via REST for initial load)
  useEffect(() => {
    if (activeSubTab === "overview") return;
    const app = apps.find(a => a.family === activeSubTab);
    if (app && !appStates[app.family]?.data && !appStates[app.family]?.loading) {
      loadAppData(app);
    }
  }, [activeSubTab, apps, appStates, loadAppData]);

  // No virtual card registration needed — REST-based action handling

  // Compile templates
  const compiledTemplates = useMemo(() => {
    const result: Record<string, ReturnType<typeof compileComponent>> = {};
    for (const app of apps) {
      if (app.templateJSX) {
        result[app.family] = compileComponent(app.templateJSX);
      }
    }
    return result;
  }, [apps]);

  // Action handler — routes through /api/cortex/action REST endpoint
  const handleAction = useCallback((action: string, payload?: unknown) => {
    const activeApp = apps.find(a => a.family === activeSubTab);
    if (!activeApp) return;

    // Client-side only actions
    if (action === "open_url" && payload && typeof payload === "object" && "url" in payload) {
      window.open((payload as { url: string }).url, "_blank");
      return;
    }
    if (action === "__copy_text" && payload && typeof payload === "object" && "text" in payload) {
      navigator.clipboard.writeText((payload as { text: string }).text).catch(() => {});
      return;
    }

    // Nav back — pop from local nav stack
    if (action === "nav_back") {
      setAppStates(prev => {
        const state = prev[activeApp.family];
        if (!state?.navStack?.length) return prev;
        const stack = [...state.navStack];
        const prevEntry = stack.pop()!;
        return { ...prev, [activeApp.family]: { data: prevEntry.data, loading: false, navStack: stack } };
      });
      return;
    }

    setAppStates(prev => ({ ...prev, [activeApp.family]: { ...prev[activeApp.family], loading: true } }));

    const baseUrl = getBackendBaseUrl();
    fetch(`${baseUrl}/api/cortex/action`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload: payload || {},
        appFamily: activeApp.family,
        // Only send currentData for tool actions (browse, search, etc.)
        // Skip for entity actions to avoid 413 payload-too-large with large browse data
        ...(!["view_entity", "deep_content", "book_podcast", "regenerate_podcast", "add_to_cortex", "entity_share_email", "book_share_email", "share_wechat"].includes(action)
          ? { currentData: appStates[activeApp.family]?.data }
          : {}),
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setAppStates(prev => ({ ...prev, [activeApp.family]: { ...prev[activeApp.family], loading: false } }));
          alert(data.error);
          return;
        }

        // For email/wechat share: just show feedback, no state change needed
        if (action === "entity_share_email" || action === "book_share_email" || action === "share_wechat") {
          setAppStates(prev => ({ ...prev, [activeApp.family]: { ...prev[activeApp.family], loading: false } }));
          if (data.success) alert(data.message || "Sent!");
          else alert(data.message || data.error || "Send failed");
          return;
        }

        // For view_entity: push current state onto nav stack
        if (action === "view_entity") {
          setAppStates(prev => {
            const current = prev[activeApp.family];
            const navStack = [...(current?.navStack || [])];
            if (current?.data) {
              navStack.push({ data: current.data, title: (current.data as Record<string, unknown>)?.tool as string || "Back" });
            }
            // Merge nav stack info into the detail data
            const detailData = { ...data, navStack: navStack.map((e: { title: string }) => ({ title: e.title })), focusEntity: true, tool: "entity_detail" };
            return { ...prev, [activeApp.family]: { data: detailData, loading: false, navStack } };
          });
          return;
        }

        // For add_to_cortex: merge _addedToCortex into current data
        if (action === "add_to_cortex" && data._addedToCortex) {
          setAppStates(prev => {
            const current = prev[activeApp.family];
            const merged = { ...(current?.data as Record<string, unknown> || {}), _addedToCortex: data._addedToCortex };
            return { ...prev, [activeApp.family]: { data: merged, loading: false, navStack: current?.navStack } };
          });
          return;
        }

        // For deep_content / regenerate: merge podcast status into existing entity data and start polling
        if ((action === "deep_content" || action === "book_podcast" || action === "regenerate_podcast") && data.podcastStatus) {
          const entityId = (payload as Record<string, unknown>)?.entityId as string;

          setAppStates(prev => {
            const current = prev[activeApp.family];
            const currentData = current?.data as Record<string, unknown> || {};
            // If server returned full entity detail (cached podcast), use it
            if (data.entity) {
              const merged = { ...data, navStack: currentData.navStack, focusEntity: true, tool: "entity_detail" };
              return { ...prev, [activeApp.family]: { data: merged, loading: false, navStack: current?.navStack } };
            }
            // Otherwise merge processing status into current view
            // For regenerate: clear old podcast data so UI shows progress spinner
            const cleared = action === "regenerate_podcast"
              ? { ...currentData, processedBook: undefined, podcastAudioUrl: undefined, podcastScript: undefined, podcastDuration: undefined, podcastPercent: 0 }
              : currentData;
            const merged = { ...cleared, podcastStatus: data.podcastStatus, podcastStatusDetail: data.message };
            return { ...prev, [activeApp.family]: { data: merged, loading: false, navStack: current?.navStack } };
          });

          // Poll for progress every 15 seconds until complete
          if (data.podcastStatus === "processing" && entityId) {
            const pollInterval = setInterval(() => {
              const baseUrl2 = getBackendBaseUrl();
              fetch(`${baseUrl2}/api/cortex/action`, {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ action: "deep_content", payload: { entityId }, appFamily: activeApp.family }),
              })
                .then(r => r.json())
                .then(pollData => {
                  if (pollData.podcastStatus === "ready" || pollData.entity) {
                    // Podcast complete — update with full data
                    clearInterval(pollInterval);
                    setAppStates(prev => {
                      const current = prev[activeApp.family];
                      const currentData = current?.data as Record<string, unknown> || {};
                      if (pollData.entity) {
                        const merged = { ...pollData, navStack: currentData.navStack, focusEntity: true, tool: "entity_detail" };
                        return { ...prev, [activeApp.family]: { data: merged, loading: false, navStack: current?.navStack } };
                      }
                      const merged = { ...currentData, ...pollData };
                      return { ...prev, [activeApp.family]: { data: merged, loading: false, navStack: current?.navStack } };
                    });
                  } else {
                    // Still processing — update status message
                    setAppStates(prev => {
                      const current = prev[activeApp.family];
                      const currentData = current?.data as Record<string, unknown> || {};
                      const merged = { ...currentData, podcastStatus: pollData.podcastStatus || "processing", podcastStatusDetail: pollData.message || currentData.podcastStatusDetail };
                      return { ...prev, [activeApp.family]: { data: merged, loading: false, navStack: current?.navStack } };
                    });
                  }
                })
                .catch(() => {});
            }, 15000);
            // Auto-stop polling after 45 minutes
            setTimeout(() => clearInterval(pollInterval), 45 * 60 * 1000);
          }
          return;
        }

        setAppStates(prev => ({ ...prev, [activeApp.family]: { data, loading: false, navStack: prev[activeApp.family]?.navStack } }));
      })
      .catch(() => {
        setAppStates(prev => ({ ...prev, [activeApp.family]: { ...prev[activeApp.family], loading: false } }));
      });
  }, [apps, activeSubTab, appStates]);

  const handleSendMessage = useCallback((_text: string) => {
    // Messages from Cortex view go through action system
  }, []);

  // Sub-tabs: Overview + apps
  const subTabs = [
    { id: "overview", label: t("tab.cortex") || "Overview", icon: "📊" },
    ...apps.map(a => ({ id: a.family, label: a.label, icon: a.icon })),
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <MobileViewHeader title={t("tab.cortex") || "Cortex"} />

      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800/60 bg-gray-950/50 overflow-x-auto shrink-0 scrollbar-none">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeSubTab === tab.id
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id !== "overview" && entityStats[
              tab.id === "books" ? "book" :
              tab.id === "movies_tv" ? "movie" :
              tab.id === "steam" ? "game" :
              tab.id === "youtube_manager" ? "channel" :
              tab.id === "articles" ? "article" :
              tab.id === "travel" ? "place" : ""
            ] ? (
              <span className="text-[10px] text-gray-500 ml-0.5">
                {entityStats[
                  tab.id === "books" ? "book" :
                  tab.id === "movies_tv" ? "movie" :
                  tab.id === "steam" ? "game" :
                  tab.id === "youtube_manager" ? "channel" :
                  tab.id === "articles" ? "article" :
                  tab.id === "travel" ? "place" : ""
                ]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeSubTab === "overview" ? (
          <OverviewDashboard cortexStats={cortexStats} entityStats={entityStats} totalEntities={totalEntities} onNavigate={setActiveSubTab} />
        ) : (
          <AppRenderer
            app={apps.find(a => a.family === activeSubTab)}
            compiled={compiledTemplates[activeSubTab]}
            state={appStates[activeSubTab]}
            onAction={handleAction}
            onSendMessage={handleSendMessage}
          />
        )}
      </div>
    </div>
  );
}

// ── Overview Dashboard ──

function OverviewDashboard({
  cortexStats,
  entityStats,
  totalEntities: totalEntitiesProp,
  onNavigate,
}: {
  cortexStats: Record<string, unknown> | null;
  entityStats: Record<string, number>;
  totalEntities: number;
  onNavigate: (tab: string) => void;
}) {
  const stats = cortexStats as Record<string, unknown> | null;
  const totalEntities = totalEntitiesProp || Object.values(entityStats).reduce((a, b) => a + b, 0);

  const contentTypes = [
    { key: "book", label: "Books", icon: "📚", tab: "books", color: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/20" },
    { key: "movie", label: "Movies & TV", icon: "🎬", tab: "movies_tv", color: "from-rose-500/20 to-rose-600/10 border-rose-500/20" },
    { key: "game", label: "Games", icon: "🎮", tab: "steam", color: "from-blue-500/20 to-blue-600/10 border-blue-500/20" },
    { key: "channel", label: "YouTube", icon: "📺", tab: "youtube_manager", color: "from-red-500/20 to-red-600/10 border-red-500/20" },
    { key: "article", label: "Articles", icon: "📰", tab: "articles", color: "from-amber-500/20 to-amber-600/10 border-amber-500/20" },
    { key: "place", label: "Places", icon: "🌍", tab: "travel", color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20" },
  ];

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center py-4">
        <h1 className="text-2xl font-bold text-gray-100">🧠 Knowledge Cortex</h1>
        <p className="text-sm text-gray-400 mt-1">{totalEntities.toLocaleString()} entities across {Object.keys(entityStats).length} types</p>
      </div>

      {/* Entity counts grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {contentTypes.map(ct => (
          <button
            key={ct.key}
            onClick={() => onNavigate(ct.tab)}
            className={`bg-gradient-to-br ${ct.color} border rounded-xl p-4 text-left hover:scale-[1.02] transition-transform`}
          >
            <div className="text-2xl mb-1">{ct.icon}</div>
            <div className="text-2xl font-bold text-gray-100">{(entityStats[ct.key] || 0).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{ct.label}</div>
          </button>
        ))}
      </div>

      {/* Cortex stats */}
      {stats && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">📊 Cortex Statistics</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Wiki Pages", value: stats.totalPages || stats.total || 0, icon: "📄" },
              { label: "Entities", value: stats.entities || totalEntities, icon: "🌍" },
              { label: "Synthesis", value: stats.synthesis || 0, icon: "✨" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-lg">{s.icon}</div>
                <div className="text-lg font-bold text-gray-200">{Number(s.value).toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">⚡ Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Add Book", icon: "📚", tab: "books" },
            { label: "Add Movie", icon: "🎬", tab: "movies_tv" },
            { label: "Trending News", icon: "📰", tab: "articles" },
            { label: "Discover Places", icon: "🌍", tab: "travel" },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.tab)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-xs text-gray-300 transition-colors"
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── App Template Renderer ──

function AppRenderer({
  app,
  compiled,
  state,
  onAction,
  onSendMessage,
}: {
  app?: CortexApp;
  compiled?: ReturnType<typeof compileComponent>;
  state?: AppState;
  onAction: (action: string, payload?: unknown) => void;
  onSendMessage: (text: string) => void;
}) {
  if (!app) return <div className="p-8 text-center text-gray-500">Select a content type</div>;

  if (!compiled || "error" in compiled) {
    return (
      <div className="p-8 text-center text-red-400">
        <p className="font-medium">Failed to load {app.label}</p>
        <p className="text-xs text-gray-500 mt-2">{("error" in (compiled || {})) ? String((compiled as { error: string }).error) : "Template compilation error"}</p>
      </div>
    );
  }

  if (state?.loading && !state.data) {
    return (
      <div className="p-8 text-center">
        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Loading {app.label}...</p>
      </div>
    );
  }

  const Component = compiled.Component;
  if (!Component) return null;

  return (
    <div className="p-3">
      <Component
        data={state?.data || {}}
        sendMessage={onSendMessage}
        onAction={onAction}
        theme="dark"
      />
    </div>
  );
}
