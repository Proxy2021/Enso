import { useState, useEffect, useMemo, Component, type ErrorInfo, type ReactNode } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { API } from "../lib/constants";
import { useFetchFile } from "../hooks/useFetchFile";
import { compileComponent } from "../lib/sandbox";
import MarkdownText from "../components/MarkdownText";
import { useT } from "../lib/i18n";
import type { CardRendererProps } from "./types";

// ── Error Boundary for dynamic dashboard rendering ──

class DashboardErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean; error: string | null }
> {
  state = { hasError: false, error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dashboard render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300">
          Dashboard render error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Scoring data parser for committee output ──

interface DiscoveryScoring {
  projects: Array<{
    name: string;
    verdict: string;
    scores: Record<string, number>;
    investmentRange?: string;
    rank?: number;
  }>;
}

function parseScoring(content: string): DiscoveryScoring | null {
  const match = content.match(/<!--\s*SCORING\s+(\{[\s\S]*?\})\s*-->/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

interface DiscoveryMeta {
  discoveryId: string;
  focus: string;
  createdAt: number;
  completedAt: number;
  status: "completed" | "failed" | "partial";
  phases: {
    sourcing: { count: number; files: string[] };
    pitches: { count: number; files: string[] };
    committee: { count: number; files: string[] };
    deliverables: { dashboard: boolean; memo: boolean };
  };
  files: string[];
}

type ViewTab = "overview" | "sourcing" | "pitches" | "committee" | "deliverables" | "dashboard";

export default function DiscoveryHistoryCard({ card }: CardRendererProps) {
  const { t } = useT();
  const [discoveries, setDiscoveries] = useState<DiscoveryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DiscoveryMeta | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [DashboardComp, setDashboardComp] = useState<any>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [scoringData, setScoringData] = useState<DiscoveryScoring | null>(null);

  const baseUrl = getBackendBaseUrl();
  const headers = useMemo(() => authHeaders(), []);
  const { fetchFile, fileCache } = useFetchFile(API.DISCOVERY_RESULTS);

  // Fetch discovery list
  useEffect(() => {
    setLoading(true);
    fetch(`${baseUrl}${API.DISCOVERY_RESULTS}`, { headers })
      .then(r => r.json())
      .then(data => {
        setDiscoveries(data.results || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [baseUrl]);

  // Load dashboard JSX when tab selected
  useEffect(() => {
    if (activeTab === "dashboard" && selected?.phases.deliverables.dashboard) {
      fetchFile(selected.discoveryId, "dashboard-ui.jsx").then(jsx => {
        if (jsx) {
          try {
            const result = compileComponent(jsx);
            if ("Component" in result) {
              setDashboardComp(() => result.Component);
              setDashError(null);
            } else {
              setDashError(result.error);
              setDashboardComp(null);
            }
          } catch (err: unknown) {
            setDashError(err instanceof Error ? err.message : "Failed to compile dashboard");
            setDashboardComp(null);
          }
        }
      });
    }
  }, [activeTab, selected]);

  // Load scoring data when a discovery is selected
  useEffect(() => {
    if (!selected) { setScoringData(null); return; }
    const committeeFiles = selected.phases.committee.files;
    if (committeeFiles.length > 0) {
      fetchFile(selected.discoveryId, committeeFiles[0]).then(content => {
        if (content) setScoringData(parseScoring(content));
        else setScoringData(null);
      });
    } else {
      setScoringData(null);
    }
  }, [selected]);

  // Load file content when tabs are selected
  useEffect(() => {
    if (!selected) return;
    const sid = selected.discoveryId;

    if (activeTab === "sourcing") {
      for (const f of selected.phases.sourcing.files) fetchFile(sid, f);
    } else if (activeTab === "pitches") {
      for (const f of selected.phases.pitches.files) fetchFile(sid, f);
    } else if (activeTab === "committee") {
      for (const f of selected.phases.committee.files) fetchFile(sid, f);
    } else if (activeTab === "deliverables") {
      if (selected.phases.deliverables.memo) fetchFile(sid, "investment-memo.md");
    }
  }, [activeTab, selected]);

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const fmtDuration = (start: number, end: number) => {
    const mins = Math.round((end - start) / 60000);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const prettyFilename = (f: string) =>
    f.replace(/^(sourcing|pitches|committee|outputs)\//, "")
      .replace(/\.md$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

  // ── List View ──
  if (!selected) {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{"\uD83D\uDD0D"}</span>
          <h3 className="text-sm font-semibold text-gray-200">{t("discovery.title")}</h3>
          <span className="text-xs text-gray-500">{discoveries.length} discovery{discoveries.length !== 1 ? " sprints" : " sprint"}</span>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-500 text-xs">{t("discovery.loadingDiscoveries")}</div>
        )}

        {!loading && discoveries.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-2xl">{"\uD83D\uDD0D"}</div>
            <div className="text-gray-400 text-sm">{t("discovery.noDiscoveries")}</div>
            <div className="text-gray-500 text-xs">{t("discovery.noDiscoveriesHint")}</div>
          </div>
        )}

        {discoveries.map(disc => (
          <button
            key={disc.discoveryId}
            onClick={() => { setSelected(disc); setActiveTab("overview"); setDashboardComp(null); setDashError(null); }}
            className="w-full text-left bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 rounded-lg p-3 transition-all duration-150 active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-300 group-hover:text-gray-100 truncate flex-1">
                {disc.focus}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-2 ${
                disc.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                disc.status === "failed" ? "bg-red-500/20 text-red-400" :
                "bg-amber-500/20 text-amber-400"
              }`}>
                {disc.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span>{fmtDate(disc.completedAt)}</span>
              <span>{"\u00B7"}</span>
              <span>{disc.phases.sourcing.count} sourcing</span>
              <span>{"\u00B7"}</span>
              <span>{disc.phases.pitches.count} pitches</span>
              <span>{"\u00B7"}</span>
              <span>{disc.files.length} files</span>
              {disc.phases.deliverables.dashboard && (
                <>
                  <span>{"\u00B7"}</span>
                  <span className="text-blue-400">{"\uD83D\uDCCA"} dashboard</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ── Detail View ──
  const d = selected;
  const did = d.discoveryId;

  const tabs = ([
    { value: "overview" as ViewTab, label: t("discovery.overview"), enabled: true },
    { value: "sourcing" as ViewTab, label: `${t("discovery.sourcing")} (${d.phases.sourcing.count})`, enabled: d.phases.sourcing.count > 0 },
    { value: "pitches" as ViewTab, label: `${t("discovery.pitches")} (${d.phases.pitches.count})`, enabled: d.phases.pitches.count > 0 },
    { value: "committee" as ViewTab, label: t("discovery.committee"), enabled: d.phases.committee.count > 0 },
    { value: "deliverables" as ViewTab, label: t("discovery.deliverables"), enabled: d.phases.deliverables.memo },
    { value: "dashboard" as ViewTab, label: t("discovery.dashboard"), enabled: d.phases.deliverables.dashboard },
  ]).filter(t => t.enabled);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelected(null)}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          {"\u2190"} Back
        </button>
        <span className="text-gray-600">|</span>
        <span className="text-xs text-gray-400">{fmtDate(d.completedAt)}</span>
        <span className="text-xs text-gray-500">{"\u00B7"}</span>
        <span className="text-xs text-gray-500">{fmtDuration(d.createdAt, d.completedAt)}</span>
      </div>

      <h3 className="text-sm font-semibold text-gray-200">{d.focus}</h3>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700 pb-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-2.5 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
              activeTab === tab.value
                ? "bg-gray-700 text-white border-b-2 border-indigo-400"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {activeTab === "overview" && (
          <div className="space-y-3">
            {/* Verdict Banner — if scoring data available */}
            {scoringData && scoringData.projects.length > 0 && (
              <div className="bg-gray-800/80 rounded-lg border border-gray-700 p-3">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {scoringData.projects
                    .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                    .map(p => (
                      <span key={p.name} className={`text-xs px-2 py-1 rounded-full font-medium ${
                        p.verdict.includes("BUY") ? "bg-emerald-500/20 text-emerald-400" :
                        p.verdict === "HOLD" ? "bg-amber-500/20 text-amber-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {p.verdict}: {p.name}
                      </span>
                    ))}
                </div>
                {scoringData.projects[0] && (
                  <div className="text-xs text-gray-400">
                    {t("discovery.topRecommendation")} <span className="text-white font-medium">{scoringData.projects[0].name}</span>
                    {scoringData.projects[0].investmentRange && (
                      <span className="ml-2 text-indigo-400">{scoringData.projects[0].investmentRange}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Phase timeline */}
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { label: t("discovery.sourcing"), done: d.phases.sourcing.count > 0, detail: `${d.phases.sourcing.count}` },
                { label: t("discovery.pitches"), done: d.phases.pitches.count > 0, detail: `${d.phases.pitches.count}` },
                { label: t("discovery.committee"), done: d.phases.committee.count > 0, detail: d.phases.committee.count > 0 ? "\u2713" : "\u2014" },
                { label: t("discovery.dashboard"), done: d.phases.deliverables.dashboard, detail: d.phases.deliverables.dashboard ? "\u2713" : "\u2014" },
                { label: t("discovery.deliverables"), done: d.phases.deliverables.memo, detail: d.phases.deliverables.memo ? "\u2713" : "\u2014" },
              ].map(phase => (
                <div key={phase.label} className={`p-1.5 rounded border text-center text-[10px] ${
                  phase.done ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" : "bg-gray-800/50 border-gray-700 text-gray-500"
                }`}>
                  <div>{phase.label}</div>
                  <div className="font-medium">{phase.detail}</div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-400"><span className="text-gray-200 font-medium">{d.files.length}</span> {t("discovery.artifacts")}</span>
              {d.phases.deliverables.dashboard && (
                <button onClick={() => setActiveTab("dashboard")} className="text-indigo-400 hover:text-indigo-300">
                  {t("discovery.viewDashboard")}
                </button>
              )}
              {d.phases.deliverables.memo && (
                <button onClick={() => setActiveTab("deliverables")} className="text-indigo-400 hover:text-indigo-300">
                  {t("discovery.readMemo")}
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "sourcing" && (
          <div className="space-y-3">
            {d.phases.sourcing.files.map(file => {
              const key = `${did}/${file}`;
              const content = fileCache[key];
              return (
                <details key={file} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    {prettyFilename(file)}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[500px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">{t("discovery.loading")}</span>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {activeTab === "pitches" && (
          <div className="space-y-3">
            {d.phases.pitches.files.map(file => {
              const key = `${did}/${file}`;
              const content = fileCache[key];
              return (
                <details key={file} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    {prettyFilename(file)}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[500px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">{t("discovery.loading")}</span>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {activeTab === "committee" && (
          <div className="space-y-3">
            {d.phases.committee.files.map(file => {
              const key = `${did}/${file}`;
              const content = fileCache[key];
              return (
                <details key={file} open className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    {prettyFilename(file)}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[500px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">{t("discovery.loading")}</span>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {activeTab === "deliverables" && (
          <div className="space-y-3">
            {d.phases.deliverables.memo && (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`${baseUrl}/api/discovery-results/${did}/pptx`, { headers });
                      if (!res.ok) throw new Error("Failed to generate");
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `discovery-${did}.pptx`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch { /* ignore */ }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  {t("discovery.downloadPPT")}
                </button>
              </div>
            )}
            {d.phases.deliverables.memo && (() => {
              const key = `${did}/investment-memo.md`;
              const content = fileCache[key];
              return (
                <details open className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    {t("discovery.investmentMemo")}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[600px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">{t("discovery.loading")}</span>}
                  </div>
                </details>
              );
            })()}
          </div>
        )}

        {activeTab === "dashboard" && (
          <div>
            {dashError && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300 mb-3">
                {t("discovery.compileError")} {dashError}
              </div>
            )}
            {DashboardComp && (
              <DashboardErrorBoundary fallback={
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300">
                  {t("discovery.dashboardCrashed")}
                </div>
              }>
                <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                  <DashboardComp data={{ tool: "discovery_dashboard" }} onAction={() => {}} />
                </div>
              </DashboardErrorBoundary>
            )}
            {!DashboardComp && !dashError && (
              <div className="text-center py-8 text-gray-500 text-xs">{t("discovery.loadingDashboard")}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
