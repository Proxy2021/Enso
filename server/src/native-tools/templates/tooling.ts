import type { ToolTemplate } from "../registry.js";

export function isToolingSignature(signatureId: string): boolean {
  return signatureId === "tool_console";
}

export function getToolingTemplateCode(_signature: ToolTemplate): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const [description, setDescription] = useState("");
  const view = String(data?.view ?? "home");
  const families = Array.isArray(data?.families) ? data.families : [];
  const selected = data?.selected && typeof data.selected === "object" ? data.selected : null;
  const templates = Array.isArray(selected?.templates) ? selected.templates : [];
  const tools = Array.isArray(selected?.tools) ? selected.tools : [];
  const creation = data?.creationResult && typeof data.creationResult === "object" ? data.creationResult : null;

  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Tool mode</div>
          <div className="text-sm font-semibold text-gray-100">Enso Tool Console</div>
          <div className="text-[11px] text-gray-500">Browse templates and evolve new tools</div>
        </div>
        {view !== "home" && (
          <button onClick={() => onAction("tooling_back", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Back</button>
        )}
      </div>

      {view === "home" ? (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {families.map((family, idx) => (
            <button key={idx} onClick={() => onAction("view_tool_family", { toolFamily: String(family?.toolFamily ?? "") })} className="w-full text-left bg-gray-800 border border-gray-600/50 rounded-md px-2.5 py-2 hover:bg-gray-700/60 cursor-pointer">
              <div className="text-xs text-gray-100">{String(family?.toolFamily ?? "unknown")}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{String(family?.toolCount ?? 0)} tools • {String(family?.templateCount ?? 0)} templates</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2">
            <div className="text-xs text-gray-100 font-medium">{String(selected?.toolFamily ?? "Unknown Family")}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{String(tools.length)} tools • {String(templates.length)} templates</div>
          </div>
          <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto">
            {templates.map((t, idx) => (
              <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2">
                <div className="text-xs text-gray-100">{String(t?.signatureId ?? "signature")}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">template: {String(t?.templateId ?? "n/a")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-md border border-gray-600/50 p-2 space-y-1.5">
        <div className="text-xs text-gray-200">Add new tool from description</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the tool domain and capabilities..."
          className="w-full min-h-[72px] bg-gray-900 border border-gray-600/60 rounded-md px-2 py-1.5 text-xs text-gray-100 focus:outline-none"
        />
        <div className="flex justify-end">
          <button onClick={() => onAction("tooling_add_tool", { description })} className="px-2.5 py-1.5 text-xs rounded-md bg-indigo-600/35 border border-indigo-500/60 hover:bg-indigo-600/50 cursor-pointer">Add Tool</button>
        </div>
        {creation && (
          <div className="text-[11px] text-gray-300">
            {String(creation?.message ?? "")}
          </div>
        )}
      </div>
    </div>
  );
}`;
}

