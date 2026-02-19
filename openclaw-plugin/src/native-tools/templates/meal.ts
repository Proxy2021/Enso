import type { ToolTemplate } from "../registry.js";

export function isMealSignature(signatureId: string): boolean {
  return signatureId === "weekly_meal_plan";
}

export function getMealTemplateCode(_signature: ToolTemplate): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const diet = String(data?.diet ?? "balanced");
  const mealPlan = Array.isArray(data?.mealPlan) ? data.mealPlan : Array.isArray(data?.rows) ? data.rows : [];
  const groups = Array.isArray(data?.groceryGroups) ? data.groceryGroups : [];
  const [tab, setTab] = useState("plan");
  const [dayInput, setDayInput] = useState("1");
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Tool mode</div>
          <div className="text-sm font-semibold text-gray-100">Meal Planning Lab</div>
          <div className="text-[11px] text-gray-500 truncate">diet: {diet}</div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Refresh</button>
          <button onClick={() => onAction("grocery_list", { diet })} className="px-2.5 py-1 text-xs rounded-full bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/45 cursor-pointer">Groceries</button>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => setTab("plan")} className={\`px-2.5 py-1 text-xs rounded-md border \${tab === "plan" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Week Plan</button>
        <button onClick={() => setTab("grocery")} className={\`px-2.5 py-1 text-xs rounded-md border \${tab === "grocery" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Grocery</button>
      </div>
      {tab === "plan" ? (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {mealPlan.slice(0, 7).map((day, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2">
              <div className="text-xs text-gray-100 font-medium">Day {String(day?.day ?? idx + 1)}</div>
              <div className="text-[11px] text-gray-400">Breakfast: {String(day?.breakfast ?? "-")}</div>
              <div className="text-[11px] text-gray-400">Lunch: {String(day?.lunch ?? "-")}</div>
              <div className="text-[11px] text-gray-400">Dinner: {String(day?.dinner ?? "-")}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {groups.slice(0, 8).map((g, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5">
              <div className="text-xs text-gray-200">{String(g?.group ?? "group")}</div>
              <div className="text-[11px] text-gray-400 truncate">{Array.isArray(g?.items) ? g.items.join(", ") : ""}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input value={dayInput} onChange={(e) => setDayInput(e.target.value)} className="w-16 bg-gray-800 border border-gray-600/60 rounded-md px-2 py-1 text-xs text-gray-100" />
        <button onClick={() => onAction("swap_meal", { day: Number(dayInput) || 1, mealType: "dinner", diet })} className="px-2.5 py-1.5 text-xs rounded-md bg-emerald-600/30 border border-emerald-500/60 hover:bg-emerald-600/45 cursor-pointer">Swap Dinner</button>
        <button onClick={() => onAction("plan_week", { diet })} className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/45 cursor-pointer">Replan Week</button>
      </div>
    </div>
  );
}`;
}

