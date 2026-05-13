var filter = (params.filter || "all").toLowerCase();

var res = await ctx.fetch("http://localhost:3001/api/scheduled-tasks");
var tasks = res.ok && Array.isArray(res.data) ? res.data : [];

if (filter === "enabled") tasks = tasks.filter(function(t) { return t.enabled; });
else if (filter === "disabled") tasks = tasks.filter(function(t) { return !t.enabled; });
else if (filter === "failing") tasks = tasks.filter(function(t) { return t.lastRunStatus === "failed" || (t.consecutiveFailures || 0) > 0; });
else if (filter === "circuit-broken") tasks = tasks.filter(function(t) { return !t.enabled && (t.consecutiveFailures || 0) >= 3; });

var cronDescriptions = {
  "0 6 * * *": "Every day at 6:00 AM",
  "0 9 * * *": "Every day at 9:00 AM",
  "0 */6 * * *": "Every 6 hours",
  "0 0 * * *": "Every day at midnight",
  "*/30 * * * *": "Every 30 minutes",
  "0 * * * *": "Every hour"
};

var mapped = tasks.map(function(t) {
  var cronHuman = t.cron ? (cronDescriptions[t.cron] || t.cron) : (t.fireAt ? "One-shot: " + new Date(t.fireAt).toLocaleString() : "No schedule");
  return {
    taskId: t.taskId,
    name: t.name,
    description: t.description || "",
    cron: t.cron || null,
    cronHuman: cronHuman,
    enabled: t.enabled,
    lastRunStatus: t.lastRunStatus || "never_run",
    consecutiveFailures: t.consecutiveFailures || 0,
    lastFiredAt: t.lastFiredAt || null,
    nextFireAt: t.nextFireAt || null,
    actionType: t.action ? t.action.type : "unknown",
    recurring: t.recurring || false,
    createdAt: t.createdAt || 0
  };
}).sort(function(a, b) {
  if (a.consecutiveFailures !== b.consecutiveFailures) return b.consecutiveFailures - a.consecutiveFailures;
  return (a.name || "").localeCompare(b.name || "");
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_task_health_task_list",
      filter: filter,
      tasks: mapped,
      total: mapped.length
    })
  }]
};
