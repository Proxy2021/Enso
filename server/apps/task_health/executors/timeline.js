var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);
var cutoff = Date.now() - hours * 3600000;

var taskRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks");
var tasks = taskRes.ok && Array.isArray(taskRes.data) ? taskRes.data : [];

var taskNameMap = {};
for (var i = 0; i < tasks.length; i++) {
  taskNameMap[tasks[i].taskId] = tasks[i].name;
}

var allExecs = [];
for (var j = 0; j < tasks.length; j++) {
  var t = tasks[j];
  var runsRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks/" + encodeURIComponent(t.taskId) + "/runs?count=50");
  var runs = runsRes.ok && Array.isArray(runsRes.data) ? runsRes.data : [];
  for (var k = 0; k < runs.length; k++) {
    var r = runs[k];
    if (r.firedAt >= cutoff) {
      allExecs.push({
        taskId: r.taskId,
        taskName: taskNameMap[r.taskId] || r.taskName || r.taskId,
        runId: r.runId,
        firedAt: r.firedAt,
        completedAt: r.completedAt || null,
        status: r.status,
        durationMs: r.durationMs || 0,
        error: r.error || null,
        errorCategory: r.errorCategory || null,
        severity: r.severity || null,
        resultSummary: r.resultSummary || null
      });
    }
  }
}

allExecs.sort(function(a, b) { return b.firedAt - a.firedAt; });

var successes = 0;
var failures = 0;
var timeouts = 0;
for (var m = 0; m < allExecs.length; m++) {
  if (allExecs[m].status === "success") successes++;
  else if (allExecs[m].status === "failed") failures++;
  else if (allExecs[m].status === "timeout") timeouts++;
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_task_health_timeline",
      hours: hours,
      executions: allExecs,
      summary: { total: allExecs.length, successes: successes, failures: failures, timeouts: timeouts }
    })
  }]
};
