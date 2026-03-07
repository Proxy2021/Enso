var action = (params.action || "").trim() || "view";
var day = (params.day || "").trim();
var slot = (params.slot || "").trim();
var recipe = (params.recipe || "").trim();
var servings = typeof params.servings === "number" ? params.servings : 2;
var diet = (params.diet || "").trim() || "balanced";
var mealSlotsParam = (params.mealSlots || "").trim();
var mealSlots = mealSlotsParam ? mealSlotsParam.split(",").map(function(s) { return s.trim(); }) : ["breakfast", "lunch", "dinner", "snacks"];

var STORE_KEY = "meal_plan";
var stored = await ctx.store.get(STORE_KEY);
var plan = (stored && stored.plan) ? stored.plan : {};
var storedServings = (stored && stored.servings) ? stored.servings : servings;
var storedSlots = (stored && stored.mealSlots) ? stored.mealSlots : mealSlots;

var days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

if (action === "generate") {
  var prompt = "Generate a 7-day " + diet + " meal plan for " + servings + " servings. ";
  prompt += "For each day (" + days.join(", ") + "), provide meals for these slots: " + mealSlots.join(", ") + ". ";
  prompt += "Return ONLY a valid JSON object where keys are day names, and each day has keys for each meal slot. ";
  prompt += "Each meal slot value should be an object with: name (string), calories (number for 1 serving), protein (number in grams), carbs (number in grams), fat (number in grams). ";
  prompt += "Example: {\"Monday\":{\"breakfast\":{\"name\":\"Oatmeal\",\"calories\":350,\"protein\":12,\"carbs\":55,\"fat\":10}}}";

  var result = await ctx.ask(prompt);
  var newPlan = {};
  if (result.ok && result.text) {
    try {
      var jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        newPlan = JSON.parse(jsonMatch[0]);
      }
    } catch(e) { /* fallback to empty */ }
  }

  if (Object.keys(newPlan).length === 0) {
    newPlan = {};
    days.forEach(function(d) {
      newPlan[d] = {};
      mealSlots.forEach(function(s) {
        newPlan[d][s] = { name: "", calories: 0, protein: 0, carbs: 0, fat: 0 };
      });
    });
  }

  plan = newPlan;
  storedServings = servings;
  storedSlots = mealSlots;
  await ctx.store.set(STORE_KEY, { plan: plan, servings: storedServings, mealSlots: storedSlots });
} else if (action === "assign" && day && slot) {
  if (!plan[day]) plan[day] = {};
  if (recipe) {
    var mealPrompt = "For a recipe called '" + recipe + "' for " + storedServings + " servings, estimate the nutritional info per serving. Return ONLY a JSON object with: name, calories, protein, carbs, fat (numbers). Example: {\"name\":\"" + recipe + "\",\"calories\":400,\"protein\":25,\"carbs\":40,\"fat\":15}";
    var mealResult = await ctx.ask(mealPrompt);
    var mealData = { name: recipe, calories: 0, protein: 0, carbs: 0, fat: 0 };
    if (mealResult.ok && mealResult.text) {
      try {
        var mj = mealResult.text.match(/\{[\s\S]*?\}/);
        if (mj) mealData = JSON.parse(mj[0]);
      } catch(e) { mealData.name = recipe; }
    }
    plan[day][slot] = mealData;
  } else {
    var suggestPrompt = "Suggest one " + slot + " recipe for a " + diet + " diet. Return ONLY a JSON object with: name, calories, protein, carbs, fat. Keep it realistic.";
    var suggestResult = await ctx.ask(suggestPrompt);
    var suggested = { name: "Suggested Meal", calories: 400, protein: 20, carbs: 45, fat: 15 };
    if (suggestResult.ok && suggestResult.text) {
      try {
        var sj = suggestResult.text.match(/\{[\s\S]*?\}/);
        if (sj) suggested = JSON.parse(sj[0]);
      } catch(e) { /* use default */ }
    }
    plan[day][slot] = suggested;
  }
  await ctx.store.set(STORE_KEY, { plan: plan, servings: storedServings, mealSlots: storedSlots });
} else if (action === "remove" && day && slot) {
  if (plan[day]) {
    plan[day][slot] = { name: "", calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
  await ctx.store.set(STORE_KEY, { plan: plan, servings: storedServings, mealSlots: storedSlots });
}

var now = new Date();
var dayOfWeek = now.getDay();
var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
var monday = new Date(now);
monday.setDate(now.getDate() + mondayOffset);
var weekStart = monday.toISOString().split("T")[0];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_meal_planner_plan_meals",
      weekStart: weekStart,
      servings: storedServings,
      mealSlots: storedSlots,
      plan: plan
    })
  }]
};
