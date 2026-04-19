var count = Math.min(Math.max(parseInt(params.count) || 50, 1), 200);
var severity = (params.severity || "all").trim().toLowerCase();
var url = "http://localhost:3001/api/error-log?count=" + count;
if (severity !== "all") url += "&severity=" + severity;

var res = await ctx.fetch(url);
var entries = res.ok && Array.isArray(res.data) ? res.data : [];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_errors",
      count: count,
      severity: severity,
      total: entries.length,
      entries: entries
    })
  }]
};
