import type { ToolTemplate } from "../registry.js";

export function isSystemAutoSignature(signatureId: string): boolean {
  return signatureId.startsWith("system_auto_");
}

function titleFromSignature(signature: ToolTemplate): string {
  return signature.toolFamily.replace(/^system_/, "").replace(/_/g, " ");
}

export function getSystemAutoTemplateCode(signature: ToolTemplate): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const title = "${titleFromSignature(signature)}";
  const rows = Array.isArray(data?.rows)
    ? data.rows
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.records)
          ? data.records
          : Array.isArray(data?.tools)
            ? data.tools
            : [];
  const keys = rows.length > 0 && rows[0] && typeof rows[0] === "object"
    ? Object.keys(rows[0]).slice(0, 4)
    : [];
  const actions = ${JSON.stringify(signature.supportedActions.filter((a) => a !== "refresh"))};

  const label = (row, idx) => {
    if (!row || typeof row !== "object") return "Row " + (idx + 1);
    return String(
      row.name
      ?? row.title
      ?? row.id
      ?? row.path
      ?? row.key
      ?? row.ticker
      ?? ("Row " + (idx + 1))
    );
  };

  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Tool mode</div>
          <div className="text-sm font-semibold text-gray-100 capitalize">{title} · System Toolkit</div>
          <div className="text-[11px] text-gray-500">{String(data?.path ?? data?.scope ?? data?.source ?? "runtime-registered tools")}</div>
        </div>
        <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">
          Refresh
        </button>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {actions.slice(0, 6).map((action) => (
            <button
              key={action}
              onClick={() => onAction(action, {})}
              className="px-2.5 py-1 text-xs rounded-md bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/45 cursor-pointer"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {rows.slice(0, 24).map((row, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2">
              <div className="text-xs text-gray-100">{label(row, idx)}</div>
              {keys.length > 0 && (
                <div className="mt-1 text-[11px] text-gray-400">
                  {keys.map((k) => (
                    <div key={k} className="truncate">{k}: {String(row?.[k] ?? "")}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2 text-xs text-gray-400">
          No structured rows detected yet. Use actions above to fetch data from this tool family.
        </div>
      )}
    </div>
  );
}`;
}

