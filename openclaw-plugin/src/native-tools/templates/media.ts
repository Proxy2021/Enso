import type { ToolTemplate } from "../registry.js";

export function isMediaSignature(signatureId: string): boolean {
  return signatureId === "media_gallery";
}

export function getMediaTemplateCode(_signature: ToolTemplate): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.rows)
      ? data.rows
      : [];
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const [tab, setTab] = useState("gallery");
  const currentPath = String(data?.path ?? ".");
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Tool mode</div>
          <div className="text-sm font-semibold text-gray-100">Media Library Explorer</div>
          <div className="text-[11px] text-gray-500 truncate">{currentPath}</div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Refresh</button>
          <button onClick={() => onAction("group_by_type", { path: currentPath })} className="px-2.5 py-1 text-xs rounded-full bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/45 cursor-pointer">Group</button>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => setTab("gallery")} className={\`px-2.5 py-1 text-xs rounded-md border \${tab === "gallery" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Gallery</button>
        <button onClick={() => setTab("types")} className={\`px-2.5 py-1 text-xs rounded-md border \${tab === "types" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Types</button>
      </div>
      {tab === "gallery" ? (
        <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
          {items.slice(0, 20).map((item, idx) => (
            <button key={idx} onClick={() => onAction("inspect_file", { path: String(item?.path ?? "") })} className="text-left bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2 hover:bg-gray-700/60 cursor-pointer">
              <div className="text-xs text-gray-100 truncate">{String(item?.name ?? "media")}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{String(item?.type ?? "unknown")} • {String(item?.ext ?? "")}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {groups.slice(0, 8).map((group, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5 flex items-center justify-between">
              <div className="text-xs text-gray-200">{String(group?.type ?? "unknown")}</div>
              <div className="text-[11px] text-gray-400">{String(group?.count ?? 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}`;
}
