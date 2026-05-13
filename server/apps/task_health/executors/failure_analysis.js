var days = Math.min(Math.max(parseInt(params.days) || 7, 1), 30);
var cutoff = Date.now() - days * 86400000;

var taskRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks");
var tasks = taskRes.ok && Array.isArray(taskRes.data) ? taskRes.data : [];

var allRuns = [];
for (var i = 0; i < tasks.length; i++) {
  var t = tasks[i];
  var runsRes = await ctx.fetch("http://localhost:3001/api/scheduled-tasks/" + encodeURIComponent(t.taskId) + "/runs?count=100");
  var runs = runsRes.ok && Array.isArray(runsRes.data) ? runsRes.data : [];
  for (var j = 0; j < runs.length; j++) {
    var r = runs[j];
    if (r.firedAt >= cutoff) {
      r._taskName = t.name;
      r._taskId = t.taskId;
      allRuns.push(r);
    }
  }
}

var failedRuns = allRuns.filter(function(r) { return r.status === "failed" || r.status === "timeout"; });

var catMap = {};
for (var k = 0; k < failedRuns.length; k++) {
  var cat = failedRuns[k].errorCategory || "unknown";
  catMap[cat] = (catMap[cat] || 0) + 1;
}
var byCategory = Object.keys(catMap).map(function(c) { return { category: c, count: catMap[c] }; })
  .sort(function(a, b) { return b.count - a.count; });

var sevMap = { critical: 0, error: 0, warning: 0 };
for (var m = 0; m < failedRuns.length; m++) {
  var sev = failedRuns[m].severity || "error";
  if (sevMap[sev] !== undefined) sevMap[sev]++;
}

var taskFailMap = {};
for (var n = 0; n < failedRuns.length; n++) {
  var f = failedRuns[n];
  var tid = f._taskId || f.taskId;
  if (!taskFailMap[tid]) taskFailMap[tid] = { taskId: tid, name: f._taskName || tid, failures: 0, lastError: "" };
  taskFailMap[tid].failures++;
  if (f.error) taskFailMap[tid].lastError = f.error;
}
var worstTasks = Object.values(taskFailMap).sort(function(a, b) { return b.failures - a.failures; }).slice(0, 10);

var dayMap = {};
for (var d = 0; d < days; d++) {
  var dayDate = new Date(cutoff + d * 86400000);
  var dateKey = dayDate.toISOString().slice(0, 10);
  dayMap[dateKey] = { date: dateKey, failures: 0, successes: 0 };
}
for (var p = 0; p < allRuns.length; p++) {
  var dk = new Date(allRuns[p].firedAt).toISOString().slice(0, 10);
  if (dayMap[dk]) {
    if (allRuns[p].status === "success") dayMap[dk].successes++;
    else dayMap[dk].failures++;
  }
}
var dailyTrend = Object.values(dayMap).sort(function(a, b) { return a.date < b.date ? -1 : 1; });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_task_health_failure_analysis",
      days: days,
      totalFailures: failedRuns.length,
      totalRuns: allRuns.length,
      failureRate: allRuns.length > 0 ? Math.round((failedRuns.length / allRuns.length) * 100) : 0,
      byCategory: byCategory,
      bySeverity: sevMap,
      worstTasks: worstTasks,
      dailyTrend: dailyTrend
    })
  }]
};
