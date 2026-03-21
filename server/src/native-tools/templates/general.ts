import type { ToolTemplate } from "../registry.js";

const GENERAL_SIGNATURES = new Set(["smart_text_card"]);

export function isGeneralSignature(signatureId: string): boolean {
  return GENERAL_SIGNATURES.has(signatureId);
}

function smartTextCardTemplate(): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const summary = String(data?.summary ?? "");
  const sections = Array.isArray(data?.sections) ? data.sections : [];

  const TableView = ({ table }) => {
    const headers = Array.isArray(table?.headers) ? table.headers : [];
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    if (headers.length === 0 && rows.length === 0) return null;
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-600/50">
        <table className="w-full text-xs">
          {headers.length > 0 && (
            <thead>
              <tr className="bg-gray-800 border-b border-gray-600/60">
                {headers.map((h, i) => (
                  <th key={i} className="px-2.5 py-1.5 text-left text-[11px] font-semibold text-gray-300 uppercase tracking-wide whitespace-nowrap">{String(h)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-gray-900" : "bg-gray-800/40"}>
                {(Array.isArray(row) ? row : []).map((cell, cIdx) => (
                  <td key={cIdx} className="px-2.5 py-1.5 text-gray-300 whitespace-nowrap">{String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      {summary && (
        <div className="bg-gray-800/60 rounded-lg border border-gray-600/40 px-3 py-2">
          <div className="text-sm text-gray-200 leading-relaxed">{summary}</div>
        </div>
      )}

      {sections.map((section, sIdx) => (
        <div key={sIdx} className="space-y-1.5">
          {section.body && (
            <div className="text-xs text-gray-400 leading-relaxed px-1">{section.body}</div>
          )}
          {section.table && <TableView table={section.table} />}
          {Array.isArray(section.items) && section.items.map((item) => {
            const isQ = Boolean(item?.isQuestion);
            return (
              <button
                key={item.id}
                onClick={() => onAction("send_message", { text: item.text })}
                className={\`w-full text-left rounded-lg border px-3 py-2 cursor-pointer transition-all duration-150 active:scale-[0.99] \${
                  isQ
                    ? "bg-indigo-500/10 border-indigo-500/40 hover:bg-indigo-500/20"
                    : "bg-gray-800 border-gray-600/50 hover:bg-gray-700/60"
                }\`}
              >
                <div className={\`text-xs leading-relaxed \${isQ ? "text-indigo-200" : "text-gray-300"}\`}>
                  {isQ && <span className="text-indigo-400 mr-1.5">?</span>}
                  {String(item?.text ?? "")}
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {sections.length === 0 && !summary && (
        <div className="text-xs text-gray-500 px-1">No content to display.</div>
      )}
    </div>
  );
}`;
}

export function getGeneralTemplateCode(signature: ToolTemplate): string {
  switch (signature.signatureId) {
    case "smart_text_card":
    default:
      return smartTextCardTemplate();
  }
}
