import type { ToolTemplate } from "../registry.js";

export function isWorkspaceSignature(signatureId: string): boolean {
  return signatureId === "workspace_inventory";
}

export function getWorkspaceTemplateCode(_signature: ToolTemplate): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const repos = Array.isArray(data?.repos) ? data.repos : Array.isArray(data?.rows) ? data.rows : [];
  const tools = Array.isArray(data?.found) ? data.found : [];
  const extStats = Array.isArray(data?.extensionStats) ? data.extensionStats : [];
  const folderStats = Array.isArray(data?.folderStats) ? data.folderStats : [];
  const [tab, setTab] = useState("repos");
  const rootPath = String(data?.path ?? ".");
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Tool mode</div>
          <div className="text-sm font-semibold text-gray-100">Workspace Studio</div>
          <div className="text-[11px] text-gray-500 truncate">{rootPath}</div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Refresh</button>
          <button onClick={() => onAction("detect_dev_tools", {})} className="px-2.5 py-1 text-xs rounded-full bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/45 cursor-pointer">Detect Tools</button>
        </div>
      </div>
      <div className="flex gap-1.5">
        {["repos","tools","overview"].map((name) => (
          <button key={name} onClick={() => setTab(name)} className={\`px-2.5 py-1 text-xs rounded-md border \${tab === name ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>{name}</button>
        ))}
      </div>
      {tab === "repos" && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {repos.slice(0, 16).map((repo, idx) => (
            <button key={idx} onClick={() => onAction("project_overview", { path: String(repo?.path ?? "") })} className="w-full text-left bg-gray-800 border border-gray-600/50 rounded-md px-2.5 py-2 hover:bg-gray-700/60 cursor-pointer">
              <div className="text-xs text-gray-100">{String(repo?.name ?? "Repo")}</div>
              <div className="text-[11px] text-gray-500 truncate">{String(repo?.path ?? "")}</div>
            </button>
          ))}
        </div>
      )}
      {tab === "tools" && (
        <div className="grid grid-cols-2 gap-1.5">
          {tools.slice(0, 20).map((tool, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5">
              <div className="text-xs text-gray-100">{String(tool?.name ?? "tool")}</div>
              <div className="text-[11px] text-gray-500 truncate">{String(tool?.path ?? "")}</div>
            </div>
          ))}
        </div>
      )}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2">
            <div className="text-xs text-gray-300">Top Extensions</div>
            <div className="space-y-1 mt-1">
              {extStats.slice(0, 6).map((row, idx) => (
                <div key={idx} className="text-[11px] text-gray-400">{String(row?.ext ?? "")}: {String(row?.count ?? 0)}</div>
              ))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2">
            <div className="text-xs text-gray-300">Top Folders</div>
            <div className="space-y-1 mt-1">
              {folderStats.slice(0, 6).map((row, idx) => (
                <div key={idx} className="text-[11px] text-gray-400">{String(row?.name ?? "")}: {String(row?.count ?? 0)}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`;
}
