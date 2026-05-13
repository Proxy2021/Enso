var res = await ctx.fetch("http://localhost:3001/api/scheduled-tasks");
var tasks = res.ok && Array.isArray(res.data) ? res.data : [];

var enabled = tasks.filter(function(t) { return t.enabled; });
var disabled = tasks.filter(function(t) { return !t.enabled; });

var byStatus = { success: 0, failed: 0, running: 0, timeout: 0, never_run: 0 };
for (var i = 0; i < tasks.length; i++) {
  var s = tasks[i].lastRunStatus;
  if (!s) byStatus.never_run++;
  else if (byStatus[s] !== undefined) byStatus[s]++;
}

var circuitBroken = tasks.filter(function(t) {
  return !t.enabled && (t.consecutiveFailures || 0) >= 3;
}).map(function(t) {
  return { taskId: t.taskId, name: t.name, consecutiveFailures: t.consecutiveFailures || 0, lastFiredAt: t.lastFiredAt };
});

var recentFailures = tasks.filter(function(t) {
  return t.lastRunStatus === "failed" || (t.consecutiveFailures || 0) > 0;
}).map(function(t) {
  return { taskId: t.taskId, name: t.name, lastRunStatus: t.lastRunStatus, consecutiveFailures: t.consecutiveFailures || 0, lastFiredAt: t.lastFiredAt };
}).sort(function(a, b) { return b.consecutiveFailures - a.consecutiveFailures; });

var now = Date.now();
var upcoming = enabled.filter(function(t) { return t.nextFireAt && t.nextFireAt > now; })
  .sort(function(a, b) { return a.nextFireAt - b.nextFireAt; })
  .slice(0, 5)
  .map(function(t) {
    return { taskId: t.taskId, name: t.name, nextFireAt: t.nextFireAt, cron: t.cron || null };
  });

var score = 100;
score -= circuitBroken.length * 20;
score -= recentFailures.length * 5;
score -= byStatus.failed * 3;
score -= byStatus.timeout * 5;
score -= disabled.length * 2;
score = Math.max(Math.round(score), 0);

var healthLevel = score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : score >= 30 ? "degraded" : "critical";

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_task_health_overview",
      totalTasks: tasks.length,
      enabled: enabled.length,
      disabled: disabled.length,
      healthScore: score,
      healthLevel: healthLevel,
      byStatus: byStatus,
      circuitBroken: circuitBroken,
      upcoming: upcoming,
      recentFailures: recentFailures,
      checkedAt: now
    })
  }]
};
