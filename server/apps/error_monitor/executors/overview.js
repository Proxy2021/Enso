var hours = Math.min(Math.max(parseInt(params.hours) || 24, 1), 168);

var summaryRes = await ctx.fetch("http://localhost:3001/api/error-summary?hours=" + hours);
var fixesRes = await ctx.fetch("http://localhost:3001/api/action-log?count=500&type=fix");

var summary = summaryRes.ok ? summaryRes.data : { total: 0, bySeverity: {}, byCategory: [], recentErrors: [], period: { from: Date.now() - hours * 3600000, to: Date.now() } };
var fixEntries = fixesRes.ok && Array.isArray(fixesRes.data) ? fixesRes.data : [];
var unacknowledged = fixEntries.filter(function(f) { return !f.acknowledged; }).length;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_overview",
      hours: hours,
      summary: summary,
      fixes: { total: fixEntries.length, unacknowledged: unacknowledged },
      generatedAt: Date.now()
    })
  }]
};
