var taskRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks");
var tasks = taskRes.ok && Array.isArray(taskRes.data) ? taskRes.data : [];

var taskScores = [];
var risks = [];
var recommendations = [];

for (var i = 0; i < tasks.length; i++) {
  var t = tasks[i];
  var runsRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks/" + encodeURIComponent(t.taskId) + "/runs?count=10");
  var runs = runsRes.ok && Array.isArray(runsRes.data) ? runsRes.data : [];

  var successes = 0;
  var failures = 0;
  var durations = [];
  for (var j = 0; j < runs.length; j++) {
    if (runs[j].status === "success") successes++;
    else failures++;
    if (runs[j].durationMs > 0) durations.push(runs[j].durationMs);
  }

  var reliability = runs.length > 0 ? Math.round((successes / runs.length) * 100) : 100;
  var consecutivePenalty = Math.min((t.consecutiveFailures || 0) * 15, 45);
  var taskScore = Math.max(reliability - consecutivePenalty, 0);
  if (!t.enabled && (t.consecutiveFailures || 0) >= 3) taskScore = 0;

  var status = taskScore >= 80 ? "healthy" : taskScore >= 50 ? "at-risk" : taskScore > 0 ? "degraded" : "broken";

  var avgDuration = durations.length > 0 ? Math.round(durations.reduce(function(s, d) { return s + d; }, 0) / durations.length) : 0;

  taskScores.push({
    taskId: t.taskId,
    name: t.name,
    score: taskScore,
    status: status,
    enabled: t.enabled,
    reliability: reliability,
    consecutiveFailures: t.consecutiveFailures || 0,
    avgDurationMs: avgDuration,
    runCount: runs.length,
    lastRunStatus: t.lastRunStatus || "never_run"
  });

  if (taskScore < 50 && t.enabled) {
    var lastErr = "";
    for (var k = runs.length - 1; k >= 0; k--) {
      if (runs[k].error) { lastErr = runs[k].error; break; }
    }
    risks.push({
      level: taskScore === 0 ? "critical" : taskScore < 30 ? "high" : "medium",
      taskId: t.taskId,
      task: t.name,
      reason: (t.consecutiveFailures || 0) + " consecutive failures" + (lastErr ? ". Last error: " + lastErr.slice(0, 100) : ""),
      score: taskScore
    });
  }

  if (!t.enabled && (t.consecutiveFailures || 0) >= 3) {
    risks.push({
      level: "critical",
      taskId: t.taskId,
      task: t.name,
      reason: "Circuit broken — task auto-disabled after " + (t.consecutiveFailures || 0) + " consecutive failures",
      score: 0
    });
  }
}

taskScores.sort(function(a, b) { return a.score - b.score; });
risks.sort(function(a, b) {
  var order = { critical: 0, high: 1, medium: 2, low: 3 };
  return (order[a.level] || 9) - (order[b.level] || 9);
});

var overallScore = taskScores.length > 0
  ? Math.round(taskScores.reduce(function(s, t) { return s + t.score; }, 0) / taskScores.length)
  : 100;
var healthLevel = overallScore >= 90 ? "excellent" : overallScore >= 70 ? "good" : overallScore >= 50 ? "fair" : overallScore >= 30 ? "degraded" : "critical";

var circuitBroken = taskScores.filter(function(t) { return t.status === "broken"; });
var atRisk = taskScores.filter(function(t) { return t.status === "at-risk" || t.status === "degraded"; });

if (circuitBroken.length > 0) {
  recommendations.push("URGENT: " + circuitBroken.length + " task(s) circuit-broken — " + circuitBroken.map(function(t) { return "'" + t.name + "'"; }).join(", ") + ". Investigate root cause and re-enable.");
}
if (atRisk.length > 0) {
  for (var m = 0; m < atRisk.length; m++) {
    recommendations.push("Investigate '" + atRisk[m].name + "' — " + atRisk[m].consecutiveFailures + " consecutive failures, reliability at " + atRisk[m].reliability + "%.");
  }
}
var neverRun = taskScores.filter(function(t) { return t.lastRunStatus === "never_run" && t.enabled; });
if (neverRun.length > 0) {
  recommendations.push(neverRun.length + " enabled task(s) have never run: " + neverRun.map(function(t) { return "'" + t.name + "'"; }).join(", ") + ". Verify schedules.");
}
if (risks.length === 0) {
  recommendations.push("All tasks healthy — no immediate action needed.");
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_task_health_health_report",
      overallScore: overallScore,
      healthLevel: healthLevel,
      taskScores: taskScores,
      risks: risks,
      recommendations: recommendations,
      totalTasks: tasks.length,
      checkedAt: Date.now()
    })
  }]
};
