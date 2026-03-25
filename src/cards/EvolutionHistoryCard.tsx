import { useState, useEffect, useMemo } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { API } from "../lib/constants";
import { useFetchFile } from "../hooks/useFetchFile";
import { compileComponent } from "../lib/sandbox";
import MarkdownText from "../components/MarkdownText";
import type { CardRendererProps } from "./types";

interface SprintMeta {
  sprintId: string;
  goal: string;
  createdAt: number;
  completedAt: number;
  status: "completed" | "failed" | "partial";
  phases: {
    personas: { count: number; files: string[] };
    synthesis: boolean;
    discussion: boolean;
    design: boolean;
    implementation: boolean;
    review: boolean;
    validation: { count: number; files: string[] };
    dashboard: boolean;
  };
  files: string[];
}

type ViewTab = "overview" | "personas" | "implementation" | "validation" | "dashboard" | "discussion";

export default function EvolutionHistoryCard({ card }: CardRendererProps) {
  const [sprints, setSprints] = useState<SprintMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSprint, setSelectedSprint] = useState<SprintMeta | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [dashboardJSX, setDashboardJSX] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [DashboardComp, setDashboardComp] = useState<any>(null);
  const [dashError, setDashError] = useState<string | null>(null);

  const baseUrl = getBackendBaseUrl();
  const headers = useMemo(() => authHeaders(), []);
  const { fetchFile, fileCache } = useFetchFile(API.EVOLUTION_SPRINTS);

  // Fetch sprint list
  useEffect(() => {
    setLoading(true);
    fetch(`${baseUrl}${API.EVOLUTION_SPRINTS}`, { headers })
      .then(r => r.json())
      .then(data => {
        setSprints(data.sprints || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [baseUrl]);

  // Load dashboard JSX when tab selected
  useEffect(() => {
    if (activeTab === "dashboard" && selectedSprint?.phases.dashboard) {
      fetchFile(selectedSprint.sprintId, "dashboard-ui.jsx").then(jsx => {
        if (jsx) {
          setDashboardJSX(jsx);
          try {
            const result = compileComponent(jsx);
            if ("Component" in result) {
              setDashboardComp(() => result.Component);
            } else {
              setDashError(result.error);
            }
            setDashError(null);
          } catch (err: unknown) {
            setDashError(err instanceof Error ? err.message : "Failed to compile dashboard");
            setDashboardComp(null);
          }
        }
      });
    }
  }, [activeTab, selectedSprint]);

  // Load file content when persona/implementation/validation/discussion tabs selected
  useEffect(() => {
    if (!selectedSprint) return;
    const sid = selectedSprint.sprintId;

    if (activeTab === "personas") {
      for (const f of selectedSprint.phases.personas.files) {
        fetchFile(sid, f);
      }
    } else if (activeTab === "implementation") {
      if (selectedSprint.phases.design) fetchFile(sid, "design.md");
      if (selectedSprint.phases.implementation) fetchFile(sid, "implementation.md");
      if (selectedSprint.phases.review) fetchFile(sid, "review.md");
    } else if (activeTab === "validation") {
      for (const f of selectedSprint.phases.validation.files) {
        fetchFile(sid, f);
      }
    } else if (activeTab === "discussion") {
      if (selectedSprint.phases.synthesis) fetchFile(sid, "synthesis.md");
      if (selectedSprint.phases.discussion) fetchFile(sid, "discussion.md");
    }
  }, [activeTab, selectedSprint]);

  // Format date
  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const fmtDuration = (start: number, end: number) => {
    const mins = Math.round((end - start) / 60000);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  // ── List View ──
  if (!selectedSprint) {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🧬</span>
          <h3 className="text-sm font-semibold text-gray-200">Evolution History</h3>
          <span className="text-xs text-gray-500">{sprints.length} sprint{sprints.length !== 1 ? "s" : ""}</span>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-500 text-xs">Loading sprints...</div>
        )}

        {!loading && sprints.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-2xl">🧬</div>
            <div className="text-gray-400 text-sm">No evolution sprints yet</div>
            <div className="text-gray-500 text-xs">Click the Evolve tile or type /evolve to start your first sprint</div>
          </div>
        )}

        {sprints.map(sprint => (
          <button
            key={sprint.sprintId}
            onClick={() => { setSelectedSprint(sprint); setActiveTab("overview"); }}
            className="w-full text-left bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 rounded-lg p-3 transition-all duration-150 active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-300 group-hover:text-gray-100 truncate flex-1">
                {sprint.goal}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-2 ${
                sprint.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                sprint.status === "failed" ? "bg-red-500/20 text-red-400" :
                "bg-amber-500/20 text-amber-400"
              }`}>
                {sprint.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span>{fmtDate(sprint.completedAt)}</span>
              <span>·</span>
              <span>{sprint.phases.personas.count} personas</span>
              <span>·</span>
              <span>{sprint.files.length} files</span>
              {sprint.phases.implementation && (
                <>
                  <span>·</span>
                  <span className="text-violet-400">🔧 implemented</span>
                </>
              )}
              {sprint.phases.dashboard && (
                <>
                  <span>·</span>
                  <span className="text-blue-400">📊 dashboard</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ── Detail View ──
  const s = selectedSprint;
  const sid = s.sprintId;
  const tabs = ([
    { value: "overview" as ViewTab, label: "Overview", enabled: true },
    { value: "personas" as ViewTab, label: `Personas (${s.phases.personas.count})`, enabled: s.phases.personas.count > 0 },
    { value: "implementation" as ViewTab, label: "Implementation", enabled: s.phases.design || s.phases.implementation },
    { value: "validation" as ViewTab, label: `Validation (${s.phases.validation.count})`, enabled: s.phases.validation.count > 0 },
    { value: "dashboard" as ViewTab, label: "Dashboard", enabled: s.phases.dashboard },
    { value: "discussion" as ViewTab, label: "Discussion", enabled: s.phases.discussion || s.phases.synthesis },
  ]).filter(t => t.enabled);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedSprint(null)}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← Back
        </button>
        <span className="text-gray-600">|</span>
        <span className="text-xs text-gray-400">{fmtDate(s.completedAt)}</span>
        <span className="text-xs text-gray-500">·</span>
        <span className="text-xs text-gray-500">{fmtDuration(s.createdAt, s.completedAt)}</span>
      </div>

      <h3 className="text-sm font-semibold text-gray-200">{s.goal}</h3>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700 pb-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-2.5 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
              activeTab === tab.value
                ? "bg-gray-700 text-white border-b-2 border-violet-400"
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
                { label: "Personas", done: s.phases.personas.count > 0, detail: `${s.phases.personas.count} tested` },
                { label: "Synthesis", done: s.phases.synthesis, detail: s.phases.synthesis ? "Complete" : "—" },
                { label: "Discussion", done: s.phases.discussion, detail: s.phases.discussion ? "Complete" : "—" },
                { label: "Implementation", done: s.phases.implementation, detail: s.phases.implementation ? "Applied" : "—" },
                { label: "Review", done: s.phases.review, detail: s.phases.review ? "Passed" : "—" },
                { label: "Validation", done: s.phases.validation.count > 0, detail: `${s.phases.validation.count} re-tested` },
                { label: "Dashboard", done: s.phases.dashboard, detail: s.phases.dashboard ? "Built" : "—" },
              ].map(phase => (
                <div key={phase.label} className={`p-2 rounded-lg border text-xs ${
                  phase.done ? "bg-emerald-500/5 border-emerald-500/30" : "bg-gray-800/50 border-gray-700"
                }`}>
                  <div className="flex items-center gap-1">
                    <span>{phase.done ? "✅" : "⬜"}</span>
                    <span className={phase.done ? "text-emerald-400" : "text-gray-500"}>{phase.label}</span>
                  </div>
                  <div className="text-gray-500 mt-0.5">{phase.detail}</div>
                </div>
              ))}
            </div>

            {/* File count */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2.5 text-xs text-gray-400">
              <span className="text-gray-200 font-medium">{s.files.length}</span> artifacts archived
              {s.phases.dashboard && (
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className="ml-3 text-violet-400 hover:text-violet-300 transition-colors"
                >
                  View Dashboard →
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "personas" && (
          <div className="space-y-3">
            {s.phases.personas.files.map(file => {
              const key = `${sid}/${file}`;
              const content = fileCache[key];
              const name = file.replace("personas/", "").replace(".md", "").replace("persona-", "").replace(/-/g, " ");
              return (
                <details key={file} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 capitalize">
                    {name}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[400px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {activeTab === "implementation" && (
          <div className="space-y-3">
            {["design.md", "implementation.md", "review.md"].map(file => {
              const key = `${sid}/${file}`;
              const content = fileCache[key];
              const label = file.replace(".md", "").replace(/-/g, " ");
              const hasFile = file === "design.md" ? s.phases.design :
                             file === "implementation.md" ? s.phases.implementation :
                             s.phases.review;
              if (!hasFile) return null;
              return (
                <details key={file} open={file === "implementation.md"} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 capitalize">
                    {label}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[400px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {activeTab === "validation" && (
          <div className="space-y-3">
            {s.phases.validation.files.map(file => {
              const key = `${sid}/${file}`;
              const content = fileCache[key];
              const name = file.replace("validation/", "").replace(".md", "").replace(/retest-|persona-/g, "").replace(/-/g, " ");
              return (
                <details key={file} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 capitalize">
                    Re-test: {name}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[400px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
                  </div>
                </details>
              );
            })}
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
                <DashboardComp data={{ tool: "evolution_dashboard" }} onAction={() => {}} />
              </div>
            )}
            {!DashboardComp && !dashError && (
              <div className="text-center py-8 text-gray-500 text-xs">Loading dashboard...</div>
            )}
          </div>
        )}

        {activeTab === "discussion" && (
          <div className="space-y-3">
            {["synthesis.md", "discussion.md"].map(file => {
              const key = `${sid}/${file}`;
              const content = fileCache[key];
              const label = file.replace(".md", "");
              const hasFile = file === "synthesis.md" ? s.phases.synthesis : s.phases.discussion;
              if (!hasFile) return null;
              return (
                <details key={file} open={file === "discussion.md"} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 capitalize">
                    {label}
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-xs overflow-auto max-h-[500px]">
                    {content ? <MarkdownText text={content} /> : <span className="text-gray-500">Loading...</span>}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
