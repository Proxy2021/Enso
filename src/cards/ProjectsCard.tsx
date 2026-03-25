import { useState, useEffect, useCallback, useMemo } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { API } from "../lib/constants";
import { compileComponent } from "../lib/sandbox";
import MarkdownText from "../components/MarkdownText";
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
  branch?: string;
  teamAgents: TeamAgent[]; personas: Persona[]; validationPersonaIds: string[];
  createdAt: number; updatedAt: number;
}

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

type View = "list" | "detail" | "import";
type DetailTab = "overview" | "sprints" | "discoveries" | "team" | "personas";

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
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [activeProject, setActiveProject] = useState(localStorage.getItem("enso-active-project") || "enso");
  const sendMessage = useChatStore(s => s.sendMessage);

  // Import form state
  const [importForm, setImportForm] = useState({ name: "", codebasePath: "", description: "", vision: "", testUrl: "", testCommand: "" });
  const [generating, setGenerating] = useState(false);
  const [importError, setImportError] = useState("");

  // Launch prompt dialog state
  const [promptDialog, setPromptDialog] = useState<{ type: "evolve" | "discover"; projectId?: string } | null>(null);
  const [promptText, setPromptText] = useState("");

  // Sprint / discovery data
  const [sprints, setSprints] = useState<SprintMeta[]>([]);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [discoveries, setDiscoveries] = useState<DiscoveryMeta[]>([]);
  const [discoveriesLoading, setDiscoveriesLoading] = useState(false);

  // Sprint detail state
  const [selectedSprint, setSelectedSprint] = useState<SprintMeta | null>(null);
  const [sprintFileContent, setSprintFileContent] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [SprintDashComp, setSprintDashComp] = useState<any>(null);
  const [sprintDashError, setSprintDashError] = useState<string | null>(null);
  const [sprintViewTab, setSprintViewTab] = useState<"overview" | "personas" | "implementation" | "validation" | "dashboard">("overview");

  // Discovery detail state
  const [selectedDiscovery, setSelectedDiscovery] = useState<DiscoveryMeta | null>(null);
  const [discoveryFileContent, setDiscoveryFileContent] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [DiscoveryDashComp, setDiscoveryDashComp] = useState<any>(null);
  const [discoveryDashError, setDiscoveryDashError] = useState<string | null>(null);
  const [discoveryViewTab, setDiscoveryViewTab] = useState<"overview" | "sourcing" | "pitches" | "committee" | "deliverables" | "dashboard">("overview");

  // Branch management state
  const [branchStatus, setBranchStatus] = useState<{ branch: string; currentBranch: string; aheadOfMain: number; behindMain: number; hasUncommitted: boolean } | null>(null);
  const [branchEditing, setBranchEditing] = useState(false);
  const [branchInput, setBranchInput] = useState("");
  const [branchMerging, setBranchMerging] = useState(false);
  const [branchError, setBranchError] = useState("");

  const baseUrl = getBackendBaseUrl();
  const headers = useMemo(() => authHeaders({ "Content-Type": "application/json" }), []);
  const headersPlain = useMemo(() => authHeaders(), []);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    fetch(`${baseUrl}${API.PROJECTS}`, { headers })
      .then(r => r.json())
      .then(d => { setProjects(d.projects || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [baseUrl]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Fetch sprints when sprints tab is selected
  useEffect(() => {
    if (view === "detail" && selected && detailTab === "sprints" && sprints.length === 0 && !sprintsLoading) {
      setSprintsLoading(true);
      fetch(`${baseUrl}${API.EVOLUTION_SPRINTS}?projectId=${selected.id}`, { headers: headersPlain })
        .then(r => r.json())
        .then(d => { setSprints(d.sprints || []); setSprintsLoading(false); })
        .catch(() => setSprintsLoading(false));
    }
  }, [view, selected, detailTab]);

  // Fetch discoveries when discoveries tab is selected
  useEffect(() => {
    if (view === "detail" && selected && detailTab === "discoveries" && discoveries.length === 0 && !discoveriesLoading) {
      setDiscoveriesLoading(true);
      fetch(`${baseUrl}${API.DISCOVERY_RESULTS}`, { headers: headersPlain })
        .then(r => r.json())
        .then(d => { setDiscoveries(d.results || []); setDiscoveriesLoading(false); })
        .catch(() => setDiscoveriesLoading(false));
    }
  }, [view, selected, detailTab]);

  // Fetch branch status when overview tab is selected
  useEffect(() => {
    if (view === "detail" && selected && detailTab === "overview") {
      setBranchStatus(null);
      setBranchError("");
      fetch(`${baseUrl}/api/projects/${selected.id}/branch-status`, { headers: headersPlain })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setBranchStatus(d); })
        .catch(() => {});
    }
  }, [view, selected, detailTab]);

  const handleBranchSave = async (projectId: string) => {
    const branch = branchInput.trim();
    if (!branch) return;
    setBranchError("");
    try {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: "PUT", headers, body: JSON.stringify({ branch }),
      });
      if (!res.ok) { setBranchError("Failed to update branch"); return; }
      setBranchEditing(false);
      // Refresh project + branch status
      const pRes = await fetch(`${baseUrl}/api/projects/${projectId}`, { headers: headersPlain });
      if (pRes.ok) { const p = await pRes.json(); setSelected(p); fetchProjects(); }
      const sRes = await fetch(`${baseUrl}/api/projects/${projectId}/branch-status`, { headers: headersPlain });
      if (sRes.ok) setBranchStatus(await sRes.json());
    } catch { setBranchError("Failed to update branch"); }
  };

  const handleMergeBranch = async (projectId: string) => {
    if (!confirm("Merge evolution branch into main? This will checkout main and merge.")) return;
    setBranchMerging(true);
    setBranchError("");
    try {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/merge-branch`, {
        method: "POST", headers, body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setBranchError(data.error || "Merge failed"); setBranchMerging(false); return; }
      setBranchMerging(false);
      // Refresh branch status
      const sRes = await fetch(`${baseUrl}/api/projects/${projectId}/branch-status`, { headers: headersPlain });
      if (sRes.ok) setBranchStatus(await sRes.json());
    } catch { setBranchError("Merge failed"); setBranchMerging(false); }
  };

  const handleSetActive = (id: string) => {
    localStorage.setItem("enso-active-project", id);
    setActiveProject(id);
  };

  const handleEvolve = (projectId: string) => {
    setPromptDialog({ type: "evolve", projectId });
    setPromptText("");
  };

  const handleDiscover = () => {
    setPromptDialog({ type: "discover" });
    setPromptText("");
  };

  const handlePromptConfirm = () => {
    if (!promptDialog) return;
    if (promptDialog.type === "evolve" && promptDialog.projectId) {
      handleSetActive(promptDialog.projectId);
      sendMessage(promptText.trim() ? `/evolve ${promptText.trim()}` : "/evolve");
    } else if (promptDialog.type === "discover") {
      sendMessage(promptText.trim() ? `/discover ${promptText.trim()}` : "/discover");
    }
    setPromptDialog(null);
    setPromptText("");
  };

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const fmtDateTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const fmtDuration = (start: number, end: number) => {
    const mins = Math.round((end - start) / 60000);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const statusBadge = (status: string) => {
    const cls = status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
      status === "failed" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400";
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cls}`}>{status}</span>;
  };

  // ── Sprint file fetcher ──
  const fetchSprintFile = useCallback(async (sprintId: string, filename: string, projectId: string) => {
    const key = `sprint:${sprintId}/${filename}`;
    if (sprintFileContent[key]) return sprintFileContent[key];
    try {
      const res = await fetch(`${baseUrl}/api/evolution-sprints/${sprintId}/file/${filename}?projectId=${projectId}`, { headers: headersPlain });
      if (!res.ok) return null;
      const text = await res.text();
      setSprintFileContent(prev => ({ ...prev, [key]: text }));
      return text;
    } catch { return null; }
  }, [baseUrl, headersPlain, sprintFileContent]);

  // ── Discovery file fetcher ──
  const fetchDiscoveryFile = useCallback(async (discoveryId: string, filename: string) => {
    const key = `disc:${discoveryId}/${filename}`;
    if (discoveryFileContent[key]) return discoveryFileContent[key];
    try {
      const res = await fetch(`${baseUrl}/api/discovery-results/${discoveryId}/file/${filename}`, { headers: headersPlain });
      if (!res.ok) return null;
      const text = await res.text();
      setDiscoveryFileContent(prev => ({ ...prev, [key]: text }));
      return text;
    } catch { return null; }
  }, [baseUrl, headersPlain, discoveryFileContent]);

  // Load sprint dashboard when tab selected
  useEffect(() => {
    if (sprintViewTab === "dashboard" && selectedSprint?.phases.dashboard && selected) {
      fetchSprintFile(selectedSprint.sprintId, "dashboard-ui.jsx", selected.id).then(jsx => {
        if (jsx) {
          try {
            const result = compileComponent(jsx);
            if ("Component" in result) { setSprintDashComp(() => result.Component); setSprintDashError(null); }
            else { setSprintDashError(result.error); setSprintDashComp(null); }
          } catch (err: unknown) { setSprintDashError(err instanceof Error ? err.message : String(err)); setSprintDashComp(null); }
        }
      });
    }
  }, [sprintViewTab, selectedSprint]);

  // Load sprint file content when tabs are selected
  useEffect(() => {
    if (!selectedSprint || !selected) return;
    const sid = selectedSprint.sprintId;
    const pid = selected.id;
    if (sprintViewTab === "personas") {
      for (const f of selectedSprint.phases.personas.files) fetchSprintFile(sid, f, pid);
    } else if (sprintViewTab === "validation") {
      for (const f of selectedSprint.phases.validation.files) fetchSprintFile(sid, f, pid);
    } else if (sprintViewTab === "implementation") {
      const implFiles = selectedSprint.files.filter(f => f.includes("implementation") || f.includes("synthesis") || f.includes("review"));
      for (const f of implFiles) fetchSprintFile(sid, f, pid);
    }
  }, [sprintViewTab, selectedSprint]);

  // Load discovery dashboard when tab selected
  useEffect(() => {
    if (discoveryViewTab === "dashboard" && selectedDiscovery?.phases.deliverables.dashboard) {
      fetchDiscoveryFile(selectedDiscovery.discoveryId, "dashboard-ui.jsx").then(jsx => {
        if (jsx) {
          try {
            const result = compileComponent(jsx);
            if ("Component" in result) { setDiscoveryDashComp(() => result.Component); setDiscoveryDashError(null); }
            else { setDiscoveryDashError(result.error); setDiscoveryDashComp(null); }
          } catch (err: unknown) { setDiscoveryDashError(err instanceof Error ? err.message : String(err)); setDiscoveryDashComp(null); }
        }
      });
    }
  }, [discoveryViewTab, selectedDiscovery]);

  // Load discovery file content when tabs are selected
  useEffect(() => {
    if (!selectedDiscovery) return;
    const did = selectedDiscovery.discoveryId;
    if (discoveryViewTab === "sourcing") {
      for (const f of selectedDiscovery.phases.sourcing.files) fetchDiscoveryFile(did, f);
    } else if (discoveryViewTab === "pitches") {
      for (const f of selectedDiscovery.phases.pitches.files) fetchDiscoveryFile(did, f);
    } else if (discoveryViewTab === "committee") {
      for (const f of selectedDiscovery.phases.committee.files) fetchDiscoveryFile(did, f);
    } else if (discoveryViewTab === "deliverables") {
      if (selectedDiscovery.phases.deliverables.memo) fetchDiscoveryFile(did, "investment-memo.md");
    }
  }, [discoveryViewTab, selectedDiscovery]);

  const prettyFilename = (f: string) =>
    f.replace(/^(sourcing|pitches|committee|outputs|personas|validation)\//,"")
      .replace(/\.(md|jsx)$/,"")
      .replace(/^\.?(evolution-|orchestration-)/,"")
      .replace(/[-_]/g," ")
      .replace(/\b\w/g, c => c.toUpperCase());

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
      setDetailTab("overview");
      setImportForm({ name: "", codebasePath: "", description: "", vision: "", testUrl: "", testCommand: "" });
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = (p: Project) => {
    setSelected(p);
    setView("detail");
    setDetailTab("overview");
    setSprints([]);
    setDiscoveries([]);
    setSelectedSprint(null);
    setSelectedDiscovery(null);
  };

  // ── Prompt Dialog (intercepts before any view) ──
  if (promptDialog) {
    const isEvolve = promptDialog.type === "evolve";
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setPromptDialog(null)} className="text-xs text-gray-400 hover:text-gray-200">{"\u2190"} Cancel</button>
          <span className="text-gray-600">|</span>
          <h3 className="text-sm font-semibold text-gray-200">
            {isEvolve ? "\uD83E\uDDEC Launch Evolution Sprint" : "\uD83D\uDCA1 Launch Discovery Sprint"}
          </h3>
        </div>

        <div className={`bg-gradient-to-r ${isEvolve ? "from-violet-500/10 to-blue-500/10 border-violet-500/20" : "from-amber-500/10 to-orange-500/10 border-amber-500/20"} border rounded-lg p-2.5`}>
          <div className="text-xs text-gray-300">
            {isEvolve
              ? "Optionally specify what this evolution sprint should focus on. Leave blank to let the Project Leader decide based on the current state of the project."
              : "Optionally specify a focus area for the AI VC team to investigate. Leave blank for a general market discovery."}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 font-medium block mb-1">
            {isEvolve ? "Sprint Focus" : "Discovery Focus"} <span className="text-gray-600">(optional)</span>
          </label>
          <textarea
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            placeholder={isEvolve
              ? "e.g., Improve onboarding flow and fix mobile layout issues"
              : "e.g., AI-powered developer tools for code review"}
            rows={2}
            className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:outline-none resize-none"
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePromptConfirm(); }
            }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePromptConfirm}
            className={`flex-1 px-3 py-2 ${isEvolve ? "bg-violet-600 hover:bg-violet-500" : "bg-amber-600 hover:bg-amber-500"} text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]`}
          >
            {promptText.trim()
              ? (isEvolve ? "\uD83E\uDDEC Start Sprint" : "\uD83D\uDCA1 Start Discovery")
              : (isEvolve ? "\uD83E\uDDEC Start Sprint (auto-focus)" : "\uD83D\uDCA1 Start Discovery (general)")}
          </button>
          <button
            onClick={() => setPromptDialog(null)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── List View ──
  if (view === "list") {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{"\uD83D\uDCC1"}</span>
            <h3 className="text-sm font-semibold text-gray-200">Projects</h3>
            <span className="text-xs text-gray-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handleDiscover}
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
          onClick={handleDiscover}
          className="w-full text-left bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/15 hover:to-orange-500/15 border border-amber-500/20 hover:border-amber-500/30 rounded-lg p-3 transition-all duration-150 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{"\uD83D\uDCA1"}</span>
            <span className="text-xs font-medium text-amber-300">AI VC Discovery</span>
          </div>
          <div className="text-[10px] text-gray-400">
            AI investment team researches market opportunities, pitches recommendations, and runs rigorous due diligence. Type a focus area or leave blank for general discovery.
          </div>
        </button>

        {loading && <div className="text-center py-8 text-gray-500 text-xs">Loading projects...</div>}

        {!loading && projects.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-2xl">{"\uD83D\uDCC1"}</div>
            <div className="text-gray-400 text-sm">No projects yet</div>
            <div className="flex gap-3 justify-center">
              <button onClick={handleDiscover} className="text-amber-400 text-xs hover:text-amber-300">
                Discover opportunities {"\u2192"}
              </button>
              <button onClick={() => setView("import")} className="text-violet-400 text-xs hover:text-violet-300">
                Import existing project {"\u2192"}
              </button>
            </div>
          </div>
        )}

        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => openDetail(p)}
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
              <span>{"\uD83D\uDC65"} {p.teamAgents?.length || 0} team</span>
              <span>{"\uD83E\uDDD1\u200D\uD83D\uDCBB"} {p.personas?.length || 0} personas</span>
              {p.techStack && <span>{"\u2699\uFE0F"} {p.techStack.split("/")[0]}</span>}
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
          <button onClick={() => { setView("list"); setImportError(""); }} className="text-xs text-gray-400 hover:text-gray-200">{"\u2190"} Back</button>
          <span className="text-gray-600">|</span>
          <h3 className="text-sm font-semibold text-gray-200">Import Project</h3>
        </div>

        <div className="bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20 rounded-lg p-2.5">
          <div className="text-xs text-gray-300">
            Point Enso at any existing codebase. It will scan the project, detect the tech stack, and auto-generate a tailored AI team and customer personas.
          </div>
        </div>

        <div className="space-y-2.5">
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

    // If viewing a sprint detail
    if (selectedSprint) {
      return renderSprintDetail(p);
    }

    // If viewing a discovery detail
    if (selectedDiscovery) {
      return renderDiscoveryDetail(p);
    }

    const detailTabs: { value: DetailTab; label: string }[] = [
      { value: "overview", label: "Overview" },
      { value: "sprints", label: "Sprints" },
      { value: "discoveries", label: "Discoveries" },
      { value: "team", label: `Team (${p.teamAgents?.length || 0})` },
      { value: "personas", label: `Personas (${p.personas?.length || 0})` },
    ];

    return (
      <div className="px-4 py-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button onClick={() => { setView("list"); setSelected(null); }} className="text-xs text-gray-400 hover:text-gray-200">{"\u2190"} Back</button>
          <span className="text-gray-600">|</span>
          <span className="text-xs text-gray-400">{fmtDate(p.updatedAt)}</span>
          {p.id === activeProject && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">ACTIVE</span>
          )}
          {p.id !== activeProject && (
            <button
              onClick={() => handleSetActive(p.id)}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors ml-auto"
            >
              Set Active
            </button>
          )}
        </div>

        <h3 className="text-sm font-semibold text-gray-200">{p.name}</h3>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-700 pb-1 overflow-x-auto">
          {detailTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setDetailTab(tab.value)}
              className={`px-2.5 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
                detailTab === tab.value
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
          {detailTab === "overview" && renderOverviewTab(p)}
          {detailTab === "sprints" && renderSprintsTab(p)}
          {detailTab === "discoveries" && renderDiscoveriesTab()}
          {detailTab === "team" && renderTeamTab(p)}
          {detailTab === "personas" && renderPersonasTab(p)}
        </div>
      </div>
    );
  }

  // ── Tab Renderers ──

  function renderOverviewTab(p: Project) {
    return (
      <div className="space-y-3">
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

        {/* Branch */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <div className="text-gray-500 text-[10px] flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/></svg>
              Branch
            </div>
            {!branchEditing && (
              <button onClick={() => { setBranchInput(p.branch || "main"); setBranchEditing(true); }} className="text-[10px] text-gray-500 hover:text-gray-300">Edit</button>
            )}
          </div>
          {branchEditing ? (
            <div className="flex gap-1.5 items-center">
              <input
                className="flex-1 bg-gray-900 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-gray-200 focus:border-violet-500 outline-none"
                value={branchInput}
                onChange={e => setBranchInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleBranchSave(p.id); if (e.key === "Escape") setBranchEditing(false); }}
                placeholder="branch name"
                autoFocus
              />
              <button onClick={() => handleBranchSave(p.id)} className="text-[10px] px-1.5 py-0.5 bg-violet-600 hover:bg-violet-500 text-white rounded">Save</button>
              <button onClick={() => setBranchEditing(false)} className="text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`font-mono ${(p.branch && p.branch !== "main") ? "text-violet-400" : "text-gray-300"}`}>{p.branch || "main"}</span>
              {branchStatus && branchStatus.aheadOfMain > 0 && (
                <span className="text-[10px] text-emerald-400">{branchStatus.aheadOfMain} ahead</span>
              )}
              {branchStatus && branchStatus.behindMain > 0 && (
                <span className="text-[10px] text-amber-400">{branchStatus.behindMain} behind</span>
              )}
              {branchStatus && branchStatus.hasUncommitted && (
                <span className="text-[10px] text-yellow-500">uncommitted</span>
              )}
              {p.branch && p.branch !== "main" && branchStatus && branchStatus.aheadOfMain > 0 && (
                <button
                  onClick={() => handleMergeBranch(p.id)}
                  disabled={branchMerging}
                  className="ml-auto text-[10px] px-1.5 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded disabled:opacity-50"
                >
                  {branchMerging ? "Merging..." : "Merge to main"}
                </button>
              )}
            </div>
          )}
          {branchError && <div className="text-red-400 text-[10px] mt-1">{branchError}</div>}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setDetailTab("team")}
            className="bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 p-2 text-xs text-center transition-colors"
          >
            <div className="text-gray-200 font-medium">{p.teamAgents?.length || 0}</div>
            <div className="text-[10px] text-gray-500">Team Agents</div>
          </button>
          <button
            onClick={() => setDetailTab("personas")}
            className="bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 p-2 text-xs text-center transition-colors"
          >
            <div className="text-gray-200 font-medium">{p.personas?.length || 0}</div>
            <div className="text-[10px] text-gray-500">Personas</div>
          </button>
          <button
            onClick={() => setDetailTab("sprints")}
            className="bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 p-2 text-xs text-center transition-colors"
          >
            <div className="text-gray-200 font-medium">{"\uD83E\uDDEC"}</div>
            <div className="text-[10px] text-gray-500">View Sprints</div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => handleEvolve(p.id)}
            className="flex-1 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
          >
            {"\uD83E\uDDEC"} Evolve
          </button>
          <button
            onClick={handleDiscover}
            className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
          >
            {"\uD83D\uDCA1"} Discover
          </button>
        </div>
      </div>
    );
  }

  function renderSprintsTab(p: Project) {
    if (sprintsLoading) {
      return <div className="text-center py-8 text-gray-500 text-xs">Loading sprints...</div>;
    }

    if (sprints.length === 0) {
      return (
        <div className="text-center py-8 space-y-2">
          <div className="text-2xl">{"\uD83E\uDDEC"}</div>
          <div className="text-gray-400 text-sm">No evolution sprints yet</div>
          <button
            onClick={() => handleEvolve(p.id)}
            className="text-violet-400 text-xs hover:text-violet-300"
          >
            Launch first sprint {"\u2192"}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">{sprints.length} sprint{sprints.length !== 1 ? "s" : ""}</span>
          <button
            onClick={() => handleEvolve(p.id)}
            className="px-2 py-0.5 text-[10px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors"
          >
            + New Sprint
          </button>
        </div>

        {sprints.map(sprint => (
          <button
            key={sprint.sprintId}
            onClick={() => {
              setSelectedSprint(sprint);
              setSprintViewTab("overview");
              setSprintDashComp(null);
              setSprintDashError(null);
            }}
            className="w-full text-left bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 rounded-lg p-3 transition-all duration-150 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-300 truncate flex-1">{sprint.goal}</span>
              {statusBadge(sprint.status)}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span>{fmtDate(sprint.completedAt)}</span>
              <span>{"\u00B7"}</span>
              <span>{fmtDuration(sprint.createdAt, sprint.completedAt)}</span>
              <span>{"\u00B7"}</span>
              <span>{sprint.phases.personas.count} personas</span>
              <span>{"\u00B7"}</span>
              <span>{sprint.files.length} files</span>
              {sprint.phases.dashboard && (
                <>
                  <span>{"\u00B7"}</span>
                  <span className="text-violet-400">{"\uD83D\uDCCA"} dashboard</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  function renderDiscoveriesTab() {
    if (discoveriesLoading) {
      return <div className="text-center py-8 text-gray-500 text-xs">Loading discoveries...</div>;
    }

    if (discoveries.length === 0) {
      return (
        <div className="text-center py-8 space-y-2">
          <div className="text-2xl">{"\uD83D\uDD0D"}</div>
          <div className="text-gray-400 text-sm">No discovery sprints yet</div>
          <button
            onClick={handleDiscover}
            className="text-amber-400 text-xs hover:text-amber-300"
          >
            Launch first discovery {"\u2192"}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">{discoveries.length} discovery{discoveries.length !== 1 ? " sprints" : " sprint"}</span>
          <button
            onClick={handleDiscover}
            className="px-2 py-0.5 text-[10px] font-medium bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors"
          >
            + New Discovery
          </button>
        </div>

        {discoveries.map(disc => (
          <button
            key={disc.discoveryId}
            onClick={() => {
              setSelectedDiscovery(disc);
              setDiscoveryViewTab("overview");
              setDiscoveryDashComp(null);
              setDiscoveryDashError(null);
            }}
            className="w-full text-left bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 rounded-lg p-3 transition-all duration-150 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-300 truncate flex-1">{disc.focus}</span>
              {statusBadge(disc.status)}
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
                  <span className="text-amber-400">{"\uD83D\uDCCA"} dashboard</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  function renderTeamTab(p: Project) {
    if (!p.teamAgents || p.teamAgents.length === 0) {
      return <div className="text-center py-8 text-gray-500 text-xs">No team agents configured</div>;
    }

    return (
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
    );
  }

  function renderPersonasTab(p: Project) {
    if (!p.personas || p.personas.length === 0) {
      return <div className="text-center py-8 text-gray-500 text-xs">No customer personas configured</div>;
    }

    return (
      <div className="space-y-1.5">
        {p.personas.map(persona => (
          <details key={persona.id} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <summary className="px-3 py-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 flex items-center gap-2">
              {persona.name} — {persona.role}
              {p.validationPersonaIds?.includes(persona.id) && (
                <span className="text-[9px] text-cyan-400 ml-auto">{"\uD83D\uDD04"} validator</span>
              )}
            </summary>
            <div className="px-3 py-2 border-t border-gray-700 text-[11px] text-gray-400 space-y-1">
              <div><span className="text-gray-500">Background:</span> {persona.background}</div>
              {persona.goals.length > 0 && (
                <div>
                  <span className="text-gray-500">Goals:</span>
                  <ul className="list-disc list-inside mt-0.5">
                    {persona.goals.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
              )}
              {persona.frustrations.length > 0 && (
                <div>
                  <span className="text-red-400/70">Frustrations:</span>
                  <ul className="list-disc list-inside mt-0.5">
                    {persona.frustrations.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              {persona.testScenarios.length > 0 && (
                <div>
                  <span className="text-gray-500">Test Scenarios:</span>
                  <ul className="list-disc list-inside mt-0.5">
                    {persona.testScenarios.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    );
  }

  // ── Sprint Detail View (inline) ──
  function renderSprintDetail(p: Project) {
    const s = selectedSprint!;
    const sid = s.sprintId;

    const tabs = ([
      { value: "overview" as const, label: "Overview", enabled: true },
      { value: "personas" as const, label: `Personas (${s.phases.personas.count})`, enabled: s.phases.personas.count > 0 },
      { value: "implementation" as const, label: "Implementation", enabled: s.phases.implementation },
      { value: "validation" as const, label: `Validation (${s.phases.validation.count})`, enabled: s.phases.validation.count > 0 },
      { value: "dashboard" as const, label: "Dashboard", enabled: s.phases.dashboard },
    ]).filter(t => t.enabled);

    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedSprint(null)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            {"\u2190"} Sprints
          </button>
          <span className="text-gray-600">|</span>
          <span className="text-xs text-gray-400">{fmtDateTime(s.completedAt)}</span>
          <span className="text-xs text-gray-500">{"\u00B7"}</span>
          <span className="text-xs text-gray-500">{fmtDuration(s.createdAt, s.completedAt)}</span>
          {statusBadge(s.status)}
        </div>

        <h3 className="text-sm font-semibold text-gray-200">{s.goal}</h3>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-700 pb-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setSprintViewTab(tab.value)}
              className={`px-2.5 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
                sprintViewTab === tab.value
                  ? "bg-gray-700 text-white border-b-2 border-violet-400"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-[200px]">
          {sprintViewTab === "overview" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Personas", done: s.phases.personas.count > 0, detail: `${s.phases.personas.count} tested` },
                  { label: "Synthesis", done: s.phases.synthesis, detail: s.phases.synthesis ? "Done" : "\u2014" },
                  { label: "Implementation", done: s.phases.implementation, detail: s.phases.implementation ? "Done" : "\u2014" },
                  { label: "Review", done: s.phases.review, detail: s.phases.review ? "Reviewed" : "\u2014" },
                  { label: "Validation", done: s.phases.validation.count > 0, detail: `${s.phases.validation.count} retests` },
                  { label: "Dashboard", done: s.phases.dashboard, detail: s.phases.dashboard ? "Built" : "\u2014" },
                ].map(phase => (
                  <div key={phase.label} className={`p-2 rounded-lg border text-xs ${
                    phase.done ? "bg-violet-500/5 border-violet-500/30" : "bg-gray-800/50 border-gray-700"
                  }`}>
                    <div className="flex items-center gap-1">
                      <span>{phase.done ? "\u2705" : "\u2B1C"}</span>
                      <span className={phase.done ? "text-violet-400" : "text-gray-500"}>{phase.label}</span>
                    </div>
                    <div className="text-gray-500 mt-0.5">{phase.detail}</div>
                  </div>
                ))}
              </div>
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2.5 text-xs text-gray-400">
                <span className="text-gray-200 font-medium">{s.files.length}</span> artifacts archived
                {s.phases.dashboard && (
                  <button onClick={() => setSprintViewTab("dashboard")} className="ml-3 text-violet-400 hover:text-violet-300 transition-colors">
                    View Dashboard {"\u2192"}
                  </button>
                )}
              </div>
            </div>
          )}

          {sprintViewTab === "personas" && (
            <div className="space-y-3">
              {s.phases.personas.files.map(file => {
                const key = `sprint:${sid}/${file}`;
                const content = sprintFileContent[key];
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

          {sprintViewTab === "implementation" && (
            <div className="space-y-3">
              {s.files.filter(f => f.includes("implementation") || f.includes("synthesis") || f.includes("review")).map(file => {
                const key = `sprint:${sid}/${file}`;
                const content = sprintFileContent[key];
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

          {sprintViewTab === "validation" && (
            <div className="space-y-3">
              {s.phases.validation.files.map(file => {
                const key = `sprint:${sid}/${file}`;
                const content = sprintFileContent[key];
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

          {sprintViewTab === "dashboard" && (
            <div>
              {sprintDashError && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300 mb-3">
                  Compile error: {sprintDashError}
                </div>
              )}
              {SprintDashComp && (
                <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                  <SprintDashComp data={{ tool: "evolution_dashboard" }} onAction={() => {}} />
                </div>
              )}
              {!SprintDashComp && !sprintDashError && (
                <div className="text-center py-8 text-gray-500 text-xs">Loading dashboard...</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Discovery Detail View (inline) ──
  function renderDiscoveryDetail(p: Project) {
    const d = selectedDiscovery!;
    const did = d.discoveryId;

    const tabs = ([
      { value: "overview" as const, label: "Overview", enabled: true },
      { value: "sourcing" as const, label: `Sourcing (${d.phases.sourcing.count})`, enabled: d.phases.sourcing.count > 0 },
      { value: "pitches" as const, label: `Pitches (${d.phases.pitches.count})`, enabled: d.phases.pitches.count > 0 },
      { value: "committee" as const, label: "Committee", enabled: d.phases.committee.count > 0 },
      { value: "deliverables" as const, label: "Deliverables", enabled: d.phases.deliverables.memo },
      { value: "dashboard" as const, label: "Dashboard", enabled: d.phases.deliverables.dashboard },
    ]).filter(t => t.enabled);

    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDiscovery(null)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            {"\u2190"} Discoveries
          </button>
          <span className="text-gray-600">|</span>
          <span className="text-xs text-gray-400">{fmtDateTime(d.completedAt)}</span>
          <span className="text-xs text-gray-500">{"\u00B7"}</span>
          <span className="text-xs text-gray-500">{fmtDuration(d.createdAt, d.completedAt)}</span>
          {statusBadge(d.status)}
        </div>

        <h3 className="text-sm font-semibold text-gray-200">{d.focus}</h3>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-700 pb-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setDiscoveryViewTab(tab.value)}
              className={`px-2.5 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
                discoveryViewTab === tab.value
                  ? "bg-gray-700 text-white border-b-2 border-amber-400"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-[200px]">
          {discoveryViewTab === "overview" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Deal Sourcing", done: d.phases.sourcing.count > 0, detail: `${d.phases.sourcing.count} reports` },
                  { label: "Pitches", done: d.phases.pitches.count > 0, detail: `${d.phases.pitches.count} pitched` },
                  { label: "IC Challenge", done: d.phases.committee.count > 0, detail: d.phases.committee.count > 0 ? "Reviewed" : "\u2014" },
                  { label: "Dashboard", done: d.phases.deliverables.dashboard, detail: d.phases.deliverables.dashboard ? "Built" : "\u2014" },
                  { label: "Memo", done: d.phases.deliverables.memo, detail: d.phases.deliverables.memo ? "Written" : "\u2014" },
                ].map(phase => (
                  <div key={phase.label} className={`p-2 rounded-lg border text-xs ${
                    phase.done ? "bg-amber-500/5 border-amber-500/30" : "bg-gray-800/50 border-gray-700"
                  }`}>
                    <div className="flex items-center gap-1">
                      <span>{phase.done ? "\u2705" : "\u2B1C"}</span>
                      <span className={phase.done ? "text-amber-400" : "text-gray-500"}>{phase.label}</span>
                    </div>
                    <div className="text-gray-500 mt-0.5">{phase.detail}</div>
                  </div>
                ))}
              </div>
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2.5 text-xs text-gray-400">
                <span className="text-gray-200 font-medium">{d.files.length}</span> artifacts archived
                {d.phases.deliverables.dashboard && (
                  <button onClick={() => setDiscoveryViewTab("dashboard")} className="ml-3 text-amber-400 hover:text-amber-300 transition-colors">
                    View Dashboard {"\u2192"}
                  </button>
                )}
                {d.phases.deliverables.memo && (
                  <button onClick={() => setDiscoveryViewTab("deliverables")} className="ml-3 text-amber-400 hover:text-amber-300 transition-colors">
                    Read Memo {"\u2192"}
                  </button>
                )}
              </div>
            </div>
          )}

          {discoveryViewTab === "sourcing" && (
            <div className="space-y-3">
              {d.phases.sourcing.files.map(file => {
                const key = `disc:${did}/${file}`;
                const content = discoveryFileContent[key];
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

          {discoveryViewTab === "pitches" && (
            <div className="space-y-3">
              {d.phases.pitches.files.map(file => {
                const key = `disc:${did}/${file}`;
                const content = discoveryFileContent[key];
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

          {discoveryViewTab === "committee" && (
            <div className="space-y-3">
              {d.phases.committee.files.map(file => {
                const key = `disc:${did}/${file}`;
                const content = discoveryFileContent[key];
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

          {discoveryViewTab === "deliverables" && (
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
                    Download PPT
                  </button>
                </div>
              )}
              {d.phases.deliverables.memo && (() => {
                const key = `disc:${did}/investment-memo.md`;
                const content = discoveryFileContent[key];
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

          {discoveryViewTab === "dashboard" && (
            <div>
              {discoveryDashError && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300 mb-3">
                  Compile error: {discoveryDashError}
                </div>
              )}
              {DiscoveryDashComp && (
                <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                  <DiscoveryDashComp data={{ tool: "discovery_dashboard" }} onAction={() => {}} />
                </div>
              )}
              {!DiscoveryDashComp && !discoveryDashError && (
                <div className="text-center py-8 text-gray-500 text-xs">Loading dashboard...</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
