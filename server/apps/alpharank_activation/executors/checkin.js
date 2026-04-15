var status = (params.status || "").trim();
var notes = (params.notes || "").trim();
var hoursSpent = params.hoursSpent || 0;
var targetDay = params.day || 0;

if (!status || ["done", "partial", "blocked"].indexOf(status) === -1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_activation_checkin",
        success: false,
        error: "Status must be one of: done, partial, blocked"
      })
    }]
  };
}

// Plan titles for reference
var planTitles = [
  "Python environment setup", "Qlib + LightGBM + DuckDB install",
  "Qlib data download — S&P 500", "S&P 500 universe definition",
  "Data quality verification", "Alpha158 feature set activation",
  "Alpha158 validation & EDA", "First LightGBM model — data split",
  "First LightGBM model — training", "First model evaluation",
  "Walk-forward backtest setup", "Walk-forward backtest — tuning",
  "First backtest run", "Backtest analysis & reporting",
  "GO/NO-GO Gate #1 — evaluation", "Gate #1 — iteration plan",
  "Custom features — FCF yield", "Custom features — earnings momentum",
  "Custom features — analyst revisions", "Random Forest model",
  "Ensemble configuration", "Transaction cost model",
  "Full ensemble backtest with costs", "Backtest robustness checks",
  "SHAP explainability integration", "SHAP analysis & documentation",
  "Results documentation", "Results analysis & review",
  "GO/NO-GO Gate #2 — evaluation", "Phase 2 planning"
];

// Load state
var state = await ctx.store.get("activation_state");
if (!state) {
  state = { startDate: new Date().toISOString().split("T")[0], currentDay: 1, checkins: {}, streak: 0, lastCheckinDate: null };
}

// Determine which day to check in for
var currentDay = targetDay;
if (!currentDay) {
  for (var d = 1; d <= 30; d++) {
    var ci = state.checkins[String(d)];
    if (!ci || ci.status !== "done") {
      currentDay = d;
      break;
    }
    if (d === 30) currentDay = 30;
  }
}

if (currentDay < 1 || currentDay > 30) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_activation_checkin",
        success: false,
        error: "Day must be between 1 and 30"
      })
    }]
  };
}

// Record checkin
var today = new Date().toISOString().split("T")[0];
state.checkins[String(currentDay)] = {
  status: status,
  notes: notes,
  hoursSpent: hoursSpent,
  checkinDate: today
};

// Update streak
if (status === "done") {
  state.lastCheckinDate = today;
}

// Compute new streak
var streak = 0;
for (var s = currentDay; s >= 1; s--) {
  var sc = state.checkins[String(s)];
  if (sc && sc.status === "done") {
    streak++;
  } else {
    break;
  }
}
state.streak = streak;

// Determine next day
var nextDay = null;
var nextTitle = null;
if (status === "done" && currentDay < 30) {
  nextDay = currentDay + 1;
  nextTitle = planTitles[nextDay - 1] || "Unknown";
  state.currentDay = nextDay;
} else {
  state.currentDay = currentDay;
}

// Calculate velocity
var totalPlanned = 0;
var totalActual = 0;
var doneCount = 0;
var planHours = [3, 3, 3, 2.5, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3, 2, 3, 3.5, 3.5, 3, 4, 3, 3.5, 4, 3, 3.5, 3, 3, 2.5, 2, 3];
for (var v = 1; v <= 30; v++) {
  var vc = state.checkins[String(v)];
  if (vc && vc.status === "done") {
    doneCount++;
    totalPlanned += planHours[v - 1];
    if (vc.hoursSpent) totalActual += vc.hoursSpent;
  }
}

await ctx.store.set("activation_state", state);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_activation_checkin",
      success: true,
      day: currentDay,
      title: planTitles[currentDay - 1] || "Unknown",
      status: status,
      notes: notes,
      hoursSpent: hoursSpent,
      nextDay: nextDay,
      nextTitle: nextTitle,
      streak: streak,
      daysCompleted: doneCount,
      velocity: {
        planned: Math.round(totalPlanned * 10) / 10,
        actual: Math.round(totalActual * 10) / 10,
        ratio: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) / 100 : 1.0
      }
    })
  }]
};
