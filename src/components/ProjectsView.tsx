import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";

// ── Types ──

interface TeamAgent {
  id: string; name: string; role: string; responsibilities: string;
  goals: string[]; perspective: string; agentRole: string;
}

interface Persona {
  id: string; name: string; role: string; background: string;
  goals: string[]; frustrations: string[];
}

interface Project {
  id: string; name: string; description: string; vision: string;
  codebasePath: string; techStack?: string;
  branch?: string;
  teamAgents: TeamAgent[]; personas: Persona[];
  createdAt: number; updatedAt: number;
}

interface SprintMeta {
  sprintId: string; goal?: string; startedAt: number;
  completedAt?: number; status: string;
}

// ── Helpers ──

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ROLE_COLORS: Record<string, string> = {
  architect: "bg-blue-500", reviewer: "bg-amber-500", researcher: "bg-emerald-500",
  coder: "bg-violet-500", builder: "bg-orange-500",
};

// ── Component ──

type View = "list" | "detail" | "import";
type DetailTab = "overview" | "team" | "personas" | "sprints";

export default function ProjectsView() {
  const { t } = useT();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);

  const [view, setView] = useState<View>("list");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<SprintMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Import form
  const [importName, setImportName] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importing, setImporting] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProjects(data.projects ?? data ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const fetchProjectSprints = useCallback(async (projectId: string) => {
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/evolution-sprints?projectId=${projectId}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSprints(data.sprints ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  const openDetail = (project: Project) => {
    setSelectedProject(project);
    setDetailTab("overview");
    setView("detail");
    fetchProjectSprints(project.id);
  };

  const handleImport = async () => {
    if (!importName.trim() || !importPath.trim()) return;
    setImporting(true);
    try {
      const baseUrl = getBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/create-with-team`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: importName.trim().toLowerCase().replace(/\s+/g, "-"),
          projectName: importName.trim(),
          codebasePath: importPath.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setImportName("");
      setImportPath("");
      setView("list");
      await fetchProjects();
    } catch (err: any) {
      setError(err.message);
    }
    setImporting(false);
  };

  const evolveProject = (project: Project) => {
    sendMessage(`/evolve ${project.id}`);
    setActiveTab("chat");
    setChatViewOpen(true);
  };

  // ── Import view ──
  if (view === "import") {
    return (
      <div className="flex-1 overflow-y-auto mobile-view-enter">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-gray-200 mb-4 cursor-pointer">← Back</button>
          <h2 className="text-lg font-semibold text-gray-100 mb-4">Import Project</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Project Name</label>
              <input
                value={importName} onChange={(e) => setImportName(e.target.value)}
                placeholder="e.g., AlphaRank"
                className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Codebase Path</label>
              <input
                value={importPath} onChange={(e) => setImportPath(e.target.value)}
                placeholder="e.g., /Users/me/projects/my-app"
                className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={handleImport}
              disabled={importing || !importName.trim() || !importPath.trim()}
              className="w-full py-2.5 text-sm font-medium rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {importing ? "Importing..." : "Import & Generate Team"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ──
  if (view === "detail" && selectedProject) {
    const p = selectedProject;
    return (
      <div className="flex-1 overflow-y-auto mobile-view-enter">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-gray-200 mb-3 cursor-pointer">← Back</button>

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">{p.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{p.codebasePath}</p>
            </div>
            <button
              onClick={() => evolveProject(p)}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors cursor-pointer"
            >
              Evolve
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-800/60 mb-4">
            {(["overview", "team", "personas", "sprints"] as DetailTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setDetailTab(tab)}
                className={`px-3 py-2 text-xs font-medium capitalize rounded-t-lg transition-colors cursor-pointer ${detailTab === tab ? "text-indigo-400 bg-indigo-500/10 border-b-2 border-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {detailTab === "overview" && (
            <div className="space-y-4">
              {p.vision && (
                <div className="rounded-xl border border-gray-800/50 bg-gray-900/30 p-4">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Vision</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{p.vision}</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Team" value={String(p.teamAgents?.length ?? 0)} />
                <StatCard label="Personas" value={String(p.personas?.length ?? 0)} />
                {p.techStack && <StatCard label="Stack" value={p.techStack} />}
              </div>
            </div>
          )}

          {/* Team tab */}
          {detailTab === "team" && (
            <div className="space-y-2">
              {p.teamAgents?.map((agent) => (
                <div key={agent.id} className="rounded-xl border border-gray-800/50 bg-gray-900/30 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${ROLE_COLORS[agent.agentRole] ?? "bg-gray-500"}`} />
                    <span className="text-sm font-medium text-gray-200">{agent.name}</span>
                    <span className="text-[10px] text-gray-500">{agent.role}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{agent.responsibilities}</p>
                </div>
              ))}
              {(!p.teamAgents || p.teamAgents.length === 0) && (
                <p className="text-sm text-gray-600 py-4 text-center">No team agents configured</p>
              )}
            </div>
          )}

          {/* Personas tab */}
          {detailTab === "personas" && (
            <div className="space-y-2">
              {p.personas?.map((persona) => (
                <div key={persona.id} className="rounded-xl border border-gray-800/50 bg-gray-900/30 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-200">{persona.name}</span>
                    <span className="text-[10px] text-gray-500">{persona.role}</span>
                  </div>
                  <p className="text-xs text-gray-400">{persona.background}</p>
                  {persona.goals?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-gray-500 mb-0.5">Goals:</p>
                      <ul className="text-xs text-gray-400 list-disc list-inside space-y-0.5">
                        {persona.goals.map((g, i) => <li key={i}>{g}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
              {(!p.personas || p.personas.length === 0) && (
                <p className="text-sm text-gray-600 py-4 text-center">No personas configured</p>
              )}
            </div>
          )}

          {/* Sprints tab */}
          {detailTab === "sprints" && (
            <div className="space-y-2">
              {sprints.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <p className="text-sm">No sprints yet</p>
                  <p className="text-xs mt-1">Click "Evolve" to start a sprint for this project</p>
                </div>
              ) : sprints.map((sp) => (
                <div key={sp.sprintId} className="rounded-xl border border-gray-800/50 bg-gray-900/30 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border bg-purple-500/20 text-purple-300 border-purple-500/30">sprint</span>
                      <span className={`text-[10px] font-medium ${sp.status === "completed" || sp.status === "complete" ? "text-emerald-400" : "text-yellow-400"}`}>{sp.status}</span>
                    </div>
                    <span className="text-[10px] text-gray-600">{formatDate(sp.startedAt)}</span>
                  </div>
                  {sp.goal && <p className="text-xs text-gray-400 mt-1 truncate">{sp.goal}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view (default) ──
  return (
    <div className="flex-1 overflow-y-auto mobile-view-enter">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-100">{t("tab.projects")}</h1>
          <button
            onClick={() => { setError(null); setView("import"); }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer"
          >
            + Import Project
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
            <p className="text-sm font-medium">No projects</p>
            <p className="text-xs mt-1 text-gray-600">Import a project to get started with AI-powered evolution</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => openDetail(project)}
                className="w-full text-left rounded-xl border border-gray-800/50 bg-gray-900/30 hover:bg-gray-800/40 px-4 py-3.5 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-gray-200">{project.name}</h3>
                  <span className="text-[10px] text-gray-600">{timeAgo(project.updatedAt)}</span>
                </div>
                {project.description && <p className="text-xs text-gray-500 line-clamp-2">{project.description}</p>}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-gray-600">{project.teamAgents?.length ?? 0} agents</span>
                  <span className="text-[10px] text-gray-600">{project.personas?.length ?? 0} personas</span>
                  {project.techStack && <span className="text-[10px] text-gray-600">{project.techStack}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/50">
      <p className="text-lg font-bold text-gray-200">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
