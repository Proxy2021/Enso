import { describe, expect, it } from "vitest";
import { createTravelTools } from "./travel-tools";
import { createMealTools } from "./meal-tools";

function parseText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((x) => x.type === "text")?.text ?? "";
}

describe("travel + meal tools", () => {
  it("travel tools plan trip and budget", async () => {
    const tools = createTravelTools();
    const plan = tools.find((tool) => tool.name === "enso_travel_plan_trip");
    const budget = tools.find((tool) => tool.name === "enso_travel_budget_breakdown");
    const optimize = tools.find((tool) => tool.name === "enso_travel_optimize_day");
    expect(plan && budget && optimize).toBeDefined();

    const planData = JSON.parse(parseText(await plan!.execute("t1", { destination: "Tokyo", days: 5 }))) as Record<string, unknown>;
    expect(planData.tool).toBe("enso_travel_plan_trip");
    expect(Array.isArray(planData.itinerary)).toBe(true);

    const budgetData = JSON.parse(parseText(await budget!.execute("t2", { destination: "Tokyo", days: 5, budget: 2500 }))) as Record<string, unknown>;
    expect(budgetData.tool).toBe("enso_travel_budget_breakdown");
    expect(Array.isArray(budgetData.categories)).toBe(true);

    const optimizeData = JSON.parse(parseText(await optimize!.execute("t3", { destination: "Tokyo", dayIndex: 2 }))) as Record<string, unknown>;
    expect(optimizeData.tool).toBe("enso_travel_optimize_day");
    expect((optimizeData.optimizedPlan as Record<string, unknown>).transportHint).toBeTruthy();
  });

  it("meal tools return weekly plan and grocery list", async () => {
    const tools = createMealTools();
    const plan = tools.find((tool) => tool.name === "enso_meal_plan_week");
    const list = tools.find((tool) => tool.name === "enso_meal_grocery_list");
    const swap = tools.find((tool) => tool.name === "enso_meal_swap_meal");
    expect(plan && list && swap).toBeDefined();

    const planData = JSON.parse(parseText(await plan!.execute("m1", { diet: "high_protein", servings: 2 }))) as Record<string, unknown>;
    expect(planData.tool).toBe("enso_meal_plan_week");
    expect(Array.isArray(planData.mealPlan)).toBe(true);

    const listData = JSON.parse(parseText(await list!.execute("m2", { diet: "balanced" }))) as Record<string, unknown>;
    expect(listData.tool).toBe("enso_meal_grocery_list");
    expect(Array.isArray(listData.groceryGroups)).toBe(true);

    const swapData = JSON.parse(parseText(await swap!.execute("m3", { day: 3, mealType: "dinner" }))) as Record<string, unknown>;
    expect(swapData.tool).toBe("enso_meal_swap_meal");
    expect(swapData.replacement).toBeTruthy();
  });
});

