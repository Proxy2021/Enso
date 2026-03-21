import { useState, useEffect, useCallback, useMemo } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { compileComponent } from "../lib/sandbox";
import MarkdownText from "../components/MarkdownText";
import type { CardRendererProps } from "./types";

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
  const [discoveries, setDiscoveries] = useState<DiscoveryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DiscoveryMeta | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [fileContent, setFileContent] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [DashboardComp, setDashboardComp] = useState<any>(null);
  const [dashError, setDashError] = useState<string | null>(null);

  const baseUrl = getBackendBaseUrl();
  const headers = useMemo(() => authHeaders(), []);

  // Fetch discovery list
  useEffect(() => {
    setLoading(true);
    fetch(`${baseUrl}/api/discovery-results`, { headers })
      .then(r => r.json())
      .then(data => {
        setDiscoveries(data.results || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [baseUrl]);

  // Fetch a file from a discovery
  const fetchFile = useCallback(async (discoveryId: string, filename: string) => {
    const key = `${discoveryId}/${filename}`;
    if (fileContent[key]) return fileContent[key];
    try {
      const res = await fetch(`${baseUrl}/api/discovery-results/${discoveryId}/file/${filename}`, { headers });
      if (!res.ok) return null;
      const text = await res.text();
      setFileContent(prev => ({ ...prev, [key]: text }));
      return text;
    } catch {
      return null;
    }
  }, [baseUrl, headers, fileContent]);

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
          } catch (err: any) {
            setDashError(err.message || "Failed to compile dashboard");
            setDashboardComp(null);
          }
        }
      });
    }
  }, [activeTab, selected]);

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
          <h3 className="text-sm font-semibold text-gray-200">Discovery History</h3>
          <span className="text-xs text-gray-500">{discoveries.length} discovery{discoveries.length !== 1 ? " sprints" : " sprint"}</span>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-500 text-xs">Loading discoveries...</div>
        )}

        {!loading && discoveries.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-2xl">{"\uD83D\uDD0D"}</div>
            <div className="text-gray-400 text-sm">No discovery sprints yet</div>
            <div className="text-gray-500 text-xs">Type /discover to launch your first AI VC discovery sprint</div>
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
    { value: "overview" as ViewTab, label: "Overview", enabled: true },
    { value: "sourcing" as ViewTab, label: `Sourcing (${d.phases.sourcing.count})`, enabled: d.phases.sourcing.count > 0 },
    { value: "pitches" as ViewTab, label: `Pitches (${d.phases.pitches.count})`, enabled: d.phases.pitches.count > 0 },
    { value: "committee" as ViewTab, label: "Committee", enabled: d.phases.committee.count > 0 },
    { value: "deliverables" as ViewTab, label: "Deliverables", enabled: d.phases.deliverables.memo },
    { value: "dashboard" as ViewTab, label: "Dashboard", enabled: d.phases.deliverables.dashboard },
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
            {/* Phase timeline */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Deal Sourcing", done: d.phases.sourcing.count > 0, detail: `${d.phases.sourcing.count} reports` },
                { label: "Pitches", done: d.phases.pitches.count > 0, detail: `${d.phases.pitches.count} pitched` },
                { label: "IC Challenge", done: d.phases.committee.count > 0, detail: d.phases.committee.count > 0 ? "Reviewed" : "\u2014" },
                { label: "Dashboard", done: d.phases.deliverables.dashboard, detail: d.phases.deliverables.dashboard ? "Built" : "\u2014" },
                { label: "Memo", done: d.phases.deliverables.memo, detail: d.phases.deliverables.memo ? "Written" : "\u2014" },
              ].map(phase => (
                <div key={phase.label} className={`p-2 rounded-lg border text-xs ${
                  phase.done ? "bg-indigo-500/5 border-indigo-500/30" : "bg-gray-800/50 border-gray-700"
                }`}>
                  <div className="flex items-center gap-1">
                    <span>{phase.done ? "\u2705" : "\u2B1C"}</span>
                    <span className={phase.done ? "text-indigo-400" : "text-gray-500"}>{phase.label}</span>
                  </div>
                  <div className="text-gray-500 mt-0.5">{phase.detail}</div>
                </div>
              ))}
            </div>

            {/* File count + shortcuts */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2.5 text-xs text-gray-400">
              <span className="text-gray-200 font-medium">{d.files.length}</span> artifacts archived
              {d.phases.deliverables.dashboard && (
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className="ml-3 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  View Dashboard {"\u2192"}
                </button>
              )}
              {d.phases.deliverables.memo && (
                <button
                  onClick={() => setActiveTab("deliverables")}
                  className="ml-3 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Read Memo {"\u2192"}
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "sourcing" && (
          <div className="space-y-3">
            {d.phases.sourcing.files.map(file => {
              const key = `${did}/${file}`;
              const content = fileContent[key];
              return (
                <details key={file} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    {prettyFilename(file)}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[500px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
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
              const content = fileContent[key];
              return (
                <details key={file} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    {prettyFilename(file)}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[500px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
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
              const content = fileContent[key];
              return (
                <details key={file} open className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    {prettyFilename(file)}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[500px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {activeTab === "deliverables" && (
          <div className="space-y-3">
            {d.phases.deliverables.memo && (() => {
              const key = `${did}/investment-memo.md`;
              const content = fileContent[key];
              return (
                <details open className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50">
                    Investment Memo
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[600px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
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
                Compile error: {dashError}
              </div>
            )}
            {DashboardComp && (
              <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                <DashboardComp data={{ tool: "discovery_dashboard" }} onAction={() => {}} />
              </div>
            )}
            {!DashboardComp && !dashError && (
              <div className="text-center py-8 text-gray-500 text-xs">Loading dashboard...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
