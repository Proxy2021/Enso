import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

type PlanTripParams = {
  destination: string;
  days?: number;
  budget?: number;
  style?: "balanced" | "adventure" | "relaxed";
};

type OptimizeDayParams = {
  destination: string;
  dayIndex?: number;
  day?: number;
  pace?: "slow" | "normal" | "fast";
};

type BudgetBreakdownParams = {
  destination: string;
  days?: number;
  budget?: number;
};

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function clampDays(days?: number): number {
  if (typeof days !== "number" || Number.isNaN(days)) return 5;
  return Math.max(1, Math.min(14, Math.floor(days)));
}

function planTrip(params: PlanTripParams): AgentToolResult {
  const destination = params.destination?.trim() || "Destination";

  const days = clampDays(params.days);
  const style = params.style ?? "balanced";
  const budget = typeof params.budget === "number" && params.budget > 0 ? params.budget : 2800;

  const itinerary = Array.from({ length: days }).map((_, idx) => ({
    day: idx + 1,
    morning: `Explore ${destination} neighborhood ${idx + 1}`,
    afternoon: style === "adventure"
      ? `Active outdoor route in ${destination}`
      : `Museum and local lunch in ${destination}`,
    evening: style === "relaxed"
      ? `Scenic dinner and early rest`
      : `City highlights and dinner walk`,
    estimatedCost: Math.round((budget / days) * (0.85 + ((idx % 3) * 0.08))),
  }));

  return jsonResult({
    tool: "enso_travel_plan_trip",
    destination,
    days,
    budget,
    style,
    itinerary,
  });
}

function optimizeDay(params: OptimizeDayParams): AgentToolResult {
  const destination = params.destination?.trim() || "Destination";
  const rawDay = params.dayIndex ?? params.day;
  const day = typeof rawDay === "number" && !Number.isNaN(rawDay)
    ? Math.max(1, Math.min(14, Math.floor(rawDay)))
    : 1;
  const pace = params.pace ?? "normal";
  const windows = pace === "slow"
    ? ["Late breakfast", "One primary attraction", "Leisure dinner"]
    : pace === "fast"
      ? ["Early start", "Two attractions + transit", "Night market stop"]
      : ["Balanced breakfast", "Main attraction + backup", "Dinner district"];

  return jsonResult({
    tool: "enso_travel_optimize_day",
    destination,
    day,
    pace,
    optimizedPlan: {
      morningWindow: windows[0],
      afternoonWindow: windows[1],
      eveningWindow: windows[2],
      transportHint: "Use metro + 20 min walking segments for efficiency.",
    },
  });
}

function budgetBreakdown(params: BudgetBreakdownParams): AgentToolResult {
  const destination = params.destination?.trim() || "Destination";
  const days = clampDays(params.days);
  const budget = typeof params.budget === "number" && params.budget > 0 ? params.budget : days * 450;

  const categories = [
    { category: "Lodging", amount: Math.round(budget * 0.42) },
    { category: "Food", amount: Math.round(budget * 0.23) },
    { category: "Transport", amount: Math.round(budget * 0.14) },
    { category: "Activities", amount: Math.round(budget * 0.15) },
    { category: "Buffer", amount: Math.round(budget * 0.06) },
  ];

  return jsonResult({
    tool: "enso_travel_budget_breakdown",
    destination,
    days,
    totalBudget: budget,
    dailyAverage: Math.round(budget / days),
    categories,
  });
}

export function createTravelTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_travel_plan_trip",
      label: "Travel Plan Trip",
      description: "Create a multi-day itinerary plan with budget-aware activities.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          destination: { type: "string" },
          days: { type: "number" },
          budget: { type: "number" },
          style: { type: "string", enum: ["balanced", "adventure", "relaxed"] },
        },
        required: ["destination"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => planTrip(params as PlanTripParams),
    } as AnyAgentTool,
    {
      name: "enso_travel_optimize_day",
      label: "Travel Optimize Day",
      description: "Optimize one itinerary day based on pace preferences.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          destination: { type: "string" },
          dayIndex: { type: "number" },
          pace: { type: "string", enum: ["slow", "normal", "fast"] },
        },
        required: ["destination", "dayIndex"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => optimizeDay(params as OptimizeDayParams),
    } as AnyAgentTool,
    {
      name: "enso_travel_budget_breakdown",
      label: "Travel Budget Breakdown",
      description: "Break a trip budget into categories and daily averages.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          destination: { type: "string" },
          days: { type: "number" },
          budget: { type: "number" },
        },
        required: ["destination"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => budgetBreakdown(params as BudgetBreakdownParams),
    } as AnyAgentTool,
  ];
}

export function registerTravelTools(api: OpenClawPluginApi): void {
  for (const tool of createTravelTools()) {
    api.registerTool(tool);
  }
}

