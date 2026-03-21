import { useState, useEffect, useCallback, useMemo } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { useChatStore } from "../store/chat";
import type { CardRendererProps } from "./types";

interface TeamAgent {
  id: string; name: string; role: string; responsibilities: string;
  goals: string[]; perspective: string; agentRole: string; painPoints?: string[];
}

interface Persona {
  id: string; name: string; role: string; background: string;
  goals: string[]; frustrations: string[]; testScenarios: string[];
}

interface Project {
  id: string; name: string; description: string; vision: string;
  codebasePath: string; techStack?: string; testUrl?: string; testCommand?: string;
  teamAgents: TeamAgent[]; personas: Persona[]; validationPersonaIds: string[];
  createdAt: number; updatedAt: number;
}

type View = "list" | "detail" | "import";

const ROLE_COLORS: Record<string, string> = {
  architect: "bg-amber-400",
  researcher: "bg-pink-400",
  reviewer: "bg-cyan-400",
  coder: "bg-emerald-400",
  builder: "bg-violet-400",
};

function agentDot(agent: TeamAgent) {
  if (agent.id === "project-leader") return "bg-amber-400";
  return ROLE_COLORS[agent.agentRole] || "bg-blue-400";
}

export default function ProjectsCard({ card }: CardRendererProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Project | null>(null);
  const [view, setView] = useState<View>("list");
  const [activeProject, setActiveProject] = useState(localStorage.getItem("enso-active-project") || "enso");
  const sendMessage = useChatStore(s => s.sendMessage);

  // Import form state
  const [importForm, setImportForm] = useState({ name: "", codebasePath: "", description: "", vision: "", testUrl: "", testCommand: "" });
  const [generating, setGenerating] = useState(false);
  const [importError, setImportError] = useState("");

  const baseUrl = getBackendBaseUrl();
  const headers = useMemo(() => authHeaders({ "Content-Type": "application/json" }), []);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    fetch(`${baseUrl}/api/projects`, { headers })
      .then(r => r.json())
      .then(d => { setProjects(d.projects || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [baseUrl]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleSetActive = (id: string) => {
    localStorage.setItem("enso-active-project", id);
    setActiveProject(id);
  };

  const handleEvolve = (projectId: string) => {
    handleSetActive(projectId);
    sendMessage("/evolve");
  };

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // ── Import: create project with auto-generated team ──
  const handleImport = async () => {
    const { name, codebasePath } = importForm;
    if (!name.trim() || !codebasePath.trim()) { setImportError("Name and codebase path are required"); return; }

    const projectId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (projects.some(p => p.id === projectId)) { setImportError(`Project "${projectId}" already exists`); return; }

    setGenerating(true);
    setImportError("");

    try {
      const res = await fetch(`${baseUrl}/api/projects/create-with-team`, {
        method: "POST", headers,
        body: JSON.stringify({
          projectId,
          projectName: name.trim(),
          description: importForm.description.trim(),
          vision: importForm.vision.trim(),
          codebasePath: codebasePath.trim(),
          testUrl: importForm.testUrl.trim() || undefined,
          testCommand: importForm.testCommand.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create project");

      fetchProjects();
      setSelected(data.project);
      setView("detail");
      setImportForm({ name: "", codebasePath: "", description: "", vision: "", testUrl: "", testCommand: "" });
    } catch (err: any) {
      setImportError(err.message || "Failed to create project");
    } finally {
      setGenerating(false);
    }
  };

  // ── List View ──
  if (view === "list") {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📁</span>
            <h3 className="text-sm font-semibold text-gray-200">Projects</h3>
            <span className="text-xs text-gray-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => sendMessage("/discover")}
              className="px-2.5 py-1 text-[10px] font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-md transition-colors"
            >
              Discover
            </button>
            <button
              onClick={() => setView("import")}
              className="px-2.5 py-1 text-[10px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors"
            >
              + Import
            </button>
          </div>
        </div>

        {/* Discover banner */}
        <button
          onClick={() => sendMessage("/discover")}
          className="w-full text-left bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/15 hover:to-orange-500/15 border border-amber-500/20 hover:border-amber-500/30 rounded-lg p-3 transition-all duration-150 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">💡</span>
            <span className="text-xs font-medium text-amber-300">AI VC Discovery</span>
          </div>
          <div className="text-[10px] text-gray-400">
            AI investment team researches market opportunities, pitches recommendations, and runs rigorous due diligence. Type a focus area or leave blank for general discovery.
          </div>
        </button>

        {loading && <div className="text-center py-8 text-gray-500 text-xs">Loading projects...</div>}

        {!loading && projects.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-2xl">📁</div>
            <div className="text-gray-400 text-sm">No projects yet</div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => sendMessage("/discover")} className="text-amber-400 text-xs hover:text-amber-300">
                Discover opportunities →
              </button>
              <button onClick={() => setView("import")} className="text-violet-400 text-xs hover:text-violet-300">
                Import existing project →
              </button>
            </div>
          </div>
        )}

        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => { setSelected(p); setView("detail"); }}
            className="w-full text-left bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 rounded-lg p-3 transition-all duration-150 active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-200 group-hover:text-gray-100">
                  {p.name}
                </span>
                {p.id === activeProject && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                    ACTIVE
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-500">{fmtDate(p.updatedAt)}</span>
            </div>
            <div className="text-[10px] text-gray-400 line-clamp-1 mb-1.5">{p.description}</div>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span>👥 {p.teamAgents?.length || 0} team</span>
              <span>🧑‍💻 {p.personas?.length || 0} personas</span>
              {p.techStack && <span>⚙️ {p.techStack.split("/")[0]}</span>}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ── Import View ──
  if (view === "import") {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { setView("list"); setImportError(""); }} className="text-xs text-gray-400 hover:text-gray-200">← Back</button>
          <span className="text-gray-600">|</span>
          <h3 className="text-sm font-semibold text-gray-200">Import Project</h3>
        </div>

        <div className="bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20 rounded-lg p-2.5">
          <div className="text-xs text-gray-300">
            Point Enso at any existing codebase. It will scan the project, detect the tech stack, and auto-generate a tailored AI team and customer personas.
          </div>
        </div>

        <div className="space-y-2.5">
          {/* Required fields */}
          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Project Name *</label>
            <input
              value={importForm.name}
              onChange={e => setImportForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., AlphaRank"
              className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:outline-none"
              disabled={generating}
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Codebase Path *</label>
            <input
              value={importForm.codebasePath}
              onChange={e => setImportForm(f => ({ ...f, codebasePath: e.target.value }))}
              placeholder="e.g., D:/Github/AlphaRank"
              className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:outline-none"
              disabled={generating}
            />
          </div>

          {/* Optional fields */}
          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Description <span className="text-gray-600">(auto-detected if blank)</span></label>
            <textarea
              value={importForm.description}
              onChange={e => setImportForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does this project do?"
              rows={2}
              className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:outline-none resize-none"
              disabled={generating}
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 font-medium block mb-1">Vision <span className="text-gray-600">(optional)</span></label>
            <input
              value={importForm.vision}
              onChange={e => setImportForm(f => ({ ...f, vision: e.target.value }))}
              placeholder="Where is this project headed?"
              className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:outline-none"
              disabled={generating}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 font-medium block mb-1">Test URL <span className="text-gray-600">(for web apps)</span></label>
              <input
                value={importForm.testUrl}
                onChange={e => setImportForm(f => ({ ...f, testUrl: e.target.value }))}
                placeholder="http://localhost:3000"
                className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:outline-none"
                disabled={generating}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium block mb-1">Test Command <span className="text-gray-600">(for CLI apps)</span></label>
              <input
                value={importForm.testCommand}
                onChange={e => setImportForm(f => ({ ...f, testCommand: e.target.value }))}
                placeholder="python -m pytest test/"
                className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:outline-none"
                disabled={generating}
              />
            </div>
          </div>
        </div>

        {importError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-2.5 py-1.5">
            {importError}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleImport}
            disabled={generating || !importForm.name.trim() || !importForm.codebasePath.trim()}
            className="flex-1 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Scanning codebase & generating team...
              </span>
            ) : (
              "Import & Generate AI Team"
            )}
          </button>
          <button
            onClick={() => { setView("list"); setImportError(""); }}
            disabled={generating}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Detail View ──
  if (view === "detail" && selected) {
    const p = selected;
    return (
      <div className="px-4 py-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button onClick={() => { setView("list"); setSelected(null); }} className="text-xs text-gray-400 hover:text-gray-200">← Back</button>
          <span className="text-gray-600">|</span>
          <span className="text-xs text-gray-400">{fmtDate(p.updatedAt)}</span>
          {p.id === activeProject && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">ACTIVE</span>
          )}
        </div>

        <h3 className="text-sm font-semibold text-gray-200">{p.name}</h3>

        {/* Vision */}
        {p.vision && (
          <div className="bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20 rounded-lg p-2.5">
            <div className="text-[10px] text-violet-400 font-medium mb-1">VISION</div>
            <div className="text-xs text-gray-300">{p.vision}</div>
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2 text-xs">
            <div className="text-gray-500 text-[10px]">Codebase</div>
            <div className="text-gray-300 truncate">{p.codebasePath}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2 text-xs">
            <div className="text-gray-500 text-[10px]">Tech Stack</div>
            <div className="text-gray-300 truncate">{p.techStack || "Not specified"}</div>
          </div>
        </div>

        {/* Team Agents */}
        {p.teamAgents && p.teamAgents.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 font-medium mb-1.5">TEAM ({p.teamAgents.length})</div>
            <div className="space-y-1.5">
              {p.teamAgents.map(agent => (
                <details key={agent.id} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${agentDot(agent)}`} />
                    {agent.name} — {agent.role}
                    <span className="text-[9px] text-gray-600 ml-auto">{agent.agentRole}</span>
                  </summary>
                  <div className="px-3 py-2 border-t border-gray-700 text-[11px] text-gray-400 space-y-1">
                    <div><span className="text-gray-500">Responsibilities:</span> {agent.responsibilities}</div>
                    <div><span className="text-gray-500">Perspective:</span> {agent.perspective}</div>
                    {agent.goals.length > 0 && (
                      <div>
                        <span className="text-gray-500">Goals:</span>
                        <ul className="list-disc list-inside mt-0.5">
                          {agent.goals.map((g, i) => <li key={i}>{g}</li>)}
                        </ul>
                      </div>
                    )}
                    {agent.painPoints && agent.painPoints.length > 0 && (
                      <div>
                        <span className="text-red-400/70">Pain Points:</span>
                        <ul className="list-disc list-inside mt-0.5">
                          {agent.painPoints.map((pp, i) => <li key={i}>{pp}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* Customer Personas */}
        {p.personas && p.personas.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 font-medium mb-1.5">CUSTOMER PERSONAS ({p.personas.length})</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {p.personas.map(persona => (
                <div key={persona.id} className="bg-gray-800/50 rounded-lg border border-gray-700 p-2 text-xs">
                  <div className="font-medium text-gray-300 text-[11px]">{persona.name}</div>
                  <div className="text-[10px] text-gray-500">{persona.role}</div>
                  {p.validationPersonaIds?.includes(persona.id) && (
                    <span className="text-[9px] text-cyan-400 mt-0.5 inline-block">🔄 validator</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => handleEvolve(p.id)}
            className="flex-1 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
          >
            🧬 Evolve {p.name}
          </button>
          {p.id !== activeProject && (
            <button
              onClick={() => handleSetActive(p.id)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
            >
              Set Active
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
