var action = (params.action || "").trim() || "view";
var TARGETS_KEY = "nutrition_targets";

var targets = await ctx.store.get(TARGETS_KEY);
if (!targets) {
  targets = { calories: 2000, protein: 50, carbs: 250, fat: 65 };
}

if (action === "set_targets") {
  if (typeof params.calorieTarget === "number") targets.calories = params.calorieTarget;
  if (typeof params.proteinTarget === "number") targets.protein = params.proteinTarget;
  if (typeof params.carbsTarget === "number") targets.carbs = params.carbsTarget;
  if (typeof params.fatTarget === "number") targets.fat = params.fatTarget;
  await ctx.store.set(TARGETS_KEY, targets);
}

var stored = await ctx.store.get("meal_plan");
var plan = (stored && stored.plan) ? stored.plan : {};
var planServings = (stored && stored.servings) ? stored.servings : 1;
var days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

var daily = [];
var totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
var daysWithData = 0;

days.forEach(function(day) {
  var dayPlan = plan[day] || {};
  var dayCal = 0, dayProtein = 0, dayCarbs = 0, dayFat = 0;

  Object.keys(dayPlan).forEach(function(slot) {
    var meal = dayPlan[slot];
    if (meal && meal.name) {
      dayCal += (meal.calories || 0) * planServings;
      dayProtein += (meal.protein || 0) * planServings;
      dayCarbs += (meal.carbs || 0) * planServings;
      dayFat += (meal.fat || 0) * planServings;
    }
  });

  daily.push({
    day: day,
    calories: dayCal,
    protein: dayProtein,
    carbs: dayCarbs,
    fat: dayFat
  });

  if (dayCal > 0) {
    daysWithData++;
    totalCal += dayCal;
    totalProtein += dayProtein;
    totalCarbs += dayCarbs;
    totalFat += dayFat;
  }
});

var divisor = daysWithData > 0 ? daysWithData : 1;
var weeklyAvg = {
  calories: Math.round(totalCal / divisor),
  protein: Math.round(totalProtein / divisor),
  carbs: Math.round(totalCarbs / divisor),
  fat: Math.round(totalFat / divisor)
};

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_meal_planner_track_nutrition",
      targets: targets,
      daily: daily,
      weeklyAvg: weeklyAvg
    })
  }]
};
