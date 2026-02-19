import type { ToolTemplate } from "../registry.js";

export function isTravelSignature(signatureId: string): boolean {
  return signatureId === "itinerary_board";
}

export function getTravelTemplateCode(_signature: ToolTemplate): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const destination = String(data?.destination ?? "Trip");
  const itinerary = Array.isArray(data?.itinerary) ? data.itinerary : Array.isArray(data?.rows) ? data.rows : [];
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const [tab, setTab] = useState("itinerary");
  const [dayInput, setDayInput] = useState("1");
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Tool mode</div>
          <div className="text-sm font-semibold text-gray-100">Travel Planner Studio</div>
          <div className="text-[11px] text-gray-500 truncate">{destination}</div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Refresh</button>
          <button onClick={() => onAction("budget_breakdown", { destination })} className="px-2.5 py-1 text-xs rounded-full bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/45 cursor-pointer">Budget</button>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => setTab("itinerary")} className={\`px-2.5 py-1 text-xs rounded-md border \${tab === "itinerary" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Itinerary</button>
        <button onClick={() => setTab("budget")} className={\`px-2.5 py-1 text-xs rounded-md border \${tab === "budget" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Budget</button>
      </div>
      {tab === "itinerary" ? (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {itinerary.slice(0, 10).map((day, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2">
              <div className="text-xs text-gray-100 font-medium">Day {String(day?.day ?? idx + 1)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">AM: {String(day?.morning ?? "-")}</div>
              <div className="text-[11px] text-gray-400">PM: {String(day?.afternoon ?? "-")}</div>
              <div className="text-[11px] text-gray-400">Eve: {String(day?.evening ?? "-")}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {categories.slice(0, 8).map((row, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5 flex items-center justify-between">
              <div className="text-xs text-gray-200">{String(row?.category ?? "Category")}</div>
              <div className="text-[11px] text-gray-400">{String(row?.amount ?? 0)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input value={dayInput} onChange={(e) => setDayInput(e.target.value)} className="w-16 bg-gray-800 border border-gray-600/60 rounded-md px-2 py-1 text-xs text-gray-100" />
        <button onClick={() => onAction("optimize_day", { destination, dayIndex: Number(dayInput) || 1, pace: "normal" })} className="px-2.5 py-1.5 text-xs rounded-md bg-emerald-600/30 border border-emerald-500/60 hover:bg-emerald-600/45 cursor-pointer">Optimize Day</button>
        <button onClick={() => onAction("plan_trip", { destination, days: Math.max(itinerary.length, 5) })} className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/45 cursor-pointer">Rebuild Plan</button>
      </div>
    </div>
  );
}`;
}

