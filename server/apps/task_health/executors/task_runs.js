var taskId = (params.taskId || "").trim();
var count = Math.min(Math.max(parseInt(params.count) || 20, 1), 100);

if (!taskId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_task_health_task_runs", taskId: "", runs: [], error: "taskId is required" }) }] };
}

var taskRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks");
var tasks = taskRes.ok && Array.isArray(taskRes.data) ? taskRes.data : [];
var task = tasks.find(function(t) { return t.taskId === taskId; });
var taskName = task ? task.name : taskId;

var runsRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks/" + encodeURIComponent(taskId) + "/runs?count=" + count);
var runs = runsRes.ok && Array.isArray(runsRes.data) ? runsRes.data : [];

runs.sort(function(a, b) { return (b.firedAt || 0) - (a.firedAt || 0); });

var successes = 0;
var failures = 0;
var timeouts = 0;
var durations = [];
for (var i = 0; i < runs.length; i++) {
  var r = runs[i];
  if (r.status === "success") successes++;
  else if (r.status === "failed") failures++;
  else if (r.status === "timeout") timeouts++;
  if (r.durationMs && r.durationMs > 0) durations.push(r.durationMs);
}

var avgDuration = durations.length > 0 ? Math.round(durations.reduce(function(s, d) { return s + d; }, 0) / durations.length) : 0;
var maxDuration = durations.length > 0 ? Math.max.apply(null, durations) : 0;
var minDuration = durations.length > 0 ? Math.min.apply(null, durations) : 0;
var successRate = runs.length > 0 ? Math.round((successes / runs.length) * 100) : 0;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_task_health_task_runs",
      taskId: taskId,
      taskName: taskName,
      taskEnabled: task ? task.enabled : null,
      taskCron: task ? (task.cron || null) : null,
      consecutiveFailures: task ? (task.consecutiveFailures || 0) : 0,
      runs: runs.slice(0, count),
      stats: {
        total: runs.length,
        successes: successes,
        failures: failures,
        timeouts: timeouts,
        successRate: successRate,
        avgDurationMs: avgDuration,
        maxDurationMs: maxDuration,
        minDurationMs: minDuration
      }
    })
  }]
};
