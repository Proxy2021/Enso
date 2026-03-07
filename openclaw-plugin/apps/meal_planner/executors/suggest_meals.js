var criteria = (params.criteria || "").trim() || "balanced";
var count = typeof params.count === "number" ? params.count : 5;
var excludeParam = (params.excludeRecipes || "").trim();
var excludeList = excludeParam ? excludeParam.split(",").map(function(s) { return s.trim().toLowerCase(); }) : [];

var pantryData = await ctx.store.get("pantry");
var pantryItems = (pantryData && pantryData.items) ? pantryData.items : [];
var pantryNames = pantryItems.map(function(p) { return p.name; });

var stored = await ctx.store.get("meal_plan");
var plan = (stored && stored.plan) ? stored.plan : {};
var existingMeals = [];
var days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
days.forEach(function(day) {
  var dayPlan = plan[day] || {};
  Object.keys(dayPlan).forEach(function(slot) {
    var meal = dayPlan[slot];
    if (meal && meal.name) existingMeals.push(meal.name);
  });
});

var prompt = "Suggest " + count + " meal recipes";

if (criteria === "pantry" && pantryNames.length > 0) {
  prompt += " that can be made using these pantry ingredients: " + pantryNames.join(", ");
} else if (criteria === "quick") {
  prompt += " that can be prepared in under 30 minutes";
} else if (criteria === "high-protein") {
  prompt += " that are high in protein (30g+ per serving)";
} else if (criteria === "vegetarian") {
  prompt += " that are vegetarian (no meat or fish)";
} else if (criteria === "low-carb") {
  prompt += " that are low in carbohydrates (under 30g carbs per serving)";
} else {
  prompt += " with balanced nutrition";
}

if (existingMeals.length > 0) {
  prompt += ". Avoid repeating these meals already in the plan: " + existingMeals.slice(0, 10).join(", ");
}
if (excludeList.length > 0) {
  prompt += ". Also exclude: " + excludeList.join(", ");
}

prompt += ". Return ONLY a valid JSON array of objects with these fields: name (string), description (string, 1 sentence), prepTime (string like '25 min'), calories (number per serving), protein (number in grams per serving), matchReason (string explaining why this is a good match). ";
prompt += "Make recipes realistic and diverse.";

var result = await ctx.ask(prompt);
var suggestions = [];

if (result.ok && result.text) {
  try {
    var jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    }
  } catch(e) { /* fallback */ }
}

if (suggestions.length === 0) {
  suggestions = [
    { name: "Grilled Chicken Salad", description: "Mixed greens with grilled chicken, cherry tomatoes, and vinaigrette", prepTime: "20 min", calories: 380, protein: 35, matchReason: "Balanced, easy to prepare" },
    { name: "Vegetable Stir-Fry", description: "Seasonal vegetables with tofu in garlic soy sauce over rice", prepTime: "25 min", calories: 420, protein: 18, matchReason: "Quick, nutritious, customizable" },
    { name: "Salmon & Asparagus", description: "Baked salmon with roasted asparagus and lemon butter", prepTime: "30 min", calories: 480, protein: 40, matchReason: "High protein, omega-3 rich" }
  ];
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_meal_planner_suggest_meals",
      criteria: criteria,
      suggestions: suggestions.slice(0, count)
    })
  }]
};
