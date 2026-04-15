// 30-day plan (same as today.js)
var plan = [
  { day: 1, title: "Python environment setup", week: 1, weekLabel: "Environment + Data", category: "setup", estimatedHours: 3 },
  { day: 2, title: "Qlib + LightGBM + DuckDB install", week: 1, weekLabel: "Environment + Data", category: "setup", estimatedHours: 3 },
  { day: 3, title: "Qlib data download — S&P 500", week: 1, weekLabel: "Environment + Data", category: "data", estimatedHours: 3 },
  { day: 4, title: "S&P 500 universe definition", week: 1, weekLabel: "Environment + Data", category: "data", estimatedHours: 2.5 },
  { day: 5, title: "Data quality verification", week: 1, weekLabel: "Environment + Data", category: "data", estimatedHours: 3 },
  { day: 6, title: "Alpha158 feature set activation", week: 1, weekLabel: "Environment + Data", category: "features", estimatedHours: 4 },
  { day: 7, title: "Alpha158 validation & EDA", week: 1, weekLabel: "Environment + Data", category: "features", estimatedHours: 3 },
  { day: 8, title: "First LightGBM model — data split", week: 2, weekLabel: "Features + First Model", category: "model", estimatedHours: 3 },
  { day: 9, title: "First LightGBM model — training", week: 2, weekLabel: "Features + First Model", category: "model", estimatedHours: 4 },
  { day: 10, title: "First model evaluation", week: 2, weekLabel: "Features + First Model", category: "model", estimatedHours: 3 },
  { day: 11, title: "Walk-forward backtest setup", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 4 },
  { day: 12, title: "Walk-forward backtest — tuning", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 3 },
  { day: 13, title: "First backtest run", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 4 },
  { day: 14, title: "Backtest analysis & reporting", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 3 },
  { day: 15, title: "GO/NO-GO Gate #1 — evaluation", week: 3, weekLabel: "Backtest + Validate", category: "gate", estimatedHours: 2 },
  { day: 16, title: "Gate #1 — iteration plan", week: 3, weekLabel: "Backtest + Validate", category: "gate", estimatedHours: 3 },
  { day: 17, title: "Custom features — FCF yield", week: 3, weekLabel: "Backtest + Validate", category: "features", estimatedHours: 3.5 },
  { day: 18, title: "Custom features — earnings momentum", week: 3, weekLabel: "Backtest + Validate", category: "features", estimatedHours: 3.5 },
  { day: 19, title: "Custom features — analyst revisions", week: 3, weekLabel: "Backtest + Validate", category: "features", estimatedHours: 3 },
  { day: 20, title: "Random Forest model", week: 3, weekLabel: "Backtest + Validate", category: "model", estimatedHours: 4 },
  { day: 21, title: "Ensemble configuration", week: 3, weekLabel: "Backtest + Validate", category: "model", estimatedHours: 3 },
  { day: 22, title: "Transaction cost model", week: 4, weekLabel: "Ensemble + Polish", category: "backtest", estimatedHours: 3.5 },
  { day: 23, title: "Full ensemble backtest with costs", week: 4, weekLabel: "Ensemble + Polish", category: "backtest", estimatedHours: 4 },
  { day: 24, title: "Backtest robustness checks", week: 4, weekLabel: "Ensemble + Polish", category: "backtest", estimatedHours: 3 },
  { day: 25, title: "SHAP explainability integration", week: 4, weekLabel: "Ensemble + Polish", category: "analysis", estimatedHours: 3.5 },
  { day: 26, title: "SHAP analysis & documentation", week: 4, weekLabel: "Ensemble + Polish", category: "analysis", estimatedHours: 3 },
  { day: 27, title: "Results documentation", week: 4, weekLabel: "Ensemble + Polish", category: "docs", estimatedHours: 3 },
  { day: 28, title: "Results analysis & review", week: 4, weekLabel: "Ensemble + Polish", category: "docs", estimatedHours: 2.5 },
  { day: 29, title: "GO/NO-GO Gate #2 — evaluation", week: 4, weekLabel: "Ensemble + Polish", category: "gate", estimatedHours: 2 },
  { day: 30, title: "Phase 2 planning", week: 4, weekLabel: "Ensemble + Polish", category: "planning", estimatedHours: 3 }
];

// Load state
var state = await ctx.store.get("activation_state");
if (!state) {
  state = { startDate: null, currentDay: 1, checkins: {}, streak: 0, lastCheckinDate: null };
}

// Build weeks
var weekMap = {};
for (var i = 0; i < plan.length; i++) {
  var item = plan[i];
  var wk = item.week;
  if (!weekMap[wk]) {
    weekMap[wk] = { number: wk, label: item.weekLabel, days: [] };
  }
  var checkin = state.checkins[String(item.day)];
  var status = "upcoming";
  if (checkin) {
    status = checkin.status; // done, partial, blocked
  }
  // Determine current active day
  var isCurrentDay = false;
  var foundCurrent = false;
  for (var c = 1; c <= 30; c++) {
    var cc = state.checkins[String(c)];
    if (!cc || cc.status !== "done") {
      if (c === item.day) isCurrentDay = true;
      foundCurrent = true;
      break;
    }
  }
  if (isCurrentDay) status = "today";

  weekMap[wk].days.push({
    day: item.day,
    title: item.title,
    status: status,
    category: item.category,
    estimatedHours: item.estimatedHours,
    actualHours: checkin ? checkin.hoursSpent : null,
    notes: checkin ? checkin.notes : null
  });
}

var weeks = [];
for (var w = 1; w <= 4; w++) {
  if (weekMap[w]) weeks.push(weekMap[w]);
}

// Stats
var daysCompleted = 0;
var totalPlannedHours = 0;
var totalActualHours = 0;
for (var j = 1; j <= 30; j++) {
  totalPlannedHours += plan[j - 1].estimatedHours;
  var ch = state.checkins[String(j)];
  if (ch && ch.status === "done") {
    daysCompleted++;
    if (ch.hoursSpent) totalActualHours += ch.hoursSpent;
  }
}

// Current day
var currentDay = 1;
for (var d = 1; d <= 30; d++) {
  var ci = state.checkins[String(d)];
  if (!ci || ci.status !== "done") {
    currentDay = d;
    break;
  }
  if (d === 30) currentDay = 30;
}

// Streak
var streak = 0;
for (var s = currentDay - 1; s >= 1; s--) {
  var sc = state.checkins[String(s)];
  if (sc && sc.status === "done") {
    streak++;
  } else {
    break;
  }
}

// Velocity
var plannedSoFar = 0;
for (var v = 0; v < daysCompleted; v++) {
  plannedSoFar += plan[v].estimatedHours;
}
var velocityRatio = plannedSoFar > 0 ? Math.round((totalActualHours / plannedSoFar) * 100) / 100 : 1.0;

// Estimated completion
var remainingDays = 30 - daysCompleted;
var avgDaysPerTask = daysCompleted > 0 ? (daysCompleted) : 1;
var startDate = state.startDate || new Date().toISOString().split("T")[0];
var daysSinceStart = Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000));
var daysPerCompletion = daysCompleted > 0 ? daysSinceStart / daysCompleted : 1;
var estRemainingCalDays = Math.ceil(remainingDays * daysPerCompletion);
var estCompletion = new Date(Date.now() + estRemainingCalDays * 86400000).toISOString().split("T")[0];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_activation_progress",
      totalDays: 30,
      daysCompleted: daysCompleted,
      currentDay: currentDay,
      streak: streak,
      percentComplete: Math.round((daysCompleted / 30) * 100),
      weeks: weeks,
      velocity: {
        plannedHours: plannedSoFar,
        actualHours: totalActualHours,
        ratio: velocityRatio
      },
      totalPlannedHours: totalPlannedHours,
      totalActualHours: totalActualHours,
      estimatedCompletion: estCompletion,
      startDate: startDate
    })
  }]
};
