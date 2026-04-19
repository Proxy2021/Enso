var count = Math.min(Math.max(parseInt(params.count) || 50, 1), 200);
var typeFilter = (params.type || "all").trim().toLowerCase();
var url = "http://localhost:3001/api/action-log?count=" + count;
if (typeFilter !== "all") url += "&type=" + typeFilter;

var res = await ctx.fetch(url);
var entries = res.ok && Array.isArray(res.data) ? res.data : [];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_error_monitor_activity",
      count: count,
      type: typeFilter,
      total: entries.length,
      entries: entries
    })
  }]
};
