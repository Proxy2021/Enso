var tripId = (params.tripId || "").trim();
var destination = (params.destination || "").trim();
var totalBudget = typeof params.totalBudget === "number" ? params.totalBudget : 0;
var currency = (params.currency || "").trim() || "USD";
var travelers = typeof params.travelers === "number" ? params.travelers : 1;
var duration = typeof params.duration === "number" ? params.duration : 7;

if (!destination) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_trip_planner_budget",
        error: "No destination specified. Please provide a destination."
      })
    }]
  };
}

// Try loading existing budget from store
var storeKey = "budget_" + (tripId || destination.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase());
var existing = await ctx.store.get(storeKey);

if (existing) {
  if (typeof existing === "string") {
    try { existing = JSON.parse(existing); } catch(e) { existing = null; }
  }
  if (existing && existing.categories) {
    // Update total budget if provided
    if (totalBudget > 0) existing.totalBudget = totalBudget;
    if (currency) existing.currency = currency;
    existing.tool = "enso_trip_planner_budget";
    return { content: [{ type: "text", text: JSON.stringify(existing) }] };
  }
}

// Generate budget breakdown via LLM
var prompt = "Create a travel budget breakdown for " + destination + ".\n";
prompt += "Duration: " + duration + " days, " + travelers + " traveler(s).\n";
if (totalBudget > 0) prompt += "Total budget: " + totalBudget + " " + currency + ".\n";
prompt += "\nReturn JSON with:\n";
prompt += "- totalBudget: number (estimated if not given)\n";
prompt += "- totalSpent: 0\n";
prompt += "- categories: array of {name, budgeted (number), spent (number starting at 0)}\n";
prompt += "Categories should include: Flights, Accommodation, Food & Dining, Activities, Transport, Shopping, Insurance & Misc\n";
prompt += "- expenses: empty array []\n";
prompt += "Make budgeted amounts realistic for " + destination + " in " + currency + ".\n";
prompt += "Return ONLY valid JSON, no markdown.";

var result = await ctx.ask(prompt);
var budgetData = {};
if (result.ok && result.text) {
  try {
    var cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    budgetData = JSON.parse(cleaned);
  } catch(e) {
    budgetData = {};
  }
}

var output = {
  tool: "enso_trip_planner_budget",
  tripId: tripId || "",
  destination: destination,
  currency: currency,
  totalBudget: budgetData.totalBudget || totalBudget || 3000,
  totalSpent: budgetData.totalSpent || 0,
  categories: Array.isArray(budgetData.categories) ? budgetData.categories : [],
  expenses: Array.isArray(budgetData.expenses) ? budgetData.expenses : []
};

// Save to store
await ctx.store.set(storeKey, output);

return {
  content: [{
    type: "text",
    text: JSON.stringify(output)
  }]
};
