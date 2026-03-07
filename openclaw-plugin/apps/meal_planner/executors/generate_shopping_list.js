var subtractPantry = params.subtractPantry !== false;
var deptParam = (params.departments || "").trim();
var departmentNames = deptParam ? deptParam.split(",").map(function(s) { return s.trim(); }) : ["Produce", "Dairy", "Meat", "Pantry", "Frozen", "Bakery", "Beverages", "Other"];

var stored = await ctx.store.get("meal_plan");
var plan = (stored && stored.plan) ? stored.plan : {};

var pantryItems = [];
if (subtractPantry) {
  var pantryData = await ctx.store.get("pantry");
  pantryItems = (pantryData && pantryData.items) ? pantryData.items : [];
}

var days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
var mealNames = [];
days.forEach(function(day) {
  var dayPlan = plan[day] || {};
  Object.keys(dayPlan).forEach(function(slot) {
    var meal = dayPlan[slot];
    if (meal && meal.name) {
      mealNames.push(meal.name);
    }
  });
});

if (mealNames.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_meal_planner_generate_shopping_list",
        totalItems: 0,
        subtractedPantry: 0,
        departments: [],
        error: "No meals planned yet. Generate a meal plan first."
      })
    }]
  };
}

var pantryNames = pantryItems.map(function(p) { return p.name.toLowerCase(); });
var pantryList = pantryNames.join(", ");

var prompt = "Given these meals for the week: " + mealNames.join(", ") + ". ";
prompt += "Generate a consolidated shopping list with all ingredients needed. Merge duplicate ingredients (e.g., if 2 recipes need onions, combine the quantities). ";
prompt += "Categorize each item into one of these departments: " + departmentNames.join(", ") + ". ";
prompt += "Return ONLY a valid JSON object with this structure: {\"departments\":[{\"name\":\"Produce\",\"items\":[{\"name\":\"Onion\",\"quantity\":\"3\",\"unit\":\"pcs\"}]}]}";
prompt += " Include quantity and unit for every item. Be realistic about quantities for a week of meals.";

var result = await ctx.ask(prompt);
var departments = [];
var subtractedCount = 0;

if (result.ok && result.text) {
  try {
    var jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      var parsed = JSON.parse(jsonMatch[0]);
      departments = parsed.departments || [];
    }
  } catch(e) { /* fallback */ }
}

if (subtractPantry && pantryItems.length > 0) {
  departments = departments.map(function(dept) {
    var filtered = (dept.items || []).filter(function(item) {
      var itemLower = item.name.toLowerCase();
      var inPantry = pantryNames.some(function(p) { return itemLower.includes(p) || p.includes(itemLower); });
      if (inPantry) subtractedCount++;
      return !inPantry;
    });
    return { name: dept.name, items: filtered };
  }).filter(function(dept) { return dept.items.length > 0; });
}

var totalItems = 0;
departments.forEach(function(dept) { totalItems += (dept.items || []).length; });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_meal_planner_generate_shopping_list",
      totalItems: totalItems,
      subtractedPantry: subtractedCount,
      departments: departments
    })
  }]
};
