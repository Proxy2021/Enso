import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

type PlanWeekParams = {
  diet?: "balanced" | "high_protein" | "vegetarian";
  servings?: number;
  budget?: number;
};

type GroceryListParams = {
  diet?: "balanced" | "high_protein" | "vegetarian";
  servings?: number;
};

type SwapMealParams = {
  day: number;
  mealType: "breakfast" | "lunch" | "dinner";
  diet?: "balanced" | "high_protein" | "vegetarian";
};

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function clampServings(servings?: number): number {
  if (typeof servings !== "number" || Number.isNaN(servings)) return 2;
  return Math.max(1, Math.min(8, Math.floor(servings)));
}

function weeklyMeals(diet: PlanWeekParams["diet"], servings: number) {
  const base = diet === "high_protein"
    ? {
        breakfast: "Greek yogurt + berries + granola",
        lunch: "Chicken quinoa bowl",
        dinner: "Salmon, greens, and sweet potato",
      }
    : diet === "vegetarian"
      ? {
          breakfast: "Overnight oats + fruit",
          lunch: "Chickpea veggie wrap",
          dinner: "Tofu stir-fry with brown rice",
        }
      : {
          breakfast: "Egg toast + fruit",
          lunch: "Turkey avocado sandwich",
          dinner: "Grilled fish + vegetables",
        };

  return Array.from({ length: 7 }).map((_, idx) => ({
    day: idx + 1,
    breakfast: `${base.breakfast} (${servings} servings)`,
    lunch: `${base.lunch} (${servings} servings)`,
    dinner: `${base.dinner} (${servings} servings)`,
  }));
}

function planWeek(params: PlanWeekParams): AgentToolResult {
  const diet = params.diet ?? "balanced";
  const servings = clampServings(params.servings);
  const budget = typeof params.budget === "number" && params.budget > 0 ? params.budget : servings * 95;

  return jsonResult({
    tool: "enso_meal_plan_week",
    diet,
    servings,
    weeklyBudget: budget,
    mealPlan: weeklyMeals(diet, servings),
  });
}

function groceryList(params: GroceryListParams): AgentToolResult {
  const diet = params.diet ?? "balanced";
  const servings = clampServings(params.servings);
  const proteins = diet === "vegetarian" ? ["Tofu", "Chickpeas", "Greek yogurt"] : ["Chicken breast", "Salmon", "Eggs"];
  const carbs = ["Brown rice", "Quinoa", "Oats"];
  const produce = ["Spinach", "Bell peppers", "Blueberries"];
  const pantry = ["Olive oil", "Sea salt", "Paprika"];

  return jsonResult({
    tool: "enso_meal_grocery_list",
    diet,
    servings,
    groceryGroups: [
      { group: "Protein", items: proteins },
      { group: "Carbs", items: carbs },
      { group: "Produce", items: produce },
      { group: "Pantry", items: pantry },
    ],
  });
}

function swapMeal(params: SwapMealParams): AgentToolResult {
  const day = Math.max(1, Math.min(7, Math.floor(params.day)));
  const diet = params.diet ?? "balanced";
  const mealType = params.mealType;
  const replacement = diet === "high_protein"
    ? "Lean beef veggie bowl"
    : diet === "vegetarian"
      ? "Lentil pasta with roasted vegetables"
      : "Chicken soba with greens";

  return jsonResult({
    tool: "enso_meal_swap_meal",
    day,
    mealType,
    diet,
    replacement,
    note: "Re-run grocery list to refresh ingredients after swaps.",
  });
}

export function createMealTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_meal_plan_week",
      label: "Meal Plan Week",
      description: "Generate a 7-day meal plan with budget and servings.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          diet: { type: "string", enum: ["balanced", "high_protein", "vegetarian"] },
          servings: { type: "number" },
          budget: { type: "number" },
        },
      },
      execute: async (_callId: string, params: Record<string, unknown>) => planWeek(params as PlanWeekParams),
    } as AnyAgentTool,
    {
      name: "enso_meal_grocery_list",
      label: "Meal Grocery List",
      description: "Generate grocery categories and items for the selected diet.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          diet: { type: "string", enum: ["balanced", "high_protein", "vegetarian"] },
          servings: { type: "number" },
        },
      },
      execute: async (_callId: string, params: Record<string, unknown>) => groceryList(params as GroceryListParams),
    } as AnyAgentTool,
    {
      name: "enso_meal_swap_meal",
      label: "Meal Swap Meal",
      description: "Swap one meal slot with an alternative and return updated guidance.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "number" },
          mealType: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
          diet: { type: "string", enum: ["balanced", "high_protein", "vegetarian"] },
        },
        required: ["day", "mealType"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => swapMeal(params as SwapMealParams),
    } as AnyAgentTool,
  ];
}

export function registerMealTools(api: OpenClawPluginApi): void {
  for (const tool of createMealTools()) {
    api.registerTool(tool);
  }
}

